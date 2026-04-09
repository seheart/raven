/**
 * Sub-Agent Routes
 * Agent tree visualization and sub-agent tracking
 */

import express, { Request, Response, Router } from 'express';
import type { RavenDB } from '../db.js';
import { asyncHandler } from '../middleware/async-handler.js';

export function createSubagentsRouter(db: RavenDB): Router {
  const router = express.Router();

  /**
   * GET /api/subagents/tree/:sessionId
   * Get the full agent tree for a session
   */
  router.get(
    '/tree/:sessionId',
    asyncHandler(async (req: Request, res: Response) => {
      const { sessionId } = req.params;
      const agents = db.db
        .prepare(
          `SELECT * FROM subagent_tree WHERE session_id = ? ORDER BY started_at ASC`
        )
        .all(sessionId);

      // Also get token usage grouped by agent_id for this session
      const tokensByAgent = db.db
        .prepare(
          `SELECT agent_id,
            COALESCE(SUM(input_tokens), 0) as input_tokens,
            COALESCE(SUM(output_tokens), 0) as output_tokens,
            COALESCE(SUM(estimated_cost_usd), 0) as cost_usd
          FROM token_usage
          WHERE session_id = ? AND agent_id IS NOT NULL
          GROUP BY agent_id`
        )
        .all(sessionId) as any[];

      const tokenMap = new Map(tokensByAgent.map(t => [t.agent_id, t]));

      // Build tree structure
      const enriched = (agents as any[]).map(a => ({
        ...a,
        tokens: tokenMap.get(a.agent_id) || {
          input_tokens: 0,
          output_tokens: 0,
          cost_usd: 0
        }
      }));

      res.json(enriched);
    })
  );

  /**
   * GET /api/subagents/recent
   * Get recent sub-agent activity across all sessions
   */
  router.get(
    '/recent',
    asyncHandler(async (req: Request, res: Response) => {
      const limit = Number(req.query.limit) || 50;
      const rows = db.db
        .prepare(
          `SELECT * FROM subagent_tree ORDER BY started_at DESC LIMIT ?`
        )
        .all(limit);
      res.json(rows);
    })
  );

  /**
   * GET /api/subagents/sessions
   * Get sessions that have sub-agents, with counts
   */
  router.get(
    '/sessions',
    asyncHandler(async (req: Request, res: Response) => {
      const rows = db.db
        .prepare(
          `SELECT
            session_id,
            project_name,
            COUNT(*) as agent_count,
            MIN(started_at) as first_spawn,
            MAX(started_at) as last_spawn
          FROM subagent_tree
          GROUP BY session_id
          ORDER BY last_spawn DESC
          LIMIT 50`
        )
        .all();
      res.json(rows);
    })
  );

  /**
   * GET /api/subagents/stats
   * Aggregate sub-agent statistics
   */
  router.get(
    '/stats',
    asyncHandler(async (req: Request, res: Response) => {
      const total = db.db
        .prepare(`SELECT COUNT(*) as count FROM subagent_tree`)
        .get() as any;
      const byType = db.db
        .prepare(
          `SELECT agent_type, COUNT(*) as count FROM subagent_tree GROUP BY agent_type ORDER BY count DESC`
        )
        .all();
      const byModel = db.db
        .prepare(
          `SELECT model, COUNT(*) as count FROM subagent_tree WHERE model IS NOT NULL GROUP BY model ORDER BY count DESC`
        )
        .all();

      res.json({
        total: total.count,
        by_type: byType,
        by_model: byModel
      });
    })
  );

  return router;
}
