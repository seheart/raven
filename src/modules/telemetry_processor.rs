use anyhow::{Context, Result};
use chrono::Utc;
use std::path::{Path, PathBuf};
use tokio::sync::mpsc;
use tracing::{error, info};

use super::db::Database;
use super::telemetry_listener::AgentEvent;

/// Telemetry processor that consumes events and stores them in the database
pub struct TelemetryProcessor {
    db: Database,
    db_path: PathBuf,
    session_id: String,
}

impl TelemetryProcessor {
    /// Create a new telemetry processor
    pub fn new(db_path: &Path, session_id: String) -> Result<Self> {
        let db = Database::new(db_path)
            .context("Failed to create database connection")?;

        Ok(Self {
            db,
            db_path: db_path.to_path_buf(),
            session_id
        })
    }

    /// Start processing events from the receiver channel
    pub async fn start(mut self, mut event_rx: mpsc::Receiver<AgentEvent>) -> Result<()> {
        info!("Telemetry processor started with session_id: {}", self.session_id);

        while let Some(event) = event_rx.recv().await {
            // Use spawn_blocking for database operations since SQLite is synchronous
            let session_id = self.session_id.clone();
            let db_path = self.db_path.clone();

            if let Err(e) = tokio::task::spawn_blocking(move || {
                let db = Database::new(&db_path)?;
                let timestamp = Utc::now().to_rfc3339();

                // Serialize metadata to JSON if present
                let metadata_json = if let Some(metadata) = &event.metadata {
                    Some(serde_json::to_string(metadata)?)
                } else {
                    None
                };

                // Insert into database
                let event_id = db.insert_agent_event(
                    &timestamp,
                    &event.agent,
                    &event.event,
                    event.file.as_deref(),
                    event.lines_changed,
                    event.duration_ms,
                    &event.message,
                    metadata_json.as_deref(),
                    Some(&session_id),
                )?;

                info!(
                    "Stored agent event #{} - {} ({}) - {}",
                    event_id, event.agent, event.event, event.message
                );

                Ok::<(), anyhow::Error>(())
            }).await {
                error!("Failed to process telemetry event: {:?}", e);
            }
        }

        info!("Telemetry processor stopped");
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
