/**
 * Agents Routes
 * Handles agent monitoring, events, and statistics
 */

import express, { Request, Response, Router } from 'express';
import type { AgentEventsRepository } from '../repositories/agent-events-repository.js';
import type { FileEventsRepository } from '../repositories/file-events-repository.js';
import { cacheMiddleware } from '../services/cache-service.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { parseLimit, parseDateRange } from '../utils/request-helpers.js';

export function createAgentsRouter(
  fileEventsRepo: FileEventsRepository,
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
      const events = agentEventsRepo.listInTimeRange(startTime, endTime, limit);
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
      const fileStats = fileEventsRepo.statsSince(cutoff);

      // Per-agent tool breakdown. Earlier this was a single global GROUP BY,
      // so every agent in the response showed the same top-10 list — every
      // page reading agent_stats was rendering identical (and wrong) tool
      // breakdowns. Now group by (agent, message) and assemble per agent.
      const toolBreakdownRows = agentEventsRepo.toolBreakdown();

      const toolBreakdownByAgent = new Map<string, Array<{ message: string; count: number }>>();
      // Per-agent create/edit counts derived from the same toolBreakdown rows.
      // The events table has no agent attribution so we couldn't use it; but
      // agent_events tool_call messages do carry the operation: "Write call"
      // = create, "Edit call" = edit. Earlier the page received null for
      // these per-row and rendered all-zero "Activity Breakdown" doughnuts
      // and made every agent show as "conservative · mixed". Fixed here.
      const opCountsByAgent = new Map<
        string,
        { create_count: number; edit_count: number; delete_count: number }
      >();
      for (const row of toolBreakdownRows) {
        let list = toolBreakdownByAgent.get(row.agent);
        if (!list) {
          list = [];
          toolBreakdownByAgent.set(row.agent, list);
        }
        if (list.length < 10) list.push({ message: row.message, count: row.count });

        let ops = opCountsByAgent.get(row.agent);
        if (!ops) {
          ops = { create_count: 0, edit_count: 0, delete_count: 0 };
          opCountsByAgent.set(row.agent, ops);
        }
        const msg = row.message || '';
        if (/^Write\b/i.test(msg)) ops.create_count += row.count;
        else if (/^Edit\b/i.test(msg)) ops.edit_count += row.count;
        // delete_count stays 0: Claude Code has no first-class "delete" tool.
        // Bash rm calls would land in toolBreakdown as "Bash call" which we
        // can't reliably attribute to deletion without parsing the message
        // body, so we stay honest about not knowing.
      }

      // Attach per-agent create/edit/delete counts directly. Earlier these
      // existed only on a synthetic _aggregate row that the frontend filtered
      // out, leaving every per-agent row with null values.
      const enriched: any[] = agentEvents.map((agent: any) => {
        const name = agent.agent_name || agent.agent;
        const ops = opCountsByAgent.get(name) || {
          create_count: 0,
          edit_count: 0,
          delete_count: 0
        };
        return {
          ...agent,
          agent_name: name,
          tool_breakdown: toolBreakdownByAgent.get(name) || [],
          create_count: ops.create_count,
          edit_count: ops.edit_count,
          delete_count: ops.delete_count
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
      const agents = agentEventsRepo.agentProfiles() as any[];

      // Get event type distribution for all agents in a single query
      const allEventTypes = agentEventsRepo.eventTypeDistribution() as any[];

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
