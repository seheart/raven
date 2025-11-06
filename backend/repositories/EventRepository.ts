/**
 * EventRepository
 * Manages file change events in the database
 * Extracted from RavenDB for better separation of concerns
 */

import type { Database } from 'better-sqlite3';
import type {
  ISOTimestamp,
  SessionID,
  SHA256Hash,
  ChangeType,
  FileEvent,
  TopModifiedFile,
  LongestEdit,
  EventStats,
  PrepareStatementFn
} from '../types/index.js';
import { logger } from '../utils/logger.js';
import { LIMITS } from '../config/constants.js';

export class EventRepository {
  private prepareStatement: PrepareStatementFn;

  /**
   * Create an EventRepository instance
   * @param _db - Database connection instance (unused, kept for interface compatibility)
   * @param prepareStatement - Function to prepare SQL statements
   */
  constructor(_db: Database, prepareStatement: PrepareStatementFn) {
    this.prepareStatement = prepareStatement;
  }

  /**
   * Insert a file change event
   * @param timestamp - ISO timestamp
   * @param filepath - Relative file path
   * @param change_type - Type of change (create, edit, delete)
   * @param diff - Unified diff of changes
   * @param cpu - CPU usage percentage
   * @param mem - Memory usage percentage
   * @param session_id - Session identifier
   * @param file_hash - SHA256 hash of file content
   * @param event_size - Size of the event in bytes
   * @returns ID of inserted event
   */
  insertEvent(
    timestamp: ISOTimestamp,
    filepath: string,
    change_type: ChangeType,
    diff: string | null,
    cpu: number,
    mem: number,
    session_id: SessionID,
    file_hash: SHA256Hash | null,
    event_size: number
  ): number {
    const stmt = this.prepareStatement(`
      INSERT INTO events (timestamp, filepath, change_type, diff, cpu, mem, session_id, file_hash, event_size)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      timestamp,
      filepath,
      change_type,
      diff,
      cpu,
      mem,
      session_id,
      file_hash || null,
      event_size || 0
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Get recent events
   * @param limit - Maximum number of events to return
   * @returns Array of event objects
   */
  getRecentEvents(limit: number = LIMITS.PAGINATION.DEFAULT_LIMIT): Partial<FileEvent>[] {
    const stmt = this.prepareStatement(`
      SELECT id, timestamp, filepath, change_type,
             SUBSTR(diff, 1, 500) as diff,
             cpu, mem, session_id, file_hash, event_size
      FROM events
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(limit) as Partial<FileEvent>[];
  }

  /**
   * Get events by file path
   * @param filepath - File path to search for
   * @param limit - Maximum number of events
   * @returns Array of events for the file
   */
  getEventsByFile(
    filepath: string,
    limit: number = LIMITS.PAGINATION.DEFAULT_LIMIT
  ): Partial<FileEvent>[] {
    const stmt = this.prepareStatement(`
      SELECT id, timestamp, filepath, change_type,
             SUBSTR(diff, 1, 500) as diff,
             cpu, mem, session_id, file_hash, event_size
      FROM events
      WHERE filepath = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(filepath, limit) as Partial<FileEvent>[];
  }

  /**
   * Get events by session ID
   * @param session_id - Session identifier
   * @param limit - Maximum number of events
   * @returns Array of events for the session
   */
  getEventsBySession(
    session_id: SessionID,
    limit: number = LIMITS.PAGINATION.DEFAULT_LIMIT
  ): Partial<FileEvent>[] {
    const stmt = this.prepareStatement(`
      SELECT id, timestamp, filepath, change_type,
             SUBSTR(diff, 1, 500) as diff,
             cpu, mem, session_id, file_hash, event_size
      FROM events
      WHERE session_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(session_id, limit) as Partial<FileEvent>[];
  }

  /**
   * Get recent file events with optional diff inclusion
   * @param limit - Maximum number of events
   * @param includeDiff - Whether to include full diff
   * @returns Array of file events
   */
  getRecentFileEvents(
    limit: number = LIMITS.PAGINATION.DEFAULT_LIMIT,
    includeDiff: boolean = false
  ): Partial<FileEvent>[] {
    const diffColumn = includeDiff ? 'diff' : 'SUBSTR(diff, 1, 200) as diff';

    const stmt = this.prepareStatement(`
      SELECT id, timestamp, filepath, change_type, ${diffColumn},
             cpu, mem, session_id, file_hash, event_size
      FROM events
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(limit) as Partial<FileEvent>[];
  }

  /**
   * Get total event count
   * @returns Total number of events
   */
  getEventCount(): number {
    const stmt = this.prepareStatement(`SELECT COUNT(*) as count FROM events`);
    const result = stmt.get() as { count: number } | undefined;
    return result?.count || 0;
  }

  /**
   * Get events within a time range
   * @param startTime - ISO timestamp for start
   * @param endTime - ISO timestamp for end
   * @param limit - Maximum number of events
   * @returns Array of events in time range
   */
  getEventsByTimeRange(
    startTime: ISOTimestamp,
    endTime: ISOTimestamp,
    limit: number = LIMITS.PAGINATION.DEFAULT_LIMIT
  ): Partial<FileEvent>[] {
    const stmt = this.prepareStatement(`
      SELECT id, timestamp, filepath, change_type,
             SUBSTR(diff, 1, 200) as diff,
             cpu, mem, session_id, file_hash, event_size
      FROM events
      WHERE timestamp BETWEEN ? AND ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(startTime, endTime, limit) as Partial<FileEvent>[];
  }

  /**
   * Get top modified files
   * @param session_id - Optional session ID filter
   * @param limit - Number of files to return
   * @returns Array of {filepath, change_count} objects
   */
  getTopModifiedFiles(session_id: SessionID | null = null, limit: number = 10): TopModifiedFile[] {
    let query: string;
    let params: (SessionID | number)[];

    if (session_id) {
      query = `
        SELECT filepath, COUNT(*) as change_count
        FROM events
        WHERE session_id = ?
        GROUP BY filepath
        ORDER BY change_count DESC
        LIMIT ?
      `;
      params = [session_id, limit];
    } else {
      query = `
        SELECT filepath, COUNT(*) as change_count
        FROM events
        GROUP BY filepath
        ORDER BY change_count DESC
        LIMIT ?
      `;
      params = [limit];
    }

    const stmt = this.prepareStatement(query);
    return stmt.all(...params) as TopModifiedFile[];
  }

  /**
   * Get longest edits (events with largest diffs)
   * @param limit - Number of events to return
   * @returns Array of events with longest diffs
   */
  getLongestEdits(limit: number = 10): LongestEdit[] {
    const stmt = this.prepareStatement(`
      SELECT id, timestamp, filepath, change_type,
             LENGTH(diff) as diff_length,
             SUBSTR(diff, 1, 200) as diff_preview,
             cpu, mem, session_id
      FROM events
      WHERE diff IS NOT NULL
      ORDER BY diff_length DESC
      LIMIT ?
    `);

    return stmt.all(limit) as LongestEdit[];
  }

  /**
   * Get event statistics
   * @returns Statistics object
   */
  getEventStats(): EventStats {
    const stmt = this.prepareStatement(`
      SELECT
        COUNT(*) as total_events,
        COUNT(DISTINCT filepath) as unique_files,
        COUNT(DISTINCT session_id) as unique_sessions,
        SUM(CASE WHEN change_type = 'create' THEN 1 ELSE 0 END) as creates,
        SUM(CASE WHEN change_type = 'edit' THEN 1 ELSE 0 END) as edits,
        SUM(CASE WHEN change_type = 'delete' THEN 1 ELSE 0 END) as deletes,
        AVG(event_size) as avg_event_size,
        SUM(event_size) as total_event_size
      FROM events
    `);

    return stmt.get() as EventStats;
  }

  /**
   * Delete events older than a certain date
   * @param beforeDate - ISO timestamp
   * @returns Number of deleted events
   */
  deleteEventsBeforeDate(beforeDate: ISOTimestamp): number {
    const stmt = this.prepareStatement(`DELETE FROM events WHERE timestamp < ?`);
    const result = stmt.run(beforeDate);
    return result.changes;
  }

  /**
   * Delete all events (use with caution!)
   * @returns Number of deleted events
   */
  deleteAllEvents(): number {
    const stmt = this.prepareStatement(`DELETE FROM events`);
    const result = stmt.run();
    logger.warn(`Deleted all events from database (${result.changes} records)`);
    return result.changes;
  }

  /**
   * Search events by file path pattern
   * @param pattern - SQL LIKE pattern
   * @param limit - Maximum number of results
   * @returns Matching events
   */
  searchEventsByPath(
    pattern: string,
    limit: number = LIMITS.PAGINATION.DEFAULT_LIMIT
  ): Partial<FileEvent>[] {
    const stmt = this.prepareStatement(`
      SELECT id, timestamp, filepath, change_type,
             SUBSTR(diff, 1, 200) as diff,
             cpu, mem, session_id, file_hash, event_size
      FROM events
      WHERE filepath LIKE ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(pattern, limit) as Partial<FileEvent>[];
  }
}
