use anyhow::{Context, Result};
use chrono::Utc;
use std::path::Path;
use tokio::sync::mpsc;
use tracing::{error, info};

use super::db::Database;
use super::telemetry_listener::AgentEvent;

/// Telemetry processor that consumes events and stores them in the database
pub struct TelemetryProcessor {
    db: Database,
    session_id: String,
}

impl TelemetryProcessor {
    /// Create a new telemetry processor
    pub fn new(db_path: &Path, session_id: String) -> Result<Self> {
        let db = Database::new(db_path)
            .context("Failed to create database connection")?;

        Ok(Self { db, session_id })
    }

    /// Start processing events from the receiver channel
    pub async fn start(&self, mut event_rx: mpsc::Receiver<AgentEvent>) -> Result<()> {
        info!("Telemetry processor started with session_id: {}", self.session_id);

        while let Some(event) = event_rx.recv().await {
            if let Err(e) = self.process_event(event).await {
                error!("Failed to process telemetry event: {}", e);
            }
        }

        info!("Telemetry processor stopped");
        Ok(())
    }

    /// Process a single agent event
    async fn process_event(&self, event: AgentEvent) -> Result<()> {
        let timestamp = Utc::now().to_rfc3339();

        // Serialize metadata to JSON if present
        let metadata_json = if let Some(metadata) = &event.metadata {
            Some(serde_json::to_string(metadata)?)
        } else {
            None
        };

        // Insert into database
        let event_id = self.db.insert_agent_event(
            &timestamp,
            &event.agent,
            &event.event,
            event.file.as_deref(),
            event.lines_changed,
            event.duration_ms,
            &event.message,
            metadata_json.as_deref(),
            Some(&self.session_id),
        )?;

        info!(
            "Stored agent event #{} - {} ({}) - {}",
            event_id, event.agent, event.event, event.message
        );

        Ok(())
    }

    /// Get reference to the database
    pub fn db(&self) -> &Database {
        &self.db
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_telemetry_processor_creation() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");

        let processor = TelemetryProcessor::new(&db_path, "test-session".to_string());
        assert!(processor.is_ok());
    }

    #[tokio::test]
    async fn test_process_event() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");

        let processor = TelemetryProcessor::new(&db_path, "test-session".to_string()).unwrap();

        let event = AgentEvent {
            agent: "claude".to_string(),
            event: "edit".to_string(),
            file: Some("test.rs".to_string()),
            lines_changed: Some(10),
            duration_ms: Some(500),
            message: "Test edit".to_string(),
            auth_token: None,
            metadata: None,
        };

        let result = processor.process_event(event).await;
        assert!(result.is_ok());

        // Verify event was stored
        let events = processor.db().get_recent_agent_events(10).unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].agent, "claude");
        assert_eq!(events[0].event_type, "edit");
    }
}
