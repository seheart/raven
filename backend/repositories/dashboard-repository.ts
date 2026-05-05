/**
 * Dashboard Repository — aggregator queries for the overview page.
 *
 * Bundles queries that span multiple tables. Some of these will eventually
 * migrate to per-domain repositories; for now they live together so the
 * dashboard route stays clean.
 */

import type { RavenDB } from '../db.js';

interface DashboardCosts {
  total_requests: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_creation_tokens: number;
  total_cache_read_tokens: number;
  total_cost_usd: number;
}

export type TrendPeriod = 'hourly' | 'daily' | 'weekly';

interface MetricsDashboardSummary {
  total_events: number;
  events_by_type: { change_type: string; count: number }[];
  events_24h: number;
  active_projects: number;
  total_files: number;
  most_active_file: { filepath: string; count: number } | null;
  error_count: number;
  conversation_count: number;
  avg_events_per_day: number;
  busiest_hour: string;
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

export interface DashboardRepository {
  getLatestSystemMetrics(): unknown[];
  getRecentFileEvents(project: string | undefined, limit: number): unknown[];
  getCostsSince(timestampISO: string): DashboardCosts;
  getRecentSubagents(limit: number): unknown[];
  getRecentAgentEvents(limit: number): unknown[];
  getTopModifiedFiles(project: string | null, limit: number): unknown[];
  getHistoricalTrends(period: TrendPeriod, sinceISO: string): unknown[];

  /** Aggregated counters for /api/metrics/dashboard. */
  getMetricsDashboard(): MetricsDashboardSummary;
  /** Time-series rows from raven_metrics for /api/metrics/performance. */
  getPerformanceSeries(sinceISO: string): unknown[];

