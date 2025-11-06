/**
 * EventRepository
 * Manages file change events in the database
 * Extracted from RavenDB for better separation of concerns
 */

import { logger } from '../utils/logger.js';
import { LIMITS } from '../config/constants.js';

export class EventRepository {
  /**
   * Create an EventRepository instance
   * @param {object} db - Database connection instance
   * @param {Function} prepareStatement - Function to prepare SQL statements
   */
  constructor(db, prepareStatement) {
    this.db = db;
    this.prepareStatement = prepareStatement;
  }

  /**
   * Insert a file change event
   * @param {string} timestamp - ISO timestamp
   * @param {string} filepath - Relative file path
   * @param {string} change_type - Type of change (create, edit, delete)
   * @param {string|null} diff - Unified diff of changes
   * @param {number} cpu - CPU usage percentage
   * @param {number} mem - Memory usage percentage
   * @param {string} session_id - Session identifier
   * @param {string|null} file_hash - SHA256 hash of file content
   * @param {number} event_size - Size of the event in bytes
   * @returns {number} - ID of inserted event
   */
  insertEvent(timestamp, filepath, change_type, diff, cpu, mem, session_id, file_hash, event_size) {
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

    return result.lastInsertRowid;
  }

  /**
   * Get recent events
   * @param {number} limit - Maximum number of events to return
   * @returns {Array} - Array of event objects
   */
  getRecentEvents(limit = LIMITS.PAGINATION.DEFAULT_LIMIT) {
    const stmt = this.prepareStatement(`
      SELECT id, timestamp, filepath, change_type,
             SUBSTR(diff, 1, 500) as diff,
             cpu, mem, session_id, file_hash, event_size
      FROM events
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(limit);
  }

  /**
   * Get events by file path
   * @param {string} filepath - File path to search for
   * @param {number} limit - Maximum number of events
   * @returns {Array} - Array of events for the file
   */
  getEventsByFile(filepath, limit = LIMITS.PAGINATION.DEFAULT_LIMIT) {
    const stmt = this.prepareStatement(`
      SELECT id, timestamp, filepath, change_type,
             SUBSTR(diff, 1, 500) as diff,
             cpu, mem, session_id, file_hash, event_size
      FROM events
      WHERE filepath = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(filepath, limit);
  }

  /**
   * Get events by session ID
   * @param {string} session_id - Session identifier
   * @param {number} limit - Maximum number of events
   * @returns {Array} - Array of events for the session
   */
  getEventsBySession(session_id, limit = LIMITS.PAGINATION.DEFAULT_LIMIT) {
    const stmt = this.prepareStatement(`
      SELECT id, timestamp, filepath, change_type,
             SUBSTR(diff, 1, 500) as diff,
             cpu, mem, session_id, file_hash, event_size
      FROM events
      WHERE session_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(session_id, limit);
  }

  /**
   * Get recent file events with optional diff inclusion
   * @param {number} limit - Maximum number of events
   * @param {boolean} includeDiff - Whether to include full diff
   * @returns {Array} - Array of file events
   */
  getRecentFileEvents(limit = LIMITS.PAGINATION.DEFAULT_LIMIT, includeDiff = false) {
    const diffColumn = includeDiff ? 'diff' : 'SUBSTR(diff, 1, 200) as diff';

    const stmt = this.prepareStatement(`
      SELECT id, timestamp, filepath, change_type, ${diffColumn},
             cpu, mem, session_id, file_hash, event_size
      FROM events
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(limit);
  }

  /**
   * Get total event count
   * @returns {number} - Total number of events
   */
  getEventCount() {
    const stmt = this.prepareStatement('SELECT COUNT(*) as count FROM events');
    const result = stmt.get();
    return result?.count || 0;
  }

  /**
   * Get events within a time range
   * @param {string} startTime - ISO timestamp for start
   * @param {string} endTime - ISO timestamp for end
   * @param {number} limit - Maximum number of events
   * @returns {Array} - Array of events in time range
   */
  getEventsByTimeRange(startTime, endTime, limit = LIMITS.PAGINATION.DEFAULT_LIMIT) {
    const stmt = this.prepareStatement(`
      SELECT id, timestamp, filepath, change_type,
             SUBSTR(diff, 1, 200) as diff,
             cpu, mem, session_id, file_hash, event_size
      FROM events
      WHERE timestamp BETWEEN ? AND ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(startTime, endTime, limit);
  }

  /**
   * Get top modified files
   * @param {string|null} session_id - Optional session ID filter
   * @param {number} limit - Number of files to return
   * @returns {Array} - Array of {filepath, change_count} objects
   */
  getTopModifiedFiles(session_id = null, limit = 10) {
    let query;
    let params;

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
    return stmt.all(...params);
  }

  /**
   * Get longest edits (events with largest diffs)
   * @param {number} limit - Number of events to return
   * @returns {Array} - Array of events with longest diffs
   */
  getLongestEdits(limit = 10) {
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

    return stmt.all(limit);
  }

  /**
   * Get event statistics
   * @returns {object} - Statistics object
   */
  getEventStats() {
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

    return stmt.get();
  }

  /**
   * Delete events older than a certain date
   * @param {string} beforeDate - ISO timestamp
   * @returns {number} - Number of deleted events
   */
  deleteEventsBeforeDate(beforeDate) {
    const stmt = this.prepareStatement('DELETE FROM events WHERE timestamp < ?');
    const result = stmt.run(beforeDate);
    return result.changes;
  }

  /**
   * Delete all events (use with caution!)
   * @returns {number} - Number of deleted events
   */
  deleteAllEvents() {
    const stmt = this.prepareStatement('DELETE FROM events');
    const result = stmt.run();
    logger.warn(`Deleted all events from database (${result.changes} records)`);
    return result.changes;
  }

  /**
   * Search events by file path pattern
   * @param {string} pattern - SQL LIKE pattern
   * @param {number} limit - Maximum number of results
   * @returns {Array} - Matching events
   */
  searchEventsByPath(pattern, limit = LIMITS.PAGINATION.DEFAULT_LIMIT) {
    const stmt = this.prepareStatement(`
      SELECT id, timestamp, filepath, change_type,
             SUBSTR(diff, 1, 200) as diff,
             cpu, mem, session_id, file_hash, event_size
      FROM events
      WHERE filepath LIKE ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(pattern, limit);
  }
}
