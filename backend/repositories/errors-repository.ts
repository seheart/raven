/**
 * Errors Repository — owns the `app_errors` table.
 */

import type { RavenDB } from '../db.js';

interface AppErrorRow {
  id: number;
  timestamp: string;
  error_type: string;
  message: string;
  stack: string | null;
  component: string;
  severity: string;
  url: string | null;
  user_agent: string | null;
  metadata: string | null;
  resolved: number;
}

interface ListParams {
  limit: number;
  offset: number;
  search?: string;
  severity?: string;
}

interface InsertParams {
  error_type?: string;
  message?: string;
  stack?: string | null;
  component?: string;
  severity?: string;
  url?: string | null;
  user_agent?: string | null;
  metadata?: unknown;
}

export interface ErrorsRepository {
  list(params: ListParams): { errors: AppErrorRow[]; total: number };
  insert(params: InsertParams): void;
  getStats(): {
    total: number;
    bySeverity: { severity: string; count: number }[];
    byComponent: { component: string; count: number }[];
    recent: AppErrorRow[];
  };
  clear(): void;
  countUnresolved(): number;
}

export function createErrorsRepository(db: RavenDB): ErrorsRepository {
  return {
    list({ limit, offset, search, severity }) {
      let whereClause = 'WHERE 1=1';
      const params: (string | number)[] = [];

      if (search) {
        whereClause += ' AND (message LIKE ? OR component LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
      }
      if (severity && severity !== 'all') {
        whereClause += ' AND severity = ?';
        params.push(severity);
      }

      const totalResult = db.db
        .prepare(`SELECT COUNT(*) as total FROM app_errors ${whereClause}`)
        .get(...params) as { total: number };

      const errors = db.db
        .prepare(
          `SELECT * FROM app_errors ${whereClause} ORDER BY timestamp DESC LIMIT ? OFFSET ?`
        )
        .all(...params, limit, offset) as AppErrorRow[];

      return { errors, total: totalResult.total };
    },

    insert({ error_type, message, stack, component, severity, url, user_agent, metadata }) {
      db.db
        .prepare(
          `INSERT INTO app_errors (timestamp, error_type, message, stack, component, severity, url, user_agent, metadata)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          new Date().toISOString(),
          error_type || 'Error',
          message || 'Unknown error',
          stack || null,
          component || 'unknown',
          severity || 'error',
          url || null,
          user_agent || null,
          metadata ? JSON.stringify(metadata) : null
        );
    },

    getStats() {
      const totalRow = db.db
        .prepare('SELECT COUNT(*) as total FROM app_errors WHERE resolved = 0')
        .get() as { total: number } | undefined;
      const bySeverity = db.db
        .prepare(
          'SELECT severity, COUNT(*) as count FROM app_errors WHERE resolved = 0 GROUP BY severity'
        )
        .all() as { severity: string; count: number }[];
      const byComponent = db.db
        .prepare(
          'SELECT component, COUNT(*) as count FROM app_errors WHERE resolved = 0 GROUP BY component ORDER BY count DESC LIMIT 10'
        )
        .all() as { component: string; count: number }[];
      const recent = db.db
        .prepare(
          'SELECT * FROM app_errors WHERE resolved = 0 ORDER BY timestamp DESC LIMIT 5'
        )
        .all() as AppErrorRow[];
      return { total: totalRow?.total ?? 0, bySeverity, byComponent, recent };
    },

    clear() {
      db.db.prepare('DELETE FROM app_errors').run();
    },

    countUnresolved() {
      const row = db.db
        .prepare('SELECT COUNT(*) as count FROM app_errors WHERE resolved = 0')
        .get() as { count: number } | undefined;
      return row?.count ?? 0;
    }
  };
}
