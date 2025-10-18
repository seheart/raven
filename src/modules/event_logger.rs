use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tracing::{info, error};
use anyhow::Result;

use super::db::Database;
use super::metrics::MetricsCollector;
use super::diff_engine;

/// Event logger that captures file changes and system metrics
pub struct EventLogger {
    db: Database,
    metrics: MetricsCollector,
    session_id: String,
    snapshots_dir: PathBuf,
}

impl EventLogger {
    /// Create a new event logger
    pub fn new(db_path: &Path, snapshots_dir: &Path) -> Result<Self> {
        let db = Database::new(db_path)?;
        let metrics = MetricsCollector::new();
        let session_id = Utc::now().format("%Y%m%d_%H%M%S").to_string();

        // Create snapshots directory
        fs::create_dir_all(snapshots_dir)?;

        info!("EventLogger initialized with session_id: {}", session_id);

        Ok(Self {
            db,
            metrics,
            session_id,
            snapshots_dir: snapshots_dir.to_path_buf(),
        })
    }

    /// Log a file change event
    pub fn log_change(
        &mut self,
        filepath: &Path,
        change_type: &str,
        old_content: Option<&str>,
        new_content: Option<&str>,
    ) -> Result<()> {
        let timestamp = Utc::now().to_rfc3339();
        let (cpu, mem) = self.metrics.collect();

        // Generate diff if both old and new content exist
        let diff = if let (Some(old), Some(new)) = (old_content, new_content) {
            Some(diff_engine::generate_diff(old, new, 3))
        } else {
            None
        };

        // Save to database
        let event_id = self.db.insert_event(
            &timestamp,
            filepath.to_str(),
            change_type,
            diff.as_deref(),
            cpu,
            mem,
            Some(&self.session_id),
        )?;

        info!(
            "Logged event #{}: {} - {:?} (CPU: {:.1}%, MEM: {:.1}%)",
            event_id, change_type, filepath, cpu, mem
        );

        // Save snapshot if there's new content
        if let Some(content) = new_content {
            self.save_snapshot(event_id, filepath, content)?;
        }

        Ok(())
    }

    /// Save a snapshot of file content
    fn save_snapshot(&self, event_id: i64, filepath: &Path, content: &str) -> Result<()> {
        let snapshot_name = format!("{}_{}.snapshot", event_id, filepath.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown"));

        let snapshot_path = self.snapshots_dir.join(snapshot_name);

        fs::write(&snapshot_path, content)?;
        info!("Snapshot saved: {:?}", snapshot_path);

        Ok(())
    }

    /// Get current session ID
    pub fn session_id(&self) -> &str {
        &self.session_id
    }

    /// Get snapshot content for a specific event ID
    pub fn get_snapshot(&self, event_id: i64, filename: &str) -> Result<String> {
        let snapshot_name = format!("{}_{}.snapshot", event_id, filename);
        let snapshot_path = self.snapshots_dir.join(snapshot_name);

        if !snapshot_path.exists() {
            return Err(anyhow::anyhow!("Snapshot not found for event #{}", event_id));
        }

        let content = fs::read_to_string(&snapshot_path)?;
        Ok(content)
    }

    /// Restore a file to a specific event state
    pub fn restore_file(&self, event_id: i64, target_path: &Path) -> Result<()> {
        // Get the event from database
        let event = self.db.get_event_by_id(event_id)?
            .ok_or_else(|| anyhow::anyhow!("Event #{} not found", event_id))?;

        let filepath = event.filepath
            .ok_or_else(|| anyhow::anyhow!("Event has no associated file"))?;

        // Get filename
        let filename = Path::new(&filepath)
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| anyhow::anyhow!("Invalid filename"))?;

        // Get snapshot content
        let content = self.get_snapshot(event_id, filename)?;

        // Write to target path
        fs::write(target_path, content)?;

        info!("Restored file to event #{}: {:?}", event_id, target_path);
        Ok(())
    }

    /// Get file history for a specific path
    pub fn get_file_history(&self, filepath: &str) -> Result<Vec<super::db::Event>> {
        Ok(self.db.get_file_history(filepath)?)
    }

    /// List all tracked files
    pub fn get_tracked_files(&self) -> Result<Vec<String>> {
        Ok(self.db.get_tracked_files()?)
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileEvent {
    pub timestamp: String,
    pub filepath: String,
    pub change_type: String,
    pub cpu: f64,
    pub mem: f64,
}
