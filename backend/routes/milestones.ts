/**
 * Milestones Routes — life-cycle moments worth surfacing.
 */

import express, { Request, Response, Router } from 'express';
import type { MilestonesService } from '../services/milestones-service.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { cacheMiddleware } from '../services/cache-service.js';

export function createMilestonesRouter(service: MilestonesService): Router {
  const router = express.Router();

  /**
   * GET /api/milestones
   * Returns every milestone the user has hit — ordered by reached_at DESC.
   * The frontend filters out ones already dismissed in localStorage.
   */
  router.get(
    '/',
    cacheMiddleware(60_000),
    asyncHandler(async (_req: Request, res: Response) => {
      res.json(service.list());
    })
  );

  return router;
}
