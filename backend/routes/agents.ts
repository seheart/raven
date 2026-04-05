/**
 * Agents Routes
 * Handles agent monitoring, events, and statistics
 */

import express, { Request, Response, Router } from 'express';
import type { RavenDB } from '../db.js';
import { cacheMiddleware } from '../services/cache-service.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { parseLimit, parseDateRange, buildTimeFilterQuery } from '../utils/request-helpers.js';

export function createAgentsRouter(db: RavenDB, agentRegistry: Map<string, any>): Router {
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

      // Check for recent activity in agent_events (more reliable than last_seen)
      const recentActivity = db.db
        .prepare(
          `
        SELECT MAX(timestamp) as latest FROM agent_events
        WHERE timestamp >= datetime('now', '-5 minutes')
      `
        )
        .get() as any;
      const hasRecentActivity = !!recentActivity?.latest;

      const agents = Array.from(agentRegistry.values()).map(agent => {
        const lastSeen = new Date(agent.last_seen);
        const secondsSinceLastSeen = (now.getTime() - lastSeen.getTime()) / 1000;
        const isRunning = hasRecentActivity || secondsSinceLastSeen < 300;
        return {
          ...agent,
          is_running: isRunning,
          last_seen:
            hasRecentActivity && recentActivity.latest > agent.last_seen
              ? recentActivity.latest
              : agent.last_seen,
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
      const events = db.getEventsByAgent(agent, limit);
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
      const agentEvents = db.getAgentStats();

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

      const toolBreakdown = db.db
        .prepare(
          `
        SELECT message, COUNT(*) as count FROM agent_events
        WHERE event_type = 'tool_call'
        GROUP BY message ORDER BY count DESC LIMIT 10
      `
        )
        .all();

      const enriched = agentEvents.map((agent: any) => ({
        ...agent,
        agent_name: agent.agent_name || agent.agent,
        total_file_changes: fileStats?.total_file_changes || 0,
        unique_files: fileStats?.unique_files || 0,
        edit_count: fileStats?.edit_count || 0,
        create_count: fileStats?.create_count || 0,
        delete_count: fileStats?.delete_count || 0,
        first_seen: fileStats?.first_seen || null,
        last_active: fileStats?.last_active || null,
        tool_breakdown: toolBreakdown || []
      }));

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

      // Get event type distribution for each agent
      const profiles = agents.map((agent: any) => {
        const eventTypes = db.db
          .prepare(
            `SELECT event_type, COUNT(*) as count
            FROM agent_events
            WHERE agent = ?
            GROUP BY event_type`
          )
          .all(agent.agent) as any[];

        return {
          agent: agent.agent,
          event_count: agent.event_count,
          first_seen: agent.first_seen,
          last_seen: agent.last_seen,
          unique_files: agent.unique_files,
          event_distribution: eventTypes,
          activity_score: Math.min(100, Math.round((agent.event_count / 100) * 100))
        };
      });

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
