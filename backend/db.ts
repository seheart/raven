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

// ==================== Database Class ====================

export class RavenDB {
  private db: Database.Database;

  constructor(dbPath: string) {
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
  }

  // ==================== Agent Events ====================

  insertAgentEvent(
    timestamp: string,
    agent: string,
    event_type: string,
    file: string | null | undefined,
    lines_changed: number | null | undefined,
    duration_ms: number | null | undefined,
    message: string,
    metadata: Record<string, any> | null | undefined,
    session_id: string | null | undefined
  ): number {
    const stmt = this.db.prepare(`
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

  insertEvent(
    timestamp: string,
    filepath: string,
    change_type: string,
    diff: string | null,
    cpu: number,
    mem: number,
    session_id: string | null | undefined,
    file_hash: string | null | undefined,
    event_size: number | null | undefined
  ): number {
    const stmt = this.db.prepare(`
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
      session_id || null,
      file_hash || null,
      event_size || null
    );

    return Number(result.lastInsertRowid);
  }

  getRecentFileEvents(limit: number = 100, includeDiff: boolean = false): FileEvent[] {
    const fields = includeDiff
      ? 'id, timestamp, filepath, change_type, event_size, file_hash, cpu, mem, diff'
      : 'id, timestamp, filepath, change_type, event_size, file_hash, cpu, mem';

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
      SELECT id, timestamp, filepath, change_type, diff, cpu, mem
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

  getDashboardStats(session_id: string): DashboardStats {
    const events = this.getAgentEventsBySession(session_id);

    // Get unique files from agent events
    const trackedFiles = new Set<string>();
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
    const activeToday = new Set<string>();

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

  close(): void {
    this.db.close();
  }
}
