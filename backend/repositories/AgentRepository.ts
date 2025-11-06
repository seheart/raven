/**
 * AgentRepository
 * Manages agent telemetry events and statistics
 * Extracted from RavenDB for better separation of concerns
 */

import type { Database } from 'better-sqlite3';
import type {
  ISOTimestamp,
  SessionID,
  ProjectName,
  AgentEvent,
  AgentStats,
  AgentPerformanceMetrics,
  PrepareStatementFn
} from '../types/index.js';
import { logger } from '../utils/logger.js';
import { LIMITS } from '../config/constants.js';

export class AgentRepository {
  private prepareStatement: PrepareStatementFn;

  /**
   * Create an AgentRepository instance
   * @param _db - Database connection instance (unused, kept for interface compatibility)
   * @param prepareStatement - Function to prepare SQL statements
   */
  constructor(_db: Database, prepareStatement: PrepareStatementFn) {
    this.prepareStatement = prepareStatement;
  }

  /**
   * Insert an agent event into the database
   * @param timestamp - ISO timestamp of the event
   * @param agent - Name of the agent (e.g., 'claude-code', 'copilot')
   * @param event_type - Type of event (e.g., 'file_edit', 'command_run')
   * @param file - File path associated with the event
   * @param lines_changed - Number of lines changed
   * @param duration_ms - Duration of the operation in milliseconds
   * @param message - Human-readable message describing the event
   * @param metadata - Additional metadata as JSON object
   * @param session_id - Session identifier
   * @param project_name - Name of the project
   * @returns ID of the inserted row
   */
  insertAgentEvent(
    timestamp: ISOTimestamp,
    agent: string,
    event_type: string,
    file: string | null,
    lines_changed: number | null,
    duration_ms: number | null,
    message: string,
    metadata: Record<string, unknown> | null,
    session_id: SessionID | null,
    project_name: ProjectName | null
  ): number {
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

    return result.lastInsertRowid as number;
  }

