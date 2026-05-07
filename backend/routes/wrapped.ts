/**
 * Wrapped Routes — year-in-review payload.
 */

import express, { Request, Response, Router } from 'express';
import type { WrappedService } from '../services/wrapped-service.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { cacheMiddleware } from '../services/cache-service.js';

export function createWrappedRouter(service: WrappedService): Router {
  const router = express.Router();

  /**
   * GET /api/wrapped?days=N
   * Returns the full Wrapped payload — cards + supporting stats.
   * Default window 365 days; capped at 3 years.
   */
  router.get(
    '/',
    cacheMiddleware(120_000),
    asyncHandler(async (req: Request, res: Response) => {
      const days = Math.min(Math.max(parseInt(req.query.days as string, 10) || 365, 7), 365 * 3);
      res.json(service.build({ windowDays: days }));
    })
  );

  return router;
}
