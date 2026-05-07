/**
 * Baselines Routes — per-agent learned thresholds + anomaly flags.
 */

import express, { Request, Response, Router } from 'express';
import type { BaselinesService } from '../services/baselines-service.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { cacheMiddleware } from '../services/cache-service.js';

export function createBaselinesRouter(service: BaselinesService): Router {
  const router = express.Router();

  /**
   * GET /api/agents/baselines
   * 7-day rolling p50/p95 per model: latency, cost, output_tokens.
   */
  router.get(
    '/baselines',
    cacheMiddleware(15_000),
    asyncHandler(async (_req: Request, res: Response) => {
      res.json(service.list());
    })
  );

  /**
   * GET /api/agents/anomalies
   * Per-model 30m vs 7d ratios; entries flagged when ≥ 2× baseline.
   */
  router.get(
    '/anomalies',
    cacheMiddleware(10_000),
    asyncHandler(async (_req: Request, res: Response) => {
      res.json(service.anomalies());
    })
  );

  return router;
}
