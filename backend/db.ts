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

/**
 * File change event stored in database
 */
export interface FileEvent {
  id: number;
  timestamp: string;
  filepath: string;
  change_type: string;
  diff?: string;
  cpu: number;
  mem: number;
  session_id?: string;
  file_hash?: string;
  event_size?: number;
  project_name?: string;
}

/**
 * Agent telemetry event
 */
export interface AgentEvent {
  id: number;
  timestamp: string;
  agent: string;
  event_type: string;
  file?: string;
  lines_changed?: number;
  duration_ms?: number;
  message: string;
  metadata?: string;
  session_id?: string;
}

/**
 * System metrics snapshot
 */
export interface SystemMetrics {
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

/**
 * Process-level metrics
 */
export interface ProcessMetrics {
  id: number;
  timestamp: string;
  agent_name: string;
  pid: number;
  cpu_usage: number;
  memory_mb: number;
  virtual_memory_mb: number;
  disk_read_bytes?: number;
  disk_write_bytes?: number;
  status?: string;
  session_id?: string;
}

/**
 * Agent statistics aggregation
 */
export interface AgentStats {
  agent: string;
  event_count: number;
  avg_duration_ms: number | null;
  total_lines_changed: number | null;
}

/**
 * File modification statistics
 */
export interface FileStats {
  filepath: string;
  edit_count: number;
  total_lines_changed: number;
  last_modified: string;
}

/**
 * Metrics statistics over time range
 */
export interface MetricsStats {
  avg_cpu_percent: number;
  max_cpu_percent: number;
  avg_memory_percent: number;
  max_memory_percent: number;
  sample_count: number;
}

/**
 * Dashboard overview statistics
 */
export interface DashboardStats {
  total_events: number;
  total_files: number;
  total_agents: number;
  session_duration_seconds: number;
  active_files_today: number;
  creates: number;
  edits: number;
  deletes: number;
}

/**
 * Performance correlation data
 */
export interface PerformanceCorrelation {
  event_id: number;
  event_timestamp: string;
  agent: string;
  event_type: string;
  duration_ms: number | null;
  system_cpu_percent: number | null;
  system_memory_percent: number | null;
  process_cpu_percent: number | null;
  process_memory_mb: number | null;
}

/**
 * Syntax error detected in code
 */
export interface SyntaxErrorRecord {
  id: number;
  timestamp: string;
  filepath: string;
  line_number: number;
  column_number?: number;
  message: string;
  severity: string;
  language: string;
  resolved: number;
  session_id?: string;
}

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
    this.initializeSchema();
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
        project_name TEXT
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
        status TEXT,
        session_id TEXT
      )
    `);

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

    // ==================== Performance Indexes ====================
    // These indexes dramatically improve query performance as tables grow

    // Events table indexes (most frequently queried)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp DESC)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_events_session_id ON events(session_id)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_events_project_name ON events(project_name)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_events_change_type ON events(change_type)`);

    // Agent events indexes
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_agent_events_timestamp ON agent_events(timestamp DESC)`
    );
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_events_agent ON agent_events(agent)`);
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_agent_events_session_id ON agent_events(session_id)`
    );
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_events_type ON agent_events(event_type)`);

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

    // Test results indexes
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_test_results_timestamp ON test_results(timestamp DESC)`
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_test_results_framework ON test_results(framework)`
    );
  }

  // ==================== Agent Events ====================

  /**
   * Insert a new agent event into the database
   * @param timestamp - ISO timestamp of the event
   * @param agent - Agent name/identifier
   * @param event_type - Type of event (e.g., 'file-change', 'command')
   * @param file - Optional file path related to the event
   * @param lines_changed - Optional number of lines changed
   * @param duration_ms - Optional duration in milliseconds
   * @param message - Event message/description
   * @param metadata - Optional additional data as JSON
   * @param session_id - Optional session identifier
   * @param project_name - Optional project name
   * @returns The ID of the inserted event
   */
  insertAgentEvent(
    timestamp: string,
    agent: string,
    event_type: string,
    file: string | null | undefined,
    lines_changed: number | null | undefined,
    duration_ms: number | null | undefined,
    message: string,
    metadata: Record<string, any> | null | undefined,
    session_id: string | null | undefined,
    project_name: string | null | undefined
  ): number {
    const stmt = this.db.prepare(`
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

    return Number(result.lastInsertRowid);
  }

  getRecentAgentEvents(limit: number = 100): AgentEvent[] {
    const stmt = this.db.prepare(`
      SELECT id, timestamp, agent, event_type, file, lines_changed, duration_ms, message, metadata
      FROM agent_events
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(limit) as AgentEvent[];
  }

  getEventsByAgent(agent: string, limit: number = 100): AgentEvent[] {
    const stmt = this.db.prepare(`
      SELECT id, timestamp, agent, event_type, file, lines_changed, duration_ms, message, metadata
      FROM agent_events
      WHERE agent = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(agent, limit) as AgentEvent[];
  }

  /**
   * Get aggregated statistics for all agents
   * @returns Array of agent statistics including event counts and durations
   */
  getAgentStats(): AgentStats[] {
    const stmt = this.db.prepare(`
      SELECT
        agent,
        COUNT(*) as event_count,
        AVG(duration_ms) as avg_duration_ms,
        SUM(lines_changed) as total_lines_changed
      FROM agent_events
      GROUP BY agent
      ORDER BY event_count DESC
    `);

    return stmt.all() as AgentStats[];
  }

  // ==================== File Events ====================

  /**
   * Insert a new file change event into the database
   * @param timestamp - ISO timestamp of the file change
   * @param filepath - Path to the changed file
   * @param change_type - Type of change ('created', 'modified', 'deleted')
   * @param diff - Optional diff content
   * @param cpu - CPU usage percentage at time of event
   * @param mem - Memory usage percentage at time of event
   * @param session_id - Optional session identifier
   * @param file_hash - Optional file content hash
   * @param event_size - Optional size of the change in bytes
   * @param project_name - Optional project name
   * @returns The ID of the inserted event
   */
  insertEvent(
    timestamp: string,
    filepath: string,
    change_type: string,
    diff: string | null,
    cpu: number,
    mem: number,
    session_id: string | null | undefined,
    file_hash: string | null | undefined,
    event_size: number | null | undefined,
    project_name: string | null | undefined
  ): number {
    const stmt = this.db.prepare(`
      INSERT INTO events (timestamp, filepath, change_type, diff, cpu, mem, session_id, file_hash, event_size, project_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      timestamp,
      filepath,
      change_type,
      diff,
      cpu,
      mem,
      session_id || null,
      file_hash || null,
      event_size || null,
      project_name || null
    );

    return Number(result.lastInsertRowid);
  }

  getRecentFileEvents(limit: number = 100, includeDiff: boolean = false): FileEvent[] {
    const fields = includeDiff
      ? 'id, timestamp, filepath, change_type, event_size, file_hash, cpu, mem, diff, project_name'
      : 'id, timestamp, filepath, change_type, event_size, file_hash, cpu, mem, project_name';

    const stmt = this.db.prepare(`
      SELECT ${fields}
      FROM events
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(limit) as FileEvent[];
  }

  getEventsBySession(session_id: string): FileEvent[] {
    const stmt = this.db.prepare(`
      SELECT id, timestamp, filepath, change_type, diff, cpu, mem, project_name
      FROM events
      WHERE session_id = ?
      ORDER BY timestamp ASC
    `);

    return stmt.all(session_id) as FileEvent[];
  }

  getAgentEventsBySession(session_id: string): any[] {
    const stmt = this.db.prepare(`
      SELECT id, timestamp, agent, event_type as change_type, file as filepath, lines_changed, duration_ms, message
      FROM agent_events
      WHERE session_id = ?
      ORDER BY timestamp ASC
    `);

    return stmt.all(session_id);
  }

  getTrackedFiles(): string[] {
    const stmt = this.db.prepare(`
      SELECT DISTINCT filepath
      FROM events
      WHERE filepath IS NOT NULL
      ORDER BY filepath
    `);

    return (stmt.all() as { filepath: string }[]).map(row => row.filepath);
  }

  // ==================== System Metrics ====================

  insertSystemMetrics(
    timestamp: string,
    cpu_percent: number,
    memory_percent: number,
    memory_used_mb: number,
    memory_total_mb: number,
    network_rx_bytes: number | null | undefined,
    network_tx_bytes: number | null | undefined,
    session_id: string | null | undefined
  ): number {
    const stmt = this.db.prepare(`
      INSERT INTO raven_metrics (timestamp, cpu_percent, memory_percent, memory_used_mb, memory_total_mb, network_rx_bytes, network_tx_bytes, session_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
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
  }

  getRecentSystemMetrics(limit: number = 100): SystemMetrics[] {
    const stmt = this.db.prepare(`
      SELECT id, timestamp, cpu_percent, memory_percent, memory_used_mb, memory_total_mb, network_rx_bytes, network_tx_bytes
      FROM raven_metrics
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(limit) as SystemMetrics[];
  }

  /**
   * Get aggregated metrics statistics for a time range
   * @param start_time - ISO timestamp for range start
   * @param end_time - ISO timestamp for range end
   * @returns Metrics statistics including CPU/memory averages and maximums
   */
  getMetricsStats(start_time: string, end_time: string): MetricsStats {
    const stmt = this.db.prepare(`
      SELECT
        AVG(cpu_percent) as avg_cpu_percent,
        MAX(cpu_percent) as max_cpu_percent,
        AVG(memory_percent) as avg_memory_percent,
        MAX(memory_percent) as max_memory_percent,
        COUNT(*) as sample_count
      FROM raven_metrics
      WHERE timestamp BETWEEN ? AND ?
    `);

    const result = stmt.get(start_time, end_time) as MetricsStats | undefined;
    return (
      result || {
        avg_cpu_percent: 0,
        max_cpu_percent: 0,
        avg_memory_percent: 0,
        max_memory_percent: 0,
        sample_count: 0
      }
    );
  }

  // ==================== Process Metrics ====================

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
    session_id: string | null | undefined
  ): number {
    const stmt = this.db.prepare(`
      INSERT INTO process_metrics (timestamp, agent_name, pid, cpu_usage, memory_mb, virtual_memory_mb, disk_read_bytes, disk_write_bytes, status, session_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      timestamp,
      agent_name,
      pid,
      cpu_usage,
      memory_mb,
      virtual_memory_mb,
      disk_read_bytes || null,
      disk_write_bytes || null,
      status || null,
      session_id || null
    );

    return Number(result.lastInsertRowid);
  }

  getProcessMetricsByAgent(agent_name: string, limit: number = 100): ProcessMetrics[] {
    const stmt = this.db.prepare(`
      SELECT id, timestamp, agent_name, pid, cpu_usage, memory_mb, virtual_memory_mb, disk_read_bytes, disk_write_bytes, status
      FROM process_metrics
      WHERE agent_name = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(agent_name, limit) as ProcessMetrics[];
  }

  // ==================== Performance Correlations ====================

  correlateEventsWithMetrics(time_window_seconds: number = 5): PerformanceCorrelation[] {
    const stmt = this.db.prepare(`
      SELECT
        ae.id as event_id,
        ae.timestamp as event_timestamp,
        ae.agent,
        ae.event_type,
        ae.file as filepath,
        ae.event_type as change_type,
        ae.lines_changed as diff_size,
        ae.duration_ms,
        AVG(rm.cpu_percent) as cpu_percent,
        AVG(rm.memory_percent) as mem_percent
      FROM agent_events ae
      LEFT JOIN raven_metrics rm
        ON datetime(rm.timestamp) BETWEEN
           datetime(ae.timestamp) AND
           datetime(ae.timestamp, '+' || ? || ' seconds')
      WHERE ae.duration_ms IS NOT NULL
      GROUP BY ae.id, ae.timestamp, ae.agent, ae.event_type, ae.file, ae.lines_changed, ae.duration_ms
      ORDER BY ae.timestamp DESC
      LIMIT 20
    `);

    return stmt.all(time_window_seconds) as PerformanceCorrelation[];
  }

  // ==================== Dashboard Statistics ====================

  getTopModifiedFiles(session_id: string, limit: number = 10): FileStats[] {
    const events = this.getAgentEventsBySession(session_id);

    // Count edits per file
    const fileStats: Record<string, FileStats> = {};

    for (const event of events) {
      if (event.filepath) {
        if (!fileStats[event.filepath]) {
          fileStats[event.filepath] = {
            filepath: event.filepath,
            edit_count: 0,
            total_lines_changed: event.lines_changed || 0,
            last_modified: event.timestamp
          };
        }

        fileStats[event.filepath].edit_count++;
        fileStats[event.filepath].total_lines_changed += event.lines_changed || 0;

        // Update last modified
        if (event.timestamp > fileStats[event.filepath].last_modified) {
          fileStats[event.filepath].last_modified = event.timestamp;
        }
      }
    }

    // Convert to array and sort
    return Object.values(fileStats)
      .sort((a, b) => b.edit_count - a.edit_count)
      .slice(0, limit);
  }

  getLongestEdits(limit: number = 10): any[] {
    const stmt = this.db.prepare(`
      SELECT file as filepath, lines_changed, timestamp, agent
      FROM agent_events
      WHERE lines_changed IS NOT NULL
      ORDER BY lines_changed DESC
      LIMIT ?
    `);

    return stmt.all(limit);
  }

  /**
   * Get comprehensive dashboard statistics for a session
   * @param session_id - Session identifier to filter by
   * @returns Complete dashboard statistics including event counts, agent stats, and metrics
   */
  getDashboardStats(session_id: string): DashboardStats {
    // Get ALL historical events (not just current session)
    const agentEvents: any[] = this.db
      .prepare(`SELECT * FROM agent_events ORDER BY timestamp DESC`)
      .all();

    // Get ALL file events (from file watcher)
    const fileEvents: any[] = this.db.prepare(`SELECT * FROM events ORDER BY timestamp DESC`).all();

    // Combine all events
    const allEvents = [...agentEvents, ...fileEvents];

    // Get unique files from all events
    const trackedFiles = new Set<string>();
    for (const event of allEvents) {
      if (event.filepath) {
        trackedFiles.add(event.filepath);
      }
    }

    // Calculate session duration
    let session_duration_seconds = 0;
    if (allEvents.length > 0) {
      const timestamps = allEvents.map(e => new Date(e.timestamp).getTime()).filter(t => !isNaN(t));

      if (timestamps.length > 0) {
        const first = Math.min(...timestamps);
        const last = Math.max(...timestamps);
        session_duration_seconds = Math.floor((last - first) / 1000);
      }
    }

    // Count active files today
    const today = new Date().toISOString().split('T')[0];
    const activeToday = new Set<string>();

    for (const event of fileEvents) {
      const eventDate = event.timestamp.split('T')[0];
      if (eventDate === today && event.filepath) {
        activeToday.add(event.filepath);
      }
    }

    // Count event types for Activity Distribution chart
    const creates = fileEvents.filter(
      e => e.change_type === 'create' || e.change_type === 'add'
    ).length;
    const edits = fileEvents.filter(
      e => e.change_type === 'edit' || e.change_type === 'change'
    ).length;
    const deletes = fileEvents.filter(
      e => e.change_type === 'delete' || e.change_type === 'unlink'
    ).length;

    return {
      total_events: fileEvents.length, // Use file events for total count
      total_files: trackedFiles.size,
      total_agents: 0, // Will be updated by agent registry
      session_duration_seconds,
      active_files_today: activeToday.size,
      creates,
      edits,
      deletes
    };
  }

  // ==================== Syntax Errors ====================

  insertSyntaxError(
    timestamp: string,
    filepath: string,
    line_number: number,
    column_number: number | undefined,
    message: string,
    severity: string,
    language: string,
    session_id: string | undefined
  ): number {
    const stmt = this.db.prepare(`
      INSERT INTO syntax_errors (timestamp, filepath, line_number, column_number, message, severity, language, session_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      timestamp,
      filepath,
      line_number,
      column_number || null,
      message,
      severity,
      language,
      session_id || null
    );

    return result.lastInsertRowid as number;
  }

  getSyntaxErrors(limit: number = 100): SyntaxErrorRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM syntax_errors
      WHERE resolved = 0
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    return stmt.all(limit) as SyntaxErrorRecord[];
  }

  getSyntaxErrorsByFile(filepath: string): SyntaxErrorRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM syntax_errors
      WHERE filepath = ? AND resolved = 0
      ORDER BY timestamp DESC
    `);
    return stmt.all(filepath) as SyntaxErrorRecord[];
  }

  resolveSyntaxError(id: number): void {
    const stmt = this.db.prepare(`
      UPDATE syntax_errors
      SET resolved = 1
      WHERE id = ?
    `);
    stmt.run(id);
  }

  resolveSyntaxErrorsForRaven(): void {
    const stmt = this.db.prepare(`
      UPDATE syntax_errors
      SET resolved = 1
      WHERE resolved = 0
        AND (filepath LIKE '%raven/backend/%' OR filepath LIKE '%raven/frontend/%')
    `);
    const result = stmt.run();
    if (result.changes > 0) {
      logger.info(`Resolved ${result.changes} stale syntax error(s) for Raven's own files`);
    }
  }

  resolveSyntaxErrorsByFile(filepath: string): void {
    const stmt = this.db.prepare(`
      UPDATE syntax_errors
      SET resolved = 1
      WHERE filepath = ? AND resolved = 0
    `);
    stmt.run(filepath);
  }

  getUnresolvedSyntaxErrorCount(): number {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM syntax_errors
      WHERE resolved = 0
    `);
    const result = stmt.get() as { count: number };
    return result.count;
  }

  // ==================== Pattern Warnings ====================

  insertPatternWarning(
    timestamp: string,
    filepath: string,
    line_number: number,
    pattern_id: string,
    pattern_name: string,
    severity: string,
    category: string,
    message: string,
    match_text: string,
    context: string,
    session_id: string | undefined
  ): number {
    const stmt = this.db.prepare(`
      INSERT INTO pattern_warnings (timestamp, filepath, line_number, pattern_id, pattern_name, severity, category, match_text, context, session_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      timestamp,
      filepath,
      line_number,
      pattern_id,
      pattern_name,
      severity,
      category,
      match_text,
      context,
      session_id || null
    );

    return result.lastInsertRowid as number;
  }

  getPatternWarnings(limit: number = 100): any[] {
    const stmt = this.db.prepare(`
      SELECT * FROM pattern_warnings
      WHERE resolved = 0
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    return stmt.all(limit);
  }

  getPatternWarningsByCategory(category: string): any[] {
    const stmt = this.db.prepare(`
      SELECT * FROM pattern_warnings
      WHERE category = ? AND resolved = 0
      ORDER BY timestamp DESC
    `);
    return stmt.all(category);
  }

  resolvePatternWarning(id: number): void {
    const stmt = this.db.prepare(`
      UPDATE pattern_warnings
      SET resolved = 1
      WHERE id = ?
    `);
    stmt.run(id);
  }

  resolvePatternWarningsForRaven(): void {
    const stmt = this.db.prepare(`
      UPDATE pattern_warnings
      SET resolved = 1
      WHERE resolved = 0
        AND (filepath LIKE '%raven/backend/%' OR filepath LIKE '%raven/frontend/%')
    `);
    const result = stmt.run();
    if (result.changes > 0) {
      logger.info(`Resolved ${result.changes} stale pattern warning(s) for Raven's own files`);
    }
  }

  resolvePatternWarningsByFile(filepath: string): void {
    const stmt = this.db.prepare(`
      UPDATE pattern_warnings
      SET resolved = 1
      WHERE filepath = ? AND resolved = 0
    `);
    stmt.run(filepath);
  }

  // ==================== Test Results ====================

  insertTestResult(
    timestamp: string,
    framework: string,
    passed: boolean,
    totalTests: number,
    passedTests: number,
    failedTests: number,
    skippedTests: number,
    duration: number,
    output: string,
    failures: string,
    sessionId: string
  ): number {
    const stmt = this.db.prepare(`
      INSERT INTO test_results (timestamp, framework, passed, total_tests, passed_tests, failed_tests, skipped_tests, duration, output, failures, session_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      timestamp,
      framework,
      passed ? 1 : 0,
      totalTests,
      passedTests,
      failedTests,
      skippedTests,
      duration,
      output,
      failures,
      sessionId
    );

    return result.lastInsertRowid as number;
  }

  getTestResults(limit: number = 50): any[] {
    const stmt = this.db.prepare(`
      SELECT * FROM test_results
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    return stmt.all(limit);
  }

  getLatestTestResult(): any | null {
    const stmt = this.db.prepare(`
      SELECT * FROM test_results
      ORDER BY timestamp DESC
      LIMIT 1
    `);
    return stmt.get();
  }

  getTestResultsByFramework(framework: string, limit: number = 20): any[] {
    const stmt = this.db.prepare(`
      SELECT * FROM test_results
      WHERE framework = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    return stmt.all(framework, limit);
  }

  getFailedTestsCount(): number {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM test_results
      WHERE passed = 0
    `);
    const result = stmt.get() as { count: number };
    return result.count;
  }

  getUnresolvedPatternWarningCount(): number {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM pattern_warnings
      WHERE resolved = 0
    `);
    const result = stmt.get() as { count: number };
    return result.count;
  }

  /**
   * Close the database connection
   * Should be called during application shutdown to ensure data integrity
   */
  close(): void {
    this.db.close();
  }
}
