/**
 * Journey Routes
 *
 * Surfaces the user's growth arc — first week vs current week, with
 * deltas computed where they make sense. Powers the "you've come a
 * long way" panel.
 */

import express, { Request, Response, Router } from 'express';
import type { RavenDB } from '../db.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { cacheMiddleware } from '../services/cache-service.js';

interface WindowStats {
  start: string;
  end: string;
  events: number;
  files: number;
  projects: number;
  days_active: number;
  cost_usd: number;
  requests: number;
  top_project: string | null;
  top_model: string | null;
  longest_session_seconds: number;
}

interface BeforeAfterResponse {
  first_week: WindowStats | null;
  current_week: WindowStats;
  /** Days between first_week.start and current_week.start. */
  span_days: number;
  /** True when first_week and current_week overlap (user is in their first week). */
  too_early: boolean;
}

function aggregate(
  db: RavenDB,
  startIso: string,
  endIso: string
): WindowStats {
  // Event-level aggregates.
  const tot = db.db
    .prepare(
      `SELECT
         COUNT(*) AS events,
         COUNT(DISTINCT filepath) AS files,
         COUNT(DISTINCT project_name) AS projects,
         COUNT(DISTINCT date(timestamp)) AS days_active
       FROM events
       WHERE timestamp >= ? AND timestamp <= ?`
    )
    .get(startIso, endIso) as
    | { events: number; files: number; projects: number; days_active: number }
    | undefined;

  const topProj = db.db
    .prepare(
      `SELECT project_name AS p, COUNT(*) AS c
       FROM events
       WHERE timestamp >= ? AND timestamp <= ?
         AND project_name IS NOT NULL AND project_name != ''
       GROUP BY project_name
       ORDER BY c DESC
       LIMIT 1`
    )
    .get(startIso, endIso) as { p: string; c: number } | undefined;

  // Cost / requests / top model from token_usage.
  const cost = db.db
    .prepare(
      `SELECT COALESCE(SUM(estimated_cost_usd), 0) AS cost_usd, COUNT(*) AS requests
       FROM token_usage WHERE timestamp >= ? AND timestamp <= ?`
    )
    .get(startIso, endIso) as { cost_usd: number; requests: number } | undefined;

  const topModel = db.db
    .prepare(
      `SELECT model AS m, COUNT(*) AS c
       FROM token_usage
       WHERE timestamp >= ? AND timestamp <= ? AND model IS NOT NULL AND model != ''
       GROUP BY model
       ORDER BY c DESC
       LIMIT 1`
    )
    .get(startIso, endIso) as { m: string; c: number } | undefined;

  // Longest session in window (seconds).
  const longest = db.db
    .prepare(
      `SELECT MAX(span) AS s FROM (
         SELECT (julianday(MAX(timestamp)) - julianday(MIN(timestamp))) * 86400 AS span
         FROM events
         WHERE timestamp >= ? AND timestamp <= ? AND session_id IS NOT NULL
         GROUP BY session_id
         HAVING COUNT(*) > 1
       )`
    )
    .get(startIso, endIso) as { s: number | null } | undefined;

  return {
    start: startIso,
    end: endIso,
    events: tot?.events ?? 0,
    files: tot?.files ?? 0,
    projects: tot?.projects ?? 0,
    days_active: tot?.days_active ?? 0,
    cost_usd: cost?.cost_usd ?? 0,
    requests: cost?.requests ?? 0,
    top_project: topProj?.p ?? null,
    top_model: topModel?.m ?? null,
    longest_session_seconds: Math.floor(longest?.s ?? 0)
  };
}

export function createJourneyRouter(db: RavenDB): Router {
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
      const earliestRow = db.db
        .prepare(`SELECT MIN(timestamp) AS first_ts FROM events`)
        .get() as { first_ts: string | null } | undefined;
      const earliest = earliestRow?.first_ts ? new Date(earliestRow.first_ts) : null;

      const now = new Date();
      const currentEnd = now.toISOString();
      const currentStart = new Date(now.getTime() - 7 * 86_400_000).toISOString();
      const current = aggregate(db, currentStart, currentEnd);

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
      const firstWeek = tooEarly ? null : aggregate(db, firstStart, firstEnd);
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
