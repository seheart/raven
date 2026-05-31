/**
 * RavenDB - SQLite database wrapper with full type safety
 *
 * Manages all database operations for Raven:
 * - File events (change tracking)
 * - Agent telemetry events
 * - System metrics (CPU, memory, network)
 * - Process metrics (per-agent)
 */

import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import { logger } from './utils/logger.js';

// ==================== Type Definitions ====================

// ==================== Database Class ====================

export class RavenDB {
  public db: Database.Database;

  constructor(dbPath: string) {
    // Ensure directory exists
    const dbDir = dirname(dbPath);
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL'); // Better performance
    this.db.pragma('busy_timeout = 5000'); // Wait up to 5s for locked database
    this.db.pragma('foreign_keys = ON'); // Required for ON DELETE CASCADE
    try {
      this.initializeSchema();
    } catch (err) {
      this.db.close();
      throw err;
    }
    logger.info(`✅ Database initialized at ${dbPath}`);
  }

  private initializeSchema(): void {
    // Events table (file changes)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        filepath TEXT,
        change_type TEXT,
        diff TEXT,
        cpu REAL,
        mem REAL,
        session_id TEXT,
        file_hash TEXT,
        event_size INTEGER,
        project_name TEXT,
        agent_source TEXT
      )
    `);
    // Safe migration for legacy DBs: agent_source was added to the canonical
    // schema later. New DBs already have it (CREATE TABLE above); old ones
    // need an ALTER. Done HERE — before file_stats triggers/backfill below
    // reference it — so a v0.4 → 0.5 upgrade doesn't crash on missing column.
    const eventsColsEarly = this.db.prepare(`PRAGMA table_info(events)`).all() as Array<{
      name: string;
    }>;
    if (!eventsColsEarly.some(c => c.name === 'agent_source')) {
      this.db.exec(`ALTER TABLE events ADD COLUMN agent_source TEXT`);
    }

    // Agent telemetry events table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        agent TEXT NOT NULL,
        event_type TEXT NOT NULL,
        file TEXT,
        lines_changed INTEGER,
        duration_ms INTEGER,
        message TEXT NOT NULL,
        metadata TEXT,
        session_id TEXT,
        project_name TEXT
      )
    `);

    // Migrate existing databases: add project_name if missing
    const agentEventCols = this.db.prepare('PRAGMA table_info(agent_events)').all() as Array<{
      name: string;
    }>;
    if (!agentEventCols.some(c => c.name === 'project_name')) {
      this.db.exec('ALTER TABLE agent_events ADD COLUMN project_name TEXT');
    }

    // Lifetime per-project counters. The events/agent_events tables are
    // retention-purged at 7 days, which made the projects-page "events"
    // column collapse to 0 for any project not touched recently. This table
    // is NOT retention-purged — it's an append-only counter kept current via
    // triggers so totals survive cleanup forever.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS project_stats (
        project_name TEXT PRIMARY KEY,
        total_events INTEGER NOT NULL DEFAULT 0,
        total_agent_events INTEGER NOT NULL DEFAULT 0,
        first_seen_at TEXT,
        last_seen_at TEXT,
        last_agent_seen_at TEXT
      )
    `);
    // Triggers fire atomically with the insert; no app code can forget to
    // bump counters. ON CONFLICT keeps the upsert single-statement.
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS bump_project_stats_events
      AFTER INSERT ON events
      WHEN NEW.project_name IS NOT NULL AND NEW.project_name != ''
      BEGIN
        INSERT INTO project_stats (project_name, total_events, first_seen_at, last_seen_at)
        VALUES (NEW.project_name, 1, NEW.timestamp, NEW.timestamp)
        ON CONFLICT(project_name) DO UPDATE SET
          total_events = total_events + 1,
          last_seen_at = NEW.timestamp,
          first_seen_at = COALESCE(first_seen_at, NEW.timestamp);
      END
    `);
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS bump_project_stats_agent_events
      AFTER INSERT ON agent_events
      WHEN NEW.project_name IS NOT NULL AND NEW.project_name != ''
      BEGIN
        INSERT INTO project_stats (project_name, total_agent_events, first_seen_at, last_agent_seen_at)
        VALUES (NEW.project_name, 1, NEW.timestamp, NEW.timestamp)
        ON CONFLICT(project_name) DO UPDATE SET
          total_agent_events = total_agent_events + 1,
          last_agent_seen_at = NEW.timestamp,
          first_seen_at = COALESCE(first_seen_at, NEW.timestamp);
      END
    `);
    // One-time backfill so projects with surviving (non-yet-purged) events
    // start with an honest baseline. INSERT OR IGNORE makes this safe to
    // run on every boot — once a row exists, the trigger owns it.
    const backfilled = this.db.prepare('SELECT COUNT(*) as n FROM project_stats').get() as {
      n: number;
    };
    if (backfilled.n === 0) {
      this.db.exec(`
        INSERT INTO project_stats (project_name, total_events, first_seen_at, last_seen_at)
        SELECT project_name, COUNT(*), MIN(timestamp), MAX(timestamp)
          FROM events
         WHERE project_name IS NOT NULL AND project_name != ''
         GROUP BY project_name
        ON CONFLICT(project_name) DO UPDATE SET
          total_events = excluded.total_events,
          first_seen_at = COALESCE(project_stats.first_seen_at, excluded.first_seen_at),
          last_seen_at = excluded.last_seen_at
      `);
      this.db.exec(`
        INSERT INTO project_stats (project_name, total_agent_events, first_seen_at, last_agent_seen_at)
        SELECT project_name, COUNT(*), MIN(timestamp), MAX(timestamp)
          FROM agent_events
         WHERE project_name IS NOT NULL AND project_name != ''
         GROUP BY project_name
        ON CONFLICT(project_name) DO UPDATE SET
          total_agent_events = excluded.total_agent_events,
          first_seen_at = COALESCE(project_stats.first_seen_at, excluded.first_seen_at),
          last_agent_seen_at = excluded.last_agent_seen_at
      `);
    }

    // Lifetime per-filepath rollup. Mirrors the columns topModifiedFiles
    // returns (plus a few we can use for cheap project-scoped filtering and
    // change-type breakdowns). Like project_stats, this table is NOT
    // retention-purged — once a file shows up, its lifetime counter stays
    // forever. The triggers below keep it current atomically with each
    // events INSERT so the read path is O(1) for top-K queries instead of
    // an O(rows) GROUP BY filepath scan.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS file_stats (
        filepath TEXT PRIMARY KEY,
        total_modifications INTEGER NOT NULL DEFAULT 0,
        last_modified TEXT,
        agent_source TEXT,
        project_name TEXT,
        create_count INTEGER NOT NULL DEFAULT 0,
        edit_count INTEGER NOT NULL DEFAULT 0,
        delete_count INTEGER NOT NULL DEFAULT 0
      )
    `);
    // Project-scoped top-K reads also benefit from an index, since the
    // by-project query is ORDER BY total_modifications DESC WHERE project_name = ?.
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_file_stats_project_mods ON file_stats(project_name, total_modifications DESC)`
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_file_stats_total_modifications ON file_stats(total_modifications DESC)`
    );

    // Lifetime per-change_type rollup powering dashboardStats.eventStats.
    // Same retention story — survives the 7-day events purge so the header
    // strip's lifetime odometer doesn't reset every week.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS event_type_stats (
        change_type TEXT PRIMARY KEY,
        count INTEGER NOT NULL DEFAULT 0
      )
    `);

    // Trigger: bump file_stats on every events INSERT with a filepath.
    // The CASE arithmetic mirrors the change_type buckets in the existing
    // dashboardStats query so creates/edits/deletes stay coherent with the
    // pre-rollup numbers.
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS bump_file_stats_events
      AFTER INSERT ON events
      WHEN NEW.filepath IS NOT NULL AND NEW.filepath != ''
      BEGIN
        INSERT INTO file_stats (
          filepath, total_modifications, last_modified, agent_source, project_name,
          create_count, edit_count, delete_count
        ) VALUES (
          NEW.filepath,
          1,
          NEW.timestamp,
          NEW.agent_source,
          NEW.project_name,
          CASE WHEN NEW.change_type IN ('add','create') THEN 1 ELSE 0 END,
          CASE WHEN NEW.change_type IN ('change','edit','modified') THEN 1 ELSE 0 END,
          CASE WHEN NEW.change_type IN ('unlink','delete') THEN 1 ELSE 0 END
        )
        ON CONFLICT(filepath) DO UPDATE SET
          total_modifications = total_modifications + 1,
          last_modified = NEW.timestamp,
          agent_source = COALESCE(NEW.agent_source, agent_source),
          project_name = COALESCE(NEW.project_name, project_name),
          create_count = create_count + CASE WHEN NEW.change_type IN ('add','create') THEN 1 ELSE 0 END,
          edit_count   = edit_count   + CASE WHEN NEW.change_type IN ('change','edit','modified') THEN 1 ELSE 0 END,
          delete_count = delete_count + CASE WHEN NEW.change_type IN ('unlink','delete') THEN 1 ELSE 0 END;
      END
    `);

    // Trigger: bump event_type_stats on every events INSERT with a change_type.
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS bump_event_type_stats_events
      AFTER INSERT ON events
      WHEN NEW.change_type IS NOT NULL AND NEW.change_type != ''
      BEGIN
        INSERT INTO event_type_stats (change_type, count)
        VALUES (NEW.change_type, 1)
        ON CONFLICT(change_type) DO UPDATE SET
          count = count + 1;
      END
    `);

    // One-time backfill so existing DBs see honest lifetime numbers on
    // first boot after the upgrade. Guarded by emptiness so we don't
    // double-count on subsequent boots (triggers own the rows from here on).
    const fileStatsCount = this.db.prepare('SELECT COUNT(*) as n FROM file_stats').get() as {
      n: number;
    };
    if (fileStatsCount.n === 0) {
      this.db.exec(`
        INSERT INTO file_stats (
          filepath, total_modifications, last_modified, agent_source, project_name,
          create_count, edit_count, delete_count
        )
        SELECT
          filepath,
          COUNT(*),
          MAX(timestamp),
          MAX(agent_source),
          MAX(project_name),
          SUM(CASE WHEN change_type IN ('add','create') THEN 1 ELSE 0 END),
          SUM(CASE WHEN change_type IN ('change','edit','modified') THEN 1 ELSE 0 END),
          SUM(CASE WHEN change_type IN ('unlink','delete') THEN 1 ELSE 0 END)
        FROM events
        WHERE filepath IS NOT NULL AND filepath != ''
        GROUP BY filepath
      `);
    }
    const eventTypeStatsCount = this.db
      .prepare('SELECT COUNT(*) as n FROM event_type_stats')
      .get() as { n: number };
    if (eventTypeStatsCount.n === 0) {
      this.db.exec(`
        INSERT INTO event_type_stats (change_type, count)
        SELECT change_type, COUNT(*) FROM events
        WHERE change_type IS NOT NULL AND change_type != ''
        GROUP BY change_type
      `);
    }

    // Performance metrics table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS raven_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        cpu_percent REAL NOT NULL,
        memory_percent REAL NOT NULL,
        memory_used_mb INTEGER NOT NULL,
        memory_total_mb INTEGER NOT NULL,
        network_rx_bytes INTEGER,
        network_tx_bytes INTEGER,
        session_id TEXT
      )
    `);

    // Process metrics table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS process_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        agent_name TEXT NOT NULL,
        pid INTEGER NOT NULL,
        cpu_usage REAL NOT NULL,
        memory_mb INTEGER NOT NULL,
        virtual_memory_mb INTEGER NOT NULL,
        disk_read_bytes INTEGER,
        disk_write_bytes INTEGER,
        network_connections INTEGER DEFAULT 0,
        api_connections INTEGER DEFAULT 0,
        thread_count INTEGER DEFAULT 0,
        fd_count INTEGER DEFAULT 0,
        activity_state TEXT DEFAULT 'unknown',
        status TEXT,
        session_id TEXT
      )
    `);

    // GPU metrics history (one snapshot per collection cycle, multi-GPU rows
    // share a timestamp). Only nvidia-smi is queried today. Retention is
    // managed by retention-cleanup like the other metrics tables.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS gpu_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        gpu_index INTEGER NOT NULL DEFAULT 0,
        name TEXT,
        vram_used_mib INTEGER,
        vram_total_mib INTEGER,
        vram_pct REAL,
        gpu_util_pct INTEGER,
        mem_util_pct INTEGER,
        temp_c INTEGER,
        power_draw_w REAL,
        power_limit_w REAL,
        session_id TEXT
      )
    `);
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_gpu_metrics_timestamp ON gpu_metrics(timestamp DESC)`
    );

    // Migrate existing databases: add network/activity columns to process_metrics
    const pmCols = this.db.prepare('PRAGMA table_info(process_metrics)').all() as Array<{
      name: string;
    }>;
    const pmColNames = new Set(pmCols.map(c => c.name));
    const newPmCols: Array<[string, string]> = [
      ['network_connections', 'INTEGER DEFAULT 0'],
      ['api_connections', 'INTEGER DEFAULT 0'],
      ['thread_count', 'INTEGER DEFAULT 0'],
      ['fd_count', 'INTEGER DEFAULT 0'],
      ['activity_state', "TEXT DEFAULT 'unknown'"]
    ];
    for (const [name, def] of newPmCols) {
      if (!pmColNames.has(name)) {
        this.db.exec(`ALTER TABLE process_metrics ADD COLUMN ${name} ${def}`);
      }
    }

    // API latency table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS api_latency (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        session_id TEXT,
        project_name TEXT,
        model TEXT,
        latency_ms INTEGER NOT NULL
      )
    `);
    this.db.exec(
      'CREATE INDEX IF NOT EXISTS idx_api_latency_timestamp ON api_latency(timestamp DESC)'
    );
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_api_latency_session ON api_latency(session_id)');

    // Syntax errors table. `project_name` is set at insert time from the
    // owning project (the watcher knows it) — earlier this table had no
    // project column, so the health page derived one from the filepath's
    // first segment, which yielded subdirectory names ('backend', 'src')
    // that matched no real project and reported 0 errors everywhere.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS syntax_errors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        filepath TEXT NOT NULL,
        line_number INTEGER NOT NULL,
        column_number INTEGER,
        message TEXT NOT NULL,
        severity TEXT NOT NULL,
        language TEXT NOT NULL,
        resolved INTEGER DEFAULT 0,
        session_id TEXT,
        project_name TEXT
      )
    `);

    // Migrate existing databases: add project_name if missing.
    const syntaxErrorCols = this.db.prepare('PRAGMA table_info(syntax_errors)').all() as Array<{
      name: string;
    }>;
    if (!syntaxErrorCols.some(c => c.name === 'project_name')) {
      this.db.exec('ALTER TABLE syntax_errors ADD COLUMN project_name TEXT');
    }

    // Pattern warnings table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pattern_warnings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        filepath TEXT NOT NULL,
        line_number INTEGER NOT NULL,
        pattern_id TEXT NOT NULL,
        pattern_name TEXT NOT NULL,
        severity TEXT NOT NULL,
        category TEXT NOT NULL,
        match_text TEXT NOT NULL,
        context TEXT NOT NULL,
        resolved INTEGER DEFAULT 0,
        session_id TEXT
      )
    `);

    // Pattern-warning ignores — durable false-positive suppressions, keyed by
    // (filepath, pattern_id, match_text). Consulted at detection time so a
    // dismissed warning does not return on the next file change.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pattern_warning_ignores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filepath TEXT NOT NULL,
        pattern_id TEXT NOT NULL,
        match_text TEXT NOT NULL,
        reason TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(filepath, pattern_id, match_text)
      )
    `);

    // Application error logs
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS app_errors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        error_type TEXT NOT NULL,
        message TEXT NOT NULL,
        stack TEXT,
        component TEXT,
        severity TEXT DEFAULT 'error',
        url TEXT,
        user_agent TEXT,
        metadata TEXT,
        resolved INTEGER DEFAULT 0
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_app_errors_timestamp ON app_errors(timestamp DESC)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_app_errors_resolved ON app_errors(resolved)
    `);

    // Test results table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS test_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        framework TEXT NOT NULL,
        passed INTEGER NOT NULL,
        total_tests INTEGER NOT NULL,
        passed_tests INTEGER NOT NULL,
        failed_tests INTEGER NOT NULL,
        skipped_tests INTEGER NOT NULL,
        duration INTEGER NOT NULL,
        output TEXT,
        failures TEXT,
        session_id TEXT
      )
    `);

    // Diff risk scores table (LLM-generated risk assessments for file changes)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS diff_risk_scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id INTEGER,
        filepath TEXT NOT NULL,
        score INTEGER NOT NULL,
        reason TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        model TEXT,
        session_id TEXT
      )
    `);

    // Insights table — local-LLM narrations + structured aggregates
    // (e.g. weekly digests). Owned canonically here so consumers like
    // digest-service can read it without depending on InsightsService
    // having booted first.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS insights (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        model TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        context_events INTEGER NOT NULL DEFAULT 0
      )
    `);
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_insights_type_ts ON insights(type, timestamp DESC)`
    );

    // Diff annotations — per-line risk findings tied to a specific file
    // event. Distinct from pattern_warnings (which can be raised anywhere)
    // because annotations are attached to a single diff and queried as a
    // unit with that diff. Source distinguishes detector origin.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS diff_annotations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id INTEGER NOT NULL,
        filepath TEXT NOT NULL,
        line_number INTEGER NOT NULL,
        severity TEXT NOT NULL,
        category TEXT NOT NULL,
        rule_id TEXT NOT NULL,
        rule_name TEXT NOT NULL,
        message TEXT NOT NULL,
        match_text TEXT,
        source TEXT NOT NULL DEFAULT 'pattern',
        timestamp TEXT NOT NULL
      )
    `);

    // Token usage tracking (Claude API costs)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS token_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        session_id TEXT NOT NULL,
        project_name TEXT,
        model TEXT NOT NULL,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        cache_creation_tokens INTEGER DEFAULT 0,
        cache_read_tokens INTEGER DEFAULT 0,
        estimated_cost_usd REAL DEFAULT 0,
        request_id TEXT,
        agent_id TEXT
      )
    `);

    // Sub-agent tree tracking
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS subagent_tree (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        parent_agent_id TEXT,
        agent_type TEXT,
        description TEXT,
        model TEXT,
        started_at TEXT,
        ended_at TEXT,
        total_input_tokens INTEGER DEFAULT 0,
        total_output_tokens INTEGER DEFAULT 0,
        estimated_cost_usd REAL DEFAULT 0,
        project_name TEXT,
        UNIQUE(session_id, agent_id)
      )
    `);

    // Self-analysis runs (code health checks)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS analysis_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'running',
        overall_score TEXT,
        duration_ms INTEGER,
        total_checks INTEGER DEFAULT 0,
        passed_checks INTEGER DEFAULT 0,
        warned_checks INTEGER DEFAULT 0,
        failed_checks INTEGER DEFAULT 0,
        session_id TEXT
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS analysis_checks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        status TEXT NOT NULL,
        duration_ms INTEGER,
        summary TEXT,
        output TEXT,
        FOREIGN KEY (run_id) REFERENCES analysis_runs(id) ON DELETE CASCADE
      )
    `);

    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_analysis_runs_timestamp ON analysis_runs(timestamp DESC)`
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_analysis_checks_run_id ON analysis_checks(run_id)`
    );

    // ==================== Performance Indexes ====================
    // These indexes dramatically improve query performance as tables grow

    // Events table indexes (most frequently queried)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp DESC)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_events_session_id ON events(session_id)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_events_project_name ON events(project_name)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_events_change_type ON events(change_type)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_events_filepath ON events(filepath)`);

    // (agent_source ALTER moved to the top of initializeSchema so file_stats
    // backfill above can reference the column safely.)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_events_agent_source ON events(agent_source)`);

    // Agent events indexes
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_agent_events_timestamp ON agent_events(timestamp DESC)`
    );
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_events_agent ON agent_events(agent)`);
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_agent_events_session_id ON agent_events(session_id)`
    );
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_events_type ON agent_events(event_type)`);
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_agent_events_session_file ON agent_events(session_id, file)`
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_agent_events_project_name ON agent_events(project_name)`
    );

    // Metrics table indexes
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_raven_metrics_timestamp ON raven_metrics(timestamp DESC)`
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_raven_metrics_session_id ON raven_metrics(session_id)`
    );

    // Process metrics indexes
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_process_metrics_timestamp ON process_metrics(timestamp DESC)`
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_process_metrics_agent ON process_metrics(agent_name)`
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_process_metrics_session_id ON process_metrics(session_id)`
    );

    // Syntax errors indexes
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_syntax_errors_timestamp ON syntax_errors(timestamp DESC)`
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_syntax_errors_filepath ON syntax_errors(filepath)`
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_syntax_errors_filepath_timestamp ON syntax_errors(filepath, timestamp DESC)`
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_syntax_errors_resolved ON syntax_errors(resolved)`
    );

    // Pattern warnings indexes
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_pattern_warnings_timestamp ON pattern_warnings(timestamp DESC)`
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_pattern_warnings_filepath ON pattern_warnings(filepath)`
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_pattern_warnings_resolved ON pattern_warnings(resolved)`
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_pattern_warnings_filepath_resolved ON pattern_warnings(filepath, resolved)`
    );

    // Test results indexes
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_test_results_timestamp ON test_results(timestamp DESC)`
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_test_results_framework ON test_results(framework)`
    );

    // Diff risk scores indexes
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_diff_risk_scores_timestamp ON diff_risk_scores(timestamp DESC)`
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_diff_risk_scores_filepath ON diff_risk_scores(filepath)`
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_diff_risk_scores_score ON diff_risk_scores(score DESC)`
    );

    // Diff annotations indexes
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_diff_annotations_event_id ON diff_annotations(event_id)`
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_diff_annotations_filepath ON diff_annotations(filepath)`
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_diff_annotations_severity ON diff_annotations(severity)`
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_diff_annotations_timestamp ON diff_annotations(timestamp DESC)`
    );

    // Token usage indexes
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_token_usage_timestamp ON token_usage(timestamp DESC)`
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_token_usage_session_id ON token_usage(session_id)`
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_token_usage_project_name ON token_usage(project_name)`
    );
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_token_usage_model ON token_usage(model)`);

    // Sub-agent tree indexes
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_subagent_tree_session_id ON subagent_tree(session_id)`
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_subagent_tree_agent_id ON subagent_tree(agent_id)`
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_subagent_tree_parent_agent_id ON subagent_tree(parent_agent_id)`
    );
  }

  close(): void {
    this.db.close();
  }
}
