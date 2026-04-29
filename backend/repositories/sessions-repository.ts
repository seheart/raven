/**
 * Sessions Repository — session-rollback queries.
 */

import type { RavenDB } from '../db.js';

interface SessionSummaryRow {
  session_id: string;
  start_time: string;
  end_time: string;
  event_count: number;
  file_count: number;
}

interface SessionFileRow {
  filepath: string;
}

export interface SessionsRepository {
  listRecent(limit: number): SessionSummaryRow[];
  filesInSession(sessionId: string): SessionFileRow[];
  sessionStartMs(sessionId: string): number;
}

export function createSessionsRepository(db: RavenDB): SessionsRepository {
  return {
    listRecent(limit) {
      return db.db
        .prepare(
          `SELECT
             session_id,
             MIN(timestamp) as start_time,
             MAX(timestamp) as end_time,
             COUNT(*) as event_count,
             COUNT(DISTINCT filepath) as file_count
           FROM events
           WHERE session_id IS NOT NULL
           GROUP BY session_id
           ORDER BY MAX(timestamp) DESC
           LIMIT ?`
        )
        .all(limit) as SessionSummaryRow[];
    },

    filesInSession(sessionId) {
      return db.db
        .prepare(
          `SELECT DISTINCT filepath
           FROM events
           WHERE session_id = ?
           ORDER BY filepath`
        )
        .all(sessionId) as SessionFileRow[];
    },

    sessionStartMs(sessionId) {
      const row = db.db
        .prepare(`SELECT MIN(timestamp) as start_time FROM events WHERE session_id = ?`)
        .get(sessionId) as { start_time: string | null } | undefined;
      return row?.start_time ? new Date(row.start_time).getTime() : 0;
    }
  };
}
