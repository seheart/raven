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
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_gpu_metrics_timestamp ON gpu_metrics(timestamp DESC)`);

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

    // Syntax errors table
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
        session_id TEXT
      )
    `);

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

    // Safe migration: add agent_source column if it doesn't exist (PRAGMA-checked,
    // not try/catch — the latter masks unrelated SQL errors).
    const eventsCols = this.db.prepare(`PRAGMA table_info(events)`).all() as Array<{
      name: string;
    }>;
    if (!eventsCols.some(c => c.name === 'agent_source')) {
      this.db.exec(`ALTER TABLE events ADD COLUMN agent_source TEXT`);
    }
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
