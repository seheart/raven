import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import { logger } from './utils/logger.js';

export class RavenDB {
  constructor(dbPath) {
    // Ensure directory exists
    const dbDir = dirname(dbPath);
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL'); // Better performance

    // Prepared statement cache for better performance
    this.stmtCache = new Map();

    this.initializeSchema();
    logger.info('Database initialized', { dbPath });
  }

  /**
   * Get a cached prepared statement or create and cache it
   * @param {string} sql - SQL query string
   * @returns {Statement} Prepared statement
   */
  prepareStatement(sql) {
    if (!this.stmtCache.has(sql)) {
      this.stmtCache.set(sql, this.db.prepare(sql));
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
        event_size INTEGER
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
        session_id TEXT
      )
    `);

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

    // Create indexes for performance (prevents full table scans)
    this.db.exec(`
      -- Events table indexes
      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
      CREATE INDEX IF NOT EXISTS idx_events_filepath ON events(filepath);
      CREATE INDEX IF NOT EXISTS idx_events_change_type ON events(change_type);

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
    `);

    // Add WAL checkpoint management for better performance
    this.db.pragma('wal_autocheckpoint = 1000'); // Checkpoint every 1000 pages
  }

  // ==================== Agent Events ====================

  insertAgentEvent(
    timestamp,
    agent,
    event_type,
    file,
    lines_changed,
    duration_ms,
    message,
    metadata,
    session_id
  ) {
    const stmt = this.prepareStatement(`
      INSERT INTO agent_events (timestamp, agent, event_type, file, lines_changed, duration_ms, message, metadata, session_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      session_id || null
    );

    return result.lastInsertRowid;
  }

