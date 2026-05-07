/**
 * Diff Annotations Repository — owns the `diff_annotations` table.
 *
 * Per-line risk findings tied to a specific file event. Distinct from
 * `pattern_warnings`: annotations are attached to one diff and surfaced
 * inline next to the change in the diff viewer.
 */

import type { RavenDB } from '../db.js';

export interface DiffAnnotationRow {
  id: number;
  event_id: number;
  filepath: string;
  line_number: number;
  severity: 'critical' | 'warning' | 'info';
  category: string;
  rule_id: string;
  rule_name: string;
  message: string;
  match_text: string | null;
  source: string;
  timestamp: string;
}

export interface NewDiffAnnotation {
  event_id: number;
  filepath: string;
  line_number: number;
  severity: 'critical' | 'warning' | 'info';
  category: string;
  rule_id: string;
  rule_name: string;
  message: string;
  match_text?: string | null;
  source?: string;
  timestamp?: string;
}

export interface FileAnnotationSummary {
  filepath: string;
  event_id: number;
  timestamp: string;
  critical_count: number;
  warning_count: number;
  info_count: number;
  highest_severity: 'critical' | 'warning' | 'info' | null;
}

export interface DiffAnnotationsRepository {
  insertMany(rows: NewDiffAnnotation[]): number;
  byEventId(eventId: number): DiffAnnotationRow[];
  recent(limit?: number): DiffAnnotationRow[];
  /** Roll-up per file event so the diff list can show a risk badge. */
  recentSummaries(limit?: number): FileAnnotationSummary[];
  deleteByEventId(eventId: number): void;
  countAll(): number;
}

export function createDiffAnnotationsRepository(db: RavenDB): DiffAnnotationsRepository {
  // Cache prepared statements at factory init — the same pattern used by
  // errors-repository and pattern-warnings-repository.
  const insertStmt = db.db.prepare(
    `INSERT INTO diff_annotations
       (event_id, filepath, line_number, severity, category, rule_id, rule_name, message, match_text, source, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const byEventStmt = db.db.prepare(
    `SELECT * FROM diff_annotations WHERE event_id = ? ORDER BY line_number ASC, id ASC`
  );

  const recentStmt = db.db.prepare(
    `SELECT * FROM diff_annotations ORDER BY timestamp DESC, id DESC LIMIT ?`
  );

  const summaryStmt = db.db.prepare(
    `SELECT
       a.event_id,
       a.filepath,
       MAX(a.timestamp) AS timestamp,
       SUM(CASE WHEN a.severity = 'critical' THEN 1 ELSE 0 END) AS critical_count,
       SUM(CASE WHEN a.severity = 'warning'  THEN 1 ELSE 0 END) AS warning_count,
       SUM(CASE WHEN a.severity = 'info'     THEN 1 ELSE 0 END) AS info_count
     FROM diff_annotations a
     GROUP BY a.event_id, a.filepath
     ORDER BY timestamp DESC
     LIMIT ?`
  );

  const deleteByEventStmt = db.db.prepare(
    `DELETE FROM diff_annotations WHERE event_id = ?`
  );

  const countStmt = db.db.prepare(`SELECT COUNT(*) AS c FROM diff_annotations`);

  return {
    insertMany(rows) {
      if (!rows.length) return 0;
      const insertAll = db.db.transaction((batch: NewDiffAnnotation[]) => {
        for (const r of batch) {
          insertStmt.run(
            r.event_id,
            r.filepath,
            r.line_number,
            r.severity,
            r.category,
            r.rule_id,
            r.rule_name,
            r.message,
            r.match_text ?? null,
            r.source ?? 'pattern',
            r.timestamp ?? new Date().toISOString()
          );
        }
      });
      insertAll(rows);
      return rows.length;
    },

    byEventId(eventId) {
      return byEventStmt.all(eventId) as DiffAnnotationRow[];
    },

    recent(limit = 50) {
      return recentStmt.all(limit) as DiffAnnotationRow[];
    },

    recentSummaries(limit = 20) {
      const rows = summaryStmt.all(limit) as Array<{
        event_id: number;
        filepath: string;
        timestamp: string;
        critical_count: number;
        warning_count: number;
        info_count: number;
      }>;
      return rows.map(r => ({
        ...r,
        highest_severity:
          r.critical_count > 0 ? 'critical' :
          r.warning_count > 0 ? 'warning' :
          r.info_count > 0 ? 'info' : null
      }));
    },

    deleteByEventId(eventId) {
      deleteByEventStmt.run(eventId);
    },

    countAll() {
      const row = countStmt.get() as { c: number } | undefined;
      return row?.c ?? 0;
    }
  };
}
