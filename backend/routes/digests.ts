/**
 * Digest Routes — weekly recap.
 */

import express, { Request, Response, Router } from 'express';
import type { DigestService } from '../services/digest-service.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { cacheMiddleware } from '../services/cache-service.js';

export function createDigestsRouter(digestService: DigestService): Router {
  const router = express.Router();

  /**
   * GET /api/digests/weekly?at=ISO
   * Returns the digest for the week containing `at` (defaults to now).
   * Cached on the insights table; recomputed on a 1h cache miss.
   */
  router.get(
    '/weekly',
    cacheMiddleware(15000),
    asyncHandler(async (req: Request, res: Response) => {
      const at = typeof req.query.at === 'string' ? new Date(req.query.at) : new Date();
      if (Number.isNaN(at.getTime())) {
        res.status(400).json({ error: 'invalid `at` timestamp' });
        return;
      }
      const digest = digestService.getOrCompute(at);
      res.json(digest);
    })
  );

  /**
   * POST /api/digests/weekly/recompute
   * Force recompute (skips cache) — used after rules change or when
   * the user explicitly asks to refresh.
   */
  router.post(
    '/weekly/recompute',
    asyncHandler(async (req: Request, res: Response) => {
      const at = typeof req.body?.at === 'string' ? new Date(req.body.at) : new Date();
      if (Number.isNaN(at.getTime())) {
        res.status(400).json({ error: 'invalid `at` timestamp' });
        return;
      }
      res.json(digestService.recompute(at));
    })
  );

  /**
   * GET /api/digests/daily?at=ISO
   * Returns the daily digest for the calendar day containing `at`.
   * Short TTL while the day is live; settled days cache hard.
   */
  router.get(
    '/daily',
    cacheMiddleware(15000),
    asyncHandler(async (req: Request, res: Response) => {
      const at = typeof req.query.at === 'string' ? new Date(req.query.at) : new Date();
      if (Number.isNaN(at.getTime())) {
        res.status(400).json({ error: 'invalid `at` timestamp' });
        return;
      }
      res.json(digestService.getDailyOrCompute(at));
    })
  );

  /**
   * POST /api/digests/daily/recompute
   * Force recompute the daily digest (skips cache).
   */
  router.post(
    '/daily/recompute',
    asyncHandler(async (req: Request, res: Response) => {
      const at = typeof req.body?.at === 'string' ? new Date(req.body.at) : new Date();
      if (Number.isNaN(at.getTime())) {
        res.status(400).json({ error: 'invalid `at` timestamp' });
        return;
      }
      res.json(digestService.recomputeDaily(at));
    })
  );

  /**
   * GET /api/digests/list?limit=N
   * Recent digests, newest first.
   */
  router.get(
    '/list',
    cacheMiddleware(30000),
    asyncHandler(async (req: Request, res: Response) => {
      const limit = Math.min(parseInt(req.query.limit as string, 10) || 10, 52);
      res.json(digestService.recent(limit));
    })
  );

  return router;
}
