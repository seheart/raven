/**
 * Metrics Repository — owns the runtime metrics tables:
 *  - `raven_metrics` (system-level CPU/mem/network)
 *  - `process_metrics` (per-agent process telemetry)
 *
 * Also owns a few cross-table aggregators that the dashboard pages depend on
 * (dashboard stats, top-modified files, longest edits, event ↔ metric
 * correlation). These all read from `events` + `agent_events` + `raven_metrics`,
 * so keeping them together avoids a tangle of repo-to-repo calls.
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

interface PerformanceCorrelation {
  event_id: number;
  event_timestamp: string;
  filepath: string;
  change_type: string;
  diff_size: number;
  cpu_percent: number;
  mem_percent: number;
}

interface FileStats {
  filepath: string;
  edit_count: number;
  total_lines_changed: number;
  last_modified: string;
}

interface DashboardStats {
  total_events: number;
  total_files: number;
  total_agents: number;
  session_duration_seconds: number;
  active_files_today: number;
  creates: number;
  edits: number;
  deletes: number;
  app_errors: number;
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

  /** Correlate recent file events with system metrics in ±N seconds windows. */
  correlateEventsWithMetrics(time_window_seconds?: number): PerformanceCorrelation[];

  /** Top files modified within a session, by edit count. */
  topModifiedFilesForSession(session_id: string, limit?: number): FileStats[];

  /** Largest agent_events edits by lines_changed. */
  longestEdits(limit?: number): unknown[];

  /** Comprehensive dashboard stats for a session, optionally project-filtered. */
  dashboardStats(session_id: string, project?: string): DashboardStats;
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

  const recentEventsForCorrelationStmt = db.db.prepare(`
    SELECT id, timestamp, filepath, change_type, LENGTH(diff) as diff_size
    FROM events
    WHERE filepath IS NOT NULL
    ORDER BY timestamp DESC
    LIMIT 20
  `);

  const correlationMetricStmt = db.db.prepare(`
    SELECT AVG(cpu_percent) as cpu_percent, AVG(memory_percent) as mem_percent
    FROM raven_metrics
    WHERE timestamp >= ? AND timestamp <= ?
  `);

  const topFilesForSessionStmt = db.db.prepare(`
    SELECT
      file as filepath,
      COUNT(*) as edit_count,
      COALESCE(SUM(lines_changed), 0) as total_lines_changed,
      MAX(timestamp) as last_modified
    FROM agent_events
    WHERE session_id = ? AND file IS NOT NULL
    GROUP BY file
    ORDER BY edit_count DESC
    LIMIT ?
  `);

  const longestEditsStmt = db.db.prepare(`
    SELECT file as filepath, lines_changed, timestamp, agent
    FROM agent_events
    WHERE lines_changed IS NOT NULL
    ORDER BY lines_changed DESC
    LIMIT ?
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
    },

    correlateEventsWithMetrics(time_window_seconds = 5) {
      const recentEvents = recentEventsForCorrelationStmt.all() as Array<{
        id: number;
        timestamp: string;
        filepath: string;
        change_type: string;
        diff_size: number | null;
      }>;
      if (recentEvents.length === 0) return [];

      const windowMs = time_window_seconds * 1000;
      const results: PerformanceCorrelation[] = [];
      for (const event of recentEvents) {
        const eventTime = new Date(event.timestamp).getTime();
        const lower = new Date(eventTime - windowMs).toISOString();
        const upper = new Date(eventTime + windowMs).toISOString();
        const metrics = correlationMetricStmt.get(lower, upper) as
          | { cpu_percent: number | null; mem_percent: number | null }
          | undefined;
        results.push({
          event_id: event.id,
          event_timestamp: event.timestamp,
          filepath: event.filepath,
          change_type: event.change_type,
          diff_size: event.diff_size || 0,
          cpu_percent: metrics?.cpu_percent || 0,
          mem_percent: metrics?.mem_percent || 0
        });
      }
      return results;
    },

    topModifiedFilesForSession(session_id, limit = 10) {
      return topFilesForSessionStmt.all(session_id, limit) as FileStats[];
    },

    longestEdits(limit = 10) {
      return longestEditsStmt.all(limit);
    },

    dashboardStats(session_id, project) {
      const projectFilter = project && project !== 'all' && project.trim() ? project : null;
      const whereClause = projectFilter ? 'WHERE project_name = ?' : '';
      const params = projectFilter ? [projectFilter] : [];

      const eventStats = db.db
        .prepare(
          `SELECT
            COUNT(*) as total_events,
            COUNT(DISTINCT filepath) as total_files,
            SUM(CASE WHEN change_type IN ('add','create') THEN 1 ELSE 0 END) as creates,
            SUM(CASE WHEN change_type IN ('change','edit','modified') THEN 1 ELSE 0 END) as edits,
            SUM(CASE WHEN change_type IN ('unlink','delete') THEN 1 ELSE 0 END) as deletes
          FROM events ${whereClause}`
        )
        .get(...params) as {
        total_events: number;
        total_files: number;
        creates: number;
        edits: number;
        deletes: number;
      } | undefined;

      const durationSql = projectFilter
        ? `SELECT MIN(ts) as first_ts, MAX(ts) as last_ts FROM (
            SELECT timestamp as ts FROM events WHERE project_name = ?
            UNION ALL
            SELECT timestamp as ts FROM agent_events WHERE project_name = ?
          )`
        : `SELECT MIN(ts) as first_ts, MAX(ts) as last_ts FROM (
            SELECT timestamp as ts FROM events
            UNION ALL
            SELECT timestamp as ts FROM agent_events
          )`;
      const durationParams = projectFilter ? [projectFilter, projectFilter] : [];
      const durationRow = db.db.prepare(durationSql).get(...durationParams) as
        | { first_ts: string | null; last_ts: string | null }
        | undefined;

      let session_duration_seconds = 0;
      if (durationRow?.first_ts && durationRow?.last_ts) {
        const first = new Date(durationRow.first_ts).getTime();
        const last = new Date(durationRow.last_ts).getTime();
        if (!isNaN(first) && !isNaN(last)) {
          session_duration_seconds = Math.floor((last - first) / 1000);
        }
      }

      const today = new Date().toISOString().split('T')[0];
      const activeTodaySql = projectFilter
        ? `SELECT COUNT(DISTINCT filepath) as count FROM events WHERE filepath IS NOT NULL AND timestamp >= ? AND project_name = ?`
        : `SELECT COUNT(DISTINCT filepath) as count FROM events WHERE filepath IS NOT NULL AND timestamp >= ?`;
      const activeTodayParams = projectFilter
        ? [today + 'T00:00:00', projectFilter]
        : [today + 'T00:00:00'];
      const activeTodayRow = db.db.prepare(activeTodaySql).get(...activeTodayParams) as
        | { count: number }
        | undefined;
      // session_id intentionally unused — current implementation aggregates
      // across the database; session-scoped stats land in dashboardRepo.
      void session_id;

      return {
        total_events: eventStats?.total_events || 0,
        total_files: eventStats?.total_files || 0,
        total_agents: 0, // Filled in by the route from agent registry
        session_duration_seconds,
        active_files_today: activeTodayRow?.count || 0,
        creates: eventStats?.creates || 0,
        edits: eventStats?.edits || 0,
        deletes: eventStats?.deletes || 0,
        app_errors: 0 // Filled in by the route from errors repo
      };
    }
  };
}
