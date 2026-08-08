/**
 * Errors Repository — owns the `app_errors` table.
 */

import type { RavenDB } from '../db.js';

/**
 * Rolling window for the header error badge, in days.
 *
 * The badge answers "is something wrong right now?", so it must age out.
 * Without a window, a single bad dev session leaves a permanent red count in
 * the header — errors from HMR reloads weeks ago read exactly like a live
 * fault. Full history stays available on /system/errors, which is where you
 * go to actually review it.
 */
export const ERROR_BADGE_WINDOW_DAYS = 7;

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
  /** Unresolved errors inside the badge window. Powers the header count. */
  countUnresolved(): number;
  /** Marks every unresolved error resolved. Returns how many were flipped. */
  resolveAll(): number;
}

export function createErrorsRepository(db: RavenDB): ErrorsRepository {
  // `list()` builds dynamic WHERE clauses based on filters, so its statements
  // are prepared on demand. The four shapes are cached after first use.
  const listStmtCache = new Map<string, ReturnType<typeof db.db.prepare>>();
  const totalStmtCache = new Map<string, ReturnType<typeof db.db.prepare>>();
  const getListStmt = (whereClause: string) => {
    let s = listStmtCache.get(whereClause);
    if (!s) {
      s = db.db.prepare(
        `SELECT * FROM app_errors ${whereClause} ORDER BY timestamp DESC LIMIT ? OFFSET ?`
      );
      listStmtCache.set(whereClause, s);
    }
    return s;
  };
  const getTotalStmt = (whereClause: string) => {
    let s = totalStmtCache.get(whereClause);
    if (!s) {
      s = db.db.prepare(`SELECT COUNT(*) as total FROM app_errors ${whereClause}`);
      totalStmtCache.set(whereClause, s);
    }
    return s;
  };

  const insertStmt = db.db.prepare(
    `INSERT INTO app_errors (timestamp, error_type, message, stack, component, severity, url, user_agent, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const statsTotalStmt = db.db.prepare(
    'SELECT COUNT(*) as total FROM app_errors WHERE resolved = 0'
  );
  const statsBySeverityStmt = db.db.prepare(
    'SELECT severity, COUNT(*) as count FROM app_errors WHERE resolved = 0 GROUP BY severity'
  );
  const statsByComponentStmt = db.db.prepare(
    'SELECT component, COUNT(*) as count FROM app_errors WHERE resolved = 0 GROUP BY component ORDER BY count DESC LIMIT 10'
  );
  const statsRecentStmt = db.db.prepare(
    'SELECT * FROM app_errors WHERE resolved = 0 ORDER BY timestamp DESC LIMIT 5'
  );
  const clearStmt = db.db.prepare('DELETE FROM app_errors');
  // Caller supplies the ISO cutoff so the timestamp index stays usable — same
  // rewrite as dashboard-repository's 24h statements.
  const countUnresolvedStmt = db.db.prepare(
    'SELECT COUNT(*) as count FROM app_errors WHERE resolved = 0 AND timestamp >= ?'
  );
  const resolveAllStmt = db.db.prepare('UPDATE app_errors SET resolved = 1 WHERE resolved = 0');

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

      const totalStmt = getTotalStmt(whereClause) as {
        get: (...args: unknown[]) => { total: number };
      };
      const listStmt = getListStmt(whereClause) as {
        all: (...args: unknown[]) => AppErrorRow[];
      };
      const totalResult = totalStmt.get(...params);
      const errors = listStmt.all(...params, limit, offset);
      return { errors, total: totalResult.total };
    },

    insert({ error_type, message, stack, component, severity, url, user_agent, metadata }) {
      insertStmt.run(
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
      const totalRow = statsTotalStmt.get() as { total: number } | undefined;
      const bySeverity = statsBySeverityStmt.all() as { severity: string; count: number }[];
      const byComponent = statsByComponentStmt.all() as { component: string; count: number }[];
      const recent = statsRecentStmt.all() as AppErrorRow[];
      return { total: totalRow?.total ?? 0, bySeverity, byComponent, recent };
    },

    clear() {
      clearStmt.run();
    },

    countUnresolved() {
      const cutoff = new Date(
        Date.now() - ERROR_BADGE_WINDOW_DAYS * 24 * 60 * 60 * 1000
      ).toISOString();
      const row = countUnresolvedStmt.get(cutoff) as { count: number } | undefined;
      return row?.count ?? 0;
    },

    resolveAll() {
      const info = resolveAllStmt.run() as { changes: number };
      return info.changes;
    }
  };
}
