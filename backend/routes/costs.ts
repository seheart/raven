/**
 * Costs Routes
 * Token usage and cost tracking for Claude API sessions
 */

import express, { Request, Response, Router } from 'express';
import type { TokenUsageRepository } from '../repositories/token-usage-repository.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { cacheMiddleware } from '../services/cache-service.js';
import { getModelFamily } from '../services/token-cost-calculator.js';

function strFilter(req: Request): {
  start?: string;
  end?: string;
  project?: string;
} {
  const out: { start?: string; end?: string; project?: string } = {};
  const { start, end, project } = req.query;
  if (typeof start === 'string') out.start = start;
  if (typeof end === 'string') out.end = end;
  if (typeof project === 'string') out.project = project;
  return out;
}

export function createCostsRouter(tokenUsageRepo: TokenUsageRepository): Router {
  const router = express.Router();

  /**
   * GET /api/costs/summary
   * Total cost summary with optional time range
   */
  router.get(
    '/summary',
    cacheMiddleware(5000),
    asyncHandler(async (req: Request, res: Response) => {
      res.json(tokenUsageRepo.costSummary(strFilter(req)));
    })
  );

  /**
   * GET /api/costs/by-project
   * Cost breakdown by project
   */
  router.get(
    '/by-project',
    cacheMiddleware(5000),
    asyncHandler(async (req: Request, res: Response) => {
      const { start, end } = strFilter(req);
      res.json(tokenUsageRepo.costByProject({ start, end }));
    })
  );

  /**
   * GET /api/costs/by-model
   * Cost breakdown by model
   */
  router.get(
    '/by-model',
    cacheMiddleware(5000),
    asyncHandler(async (req: Request, res: Response) => {
      const { start, end } = strFilter(req);
      const rows = tokenUsageRepo.costByModel({ start, end });
      res.json(rows.map(r => ({ ...r, model_family: getModelFamily(r.model) })));
    })
  );

  /**
   * GET /api/costs/by-session
   * Cost breakdown by session
   */
  router.get(
    '/by-session',
    cacheMiddleware(5000),
    asyncHandler(async (req: Request, res: Response) => {
      const limit = Number(req.query.limit) || 50;
      res.json(tokenUsageRepo.costBySession(strFilter(req), limit));
    })
  );

  /**
   * GET /api/costs/timeline
   * Time series of cost data for charts
   */
  router.get(
    '/timeline',
    cacheMiddleware(10000),
    asyncHandler(async (req: Request, res: Response) => {
      const bucketRaw = String(req.query.bucket || 'day');
      const bucket: 'hour' | 'day' | 'week' =
        bucketRaw === 'hour' || bucketRaw === 'week' ? bucketRaw : 'day';
      res.json(tokenUsageRepo.costTimeline(strFilter(req), bucket));
    })
  );

  return router;
}
