/**
 * File Events Repository — owns the `events` table.
 */

import type { RavenDB } from '../db.js';
import { retryWrite } from '../utils/sqlite-retry.js';
import { internalMetrics } from '../services/internal-metrics.js';

interface FileEventListParams {
  limit: number;
  includeDiff: boolean;
  project?: string;
  filepath?: string;
  startTime?: string;
  endTime?: string;
}

interface FileEventRow {
  id: number;
  timestamp: string;
  filepath: string;
  change_type: string;
  diff?: string;
  cpu: number;
  mem: number;
  session_id?: string;
  file_hash?: string;
  event_size?: number;
  project_name?: string | null;
  agent_source?: string | null;
}

export interface FileEventsRepository {
  /** Insert a new file change event. Returns the inserted row id. */
  insert(
    timestamp: string,
    filepath: string,
    change_type: string,
    diff: string | null,
    cpu: number,
    mem: number,
    session_id: string | null | undefined,
    file_hash: string | null | undefined,
    event_size: number | null | undefined,
    project_name: string | null | undefined,
    agent_source?: string | null | undefined
  ): number;

  /** Most recent file events. */
  recent(limit?: number, includeDiff?: boolean): FileEventRow[];

  /** Rows for a session, ordered ASC by timestamp. */
  bySession(sessionId: string): FileEventRow[];

  /** Distinct filepaths across the events table. */
  trackedFiles(): string[];

  /** Filtered list with project/filepath/time-range constraints. */
  list(params: FileEventListParams): unknown[];

  /** Most recent N rows for a given filepath. */
  history(filepath: string, limit: number): unknown[];

  /** Total event count grouped by project_name. NULL projects are excluded. */
  eventCountsByProject(): Map<string, number>;

  /**
   * Lifetime per-project totals from project_stats — survives the 7-day
   * retention purge that hits the events table. Returns counts plus
   * first/last seen timestamps.
   */
  lifetimeStatsByProject(): Map<
    string,
    {
      total_events: number;
      total_agent_events: number;
      first_seen_at: string | null;
      last_seen_at: string | null;
      last_agent_seen_at: string | null;
    }
  >;

  /**
   * Top N most-edited files for a single project, by event count within
   * the retention window. Powers the project profile panel's "hot files"
   * list.
   */
  topEditedByProject(
    projectName: string,
    limit?: number
  ): Array<{ filepath: string; edits: number }>;

  /**
   * Single event by id with the columns needed for diff inspection.
   * Returns undefined if no row matches.
   */
  byId(id: number): FileEventRow | undefined;

  /** Total event count across all projects. */
  totalCount(): number;

  /** Count of events whose timestamp is within the last `hours` hours. */
  countSinceHours(hours: number): number;

  /** Latest timestamp in the events table; null if empty. */
  lastTimestamp(): string | null;

  /** Aggregate event statistics for events newer than `cutoffIso`. */
  statsSince(cutoffIso: string): {
    total_file_changes: number;
    unique_files: number;
    edit_count: number;
    create_count: number;
    delete_count: number;
    first_seen: string | null;
    last_active: string | null;
  };

  /**
   * Time-bounded events list. Both bounds optional. Bound parameters are
   * always parameterized; no SQL injection risk in the dynamic WHERE clause.
   */
  listInTimeRange(
    startTime: string | undefined,
    endTime: string | undefined,
    limit: number,
    includeDiff: boolean
  ): unknown[];

  /** Most frequently changed filepaths, ordered by change_count DESC. */
  topByFrequency(limit: number): Array<{ filepath: string; change_count: number }>;

  /** Distinct filepath count across the events table. */
  distinctFilepathCount(): number;
}

