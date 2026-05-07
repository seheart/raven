/**
 * Today Narrative Routes
 *
 * Aggregates event data into structured "narrative beats" for the Today
 * landing page — today's center of gravity, the week's leader, longest
 * session, and projects the user is "returning to" after a gap. The
 * frontend translates these facts into second-person sentences.
 */

import express, { Request, Response, Router } from 'express';
import type { RavenDB } from '../db.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { cacheMiddleware } from '../services/cache-service.js';

interface ProjectSlice {
  project: string;
  events: number;
  files: number;
}

interface WeekProjectSlice extends ProjectSlice {
  days_active: number;
}

interface ReturningProject {
  project: string;
  days_since_last_event: number;
}

interface NarrativeResponse {
  today: {
    events: number;
    files: number;
    projects: ProjectSlice[];
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

export function createTodayNarrativeRouter(db: RavenDB): Router {
  const router = express.Router();

  /**
   * GET /api/today/narrative
   * Returns aggregations for today + this-week, plus "returning to"
   * projects (first edit today after a >2-day gap).
   */
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
      weekStart.setDate(weekStart.getDate() - 6); // last 7 days inclusive

      const todayIso = todayStart.toISOString();
      const weekIso = weekStart.toISOString();

      // ── Today: per-project breakdown + totals ───────────────────
      const todayProjects = db.db
        .prepare(
          `SELECT
             COALESCE(project_name, '(unattributed)') AS project,
             COUNT(*) AS events,
             COUNT(DISTINCT filepath) AS files
           FROM events
           WHERE timestamp >= ?
             AND project_name IS NOT NULL
             AND project_name != ''
           GROUP BY project_name
           ORDER BY events DESC`
        )
        .all(todayIso) as ProjectSlice[];

      const todayTotals = db.db
        .prepare(
          `SELECT
             COUNT(*) AS events,
             COUNT(DISTINCT filepath) AS files
           FROM events
           WHERE timestamp >= ?`
        )
        .get(todayIso) as { events: number; files: number } | undefined;

      // ── Week: per-project breakdown + days_active ───────────────
      const weekProjects = db.db
        .prepare(
          `SELECT
             COALESCE(project_name, '(unattributed)') AS project,
             COUNT(*) AS events,
             COUNT(DISTINCT filepath) AS files,
             COUNT(DISTINCT date(timestamp)) AS days_active
           FROM events
           WHERE timestamp >= ?
             AND project_name IS NOT NULL
             AND project_name != ''
           GROUP BY project_name
           ORDER BY events DESC`
        )
        .all(weekIso) as WeekProjectSlice[];

      const weekTotals = db.db
        .prepare(
          `SELECT
             COUNT(*) AS events,
             COUNT(DISTINCT filepath) AS files,
             COUNT(DISTINCT date(timestamp)) AS days_active
           FROM events
           WHERE timestamp >= ?`
        )
        .get(weekIso) as { events: number; files: number; days_active: number } | undefined;

      // ── Longest session today ───────────────────────────────────
      // Group events by session_id, take max span. Reasonable proxy for
      // "longest stretch of work today". Sessions span midnight rarely
      // enough that we cap to today's events for simplicity.
      const longestSession = db.db
        .prepare(
          `SELECT
             MAX(span_seconds) AS longest_seconds
           FROM (
             SELECT (julianday(MAX(timestamp)) - julianday(MIN(timestamp))) * 86400 AS span_seconds
             FROM events
             WHERE timestamp >= ? AND session_id IS NOT NULL
             GROUP BY session_id
             HAVING COUNT(*) > 1
           )`
        )
        .get(todayIso) as { longest_seconds: number | null } | undefined;

      // ── "Returning to" projects ─────────────────────────────────
      // Projects that have an event today AND whose previous event was
      // more than 2 days before today's start. The data answer-key:
      // for each project active today, find max(timestamp) before today.
      const returningRows = db.db
        .prepare(
          `SELECT
             today.project_name AS project,
             today.first_today AS first_today,
             prev.last_before AS last_before
           FROM (
             SELECT project_name, MIN(timestamp) AS first_today
             FROM events
             WHERE timestamp >= ? AND project_name IS NOT NULL AND project_name != ''
             GROUP BY project_name
           ) AS today
           LEFT JOIN (
             SELECT project_name, MAX(timestamp) AS last_before
             FROM events
             WHERE timestamp < ? AND project_name IS NOT NULL AND project_name != ''
             GROUP BY project_name
           ) AS prev
           ON today.project_name = prev.project_name`
        )
        .all(todayIso, todayIso) as Array<{
          project: string;
          first_today: string;
          last_before: string | null;
        }>;

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
          events: todayTotals?.events ?? 0,
          files: todayTotals?.files ?? 0,
          projects: todayProjects,
          top_project: todayProjects[0]?.project ?? null,
          longest_session_seconds: Math.floor(longestSession?.longest_seconds ?? 0)
        },
        week: {
          events: weekTotals?.events ?? 0,
          files: weekTotals?.files ?? 0,
          projects: weekProjects,
          top_project: weekProjects[0]?.project ?? null,
          days_active: weekTotals?.days_active ?? 0
        },
        returning
      };

      res.json(response);
    })
  );

  return router;
}
