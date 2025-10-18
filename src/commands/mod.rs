use tauri::State;
use serde::{Serialize, Deserialize};
use crate::state::AppState;

/// Simple greeting command for testing
#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! Raven is watching...", name)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EventData {
    pub id: i64,
    pub timestamp: String,
    pub filepath: Option<String>,
    pub change_type: String,
    pub diff: Option<String>,
    pub cpu: f64,
    pub mem: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MetricsData {
    pub cpu: f64,
    pub memory: f64,
    pub memory_used_mb: u64,
    pub memory_total_mb: u64,
}

/// Get recent events from the database
#[tauri::command]
pub async fn get_recent_events(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<EventData>, String> {
    let event_logger = state.event_logger.lock().await;
    let session_id = event_logger.session_id();

    let db = state.db.lock().await;
    let events = db.get_events_by_session(session_id)
        .map_err(|e| format!("Database error: {}", e))?;

    let limit = limit.unwrap_or(100);
    let result: Vec<EventData> = events
        .into_iter()
        .rev() // Most recent first
        .take(limit)
        .map(|e| EventData {
            id: e.id,
            timestamp: e.timestamp,
            filepath: e.filepath,
            change_type: e.change_type,
            diff: e.diff,
            cpu: e.cpu,
            mem: e.mem,
        })
        .collect();

    Ok(result)
}

/// Get current system metrics
#[tauri::command]
pub async fn get_metrics(state: State<'_, AppState>) -> Result<MetricsData, String> {
    let mut metrics = state.metrics.lock().await;
    let (cpu, mem) = metrics.collect();
    let mem_info = metrics.memory_info();

    Ok(MetricsData {
        cpu,
        memory: mem,
        memory_used_mb: mem_info.used_mb,
        memory_total_mb: mem_info.total_mb,
    })
}

/// Get current session ID
#[tauri::command]
pub async fn get_session_id(state: State<'_, AppState>) -> Result<String, String> {
    let event_logger = state.event_logger.lock().await;
    Ok(event_logger.session_id().to_string())
}

/// Get file history for a specific file path
#[tauri::command]
pub async fn get_file_history(
    state: State<'_, AppState>,
    filepath: String,
) -> Result<Vec<EventData>, String> {
    let event_logger = state.event_logger.lock().await;
    let events = event_logger.get_file_history(&filepath)
        .map_err(|e| format!("Failed to get file history: {}", e))?;

    let result: Vec<EventData> = events
        .into_iter()
        .map(|e| EventData {
            id: e.id,
            timestamp: e.timestamp,
            filepath: e.filepath,
            change_type: e.change_type,
            diff: e.diff,
            cpu: e.cpu,
            mem: e.mem,
        })
        .collect();

    Ok(result)
}

/// Get list of all tracked files
#[tauri::command]
pub async fn get_tracked_files(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let event_logger = state.event_logger.lock().await;
    event_logger.get_tracked_files()
        .map_err(|e| format!("Failed to get tracked files: {}", e))
}

/// Get snapshot content for a specific event
#[tauri::command]
pub async fn get_snapshot(
    state: State<'_, AppState>,
    event_id: i64,
    filename: String,
) -> Result<String, String> {
    let event_logger = state.event_logger.lock().await;
    event_logger.get_snapshot(event_id, &filename)
        .map_err(|e| format!("Failed to get snapshot: {}", e))
}

/// Restore a file to a specific event state
#[tauri::command]
pub async fn restore_file(
    state: State<'_, AppState>,
    event_id: i64,
    target_path: String,
) -> Result<String, String> {
    use std::path::PathBuf;

    let event_logger = state.event_logger.lock().await;
    let path = PathBuf::from(&target_path);

    event_logger.restore_file(event_id, &path)
        .map_err(|e| format!("Failed to restore file: {}", e))?;

    Ok(format!("File restored to event #{} at {:?}", event_id, path))
}

// ==================== Agent Telemetry Commands ====================

#[derive(Debug, Serialize, Deserialize)]
pub struct AgentEventData {
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

#[derive(Debug, Serialize, Deserialize)]
pub struct AgentStatsData {
    pub agent: String,
    pub event_count: i64,
    pub avg_duration_ms: Option<f64>,
    pub total_lines_changed: Option<u64>,
}

/// Get recent agent telemetry events
#[tauri::command]
pub async fn get_agent_events(
    state: State<'_, AppState>,
    limit: Option<i64>,
) -> Result<Vec<AgentEventData>, String> {
    let db = state.db.lock().await;
    let limit = limit.unwrap_or(100);

    let events = db.get_recent_agent_events(limit)
        .map_err(|e| format!("Failed to get agent events: {}", e))?;

    let result: Vec<AgentEventData> = events
        .into_iter()
        .map(|e| AgentEventData {
            id: e.id,
            timestamp: e.timestamp,
            agent: e.agent,
            event_type: e.event_type,
            file: e.file,
            lines_changed: e.lines_changed,
            duration_ms: e.duration_ms,
            message: e.message,
            metadata: e.metadata,
        })
        .collect();

    Ok(result)
}

/// Get agent events by agent type
#[tauri::command]
pub async fn get_events_by_agent(
    state: State<'_, AppState>,
    agent: String,
    limit: Option<i64>,
) -> Result<Vec<AgentEventData>, String> {
    let db = state.db.lock().await;
    let limit = limit.unwrap_or(100);

    let events = db.get_events_by_agent(&agent, limit)
        .map_err(|e| format!("Failed to get events for agent {}: {}", agent, e))?;

    let result: Vec<AgentEventData> = events
        .into_iter()
        .map(|e| AgentEventData {
            id: e.id,
            timestamp: e.timestamp,
            agent: e.agent,
            event_type: e.event_type,
            file: e.file,
            lines_changed: e.lines_changed,
            duration_ms: e.duration_ms,
            message: e.message,
            metadata: e.metadata,
        })
        .collect();

    Ok(result)
}

/// Get agent telemetry statistics
#[tauri::command]
pub async fn get_agent_stats(state: State<'_, AppState>) -> Result<Vec<AgentStatsData>, String> {
    let db = state.db.lock().await;

    let stats = db.get_agent_stats()
        .map_err(|e| format!("Failed to get agent stats: {}", e))?;

    let result: Vec<AgentStatsData> = stats
        .into_iter()
        .map(|s| AgentStatsData {
            agent: s.agent,
            event_count: s.event_count,
            avg_duration_ms: s.avg_duration_ms,
            total_lines_changed: s.total_lines_changed,
        })
        .collect();

    Ok(result)
}

/// Get telemetry server status
#[tauri::command]
pub async fn get_telemetry_status(state: State<'_, AppState>) -> Result<TelemetryStatusData, String> {
    let is_running = state.telemetry_running.load(std::sync::atomic::Ordering::Relaxed);
    let socket_path = state.telemetry_socket_path.lock().await.clone();

    Ok(TelemetryStatusData {
        running: is_running,
        socket_path: socket_path.to_string_lossy().to_string(),
    })
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TelemetryStatusData {
    pub running: bool,
    pub socket_path: String,
}

// ==================== Performance Metrics Commands ====================

#[derive(Debug, Serialize, Deserialize)]
pub struct SystemMetricsData {
    pub id: i64,
    pub timestamp: String,
    pub cpu_percent: f64,
    pub memory_percent: f64,
    pub memory_used_mb: u64,
    pub memory_total_mb: u64,
    pub network_rx_bytes: Option<u64>,
    pub network_tx_bytes: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProcessMetricsData {
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

#[derive(Debug, Serialize, Deserialize)]
pub struct PerformanceCorrelationData {
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

#[derive(Debug, Serialize, Deserialize)]
pub struct MetricsStatsData {
    pub avg_cpu_percent: f64,
    pub max_cpu_percent: f64,
    pub avg_memory_percent: f64,
    pub max_memory_percent: f64,
    pub sample_count: i64,
}

/// Get recent system metrics
#[tauri::command]
pub async fn get_system_metrics(
    state: State<'_, AppState>,
    limit: Option<i64>,
) -> Result<Vec<SystemMetricsData>, String> {
    let db = state.db.lock().await;
    let limit = limit.unwrap_or(100);

    let metrics = db.get_recent_system_metrics(limit)
        .map_err(|e| format!("Failed to get system metrics: {}", e))?;

    let result: Vec<SystemMetricsData> = metrics
        .into_iter()
        .map(|m| SystemMetricsData {
            id: m.id,
            timestamp: m.timestamp,
            cpu_percent: m.cpu_percent,
            memory_percent: m.memory_percent,
            memory_used_mb: m.memory_used_mb,
            memory_total_mb: m.memory_total_mb,
            network_rx_bytes: m.network_rx_bytes,
            network_tx_bytes: m.network_tx_bytes,
        })
        .collect();

    Ok(result)
}

/// Get process metrics for a specific agent
#[tauri::command]
pub async fn get_process_metrics(
    state: State<'_, AppState>,
    agent_name: String,
    limit: Option<i64>,
) -> Result<Vec<ProcessMetricsData>, String> {
    let db = state.db.lock().await;
    let limit = limit.unwrap_or(100);

    let metrics = db.get_process_metrics_by_agent(&agent_name, limit)
        .map_err(|e| format!("Failed to get process metrics for {}: {}", agent_name, e))?;

    let result: Vec<ProcessMetricsData> = metrics
        .into_iter()
        .map(|m| ProcessMetricsData {
            id: m.id,
            timestamp: m.timestamp,
            agent_name: m.agent_name,
            pid: m.pid,
            cpu_usage: m.cpu_usage,
            memory_mb: m.memory_mb,
            virtual_memory_mb: m.virtual_memory_mb,
            disk_read_bytes: m.disk_read_bytes,
            disk_write_bytes: m.disk_write_bytes,
            status: m.status,
        })
        .collect();

    Ok(result)
}

/// Get performance correlations (events + metrics)
#[tauri::command]
pub async fn get_performance_correlations(
    state: State<'_, AppState>,
    time_window_seconds: Option<i64>,
) -> Result<Vec<PerformanceCorrelationData>, String> {
    let db = state.db.lock().await;
    let time_window = time_window_seconds.unwrap_or(5);

    let correlations = db.correlate_events_with_metrics(time_window)
        .map_err(|e| format!("Failed to correlate performance data: {}", e))?;

    let result: Vec<PerformanceCorrelationData> = correlations
        .into_iter()
        .map(|c| PerformanceCorrelationData {
            event_id: c.event_id,
            event_timestamp: c.event_timestamp,
            agent: c.agent,
            event_type: c.event_type,
            duration_ms: c.duration_ms,
            system_cpu_percent: c.system_cpu_percent,
            system_memory_percent: c.system_memory_percent,
            process_cpu_percent: c.process_cpu_percent,
            process_memory_mb: c.process_memory_mb,
        })
        .collect();

    Ok(result)
}

/// Get metrics statistics for a time range
#[tauri::command]
pub async fn get_metrics_stats(
    state: State<'_, AppState>,
    start_time: String,
    end_time: String,
) -> Result<MetricsStatsData, String> {
    let db = state.db.lock().await;

    let stats = db.get_metrics_stats(&start_time, &end_time)
        .map_err(|e| format!("Failed to get metrics stats: {}", e))?;

    Ok(MetricsStatsData {
        avg_cpu_percent: stats.avg_cpu_percent,
        max_cpu_percent: stats.max_cpu_percent,
        avg_memory_percent: stats.avg_memory_percent,
        max_memory_percent: stats.max_memory_percent,
        sample_count: stats.sample_count,
    })
}

// ==================== Session Replay Commands ====================

use crate::modules::timeline::{TimelineConfig, TimelineEntry, TimelineService, TimelineStats};

/// Get timeline entries for session replay
#[tauri::command]
pub async fn get_session_timeline(
    state: State<'_, AppState>,
    session_id: String,
    limit: Option<i64>,
) -> Result<Vec<TimelineEntry>, String> {
    // Get database path
    let project_dir = std::env::current_dir()
        .map_err(|e| format!("Failed to get current directory: {}", e))?;
    let raven_dir = project_dir.join(".raven");
    let db_path = raven_dir.join("db/raven.db");

    let config = TimelineConfig::default();
    let service = TimelineService::new(&db_path, config)
        .map_err(|e| format!("Failed to create timeline service: {}", e))?;

    let limit = limit.unwrap_or(500);
    let entries = service.get_session_timeline(&session_id, limit)
        .map_err(|e| format!("Failed to get timeline: {}", e))?;

    Ok(entries)
}

/// Get timeline entries within a time range
#[tauri::command]
pub async fn get_timeline_range(
    start_time: String,
    end_time: String,
) -> Result<Vec<TimelineEntry>, String> {
    let project_dir = std::env::current_dir()
        .map_err(|e| format!("Failed to get current directory: {}", e))?;
    let raven_dir = project_dir.join(".raven");
    let db_path = raven_dir.join("db/raven.db");

    let config = TimelineConfig::default();
    let service = TimelineService::new(&db_path, config)
        .map_err(|e| format!("Failed to create timeline service: {}", e))?;

    let entries = service.get_timeline_range(&start_time, &end_time)
        .map_err(|e| format!("Failed to get timeline range: {}", e))?;

    Ok(entries)
}

/// Get timeline for a specific file
#[tauri::command]
pub async fn get_file_timeline(
    filepath: String,
) -> Result<Vec<TimelineEntry>, String> {
    let project_dir = std::env::current_dir()
        .map_err(|e| format!("Failed to get current directory: {}", e))?;
    let raven_dir = project_dir.join(".raven");
    let db_path = raven_dir.join("db/raven.db");

    let config = TimelineConfig::default();
    let service = TimelineService::new(&db_path, config)
        .map_err(|e| format!("Failed to create timeline service: {}", e))?;

    let entries = service.get_file_timeline(&filepath)
        .map_err(|e| format!("Failed to get file timeline: {}", e))?;

    Ok(entries)
}

/// Get timeline statistics
#[tauri::command]
pub async fn get_timeline_stats(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<TimelineStats, String> {
    let project_dir = std::env::current_dir()
        .map_err(|e| format!("Failed to get current directory: {}", e))?;
    let raven_dir = project_dir.join(".raven");
    let db_path = raven_dir.join("db/raven.db");

    let config = TimelineConfig::default();
    let service = TimelineService::new(&db_path, config)
        .map_err(|e| format!("Failed to create timeline service: {}", e))?;

    let stats = service.get_timeline_stats(&session_id)
        .map_err(|e| format!("Failed to get timeline stats: {}", e))?;

    Ok(stats)
}

// ==================== Custom Triggers Commands ====================

use crate::modules::triggers::TriggersConfig;
use crate::modules::trigger_engine::TriggeredEvent;

#[derive(Debug, Serialize, Deserialize)]
pub struct TriggerRuleData {
    pub name: String,
    pub file: Option<String>,
    pub agent: Option<String>,
    pub event_type: Option<String>,
    pub lines_changed: Option<String>,
    pub duration_ms: Option<String>,
    pub cpu_percent: Option<String>,
    pub memory_percent: Option<String>,
    pub action: String,
    pub message: Option<String>,
    pub command: Option<String>,
    pub cooldown_seconds: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TriggeredEventData {
    pub trigger_name: String,
    pub timestamp: u64,
    pub message: String,
    pub action: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TriggerStatsData {
    pub total_triggers: usize,
    pub active_triggers: usize,
    pub trigger_counts: std::collections::HashMap<String, usize>,
}

/// Load triggers configuration from .raven/config.toml
#[tauri::command]
pub async fn get_triggers_config() -> Result<Vec<TriggerRuleData>, String> {
    use crate::modules::triggers::load_config;

    let project_dir = std::env::current_dir()
        .map_err(|e| format!("Failed to get current directory: {}", e))?;
    let raven_dir = project_dir.join(".raven");

    let config = load_config(&raven_dir)
        .map_err(|e| format!("Failed to load triggers config: {}", e))?;

    let rules: Vec<TriggerRuleData> = config.triggers.iter().map(|(name, rule)| {
        TriggerRuleData {
            name: name.clone(),
            file: rule.file.clone(),
            agent: rule.agent.clone(),
            event_type: rule.event_type.clone(),
            lines_changed: rule.lines_changed.clone(),
            duration_ms: rule.duration_ms.clone(),
            cpu_percent: rule.cpu_percent.clone(),
            memory_percent: rule.memory_percent.clone(),
            action: format!("{:?}", rule.action).to_lowercase(),
            message: rule.message.clone(),
            command: rule.command.clone(),
            cooldown_seconds: rule.cooldown_seconds,
        }
    }).collect();

    Ok(rules)
}

/// Get recent triggered events
#[tauri::command]
pub async fn get_triggered_events(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<TriggeredEventData>, String> {
    let trigger_engine = state.trigger_engine.lock().await;
    let limit = limit.unwrap_or(100);

    let events = trigger_engine.get_recent_triggers(limit).await;

    let result: Vec<TriggeredEventData> = events.iter().map(|e| {
        TriggeredEventData {
            trigger_name: e.trigger_name.clone(),
            timestamp: e.timestamp,
            message: e.message.clone(),
            action: format!("{:?}", e.action).to_lowercase(),
        }
    }).collect();

    Ok(result)
}

/// Get trigger statistics
#[tauri::command]
pub async fn get_trigger_stats(
    state: State<'_, AppState>,
) -> Result<TriggerStatsData, String> {
    let trigger_engine = state.trigger_engine.lock().await;
    let stats = trigger_engine.get_stats().await;

    Ok(TriggerStatsData {
        total_triggers: stats.total_triggers,
        active_triggers: stats.active_triggers,
        trigger_counts: stats.trigger_counts,
    })
}

/// Reload triggers configuration
#[tauri::command]
pub async fn reload_triggers_config(
    state: State<'_, AppState>,
) -> Result<String, String> {
    use crate::modules::triggers::load_config;

    let project_dir = std::env::current_dir()
        .map_err(|e| format!("Failed to get current directory: {}", e))?;
    let raven_dir = project_dir.join(".raven");

    let config = load_config(&raven_dir)
        .map_err(|e| format!("Failed to load triggers config: {}", e))?;

    let rule_count = config.triggers.len();

    let mut trigger_engine = state.trigger_engine.lock().await;
    trigger_engine.reload_config(config).await;

    Ok(format!("Reloaded {} trigger rules", rule_count))
}

/// Clear all trigger cooldowns
#[tauri::command]
pub async fn clear_trigger_cooldowns(
    state: State<'_, AppState>,
) -> Result<String, String> {
    let trigger_engine = state.trigger_engine.lock().await;
    trigger_engine.clear_cooldowns().await;

    Ok("All trigger cooldowns cleared".to_string())
}

// ==================== Agent Monitoring Commands ====================

use crate::modules::agent_monitor::AgentStatus;

#[derive(Debug, Serialize, Deserialize)]
pub struct AgentStatusData {
    pub agent_name: String,
    pub agent_type: String,
    pub is_running: bool,
    pub last_seen: Option<String>,
    pub models_available: Vec<String>,
    pub requests_handled: u64,
    pub errors: u64,
    pub color: String,
}

/// Get status of all monitored agents
#[tauri::command]
pub async fn get_agents_status(
    state: State<'_, AppState>,
) -> Result<Vec<AgentStatusData>, String> {
    let registry = state.agent_registry.lock().await;
    let statuses = registry.get_all_status().await;

    let result: Vec<AgentStatusData> = statuses.iter().map(|s| {
        AgentStatusData {
            agent_name: s.agent_name.clone(),
            agent_type: s.agent_type.as_str().to_string(),
            is_running: s.is_running,
            last_seen: s.last_seen.clone(),
            models_available: s.models_available.clone(),
            requests_handled: s.requests_handled,
            errors: s.errors,
            color: s.agent_type.color().to_string(),
        }
    }).collect();

    Ok(result)
}

/// Get agent count
#[tauri::command]
pub async fn get_agent_count(
    state: State<'_, AppState>,
) -> Result<usize, String> {
    let registry = state.agent_registry.lock().await;
    Ok(registry.agent_count())
}

// ==================== Dashboard Statistics Commands ====================

#[derive(Debug, Serialize, Deserialize)]
pub struct FileStatData {
    pub filepath: String,
    pub edit_count: usize,
    pub total_lines_changed: usize,
    pub last_modified: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LongestEditData {
    pub filepath: String,
    pub lines_changed: i64,
    pub timestamp: String,
    pub agent: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DashboardStatsData {
    pub total_events: usize,
    pub total_files: usize,
    pub total_agents: usize,
    pub session_duration_seconds: i64,
    pub active_files_today: usize,
}

/// Get top modified files
#[tauri::command]
pub async fn get_top_modified_files(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<FileStatData>, String> {
    let db = state.db.lock().await;
    let event_logger = state.event_logger.lock().await;
    let session_id = event_logger.session_id();

    let events = db.get_events_by_session(session_id)
        .map_err(|e| format!("Failed to get events: {}", e))?;

    // Count edits per file
    let mut file_stats: std::collections::HashMap<String, (usize, usize, String)> =
        std::collections::HashMap::new();

    for event in events {
        if let Some(filepath) = &event.filepath {
            let entry = file_stats.entry(filepath.clone())
                .or_insert((0, 0, event.timestamp.clone()));

            entry.0 += 1; // Increment edit count
            // Update last modified
            if event.timestamp > entry.2 {
                entry.2 = event.timestamp.clone();
            }
        }
    }

    // Convert to vec and sort by edit count
    let mut stats: Vec<FileStatData> = file_stats.iter().map(|(path, (count, _, last_mod))| {
        FileStatData {
            filepath: path.clone(),
            edit_count: *count,
            total_lines_changed: 0, // TODO: Calculate from diffs
            last_modified: last_mod.clone(),
        }
    }).collect();

    stats.sort_by(|a, b| b.edit_count.cmp(&a.edit_count));

    let limit = limit.unwrap_or(10);
    Ok(stats.into_iter().take(limit).collect())
}

/// Get longest edits
#[tauri::command]
pub async fn get_longest_edits(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<LongestEditData>, String> {
    let db = state.db.lock().await;

    // Query agent events for longest operations
    let agent_events = db.get_recent_agent_events(10000)
        .map_err(|e| format!("Failed to get agent events: {}", e))?;

    let mut edits: Vec<LongestEditData> = agent_events.iter()
        .filter(|e| e.lines_changed.is_some())
        .map(|e| LongestEditData {
            filepath: e.file.clone().unwrap_or_default(),
            lines_changed: e.lines_changed.unwrap_or(0) as i64,
            timestamp: e.timestamp.clone(),
            agent: Some(e.agent.clone()),
        })
        .collect();

    edits.sort_by(|a, b| b.lines_changed.cmp(&a.lines_changed));

    let limit = limit.unwrap_or(10);
    Ok(edits.into_iter().take(limit).collect())
}

/// Get dashboard statistics
#[tauri::command]
pub async fn get_dashboard_stats(
    state: State<'_, AppState>,
) -> Result<DashboardStatsData, String> {
    let db = state.db.lock().await;
    let event_logger = state.event_logger.lock().await;
    let session_id = event_logger.session_id();

    let events = db.get_events_by_session(session_id)
        .map_err(|e| format!("Failed to get events: {}", e))?;

    let tracked_files = db.get_tracked_files()
        .map_err(|e| format!("Failed to get tracked files: {}", e))?;

    let registry = state.agent_registry.lock().await;
    let agent_count = registry.agent_count();

    // Calculate session duration
    let session_duration = if !events.is_empty() {
        let first = &events[0];
        let last = &events[events.len() - 1];

        let first_time = chrono::DateTime::parse_from_rfc3339(&first.timestamp)
            .unwrap_or_else(|_| chrono::Utc::now().into());
        let last_time = chrono::DateTime::parse_from_rfc3339(&last.timestamp)
            .unwrap_or_else(|_| chrono::Utc::now().into());

        (last_time - first_time).num_seconds()
    } else {
        0
    };

    // Count active files today
    let today = chrono::Utc::now().date_naive();
    let active_today = events.iter()
        .filter(|e| {
            if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(&e.timestamp) {
                dt.date_naive() == today
            } else {
                false
            }
        })
        .filter_map(|e| e.filepath.as_ref())
        .collect::<std::collections::HashSet<_>>()
        .len();

    Ok(DashboardStatsData {
        total_events: events.len(),
        total_files: tracked_files.len(),
        total_agents: agent_count,
        session_duration_seconds: session_duration,
        active_files_today: active_today,
    })
}
