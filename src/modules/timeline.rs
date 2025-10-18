use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use tracing::{debug, info};

use super::db::Database;

/// Timeline entry combining events, snapshots, and metrics
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum TimelineEntry {
    FileEvent {
        id: i64,
        timestamp: String,
        filepath: String,
        change_type: String,
        diff: Option<String>,
        has_snapshot: bool,
        snapshot_id: Option<i64>,
        cpu: f64,
        mem: f64,
    },
    AgentEvent {
        id: i64,
        timestamp: String,
        agent: String,
        event_type: String,
        file: Option<String>,
        lines_changed: Option<u32>,
        duration_ms: Option<u64>,
        message: String,
        system_cpu: Option<f64>,
        system_mem: Option<f64>,
    },
    MetricsSnapshot {
        id: i64,
        timestamp: String,
        cpu_percent: f64,
        memory_percent: f64,
        memory_used_mb: u64,
        process_count: usize,
    },
}

impl TimelineEntry {
    /// Get the timestamp of this entry
    pub fn timestamp(&self) -> &str {
        match self {
            TimelineEntry::FileEvent { timestamp, .. } => timestamp,
            TimelineEntry::AgentEvent { timestamp, .. } => timestamp,
            TimelineEntry::MetricsSnapshot { timestamp, .. } => timestamp,
        }
    }

    /// Get a summary string for this entry
    pub fn summary(&self) -> String {
        match self {
            TimelineEntry::FileEvent { filepath, change_type, .. } => {
                format!("{} - {}", change_type, filepath)
            }
            TimelineEntry::AgentEvent { agent, event_type, message, .. } => {
                format!("{} {} - {}", agent, event_type, message)
            }
            TimelineEntry::MetricsSnapshot { cpu_percent, memory_percent, .. } => {
                format!("CPU: {:.1}%, Mem: {:.1}%", cpu_percent, memory_percent)
            }
        }
    }
}

/// Timeline configuration
#[derive(Debug, Clone)]
pub struct TimelineConfig {
    /// Include file events in timeline
    pub include_file_events: bool,

    /// Include agent telemetry events
    pub include_agent_events: bool,

    /// Include metrics snapshots (sampled every N entries)
    pub include_metrics: bool,

    /// Sample metrics every N seconds (e.g., 30 = one metrics entry per 30 seconds)
    pub metrics_sample_interval: i64,
}

impl Default for TimelineConfig {
    fn default() -> Self {
        Self {
            include_file_events: true,
            include_agent_events: true,
            include_metrics: true,
            metrics_sample_interval: 30, // One metrics snapshot per 30 seconds
        }
    }
}

/// Timeline service for aggregating and querying events
pub struct TimelineService {
    db: Database,
    config: TimelineConfig,
}

impl TimelineService {
    /// Create a new timeline service
    pub fn new(db_path: &Path, config: TimelineConfig) -> Result<Self> {
        let db = Database::new(db_path)?;
        info!("Timeline service initialized");
        Ok(Self { db, config })
    }

    /// Get timeline entries for a session
    pub fn get_session_timeline(&self, session_id: &str, limit: i64) -> Result<Vec<TimelineEntry>> {
        let mut entries = Vec::new();

        // Get file events
        if self.config.include_file_events {
            let file_events = self.db.get_events_by_session(session_id)?;

            for event in file_events.into_iter().take(limit as usize) {
                if let Some(filepath) = event.filepath {
                    entries.push(TimelineEntry::FileEvent {
                        id: event.id,
                        timestamp: event.timestamp,
                        filepath,
                        change_type: event.change_type,
                        diff: event.diff,
                        has_snapshot: true, // We create snapshots for all events
                        snapshot_id: Some(event.id),
                        cpu: event.cpu,
                        mem: event.mem,
                    });
                }
            }
        }

        // Get agent events
        if self.config.include_agent_events {
            let agent_events = self.db.get_recent_agent_events(limit)?;

            for event in agent_events {
                entries.push(TimelineEntry::AgentEvent {
                    id: event.id,
                    timestamp: event.timestamp.clone(),
                    agent: event.agent,
                    event_type: event.event_type,
                    file: event.file,
                    lines_changed: event.lines_changed,
                    duration_ms: event.duration_ms,
                    message: event.message,
                    system_cpu: None, // Will be filled by correlation
                    system_mem: None,
                });
            }
        }

        // Get sampled metrics snapshots
        if self.config.include_metrics {
            let all_metrics = self.db.get_recent_system_metrics(limit)?;

            // Sample metrics at configured interval
            let mut last_timestamp: Option<DateTime<Utc>> = None;

            for metric in all_metrics {
                let timestamp = DateTime::parse_from_rfc3339(&metric.timestamp)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now());

                let should_include = if let Some(last) = last_timestamp {
                    let duration = timestamp.signed_duration_since(last);
                    duration.num_seconds() >= self.config.metrics_sample_interval
                } else {
                    true
                };

                if should_include {
                    entries.push(TimelineEntry::MetricsSnapshot {
                        id: metric.id,
                        timestamp: metric.timestamp,
                        cpu_percent: metric.cpu_percent,
                        memory_percent: metric.memory_percent,
                        memory_used_mb: metric.memory_used_mb,
                        process_count: 0, // Could be enhanced with actual process count
                    });

                    last_timestamp = Some(timestamp);
                }
            }
        }

