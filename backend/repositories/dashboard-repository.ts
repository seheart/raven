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

interface ProjectStatsRow {
  project_name: string;
  total_events: number;
  total_agent_events: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
  last_agent_seen_at: string | null;
}

interface ProjectCountRow {
  project_name: string | null;
  count: number;
}

interface DashboardStats {
  total_events: number;
  /** Lifetime per-project event count summed across all watched projects.
   *  Pulled from project_stats (trigger-maintained) so it survives the
   *  7-day retention purge that caps `total_events`. The header uses this
   *  as the headline number; the recent count rides as a subtitle. */
  lifetime_events: number;
  /** Lifetime agent event count, same source. */
  lifetime_agent_events: number;
  total_files: number;
  total_agents: number;
  session_duration_seconds: number;
  active_files_today: number;
  creates: number;
  edits: number;
  deletes: number;
  /** Today-scoped counts (since local midnight). Lifetime numbers above
   *  read like a never-resetting odometer; these are what the header
   *  strip's +/- styling actually wants to mean. */
  creates_today: number;
  edits_today: number;
  deletes_today: number;
  /** Rolling 14-day average of distinct files touched per active day,
   *  excluding today. The header strip uses this as the baseline so
   *  "121 files" gets framed as "1.4× usual" instead of standing
   *  alone with no reference point. Days with zero activity are
   *  excluded from the average so a weekend off doesn't drag the
   *  baseline to zero. */
  files_avg_14d: number;
  /** Total Claude API cost in USD since local midnight. Surfaced in the
   *  header strip when billing mode is 'api'; subscription users see
   *  a flat fee elsewhere so the dollar number would mislead. */
  cost_today_usd: number;
  /** ISO timestamp of the first agent_event today, or null if none yet.
   *  Used as the denominator for burn-rate ($/hr) — comparing cost to
   *  hours-since-midnight is misleading for anyone who didn't start
   *  working at midnight. Hours since the first event is the honest
   *  active-time window. */
  first_agent_event_today_at: string | null;
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

  // Multi-project health (/api/health/projects).
  /** Real projects from project_stats, newest activity first. */
  listProjectStats(): ProjectStatsRow[];
  /** Per-project file-event counts since the given ISO cutoff. */
  recentEventsByProject(sinceISO: string): ProjectCountRow[];
  /** Per-project agent-event counts since the given ISO cutoff. */
  recentAgentEventsByProject(sinceISO: string): ProjectCountRow[];
  /** Per-project syntax-error counts since the given ISO cutoff (project
   *  derived from the filepath leading-directory slug). */
  recentErrorsByProject(sinceISO: string): ProjectCountRow[];
  /** Lifetime per-project syntax-error counts (project derived from the
   *  filepath leading-directory slug). */
  totalErrorsByProject(): ProjectCountRow[];
}

