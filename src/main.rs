// Prevents additional console window on Windows in release builds
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod modules;
mod commands;
mod state;
mod watcher;

use tracing::{info, error};
use tracing_subscriber;
use tauri::Manager;

fn main() {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    info!("🦅 Raven starting...");

    // Determine paths
    let project_dir = std::env::current_dir().expect("Failed to get current directory");
    let raven_dir = project_dir.join(".raven");
    let watch_path = project_dir.join("test_workspace");

    info!("Project directory: {:?}", project_dir);
    info!("Raven data directory: {:?}", raven_dir);
    info!("Watch path: {:?}", watch_path);

    // Initialize application state
    let app_state = match state::AppState::new(raven_dir, watch_path.clone()) {
        Ok(state) => state,
        Err(e) => {
            error!("Failed to initialize app state: {}", e);
            panic!("Cannot start Raven: {}", e);
        }
    };

    info!("Application state initialized");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(app_state)
        .setup(|app| {
            // Start file watcher in background
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = watcher::start_watching(app_handle).await {
                    error!("File watcher error: {}", e);
                }
            });

            info!("File watcher started");

            // Start telemetry server in background
            let app_handle_telemetry = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                use modules::telemetry_listener::{TelemetryServer, TelemetryConfig};
                use modules::telemetry_processor::TelemetryProcessor;
                use std::sync::atomic::Ordering;

                let state = app_handle_telemetry.state::<state::AppState>();

                // Get paths
                let project_dir = std::env::current_dir().expect("Failed to get current directory");
                let raven_dir = project_dir.join(".raven");
                let db_path = raven_dir.join("db/raven.db");

                // Generate session ID
                let session_id = format!("telemetry-{}", chrono::Utc::now().timestamp());

                // Create telemetry config
                let config = TelemetryConfig::default();
                let socket_path = config.socket_path.clone();

                // Update state
                *state.telemetry_socket_path.lock().await = socket_path.clone();
                state.telemetry_running.store(true, Ordering::Relaxed);

                info!("Starting telemetry server at {:?}", socket_path);

                // Create server and processor
                let (server, event_rx) = TelemetryServer::new(config);

                match TelemetryProcessor::new(&db_path, session_id) {
                    Ok(processor) => {
                        // Spawn processor task
                        tauri::async_runtime::spawn(async move {
                            if let Err(e) = processor.start(event_rx).await {
                                error!("Telemetry processor error: {}", e);
                            }
                        });

                        // Start server (this blocks)
                        if let Err(e) = server.start().await {
                            error!("Telemetry server error: {}", e);
                            state.telemetry_running.store(false, Ordering::Relaxed);
                        }
                    }
                    Err(e) => {
                        error!("Failed to create telemetry processor: {}", e);
                        state.telemetry_running.store(false, Ordering::Relaxed);
                    }
                }
            });

            info!("Telemetry server starting...");

            // Start metrics sampler in background
            let app_handle_metrics = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                use modules::metrics_sampler::{MetricsSampler, SamplerConfig};

                // Get paths
                let project_dir = std::env::current_dir().expect("Failed to get current directory");
                let raven_dir = project_dir.join(".raven");
                let db_path = raven_dir.join("db/raven.db");

                // Create sampler config
                let config = SamplerConfig {
                    interval_seconds: 5, // Sample every 5 seconds
                    session_id: format!("perf-{}", chrono::Utc::now().timestamp()),
                    tracked_processes: vec![
                        "claude".to_string(),
                        "ollama".to_string(),
                        "python".to_string(),
                        "node".to_string(),
                    ],
                };

                info!("Starting metrics sampler ({}s interval)...", config.interval_seconds);

                match MetricsSampler::new(&db_path, config) {
                    Ok(mut sampler) => {
                        if let Err(e) = sampler.start().await {
                            error!("Metrics sampler error: {}", e);
                        }
                    }
                    Err(e) => {
                        error!("Failed to create metrics sampler: {}", e);
                    }
                }
            });

            info!("Metrics sampler starting...");

            // Start agent monitoring in background
            let app_handle_agents = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                use modules::agent_monitor::AgentConfig;
                use modules::ollama_adapter::OllamaAdapter;
                use modules::lmstudio_adapter::LMStudioAdapter;

                let state = app_handle_agents.state::<state::AppState>();

                info!("Starting agent monitoring...");

                // Create agent configs
                let config = AgentConfig::default();

                // Create Ollama adapter
                let ollama = Box::new(OllamaAdapter::new(None, config.clone()));

                // Create LM Studio adapter
                let lmstudio = Box::new(LMStudioAdapter::new(None, None, config.clone()));

                // Register agents
                let mut registry = state.agent_registry.lock().await;
                registry.register(ollama);
                registry.register(lmstudio);

                // Start all agents
                if let Err(e) = registry.start_all().await {
                    error!("Failed to start agent monitors: {}", e);
                } else {
                    info!("Agent monitors started: {} agents", registry.agent_count());
                }

                // Poll agents periodically
                let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(5));
                loop {
                    interval.tick().await;

                    // Poll all agents for events
                    let events = registry.poll_all_events().await;

                    if !events.is_empty() {
                        info!("Polled {} agent events", events.len());

                        // TODO: Store events in database or forward to telemetry processor
                    }
                }
            });

            info!("Agent monitoring starting...");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::greet,
            commands::get_recent_events,
            commands::get_metrics,
            commands::get_session_id,
            commands::get_file_history,
            commands::get_tracked_files,
            commands::get_snapshot,
            commands::restore_file,
            commands::get_agent_events,
            commands::get_events_by_agent,
            commands::get_agent_stats,
            commands::get_telemetry_status,
            commands::get_system_metrics,
            commands::get_process_metrics,
            commands::get_performance_correlations,
            commands::get_metrics_stats,
            commands::get_session_timeline,
            commands::get_timeline_range,
            commands::get_file_timeline,
            commands::get_timeline_stats,
            commands::get_triggers_config,
            commands::get_triggered_events,
            commands::get_trigger_stats,
            commands::reload_triggers_config,
            commands::clear_trigger_cooldowns,
            commands::get_agents_status,
            commands::get_agent_count,
            commands::get_top_modified_files,
            commands::get_longest_edits,
            commands::get_dashboard_stats,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