export function createFileEventsRepository(db: RavenDB): FileEventsRepository {
  const insertStmt = db.db.prepare(`
    INSERT INTO events (timestamp, filepath, change_type, diff, cpu, mem, session_id, file_hash, event_size, project_name, agent_source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const bySessionStmt = db.db.prepare(`
    SELECT id, timestamp, filepath, change_type, diff, cpu, mem, project_name, agent_source
    FROM events
    WHERE session_id = ?
    ORDER BY timestamp ASC
  `);

  const byIdStmt = db.db.prepare(`
    SELECT id, timestamp, filepath, change_type, diff, cpu, mem, session_id, file_hash, event_size, project_name, agent_source
    FROM events WHERE id = ?
  `);

  const totalCountStmt = db.db.prepare('SELECT COUNT(*) as count FROM events');
  // Caller computes ISO cutoff so the timestamp index is honored (wrapping
  // the column in datetime() disabled it).
  const countSinceHoursStmt = db.db.prepare(
    `SELECT COUNT(*) as count FROM events
     WHERE timestamp >= ?`
  );
  const lastTimestampStmt = db.db.prepare('SELECT MAX(timestamp) as timestamp FROM events');

  const statsSinceStmt = db.db.prepare(`
    SELECT
      COUNT(*) as total_file_changes,
      COUNT(DISTINCT filepath) as unique_files,
      SUM(CASE WHEN change_type IN ('change', 'modified') THEN 1 ELSE 0 END) as edit_count,
      SUM(CASE WHEN change_type = 'add' THEN 1 ELSE 0 END) as create_count,
      SUM(CASE WHEN change_type = 'unlink' THEN 1 ELSE 0 END) as delete_count,
      MIN(timestamp) as first_seen,
      MAX(timestamp) as last_active
    FROM events
    WHERE timestamp > ?
  `);

  const topByFrequencyStmt = db.db.prepare(`
    SELECT filepath, COUNT(*) as change_count
    FROM events
    GROUP BY filepath
    ORDER BY change_count DESC
    LIMIT ?
  `);

  const distinctFilepathCountStmt = db.db.prepare(
    'SELECT COUNT(DISTINCT filepath) as count FROM events'
  );

  // Time-bounded list — parameter positions adjust by which bounds are set.
  // Two SELECT shapes (with/without diff) since `diff` is a heavyweight column.
  const listColsNoDiff =
    'id, timestamp, filepath, change_type, cpu, mem, session_id, project_name, agent_source';
  const listColsDiff =
    'id, timestamp, filepath, change_type, diff, cpu, mem, session_id, project_name, agent_source';
  const listAllNoDiff = db.db.prepare(
    `SELECT ${listColsNoDiff} FROM events ORDER BY timestamp DESC LIMIT ?`
  );
  const listAllDiff = db.db.prepare(
    `SELECT ${listColsDiff} FROM events ORDER BY timestamp DESC LIMIT ?`
  );
  const listFromNoDiff = db.db.prepare(
    `SELECT ${listColsNoDiff} FROM events WHERE timestamp >= ? ORDER BY timestamp DESC LIMIT ?`
  );
  const listFromDiff = db.db.prepare(
    `SELECT ${listColsDiff} FROM events WHERE timestamp >= ? ORDER BY timestamp DESC LIMIT ?`
  );
  const listUntilNoDiff = db.db.prepare(
    `SELECT ${listColsNoDiff} FROM events WHERE timestamp <= ? ORDER BY timestamp DESC LIMIT ?`
  );
  const listUntilDiff = db.db.prepare(
    `SELECT ${listColsDiff} FROM events WHERE timestamp <= ? ORDER BY timestamp DESC LIMIT ?`
  );
  const listBetweenNoDiff = db.db.prepare(
    `SELECT ${listColsNoDiff} FROM events WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp DESC LIMIT ?`
  );
  const listBetweenDiff = db.db.prepare(
    `SELECT ${listColsDiff} FROM events WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp DESC LIMIT ?`
  );

  const trackedFilesStmt = db.db.prepare(`
    SELECT DISTINCT filepath
    FROM events
    WHERE filepath IS NOT NULL
    ORDER BY filepath
  `);

  // Diffs above this cap are stored truncated with a sentinel suffix. Without
  // this, a single 60 KB diff bloats the events table at 16 KB/row average.
  const DIFF_MAX_BYTES = 4096;
  const truncateDiff = (diff: string | null | undefined): string | null => {
    if (!diff) return diff ?? null;
    if (diff.length <= DIFF_MAX_BYTES) return diff;
    return diff.slice(0, DIFF_MAX_BYTES) + `\n…[truncated ${diff.length - DIFF_MAX_BYTES} chars]`;
  };

  return {
    insert(
      timestamp,
      filepath,
      change_type,
      diff,
      cpu,
      mem,
      session_id,
      file_hash,
      event_size,
      project_name,
      agent_source
    ) {
      const result = retryWrite(
        () =>
          insertStmt.run(
            timestamp,
            filepath,
            change_type,
            truncateDiff(diff),
            cpu,
            mem,
            session_id || null,
            file_hash || null,
            event_size || null,
            project_name || null,
            agent_source || null
          ),
        'events.insert'
      );
      internalMetrics.recordIngest();
      return Number(result.lastInsertRowid);
    },

    recent(limit = 100, includeDiff = false) {
      const fields = includeDiff
        ? 'id, timestamp, filepath, change_type, event_size, file_hash, cpu, mem, diff, session_id, project_name, agent_source'
        : 'id, timestamp, filepath, change_type, event_size, file_hash, cpu, mem, session_id, project_name, agent_source';
      return db.db
        .prepare(`SELECT ${fields} FROM events ORDER BY timestamp DESC LIMIT ?`)
        .all(limit) as FileEventRow[];
    },

    bySession(sessionId) {
      return bySessionStmt.all(sessionId) as FileEventRow[];
    },

    trackedFiles() {
      return (trackedFilesStmt.all() as { filepath: string }[]).map(r => r.filepath);
    },

    list({ limit, includeDiff, project, filepath, startTime, endTime }) {
      const fields = includeDiff
        ? 'id, timestamp, filepath, change_type, event_size, file_hash, cpu, mem, diff, session_id, project_name, agent_source'
        : 'id, timestamp, filepath, change_type, event_size, file_hash, cpu, mem, session_id, project_name, agent_source';

      let query = `SELECT ${fields} FROM events`;
      const params: (string | number)[] = [];
      const conditions: string[] = [];

      if (project && project !== 'all') {
        conditions.push('project_name = ?');
        params.push(project);
      }
      if (filepath) {
        conditions.push('filepath = ?');
        params.push(filepath);
      }
      if (startTime) {
        conditions.push('timestamp >= ?');
        params.push(startTime);
      }
      if (endTime) {
        conditions.push('timestamp <= ?');
        params.push(endTime);
      }
      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' ORDER BY timestamp DESC LIMIT ?';
      params.push(limit);

      return db.db.prepare(query).all(...params);
    },

    history(filepath, limit) {
      return db.db
        .prepare(
          `SELECT id, timestamp, filepath, change_type, event_size, file_hash, cpu, mem, project_name
           FROM events
           WHERE filepath = ?
           ORDER BY timestamp DESC
           LIMIT ?`
        )
        .all(filepath, limit);
    },

    eventCountsByProject() {
      const counts = new Map<string, number>();
      try {
        const rows = db.db
          .prepare<
            unknown[],
            { project_name: string | null; count: number }
          >('SELECT project_name, COUNT(*) as count FROM events GROUP BY project_name')
          .all();
        for (const r of rows) {
          if (r.project_name) counts.set(r.project_name, r.count);
        }
      } catch {
        // Table missing or query failed — empty map preserves the original
        // route behavior of "every count stays 0".
      }
      return counts;
    },

    topEditedByProject(projectName, limit = 5) {
      try {
        return db.db
          .prepare<unknown[], { filepath: string; edits: number }>(
            `SELECT filepath, COUNT(*) as edits
               FROM events
              WHERE project_name = ? AND filepath IS NOT NULL
              GROUP BY filepath
              ORDER BY edits DESC
              LIMIT ?`
          )
          .all(projectName, limit);
      } catch {
        return [];
      }
    },

    lifetimeStatsByProject() {
      const stats = new Map<
        string,
        {
          total_events: number;
          total_agent_events: number;
          first_seen_at: string | null;
          last_seen_at: string | null;
          last_agent_seen_at: string | null;
        }
      >();
      try {
        const rows = db.db
          .prepare<
            unknown[],
            {
              project_name: string;
              total_events: number;
              total_agent_events: number;
              first_seen_at: string | null;
              last_seen_at: string | null;
              last_agent_seen_at: string | null;
            }
          >(
            `SELECT project_name, total_events, total_agent_events,
                    first_seen_at, last_seen_at, last_agent_seen_at
               FROM project_stats`
          )
          .all();
        for (const r of rows) {
          stats.set(r.project_name, {
            total_events: r.total_events,
            total_agent_events: r.total_agent_events,
            first_seen_at: r.first_seen_at,
            last_seen_at: r.last_seen_at,
            last_agent_seen_at: r.last_agent_seen_at
          });
        }
      } catch {
        // Table not yet created (first boot before migration ran) — empty
        // map keeps the projects route returning sensible zeros.
      }
      return stats;
    },

    byId(id) {
      return byIdStmt.get(id) as FileEventRow | undefined;
    },

    totalCount() {
      return (totalCountStmt.get() as { count: number } | undefined)?.count ?? 0;
    },

    countSinceHours(hours) {
      const cutoff = new Date(Date.now() - Math.max(0, hours) * 3600 * 1000).toISOString();
      return (countSinceHoursStmt.get(cutoff) as { count: number } | undefined)?.count ?? 0;
    },

    lastTimestamp() {
      return (
        (lastTimestampStmt.get() as { timestamp: string | null } | undefined)?.timestamp ?? null
      );
    },

    statsSince(cutoffIso) {
      const row = statsSinceStmt.get(cutoffIso) as
        | {
            total_file_changes: number;
            unique_files: number;
            edit_count: number;
            create_count: number;
            delete_count: number;
            first_seen: string | null;
            last_active: string | null;
          }
        | undefined;
      return (
        row ?? {
          total_file_changes: 0,
          unique_files: 0,
          edit_count: 0,
          create_count: 0,
          delete_count: 0,
          first_seen: null,
          last_active: null
        }
      );
    },

    listInTimeRange(startTime, endTime, limit, includeDiff) {
      if (startTime && endTime) {
        return (includeDiff ? listBetweenDiff : listBetweenNoDiff).all(startTime, endTime, limit);
      }
      if (startTime) {
        return (includeDiff ? listFromDiff : listFromNoDiff).all(startTime, limit);
      }
      if (endTime) {
        return (includeDiff ? listUntilDiff : listUntilNoDiff).all(endTime, limit);
      }
      return (includeDiff ? listAllDiff : listAllNoDiff).all(limit);
    },

    topByFrequency(limit) {
      return topByFrequencyStmt.all(limit) as Array<{
        filepath: string;
        change_count: number;
      }>;
    },

    distinctFilepathCount() {
      return (distinctFilepathCountStmt.get() as { count: number } | undefined)?.count ?? 0;
    }
  };
}
