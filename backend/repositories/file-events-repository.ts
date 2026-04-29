/**
 * File Events Repository — owns the `events` table.
 */

import type { RavenDB } from '../db.js';

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

  const trackedFilesStmt = db.db.prepare(`
    SELECT DISTINCT filepath
    FROM events
    WHERE filepath IS NOT NULL
    ORDER BY filepath
  `);

  return {
    insert(timestamp, filepath, change_type, diff, cpu, mem, session_id, file_hash, event_size, project_name, agent_source) {
      const result = insertStmt.run(
        timestamp,
        filepath,
        change_type,
        diff,
        cpu,
        mem,
        session_id || null,
        file_hash || null,
        event_size || null,
        project_name || null,
        agent_source || null
      );
      return Number(result.lastInsertRowid);
    },

    recent(limit = 100, includeDiff = false) {
      const fields = includeDiff
        ? 'id, timestamp, filepath, change_type, event_size, file_hash, cpu, mem, diff, project_name, agent_source'
        : 'id, timestamp, filepath, change_type, event_size, file_hash, cpu, mem, project_name, agent_source';
      return db.db
        .prepare(
          `SELECT ${fields} FROM events ORDER BY timestamp DESC LIMIT ?`
        )
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
        ? 'id, timestamp, filepath, change_type, event_size, file_hash, cpu, mem, diff, project_name, agent_source'
        : 'id, timestamp, filepath, change_type, event_size, file_hash, cpu, mem, project_name, agent_source';

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
    }
  };
}