export function createDashboardRepository(db: RavenDB): DashboardRepository {
  const recentEventsForCorrelationStmt = db.db.prepare(`
    SELECT id, timestamp, filepath, change_type, LENGTH(diff) as diff_size
    FROM events
    WHERE filepath IS NOT NULL
    ORDER BY timestamp DESC
    LIMIT 20
  `);

  // Per-event window query. Capped at 20 events; indexed range lookup keeps
  // each call ~50µs, so the surface N+1 is cheaper than a single full scan
  // with datetime() function calls (which disables the timestamp index).
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
  // Read from the trigger-maintained file_stats rollup so this query stays
  // O(K log N) (index seek + top-K) instead of degrading to a full-table
  // GROUP BY scan as the events table grows. Same return shape as the old
  // query — filepath/edit_count/last_modified — so callers don't change.
  // edit_count here is total_modifications (any change, not just edits),
  // which matches the pre-rollup semantics: it counted every row, not
  // just rows with change_type='edit'.
  const topModifiedByProjectStmt = db.db.prepare(
    `SELECT filepath, total_modifications as edit_count, last_modified
     FROM file_stats WHERE project_name = ?
     ORDER BY total_modifications DESC LIMIT ?`
  );
  const topModifiedAllStmt = db.db.prepare(
    `SELECT filepath, total_modifications as edit_count, last_modified
     FROM file_stats
     ORDER BY total_modifications DESC LIMIT ?`
  );

  // Metrics dashboard summary statements
  const totalEventsStmt = db.db.prepare('SELECT COUNT(*) as count FROM events');
  const eventsByTypeStmt = db.db.prepare(
    `SELECT change_type, COUNT(*) as count FROM events GROUP BY change_type`
  );
  // Bind ISO timestamp at call time so the timestamp index is used (the
  // previous `datetime(timestamp) >= datetime('now', ...)` form disabled it
  // by wrapping the column in a function call).
  const events24hStmt = db.db.prepare(
    `SELECT COUNT(*) as count FROM events
     WHERE timestamp >= ?`
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
  // Same index-friendly rewrite as events24hStmt — caller supplies ISO cutoff.
  const avgPerDayStmt = db.db.prepare(
    `SELECT COUNT(*) / 7.0 as avg FROM events
     WHERE timestamp >= ?`
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

  // Multi-project health statements (/api/health/projects).
  const projectStatsStmt = db.db.prepare(`
    SELECT project_name, total_events, total_agent_events,
           first_seen_at, last_seen_at, last_agent_seen_at
    FROM project_stats
    ORDER BY COALESCE(last_agent_seen_at, last_seen_at) DESC
  `);
  const recentEventsByProjectStmt = db.db.prepare(`
    SELECT project_name, COUNT(*) as count FROM events
    WHERE project_name IS NOT NULL AND timestamp >= ?
    GROUP BY project_name
  `);
  const recentAgentEventsByProjectStmt = db.db.prepare(`
    SELECT project_name, COUNT(*) as count FROM agent_events
    WHERE project_name IS NOT NULL AND timestamp >= ?
    GROUP BY project_name
  `);
  // syntax_errors has no project column — derive it from filepath prefix.
  // substr(filepath, 1, instr(filepath, '/') - 1) extracts the leading
  // directory slug, matching the LIKE 'project/%' convention.
  const recentErrorsByProjectStmt = db.db.prepare(`
    SELECT substr(filepath, 1, instr(filepath, '/') - 1) AS project_name,
           COUNT(*) as count
    FROM syntax_errors
    WHERE instr(filepath, '/') > 0 AND timestamp >= ?
    GROUP BY project_name
  `);
  const totalErrorsByProjectStmt = db.db.prepare(`
    SELECT substr(filepath, 1, instr(filepath, '/') - 1) AS project_name,
           COUNT(*) as count
    FROM syntax_errors
    WHERE instr(filepath, '/') > 0
    GROUP BY project_name
  `);

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
      const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      const events24h = events24hStmt.get(since24h) as { count: number } | undefined;
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
      const avgPerDay = avgPerDayStmt.get(since7d) as { avg: number } | undefined;
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

      // Lifetime event counters now read from the trigger-maintained
      // rollups (file_stats + event_type_stats) instead of a full-table
      // GROUP BY change_type on events. Same return shape, just O(K)
      // instead of O(rows). The unfiltered case fans out to two tiny
      // index-backed reads; the project-filtered case reads only the
      // rows for that project from file_stats.
      let eventStats:
        | {
            total_events: number;
            total_files: number;
            creates: number;
            edits: number;
            deletes: number;
          }
        | undefined;
      if (projectFilter) {
        // file_stats has per-file totals, so SUM across rows for this project
        // gives both file count (rows) and aggregate change-type counts.
        const row = db.db
          .prepare(
            `SELECT
               COALESCE(SUM(total_modifications), 0) AS total_events,
               COUNT(*) AS total_files,
               COALESCE(SUM(create_count), 0) AS creates,
               COALESCE(SUM(edit_count), 0) AS edits,
               COALESCE(SUM(delete_count), 0) AS deletes
             FROM file_stats WHERE project_name = ?`
          )
          .get(projectFilter) as
          | {
              total_events: number;
              total_files: number;
              creates: number;
              edits: number;
              deletes: number;
            }
          | undefined;
        eventStats = row;
      } else {
        // Unfiltered: total_events + per-change_type counts from
        // event_type_stats; total_files (distinct filepaths) from
        // file_stats row count.
        const typeRow = db.db
          .prepare(
            `SELECT
               COALESCE(SUM(count), 0) AS total_events,
               COALESCE(SUM(CASE WHEN change_type IN ('add','create') THEN count ELSE 0 END), 0) AS creates,
               COALESCE(SUM(CASE WHEN change_type IN ('change','edit','modified') THEN count ELSE 0 END), 0) AS edits,
               COALESCE(SUM(CASE WHEN change_type IN ('unlink','delete') THEN count ELSE 0 END), 0) AS deletes
             FROM event_type_stats`
          )
          .get() as
          | {
              total_events: number;
              creates: number;
              edits: number;
              deletes: number;
            }
          | undefined;
        const filesRow = db.db.prepare('SELECT COUNT(*) AS total_files FROM file_stats').get() as
          | { total_files: number }
          | undefined;
        eventStats = {
          total_events: typeRow?.total_events ?? 0,
          total_files: filesRow?.total_files ?? 0,
          creates: typeRow?.creates ?? 0,
          edits: typeRow?.edits ?? 0,
          deletes: typeRow?.deletes ?? 0
        };
      }

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
      const todayStart = today + 'T00:00:00';
      const activeTodaySql = projectFilter
        ? `SELECT COUNT(DISTINCT filepath) as count FROM events WHERE filepath IS NOT NULL AND timestamp >= ? AND project_name = ?`
        : `SELECT COUNT(DISTINCT filepath) as count FROM events WHERE filepath IS NOT NULL AND timestamp >= ?`;
      const activeTodayParams = projectFilter ? [todayStart, projectFilter] : [todayStart];
      const activeTodayRow = db.db.prepare(activeTodaySql).get(...activeTodayParams) as
        | { count: number }
        | undefined;

      // Today-scoped change-type counters. Mirrors the lifetime ones above
      // but with a timestamp filter so the header strip's +/- can mean
      // "today's net activity" instead of "lifetime odometer".
      const todayChangesSql = projectFilter
        ? `SELECT
             SUM(CASE WHEN change_type IN ('add','create') THEN 1 ELSE 0 END) as creates_today,
             SUM(CASE WHEN change_type IN ('change','edit','modified') THEN 1 ELSE 0 END) as edits_today,
             SUM(CASE WHEN change_type IN ('unlink','delete') THEN 1 ELSE 0 END) as deletes_today
           FROM events WHERE timestamp >= ? AND project_name = ?`
        : `SELECT
             SUM(CASE WHEN change_type IN ('add','create') THEN 1 ELSE 0 END) as creates_today,
             SUM(CASE WHEN change_type IN ('change','edit','modified') THEN 1 ELSE 0 END) as edits_today,
             SUM(CASE WHEN change_type IN ('unlink','delete') THEN 1 ELSE 0 END) as deletes_today
           FROM events WHERE timestamp >= ?`;
      const todayChangesParams = projectFilter ? [todayStart, projectFilter] : [todayStart];
      const todayChangesRow = db.db.prepare(todayChangesSql).get(...todayChangesParams) as
        | { creates_today: number; edits_today: number; deletes_today: number }
        | undefined;

      // 14-day baseline: average distinct files per active day, excluding
      // today. Active-day filter (HAVING count > 0 is implicit via GROUP BY)
      // means a weekend off doesn't drag the average to zero — the strip
      // compares like-for-like working days.
      const fourteenAgo = new Date();
      fourteenAgo.setDate(fourteenAgo.getDate() - 14);
      const fourteenAgoStart = fourteenAgo.toISOString().split('T')[0] + 'T00:00:00';
      const baselineSql = projectFilter
        ? `SELECT AVG(daily_files) as avg_files FROM (
             SELECT date(timestamp) as day, COUNT(DISTINCT filepath) as daily_files
             FROM events
             WHERE filepath IS NOT NULL
               AND timestamp >= ? AND timestamp < ?
               AND project_name = ?
             GROUP BY day
           )`
        : `SELECT AVG(daily_files) as avg_files FROM (
             SELECT date(timestamp) as day, COUNT(DISTINCT filepath) as daily_files
             FROM events
             WHERE filepath IS NOT NULL
               AND timestamp >= ? AND timestamp < ?
             GROUP BY day
           )`;
      const baselineParams = projectFilter
        ? [fourteenAgoStart, todayStart, projectFilter]
        : [fourteenAgoStart, todayStart];
      const baselineRow = db.db.prepare(baselineSql).get(...baselineParams) as
        | { avg_files: number | null }
        | undefined;

      // Cost today: SUM(estimated_cost_usd) since local midnight from
      // token_usage (same source as costsSinceStmt). Inlined so the
      // single dashboardStats() call is one round-trip from the header.
      const costTodayRow = db.db
        .prepare(
          `SELECT COALESCE(SUM(estimated_cost_usd), 0) as cost FROM token_usage WHERE timestamp >= ?`
        )
        .get(todayStart) as { cost: number } | undefined;

      // First agent event today — the honest start of "active time" for
      // burn-rate calculation. Null if you haven't done anything yet.
      const firstEventTodayRow = db.db
        .prepare(`SELECT MIN(timestamp) as first_at FROM agent_events WHERE timestamp >= ?`)
        .get(todayStart) as { first_at: string | null } | undefined;
      // session_id intentionally unused — current implementation aggregates
      // across the database; session-scoped stats land in dashboardRepo.
      void session_id;

      // Lifetime totals from project_stats — survives retention. Falls back
      // to 0 if the table is missing (very old DBs that haven't migrated).
      let lifetimeEvents = 0;
      let lifetimeAgentEvents = 0;
      try {
        const row = db.db
          .prepare(
            `SELECT COALESCE(SUM(total_events), 0) AS e,
                    COALESCE(SUM(total_agent_events), 0) AS a
               FROM project_stats`
          )
          .get() as { e: number; a: number } | undefined;
        lifetimeEvents = row?.e ?? 0;
        lifetimeAgentEvents = row?.a ?? 0;
      } catch {
        /* project_stats not yet created on first boot */
      }

      return {
        total_events: eventStats?.total_events || 0,
        lifetime_events: lifetimeEvents,
        lifetime_agent_events: lifetimeAgentEvents,
        total_files: eventStats?.total_files || 0,
        total_agents: 0, // Filled in by the route from agent registry
        session_duration_seconds,
        active_files_today: activeTodayRow?.count || 0,
        creates: eventStats?.creates || 0,
        edits: eventStats?.edits || 0,
        deletes: eventStats?.deletes || 0,
        creates_today: todayChangesRow?.creates_today || 0,
        edits_today: todayChangesRow?.edits_today || 0,
        deletes_today: todayChangesRow?.deletes_today || 0,
        files_avg_14d: baselineRow?.avg_files || 0,
        cost_today_usd: costTodayRow?.cost || 0,
        first_agent_event_today_at: firstEventTodayRow?.first_at || null,
        app_errors: 0 // Filled in by the route from errors repo
      };
    },

    listProjectStats() {
      return projectStatsStmt.all() as ProjectStatsRow[];
    },

    recentEventsByProject(sinceISO) {
      return recentEventsByProjectStmt.all(sinceISO) as ProjectCountRow[];
    },

    recentAgentEventsByProject(sinceISO) {
      return recentAgentEventsByProjectStmt.all(sinceISO) as ProjectCountRow[];
    },

    recentErrorsByProject(sinceISO) {
      return recentErrorsByProjectStmt.all(sinceISO) as ProjectCountRow[];
    },

    totalErrorsByProject() {
      return totalErrorsByProjectStmt.all() as ProjectCountRow[];
    }
  };
}
