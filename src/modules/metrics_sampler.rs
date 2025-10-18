use anyhow::Result;
use chrono::Utc;
use std::path::Path;
use std::time::Duration;
use tokio::time::interval;
use tracing::{debug, error, info};

use super::db::Database;
use super::metrics::MetricsCollector;

/// Configuration for metrics sampling
#[derive(Debug, Clone)]
pub struct SamplerConfig {
    /// Sampling interval in seconds
    pub interval_seconds: u64,

    /// Session ID for grouping metrics
    pub session_id: String,

    /// Process names to track (e.g., ["claude", "ollama", "python"])
    pub tracked_processes: Vec<String>,
}

impl Default for SamplerConfig {
    fn default() -> Self {
        Self {
            interval_seconds: 5, // Sample every 5 seconds
            session_id: format!("metrics-{}", Utc::now().timestamp()),
            tracked_processes: vec![
                "claude".to_string(),
                "ollama".to_string(),
                "python".to_string(),
            ],
        }
    }
}

/// Metrics sampler that periodically collects and stores performance data
pub struct MetricsSampler {
    collector: MetricsCollector,
    db: Database,
    config: SamplerConfig,
}

impl MetricsSampler {
    /// Create a new metrics sampler
    pub fn new(db_path: &Path, config: SamplerConfig) -> Result<Self> {
        let db = Database::new(db_path)?;
        let mut collector = MetricsCollector::new();

        // Discover tracked processes
        let process_names: Vec<&str> = config
            .tracked_processes
            .iter()
            .map(|s| s.as_str())
            .collect();

        collector.discover_processes(&process_names);

        info!(
            "Metrics sampler initialized with {}s interval",
            config.interval_seconds
        );

        Ok(Self {
            collector,
            db,
            config,
        })
    }

    /// Start the metrics sampling loop
    pub async fn start(&mut self) -> Result<()> {
        let mut ticker = interval(Duration::from_secs(self.config.interval_seconds));

        info!("Starting metrics sampler...");

        loop {
            ticker.tick().await;

            if let Err(e) = self.sample_and_store().await {
                error!("Error sampling metrics: {}", e);
            }
        }
    }

    /// Sample metrics once and store in database
    async fn sample_and_store(&mut self) -> Result<()> {
        let timestamp = Utc::now().to_rfc3339();

        // Collect system metrics
        let (cpu, mem) = self.collector.collect();
        let mem_info = self.collector.memory_info();
        let network_stats = self.collector.get_network_stats();

        // Store system metrics
        self.db.insert_system_metrics(
            &timestamp,
            cpu,
            mem,
            mem_info.used_mb,
            mem_info.total_mb,
            Some(network_stats.total_received_bytes),
            Some(network_stats.total_transmitted_bytes),
            Some(&self.config.session_id),
        )?;

        debug!(
            "Stored system metrics: CPU {:.1}%, Mem {:.1}%",
            cpu, mem
        );

        // Collect and store process metrics for tracked processes
        let process_stats = self.collector.get_all_process_stats();

        for stats in process_stats {
            self.db.insert_process_metrics(
                &timestamp,
                &stats.agent_name,
                stats.pid,
                stats.cpu_usage,
                stats.memory_mb,
                stats.virtual_memory_mb,
                Some(stats.disk_read_bytes),
                Some(stats.disk_write_bytes),
                &stats.status,
                Some(&self.config.session_id),
            )?;

            debug!(
                "Stored process metrics for {}: CPU {:.1}%, Mem {} MB",
                stats.agent_name, stats.cpu_usage, stats.memory_mb
            );
        }

        // Periodically rediscover processes (every 10 samples)
        // This helps track new processes that may have started
        static mut SAMPLE_COUNTER: u64 = 0;
        unsafe {
            SAMPLE_COUNTER += 1;
            if SAMPLE_COUNTER % 10 == 0 {
                let process_names: Vec<&str> = self
                    .config
                    .tracked_processes
                    .iter()
                    .map(|s| s.as_str())
                    .collect();
                self.collector.discover_processes(&process_names);
            }
        }

        Ok(())
    }

    /// Get reference to the metrics collector
    pub fn collector(&mut self) -> &mut MetricsCollector {
        &mut self.collector
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
    async fn test_sampler_creation() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");

        let config = SamplerConfig::default();
        let sampler = MetricsSampler::new(&db_path, config);

        assert!(sampler.is_ok());
    }

    #[tokio::test]
    async fn test_sample_and_store() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");

        let config = SamplerConfig::default();
        let mut sampler = MetricsSampler::new(&db_path, config).unwrap();

        // Sample once
        let result = sampler.sample_and_store().await;
        assert!(result.is_ok());

        // Verify data was stored
        let metrics = sampler.db().get_recent_system_metrics(10).unwrap();
        assert!(metrics.len() >= 1);
        assert!(metrics[0].cpu_percent >= 0.0);
    }
}
