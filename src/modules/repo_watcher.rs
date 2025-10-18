use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, FileIdMap};
use std::path::Path;
use std::time::Duration;
use tracing::{info, error};

/// Watches a target directory for file changes
pub struct RepoWatcher {
    debouncer: Debouncer<RecommendedWatcher, FileIdMap>,
}

impl RepoWatcher {
    /// Creates a new RepoWatcher with 50ms debounce
    pub fn new<F>(callback: F) -> anyhow::Result<Self>
    where
        F: Fn(DebounceEventResult) + Send + 'static,
    {
        let debouncer = new_debouncer(
            Duration::from_millis(50),
            None,
            callback,
        )?;

        info!("RepoWatcher initialized with 50ms debounce");
        Ok(Self { debouncer })
    }

    /// Start watching a directory
    pub fn watch(&mut self, path: &Path) -> anyhow::Result<()> {
        self.debouncer
            .watcher()
            .watch(path, RecursiveMode::Recursive)?;

        info!("Watching directory: {:?}", path);
        Ok(())
    }

    /// Stop watching a directory
    pub fn unwatch(&mut self, path: &Path) -> anyhow::Result<()> {
        self.debouncer.watcher().unwatch(path)?;
        info!("Stopped watching directory: {:?}", path);
        Ok(())
    }
}
