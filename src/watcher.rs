use std::path::{Path, PathBuf};
use std::collections::HashMap;
use std::sync::Arc;
use notify::{Event, EventKind, RecursiveMode, Watcher};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, FileIdMap};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;
use tracing::{info, warn, error, debug};
use anyhow::Result;

use crate::state::AppState;

/// Start watching the configured directory for file changes
pub async fn start_watching(app_handle: AppHandle) -> Result<()> {
    info!("Initializing file watcher...");

    // Get app state
    let state = app_handle.state::<AppState>();
    let watch_path = state.watch_path.clone();

    // Verify watch path exists
    if !watch_path.exists() {
        error!("Watch path does not exist: {:?}", watch_path);
        return Err(anyhow::anyhow!("Watch path does not exist"));
    }

    info!("Watching directory: {:?}", watch_path);

    // Store file contents for diff generation
    let file_cache: Arc<Mutex<HashMap<PathBuf, String>>> = Arc::new(Mutex::new(HashMap::new()));

    // Clone references for the callback
    let app_handle_clone = app_handle.clone();
    let file_cache_clone = file_cache.clone();

    // Create debounced watcher with 50ms debounce
    let mut debouncer = new_debouncer(
        Duration::from_millis(50),
        None,
        move |result: DebounceEventResult| {
            let app_handle = app_handle_clone.clone();
            let file_cache = file_cache_clone.clone();

            tauri::async_runtime::spawn(async move {
                if let Err(e) = handle_file_events(result, app_handle, file_cache).await {
                    error!("Error handling file events: {}", e);
                }
            });
        },
    )?;

    // Start watching
    debouncer
        .watcher()
        .watch(&watch_path, RecursiveMode::Recursive)?;

    info!("File watcher active on {:?}", watch_path);

    // Keep watcher alive
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(60)).await;
            debug!("File watcher still running...");
        }
    });

    Ok(())
}

/// Handle debounced file events
async fn handle_file_events(
    result: DebounceEventResult,
    app_handle: AppHandle,
    file_cache: Arc<Mutex<HashMap<PathBuf, String>>>,
) -> Result<()> {
    match result {
        Ok(events) => {
            for event in events {
                if let Err(e) = process_event(event.event, &app_handle, &file_cache).await {
                    warn!("Failed to process event: {}", e);
                }
            }
        }
        Err(errors) => {
            for error in errors {
                warn!("Watch error: {:?}", error);
            }
        }
    }

    Ok(())
}

/// Process a single file event
async fn process_event(
    event: Event,
    app_handle: &AppHandle,
    file_cache: &Arc<Mutex<HashMap<PathBuf, String>>>,
) -> Result<()> {
    let state = app_handle.state::<AppState>();

    // Determine change type
    let change_type = match event.kind {
        EventKind::Create(_) => "created",
        EventKind::Modify(_) => "modified",
        EventKind::Remove(_) => "deleted",
        _ => return Ok(()), // Ignore other event types
    };

    // Process each path in the event
    for path in event.paths {
        // Skip directories
        if path.is_dir() {
            continue;
        }

        // Skip ignored patterns
        if should_ignore(&path) {
            continue;
        }

        info!("File {}: {:?}", change_type, path);

        // Get old content from cache
        let mut cache = file_cache.lock().await;
        let old_content = cache.get(&path).cloned();

        // Get new content
        let new_content = if path.exists() {
            match std::fs::read_to_string(&path) {
                Ok(content) => {
                    cache.insert(path.clone(), content.clone());
                    Some(content)
                }
                Err(e) => {
                    warn!("Failed to read file {:?}: {}", path, e);
                    None
                }
            }
        } else {
            // File was deleted
            cache.remove(&path);
            None
        };

        // Log the event
        let mut event_logger = state.event_logger.lock().await;
        if let Err(e) = event_logger.log_change(
            &path,
            change_type,
            old_content.as_deref(),
            new_content.as_deref(),
        ) {
            error!("Failed to log event: {}", e);
        }

        // Emit event to frontend
        let event_data = serde_json::json!({
            "filepath": path.to_string_lossy().to_string(),
            "changeType": change_type,
            "timestamp": chrono::Utc::now().to_rfc3339(),
        });

        if let Err(e) = app_handle.emit("file-event", event_data) {
            error!("Failed to emit event to frontend: {}", e);
        }
    }

    Ok(())
}

/// Check if a path should be ignored based on common patterns
fn should_ignore(path: &Path) -> bool {
    let path_str = path.to_string_lossy();

    // Ignore patterns from config
    let ignore_patterns = [
        "/node_modules/",
        "/.git/",
        "/target/",
        "/.raven/",
        ".log",
        "/dist/",
        "/.cache/",
        ".swp",
        ".swo",
        "~",
    ];

    for pattern in &ignore_patterns {
        if path_str.contains(pattern) {
            return true;
        }
    }

    false
}
