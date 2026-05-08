/**
 * Journey Repository — aggregations powering the "you've come a long way"
 * panel. Spans the `events` and `token_usage` tables, so it lives as its
 * own per-feature repository rather than splitting the math across two
 * domain repos.
 */

import type { RavenDB } from '../db.js';

export interface JourneyWindowStats {
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

export interface JourneyRepository {
  /** Earliest event timestamp across the whole table. Null if no events yet. */
  earliestEventTimestamp(): string | null;

  /** Activity profile bounded by `[startIso, endIso]` inclusive. */
  windowStats(startIso: string, endIso: string): JourneyWindowStats;
}

export function createJourneyRepository(db: RavenDB): JourneyRepository {
  const earliestStmt = db.db.prepare(`SELECT MIN(timestamp) AS first_ts FROM events`);

  const totalsStmt = db.db.prepare(
    `SELECT
       COUNT(*) AS events,
       COUNT(DISTINCT filepath) AS files,
       COUNT(DISTINCT project_name) AS projects,
       COUNT(DISTINCT date(timestamp)) AS days_active
     FROM events
     WHERE timestamp >= ? AND timestamp <= ?`
  );

  const topProjectStmt = db.db.prepare(
    `SELECT project_name AS p, COUNT(*) AS c
     FROM events
     WHERE timestamp >= ? AND timestamp <= ?
       AND project_name IS NOT NULL AND project_name != ''
     GROUP BY project_name
     ORDER BY c DESC
     LIMIT 1`
  );

  const costStmt = db.db.prepare(
    `SELECT COALESCE(SUM(estimated_cost_usd), 0) AS cost_usd, COUNT(*) AS requests
     FROM token_usage WHERE timestamp >= ? AND timestamp <= ?`
  );

  const topModelStmt = db.db.prepare(
    `SELECT model AS m, COUNT(*) AS c
     FROM token_usage
     WHERE timestamp >= ? AND timestamp <= ? AND model IS NOT NULL AND model != ''
     GROUP BY model
     ORDER BY c DESC
     LIMIT 1`
  );

  const longestSessionStmt = db.db.prepare(
    `SELECT MAX(span) AS s FROM (
       SELECT (julianday(MAX(timestamp)) - julianday(MIN(timestamp))) * 86400 AS span
       FROM events
       WHERE timestamp >= ? AND timestamp <= ? AND session_id IS NOT NULL
       GROUP BY session_id
       HAVING COUNT(*) > 1
     )`
  );

  return {
    earliestEventTimestamp() {
      return (earliestStmt.get() as { first_ts: string | null } | undefined)?.first_ts ?? null;
    },

    windowStats(startIso, endIso) {
      const tot = totalsStmt.get(startIso, endIso) as
        | { events: number; files: number; projects: number; days_active: number }
        | undefined;
      const topProj = topProjectStmt.get(startIso, endIso) as { p: string; c: number } | undefined;
      const cost = costStmt.get(startIso, endIso) as
        | { cost_usd: number; requests: number }
        | undefined;
      const topModel = topModelStmt.get(startIso, endIso) as { m: string; c: number } | undefined;
      const longest = longestSessionStmt.get(startIso, endIso) as { s: number | null } | undefined;

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
  };
}
