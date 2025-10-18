use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::AtomicBool;
use tokio::sync::Mutex;
use anyhow::Result;

use crate::modules::db::Database;
use crate::modules::event_logger::EventLogger;
use crate::modules::metrics::MetricsCollector;
use crate::modules::trigger_engine::TriggerEngine;
use crate::modules::triggers::TriggersConfig;
use crate::modules::agent_monitor::AgentRegistry;

/// Application state shared across all Tauri commands and background tasks
pub struct AppState {
    pub event_logger: Arc<Mutex<EventLogger>>,
    pub metrics: Arc<Mutex<MetricsCollector>>,
    pub db: Arc<Mutex<Database>>,
    pub watch_path: PathBuf,
    pub telemetry_running: Arc<AtomicBool>,
    pub telemetry_socket_path: Arc<Mutex<PathBuf>>,
    pub trigger_engine: Arc<Mutex<TriggerEngine>>,
    pub agent_registry: Arc<Mutex<AgentRegistry>>,
}

impl AppState {
    /// Create new application state
    pub fn new(raven_dir: PathBuf, watch_path: PathBuf) -> Result<Self> {
        // Ensure .raven directories exist
        std::fs::create_dir_all(&raven_dir)?;
        std::fs::create_dir_all(raven_dir.join("db"))?;
        std::fs::create_dir_all(raven_dir.join("snapshots"))?;

        // Initialize database
        let db_path = raven_dir.join("db/raven.db");
        let db = Database::new(&db_path)?;

        // Initialize event logger
        let snapshots_dir = raven_dir.join("snapshots");
        let event_logger = EventLogger::new(&db_path, &snapshots_dir)?;

        // Initialize metrics collector
        let metrics = MetricsCollector::new();

        // Initialize telemetry state
        let telemetry_socket_path = PathBuf::from("/tmp/raven-telemetry.sock");

        // Initialize trigger engine
        let triggers_config = crate::modules::triggers::load_config(&raven_dir)
            .unwrap_or_else(|e| {
                eprintln!("Warning: Failed to load triggers config: {}", e);
                TriggersConfig::default()
            });
        let trigger_engine = TriggerEngine::new(triggers_config);

        // Initialize agent registry
        let agent_registry = AgentRegistry::new();

        Ok(Self {
            event_logger: Arc::new(Mutex::new(event_logger)),
            metrics: Arc::new(Mutex::new(metrics)),
            db: Arc::new(Mutex::new(db)),
            watch_path,
            telemetry_running: Arc::new(AtomicBool::new(false)),
            telemetry_socket_path: Arc::new(Mutex::new(telemetry_socket_path)),
            trigger_engine: Arc::new(Mutex::new(trigger_engine)),
            agent_registry: Arc::new(Mutex::new(agent_registry)),
        })
    }
}
