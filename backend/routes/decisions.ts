/**
 * Decisions Routes — exposes the parsed DECISIONS.md audit trail.
 */

import express, { Request, Response, Router } from 'express';
import type { DecisionsService } from '../services/decisions-service.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { cacheMiddleware } from '../services/cache-service.js';

export function createDecisionsRouter(service: DecisionsService): Router {
  const router = express.Router();

  /**
   * GET /api/decisions
   * Returns { resolved, open, source, mtime }. Cached on file mtime
   * so repeated calls are O(stat).
   */
  router.get(
    '/',
    cacheMiddleware(5000),
    asyncHandler(async (_req: Request, res: Response) => {
      res.json(service.read());
    })
  );

  /**
   * POST /api/decisions/refresh
   * Force a re-parse — useful if the file was edited and caching
   * lagged behind. Idempotent.
   */
  router.post(
    '/refresh',
    asyncHandler(async (_req: Request, res: Response) => {
      res.json(service.refresh());
    })
  );

  return router;
}
