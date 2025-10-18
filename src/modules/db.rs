use rusqlite::{Connection, Result};
use std::path::Path;
use tracing::info;

/// Database manager for storing events and metrics
pub struct Database {
    conn: Connection,
}

impl Database {
    /// Create a new database connection and initialize schema
    pub fn new(db_path: &Path) -> Result<Self> {
        let conn = Connection::open(db_path)?;

        // Create tables
        conn.execute(
            "CREATE TABLE IF NOT EXISTS events (
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
            )",
            [],
        )?;

        // Create agent telemetry events table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS agent_events (
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
            )",
            [],
        )?;

        // Create performance metrics table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS raven_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                cpu_percent REAL NOT NULL,
                memory_percent REAL NOT NULL,
                memory_used_mb INTEGER NOT NULL,
                memory_total_mb INTEGER NOT NULL,
                network_rx_bytes INTEGER,
                network_tx_bytes INTEGER,
                session_id TEXT
            )",
            [],
        )?;

        // Create process metrics table (for per-process stats)
        conn.execute(
            "CREATE TABLE IF NOT EXISTS process_metrics (
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
            )",
            [],
        )?;

        info!("Database initialized at {:?}", db_path);
        Ok(Self { conn })
    }

    /// Insert a new event
    pub fn insert_event(
        &self,
        timestamp: &str,
        filepath: Option<&str>,
        change_type: &str,
        diff: Option<&str>,
        cpu: f64,
        mem: f64,
        session_id: Option<&str>,
    ) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO events (timestamp, filepath, change_type, diff, cpu, mem, session_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            (timestamp, filepath, change_type, diff, cpu, mem, session_id),
        )?;

        Ok(self.conn.last_insert_rowid())
    }

    /// Get events by session
    pub fn get_events_by_session(&self, session_id: &str) -> Result<Vec<Event>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, timestamp, filepath, change_type, diff, cpu, mem
             FROM events WHERE session_id = ?1 ORDER BY timestamp ASC"
        )?;

        let events = stmt.query_map([session_id], |row| {
            Ok(Event {
                id: row.get(0)?,
                timestamp: row.get(1)?,
                filepath: row.get(2)?,
                change_type: row.get(3)?,
                diff: row.get(4)?,
                cpu: row.get(5)?,
                mem: row.get(6)?,
            })
        })?
        .collect::<Result<Vec<_>>>()?;

        Ok(events)
    }

    /// Get all events for a specific file path
    pub fn get_file_history(&self, filepath: &str) -> Result<Vec<Event>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, timestamp, filepath, change_type, diff, cpu, mem
             FROM events WHERE filepath = ?1 ORDER BY timestamp ASC"
        )?;

        let events = stmt.query_map([filepath], |row| {
            Ok(Event {
                id: row.get(0)?,
                timestamp: row.get(1)?,
                filepath: row.get(2)?,
                change_type: row.get(3)?,
                diff: row.get(4)?,
                cpu: row.get(5)?,
                mem: row.get(6)?,
            })
        })?
        .collect::<Result<Vec<_>>>()?;

        Ok(events)
    }

    /// Get event by ID
    pub fn get_event_by_id(&self, id: i64) -> Result<Option<Event>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, timestamp, filepath, change_type, diff, cpu, mem
             FROM events WHERE id = ?1"
        )?;

        let mut rows = stmt.query([id])?;

        if let Some(row) = rows.next()? {
            Ok(Some(Event {
                id: row.get(0)?,
                timestamp: row.get(1)?,
                filepath: row.get(2)?,
                change_type: row.get(3)?,
                diff: row.get(4)?,
                cpu: row.get(5)?,
                mem: row.get(6)?,
            }))
        } else {
            Ok(None)
        }
    }

    /// Get events within a time range
    pub fn get_events_by_time_range(
        &self,
        start_time: &str,
        end_time: &str,
    ) -> Result<Vec<Event>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, timestamp, filepath, change_type, diff, cpu, mem
             FROM events WHERE timestamp >= ?1 AND timestamp <= ?2 ORDER BY timestamp ASC"
        )?;

        let events = stmt.query_map([start_time, end_time], |row| {
            Ok(Event {
                id: row.get(0)?,
                timestamp: row.get(1)?,
                filepath: row.get(2)?,
                change_type: row.get(3)?,
                diff: row.get(4)?,
                cpu: row.get(5)?,
                mem: row.get(6)?,
            })
        })?
        .collect::<Result<Vec<_>>>()?;

        Ok(events)
    }

    /// Get all unique file paths from events
    pub fn get_tracked_files(&self) -> Result<Vec<String>> {
        let mut stmt = self.conn.prepare(
            "SELECT DISTINCT filepath FROM events WHERE filepath IS NOT NULL ORDER BY filepath"
        )?;

        let files = stmt.query_map([], |row| {
            row.get(0)
        })?
        .collect::<Result<Vec<_>>>()?;

        Ok(files)
    }

    /// Insert a new agent telemetry event
    pub fn insert_agent_event(
        &self,
        timestamp: &str,
        agent: &str,
        event_type: &str,
        file: Option<&str>,
        lines_changed: Option<u32>,
        duration_ms: Option<u64>,
        message: &str,
        metadata: Option<&str>,
        session_id: Option<&str>,
    ) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO agent_events (timestamp, agent, event_type, file, lines_changed, duration_ms, message, metadata, session_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            (timestamp, agent, event_type, file, lines_changed.map(|v| v as i64), duration_ms.map(|v| v as i64), message, metadata, session_id),
        )?;

        Ok(self.conn.last_insert_rowid())
    }

    /// Get recent agent events
    pub fn get_recent_agent_events(&self, limit: i64) -> Result<Vec<AgentEvent>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, timestamp, agent, event_type, file, lines_changed, duration_ms, message, metadata
             FROM agent_events ORDER BY timestamp DESC LIMIT ?1"
        )?;

        let events = stmt.query_map([limit], |row| {
            Ok(AgentEvent {
                id: row.get(0)?,
                timestamp: row.get(1)?,
                agent: row.get(2)?,
                event_type: row.get(3)?,
                file: row.get(4)?,
                lines_changed: row.get::<_, Option<i64>>(5)?.map(|v| v as u32),
                duration_ms: row.get::<_, Option<i64>>(6)?.map(|v| v as u64),
                message: row.get(7)?,
                metadata: row.get(8)?,
            })
        })?
        .collect::<Result<Vec<_>>>()?;

        Ok(events)
    }

    /// Get agent events by agent type
    pub fn get_events_by_agent(&self, agent: &str, limit: i64) -> Result<Vec<AgentEvent>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, timestamp, agent, event_type, file, lines_changed, duration_ms, message, metadata
             FROM agent_events WHERE agent = ?1 ORDER BY timestamp DESC LIMIT ?2"
        )?;

        let events = stmt.query_map([agent, &limit.to_string()], |row| {
            Ok(AgentEvent {
                id: row.get(0)?,
                timestamp: row.get(1)?,
                agent: row.get(2)?,
                event_type: row.get(3)?,
                file: row.get(4)?,
                lines_changed: row.get::<_, Option<i64>>(5)?.map(|v| v as u32),
                duration_ms: row.get::<_, Option<i64>>(6)?.map(|v| v as u64),
                message: row.get(7)?,
                metadata: row.get(8)?,
            })
        })?
        .collect::<Result<Vec<_>>>()?;

        Ok(events)
    }

    /// Get agent telemetry statistics
    pub fn get_agent_stats(&self) -> Result<Vec<AgentStats>> {
        let mut stmt = self.conn.prepare(
            "SELECT agent, COUNT(*) as event_count,
                    AVG(duration_ms) as avg_duration,
                    SUM(lines_changed) as total_lines_changed
             FROM agent_events
             GROUP BY agent
             ORDER BY event_count DESC"
        )?;

        let stats = stmt.query_map([], |row| {
            Ok(AgentStats {
                agent: row.get(0)?,
                event_count: row.get(1)?,
                avg_duration_ms: row.get::<_, Option<f64>>(2)?,
                total_lines_changed: row.get::<_, Option<i64>>(3)?.map(|v| v as u64),
            })
        })?
        .collect::<Result<Vec<_>>>()?;

        Ok(stats)
    }

    /// Insert system metrics snapshot
    pub fn insert_system_metrics(
        &self,
        timestamp: &str,
        cpu_percent: f64,
        memory_percent: f64,
        memory_used_mb: u64,
        memory_total_mb: u64,
        network_rx_bytes: Option<u64>,
        network_tx_bytes: Option<u64>,
        session_id: Option<&str>,
    ) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO raven_metrics (timestamp, cpu_percent, memory_percent, memory_used_mb, memory_total_mb, network_rx_bytes, network_tx_bytes, session_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            (timestamp, cpu_percent, memory_percent, memory_used_mb as i64, memory_total_mb as i64, network_rx_bytes.map(|v| v as i64), network_tx_bytes.map(|v| v as i64), session_id),
        )?;

        Ok(self.conn.last_insert_rowid())
    }

    /// Insert process metrics
    pub fn insert_process_metrics(
        &self,
        timestamp: &str,
        agent_name: &str,
        pid: u32,
        cpu_usage: f64,
        memory_mb: u64,
        virtual_memory_mb: u64,
        disk_read_bytes: Option<u64>,
        disk_write_bytes: Option<u64>,
        status: &str,
        session_id: Option<&str>,
    ) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO process_metrics (timestamp, agent_name, pid, cpu_usage, memory_mb, virtual_memory_mb, disk_read_bytes, disk_write_bytes, status, session_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            (timestamp, agent_name, pid as i64, cpu_usage, memory_mb as i64, virtual_memory_mb as i64, disk_read_bytes.map(|v| v as i64), disk_write_bytes.map(|v| v as i64), status, session_id),
        )?;

        Ok(self.conn.last_insert_rowid())
    }

    /// Get recent system metrics
    pub fn get_recent_system_metrics(&self, limit: i64) -> Result<Vec<SystemMetrics>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, timestamp, cpu_percent, memory_percent, memory_used_mb, memory_total_mb, network_rx_bytes, network_tx_bytes
             FROM raven_metrics ORDER BY timestamp DESC LIMIT ?1"
        )?;

        let metrics = stmt.query_map([limit], |row| {
            Ok(SystemMetrics {
                id: row.get(0)?,
                timestamp: row.get(1)?,
                cpu_percent: row.get(2)?,
                memory_percent: row.get(3)?,
                memory_used_mb: row.get::<_, i64>(4)? as u64,
                memory_total_mb: row.get::<_, i64>(5)? as u64,
                network_rx_bytes: row.get::<_, Option<i64>>(6)?.map(|v| v as u64),
                network_tx_bytes: row.get::<_, Option<i64>>(7)?.map(|v| v as u64),
            })
        })?
        .collect::<Result<Vec<_>>>()?;

        Ok(metrics)
    }

    /// Get recent process metrics for a specific agent
    pub fn get_process_metrics_by_agent(&self, agent_name: &str, limit: i64) -> Result<Vec<ProcessMetrics>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, timestamp, agent_name, pid, cpu_usage, memory_mb, virtual_memory_mb, disk_read_bytes, disk_write_bytes, status
             FROM process_metrics WHERE agent_name = ?1 ORDER BY timestamp DESC LIMIT ?2"
        )?;

        let metrics = stmt.query_map([agent_name, &limit.to_string()], |row| {
            Ok(ProcessMetrics {
                id: row.get(0)?,
                timestamp: row.get(1)?,
                agent_name: row.get(2)?,
                pid: row.get::<_, i64>(3)? as u32,
                cpu_usage: row.get(4)?,
                memory_mb: row.get::<_, i64>(5)? as u64,
                virtual_memory_mb: row.get::<_, i64>(6)? as u64,
                disk_read_bytes: row.get::<_, Option<i64>>(7)?.map(|v| v as u64),
                disk_write_bytes: row.get::<_, Option<i64>>(8)?.map(|v| v as u64),
                status: row.get(9)?,
            })
        })?
        .collect::<Result<Vec<_>>>()?;

        Ok(metrics)
    }

    /// Correlate agent events with system metrics (within time window)
    pub fn correlate_events_with_metrics(&self, time_window_seconds: i64) -> Result<Vec<PerformanceCorrelation>> {
        let mut stmt = self.conn.prepare(
            "SELECT
                ae.id as event_id,
                ae.timestamp as event_timestamp,
                ae.agent,
                ae.event_type,
                ae.duration_ms,
                rm.cpu_percent,
                rm.memory_percent,
                pm.cpu_usage as process_cpu,
                pm.memory_mb as process_mem
             FROM agent_events ae
             LEFT JOIN raven_metrics rm
                ON datetime(rm.timestamp) BETWEEN
                   datetime(ae.timestamp) AND
                   datetime(ae.timestamp, '+' || ?1 || ' seconds')
             LEFT JOIN process_metrics pm
                ON pm.agent_name = ae.agent
                AND datetime(pm.timestamp) BETWEEN
                    datetime(ae.timestamp) AND
                    datetime(ae.timestamp, '+' || ?1 || ' seconds')
             WHERE ae.duration_ms IS NOT NULL
             ORDER BY ae.timestamp DESC
             LIMIT 100"
        )?;

        let correlations = stmt.query_map([time_window_seconds], |row| {
            Ok(PerformanceCorrelation {
                event_id: row.get(0)?,
                event_timestamp: row.get(1)?,
                agent: row.get(2)?,
                event_type: row.get(3)?,
                duration_ms: row.get::<_, Option<i64>>(4)?.map(|v| v as u64),
                system_cpu_percent: row.get(5)?,
                system_memory_percent: row.get(6)?,
                process_cpu_percent: row.get(7)?,
                process_memory_mb: row.get::<_, Option<i64>>(8)?.map(|v| v as u64),
            })
        })?
        .collect::<Result<Vec<_>>>()?;

        Ok(correlations)
    }

    /// Get metrics statistics for time range
    pub fn get_metrics_stats(&self, start_time: &str, end_time: &str) -> Result<MetricsStats> {
        let mut stmt = self.conn.prepare(
            "SELECT
                AVG(cpu_percent) as avg_cpu,
                MAX(cpu_percent) as max_cpu,
                AVG(memory_percent) as avg_mem,
                MAX(memory_percent) as max_mem,
                COUNT(*) as sample_count
             FROM raven_metrics
             WHERE timestamp BETWEEN ?1 AND ?2"
        )?;

        let mut rows = stmt.query([start_time, end_time])?;

        if let Some(row) = rows.next()? {
            Ok(MetricsStats {
                avg_cpu_percent: row.get(0)?,
                max_cpu_percent: row.get(1)?,
                avg_memory_percent: row.get(2)?,
                max_memory_percent: row.get(3)?,
                sample_count: row.get(4)?,
            })
        } else {
            Ok(MetricsStats {
                avg_cpu_percent: 0.0,
                max_cpu_percent: 0.0,
                avg_memory_percent: 0.0,
                max_memory_percent: 0.0,
                sample_count: 0,
            })
        }
    }
}

