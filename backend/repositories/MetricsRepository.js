/**
 * MetricsRepository
 * Manages system and process metrics
 * Extracted from RavenDB for better separation of concerns
 */

import { logger } from '../utils/logger.js';
import { LIMITS } from '../config/constants.js';

export class MetricsRepository {
  /**
   * Create a MetricsRepository instance
   * @param {object} db - Database connection instance
   * @param {Function} prepareStatement - Function to prepare SQL statements
   */
  constructor(db, prepareStatement) {
    this.db = db;
    this.prepareStatement = prepareStatement;
  }

  /**
   * Insert process metrics
   * @param {string} timestamp - ISO timestamp
   * @param {string} agent_name - Name of the agent/process
   * @param {number} cpu_percent - CPU usage percentage
   * @param {number} memory_mb - Memory usage in MB
   * @param {number} files_changed - Number of files changed
   * @param {string|null} session_id - Session identifier
   * @returns {number} - ID of inserted record
   */
  insertProcessMetrics(timestamp, agent_name, cpu_percent, memory_mb, files_changed, session_id) {
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

    return result.lastInsertRowid;
  }

  /**
   * Insert system metrics (Raven metrics table)
   * @param {string} timestamp - ISO timestamp
   * @param {number} cpu - CPU usage percentage
   * @param {number} mem - Memory usage percentage
   * @param {number} disk - Disk usage percentage
   * @param {number} network_in - Network input in bytes
   * @param {number} network_out - Network output in bytes
   * @param {number} active_watchers - Number of active file watchers
   * @param {number} cached_files - Number of files in cache
   * @param {string|null} session_id - Session identifier
   * @returns {number} - ID of inserted record
   */
  insertSystemMetrics(
    timestamp,
    cpu,
    mem,
    disk,
    network_in,
    network_out,
    active_watchers,
    cached_files,
    session_id
  ) {
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

    return result.lastInsertRowid;
  }

  /**
   * Get recent system metrics
   * @param {number} limit - Maximum number of records
   * @returns {Array} - Array of system metrics
   */
  getRecentSystemMetrics(limit = LIMITS.PAGINATION.DEFAULT_LIMIT) {
    const stmt = this.prepareStatement(`
      SELECT id, timestamp, cpu, mem, disk, network_in, network_out,
             active_watchers, cached_files, session_id
      FROM raven_metrics
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(limit);
  }

  /**
   * Get recent process metrics
   * @param {number} limit - Maximum number of records
   * @returns {Array} - Array of process metrics
   */
  getRecentProcessMetrics(limit = LIMITS.PAGINATION.DEFAULT_LIMIT) {
    const stmt = this.prepareStatement(`
      SELECT id, timestamp, agent_name, cpu_percent, memory_mb, files_changed, session_id
      FROM process_metrics
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(limit);
  }

  /**
   * Get process metrics by agent name
   * @param {string} agent_name - Name of the agent
   * @param {number} limit - Maximum number of records
   * @returns {Array} - Process metrics for the agent
   */
  getProcessMetricsByAgent(agent_name, limit = LIMITS.PAGINATION.DEFAULT_LIMIT) {
    const stmt = this.prepareStatement(`
      SELECT id, timestamp, agent_name, cpu_percent, memory_mb, files_changed, session_id
      FROM process_metrics
      WHERE agent_name = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(agent_name, limit);
  }

  /**
   * Get system metrics by time range
   * @param {string} startTime - ISO timestamp
   * @param {string} endTime - ISO timestamp
   * @returns {Array} - System metrics in time range
   */
  getSystemMetricsByTimeRange(startTime, endTime) {
    const stmt = this.prepareStatement(`
      SELECT id, timestamp, cpu, mem, disk, network_in, network_out,
             active_watchers, cached_files, session_id
      FROM raven_metrics
      WHERE timestamp BETWEEN ? AND ?
      ORDER BY timestamp ASC
    `);

    return stmt.all(startTime, endTime);
  }

  /**
   * Get process metrics by time range
   * @param {string} startTime - ISO timestamp
   * @param {string} endTime - ISO timestamp
   * @param {string|null} agent_name - Optional agent name filter
   * @returns {Array} - Process metrics in time range
   */
  getProcessMetricsByTimeRange(startTime, endTime, agent_name = null) {
    let query = `
      SELECT id, timestamp, agent_name, cpu_percent, memory_mb, files_changed, session_id
      FROM process_metrics
      WHERE timestamp BETWEEN ? AND ?
    `;
    let params = [startTime, endTime];

    if (agent_name) {
      query += ' AND agent_name = ?';
      params.push(agent_name);
    }

    query += ' ORDER BY timestamp ASC';

    const stmt = this.prepareStatement(query);
    return stmt.all(...params);
  }

  /**
   * Get average system metrics
   * @param {string|null} startTime - Optional start time
   * @param {string|null} endTime - Optional end time
   * @returns {object} - Average metrics
   */
  getAverageSystemMetrics(startTime = null, endTime = null) {
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
    let params = [];

    if (startTime && endTime) {
      query += ' WHERE timestamp BETWEEN ? AND ?';
      params = [startTime, endTime];
    }

    const stmt = this.prepareStatement(query);
    return stmt.get(...params);
  }

  /**
   * Get peak resource usage
   * @param {number} limit - Number of peak entries to return
   * @returns {object} - Peak CPU and memory entries
   */
  getPeakResourceUsage(limit = 10) {
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
      peakCpu: cpuStmt.all(limit),
      peakMemory: memStmt.all(limit)
    };
  }

  /**
   * Get metrics statistics
   * @returns {object} - Statistics about metrics
   */
  getMetricsStats() {
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
      systemMetrics: systemStmt.get(),
      processMetrics: processStmt.get()
    };
  }

  /**
   * Delete system metrics before a certain date
   * @param {string} beforeDate - ISO timestamp
   * @returns {number} - Number of deleted records
   */
  deleteSystemMetricsBeforeDate(beforeDate) {
    const stmt = this.prepareStatement('DELETE FROM raven_metrics WHERE timestamp < ?');
    const result = stmt.run(beforeDate);
    return result.changes;
  }

  /**
   * Delete process metrics before a certain date
   * @param {string} beforeDate - ISO timestamp
   * @returns {number} - Number of deleted records
   */
  deleteProcessMetricsBeforeDate(beforeDate) {
    const stmt = this.prepareStatement('DELETE FROM process_metrics WHERE timestamp < ?');
    const result = stmt.run(beforeDate);
    return result.changes;
  }

  /**
   * Delete all system metrics (use with caution!)
   * @returns {number} - Number of deleted records
   */
  deleteAllSystemMetrics() {
    const stmt = this.prepareStatement('DELETE FROM raven_metrics');
    const result = stmt.run();
    logger.warn(`Deleted all system metrics (${result.changes} records)`);
    return result.changes;
  }

  /**
   * Delete all process metrics (use with caution!)
   * @returns {number} - Number of deleted records
   */
  deleteAllProcessMetrics() {
    const stmt = this.prepareStatement('DELETE FROM process_metrics');
    const result = stmt.run();
    logger.warn(`Deleted all process metrics (${result.changes} records)`);
    return result.changes;
  }

  /**
   * Get resource usage trends
   * @param {number} hours - Number of hours to analyze
   * @returns {Array} - Hourly averages
   */
  getResourceTrends(hours = 24) {
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

    return stmt.all(cutoffDate);
  }
}
