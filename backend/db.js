import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import { logger } from './utils/logger.js';
import { LIMITS } from './config/constants.js';
import { QueryBuilder, buildPaginatedTimeQuery } from './utils/query-builder.js';

/**
 * @typedef {Object} EventRecord
 * @property {number} [id] - Auto-generated ID
 * @property {string} timestamp - ISO timestamp
 * @property {string} filepath - Path to changed file
 * @property {string} change_type - Type of change (created, modified, deleted)
 * @property {string} [diff] - Diff content
 * @property {number} [cpu] - CPU usage at time of event
 * @property {number} [mem] - Memory usage at time of event
 * @property {string} [session_id] - Session identifier
 * @property {string} [file_hash] - Hash of file content
 * @property {number} [event_size] - Size of event data
 */

/**
 * @typedef {Object} AgentEvent
 * @property {number} [id] - Auto-generated ID
 * @property {string} timestamp - ISO timestamp
 * @property {string} agent - Agent name
 * @property {string} event_type - Type of event
 * @property {string} [file] - File path
 * @property {number} [lines_changed] - Number of lines changed
 * @property {number} [duration_ms] - Duration in milliseconds
 * @property {string} message - Event message
 * @property {string} [metadata] - JSON metadata
 * @property {string} [session_id] - Session identifier
 * @property {string} [project_name] - Project name
 */

/**
 * @typedef {Object} MetricRecord
 * @property {number} [id] - Auto-generated ID
 * @property {string} timestamp - ISO timestamp
 * @property {number} cpu_percent - CPU usage percentage
 * @property {number} memory_percent - Memory usage percentage
 * @property {number} memory_used_mb - Memory used in MB
 * @property {number} memory_total_mb - Total memory in MB
 * @property {number} [network_rx_bytes] - Network received bytes
 * @property {number} [network_tx_bytes] - Network transmitted bytes
 * @property {string} [session_id] - Session identifier
 */

/**
 * RavenDB - Main database class for Raven monitoring system
 * Manages SQLite database with WAL mode for better performance
 * Implements prepared statement caching for query optimization
 */
export class RavenDB {
  /**
   * Create a new RavenDB instance
   * @param {string} dbPath - Path to SQLite database file
   */
  constructor(dbPath) {
    // Ensure directory exists
    const dbDir = dirname(dbPath);
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL'); // Better performance

    // Prepared statement cache for better performance
    /** @type {Map<string, import('better-sqlite3').Statement>} */
    this.stmtCache = new Map();

    // Track database state and active statements
    this.closed = false;
    /** @type {Set<import('better-sqlite3').Statement>} */
    this.activeStatements = new Set();

    this.initializeSchema();
    logger.info('Database initialized', { dbPath });
  }

  /**
   * Get a cached prepared statement or create and cache it
   * @param {string} sql - SQL query string
   * @returns {Statement} Prepared statement with performance tracking
   */
  prepareStatement(sql) {
    // Check if database is closed
    if (this.closed) {
      throw new Error('Cannot prepare statement: Database is closed');
    }

    if (!this.stmtCache.has(sql)) {
      let stmt;
      try {
        stmt = this.db.prepare(sql);
      } catch (error) {
        // Check if database was closed during preparation
        if (this.closed) {
          throw new Error('Database closed during statement preparation');
        }
        // Re-throw original error if it's not due to closure
        throw error;
      }
      this.activeStatements.add(stmt);

      // Wrap statement methods with performance tracking
      const originalGet = stmt.get.bind(stmt);
      const originalAll = stmt.all.bind(stmt);
      const originalRun = stmt.run.bind(stmt);

      stmt.get = (...args) => {
        const startTime = performance.now();
        const result = originalGet(...args);
        const duration = performance.now() - startTime;

        if (duration > 100) {
          // Log queries slower than 100ms
          logger.warn('Slow query detected', {
            duration: `${duration.toFixed(2)}ms`,
            query: sql.substring(0, 100),
            method: 'get'
          });
        }

        return result;
      };

      stmt.all = (...args) => {
        const startTime = performance.now();
        const result = originalAll(...args);
        const duration = performance.now() - startTime;

        if (duration > 100) {
          logger.warn('Slow query detected', {
            duration: `${duration.toFixed(2)}ms`,
            query: sql.substring(0, 100),
            method: 'all',
            rows: result.length
          });
        }

        return result;
      };

      stmt.run = (...args) => {
        const startTime = performance.now();
        const result = originalRun(...args);
        const duration = performance.now() - startTime;

        if (duration > 100) {
          logger.warn('Slow query detected', {
            duration: `${duration.toFixed(2)}ms`,
            query: sql.substring(0, 100),
            method: 'run'
          });
        }

        return result;
      };

      this.stmtCache.set(sql, stmt);
    }
    return this.stmtCache.get(sql);
  }

  initializeSchema() {
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
        is_anomaly INTEGER DEFAULT 0,
        anomaly_score INTEGER,
        anomaly_confidence INTEGER,
        anomaly_reasons TEXT,
        risk_level TEXT,
        agent TEXT,
        agent_confidence INTEGER
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

    // Add project_name column to existing agent_events tables (migration)
    try {
      this.db.exec('ALTER TABLE agent_events ADD COLUMN project_name TEXT');
    } catch (err) {
      // Column already exists, ignore
    }

    // Add anomaly detection columns to existing events tables (migration)
    try {
      this.db.exec('ALTER TABLE events ADD COLUMN is_anomaly INTEGER DEFAULT 0');
    } catch (err) {
      // Column already exists, ignore
    }
    try {
      this.db.exec('ALTER TABLE events ADD COLUMN anomaly_score INTEGER');
    } catch (err) {
      // Column already exists, ignore
    }
    try {
      this.db.exec('ALTER TABLE events ADD COLUMN anomaly_confidence INTEGER');
    } catch (err) {
      // Column already exists, ignore
    }
    try {
      this.db.exec('ALTER TABLE events ADD COLUMN anomaly_reasons TEXT');
    } catch (err) {
      // Column already exists, ignore
    }
    try {
      this.db.exec('ALTER TABLE events ADD COLUMN risk_level TEXT');
    } catch (err) {
      // Column already exists, ignore
    }

    // Add agent detection columns to existing events tables (migration)
    try {
      this.db.exec('ALTER TABLE events ADD COLUMN agent TEXT');
    } catch (err) {
      // Column already exists, ignore
    }
    try {
      this.db.exec('ALTER TABLE events ADD COLUMN agent_confidence INTEGER');
    } catch (err) {
      // Column already exists, ignore
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

    // Error logs table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS error_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        error_type TEXT NOT NULL,
        message TEXT NOT NULL,
        stack TEXT,
        component TEXT,
        user_agent TEXT,
        url TEXT,
        metadata TEXT,
        session_id TEXT,
        severity TEXT DEFAULT 'error'
      )
    `);

    // Notifications table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        type TEXT NOT NULL,
        severity TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        read INTEGER DEFAULT 0,
        metadata TEXT,
        session_id TEXT
      )
    `);

