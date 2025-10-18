pub mod repo_watcher;
pub mod event_logger;
pub mod diff_engine;
pub mod metrics;
pub mod db;
pub mod telemetry_listener;
pub mod telemetry_processor;
pub mod metrics_sampler;
pub mod timeline;
pub mod triggers;
pub mod trigger_engine;
pub mod agent_monitor;
pub mod ollama_adapter;
pub mod lmstudio_adapter;

#[cfg(test)]
mod tests;