  /** Correlate recent file events with system metrics in ±N seconds windows. */
  correlateEventsWithMetrics(time_window_seconds?: number): PerformanceCorrelation[];
  /** Largest agent_events edits by lines_changed. */
  longestEdits(limit?: number): unknown[];
  /** Comprehensive dashboard stats for a session, optionally project-filtered. */
  dashboardStats(session_id: string, project?: string): DashboardStats;
}

export function createDashboardRepository(db: RavenDB): DashboardRepository {
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

  const longestEditsStmt = db.db.prepare(`
    SELECT file as filepath, lines_changed, timestamp, agent
    FROM agent_events
    WHERE lines_changed IS NOT NULL
    ORDER BY lines_changed DESC
    LIMIT ?
  `);

  const latestSystemMetricsStmt = db.db.prepare(
    `SELECT id, timestamp, cpu_percent, memory_percent, memory_used_mb, memory_total_mb,
            network_rx_bytes, network_tx_bytes
     FROM raven_metrics ORDER BY timestamp DESC LIMIT 1`
  );
  const recentFileEventsByProjectStmt = db.db.prepare(
    `SELECT id, timestamp, filepath, change_type, event_size, file_hash, cpu, mem,
            project_name, agent_source
     FROM events WHERE project_name = ? ORDER BY timestamp DESC LIMIT ?`
  );
  const recentFileEventsAllStmt = db.db.prepare(
    `SELECT id, timestamp, filepath, change_type, event_size, file_hash, cpu, mem,
            project_name, agent_source
     FROM events ORDER BY timestamp DESC LIMIT ?`
  );
  const costsSinceStmt = db.db.prepare(
    `SELECT COUNT(*) as total_requests,
            COALESCE(SUM(input_tokens), 0) as total_input_tokens,
            COALESCE(SUM(output_tokens), 0) as total_output_tokens,
            COALESCE(SUM(cache_creation_tokens), 0) as total_cache_creation_tokens,
            COALESCE(SUM(cache_read_tokens), 0) as total_cache_read_tokens,
            COALESCE(SUM(estimated_cost_usd), 0) as total_cost_usd
     FROM token_usage WHERE timestamp >= ?`
  );
  const recentSubagentsStmt = db.db.prepare(
    `SELECT * FROM subagent_tree ORDER BY started_at DESC LIMIT ?`
  );
  const recentAgentEventsStmt = db.db.prepare(
    `SELECT id, timestamp, agent, event_type, file, lines_changed, duration_ms, message, metadata
     FROM agent_events ORDER BY timestamp DESC LIMIT ?`
  );
  const topModifiedByProjectStmt = db.db.prepare(
    `SELECT filepath, COUNT(*) as edit_count, MAX(timestamp) as last_modified
     FROM events WHERE filepath IS NOT NULL AND project_name = ?
     GROUP BY filepath ORDER BY edit_count DESC LIMIT ?`
  );
  const topModifiedAllStmt = db.db.prepare(
    `SELECT filepath, COUNT(*) as edit_count, MAX(timestamp) as last_modified
     FROM events WHERE filepath IS NOT NULL
     GROUP BY filepath ORDER BY edit_count DESC LIMIT ?`
  );

  // Metrics dashboard summary statements
  const totalEventsStmt = db.db.prepare('SELECT COUNT(*) as count FROM events');
  const eventsByTypeStmt = db.db.prepare(
    `SELECT change_type, COUNT(*) as count FROM events GROUP BY change_type`
  );
  const events24hStmt = db.db.prepare(
    `SELECT COUNT(*) as count FROM events
     WHERE datetime(timestamp) >= datetime('now', '-24 hours')`
  );
  const activeProjectsStmt = db.db.prepare(
    `SELECT COUNT(DISTINCT project_name) as count FROM events
     WHERE project_name IS NOT NULL`
  );
  const totalFilesStmt = db.db.prepare('SELECT COUNT(DISTINCT filepath) as count FROM events');
  const mostActiveFileStmt = db.db.prepare(
    `SELECT filepath, COUNT(*) as count FROM events
     GROUP BY filepath ORDER BY count DESC LIMIT 1`
  );
  const avgPerDayStmt = db.db.prepare(
    `SELECT COUNT(*) / 7.0 as avg FROM events
     WHERE datetime(timestamp) >= datetime('now', '-7 days')`
  );
  const busiestHourStmt = db.db.prepare(
    `SELECT CAST(strftime('%H', timestamp) AS INTEGER) as hour, COUNT(*) as count
     FROM events GROUP BY hour ORDER BY count DESC LIMIT 1`
  );
  const performanceSeriesStmt = db.db.prepare(
    `SELECT timestamp, cpu_percent, memory_percent, memory_used_mb, memory_total_mb
     FROM raven_metrics
     WHERE timestamp >= ?
     ORDER BY timestamp ASC
     LIMIT 500`
  );

  return {
    getLatestSystemMetrics() {
      return latestSystemMetricsStmt.all();
    },

    getRecentFileEvents(project, limit) {
      return project
        ? recentFileEventsByProjectStmt.all(project, limit)
        : recentFileEventsAllStmt.all(limit);
    },

    getCostsSince(timestampISO) {
      const row = costsSinceStmt.get(timestampISO) as Partial<DashboardCosts> | undefined;
      return {
        total_requests: row?.total_requests ?? 0,
        total_input_tokens: row?.total_input_tokens ?? 0,
        total_output_tokens: row?.total_output_tokens ?? 0,
        total_cache_creation_tokens: row?.total_cache_creation_tokens ?? 0,
        total_cache_read_tokens: row?.total_cache_read_tokens ?? 0,
        total_cost_usd: row?.total_cost_usd ?? 0
      };
    },

    getRecentSubagents(limit) {
      return recentSubagentsStmt.all(limit);
    },

    getRecentAgentEvents(limit) {
      return recentAgentEventsStmt.all(limit);
    },

    getTopModifiedFiles(project, limit) {
      return project ? topModifiedByProjectStmt.all(project, limit) : topModifiedAllStmt.all(limit);
    },

    getMetricsDashboard() {
      const totalEvents = totalEventsStmt.get() as { count: number } | undefined;
      const eventsByType = eventsByTypeStmt.all() as { change_type: string; count: number }[];
      const events24h = events24hStmt.get() as { count: number } | undefined;
      let activeProjects = 1;
      try {
        const r = activeProjectsStmt.get() as { count: number } | undefined;
        activeProjects = (r?.count ?? 0) || 1;
      } catch {
        // project_name column missing in older DBs — leave default
      }
      const totalFiles = totalFilesStmt.get() as { count: number } | undefined;
      const mostActiveFile = mostActiveFileStmt.get() as
        | { filepath: string; count: number }
        | undefined;
      let errorCount = 0;
      try {
        const r = db.db.prepare('SELECT COUNT(*) as count FROM error_logs').get() as
          | { count: number }
          | undefined;
        errorCount = r?.count ?? 0;
      } catch {
        /* table missing */
      }
      let conversationCount = 0;
      try {
        const r = db.db.prepare('SELECT COUNT(*) as count FROM conversations').get() as
          | { count: number }
          | undefined;
        conversationCount = r?.count ?? 0;
      } catch {
        /* table missing */
      }
      const avgPerDay = avgPerDayStmt.get() as { avg: number } | undefined;
      const busiestHour = busiestHourStmt.get() as { hour: number; count: number } | undefined;

      return {
        total_events: totalEvents?.count ?? 0,
        events_by_type: eventsByType,
        events_24h: events24h?.count ?? 0,
        active_projects: activeProjects,
        total_files: totalFiles?.count ?? 0,
        most_active_file: mostActiveFile ?? null,
        error_count: errorCount,
        conversation_count: conversationCount,
        avg_events_per_day: Math.round(avgPerDay?.avg ?? 0),
        busiest_hour: busiestHour ? `${busiestHour.hour}:00` : 'N/A'
      };
    },

    getPerformanceSeries(sinceISO) {
      return performanceSeriesStmt.all(sinceISO);
    },

    getHistoricalTrends(period, sinceISO) {
      const groupBy =
        period === 'daily'
          ? "strftime('%Y-%m-%d', timestamp)"
          : period === 'weekly'
            ? "strftime('%Y-W%W', timestamp)"
            : "strftime('%Y-%m-%d %H:00:00', timestamp)";
      return db.db
        .prepare(
          `SELECT
             ${groupBy} as period,
             COUNT(*) as event_count,
             SUM(CASE WHEN change_type IN ('change', 'modified') THEN 1 ELSE 0 END) as modifications,
             SUM(CASE WHEN change_type = 'add' THEN 1 ELSE 0 END) as creations,
             SUM(CASE WHEN change_type = 'unlink' THEN 1 ELSE 0 END) as deletions,
             COUNT(DISTINCT filepath) as unique_files,
             COUNT(DISTINCT project_name) as active_projects
           FROM events
           WHERE timestamp >= ?
           GROUP BY period
           ORDER BY period ASC`
        )
        .all(sinceISO);
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
        .get(...params) as
        | {
            total_events: number;
            total_files: number;
            creates: number;
            edits: number;
            deletes: number;
          }
        | undefined;

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
