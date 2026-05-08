/**
 * Sub-Agent Routes
 * Agent tree visualization and sub-agent tracking
 */

import express, { Request, Response, Router } from 'express';
import type { SubagentsRepository } from '../repositories/subagents-repository.js';
import type { TokenUsageRepository } from '../repositories/token-usage-repository.js';
import { asyncHandler } from '../middleware/async-handler.js';

export function createSubagentsRouter(
  subagentsRepo: SubagentsRepository,
  tokenUsageRepo: TokenUsageRepository
): Router {
  const router = express.Router();

  /**
   * GET /api/subagents/tree/:sessionId
   * Get the full agent tree for a session
   */
  router.get(
    '/tree/:sessionId',
    asyncHandler(async (req: Request, res: Response) => {
      const { sessionId } = req.params;
      const agents = subagentsRepo.bySession(sessionId);
      const tokensByAgent = tokenUsageRepo.tokensByAgentForSession(sessionId);
      const tokenMap = new Map(tokensByAgent.map(t => [t.agent_id, t]));

      // Build tree structure
      const enriched = (agents as Array<{ agent_id?: string }>).map(a => ({
        ...a,
        tokens: (a.agent_id && tokenMap.get(a.agent_id)) || {
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
      res.json(subagentsRepo.recent(limit));
    })
  );

  /**
   * GET /api/subagents/sessions
   * Get sessions that have sub-agents, with counts
   */
  router.get(
    '/sessions',
    asyncHandler(async (_req: Request, res: Response) => {
      res.json(subagentsRepo.sessionRollup());
    })
  );

  /**
   * GET /api/subagents/stats
   * Aggregate sub-agent statistics
   */
  router.get(
    '/stats',
    asyncHandler(async (_req: Request, res: Response) => {
      res.json(subagentsRepo.stats());
    })
  );

  return router;
}