  getRecentAgentEvents(limit = 100) {
    const stmt = this.prepareStatement(`
      SELECT id, timestamp, agent, event_type, file, lines_changed, duration_ms, message, metadata
      FROM agent_events
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(limit);
  }

  getEventsByAgent(agent, limit = 100) {
    const stmt = this.prepareStatement(`
      SELECT id, timestamp, agent, event_type, file, lines_changed, duration_ms, message, metadata
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
        SUM(lines_changed) as total_lines_changed
      FROM agent_events
      GROUP BY agent
      ORDER BY event_count DESC
      LIMIT ?
    `);

    return stmt.all(limit);
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
    const stmt = this.prepareStatement(`
      INSERT INTO events (timestamp, filepath, change_type, diff, cpu, mem, session_id, file_hash, event_size)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      timestamp,
      filepath,
      change_type,
      diff,
      cpu,
      mem,
      session_id,
      file_hash,
      event_size
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
      SELECT id, timestamp, agent, event_type as change_type, file as filepath, lines_changed, duration_ms, message
      FROM agent_events
      WHERE session_id = ?
      ORDER BY timestamp ASC
    `);

    return stmt.all(session_id);
  }

  getTrackedFiles(limit = 5000) {
    const stmt = this.prepareStatement(`
      SELECT DISTINCT filepath
      FROM events
      WHERE filepath IS NOT NULL
      ORDER BY filepath
      LIMIT ?
    `);

    return stmt.all(limit).map(row => row.filepath);
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
    const stmt = this.prepareStatement(`
      SELECT
        AVG(cpu_percent) as avg_cpu_percent,
        MAX(cpu_percent) as max_cpu_percent,
        AVG(memory_percent) as avg_memory_percent,
        MAX(memory_percent) as max_memory_percent,
        COUNT(*) as sample_count
      FROM raven_metrics
      WHERE timestamp BETWEEN ? AND ?
    `);

    return (
      stmt.get(start_time, end_time) || {
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
        ae.event_type,
        ae.duration_ms,
        rm.cpu_percent as system_cpu_percent,
        rm.memory_percent as system_memory_percent,
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

  getTopModifiedFiles(session_id = null, limit = 10) {
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
    // Get agent events (filtered by session if provided)
    const whereClause = session_id ? 'WHERE session_id = ?' : '';
    const stmt = this.prepareStatement(`
      SELECT id, timestamp, agent, event_type as change_type, file as filepath, lines_changed, duration_ms, message
      FROM agent_events
      ${whereClause}
      ORDER BY timestamp ASC
    `);
    const events = session_id ? stmt.all(session_id) : stmt.all();

    // Get unique files from agent events
    const trackedFiles = new Set();
    for (const event of events) {
      if (event.filepath) {
        trackedFiles.add(event.filepath);
      }
    }

    // Get unique agents from agent events (filtered by session if provided)
    const agentsStmt = this.db.prepare(`
      SELECT COUNT(DISTINCT agent) as agent_count
      FROM agent_events
      ${whereClause}
    `);
    const agentsResult = session_id ? agentsStmt.get(session_id) : agentsStmt.get();
    const total_agents = agentsResult?.agent_count || 0;

    // Calculate session duration (from first event to now)
    let session_duration_seconds = 0;
    if (events.length > 0) {
      const first = new Date(events[0].timestamp);
      const now = new Date();
      session_duration_seconds = Math.floor((now - first) / 1000);
    }

    // Count active files today from both agent_events and file events
    const today = new Date().toISOString().split('T')[0];
    const activeToday = new Set();

    // Add files from agent_events
    for (const event of events) {
      const eventDate = event.timestamp.split('T')[0];
      if (eventDate === today && event.filepath) {
        activeToday.add(event.filepath);
      }
    }

    // Also add files from file system events (events table)
    const todayFilesStmt = this.db.prepare(`
      SELECT DISTINCT filepath
      FROM events
      WHERE SUBSTR(timestamp, 1, 10) = ?
      AND filepath IS NOT NULL
    `);
    const todayFiles = todayFilesStmt.all(today);
    for (const row of todayFiles) {
      activeToday.add(row.filepath);
    }

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
      ? 'WHERE session_id = ? AND event_type IN (\'create\', \'edit\', \'delete\')'
      : 'WHERE event_type IN (\'create\', \'edit\', \'delete\')';
    const agentBreakdownStmt = this.db.prepare(`
      SELECT
        event_type,
        COUNT(*) as count
      FROM agent_events
      ${agentBreakdownWhere}
      GROUP BY event_type
    `);
    const agentBreakdown = session_id ? agentBreakdownStmt.all(session_id) : agentBreakdownStmt.all();

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
    const uniqueFilesSet = new Set();

    // Add unique files from events table
    const eventsFilesWhere = session_id ? 'WHERE session_id = ? AND filepath IS NOT NULL' : 'WHERE filepath IS NOT NULL';
    const eventsFilesStmt = this.db.prepare(`
      SELECT DISTINCT filepath
      FROM events
      ${eventsFilesWhere}
    `);
    const eventsFiles = session_id ? eventsFilesStmt.all(session_id) : eventsFilesStmt.all();
    for (const row of eventsFiles) {
      uniqueFilesSet.add(row.filepath);
    }

    // Add unique files from agent_events table
    const agentFilesWhere = session_id ? 'WHERE session_id = ? AND file IS NOT NULL' : 'WHERE file IS NOT NULL';
    const agentFilesStmt = this.db.prepare(`
      SELECT DISTINCT file as filepath
      FROM agent_events
      ${agentFilesWhere}
    `);
    const agentFiles = session_id ? agentFilesStmt.all(session_id) : agentFilesStmt.all();
    for (const row of agentFiles) {
      uniqueFilesSet.add(row.filepath);
    }

    const unique_files_modified = uniqueFilesSet.size;

    return {
      total_events: events.length,
      total_files: trackedFiles.size,
      total_agents: total_agents,
      session_duration_seconds,
      active_files_today: activeToday.size,
      total_changes,
      creates,
      edits,
      deletes,
      unique_files_modified
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
      recent_count: this.db.prepare(`
        SELECT COUNT(*) as count
        FROM error_logs
        WHERE timestamp >= datetime('now', '-1 hour')
      `).get()?.count || 0
    };
  }

  clearErrorLogs(olderThanDays = null) {
    let query = 'DELETE FROM error_logs';
    const params = [];

    if (olderThanDays) {
      query += ' WHERE timestamp < datetime(\'now\', \'-\' || ? || \' days\')';
      params.push(olderThanDays);
    }

    const stmt = this.prepareStatement(query);
    const result = stmt.run(...params);
    return result.changes;
  }

  // ==================== Unified Activity Log ====================

  /**
   * Get all activity from all tables in a unified format
   * Returns events sorted by timestamp with search and filter capabilities
   */
  getActivityLog(options = {}) {
    const {
      limit = 500,
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
          diff,
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
          metadata as metadata_json,
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
      if (search) systemQuery += ' AND (\'System\' LIKE ? OR \'metrics\' LIKE ?)';
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
    const {
      limit = 50,
      offset = 0,
      type = 'all',
      severity = 'all',
      unread_only = false
    } = options;

    let query = 'SELECT * FROM notifications WHERE 1=1';
    const params = [];

    if (type !== 'all') {
      query += ' AND type = ?';
      params.push(type);
    }

    if (severity !== 'all') {
      query += ' AND severity = ?';
      params.push(severity);
    }

    if (unread_only) {
      query += ' AND read = 0';
    }

    // Count total
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as count');
    const countStmt = this.db.prepare(countQuery);
    const { count: total } = countStmt.get(...params);

    // Get paginated results
    query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

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
    const unreadStmt = this.db.prepare('SELECT COUNT(*) as count FROM notifications WHERE read = 0');

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

  insertConversation(timestamp, claude_session_id, event_type, content, tool_name, tool_input, tool_output, is_error, parent_uuid, metadata, project, session_id) {
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

    let query = 'SELECT * FROM conversations WHERE 1=1';
    const params = [];

    if (event_type !== 'all') {
      query += ' AND event_type = ?';
      params.push(event_type);
    }

    if (project !== 'all') {
      query += ' AND project = ?';
      params.push(project);
    }

    if (claude_session_id) {
      query += ' AND claude_session_id = ?';
      params.push(claude_session_id);
    }

    // Count total
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as count');
    const countStmt = this.db.prepare(countQuery);
    const { count: total } = countStmt.get(...params);

    // Get paginated results
    query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

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

  close() {
    this.db.close();
  }
}
