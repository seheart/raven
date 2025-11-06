/**
 * MetricsRepository
 * Manages system and process metrics
 * Extracted from RavenDB for better separation of concerns
 */

import type { Database } from 'better-sqlite3';
import type {
  ISOTimestamp,
  SessionID,
  SystemMetrics,
  ProcessMetrics,
  AverageSystemMetrics,
  PeakResourceUsage,
  MetricsStats,
  ResourceTrend,
  PrepareStatementFn
} from '../types/index.js';
import { logger } from '../utils/logger.js';
import { LIMITS } from '../config/constants.js';

export class MetricsRepository {
  private prepareStatement: PrepareStatementFn;

  /**
   * Create a MetricsRepository instance
   * @param _db - Database connection instance (unused, kept for interface compatibility)
   * @param prepareStatement - Function to prepare SQL statements
   */
  constructor(_db: Database, prepareStatement: PrepareStatementFn) {
    this.prepareStatement = prepareStatement;
  }

  /**
   * Insert process metrics
   * @param timestamp - ISO timestamp
   * @param agent_name - Name of the agent/process
   * @param cpu_percent - CPU usage percentage
   * @param memory_mb - Memory usage in MB
   * @param files_changed - Number of files changed
   * @param session_id - Session identifier
   * @returns ID of inserted record
   */
  insertProcessMetrics(
    timestamp: ISOTimestamp,
    agent_name: string,
    cpu_percent: number,
    memory_mb: number,
    files_changed: number,
    session_id: SessionID | null
  ): number {
    const stmt = this.prepareStatement(`
      INSERT INTO process_metrics (timestamp, agent_name, cpu_percent, memory_mb, files_changed, session_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      timestamp,
      agent_name,
      cpu_percent || 0,
      memory_mb || 0,
      files_changed || 0,
      session_id || null
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Insert system metrics (Raven metrics table)
   * @param timestamp - ISO timestamp
   * @param cpu - CPU usage percentage
   * @param mem - Memory usage percentage
   * @param disk - Disk usage percentage
   * @param network_in - Network input in bytes
   * @param network_out - Network output in bytes
   * @param active_watchers - Number of active file watchers
   * @param cached_files - Number of files in cache
   * @param session_id - Session identifier
   * @returns ID of inserted record
   */
  insertSystemMetrics(
    timestamp: ISOTimestamp,
    cpu: number,
    mem: number,
    disk: number,
    network_in: number,
    network_out: number,
    active_watchers: number,
    cached_files: number,
    session_id: SessionID | null
  ): number {
    const stmt = this.prepareStatement(`
      INSERT INTO raven_metrics (timestamp, cpu, mem, disk, network_in, network_out, active_watchers, cached_files, session_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      timestamp,
      cpu || 0,
      mem || 0,
      disk || 0,
      network_in || 0,
      network_out || 0,
      active_watchers || 0,
      cached_files || 0,
      session_id || null
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Get recent system metrics
   * @param limit - Maximum number of records
   * @returns Array of system metrics
   */
  getRecentSystemMetrics(limit: number = LIMITS.PAGINATION.DEFAULT_LIMIT): SystemMetrics[] {
    const stmt = this.prepareStatement(`
      SELECT id, timestamp, cpu, mem, disk, network_in, network_out,
             active_watchers, cached_files, session_id
      FROM raven_metrics
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(limit) as SystemMetrics[];
  }

  /**
   * Get recent process metrics
   * @param limit - Maximum number of records
   * @returns Array of process metrics
   */
  getRecentProcessMetrics(limit: number = LIMITS.PAGINATION.DEFAULT_LIMIT): ProcessMetrics[] {
    const stmt = this.prepareStatement(`
      SELECT id, timestamp, agent_name, cpu_percent, memory_mb, files_changed, session_id
      FROM process_metrics
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(limit) as ProcessMetrics[];
  }

  /**
   * Get process metrics by agent name
   * @param agent_name - Name of the agent
   * @param limit - Maximum number of records
   * @returns Process metrics for the agent
   */
  getProcessMetricsByAgent(
    agent_name: string,
    limit: number = LIMITS.PAGINATION.DEFAULT_LIMIT
  ): ProcessMetrics[] {
    const stmt = this.prepareStatement(`
      SELECT id, timestamp, agent_name, cpu_percent, memory_mb, files_changed, session_id
      FROM process_metrics
      WHERE agent_name = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(agent_name, limit) as ProcessMetrics[];
  }

  /**
   * Get system metrics by time range
   * @param startTime - ISO timestamp
   * @param endTime - ISO timestamp
   * @returns System metrics in time range
   */
  getSystemMetricsByTimeRange(startTime: ISOTimestamp, endTime: ISOTimestamp): SystemMetrics[] {
    const stmt = this.prepareStatement(`
      SELECT id, timestamp, cpu, mem, disk, network_in, network_out,
             active_watchers, cached_files, session_id
      FROM raven_metrics
      WHERE timestamp BETWEEN ? AND ?
      ORDER BY timestamp ASC
    `);

    return stmt.all(startTime, endTime) as SystemMetrics[];
  }

  /**
   * Get process metrics by time range
   * @param startTime - ISO timestamp
   * @param endTime - ISO timestamp
   * @param agent_name - Optional agent name filter
   * @returns Process metrics in time range
   */
  getProcessMetricsByTimeRange(
    startTime: ISOTimestamp,
    endTime: ISOTimestamp,
    agent_name: string | null = null
  ): ProcessMetrics[] {
    let query = `
      SELECT id, timestamp, agent_name, cpu_percent, memory_mb, files_changed, session_id
      FROM process_metrics
      WHERE timestamp BETWEEN ? AND ?
    `;
    const params: (ISOTimestamp | string)[] = [startTime, endTime];

    if (agent_name) {
      query += ` AND agent_name = ?`;
      params.push(agent_name);
    }

    query += ` ORDER BY timestamp ASC`;

    const stmt = this.prepareStatement(query);
    return stmt.all(...params) as ProcessMetrics[];
  }

  /**
   * Get average system metrics
   * @param startTime - Optional start time
   * @param endTime - Optional end time
   * @returns Average metrics
   */
  getAverageSystemMetrics(
    startTime: ISOTimestamp | null = null,
    endTime: ISOTimestamp | null = null
  ): AverageSystemMetrics {
    let query = `
      SELECT
        AVG(cpu) as avg_cpu,
        AVG(mem) as avg_mem,
        AVG(disk) as avg_disk,
        AVG(network_in) as avg_network_in,
        AVG(network_out) as avg_network_out,
        AVG(active_watchers) as avg_watchers,
        AVG(cached_files) as avg_cached_files,
        MAX(cpu) as max_cpu,
        MAX(mem) as max_mem
      FROM raven_metrics
    `;
    const params: ISOTimestamp[] = [];

    if (startTime && endTime) {
      query += ` WHERE timestamp BETWEEN ? AND ?`;
      params.push(startTime, endTime);
    }

    const stmt = this.prepareStatement(query);
    return stmt.get(...params) as AverageSystemMetrics;
  }

  /**
   * Get peak resource usage
   * @param limit - Number of peak entries to return
   * @returns Peak CPU and memory entries
   */
  getPeakResourceUsage(limit: number = 10): PeakResourceUsage {
    const cpuStmt = this.prepareStatement(`
      SELECT timestamp, cpu, mem, active_watchers
      FROM raven_metrics
      ORDER BY cpu DESC
      LIMIT ?
    `);

    const memStmt = this.prepareStatement(`
      SELECT timestamp, cpu, mem, cached_files
      FROM raven_metrics
      ORDER BY mem DESC
      LIMIT ?
    `);

    return {
      peakCpu: cpuStmt.all(limit) as Array<{
        timestamp: ISOTimestamp;
        cpu: number;
        mem: number;
        active_watchers: number;
      }>,
      peakMemory: memStmt.all(limit) as Array<{
        timestamp: ISOTimestamp;
        cpu: number;
        mem: number;
        cached_files: number;
      }>
    };
  }

  /**
   * Get metrics statistics
   * @returns Statistics about metrics
   */
  getMetricsStats(): MetricsStats {
    const systemStmt = this.prepareStatement(`
      SELECT COUNT(*) as total_records,
             MIN(timestamp) as first_record,
             MAX(timestamp) as last_record
      FROM raven_metrics
    `);

    const processStmt = this.prepareStatement(`
      SELECT COUNT(*) as total_records,
             COUNT(DISTINCT agent_name) as unique_agents,
             MIN(timestamp) as first_record,
             MAX(timestamp) as last_record
      FROM process_metrics
    `);

    return {
      systemMetrics: systemStmt.get() as {
        total_records: number;
        first_record: ISOTimestamp;
        last_record: ISOTimestamp;
      },
      processMetrics: processStmt.get() as {
        total_records: number;
        unique_agents: number;
        first_record: ISOTimestamp;
        last_record: ISOTimestamp;
      }
    };
  }

  /**
   * Delete system metrics before a certain date
   * @param beforeDate - ISO timestamp
   * @returns Number of deleted records
   */
  deleteSystemMetricsBeforeDate(beforeDate: ISOTimestamp): number {
    const stmt = this.prepareStatement(`DELETE FROM raven_metrics WHERE timestamp < ?`);
    const result = stmt.run(beforeDate);
    return result.changes;
  }

  /**
   * Delete process metrics before a certain date
   * @param beforeDate - ISO timestamp
   * @returns Number of deleted records
   */
  deleteProcessMetricsBeforeDate(beforeDate: ISOTimestamp): number {
    const stmt = this.prepareStatement(`DELETE FROM process_metrics WHERE timestamp < ?`);
    const result = stmt.run(beforeDate);
    return result.changes;
  }

  /**
   * Delete all system metrics (use with caution!)
   * @returns Number of deleted records
   */
  deleteAllSystemMetrics(): number {
    const stmt = this.prepareStatement(`DELETE FROM raven_metrics`);
    const result = stmt.run();
    logger.warn(`Deleted all system metrics (${result.changes} records)`);
    return result.changes;
  }

  /**
   * Delete all process metrics (use with caution!)
   * @returns Number of deleted records
   */
  deleteAllProcessMetrics(): number {
    const stmt = this.prepareStatement(`DELETE FROM process_metrics`);
    const result = stmt.run();
    logger.warn(`Deleted all process metrics (${result.changes} records)`);
    return result.changes;
  }

  /**
   * Get resource usage trends
   * @param hours - Number of hours to analyze
   * @returns Hourly averages
   */
  getResourceTrends(hours: number = 24): ResourceTrend[] {
    const cutoffDate = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const stmt = this.prepareStatement(`
      SELECT
        strftime('%Y-%m-%d %H:00:00', timestamp) as hour,
        AVG(cpu) as avg_cpu,
        AVG(mem) as avg_mem,
        MAX(cpu) as max_cpu,
        MAX(mem) as max_mem,
        COUNT(*) as sample_count
      FROM raven_metrics
      WHERE timestamp > ?
      GROUP BY hour
      ORDER BY hour ASC
    `);

    return stmt.all(cutoffDate) as ResourceTrend[];
  }
}
