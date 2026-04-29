/**
 * Metrics Repository — owns the runtime metrics tables:
 *  - `raven_metrics` (system-level CPU/mem/network)
 *  - `process_metrics` (per-agent process telemetry)
 */

import type { RavenDB } from '../db.js';

interface SystemMetricsRow {
  id: number;
  timestamp: string;
  cpu_percent: number;
  memory_percent: number;
  memory_used_mb: number;
  memory_total_mb: number;
  network_rx_bytes?: number;
  network_tx_bytes?: number;
  session_id?: string;
}

interface ProcessMetricsRow {
  id: number;
  timestamp: string;
  agent_name: string;
  pid: number;
  cpu_usage: number;
  memory_mb: number;
  virtual_memory_mb: number;
  disk_read_bytes?: number;
  disk_write_bytes?: number;
  network_connections?: number;
  api_connections?: number;
  thread_count?: number;
  fd_count?: number;
  activity_state?: string;
  status?: string;
  session_id?: string;
}

interface MetricsStatsRow {
  avg_cpu_percent: number;
  max_cpu_percent: number;
  avg_memory_percent: number;
  max_memory_percent: number;
  sample_count: number;
}

export interface MetricsRepository {
  insertSystemMetrics(
    timestamp: string,
    cpu_percent: number,
    memory_percent: number,
    memory_used_mb: number,
    memory_total_mb: number,
    network_rx_bytes: number | null | undefined,
    network_tx_bytes: number | null | undefined,
    session_id: string | null | undefined
  ): number;

  recentSystemMetrics(limit?: number): SystemMetricsRow[];

  /** Recent system metrics filtered by optional start/end timestamps. */
  systemMetricsInRange(
    start_time: string | undefined,
    end_time: string | undefined,
    limit: number
  ): SystemMetricsRow[];

  metricsStats(start_time: string, end_time: string): MetricsStatsRow;

  insertProcessMetrics(
    timestamp: string,
    agent_name: string,
    pid: number,
    cpu_usage: number,
    memory_mb: number,
    virtual_memory_mb: number,
    disk_read_bytes: number | null | undefined,
    disk_write_bytes: number | null | undefined,
    status: string | null | undefined,
    session_id: string | null | undefined,
    network_connections?: number,
    api_connections?: number,
    thread_count?: number,
    fd_count?: number,
    activity_state?: string
  ): number;

  processMetricsByAgent(agent_name: string, limit?: number): ProcessMetricsRow[];

  /** Latest process activity per tracked agent. */
  latestProcessActivity(): ProcessMetricsRow[];
}

