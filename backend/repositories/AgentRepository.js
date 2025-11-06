/**
 * AgentRepository
 * Manages agent telemetry events and statistics
 * Extracted from RavenDB for better separation of concerns
 */

import { logger } from '../utils/logger.js';
import { LIMITS } from '../config/constants.js';

export class AgentRepository {
  /**
   * Create an AgentRepository instance
   * @param {object} db - Database connection instance
   * @param {Function} prepareStatement - Function to prepare SQL statements
   */
  constructor(db, prepareStatement) {
    this.db = db;
    this.prepareStatement = prepareStatement;
  }

  /**
   * Insert an agent event into the database
   * @param {string} timestamp - ISO timestamp of the event
   * @param {string} agent - Name of the agent (e.g., 'claude-code', 'copilot')
   * @param {string} event_type - Type of event (e.g., 'file_edit', 'command_run')
   * @param {string|null} file - File path associated with the event
   * @param {number|null} lines_changed - Number of lines changed
   * @param {number|null} duration_ms - Duration of the operation in milliseconds
   * @param {string} message - Human-readable message describing the event
   * @param {object|null} metadata - Additional metadata as JSON object
   * @param {string|null} session_id - Session identifier
   * @param {string|null} project_name - Name of the project
   * @returns {number} - ID of the inserted row
   */
  insertAgentEvent(
    timestamp,
    agent,
    event_type,
    file,
    lines_changed,
    duration_ms,
    message,
    metadata,
    session_id,
    project_name
  ) {
    const stmt = this.prepareStatement(`
      INSERT INTO agent_events (timestamp, agent, event_type, file, lines_changed, duration_ms, message, metadata, session_id, project_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      timestamp,
      agent,
      event_type,
      file || null,
      lines_changed || null,
      duration_ms || null,
      message,
      metadata ? JSON.stringify(metadata) : null,
      session_id || null,
      project_name || null
    );

    return result.lastInsertRowid;
  }

  /**
   * Get recent agent events
   * @param {number} limit - Maximum number of events
   * @returns {Array} - Array of agent events
   */
  getRecentAgentEvents(limit = LIMITS.PAGINATION.DEFAULT_LIMIT) {
    const stmt = this.prepareStatement(`
      SELECT id, timestamp, agent, event_type, file, lines_changed, duration_ms, message,
             SUBSTR(metadata, 1, 200) as metadata, project_name
      FROM agent_events
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(limit);
  }

  /**
   * Get events by specific agent
   * @param {string} agent - Agent name
   * @param {number} limit - Maximum number of events
   * @returns {Array} - Events for the specified agent
   */
  getEventsByAgent(agent, limit = LIMITS.PAGINATION.DEFAULT_LIMIT) {
    const stmt = this.prepareStatement(`
      SELECT id, timestamp, agent, event_type, file, lines_changed, duration_ms, message, metadata, project_name
      FROM agent_events
      WHERE agent = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(agent, limit);
  }

  /**
   * Get agent statistics
   * @param {number} limit - Maximum number of agents to include
   * @returns {Array} - Array of agent statistics
   */
  getAgentStats(limit = LIMITS.PAGINATION.DEFAULT_LIMIT) {
    const stmt = this.prepareStatement(`
      SELECT agent,
             COUNT(*) as event_count,
             SUM(lines_changed) as total_lines,
             AVG(duration_ms) as avg_duration,
             MAX(timestamp) as last_seen
      FROM agent_events
      GROUP BY agent
      ORDER BY event_count DESC
      LIMIT ?
    `);

    return stmt.all(limit);
  }

  /**
   * Get distinct agent names
   * @returns {Array} - Array of agent names
   */
  getAgentNames() {
    const stmt = this.prepareStatement(`
      SELECT DISTINCT agent
      FROM agent_events
      ORDER BY agent
    `);

    return stmt.all().map(row => row.agent);
  }

  /**
   * Get historical agent data (for trend analysis)
   * @param {number} limit - Maximum number of agents
   * @returns {Array} - Historical agent statistics
   */
  getHistoricalAgents(limit = LIMITS.PAGINATION.DEFAULT_LIMIT) {
    const stmt = this.prepareStatement(`
      SELECT agent,
             COUNT(*) as event_count,
             MIN(timestamp) as first_seen,
             MAX(timestamp) as last_seen,
             SUM(lines_changed) as total_lines_changed,
             AVG(duration_ms) as avg_duration_ms
      FROM agent_events
      GROUP BY agent
      ORDER BY event_count DESC
      LIMIT ?
    `);

    return stmt.all(limit);
  }

  /**
   * Get agent activity by time period
   * @param {string} agent - Agent name
   * @param {string} startTime - ISO timestamp
   * @param {string} endTime - ISO timestamp
   * @returns {Array} - Agent events in time range
   */
  getAgentActivityByTimeRange(agent, startTime, endTime) {
    const stmt = this.prepareStatement(`
      SELECT id, timestamp, event_type, file, lines_changed, duration_ms, message, metadata
      FROM agent_events
      WHERE agent = ? AND timestamp BETWEEN ? AND ?
      ORDER BY timestamp DESC
    `);

    return stmt.all(agent, startTime, endTime);
  }

  /**
   * Get agent event count
   * @param {string|null} agent - Optional agent name filter
   * @returns {number} - Total event count
   */
  getAgentEventCount(agent = null) {
    let query = 'SELECT COUNT(*) as count FROM agent_events';
    let params = [];

    if (agent) {
      query += ' WHERE agent = ?';
      params.push(agent);
    }

    const stmt = this.prepareStatement(query);
    const result = stmt.get(...params);
    return result?.count || 0;
  }

  /**
   * Get most active agents in the last N days
   * @param {number} days - Number of days to look back
   * @param {number} limit - Maximum number of agents
   * @returns {Array} - Most active agents
   */
  getMostActiveAgents(days = 7, limit = 10) {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const stmt = this.prepareStatement(`
      SELECT agent,
             COUNT(*) as event_count,
             SUM(lines_changed) as total_lines,
             MAX(timestamp) as last_seen
      FROM agent_events
      WHERE timestamp > ?
      GROUP BY agent
      ORDER BY event_count DESC
      LIMIT ?
    `);

    return stmt.all(cutoffDate, limit);
  }

  /**
   * Delete agent events before a certain date
   * @param {string} beforeDate - ISO timestamp
   * @returns {number} - Number of deleted events
   */
  deleteAgentEventsBeforeDate(beforeDate) {
    const stmt = this.prepareStatement('DELETE FROM agent_events WHERE timestamp < ?');
    const result = stmt.run(beforeDate);
    return result.changes;
  }

  /**
   * Delete all agent events (use with caution!)
   * @returns {number} - Number of deleted events
   */
  deleteAllAgentEvents() {
    const stmt = this.prepareStatement('DELETE FROM agent_events');
    const result = stmt.run();
    logger.warn(`Deleted all agent events from database (${result.changes} records)`);
    return result.changes;
  }

  /**
   * Get agent performance metrics
   * @param {string} agent - Agent name
   * @returns {object} - Performance metrics
   */
  getAgentPerformanceMetrics(agent) {
    const stmt = this.prepareStatement(`
      SELECT
        COUNT(*) as total_events,
        SUM(lines_changed) as total_lines_changed,
        AVG(lines_changed) as avg_lines_per_event,
        AVG(duration_ms) as avg_duration_ms,
        MIN(duration_ms) as min_duration_ms,
        MAX(duration_ms) as max_duration_ms,
        MIN(timestamp) as first_event,
        MAX(timestamp) as last_event
      FROM agent_events
      WHERE agent = ?
    `);

    return stmt.get(agent);
  }

  /**
   * Search agent events by message content
   * @param {string} searchTerm - Search term
   * @param {number} limit - Maximum number of results
   * @returns {Array} - Matching events
   */
  searchAgentEventsByMessage(searchTerm, limit = LIMITS.PAGINATION.DEFAULT_LIMIT) {
    const stmt = this.prepareStatement(`
      SELECT id, timestamp, agent, event_type, file, lines_changed, duration_ms, message, project_name
      FROM agent_events
      WHERE message LIKE ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(`%${searchTerm}%`, limit);
  }
}
