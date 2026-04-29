/**
 * Syntax Errors Repository — owns the `syntax_errors` table.
 */

import type { RavenDB } from '../db.js';
import { logger } from '../utils/logger.js';

interface SyntaxErrorRecord {
  id: number;
  timestamp: string;
  filepath: string;
  line_number: number;
  column_number?: number;
  message: string;
  severity: string;
  language: string;
  resolved: number;
  session_id?: string;
}

export interface SyntaxErrorsRepository {
  insert(
    timestamp: string,
    filepath: string,
    line_number: number,
    column_number: number | undefined,
    message: string,
    severity: string,
    language: string,
    session_id: string | undefined
  ): number;
  list(limit?: number): SyntaxErrorRecord[];
  byFile(filepath: string, limit?: number): SyntaxErrorRecord[];
  resolveById(id: number): void;
  resolveByFile(filepath: string): void;
  /** Resolve any stale syntax errors recorded for Raven's own source paths. */
  resolveForRaven(): void;
  countUnresolved(): number;
}

export function createSyntaxErrorsRepository(db: RavenDB): SyntaxErrorsRepository {
  return {
    insert(timestamp, filepath, line_number, column_number, message, severity, language, session_id) {
      const result = db.db
        .prepare(
          `INSERT INTO syntax_errors (timestamp, filepath, line_number, column_number, message, severity, language, session_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          timestamp,
          filepath,
          line_number,
          column_number || null,
          message,
          severity,
          language,
          session_id || null
        );
      return result.lastInsertRowid as number;
    },

    list(limit = 100) {
      return db.db
        .prepare(
          `SELECT * FROM syntax_errors WHERE resolved = 0 ORDER BY timestamp DESC LIMIT ?`
        )
        .all(limit) as SyntaxErrorRecord[];
    },

    byFile(filepath, limit = 100) {
      return db.db
        .prepare(
          `SELECT * FROM syntax_errors WHERE filepath = ? AND resolved = 0
           ORDER BY timestamp DESC LIMIT ?`
        )
        .all(filepath, limit) as SyntaxErrorRecord[];
    },

    resolveById(id) {
      db.db.prepare(`UPDATE syntax_errors SET resolved = 1 WHERE id = ?`).run(id);
    },

    resolveByFile(filepath) {
      db.db
        .prepare(`UPDATE syntax_errors SET resolved = 1 WHERE filepath = ? AND resolved = 0`)
        .run(filepath);
    },

    resolveForRaven() {
      const result = db.db
        .prepare(
          `UPDATE syntax_errors SET resolved = 1
           WHERE resolved = 0
             AND (filepath LIKE '%raven/backend/%' OR filepath LIKE '%raven/frontend/%')`
        )
        .run();
      if (result.changes > 0) {
        logger.info(`Resolved ${result.changes} stale syntax error(s) for Raven's own files`);
      }
    },

    countUnresolved() {
      const row = db.db
        .prepare(`SELECT COUNT(*) as count FROM syntax_errors WHERE resolved = 0`)
        .get() as { count: number } | undefined;
      return row?.count ?? 0;
    }
  };
}
