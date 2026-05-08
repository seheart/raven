/**
 * Today Narrative Routes
 *
 * Aggregates event data into structured "narrative beats" for the Today
 * landing page — today's center of gravity, the week's leader, longest
 * session, and projects the user is "returning to" after a gap. The
 * frontend translates these facts into second-person sentences.
 */

import express, { Request, Response, Router } from 'express';
import type {
  TodayNarrativeRepository,
  TodayProjectSlice,
  WeekProjectSlice
} from '../repositories/today-narrative-repository.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { cacheMiddleware } from '../services/cache-service.js';

interface ReturningProject {
  project: string;
  days_since_last_event: number;
}

interface NarrativeResponse {
  today: {
    events: number;
    files: number;
    projects: TodayProjectSlice[];
    top_project: string | null;
    longest_session_seconds: number;
  };
  week: {
    events: number;
    files: number;
    projects: WeekProjectSlice[];
    top_project: string | null;
    days_active: number;
  };
  returning: ReturningProject[];
}

export function createTodayNarrativeRouter(todayNarrativeRepo: TodayNarrativeRepository): Router {
  const router = express.Router();

  router.get(
    '/narrative',
    cacheMiddleware(15000),
    asyncHandler(async (_req: Request, res: Response) => {
      // Local-midnight today and 7 days ago. SQL compares against ISO-8601
      // strings stored in events.timestamp (UTC). We do the offset in JS so
      // the API caller's timezone determines the day boundary.
      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const weekStart = new Date(todayStart);
      weekStart.setDate(weekStart.getDate() - 6);

      const todayIso = todayStart.toISOString();
      const weekIso = weekStart.toISOString();

      const todayProjects = todayNarrativeRepo.projectsSince(todayIso);
      const todayTotals = todayNarrativeRepo.totalsSince(todayIso);
      const weekProjects = todayNarrativeRepo.projectsWithDaysActiveSince(weekIso);
      const weekTotals = todayNarrativeRepo.totalsWithDaysActiveSince(weekIso);
      const longestSeconds = todayNarrativeRepo.longestSessionSecondsSince(todayIso);
      const returningRows = todayNarrativeRepo.returningSince(todayIso);

      // Calendar-day diff (not ms-diff) so "4 days ago at 10am" reads as
      // "4 days" not "3" — matches how users speak about elapsed time.
      const todayMs = todayStart.getTime();
      const returning: ReturningProject[] = returningRows
        .filter(r => r.last_before)
        .map(r => {
          const lastMidnight = new Date(r.last_before as string);
          lastMidnight.setHours(0, 0, 0, 0);
          const days = Math.round((todayMs - lastMidnight.getTime()) / (24 * 60 * 60 * 1000));
          return { project: r.project, days_since_last_event: days };
        })
        // Only flag projects whose previous edit was >= 2 days ago.
        .filter(r => r.days_since_last_event >= 2)
        .sort((a, b) => b.days_since_last_event - a.days_since_last_event);

      const response: NarrativeResponse = {
        today: {
          events: todayTotals.events,
          files: todayTotals.files,
          projects: todayProjects,
          top_project: todayProjects[0]?.project ?? null,
          longest_session_seconds: longestSeconds
        },
        week: {
          events: weekTotals.events,
          files: weekTotals.files,
          projects: weekProjects,
          top_project: weekProjects[0]?.project ?? null,
          days_active: weekTotals.days_active
        },
        returning
      };

      res.json(response);
    })
  );

  return router;
}
