/**
 * Journey Routes
 *
 * Surfaces the user's growth arc — first week vs current week, with
 * deltas computed where they make sense. Powers the "you've come a
 * long way" panel.
 */

import express, { Request, Response, Router } from 'express';
import type { JourneyRepository, JourneyWindowStats } from '../repositories/journey-repository.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { cacheMiddleware } from '../services/cache-service.js';

interface BeforeAfterResponse {
  first_week: JourneyWindowStats | null;
  current_week: JourneyWindowStats;
  /** Days between first_week.start and current_week.start. */
  span_days: number;
  /** True when first_week and current_week overlap (user is in their first week). */
  too_early: boolean;
}

export function createJourneyRouter(journeyRepo: JourneyRepository): Router {
  const router = express.Router();

  /**
   * GET /api/journey/before-after
   *
   * Compares the user's first 7 days (since the earliest events
   * timestamp) to the most recent 7 days. Returns null for
   * `first_week` and `too_early=true` if Raven's been recording for
   * less than 14 days — there's no meaningful arc yet.
   */
  router.get(
    '/before-after',
    cacheMiddleware(60_000),
    asyncHandler(async (_req: Request, res: Response) => {
      const earliestIso = journeyRepo.earliestEventTimestamp();
      const earliest = earliestIso ? new Date(earliestIso) : null;

      const now = new Date();
      const currentEnd = now.toISOString();
      const currentStart = new Date(now.getTime() - 7 * 86_400_000).toISOString();
      const current = journeyRepo.windowStats(currentStart, currentEnd);

      if (!earliest) {
        const response: BeforeAfterResponse = {
          first_week: null,
          current_week: current,
          span_days: 0,
          too_early: true
        };
        res.json(response);
        return;
      }

      const firstStart = earliest.toISOString();
      const firstEnd = new Date(earliest.getTime() + 7 * 86_400_000).toISOString();
      // If the earliest event is < 14 days ago, the two windows overlap.
      const tooEarly = now.getTime() - earliest.getTime() < 14 * 86_400_000;
      const firstWeek = tooEarly ? null : journeyRepo.windowStats(firstStart, firstEnd);
      const spanDays = Math.floor((now.getTime() - earliest.getTime()) / 86_400_000);

      const response: BeforeAfterResponse = {
        first_week: firstWeek,
        current_week: current,
        span_days: spanDays,
        too_early: tooEarly
      };
      res.json(response);
    })
  );

  return router;
}
