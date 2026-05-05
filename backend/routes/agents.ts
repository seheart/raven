/**
 * Agents Routes
 * Handles agent monitoring, events, and statistics
 */

import express, { Request, Response, Router } from 'express';
import type { RavenDB } from '../db.js';
import type { AgentEventsRepository } from '../repositories/agent-events-repository.js';
import { cacheMiddleware } from '../services/cache-service.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { parseLimit, parseDateRange, buildTimeFilterQuery } from '../utils/request-helpers.js';

export function createAgentsRouter(
  db: RavenDB,
  agentRegistry: Map<string, any>,
  agentEventsRepo: AgentEventsRepository
): Router {
  const router = express.Router();

  /**
   * GET /api/agents-status
   * Get current status of all registered agents
   */
  router.get(
    '/agents-status',
    cacheMiddleware(2000),
    asyncHandler(async (req: Request, res: Response) => {
      const now = new Date();

      const agents = Array.from(agentRegistry.values()).map(agent => {
        const lastSeen = new Date(agent.last_seen);
        const secondsSinceLastSeen = (now.getTime() - lastSeen.getTime()) / 1000;
        return {
          ...agent,
          is_running: secondsSinceLastSeen < 300,
          confidence: agent.requests_handled > 100 ? 0.95 : agent.requests_handled > 10 ? 0.7 : 0.3
        };
      });
      res.json(agents);
    })
  );

  /**
   * GET /api/agent-events
   * Get agent events with optional time filtering
   */
  router.get(
    '/agent-events',
    asyncHandler(async (req: Request, res: Response) => {
      const limit = parseLimit(req);
      const { startTime, endTime } = parseDateRange(req);

      const { query, params } = buildTimeFilterQuery(
        `SELECT id, timestamp, agent, event_type, file, lines_changed, duration_ms, message, metadata
         FROM agent_events`,
        {
          startTime,
          endTime,
          orderBy: 'timestamp DESC',
          limit
        }
      );

      const events = db.db.prepare(query).all(...params);
      res.json(events);
    })
  );

  /**
   * GET /api/events-by-agent/:agent
   * Get events for a specific agent
   */
  router.get(
    '/events-by-agent/:agent',
    asyncHandler(async (req: Request, res: Response) => {
      const { agent } = req.params;
      const limit = parseLimit(req);
      const events = agentEventsRepo.byAgent(agent, limit);
      res.json(events);
    })
  );

  /**
   * GET /api/agent-stats
   * Get aggregated statistics for all agents
   */
  router.get(
    '/agent-stats',
    cacheMiddleware(3000),
    asyncHandler(async (req: Request, res: Response) => {
      const agentEvents = agentEventsRepo.totals();

      // Use a 30-day window to avoid full table scan on large datasets
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const fileStats = db.db
        .prepare(
          `
        SELECT
          COUNT(*) as total_file_changes,
          COUNT(DISTINCT filepath) as unique_files,
          SUM(CASE WHEN change_type IN ('change', 'modified') THEN 1 ELSE 0 END) as edit_count,
          SUM(CASE WHEN change_type = 'add' THEN 1 ELSE 0 END) as create_count,
          SUM(CASE WHEN change_type = 'unlink' THEN 1 ELSE 0 END) as delete_count,
          MIN(timestamp) as first_seen,
          MAX(timestamp) as last_active
        FROM events
        WHERE timestamp > ?
      `
        )
        .get(cutoff) as any;

      // Per-agent tool breakdown. Earlier this was a single global GROUP BY,
      // so every agent in the response showed the same top-10 list — every
      // page reading agent_stats was rendering identical (and wrong) tool
      // breakdowns. Now group by (agent, message) and assemble per agent.
      const toolBreakdownRows = db.db
        .prepare(
          `SELECT agent, message, COUNT(*) as count
           FROM agent_events
           WHERE event_type = 'tool_call' AND agent IS NOT NULL
           GROUP BY agent, message
           ORDER BY agent, count DESC`
        )
        .all() as Array<{ agent: string; message: string; count: number }>;

      const toolBreakdownByAgent = new Map<string, Array<{ message: string; count: number }>>();
      for (const row of toolBreakdownRows) {
        let list = toolBreakdownByAgent.get(row.agent);
        if (!list) {
          list = [];
          toolBreakdownByAgent.set(row.agent, list);
        }
        if (list.length < 10) list.push({ message: row.message, count: row.count });
      }

      // The events table has no agent attribution, so we can't split fileStats
      // per-agent. Attach the global figures only to a synthetic "_aggregate"
      // entry; do NOT spread them into every agent (was misleading every row
      // with identical counts).
      const enriched: any[] = agentEvents.map((agent: any) => {
        const name = agent.agent_name || agent.agent;
        return {
          ...agent,
          agent_name: name,
          tool_breakdown: toolBreakdownByAgent.get(name) || []
        };
      });

      // Merge in detected agents from registry that have no events yet (e.g., local models)
      const existingNames = new Set(enriched.map((a: any) => a.agent_name || a.agent));
      for (const [, agent] of agentRegistry) {
        if (!existingNames.has(agent.agent_name)) {
          enriched.push({
            agent: agent.agent_name,
            agent_name: agent.agent_name,
            agent_type: agent.agent_type,
            is_running: agent.is_running,
            color: agent.color,
            models_available: agent.models_available || [],
            total_events: 0,
            event_count: 0,
            last_active: agent.last_seen,
            tool_breakdown: []
          });
        }
      }

      // Sentinel row consumers can ignore. Carries globals so existing dashboards
      // that read fileStats fields don't break.
      enriched.push({
        agent: '_aggregate',
        agent_name: '_aggregate',
        is_aggregate: true,
        total_file_changes: fileStats?.total_file_changes || 0,
        unique_files: fileStats?.unique_files || 0,
        edit_count: fileStats?.edit_count || 0,
        create_count: fileStats?.create_count || 0,
        delete_count: fileStats?.delete_count || 0,
        first_seen: fileStats?.first_seen || null,
        last_active: fileStats?.last_active || null
      });

      res.json(enriched);
    })
  );

  /**
   * GET /api/agent-profiles
   * Get detailed profiles for all agents including event distribution
   */
  router.get(
    '/agent-profiles',
    cacheMiddleware(5000),
    asyncHandler(async (req: Request, res: Response) => {
      // Get all agent events grouped by agent
      const agents = db.db
        .prepare(
          `SELECT
            agent,
            COUNT(*) as event_count,
            MIN(timestamp) as first_seen,
            MAX(timestamp) as last_seen,
            COUNT(DISTINCT file) as unique_files
          FROM agent_events
          GROUP BY agent
          ORDER BY event_count DESC`
        )
        .all() as any[];

      // Get event type distribution for all agents in a single query
      const allEventTypes = db.db
        .prepare(
          `SELECT agent, event_type, COUNT(*) as count
          FROM agent_events
          GROUP BY agent, event_type
          ORDER BY agent, count DESC`
        )
        .all() as any[];

      // Group by agent name
      const eventTypesByAgent = new Map<string, any[]>();
      for (const row of allEventTypes) {
        if (!eventTypesByAgent.has(row.agent)) {
          eventTypesByAgent.set(row.agent, []);
        }
        eventTypesByAgent.get(row.agent)!.push({ event_type: row.event_type, count: row.count });
      }

      const profiles = agents.map((agent: any) => ({
        agent: agent.agent,
        event_count: agent.event_count,
        first_seen: agent.first_seen,
        last_seen: agent.last_seen,
        unique_files: agent.unique_files,
        event_distribution: eventTypesByAgent.get(agent.agent) || [],
        activity_score: Math.min(100, Math.round((agent.event_count / 100) * 100))
      }));

      res.json({ profiles });
    })
  );

  /**
   * GET /api/agents/summary
   * Get summary statistics for agents
   */
  router.get(
    '/agents/summary',
    asyncHandler(async (req: Request, res: Response) => {
      // Stub implementation - can be enhanced with real data
      res.json({
        total_agents: agentRegistry.size,
        active_agents: Array.from(agentRegistry.values()).filter(
          a => Date.now() - new Date(a.last_seen).getTime() < 30000
        ).length,
        events_24h: 0,
        top_agents: []
      });
    })
  );

  return router;
}