  /**
   * Get recent agent events
   * @param limit - Maximum number of events
   * @returns Array of agent events
   */
  getRecentAgentEvents(limit: number = LIMITS.PAGINATION.DEFAULT_LIMIT): Partial<AgentEvent>[] {
    const stmt = this.prepareStatement(`
      SELECT id, timestamp, agent, event_type, file, lines_changed, duration_ms, message,
             SUBSTR(metadata, 1, 200) as metadata, project_name
      FROM agent_events
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(limit) as Partial<AgentEvent>[];
  }

  /**
   * Get events by specific agent
   * @param agent - Agent name
   * @param limit - Maximum number of events
   * @returns Events for the specified agent
   */
  getEventsByAgent(agent: string, limit: number = LIMITS.PAGINATION.DEFAULT_LIMIT): AgentEvent[] {
    const stmt = this.prepareStatement(`
      SELECT id, timestamp, agent, event_type, file, lines_changed, duration_ms, message, metadata, project_name
      FROM agent_events
      WHERE agent = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(agent, limit) as AgentEvent[];
  }

  /**
   * Get agent statistics
   * @param limit - Maximum number of agents to include
   * @returns Array of agent statistics
   */
  getAgentStats(limit: number = LIMITS.PAGINATION.DEFAULT_LIMIT): AgentStats[] {
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

    return stmt.all(limit) as AgentStats[];
  }

  /**
   * Get distinct agent names
   * @returns Array of agent names
   */
  getAgentNames(): string[] {
    const stmt = this.prepareStatement(`
      SELECT DISTINCT agent
      FROM agent_events
      ORDER BY agent
    `);

    return (stmt.all() as Array<{ agent: string }>).map(row => row.agent);
  }

  /**
   * Get historical agent data (for trend analysis)
   * @param limit - Maximum number of agents
   * @returns Historical agent statistics
   */
  getHistoricalAgents(limit: number = LIMITS.PAGINATION.DEFAULT_LIMIT): Array<{
    agent: string;
    event_count: number;
    first_seen: ISOTimestamp;
    last_seen: ISOTimestamp;
    total_lines_changed: number | null;
    avg_duration_ms: number | null;
  }> {
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

    return stmt.all(limit) as Array<{
      agent: string;
      event_count: number;
      first_seen: ISOTimestamp;
      last_seen: ISOTimestamp;
      total_lines_changed: number | null;
      avg_duration_ms: number | null;
    }>;
  }

  /**
   * Get agent activity by time period
   * @param agent - Agent name
   * @param startTime - ISO timestamp
   * @param endTime - ISO timestamp
   * @returns Agent events in time range
   */
  getAgentActivityByTimeRange(
    agent: string,
    startTime: ISOTimestamp,
    endTime: ISOTimestamp
  ): Partial<AgentEvent>[] {
    const stmt = this.prepareStatement(`
      SELECT id, timestamp, event_type, file, lines_changed, duration_ms, message, metadata
      FROM agent_events
      WHERE agent = ? AND timestamp BETWEEN ? AND ?
      ORDER BY timestamp DESC
    `);

    return stmt.all(agent, startTime, endTime) as Partial<AgentEvent>[];
  }

  /**
   * Get agent event count
   * @param agent - Optional agent name filter
   * @returns Total event count
   */
  getAgentEventCount(agent: string | null = null): number {
    let query = `SELECT COUNT(*) as count FROM agent_events`;
    const params: string[] = [];

    if (agent) {
      query += ` WHERE agent = ?`;
      params.push(agent);
    }

    const stmt = this.prepareStatement(query);
    const result = stmt.get(...params) as { count: number } | undefined;
    return result?.count || 0;
  }

  /**
   * Get most active agents in the last N days
   * @param days - Number of days to look back
   * @param limit - Maximum number of agents
   * @returns Most active agents
   */
  getMostActiveAgents(
    days: number = 7,
    limit: number = 10
  ): Array<{
    agent: string;
    event_count: number;
    total_lines: number | null;
    last_seen: ISOTimestamp;
  }> {
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

    return stmt.all(cutoffDate, limit) as Array<{
      agent: string;
      event_count: number;
      total_lines: number | null;
      last_seen: ISOTimestamp;
    }>;
  }

  /**
   * Delete agent events before a certain date
   * @param beforeDate - ISO timestamp
   * @returns Number of deleted events
   */
  deleteAgentEventsBeforeDate(beforeDate: ISOTimestamp): number {
    const stmt = this.prepareStatement(`DELETE FROM agent_events WHERE timestamp < ?`);
    const result = stmt.run(beforeDate);
    return result.changes;
  }

  /**
   * Delete all agent events (use with caution!)
   * @returns Number of deleted events
   */
  deleteAllAgentEvents(): number {
    const stmt = this.prepareStatement(`DELETE FROM agent_events`);
    const result = stmt.run();
    logger.warn(`Deleted all agent events from database (${result.changes} records)`);
    return result.changes;
  }

  /**
   * Get agent performance metrics
   * @param agent - Agent name
   * @returns Performance metrics
   */
  getAgentPerformanceMetrics(agent: string): AgentPerformanceMetrics {
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

    return stmt.get(agent) as AgentPerformanceMetrics;
  }

  /**
   * Search agent events by message content
   * @param searchTerm - Search term
   * @param limit - Maximum number of results
   * @returns Matching events
   */
  searchAgentEventsByMessage(
    searchTerm: string,
    limit: number = LIMITS.PAGINATION.DEFAULT_LIMIT
  ): Partial<AgentEvent>[] {
    const stmt = this.prepareStatement(`
      SELECT id, timestamp, agent, event_type, file, lines_changed, duration_ms, message, project_name
      FROM agent_events
      WHERE message LIKE ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(`%${searchTerm}%`, limit) as Partial<AgentEvent>[];
  }
}