        // Sort all entries by timestamp
        entries.sort_by(|a, b| a.timestamp().cmp(b.timestamp()));

        debug!("Retrieved {} timeline entries", entries.len());

        Ok(entries)
    }

    /// Get timeline entries within a time range
    pub fn get_timeline_range(
        &self,
        start_time: &str,
        end_time: &str,
    ) -> Result<Vec<TimelineEntry>> {
        let mut entries = Vec::new();

        // Get file events in range
        if self.config.include_file_events {
            let file_events = self.db.get_events_by_time_range(start_time, end_time)?;

            for event in file_events {
                if let Some(filepath) = event.filepath {
                    entries.push(TimelineEntry::FileEvent {
                        id: event.id,
                        timestamp: event.timestamp,
                        filepath,
                        change_type: event.change_type,
                        diff: event.diff,
                        has_snapshot: true,
                        snapshot_id: Some(event.id),
                        cpu: event.cpu,
                        mem: event.mem,
                    });
                }
            }
        }

        // Sort by timestamp
        entries.sort_by(|a, b| a.timestamp().cmp(b.timestamp()));

        Ok(entries)
    }

    /// Get timeline entries grouped by file
    pub fn get_file_timeline(&self, filepath: &str) -> Result<Vec<TimelineEntry>> {
        let mut entries = Vec::new();

        // Get all events for this file
        let file_events = self.db.get_file_history(filepath)?;

        for event in file_events {
            if let Some(fp) = event.filepath {
                entries.push(TimelineEntry::FileEvent {
                    id: event.id,
                    timestamp: event.timestamp,
                    filepath: fp,
                    change_type: event.change_type,
                    diff: event.diff,
                    has_snapshot: true,
                    snapshot_id: Some(event.id),
                    cpu: event.cpu,
                    mem: event.mem,
                });
            }
        }

        Ok(entries)
    }

    /// Get timeline statistics
    pub fn get_timeline_stats(&self, session_id: &str) -> Result<TimelineStats> {
        let file_events = self.db.get_events_by_session(session_id)?;
        let agent_events = self.db.get_recent_agent_events(1000)?; // Large limit

        let file_event_count = file_events.len();
        let agent_event_count = agent_events.len();

        // Get unique files
        let unique_files: std::collections::HashSet<_> = file_events
            .iter()
            .filter_map(|e| e.filepath.as_ref())
            .collect();

        // Get unique agents
        let unique_agents: std::collections::HashSet<_> = agent_events
            .iter()
            .map(|e| &e.agent)
            .collect();

        // Get time range
        let start_time = file_events.first().map(|e| e.timestamp.clone());
        let end_time = file_events.last().map(|e| e.timestamp.clone());

        Ok(TimelineStats {
            total_events: file_event_count + agent_event_count,
            file_event_count,
            agent_event_count,
            unique_files_count: unique_files.len(),
            unique_agents_count: unique_agents.len(),
            start_time,
            end_time,
        })
    }

    /// Get reference to the database
    pub fn db(&self) -> &Database {
        &self.db
    }
}

/// Timeline statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelineStats {
    pub total_events: usize,
    pub file_event_count: usize,
    pub agent_event_count: usize,
    pub unique_files_count: usize,
    pub unique_agents_count: usize,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_timeline_service_creation() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");

        let config = TimelineConfig::default();
        let service = TimelineService::new(&db_path, config);

        assert!(service.is_ok());
    }

    #[test]
    fn test_timeline_entry_timestamp() {
        let entry = TimelineEntry::FileEvent {
            id: 1,
            timestamp: "2025-10-17T12:00:00Z".to_string(),
            filepath: "test.rs".to_string(),
            change_type: "modified".to_string(),
            diff: None,
            has_snapshot: true,
            snapshot_id: Some(1),
            cpu: 10.0,
            mem: 20.0,
        };

        assert_eq!(entry.timestamp(), "2025-10-17T12:00:00Z");
    }
}