#[derive(Debug)]
pub struct Event {
    pub id: i64,
    pub timestamp: String,
    pub filepath: Option<String>,
    pub change_type: String,
    pub diff: Option<String>,
    pub cpu: f64,
    pub mem: f64,
}

#[derive(Debug)]
pub struct AgentEvent {
    pub id: i64,
    pub timestamp: String,
    pub agent: String,
    pub event_type: String,
    pub file: Option<String>,
    pub lines_changed: Option<u32>,
    pub duration_ms: Option<u64>,
    pub message: String,
    pub metadata: Option<String>,
}

#[derive(Debug)]
pub struct AgentStats {
    pub agent: String,
    pub event_count: i64,
    pub avg_duration_ms: Option<f64>,
    pub total_lines_changed: Option<u64>,
}

#[derive(Debug)]
pub struct SystemMetrics {
    pub id: i64,
    pub timestamp: String,
    pub cpu_percent: f64,
    pub memory_percent: f64,
    pub memory_used_mb: u64,
    pub memory_total_mb: u64,
    pub network_rx_bytes: Option<u64>,
    pub network_tx_bytes: Option<u64>,
}

#[derive(Debug)]
pub struct ProcessMetrics {
    pub id: i64,
    pub timestamp: String,
    pub agent_name: String,
    pub pid: u32,
    pub cpu_usage: f64,
    pub memory_mb: u64,
    pub virtual_memory_mb: u64,
    pub disk_read_bytes: Option<u64>,
    pub disk_write_bytes: Option<u64>,
    pub status: String,
}

#[derive(Debug)]
pub struct PerformanceCorrelation {
    pub event_id: i64,
    pub event_timestamp: String,
    pub agent: String,
    pub event_type: String,
    pub duration_ms: Option<u64>,
    pub system_cpu_percent: Option<f64>,
    pub system_memory_percent: Option<f64>,
    pub process_cpu_percent: Option<f64>,
    pub process_memory_mb: Option<u64>,
}

#[derive(Debug)]
pub struct MetricsStats {
    pub avg_cpu_percent: f64,
    pub max_cpu_percent: f64,
    pub avg_memory_percent: f64,
    pub max_memory_percent: f64,
    pub sample_count: i64,
}
