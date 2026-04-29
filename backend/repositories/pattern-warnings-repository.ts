/**
 * Pattern Warnings Repository — owns the `pattern_warnings` table.
 */

import type { RavenDB } from '../db.js';
import { logger } from '../utils/logger.js';

export interface PatternWarningsRepository {
  insert(
    timestamp: string,
    filepath: string,
    line_number: number,
    pattern_id: string,
    pattern_name: string,
    severity: string,
    category: string,
    match_text: string,
    context: string,
    session_id: string | undefined
  ): number;
  list(limit?: number): unknown[];
  byCategory(category: string, limit?: number): unknown[];
  resolveById(id: number): void;
  resolveByFile(filepath: string): void;
  /** Resolve any stale pattern warnings for Raven's own source paths. */
  resolveForRaven(): void;
  countUnresolved(): number;
}

export function createPatternWarningsRepository(db: RavenDB): PatternWarningsRepository {
  const insertStmt = db.db.prepare(
    `INSERT INTO pattern_warnings
       (timestamp, filepath, line_number, pattern_id, pattern_name, severity, category, match_text, context, session_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const listStmt = db.db.prepare(
    `SELECT * FROM pattern_warnings WHERE resolved = 0 ORDER BY timestamp DESC LIMIT ?`
  );
  const byCategoryStmt = db.db.prepare(
    `SELECT * FROM pattern_warnings WHERE category = ? AND resolved = 0
     ORDER BY timestamp DESC LIMIT ?`
  );
  const resolveByIdStmt = db.db.prepare(
    `UPDATE pattern_warnings SET resolved = 1 WHERE id = ?`
  );
  const resolveByFileStmt = db.db.prepare(
    `UPDATE pattern_warnings SET resolved = 1 WHERE filepath = ? AND resolved = 0`
  );
  const resolveForRavenStmt = db.db.prepare(
    `UPDATE pattern_warnings SET resolved = 1
     WHERE resolved = 0
       AND (filepath LIKE '%raven/backend/%' OR filepath LIKE '%raven/frontend/%')`
  );
  const countUnresolvedStmt = db.db.prepare(
    `SELECT COUNT(*) as count FROM pattern_warnings WHERE resolved = 0`
  );

  return {
    insert(
      timestamp,
      filepath,
      line_number,
      pattern_id,
      pattern_name,
      severity,
      category,
      match_text,
      context,
      session_id
    ) {
      const result = insertStmt.run(
        timestamp,
        filepath,
        line_number,
        pattern_id,
        pattern_name,
        severity,
        category,
        match_text,
        context,
        session_id || null
      );
      return result.lastInsertRowid as number;
    },

    list(limit = 100) {
      return listStmt.all(limit);
    },

    byCategory(category, limit = 100) {
      return byCategoryStmt.all(category, limit);
    },

    resolveById(id) {
      resolveByIdStmt.run(id);
    },

    resolveByFile(filepath) {
      resolveByFileStmt.run(filepath);
    },

    resolveForRaven() {
      const result = resolveForRavenStmt.run();
      if (result.changes > 0) {
        logger.info(
          `Resolved ${result.changes} stale pattern warning(s) for Raven's own files`
        );
      }
    },

    countUnresolved() {
      const row = countUnresolvedStmt.get() as { count: number } | undefined;
      return row?.count ?? 0;
    }
  };
}
