/**
 * Today Narrative Repository — page-specific aggregates over `events`
 * for the Today narrative beats.
 */

import type { RavenDB } from '../db.js';

export interface TodayProjectSlice {
  project: string;
  events: number;
  files: number;
}

export interface WeekProjectSlice extends TodayProjectSlice {
  days_active: number;
}

interface ReturningRow {
  project: string;
  first_today: string;
  last_before: string | null;
}

export interface TodayNarrativeRepository {
  /** Per-project breakdown for events whose timestamp >= cutoff. */
  projectsSince(cutoffIso: string): TodayProjectSlice[];

  /** Per-project breakdown including distinct active-day count. */
  projectsWithDaysActiveSince(cutoffIso: string): WeekProjectSlice[];

  /** Aggregate totals (events + distinct filepaths) since cutoff. */
  totalsSince(cutoffIso: string): { events: number; files: number };

  /** Aggregate totals including distinct active-day count. */
  totalsWithDaysActiveSince(cutoffIso: string): {
    events: number;
    files: number;
    days_active: number;
  };

  /** Longest single-session span in seconds since cutoff. */
  longestSessionSecondsSince(cutoffIso: string): number;

  /**
   * For projects active since `cutoffIso`, returns the prior-most-recent
   * timestamp (before the cutoff). Used to detect "returning to" projects.
   */
  returningSince(cutoffIso: string): ReturningRow[];
}

export function createTodayNarrativeRepository(db: RavenDB): TodayNarrativeRepository {
  const projectsSinceStmt = db.db.prepare(
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
  );

  const projectsWithDaysSinceStmt = db.db.prepare(
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
  );

  const totalsSinceStmt = db.db.prepare(
    `SELECT
       COUNT(*) AS events,
       COUNT(DISTINCT filepath) AS files
     FROM events
     WHERE timestamp >= ?`
  );

  const totalsWithDaysSinceStmt = db.db.prepare(
    `SELECT
       COUNT(*) AS events,
       COUNT(DISTINCT filepath) AS files,
       COUNT(DISTINCT date(timestamp)) AS days_active
     FROM events
     WHERE timestamp >= ?`
  );

  const longestSessionStmt = db.db.prepare(
    `SELECT
       MAX(span_seconds) AS longest_seconds
     FROM (
       SELECT (julianday(MAX(timestamp)) - julianday(MIN(timestamp))) * 86400 AS span_seconds
       FROM events
       WHERE timestamp >= ? AND session_id IS NOT NULL
       GROUP BY session_id
       HAVING COUNT(*) > 1
     )`
  );

  const returningStmt = db.db.prepare(
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
  );

  return {
    projectsSince(cutoffIso) {
      return projectsSinceStmt.all(cutoffIso) as TodayProjectSlice[];
    },

    projectsWithDaysActiveSince(cutoffIso) {
      return projectsWithDaysSinceStmt.all(cutoffIso) as WeekProjectSlice[];
    },

    totalsSince(cutoffIso) {
      const row = totalsSinceStmt.get(cutoffIso) as { events: number; files: number } | undefined;
      return row ?? { events: 0, files: 0 };
    },

    totalsWithDaysActiveSince(cutoffIso) {
      const row = totalsWithDaysSinceStmt.get(cutoffIso) as
        | { events: number; files: number; days_active: number }
        | undefined;
      return row ?? { events: 0, files: 0, days_active: 0 };
    },

    longestSessionSecondsSince(cutoffIso) {
      const row = longestSessionStmt.get(cutoffIso) as
        | { longest_seconds: number | null }
        | undefined;
      return Math.floor(row?.longest_seconds ?? 0);
    },

    returningSince(cutoffIso) {
      return returningStmt.all(cutoffIso, cutoffIso) as ReturningRow[];
    }
  };
}