export function createMetricsRepository(db: RavenDB): MetricsRepository {
  const insertSystemStmt = db.db.prepare(`
    INSERT INTO raven_metrics (timestamp, cpu_percent, memory_percent, memory_used_mb, memory_total_mb, network_rx_bytes, network_tx_bytes, session_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const recentSystemStmt = db.db.prepare(`
    SELECT id, timestamp, cpu_percent, memory_percent, memory_used_mb, memory_total_mb, network_rx_bytes, network_tx_bytes
    FROM raven_metrics
    ORDER BY timestamp DESC
    LIMIT ?
  `);

  const systemMetricsBothStmt = db.db.prepare(`
    SELECT id, timestamp, cpu_percent, memory_percent, memory_used_mb, memory_total_mb, network_rx_bytes, network_tx_bytes
    FROM raven_metrics
    WHERE timestamp BETWEEN ? AND ?
    ORDER BY timestamp DESC
    LIMIT ?
  `);

  const systemMetricsAfterStmt = db.db.prepare(`
    SELECT id, timestamp, cpu_percent, memory_percent, memory_used_mb, memory_total_mb, network_rx_bytes, network_tx_bytes
    FROM raven_metrics
    WHERE timestamp >= ?
    ORDER BY timestamp DESC
    LIMIT ?
  `);

  const systemMetricsBeforeStmt = db.db.prepare(`
    SELECT id, timestamp, cpu_percent, memory_percent, memory_used_mb, memory_total_mb, network_rx_bytes, network_tx_bytes
    FROM raven_metrics
    WHERE timestamp <= ?
    ORDER BY timestamp DESC
    LIMIT ?
  `);

  const metricsStatsStmt = db.db.prepare(`
    SELECT
      AVG(cpu_percent) as avg_cpu_percent,
      MAX(cpu_percent) as max_cpu_percent,
      AVG(memory_percent) as avg_memory_percent,
      MAX(memory_percent) as max_memory_percent,
      COUNT(*) as sample_count
    FROM raven_metrics
    WHERE timestamp BETWEEN ? AND ?
  `);

  const insertProcessStmt = db.db.prepare(`
    INSERT INTO process_metrics (timestamp, agent_name, pid, cpu_usage, memory_mb, virtual_memory_mb, disk_read_bytes, disk_write_bytes, status, session_id, network_connections, api_connections, thread_count, fd_count, activity_state)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const processByAgentStmt = db.db.prepare(`
    SELECT id, timestamp, agent_name, pid, cpu_usage, memory_mb, virtual_memory_mb, disk_read_bytes, disk_write_bytes, network_connections, api_connections, thread_count, fd_count, activity_state, status
    FROM process_metrics
    WHERE agent_name = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `);

  const latestProcessStmt = db.db.prepare(`
    SELECT pm.id, pm.timestamp, pm.agent_name, pm.pid, pm.cpu_usage, pm.memory_mb, pm.virtual_memory_mb,
           pm.network_connections, pm.api_connections, pm.thread_count, pm.fd_count, pm.activity_state, pm.status
    FROM process_metrics pm
    INNER JOIN (
      SELECT agent_name, MAX(timestamp) as max_ts
      FROM process_metrics
      GROUP BY agent_name
    ) latest ON pm.agent_name = latest.agent_name AND pm.timestamp = latest.max_ts
  `);

  return {
    insertSystemMetrics(timestamp, cpu_percent, memory_percent, memory_used_mb, memory_total_mb, network_rx_bytes, network_tx_bytes, session_id) {
      const result = insertSystemStmt.run(
        timestamp,
        cpu_percent,
        memory_percent,
        memory_used_mb,
        memory_total_mb,
        network_rx_bytes || null,
        network_tx_bytes || null,
        session_id || null
      );
      return Number(result.lastInsertRowid);
    },

    recentSystemMetrics(limit = 100) {
      return recentSystemStmt.all(limit) as SystemMetricsRow[];
    },

    systemMetricsInRange(start_time, end_time, limit) {
      if (start_time && end_time) {
        return systemMetricsBothStmt.all(start_time, end_time, limit) as SystemMetricsRow[];
      }
      if (start_time) return systemMetricsAfterStmt.all(start_time, limit) as SystemMetricsRow[];
      if (end_time) return systemMetricsBeforeStmt.all(end_time, limit) as SystemMetricsRow[];
      return recentSystemStmt.all(limit) as SystemMetricsRow[];
    },

    metricsStats(start_time, end_time) {
      const result = metricsStatsStmt.get(start_time, end_time) as MetricsStatsRow | undefined;
      return (
        result || {
          avg_cpu_percent: 0,
          max_cpu_percent: 0,
          avg_memory_percent: 0,
          max_memory_percent: 0,
          sample_count: 0
        }
      );
    },

    insertProcessMetrics(timestamp, agent_name, pid, cpu_usage, memory_mb, virtual_memory_mb, disk_read_bytes, disk_write_bytes, status, session_id, network_connections = 0, api_connections = 0, thread_count = 0, fd_count = 0, activity_state = 'unknown') {
      const result = insertProcessStmt.run(
        timestamp,
        agent_name,
        pid,
        cpu_usage,
        memory_mb,
        virtual_memory_mb,
        disk_read_bytes || null,
        disk_write_bytes || null,
        status || null,
        session_id || null,
        network_connections,
        api_connections,
        thread_count,
        fd_count,
        activity_state
      );
      return Number(result.lastInsertRowid);
    },

    processMetricsByAgent(agent_name, limit = 100) {
      return processByAgentStmt.all(agent_name, limit) as ProcessMetricsRow[];
    },

    latestProcessActivity() {
      return latestProcessStmt.all() as ProcessMetricsRow[];
    }
  };
}
