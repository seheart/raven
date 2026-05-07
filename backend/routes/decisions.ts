/**
 * Decisions Routes — exposes the parsed DECISIONS.md audit trail and
 * the auto-derived list mined from git history.
 */

import express, { Request, Response, Router } from 'express';
import type { DecisionsService } from '../services/decisions-service.js';
import type { DerivedDecisionsService } from '../services/derived-decisions-service.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { cacheMiddleware } from '../services/cache-service.js';

export function createDecisionsRouter(
  service: DecisionsService,
  derivedService?: DerivedDecisionsService
): Router {
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

  /**
   * GET /api/decisions/derived?limit=N
   * Returns architectural-decision-shaped commits mined from git log.
   * Empty array when the derived service isn't available (no repo).
   */
  router.get(
    '/derived',
    cacheMiddleware(60_000),
    asyncHandler(async (req: Request, res: Response) => {
      if (!derivedService) {
        res.json([]);
        return;
      }
      const limit = Math.min(parseInt(req.query.limit as string, 10) || 30, 100);
      const list = await derivedService.list(limit);
      res.json(list);
    })
  );

  return router;
}
