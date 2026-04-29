/**
 * Diff Risk Repository — owns the `diff_risk_scores` table.
 *
 * Risk scores come from the LLM-powered insights service when a diff is
 * "significant" (>50 lines). The score is shown alongside the change in the
 * diff viewer and surfaced on the Insights page.
 */

import type { RavenDB } from '../db.js';

interface DiffRiskScoreRow {
  id: number;
  event_id: number;
  filepath: string;
  score: number;
  reason: string;
  timestamp: string;
  model: string | null;
  session_id: string | null;
}

export interface DiffRiskRepository {
  insert(
    event_id: number,
    filepath: string,
    score: number,
    reason: string,
    timestamp: string,
    model: string | null,
    session_id: string | null
  ): number;
  recent(limit?: number): DiffRiskScoreRow[];
  byEventId(eventId: number): DiffRiskScoreRow | null;
}

export function createDiffRiskRepository(db: RavenDB): DiffRiskRepository {
  return {
    insert(event_id, filepath, score, reason, timestamp, model, session_id) {
      const result = db.db
        .prepare(
          `INSERT INTO diff_risk_scores (event_id, filepath, score, reason, timestamp, model, session_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(event_id, filepath, score, reason, timestamp, model, session_id);
      return result.lastInsertRowid as number;
    },

    recent(limit = 20) {
      return db.db
        .prepare(`SELECT * FROM diff_risk_scores ORDER BY timestamp DESC LIMIT ?`)
        .all(limit) as DiffRiskScoreRow[];
    },

    byEventId(eventId) {
      return (db.db
        .prepare(`SELECT * FROM diff_risk_scores WHERE event_id = ?`)
        .get(eventId) as DiffRiskScoreRow) || null;
    }
  };
}
