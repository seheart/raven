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
// ==================== Database Class ====================
export class RavenDB {
    db;
    constructor(dbPath) {
        // Ensure directory exists
        const dbDir = dirname(dbPath);
        if (!existsSync(dbDir)) {
            mkdirSync(dbDir, { recursive: true });
        }
        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL'); // Better performance
        this.initializeSchema();
        console.log(`✅ Database initialized at ${dbPath}`);
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
    }
    // ==================== Agent Events ====================
    insertAgentEvent(timestamp, agent, event_type, file, lines_changed, duration_ms, message, metadata, session_id) {
        const stmt = this.db.prepare(`
      INSERT INTO agent_events (timestamp, agent, event_type, file, lines_changed, duration_ms, message, metadata, session_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        const result = stmt.run(timestamp, agent, event_type, file || null, lines_changed || null, duration_ms || null, message, metadata ? JSON.stringify(metadata) : null, session_id || null);
        return Number(result.lastInsertRowid);
    }
    getRecentAgentEvents(limit = 100) {
        const stmt = this.db.prepare(`
      SELECT id, timestamp, agent, event_type, file, lines_changed, duration_ms, message, metadata
      FROM agent_events
      ORDER BY timestamp DESC
      LIMIT ?
    `);
        return stmt.all(limit);
    }
    getEventsByAgent(agent, limit = 100) {
        const stmt = this.db.prepare(`
      SELECT id, timestamp, agent, event_type, file, lines_changed, duration_ms, message, metadata
      FROM agent_events
      WHERE agent = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);
        return stmt.all(agent, limit);
    }
    getAgentStats() {
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
        return stmt.all();
    }
    // ==================== File Events ====================
    insertEvent(timestamp, filepath, change_type, diff, cpu, mem, session_id, file_hash, event_size, project_name) {
        const stmt = this.db.prepare(`
      INSERT INTO events (timestamp, filepath, change_type, diff, cpu, mem, session_id, file_hash, event_size, project_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        const result = stmt.run(timestamp, filepath, change_type, diff, cpu, mem, session_id || null, file_hash || null, event_size || null, project_name || null);
        return Number(result.lastInsertRowid);
    }
    getRecentFileEvents(limit = 100, includeDiff = false) {
        const fields = includeDiff
            ? 'id, timestamp, filepath, change_type, event_size, file_hash, cpu, mem, diff, project_name'
            : 'id, timestamp, filepath, change_type, event_size, file_hash, cpu, mem, project_name';
        const stmt = this.db.prepare(`
      SELECT ${fields}
      FROM events
      ORDER BY timestamp DESC
      LIMIT ?
    `);
        return stmt.all(limit);
    }
    getEventsBySession(session_id) {
        const stmt = this.db.prepare(`
      SELECT id, timestamp, filepath, change_type, diff, cpu, mem, project_name
      FROM events
      WHERE session_id = ?
      ORDER BY timestamp ASC
    `);
        return stmt.all(session_id);
    }
    getAgentEventsBySession(session_id) {
        const stmt = this.db.prepare(`
      SELECT id, timestamp, agent, event_type as change_type, file as filepath, lines_changed, duration_ms, message
      FROM agent_events
      WHERE session_id = ?
      ORDER BY timestamp ASC
    `);
        return stmt.all(session_id);
    }
    getTrackedFiles() {
        const stmt = this.db.prepare(`
      SELECT DISTINCT filepath
      FROM events
      WHERE filepath IS NOT NULL
      ORDER BY filepath
    `);
        return stmt.all().map(row => row.filepath);
    }
    // ==================== System Metrics ====================
    insertSystemMetrics(timestamp, cpu_percent, memory_percent, memory_used_mb, memory_total_mb, network_rx_bytes, network_tx_bytes, session_id) {
        const stmt = this.db.prepare(`
      INSERT INTO raven_metrics (timestamp, cpu_percent, memory_percent, memory_used_mb, memory_total_mb, network_rx_bytes, network_tx_bytes, session_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
        const result = stmt.run(timestamp, cpu_percent, memory_percent, memory_used_mb, memory_total_mb, network_rx_bytes || null, network_tx_bytes || null, session_id || null);
        return Number(result.lastInsertRowid);
    }
    getRecentSystemMetrics(limit = 100) {
        const stmt = this.db.prepare(`
      SELECT id, timestamp, cpu_percent, memory_percent, memory_used_mb, memory_total_mb, network_rx_bytes, network_tx_bytes
      FROM raven_metrics
      ORDER BY timestamp DESC
      LIMIT ?
    `);
        return stmt.all(limit);
    }
    getMetricsStats(start_time, end_time) {
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
        const result = stmt.get(start_time, end_time);
        return (result || {
            avg_cpu_percent: 0,
            max_cpu_percent: 0,
            avg_memory_percent: 0,
            max_memory_percent: 0,
            sample_count: 0
        });
    }
    // ==================== Process Metrics ====================
    insertProcessMetrics(timestamp, agent_name, pid, cpu_usage, memory_mb, virtual_memory_mb, disk_read_bytes, disk_write_bytes, status, session_id) {
        const stmt = this.db.prepare(`
      INSERT INTO process_metrics (timestamp, agent_name, pid, cpu_usage, memory_mb, virtual_memory_mb, disk_read_bytes, disk_write_bytes, status, session_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        const result = stmt.run(timestamp, agent_name, pid, cpu_usage, memory_mb, virtual_memory_mb, disk_read_bytes || null, disk_write_bytes || null, status || null, session_id || null);
        return Number(result.lastInsertRowid);
    }
    getProcessMetricsByAgent(agent_name, limit = 100) {
        const stmt = this.db.prepare(`
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
        return stmt.all(time_window_seconds);
    }
    // ==================== Dashboard Statistics ====================
    getTopModifiedFiles(session_id, limit = 10) {
        const events = this.getAgentEventsBySession(session_id);
        // Count edits per file
        const fileStats = {};
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
    getLongestEdits(limit = 10) {
        const stmt = this.db.prepare(`
      SELECT file as filepath, lines_changed, timestamp, agent
      FROM agent_events
      WHERE lines_changed IS NOT NULL
      ORDER BY lines_changed DESC
      LIMIT ?
    `);
        return stmt.all(limit);
    }
    getDashboardStats(session_id) {
        const events = this.getAgentEventsBySession(session_id);
        // Get unique files from agent events
        const trackedFiles = new Set();
        for (const event of events) {
            if (event.filepath) {
                trackedFiles.add(event.filepath);
            }
        }
        // Calculate session duration
        let session_duration_seconds = 0;
        if (events.length > 0) {
            const first = new Date(events[0].timestamp);
            const last = new Date(events[events.length - 1].timestamp);
            session_duration_seconds = Math.floor((last.getTime() - first.getTime()) / 1000);
        }
        // Count active files today
        const today = new Date().toISOString().split('T')[0];
        const activeToday = new Set();
        for (const event of events) {
            const eventDate = event.timestamp.split('T')[0];
            if (eventDate === today && event.filepath) {
                activeToday.add(event.filepath);
            }
        }
        return {
            total_events: events.length,
            total_files: trackedFiles.size,
            total_agents: 0, // Will be updated by agent registry
            session_duration_seconds,
            active_files_today: activeToday.size
        };
    }
    // ==================== Syntax Errors ====================
    insertSyntaxError(timestamp, filepath, line_number, column_number, message, severity, language, session_id) {
        const stmt = this.db.prepare(`
      INSERT INTO syntax_errors (timestamp, filepath, line_number, column_number, message, severity, language, session_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
        const result = stmt.run(timestamp, filepath, line_number, column_number || null, message, severity, language, session_id || null);
        return result.lastInsertRowid;
    }
    getSyntaxErrors(limit = 100) {
        const stmt = this.db.prepare(`
      SELECT * FROM syntax_errors
      WHERE resolved = 0
      ORDER BY timestamp DESC
      LIMIT ?
    `);
        return stmt.all(limit);
    }
    getSyntaxErrorsByFile(filepath) {
        const stmt = this.db.prepare(`
      SELECT * FROM syntax_errors
      WHERE filepath = ? AND resolved = 0
      ORDER BY timestamp DESC
    `);
        return stmt.all(filepath);
    }
    resolveSyntaxError(id) {
        const stmt = this.db.prepare(`
      UPDATE syntax_errors
      SET resolved = 1
      WHERE id = ?
    `);
        stmt.run(id);
    }
    resolveSyntaxErrorsByFile(filepath) {
        const stmt = this.db.prepare(`
      UPDATE syntax_errors
      SET resolved = 1
      WHERE filepath = ? AND resolved = 0
    `);
        stmt.run(filepath);
    }
    getUnresolvedSyntaxErrorCount() {
        const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM syntax_errors
      WHERE resolved = 0
    `);
        const result = stmt.get();
        return result.count;
    }
    // ==================== Pattern Warnings ====================
    insertPatternWarning(timestamp, filepath, line_number, pattern_id, pattern_name, severity, category, match_text, context, session_id) {
        const stmt = this.db.prepare(`
      INSERT INTO pattern_warnings (timestamp, filepath, line_number, pattern_id, pattern_name, severity, category, match_text, context, session_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        const result = stmt.run(timestamp, filepath, line_number, pattern_id, pattern_name, severity, category, match_text, context, session_id || null);
        return result.lastInsertRowid;
    }
    getPatternWarnings(limit = 100) {
        const stmt = this.db.prepare(`
      SELECT * FROM pattern_warnings
      WHERE resolved = 0
      ORDER BY timestamp DESC
      LIMIT ?
    `);
        return stmt.all(limit);
    }
    getPatternWarningsByCategory(category) {
        const stmt = this.db.prepare(`
      SELECT * FROM pattern_warnings
      WHERE category = ? AND resolved = 0
      ORDER BY timestamp DESC
    `);
        return stmt.all(category);
    }
    resolvePatternWarning(id) {
        const stmt = this.db.prepare(`
      UPDATE pattern_warnings
      SET resolved = 1
      WHERE id = ?
    `);
        stmt.run(id);
    }
    resolvePatternWarningsByFile(filepath) {
        const stmt = this.db.prepare(`
      UPDATE pattern_warnings
      SET resolved = 1
      WHERE filepath = ? AND resolved = 0
    `);
        stmt.run(filepath);
    }
    // ==================== Test Results ====================
    insertTestResult(timestamp, framework, passed, totalTests, passedTests, failedTests, skippedTests, duration, output, failures, sessionId) {
        const stmt = this.db.prepare(`
      INSERT INTO test_results (timestamp, framework, passed, total_tests, passed_tests, failed_tests, skipped_tests, duration, output, failures, session_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        const result = stmt.run(timestamp, framework, passed ? 1 : 0, totalTests, passedTests, failedTests, skippedTests, duration, output, failures, sessionId);
        return result.lastInsertRowid;
    }
    getTestResults(limit = 50) {
        const stmt = this.db.prepare(`
      SELECT * FROM test_results
      ORDER BY timestamp DESC
      LIMIT ?
    `);
        return stmt.all(limit);
    }
    getLatestTestResult() {
        const stmt = this.db.prepare(`
      SELECT * FROM test_results
      ORDER BY timestamp DESC
      LIMIT 1
    `);
        return stmt.get();
    }
    getTestResultsByFramework(framework, limit = 20) {
        const stmt = this.db.prepare(`
      SELECT * FROM test_results
      WHERE framework = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);
        return stmt.all(framework, limit);
    }
    getFailedTestsCount() {
        const stmt = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM test_results
      WHERE passed = 0
    `);
        const result = stmt.get();
        return result.count;
    }
    getUnresolvedPatternWarningCount() {
        const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM pattern_warnings
      WHERE resolved = 0
    `);
        const result = stmt.get();
        return result.count;
    }
    close() {
        this.db.close();
    }
}
//# sourceMappingURL=db.js.map