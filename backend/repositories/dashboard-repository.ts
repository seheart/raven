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
}

export function createDashboardRepository(db: RavenDB): DashboardRepository {
  return {
    getLatestSystemMetrics() {
      return db.db
        .prepare(
          `SELECT id, timestamp, cpu_percent, memory_percent, memory_used_mb, memory_total_mb,
                  network_rx_bytes, network_tx_bytes
           FROM raven_metrics ORDER BY timestamp DESC LIMIT 1`
        )
        .all();
    },

    getRecentFileEvents(project, limit) {
      const sql = project
        ? `SELECT id, timestamp, filepath, change_type, event_size, file_hash, cpu, mem,
                  project_name, agent_source
           FROM events WHERE project_name = ? ORDER BY timestamp DESC LIMIT ?`
        : `SELECT id, timestamp, filepath, change_type, event_size, file_hash, cpu, mem,
                  project_name, agent_source
           FROM events ORDER BY timestamp DESC LIMIT ?`;
      return project
        ? db.db.prepare(sql).all(project, limit)
        : db.db.prepare(sql).all(limit);
    },

    getCostsSince(timestampISO) {
      const row = db.db
        .prepare(
          `SELECT COUNT(*) as total_requests,
                  COALESCE(SUM(input_tokens), 0) as total_input_tokens,
                  COALESCE(SUM(output_tokens), 0) as total_output_tokens,
                  COALESCE(SUM(cache_creation_tokens), 0) as total_cache_creation_tokens,
                  COALESCE(SUM(cache_read_tokens), 0) as total_cache_read_tokens,
                  COALESCE(SUM(estimated_cost_usd), 0) as total_cost_usd
           FROM token_usage WHERE timestamp >= ?`
        )
        .get(timestampISO) as Partial<DashboardCosts> | undefined;
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
      return db.db
        .prepare(`SELECT * FROM subagent_tree ORDER BY started_at DESC LIMIT ?`)
        .all(limit);
    },

    getRecentAgentEvents(limit) {
      return db.db
        .prepare(
          `SELECT id, timestamp, agent, event_type, file, lines_changed, duration_ms, message, metadata
           FROM agent_events ORDER BY timestamp DESC LIMIT ?`
        )
        .all(limit);
    },

    getTopModifiedFiles(project, limit) {
      const sql = project
        ? `SELECT filepath, COUNT(*) as edit_count, MAX(timestamp) as last_modified
           FROM events WHERE filepath IS NOT NULL AND project_name = ?
           GROUP BY filepath ORDER BY edit_count DESC LIMIT ?`
        : `SELECT filepath, COUNT(*) as edit_count, MAX(timestamp) as last_modified
           FROM events WHERE filepath IS NOT NULL
           GROUP BY filepath ORDER BY edit_count DESC LIMIT ?`;
      return project
        ? db.db.prepare(sql).all(project, limit)
        : db.db.prepare(sql).all(limit);
    },

    getMetricsDashboard() {
      const totalEvents = db.db.prepare('SELECT COUNT(*) as count FROM events').get() as
        | { count: number }
        | undefined;
      const eventsByType = db.db
        .prepare(
          `SELECT change_type, COUNT(*) as count FROM events GROUP BY change_type`
        )
        .all() as { change_type: string; count: number }[];
      const events24h = db.db
        .prepare(
          `SELECT COUNT(*) as count FROM events
           WHERE datetime(timestamp) >= datetime('now', '-24 hours')`
        )
        .get() as { count: number } | undefined;
      let activeProjects = 1;
      try {
        const r = db.db
          .prepare(
            `SELECT COUNT(DISTINCT project_name) as count FROM events
             WHERE project_name IS NOT NULL`
          )
          .get() as { count: number } | undefined;
        activeProjects = (r?.count ?? 0) || 1;
      } catch {
        // project_name column missing in older DBs — leave default
      }
      const totalFiles = db.db
        .prepare('SELECT COUNT(DISTINCT filepath) as count FROM events')
        .get() as { count: number } | undefined;
      const mostActiveFile = db.db
        .prepare(
          `SELECT filepath, COUNT(*) as count FROM events
           GROUP BY filepath ORDER BY count DESC LIMIT 1`
        )
        .get() as { filepath: string; count: number } | undefined;
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
      const avgPerDay = db.db
        .prepare(
          `SELECT COUNT(*) / 7.0 as avg FROM events
           WHERE datetime(timestamp) >= datetime('now', '-7 days')`
        )
        .get() as { avg: number } | undefined;
      const busiestHour = db.db
        .prepare(
          `SELECT CAST(strftime('%H', timestamp) AS INTEGER) as hour, COUNT(*) as count
           FROM events GROUP BY hour ORDER BY count DESC LIMIT 1`
        )
        .get() as { hour: number; count: number } | undefined;

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
      return db.db
        .prepare(
          `SELECT timestamp, cpu_percent, memory_percent, memory_used_mb, memory_total_mb
           FROM raven_metrics
           WHERE timestamp >= ?
           ORDER BY timestamp ASC
           LIMIT 500`
        )
        .all(sinceISO);
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
    }
  };
}
