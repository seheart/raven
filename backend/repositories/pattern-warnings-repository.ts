/**
 * Pattern Warnings Repository — owns the `pattern_warnings` table.
 */

import type { RavenDB } from '../db.js';
import { logger } from '../utils/logger.js';

interface PatternWarningRow {
  id: number;
  timestamp: string;
  filepath: string;
  line_number: number;
  pattern_id: string;
  pattern_name: string;
  severity: string;
  category: string;
  match_text: string;
  context: string;
  resolved: number;
  session_id: string | null;
}

interface PatternWarningIgnoreRow {
  id: number;
  filepath: string;
  pattern_id: string;
  match_text: string;
  reason: string | null;
  created_at: string;
}

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
  getById(id: number): PatternWarningRow | undefined;
  list(limit?: number): unknown[];
  byCategory(category: string, limit?: number): unknown[];
  resolveById(id: number): void;
  resolveByFile(filepath: string): void;
  /** Resolve any stale pattern warnings for Raven's own source paths. */
  resolveForRaven(): void;
  /** Resolve every unresolved warning. Returns the number resolved. */
  resolveAll(): number;
  countUnresolved(): number;
  /** Add a durable ignore for the (filepath, pattern_id, match_text) key. */
  addIgnore(filepath: string, pattern_id: string, match_text: string, reason?: string): void;
  isIgnored(filepath: string, pattern_id: string, match_text: string): boolean;
  /** Resolve every unresolved warning matching the ignore key. */
  resolveByKey(filepath: string, pattern_id: string, match_text: string): number;
  listIgnores(): PatternWarningIgnoreRow[];
  removeIgnore(id: number): void;
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
  const resolveByIdStmt = db.db.prepare(`UPDATE pattern_warnings SET resolved = 1 WHERE id = ?`);
  const resolveByFileStmt = db.db.prepare(
    `UPDATE pattern_warnings SET resolved = 1 WHERE filepath = ? AND resolved = 0`
  );
  const resolveForRavenStmt = db.db.prepare(
    `UPDATE pattern_warnings SET resolved = 1
     WHERE resolved = 0
       AND (filepath LIKE '%raven/backend/%' OR filepath LIKE '%raven/frontend/%')`
  );
  const resolveAllStmt = db.db.prepare(
    `UPDATE pattern_warnings SET resolved = 1 WHERE resolved = 0`
  );
  const countUnresolvedStmt = db.db.prepare(
    `SELECT COUNT(*) as count FROM pattern_warnings WHERE resolved = 0`
  );
  const getByIdStmt = db.db.prepare(`SELECT * FROM pattern_warnings WHERE id = ?`);
  const insertIgnoreStmt = db.db.prepare(
    `INSERT OR IGNORE INTO pattern_warning_ignores
       (filepath, pattern_id, match_text, reason, created_at)
     VALUES (?, ?, ?, ?, ?)`
  );
  const isIgnoredStmt = db.db.prepare(
    `SELECT 1 FROM pattern_warning_ignores
      WHERE filepath = ? AND pattern_id = ? AND match_text = ?
      LIMIT 1`
  );
  const resolveByKeyStmt = db.db.prepare(
    `UPDATE pattern_warnings SET resolved = 1
      WHERE resolved = 0 AND filepath = ? AND pattern_id = ? AND match_text = ?`
  );
  const listIgnoresStmt = db.db.prepare(
    `SELECT * FROM pattern_warning_ignores ORDER BY created_at DESC`
  );
  const removeIgnoreStmt = db.db.prepare(`DELETE FROM pattern_warning_ignores WHERE id = ?`);

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

    getById(id) {
      return getByIdStmt.get(id) as PatternWarningRow | undefined;
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
        logger.info(`Resolved ${result.changes} stale pattern warning(s) for Raven's own files`);
      }
    },

    resolveAll() {
      const result = resolveAllStmt.run();
      return result.changes as number;
    },

    countUnresolved() {
      const row = countUnresolvedStmt.get() as { count: number } | undefined;
      return row?.count ?? 0;
    },

    addIgnore(filepath, pattern_id, match_text, reason) {
      insertIgnoreStmt.run(
        filepath,
        pattern_id,
        match_text,
        reason ?? null,
        new Date().toISOString()
      );
    },

    isIgnored(filepath, pattern_id, match_text) {
      return isIgnoredStmt.get(filepath, pattern_id, match_text) !== undefined;
    },

    resolveByKey(filepath, pattern_id, match_text) {
      const result = resolveByKeyStmt.run(filepath, pattern_id, match_text);
      return result.changes as number;
    },

    listIgnores() {
      return listIgnoresStmt.all() as PatternWarningIgnoreRow[];
    },

    removeIgnore(id) {
      removeIgnoreStmt.run(id);
    }
  };
}