    // Conversations table (Claude Code conversation tracking)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        claude_session_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        content TEXT,
        tool_name TEXT,
        tool_input TEXT,
        tool_output TEXT,
        is_error INTEGER DEFAULT 0,
        parent_uuid TEXT,
        metadata TEXT,
        project TEXT,
        session_id TEXT
      )
    `);

    // Sessions table for tracking development sessions
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_name TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT,
        changes_count INTEGER DEFAULT 0,
        rollbacks_count INTEGER DEFAULT 0,
        break_minutes INTEGER DEFAULT 0,
        quality_score REAL DEFAULT 100.0,
        session_id TEXT
      )
    `);

    // Syntax errors table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS syntax_errors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        filepath TEXT NOT NULL,
        language TEXT NOT NULL,
        severity TEXT DEFAULT 'error',
        message TEXT NOT NULL,
        line_number INTEGER,
        column_number INTEGER,
        code_snippet TEXT,
        project_name TEXT,
        resolved INTEGER DEFAULT 0,
        resolved_at TEXT,
        session_id TEXT
      )
    `);

    // Pattern warnings table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pattern_warnings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        filepath TEXT NOT NULL,
        project_name TEXT,
        category TEXT NOT NULL,
        severity TEXT DEFAULT 'warning',
        pattern_name TEXT NOT NULL,
        message TEXT NOT NULL,
        line_number INTEGER,
        match_text TEXT,
        context TEXT,
        suggestion TEXT,
        resolved INTEGER DEFAULT 0,
        resolved_at TEXT,
        session_id TEXT
      )
    `);

    // Test results table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS test_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        framework TEXT NOT NULL,
        test_file TEXT,
        test_name TEXT,
        status TEXT NOT NULL,
        duration_ms INTEGER,
        error_message TEXT,
        error_stack TEXT,
        session_id TEXT
      )
    `);

    // Create indexes for performance (prevents full table scans)
    this.db.exec(`
      -- Events table indexes
      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
      CREATE INDEX IF NOT EXISTS idx_events_filepath ON events(filepath);
      CREATE INDEX IF NOT EXISTS idx_events_change_type ON events(change_type);
      CREATE INDEX IF NOT EXISTS idx_events_is_anomaly ON events(is_anomaly);
      CREATE INDEX IF NOT EXISTS idx_events_risk_level ON events(risk_level);
      CREATE INDEX IF NOT EXISTS idx_events_agent ON events(agent);

      -- Agent events indexes
      CREATE INDEX IF NOT EXISTS idx_agent_events_timestamp ON agent_events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_agent_events_agent ON agent_events(agent);
      CREATE INDEX IF NOT EXISTS idx_agent_events_session ON agent_events(session_id);
      CREATE INDEX IF NOT EXISTS idx_agent_events_type ON agent_events(event_type);

      -- Raven metrics indexes
      CREATE INDEX IF NOT EXISTS idx_raven_metrics_timestamp ON raven_metrics(timestamp);
      CREATE INDEX IF NOT EXISTS idx_raven_metrics_session ON raven_metrics(session_id);

      -- Process metrics indexes
      CREATE INDEX IF NOT EXISTS idx_process_metrics_timestamp ON process_metrics(timestamp);
      CREATE INDEX IF NOT EXISTS idx_process_metrics_agent ON process_metrics(agent_name);
      CREATE INDEX IF NOT EXISTS idx_process_metrics_session ON process_metrics(session_id);

      -- Error logs indexes
      CREATE INDEX IF NOT EXISTS idx_error_logs_timestamp ON error_logs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_error_logs_severity ON error_logs(severity);
      CREATE INDEX IF NOT EXISTS idx_error_logs_session ON error_logs(session_id);

      -- Notifications indexes
      CREATE INDEX IF NOT EXISTS idx_notifications_timestamp ON notifications(timestamp);
      CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
      CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
      CREATE INDEX IF NOT EXISTS idx_notifications_severity ON notifications(severity);

      -- Conversations indexes
      CREATE INDEX IF NOT EXISTS idx_conversations_timestamp ON conversations(timestamp);
      CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(claude_session_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_type ON conversations(event_type);
      CREATE INDEX IF NOT EXISTS idx_conversations_project ON conversations(project);

      -- Syntax errors indexes
      CREATE INDEX IF NOT EXISTS idx_syntax_errors_timestamp ON syntax_errors(timestamp);
      CREATE INDEX IF NOT EXISTS idx_syntax_errors_filepath ON syntax_errors(filepath);
      CREATE INDEX IF NOT EXISTS idx_syntax_errors_resolved ON syntax_errors(resolved);
      CREATE INDEX IF NOT EXISTS idx_syntax_errors_session ON syntax_errors(session_id);

      -- Pattern warnings indexes
      CREATE INDEX IF NOT EXISTS idx_pattern_warnings_timestamp ON pattern_warnings(timestamp);
      CREATE INDEX IF NOT EXISTS idx_pattern_warnings_filepath ON pattern_warnings(filepath);
      CREATE INDEX IF NOT EXISTS idx_pattern_warnings_category ON pattern_warnings(category);
      CREATE INDEX IF NOT EXISTS idx_pattern_warnings_resolved ON pattern_warnings(resolved);
      CREATE INDEX IF NOT EXISTS idx_pattern_warnings_session ON pattern_warnings(session_id);
      CREATE INDEX IF NOT EXISTS idx_pattern_warnings_resolved_timestamp ON pattern_warnings(resolved, timestamp DESC);

      -- Test results indexes
      CREATE INDEX IF NOT EXISTS idx_test_results_timestamp ON test_results(timestamp);
      CREATE INDEX IF NOT EXISTS idx_test_results_framework ON test_results(framework);
      CREATE INDEX IF NOT EXISTS idx_test_results_status ON test_results(status);
      CREATE INDEX IF NOT EXISTS idx_test_results_session ON test_results(session_id);
    `);

    // Add WAL checkpoint management for better performance
    this.db.pragma('wal_autocheckpoint = 1000'); // Checkpoint every 1000 pages
  }

  // ==================== Agent Events ====================

  /**
   * Insert an agent event into the database
   * @param {string} timestamp - ISO timestamp of the event
   * @param {string} agent - Name of the agent (e.g., 'claude-code', 'copilot')
   * @param {string} event_type - Type of event (e.g., 'file_edit', 'command_run')
   * @param {string|null} file - File path associated with the event
   * @param {number|null} lines_changed - Number of lines changed
   * @param {number|null} duration_ms - Duration of the operation in milliseconds
   * @param {string} message - Human-readable message describing the event
   * @param {object|null} metadata - Additional metadata as JSON object
   * @param {string|null} session_id - Session identifier
   * @param {string|null} project_name - Name of the project
   * @returns {number} - ID of the inserted row
   */
  insertAgentEvent(
    timestamp,
    agent,
    event_type,
    file,
    lines_changed,
    duration_ms,
    message,
    metadata,
    session_id,
    project_name
  ) {
    const stmt = this.prepareStatement(`
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

    return result.lastInsertRowid;
  }

  getRecentAgentEvents(limit = 100) {
    const stmt = this.prepareStatement(`
      SELECT id, timestamp, agent, event_type, file, lines_changed, duration_ms, message,
             SUBSTR(metadata, 1, 200) as metadata, project_name
      FROM agent_events
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(limit);
  }

  getEventsByAgent(agent, limit = 100) {
    const stmt = this.prepareStatement(`
      SELECT id, timestamp, agent, event_type, file, lines_changed, duration_ms, message, metadata, project_name
      FROM agent_events
      WHERE agent = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(agent, limit);
  }

  getAgentStats(limit = 100) {
    const stmt = this.prepareStatement(`
      SELECT
        agent,
        COUNT(*) as event_count,
        AVG(duration_ms) as avg_duration_ms,
        MIN(duration_ms) as min_duration_ms,
        MAX(duration_ms) as max_duration_ms,
        SUM(lines_changed) as total_lines_changed,
        SUM(CASE WHEN event_type = 'create' THEN 1 ELSE 0 END) as create_count,
        SUM(CASE WHEN event_type = 'edit' THEN 1 ELSE 0 END) as edit_count,
        SUM(CASE WHEN event_type = 'delete' THEN 1 ELSE 0 END) as delete_count
      FROM agent_events
      GROUP BY agent
      ORDER BY event_count DESC
      LIMIT ?
    `);

    return stmt.all(limit);
  }

  getTopFilesByAgent(agent, limit = 5) {
    const stmt = this.prepareStatement(`
      SELECT
        file,
        COUNT(*) as edit_count,
        SUM(lines_changed) as total_lines
      FROM agent_events
      WHERE agent = ? AND file IS NOT NULL
      GROUP BY file
      ORDER BY edit_count DESC
      LIMIT ?
    `);

    return stmt.all(agent, limit);
  }

  // Get historical agents with last_seen and request counts (for agents panel)
  getHistoricalAgents(limit = 100) {
    const stmt = this.prepareStatement(`
      SELECT
        agent as agent_name,
        agent as agent_type,
        MAX(timestamp) as last_seen,
        COUNT(*) as requests_handled,
        0 as errors
      FROM agent_events
      GROUP BY agent
      ORDER BY last_seen DESC
      LIMIT ?
    `);

    return stmt.all(limit);
  }

  // ==================== File Events ====================

  insertEvent(timestamp, filepath, change_type, diff, cpu, mem, session_id, file_hash, event_size) {
    // Support object-style argument for tests and callers passing a single event object
    if (typeof timestamp === 'object' && timestamp !== null) {
      const event = timestamp;
      timestamp = event.timestamp || new Date().toISOString();
      filepath = event.filepath || event.file || '';
      change_type = event.change_type || event.event_type || '';
      diff = event.diff ?? null;
      cpu = event.cpu ?? null;
      mem = event.mem ?? null;
      session_id = event.session_id ?? null;
      file_hash = event.file_hash ?? null;
      event_size = event.event_size ?? event.lines_changed ?? 0;
    }
    const stmt = this.prepareStatement(`
      INSERT INTO events (timestamp, filepath, change_type, diff, cpu, mem, session_id, file_hash, event_size)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      timestamp,
      filepath,
      change_type,
      diff ?? null,
      cpu ?? null,
      mem ?? null,
      session_id ?? null,
      file_hash ?? null,
      event_size ?? 0
    );
    return result.lastInsertRowid;
  }

  getRecentFileEvents(limit = 100, includeDiff = false) {
    // Get events from file system watcher (events table)
    const fields = includeDiff
      ? 'id, timestamp, filepath, change_type, event_size, file_hash, cpu, mem, diff'
      : 'id, timestamp, filepath, change_type, event_size, file_hash, cpu, mem';

    const eventsStmt = this.db.prepare(`
      SELECT ${fields}
      FROM events
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    const fileEvents = eventsStmt.all(limit * 2); // Get more to ensure we have enough after merge

    // Get events from AI agents (agent_events table)
    // Map agent_events fields to match events table structure
    const agentEventsStmt = this.db.prepare(`
      SELECT
        id,
        timestamp,
        file as filepath,
        event_type as change_type,
        NULL as event_size,
        NULL as file_hash,
        NULL as cpu,
        NULL as mem,
        agent,
        lines_changed,
        duration_ms,
        message
      FROM agent_events
      WHERE event_type IN ('create', 'edit', 'delete')
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    const agentEvents = agentEventsStmt.all(limit * 2);

    // Merge both event sources
    const allEvents = [...fileEvents, ...agentEvents];

    // Sort by timestamp (newest first)
    allEvents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Return only the requested limit
    return allEvents.slice(0, limit);
  }

  // Backwards-compatibility for tests expecting this method name
  getRecentEvents(limit = 100) {
    return this.getRecentFileEvents(limit, false);
  }

  /**
   * Get total count of all events (file events + agent events)
   * @returns {number} Total count of events
   */
  getTotalEventCount() {
    try {
      // Count events from file system watcher
      const fileEventsCount = this.db
        .prepare(
          `
        SELECT COUNT(*) as count FROM events
      `
        )
        .get();

      // Count events from AI agents
      const agentEventsCount = this.db
        .prepare(
          `
        SELECT COUNT(*) as count FROM agent_events
        WHERE event_type IN ('create', 'edit', 'delete')
      `
        )
        .get();

      return (fileEventsCount.count || 0) + (agentEventsCount.count || 0);
    } catch (error) {
      // If there's an error (e.g., table doesn't exist), return 0
      return 0;
    }
  }

  /**
   * Get a single event by ID
   * @param {number} eventId - Event ID
   * @returns {object|null} Event object or null if not found
   */
  getEventById(eventId) {
    const stmt = this.db.prepare(`
      SELECT id, timestamp, filepath, change_type, event_size, file_hash, cpu, mem, diff, session_id
      FROM events
      WHERE id = ?
    `);

    return stmt.get(eventId);
  }

  getEventsBySession(session_id) {
    const stmt = this.prepareStatement(`
      SELECT id, timestamp, filepath, change_type, diff, cpu, mem
      FROM events
      WHERE session_id = ?
      ORDER BY timestamp ASC
    `);

    return stmt.all(session_id);
  }

  getAgentEventsBySession(session_id) {
    const stmt = this.prepareStatement(`
      SELECT id, timestamp, agent, event_type, file, lines_changed, duration_ms, message
      FROM agent_events
      WHERE session_id = ?
      ORDER BY timestamp ASC
    `);

    return stmt.all(session_id);
  }

  /**
   * Get tracked files with pagination support
   * @param {object} [options={}] - Pagination options
   * @param {number} [options.limit] - Maximum files to return
   * @param {string} [options.cursor] - Last filepath from previous page (for pagination)
   * @returns {object} Paginated result with files, hasMore, and nextCursor
   */
  getTrackedFiles(options = {}) {
    const { limit = LIMITS.DATABASE.DEFAULT_TRACKED_FILES_LIMIT, cursor = null } = options;

    // Fetch one extra to determine if more exist
    const fetchLimit = Math.min(limit + 1, LIMITS.DATABASE.MAX_QUERY_RESULTS);

    let query = `
      SELECT DISTINCT filepath
      FROM events
      WHERE filepath IS NOT NULL
    `;
    const params = [];

    if (cursor) {
      query += ' AND filepath > ?';
      params.push(cursor);
    }

    query += ' ORDER BY filepath LIMIT ?';
    params.push(fetchLimit);

    const stmt = this.prepareStatement(query);
    const results = stmt.all(...params);

    const hasMore = results.length > limit;
    const files = hasMore ? results.slice(0, limit) : results;

    return {
      files: files.map(row => row.filepath),
      hasMore,
      nextCursor: hasMore ? files[files.length - 1].filepath : null
    };
  }

  /**
   * Get complete history for a specific file
   * Combines events from both events table (file watcher) and agent_events table (AI agents)
   * @param {string} filepath - File path to get history for
   * @returns {Array} Array of events sorted by timestamp (newest first)
   */
  getFileHistory(filepath) {
    // Get file watcher events
    const fileEventsStmt = this.prepareStatement(`
      SELECT
        id,
        timestamp,
        filepath,
        change_type,
        event_size,
        file_hash,
        cpu,
        mem,
        diff,
        session_id
      FROM events
      WHERE filepath = ?
      ORDER BY timestamp DESC
    `);

    // Get agent events for this file
    const agentEventsStmt = this.prepareStatement(`
      SELECT
        id,
        timestamp,
        file as filepath,
        event_type as change_type,
        NULL as event_size,
        NULL as file_hash,
        NULL as cpu,
        NULL as mem,
        NULL as diff,
        session_id,
        agent,
        lines_changed,
        duration_ms,
        message
      FROM agent_events
      WHERE file = ? AND event_type IN ('create', 'edit', 'delete')
      ORDER BY timestamp DESC
    `);

    const fileEvents = fileEventsStmt.all(filepath);
    const agentEvents = agentEventsStmt.all(filepath);

    // Merge and sort by timestamp (newest first)
    const allEvents = [...fileEvents, ...agentEvents].sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
    );

    return allEvents;
  }

  // ==================== System Metrics ====================

  insertSystemMetrics(
    timestamp,
    cpu_percent,
    memory_percent,
    memory_used_mb,
    memory_total_mb,
    network_rx_bytes,
    network_tx_bytes,
    session_id
  ) {
    const stmt = this.prepareStatement(`
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

    return result.lastInsertRowid;
  }

  getRecentSystemMetrics(limit = 100) {
    const stmt = this.prepareStatement(`
      SELECT id, timestamp, cpu_percent, memory_percent, memory_used_mb, memory_total_mb, network_rx_bytes, network_tx_bytes
      FROM raven_metrics
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(limit);
  }

  getMetricsStats(start_time, end_time) {
    // Using QueryBuilder for consistent timestamp filtering
    const { query, params } = new QueryBuilder(`
      SELECT
        AVG(cpu_percent) as avg_cpu_percent,
        MAX(cpu_percent) as max_cpu_percent,
        AVG(memory_percent) as avg_memory_percent,
        MAX(memory_percent) as max_memory_percent,
        COUNT(*) as sample_count
      FROM raven_metrics
    `)
      .between('timestamp', start_time, end_time)
      .build();

    const stmt = this.prepareStatement(query);

    return (
      stmt.get(...params) || {
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
    timestamp,
    agent_name,
    pid,
    cpu_usage,
    memory_mb,
    virtual_memory_mb,
    disk_read_bytes,
    disk_write_bytes,
    status,
    session_id
  ) {
    const stmt = this.prepareStatement(`
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
      status,
      session_id || null
    );

    return result.lastInsertRowid;
  }

  getProcessMetricsByAgent(agent_name, limit = 100) {
    const stmt = this.prepareStatement(`
      SELECT id, timestamp, agent_name, pid, cpu_usage, memory_mb, virtual_memory_mb, disk_read_bytes, disk_write_bytes, status
      FROM process_metrics
      WHERE agent_name = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(agent_name, limit);
  }

  // ==================== Performance Correlations ====================

  correlateEventsWithMetrics(time_window_seconds = 5) {
    const stmt = this.prepareStatement(`
      SELECT
        ae.id as event_id,
        ae.timestamp as event_timestamp,
        ae.agent,
        ae.event_type as change_type,
        ae.file as filepath,
        ae.duration_ms,
        ae.lines_changed as diff_size,
        rm.cpu_percent as cpu_percent,
        rm.memory_percent as mem_percent,
        pm.cpu_usage as process_cpu_percent,
        pm.memory_mb as process_memory_mb
      FROM agent_events ae
      LEFT JOIN raven_metrics rm
        ON datetime(rm.timestamp) BETWEEN
           datetime(ae.timestamp) AND
           datetime(ae.timestamp, '+' || ? || ' seconds')
      LEFT JOIN process_metrics pm
        ON pm.agent_name = ae.agent
        AND datetime(pm.timestamp) BETWEEN
            datetime(ae.timestamp) AND
            datetime(ae.timestamp, '+' || ? || ' seconds')
      WHERE ae.duration_ms IS NOT NULL
      ORDER BY ae.timestamp DESC
      LIMIT 100
    `);

    return stmt.all(time_window_seconds, time_window_seconds);
  }

  // ==================== Dashboard Statistics ====================

  getTopModifiedFiles(_session_id = null, limit = 10) {
    // Optimized: Use SQL aggregation instead of loading all events into memory
    const stmt = this.prepareStatement(`
      SELECT
        file as filepath,
        COUNT(*) as edit_count,
        SUM(COALESCE(lines_changed, 0)) as total_lines_changed,
        MAX(timestamp) as last_modified
      FROM agent_events
      WHERE file IS NOT NULL
      GROUP BY file
      ORDER BY edit_count DESC
      LIMIT ?
    `);

    return stmt.all(limit);
  }

  getLongestEdits(limit = 10) {
    const stmt = this.prepareStatement(`
      SELECT file as filepath, lines_changed, timestamp, agent
      FROM agent_events
      WHERE lines_changed IS NOT NULL
      ORDER BY lines_changed DESC
      LIMIT ?
    `);

    return stmt.all(limit);
  }

  getDashboardStats(session_id = null) {
    // Use pure SQL aggregations for performance - no JavaScript loops
    const whereClause = session_id ? 'WHERE session_id = ?' : '';
    const params = session_id ? [session_id] : [];

    // Get stats with a single aggregation query
    const statsStmt = this.db.prepare(`
      SELECT
        COUNT(DISTINCT agent) as agent_count,
        COUNT(DISTINCT file) as file_count,
        MIN(timestamp) as first_timestamp,
        COUNT(*) as total_events
      FROM agent_events
      ${whereClause}
    `);
    const stats = params.length ? statsStmt.get(...params) : statsStmt.get();

    const total_agents = stats?.agent_count || 0;
    const trackedFilesCount = stats?.file_count || 0;

    // Calculate session duration (from first event to now)
    let session_duration_seconds = 0;
    if (stats?.first_timestamp) {
      const first = new Date(stats.first_timestamp);
      const now = new Date();
      session_duration_seconds = Math.floor((now - first) / 1000);
    }

    // Count active files today with SQL
    const today = new Date().toISOString().split('T')[0];

    const todayAgentFilesStmt = this.db.prepare(`
      SELECT COUNT(DISTINCT file) as count
      FROM agent_events
      WHERE SUBSTR(timestamp, 1, 10) = ?
        AND file IS NOT NULL
        ${session_id ? 'AND session_id = ?' : ''}
    `);
    const todayAgentFiles = session_id
      ? todayAgentFilesStmt.get(today, session_id)
      : todayAgentFilesStmt.get(today);

    let activeTodayCount = todayAgentFiles?.count || 0;

    // Also count files from file system events (events table)
    const todayEventsFilesStmt = this.db.prepare(`
      SELECT COUNT(DISTINCT filepath) as count
      FROM events
      WHERE SUBSTR(timestamp, 1, 10) = ?
        AND filepath IS NOT NULL
    `);
    const todayEventsFiles = todayEventsFilesStmt.get(today);
    activeTodayCount += todayEventsFiles?.count || 0;

    // Get breakdown from both file events and agent_events tables (filtered by session if provided)
    const eventWhereClause = session_id ? 'WHERE session_id = ?' : '';
    const breakdownStmt = this.db.prepare(`
      SELECT
        change_type,
        COUNT(*) as count
      FROM events
      ${eventWhereClause}
      GROUP BY change_type
    `);
    const breakdown = session_id ? breakdownStmt.all(session_id) : breakdownStmt.all();

    // Get breakdown from agent_events (map event types to match events table)
    const agentBreakdownWhere = session_id
      ? "WHERE session_id = ? AND event_type IN ('create', 'edit', 'delete')"
      : "WHERE event_type IN ('create', 'edit', 'delete')";
    const agentBreakdownStmt = this.db.prepare(`
      SELECT
        event_type,
        COUNT(*) as count
      FROM agent_events
      ${agentBreakdownWhere}
      GROUP BY event_type
    `);
    const agentBreakdown = session_id
      ? agentBreakdownStmt.all(session_id)
      : agentBreakdownStmt.all();

    // Build breakdown object, combining both sources
    let creates = breakdown.find(b => b.change_type === 'add')?.count || 0;
    let edits = breakdown.find(b => b.change_type === 'change')?.count || 0;
    let deletes = breakdown.find(b => b.change_type === 'unlink')?.count || 0;

    // Add agent_events counts (mapping event types)
    creates += agentBreakdown.find(b => b.event_type === 'create')?.count || 0;
    edits += agentBreakdown.find(b => b.event_type === 'edit')?.count || 0;
    deletes += agentBreakdown.find(b => b.event_type === 'delete')?.count || 0;

    const total_changes = creates + edits + deletes;

    // Get count of unique files modified (from both events and agent_events tables)
    // Use UNION to combine both tables and count distinct files in SQL
    let unique_files_modified = 0;
    if (session_id) {
      const uniqueFilesStmt = this.db.prepare(`
        SELECT COUNT(DISTINCT filepath) as count
        FROM (
          SELECT filepath FROM events WHERE session_id = ? AND filepath IS NOT NULL
          UNION
          SELECT file as filepath FROM agent_events WHERE session_id = ? AND file IS NOT NULL
        )
      `);
      const result = uniqueFilesStmt.get(session_id, session_id);
      unique_files_modified = result?.count || 0;
    } else {
      const uniqueFilesStmt = this.db.prepare(`
        SELECT COUNT(DISTINCT filepath) as count
        FROM (
          SELECT filepath FROM events WHERE filepath IS NOT NULL
          UNION
          SELECT file as filepath FROM agent_events WHERE file IS NOT NULL
        )
      `);
      const result = uniqueFilesStmt.get();
      unique_files_modified = result?.count || 0;
    }

    // Calculate total lines changed from agent_events
    const linesChangedStmt = this.db.prepare(`
      SELECT SUM(COALESCE(lines_changed, 0)) as total_lines_changed
      FROM agent_events
      ${whereClause}
    `);
    const linesChangedResult = session_id
      ? linesChangedStmt.get(session_id)
      : linesChangedStmt.get();
    const total_lines_changed = linesChangedResult?.total_lines_changed || 0;

    return {
      total_events: stats?.total_events || 0,
      total_files: trackedFilesCount,
      total_agents: total_agents,
      session_duration_seconds,
      active_files_today: activeTodayCount,
      total_changes,
      creates,
      edits,
      deletes,
      unique_files_modified,
      total_lines_changed
    };
  }

  // ==================== Error Logs ====================

  insertErrorLog(
    timestamp,
    error_type,
    message,
    stack,
    component,
    user_agent,
    url,
    metadata,
    session_id,
    severity = 'error'
  ) {
    const stmt = this.prepareStatement(`
      INSERT INTO error_logs (timestamp, error_type, message, stack, component, user_agent, url, metadata, session_id, severity)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      timestamp,
      error_type,
      message,
      stack || null,
      component || null,
      user_agent || null,
      url || null,
      metadata ? JSON.stringify(metadata) : null,
      session_id || null,
      severity
    );

    return result.lastInsertRowid;
  }

  getErrorLogs(options = {}) {
    const {
      limit = 100,
      offset = 0,
      search = '',
      severity = 'all',
      startDate = null,
      endDate = null
    } = options;

    let query = `
      SELECT id, timestamp, error_type, message, stack, component, user_agent, url, metadata, severity
      FROM error_logs
      WHERE 1=1
    `;
    const params = [];

    // Apply severity filter
    if (severity !== 'all') {
      query += ' AND severity = ?';
      params.push(severity);
    }

    // Apply search filter
    if (search) {
      query += ' AND (message LIKE ? OR error_type LIKE ? OR component LIKE ?)';
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    // Apply date range filter
    if (startDate) {
      query += ' AND timestamp >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND timestamp <= ?';
      params.push(endDate);
    }

    // Order by timestamp descending
    query += ' ORDER BY timestamp DESC';

    // Count total before pagination
    const countQuery = query.replace(
      'SELECT id, timestamp, error_type, message, stack, component, user_agent, url, metadata, severity',
      'SELECT COUNT(*) as count'
    );
    const totalCount = this.db.prepare(countQuery).get(...params)?.count || 0;

    // Apply pagination
    query += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = this.prepareStatement(query);
    const errors = stmt.all(...params);

    // Parse metadata JSON
    const parsedErrors = errors.map(err => ({
      ...err,
      metadata: err.metadata ? JSON.parse(err.metadata) : null
    }));

    return {
      errors: parsedErrors,
      total: totalCount,
      limit,
      offset,
      hasMore: offset + limit < totalCount
    };
  }

  getErrorStats() {
    const stmt = this.prepareStatement(`
      SELECT
        severity,
        COUNT(*) as count,
        MAX(timestamp) as last_occurrence
      FROM error_logs
      GROUP BY severity
    `);

    const stats = stmt.all();
    const total = stats.reduce((sum, s) => sum + s.count, 0);

    return {
      total,
      by_severity: stats,
      recent_count:
        this.db
          .prepare(
            `
        SELECT COUNT(*) as count
        FROM error_logs
        WHERE timestamp >= datetime('now', '-1 hour')
      `
          )
          .get()?.count || 0
    };
  }

  clearErrorLogs(olderThanDays = null) {
    let query = 'DELETE FROM error_logs';
    const params = [];

    if (olderThanDays) {
      query += " WHERE timestamp < datetime('now', '-' || ? || ' days')";
      params.push(olderThanDays);
    }

    const stmt = this.prepareStatement(query);
    const result = stmt.run(...params);
    return result.changes;
  }

  logError(errorLog) {
    const stmt = this.prepareStatement(`
      INSERT INTO error_logs (
        timestamp,
        error_type,
        message,
        stack,
        component,
        user_agent,
        url,
        metadata,
        severity
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      errorLog.timestamp || new Date().toISOString(),
      errorLog.error_type || 'Error',
      errorLog.message,
      errorLog.stack || null,
      errorLog.component || 'Unknown',
      errorLog.user_agent || null,
      errorLog.url || null,
      typeof errorLog.metadata === 'object' ? JSON.stringify(errorLog.metadata) : errorLog.metadata,
      errorLog.severity || 'error'
    );

    return {
      id: result.lastInsertRowid,
      ...errorLog
    };
  }

  // ==================== Unified Activity Log ====================

  /**
   * Get all activity from all tables in a unified format
   * Returns events sorted by timestamp with search and filter capabilities
   */
  getActivityLog(options = {}) {
    const {
      limit = 100, // Reduced from 500 for performance
      offset = 0,
      search = '',
      eventType = 'all', // all, file, agent, system
      startDate = null,
      endDate = null
    } = options;

    // Build WHERE clauses for filtering (applied in SQL for performance)
    const whereConditions = [];
    const params = [];

    if (search) {
      // Search will be applied per-query type since fields differ
      whereConditions.push('search');
      params.push(`%${search}%`);
    }
    if (startDate) {
      whereConditions.push('startDate');
      params.push(startDate);
    }
    if (endDate) {
      whereConditions.push('endDate');
      params.push(endDate);
    }

    // Build UNION query combining all event types with SQL-based filtering
    const queries = [];

    // File events
    if (eventType === 'all' || eventType === 'file') {
      let fileQuery = `
        SELECT
          id,
          timestamp,
          'file' as category,
          change_type as type,
          filepath as target,
          'File ' || change_type || ': ' || filepath as description,
          event_size as size,
          file_hash as hash,
          cpu,
          mem,
          NULL as diff,
          session_id,
          NULL as file,
          NULL as lines_changed,
          NULL as duration_ms,
          NULL as message,
          NULL as metadata_json,
          NULL as cpu_percent,
          NULL as memory_percent,
          NULL as memory_used_mb
        FROM events
        WHERE 1=1
      `;
      if (search) fileQuery += ' AND (filepath LIKE ? OR change_type LIKE ?)';
      if (startDate) fileQuery += ' AND timestamp >= ?';
      if (endDate) fileQuery += ' AND timestamp <= ?';
      queries.push(fileQuery);
    }

    // Agent events
    if (eventType === 'all' || eventType === 'agent') {
      let agentQuery = `
        SELECT
          id,
          timestamp,
          'agent' as category,
          event_type as type,
          agent as target,
          COALESCE(message, agent || ' - ' || event_type) as description,
          NULL as size,
          NULL as hash,
          NULL as cpu,
          NULL as mem,
          NULL as diff,
          session_id,
          file,
          lines_changed,
          duration_ms,
          message,
          SUBSTR(metadata, 1, 200) as metadata_json,
          NULL as cpu_percent,
          NULL as memory_percent,
          NULL as memory_used_mb
        FROM agent_events
        WHERE 1=1
      `;
      if (search) agentQuery += ' AND (message LIKE ? OR agent LIKE ? OR event_type LIKE ?)';
      if (startDate) agentQuery += ' AND timestamp >= ?';
      if (endDate) agentQuery += ' AND timestamp <= ?';
      queries.push(agentQuery);
    }

    // System metrics (limited sample)
    if (eventType === 'all' || eventType === 'system') {
      let systemQuery = `
        SELECT
          id,
          timestamp,
          'system' as category,
          'metrics' as type,
          'System' as target,
          'System Metrics: CPU ' || ROUND(cpu_percent, 1) || '%, Memory ' || ROUND(memory_percent, 1) || '%' as description,
          NULL as size,
          NULL as hash,
          NULL as cpu,
          NULL as mem,
          NULL as diff,
          session_id,
          NULL as file,
          NULL as lines_changed,
          NULL as duration_ms,
          NULL as message,
          NULL as metadata_json,
          cpu_percent,
          memory_percent,
          memory_used_mb
        FROM raven_metrics
        WHERE 1=1
      `;
      if (search) systemQuery += " AND ('System' LIKE ? OR 'metrics' LIKE ?)";
      if (startDate) systemQuery += ' AND timestamp >= ?';
      if (endDate) systemQuery += ' AND timestamp <= ?';
      queries.push(systemQuery);
    }

    // Combine queries with UNION ALL and apply ORDER BY, LIMIT, OFFSET at the end
    const unionQuery = `
      WITH combined AS (
        ${queries.join(' UNION ALL ')}
      )
      SELECT * FROM combined
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `;

    // Build parameter array (search params repeated for each query type, then limit/offset)
    const queryParams = [];

    // For file events
    if (eventType === 'all' || eventType === 'file') {
      if (search) queryParams.push(`%${search}%`, `%${search}%`);
      if (startDate) queryParams.push(startDate);
      if (endDate) queryParams.push(endDate);
    }

    // For agent events
    if (eventType === 'all' || eventType === 'agent') {
      if (search) queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
      if (startDate) queryParams.push(startDate);
      if (endDate) queryParams.push(endDate);
    }

    // For system events
    if (eventType === 'all' || eventType === 'system') {
      if (search) queryParams.push(`%${search}%`, `%${search}%`);
      if (startDate) queryParams.push(startDate);
      if (endDate) queryParams.push(endDate);
    }

    // Add limit and offset
    queryParams.push(limit, offset);

    // Execute query
    const activities = this.db.prepare(unionQuery).all(...queryParams);

    // Get total count (without limit/offset) for pagination
    const countQuery = `
      WITH combined AS (
        ${queries.join(' UNION ALL ')}
      )
      SELECT COUNT(*) as total FROM combined
    `;

    // Same params but without limit/offset
    const countParams = queryParams.slice(0, -2);
    const totalResult = this.db.prepare(countQuery).get(...countParams);
    const total = totalResult.total;

    // Transform results to add metadata objects
    const formattedActivities = activities.map(e => {
      const activity = { ...e };

      // Build metadata object based on category
      if (e.category === 'file') {
        activity.metadata = {
          size: e.size,
          hash: e.hash,
          cpu: e.cpu,
          mem: e.mem,
          hasDiff: !!e.diff
        };
      } else if (e.category === 'agent') {
        activity.metadata = {
          file: e.file,
          linesChanged: e.lines_changed,
          durationMs: e.duration_ms,
          ...(e.metadata_json ? JSON.parse(e.metadata_json) : {})
        };
      } else if (e.category === 'system') {
        activity.metadata = {
          cpu: e.cpu_percent,
          memory: e.memory_percent,
          memoryUsedMb: e.memory_used_mb
        };
      }

      return activity;
    });

    return {
      activities: formattedActivities,
      total,
      limit,
      offset,
      hasMore: offset + limit < total
    };
  }

  // ==================== Notifications ====================

  insertNotification(timestamp, type, severity, title, message, metadata, session_id) {
    const stmt = this.prepareStatement(`
      INSERT INTO notifications (timestamp, type, severity, title, message, metadata, session_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      timestamp,
      type,
      severity,
      title,
      message,
      metadata ? JSON.stringify(metadata) : null,
      session_id || null
    );

    return result.lastInsertRowid;
  }

  getNotifications(options = {}) {
    const { limit = 50, offset = 0, type = 'all', severity = 'all', unread_only = false } = options;

    // Build query using QueryBuilder
    const builder = new QueryBuilder('SELECT * FROM notifications');

    if (type !== 'all') {
      builder.where('type', '=', type);
    }

    if (severity !== 'all') {
      builder.where('severity', '=', severity);
    }

    if (unread_only) {
      builder.where('read', '=', 0);
    }

    // Count total (before adding ORDER BY and LIMIT)
    const countBuilder = new QueryBuilder('SELECT COUNT(*) as count FROM notifications');
    if (type !== 'all') countBuilder.where('type', '=', type);
    if (severity !== 'all') countBuilder.where('severity', '=', severity);
    if (unread_only) countBuilder.where('read', '=', 0);

    const { query: countQuery, params: countParams } = countBuilder.build();
    const countStmt = this.db.prepare(countQuery);
    const { count: total } = countStmt.get(...countParams);

    // Get paginated results
    const { query, params } = builder
      .orderBy('timestamp', 'DESC')
      .limit(limit)
      .offset(offset)
      .build();

    const stmt = this.prepareStatement(query);
    const notifications = stmt.all(...params);

    return {
      notifications: notifications.map(n => ({
        ...n,
        read: Boolean(n.read),
        metadata: n.metadata ? JSON.parse(n.metadata) : null
      })),
      total,
      limit,
      offset,
      hasMore: offset + limit < total
    };
  }

  getNotificationStats() {
    const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM notifications');
    const unreadStmt = this.db.prepare(
      'SELECT COUNT(*) as count FROM notifications WHERE read = 0'
    );

    const byTypeStmt = this.db.prepare(`
      SELECT type, COUNT(*) as count
      FROM notifications
      GROUP BY type
    `);

    const bySeverityStmt = this.db.prepare(`
      SELECT severity, COUNT(*) as count
      FROM notifications
      GROUP BY severity
    `);

    const { count: total } = totalStmt.get();
    const { count: unread } = unreadStmt.get();
    const byType = byTypeStmt.all();
    const bySeverity = bySeverityStmt.all();

    const by_type = {};
    for (const row of byType) {
      by_type[row.type] = row.count;
    }

    const by_severity = {};
    for (const row of bySeverity) {
      by_severity[row.severity] = row.count;
    }

    return {
      total,
      unread,
      by_type,
      by_severity
    };
  }

  markNotificationAsRead(id) {
    const stmt = this.prepareStatement('UPDATE notifications SET read = 1 WHERE id = ?');
    stmt.run(id);
  }

  markAllNotificationsAsRead() {
    const stmt = this.prepareStatement('UPDATE notifications SET read = 1');
    stmt.run();
  }

  deleteNotification(id) {
    const stmt = this.prepareStatement('DELETE FROM notifications WHERE id = ?');
    stmt.run(id);
  }

  clearNotifications(olderThanDays = null) {
    if (olderThanDays) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
      const cutoffISO = cutoffDate.toISOString();

      const stmt = this.prepareStatement('DELETE FROM notifications WHERE timestamp < ?');
      const result = stmt.run(cutoffISO);
      return { deleted: result.changes };
    } else {
      const stmt = this.prepareStatement('DELETE FROM notifications');
      const result = stmt.run();
      return { deleted: result.changes };
    }
  }

  // ==================== Conversations ====================

  insertConversation(
    timestamp,
    claude_session_id,
    event_type,
    content,
    tool_name,
    tool_input,
    tool_output,
    is_error,
    parent_uuid,
    metadata,
    project,
    session_id
  ) {
    const stmt = this.prepareStatement(`
      INSERT INTO conversations (timestamp, claude_session_id, event_type, content, tool_name, tool_input, tool_output, is_error, parent_uuid, metadata, project, session_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      timestamp,
      claude_session_id,
      event_type,
      content || null,
      tool_name || null,
      tool_input ? JSON.stringify(tool_input) : null,
      tool_output || null,
      is_error ? 1 : 0,
      parent_uuid || null,
      metadata ? JSON.stringify(metadata) : null,
      project || null,
      session_id || null
    );

    return result.lastInsertRowid;
  }

  getConversations(options = {}) {
    const {
      limit = 100,
      offset = 0,
      event_type = 'all',
      project = 'all',
      claude_session_id = null
    } = options;

    // Build query using QueryBuilder
    const builder = new QueryBuilder('SELECT * FROM conversations');

    if (event_type !== 'all') {
      builder.where('event_type', '=', event_type);
    }

    if (project !== 'all') {
      builder.where('project', '=', project);
    }

    if (claude_session_id) {
      builder.where('claude_session_id', '=', claude_session_id);
    }

    // Count total
    const countBuilder = new QueryBuilder('SELECT COUNT(*) as count FROM conversations');
    if (event_type !== 'all') countBuilder.where('event_type', '=', event_type);
    if (project !== 'all') countBuilder.where('project', '=', project);
    if (claude_session_id) countBuilder.where('claude_session_id', '=', claude_session_id);

    const { query: countQuery, params: countParams } = countBuilder.build();
    const countStmt = this.db.prepare(countQuery);
    const { count: total } = countStmt.get(...countParams);

    // Get paginated results
    const { query, params } = builder
      .orderBy('timestamp', 'DESC')
      .limit(limit)
      .offset(offset)
      .build();

    const stmt = this.db.prepare(query);
    const conversations = stmt.all(...params);

    return {
      conversations: conversations.map(c => ({
        ...c,
        is_error: Boolean(c.is_error),
        tool_input: c.tool_input ? JSON.parse(c.tool_input) : null,
        metadata: c.metadata ? JSON.parse(c.metadata) : null
      })),
      total,
      limit,
      offset,
      hasMore: offset + limit < total
    };
  }

  getConversationsBySession(claude_session_id, limit = 500) {
    const stmt = this.prepareStatement(`
      SELECT * FROM conversations
      WHERE claude_session_id = ?
      ORDER BY timestamp ASC
      LIMIT ?
    `);

    const conversations = stmt.all(claude_session_id, limit);

    return conversations.map(c => ({
      ...c,
      is_error: Boolean(c.is_error),
      tool_input: c.tool_input ? JSON.parse(c.tool_input) : null,
      metadata: c.metadata ? JSON.parse(c.metadata) : null
    }));
  }

  getConversationStats() {
    const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM conversations');
    const byTypeStmt = this.db.prepare(`
      SELECT event_type, COUNT(*) as count
      FROM conversations
      GROUP BY event_type
    `);
    const byProjectStmt = this.db.prepare(`
      SELECT project, COUNT(*) as count
      FROM conversations
      GROUP BY project
      ORDER BY count DESC
      LIMIT 10
    `);

    const { count: total } = totalStmt.get();
    const byType = byTypeStmt.all();
    const byProject = byProjectStmt.all();

    const by_type = {};
    for (const row of byType) {
      by_type[row.event_type] = row.count;
    }

    const by_project = {};
    for (const row of byProject) {
      by_project[row.project || 'unknown'] = row.count;
    }

    return {
      total,
      by_type,
      by_project
    };
  }

  clearConversations(olderThanDays = null) {
    if (olderThanDays) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
      const cutoffISO = cutoffDate.toISOString();

      const stmt = this.prepareStatement('DELETE FROM conversations WHERE timestamp < ?');
      const result = stmt.run(cutoffISO);
      return { deleted: result.changes };
    } else {
      const stmt = this.prepareStatement('DELETE FROM conversations');
      const result = stmt.run();
      return { deleted: result.changes };
    }
  }

  // ==================== Syntax Errors ====================

  insertSyntaxError(
    timestamp,
    filepath,
    language,
    severity,
    message,
    lineNumber,
    columnNumber,
    codeSnippet,
    projectName,
    session_id
  ) {
    const stmt = this.prepareStatement(`
      INSERT INTO syntax_errors (timestamp, filepath, language, severity, message, line_number, column_number, code_snippet, project_name, session_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      timestamp,
      filepath,
      language,
      severity,
      message,
      lineNumber,
      columnNumber,
      codeSnippet,
      projectName || null,
      session_id || null
    );

    return result.lastInsertRowid;
  }

  getSyntaxErrors(options = {}) {
    const { limit = 50, offset = 0, resolved = false } = options;

    const stmt = this.prepareStatement(`
      SELECT * FROM syntax_errors
      WHERE resolved = ?
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `);

    const errors = stmt.all(resolved ? 1 : 0, limit, offset);

    // Truncate code snippets for performance (show first 150 chars in list view)
    const processedErrors = errors.map(error => ({
      ...error,
      code_snippet:
        error.code_snippet && error.code_snippet.length > 150
          ? error.code_snippet.substring(0, 150) + '...'
          : error.code_snippet
    }));

    // Get count
    const countStmt = this.prepareStatement(`
      SELECT COUNT(*) as count FROM syntax_errors WHERE resolved = ?
    `);
    const { count } = countStmt.get(resolved ? 1 : 0);

    return { errors: processedErrors, count };
  }

  resolveSyntaxError(errorId) {
    const stmt = this.prepareStatement(`
      UPDATE syntax_errors
      SET resolved = 1, resolved_at = ?
      WHERE id = ?
    `);

    stmt.run(new Date().toISOString(), errorId);
  }

  clearSyntaxErrors(filepath = null) {
    if (filepath) {
      const stmt = this.prepareStatement('DELETE FROM syntax_errors WHERE filepath = ?');
      stmt.run(filepath);
    } else {
      const stmt = this.prepareStatement('DELETE FROM syntax_errors');
      stmt.run();
    }
  }

  // ==================== Pattern Warnings ====================

  insertPatternWarning(
    timestamp,
    filepath,
    projectName,
    category,
    severity,
    patternName,
    message,
    lineNumber,
    matchText,
    context,
    suggestion,
    session_id
  ) {
    const stmt = this.prepareStatement(`
      INSERT INTO pattern_warnings (timestamp, filepath, project_name, category, severity, pattern_name, message, line_number, match_text, context, suggestion, session_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      timestamp,
      filepath,
      projectName || null,
      category,
      severity,
      patternName,
      message,
      lineNumber,
      matchText || null,
      context || null,
      suggestion,
      session_id || null
    );

    return result.lastInsertRowid;
  }

  getPatternWarnings(options = {}) {
    const { limit = 100, offset = 0, category = 'all', resolved = false } = options;

    // Use SUBSTR in SQL to truncate large TEXT fields for performance
    let query = `SELECT
      id, timestamp, filepath, project_name, category, severity,
      pattern_name, message, line_number,
      SUBSTR(match_text, 1, 150) as match_text,
      SUBSTR(context, 1, 150) as context,
      suggestion, session_id, resolved, resolved_at
    FROM pattern_warnings WHERE resolved = ?`;
    const params = [resolved ? 1 : 0];

    if (category !== 'all') {
      query += ' AND category = ?';
      params.push(category);
    }

    query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = this.prepareStatement(query);
    const warnings = stmt.all(...params);

    // Get count
    let countQuery = 'SELECT COUNT(*) as count FROM pattern_warnings WHERE resolved = ?';
    const countParams = [resolved ? 1 : 0];

    if (category !== 'all') {
      countQuery += ' AND category = ?';
      countParams.push(category);
    }

    const countStmt = this.prepareStatement(countQuery);
    const { count } = countStmt.get(...countParams);

    return { warnings, count };
  }

  resolvePatternWarning(warningId) {
    const stmt = this.prepareStatement(`
      UPDATE pattern_warnings
      SET resolved = 1, resolved_at = ?
      WHERE id = ?
    `);

    stmt.run(new Date().toISOString(), warningId);
  }

  resolveAllPatternWarnings(category = null) {
    const timestamp = new Date().toISOString();

    let query = `
      UPDATE pattern_warnings
      SET resolved = 1, resolved_at = ?
      WHERE resolved = 0
    `;

    const params = [timestamp];

    if (category && category !== 'all') {
      query += ' AND category = ?';
      params.push(category);
    }

    const stmt = this.prepareStatement(query);
    const result = stmt.run(...params);

    return { count: result.changes };
  }

  clearPatternWarnings(filepath = null) {
    if (filepath) {
      const stmt = this.prepareStatement('DELETE FROM pattern_warnings WHERE filepath = ?');
      stmt.run(filepath);
    } else {
      const stmt = this.prepareStatement('DELETE FROM pattern_warnings');
      stmt.run();
    }
  }

  // ==================== Test Results ====================

  insertTestResult(
    timestamp,
    framework,
    testFile,
    testName,
    status,
    durationMs,
    errorMessage,
    errorStack,
    session_id
  ) {
    const stmt = this.prepareStatement(`
      INSERT INTO test_results (timestamp, framework, test_file, test_name, status, duration_ms, error_message, error_stack, session_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      timestamp,
      framework,
      testFile,
      testName,
      status,
      durationMs,
      errorMessage,
      errorStack,
      session_id || null
    );

    return result.lastInsertRowid;
  }

  getTestResults(options = {}) {
    const { limit = 20, offset = 0, framework = 'all', status = 'all' } = options;

    // Get all test results grouped by test run (timestamp + framework)
    let query = `
      SELECT
        timestamp,
        framework,
        COUNT(*) as total_tests,
        SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) as passed_tests,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_tests,
        SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped_tests,
        SUM(duration_ms) as duration,
        MIN(id) as first_test_id
      FROM test_results
      WHERE 1=1
    `;
    const params = [];

    if (framework !== 'all') {
      query += ' AND framework = ?';
      params.push(framework);
    }

    query += ' GROUP BY timestamp, framework';

    // Filter by status after aggregation (if a test run has any failed tests, it failed)
    if (status === 'passed') {
      query += ' HAVING failed_tests = 0';
    } else if (status === 'failed') {
      query += ' HAVING failed_tests > 0';
    }

    query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = this.prepareStatement(query);
    const testRuns = stmt.all(...params);

    // Transform to match frontend expectations
    const results = testRuns.map(run => ({
      id: run.first_test_id,
      timestamp: run.timestamp,
      framework: run.framework,
      total_tests: run.total_tests,
      passed_tests: run.passed_tests,
      failed_tests: run.failed_tests,
      skipped_tests: run.skipped_tests,
      duration: run.duration || 0,
      passed: run.failed_tests === 0
    }));

    // Get count of unique test runs
    let countQuery = `
      SELECT COUNT(DISTINCT timestamp || '|' || framework) as count
      FROM test_results
      WHERE 1=1
    `;
    const countParams = [];

    if (framework !== 'all') {
      countQuery += ' AND framework = ?';
      countParams.push(framework);
    }

    const countStmt = this.prepareStatement(countQuery);
    const { count } = countStmt.get(...countParams);

    return { results, total: count };
  }

  clearTestResults() {
    const stmt = this.prepareStatement('DELETE FROM test_results');
    const result = stmt.run();
    return { count: result.changes };
  }

  // ==================== Sessions ====================

  insertSession(projectName, startTime, session_id) {
    const stmt = this.prepareStatement(`
      INSERT INTO sessions (project_name, start_time, session_id)
      VALUES (?, ?, ?)
    `);

    const result = stmt.run(projectName, startTime, session_id || null);
    return result.lastInsertRowid;
  }

  updateSession(sessionId, updates) {
    const { end_time, changes_count, rollbacks_count, break_minutes, quality_score } = updates;

    const stmt = this.prepareStatement(`
      UPDATE sessions
      SET end_time = COALESCE(?, end_time),
          changes_count = COALESCE(?, changes_count),
          rollbacks_count = COALESCE(?, rollbacks_count),
          break_minutes = COALESCE(?, break_minutes),
          quality_score = COALESCE(?, quality_score)
      WHERE id = ?
    `);

    stmt.run(end_time, changes_count, rollbacks_count, break_minutes, quality_score, sessionId);
  }

  getSessions(options = {}) {
    const { limit = 10, offset = 0, projectName = null } = options;

    // Build query using QueryBuilder
    const builder = new QueryBuilder('SELECT * FROM sessions');

    if (projectName) {
      builder.where('project_name', '=', projectName);
    }

    // Get count
    const countBuilder = new QueryBuilder('SELECT COUNT(*) as count FROM sessions');
    if (projectName) {
      countBuilder.where('project_name', '=', projectName);
    }

    const { query: countQuery, params: countParams } = countBuilder.build();
    const countStmt = this.prepareStatement(countQuery);
    const { count } = countStmt.get(...countParams);

    // Get paginated results
    const { query, params } = builder
      .orderBy('start_time', 'DESC')
      .limit(limit)
      .offset(offset)
      .build();

    const stmt = this.prepareStatement(query);
    const sessions = stmt.all(...params);

    return { sessions, total: count };
  }

  /**
   * Close database connection and clean up all resources
   * Safe to call multiple times
   */
  close() {
    if (this.closed) {
      logger.debug('Database already closed, skipping');
      return;
    }

    this.closed = true;
    logger.info('Closing database connection', {
      cachedStatements: this.stmtCache.size,
      activeStatements: this.activeStatements.size
    });

    try {
      // Finalize all active prepared statements
      for (const stmt of this.activeStatements) {
        try {
          // Note: better-sqlite3 statements don't have a finalize method
          // They are automatically cleaned up when the database closes
          // We're just tracking them here for visibility
        } catch (error) {
          logger.warn('Error finalizing statement:', error);
        }
      }

      // Clear caches
      this.activeStatements.clear();
      this.stmtCache.clear();

      // Close database connection
      this.db.close();
      logger.info('Database connection closed successfully');
    } catch (error) {
      logger.error('Error closing database:', error);
      throw error;
    }
  }
}
