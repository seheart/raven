use super::agent_monitor::{AgentConfig, AgentEvent, AgentMonitor, AgentStatus, AgentType, EventType};
use anyhow::{Context, Result};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tracing::{info, warn, error};

#[derive(Debug, Clone, Deserialize)]
struct LMStudioModelsResponse {
    data: Vec<LMStudioModel>,
}

#[derive(Debug, Clone, Deserialize)]
struct LMStudioModel {
    id: String,
}

/// LM Studio agent adapter
/// Monitors LM Studio via its local REST API (usually localhost:1234)
pub struct LMStudioAdapter {
    base_url: String,
    config: AgentConfig,
    is_running: bool,
    last_seen: Option<String>,
    models_available: Vec<String>,
    requests_handled: u64,
    errors: u64,
    last_poll_time: u64,
    log_path: Option<PathBuf>,
}

impl LMStudioAdapter {
    pub fn new(base_url: Option<String>, log_path: Option<PathBuf>, config: AgentConfig) -> Self {
        Self {
            base_url: base_url.unwrap_or_else(|| "http://localhost:1234".to_string()),
            config,
            is_running: false,
            last_seen: None,
            models_available: Vec::new(),
            requests_handled: 0,
            errors: 0,
            last_poll_time: 0,
            log_path,
        }
    }

    /// Check if LM Studio is accessible
    async fn check_health(&self) -> Result<bool> {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_millis(self.config.timeout_ms))
            .build()?;

        // Try to access the models endpoint
        let response = client
            .get(format!("{}/v1/models", self.base_url))
            .send()
            .await;

        match response {
            Ok(resp) => Ok(resp.status().is_success()),
            Err(_) => Ok(false),
        }
    }

    /// Fetch available models from LM Studio
    async fn fetch_models(&self) -> Result<Vec<String>> {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_millis(self.config.timeout_ms))
            .build()?;

        let response = client
            .get(format!("{}/v1/models", self.base_url))
            .send()
            .await
            .context("Failed to connect to LM Studio")?;

        if !response.status().is_success() {
            return Ok(Vec::new());
        }

        let models_response: LMStudioModelsResponse = response
            .json()
            .await
            .context("Failed to parse LM Studio models response")?;

        Ok(models_response.data.iter().map(|m| m.id.clone()).collect())
    }

    fn current_timestamp() -> String {
        chrono::Utc::now().to_rfc3339()
    }

    fn unix_timestamp() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
    }
}

#[async_trait]
impl AgentMonitor for LMStudioAdapter {
    async fn start(&mut self) -> Result<()> {
        info!("Starting LM Studio adapter at {}", self.base_url);

        // Check if LM Studio is accessible
        let is_healthy = self.check_health().await?;

        if !is_healthy {
            warn!("LM Studio is not accessible at {}", self.base_url);
            self.is_running = false;
            return Ok(());
        }

        // Fetch available models
        match self.fetch_models().await {
            Ok(models) => {
                self.models_available = models.clone();
                info!("Discovered {} LM Studio models: {:?}", models.len(), models);
            }
            Err(e) => {
                warn!("Failed to fetch LM Studio models: {}", e);
            }
        }

        self.is_running = true;
        self.last_seen = Some(Self::current_timestamp());
        info!("LM Studio adapter started successfully");

        Ok(())
    }

    async fn stop(&mut self) -> Result<()> {
        info!("Stopping LM Studio adapter");
        self.is_running = false;
        Ok(())
    }

    async fn is_running(&self) -> bool {
        self.is_running && self.check_health().await.unwrap_or(false)
    }

    async fn get_status(&self) -> Result<AgentStatus> {
        let is_running = self.check_health().await.unwrap_or(false);

        Ok(AgentStatus {
            agent_name: self.agent_name(),
            agent_type: AgentType::LMStudio,
            is_running,
            last_seen: self.last_seen.clone(),
            models_available: self.models_available.clone(),
            requests_handled: self.requests_handled,
            errors: self.errors,
        })
    }

    async fn poll_events(&mut self) -> Result<Vec<AgentEvent>> {
        let now = Self::unix_timestamp();

        // Respect poll interval
        if now - self.last_poll_time < (self.config.poll_interval_ms / 1000) {
            return Ok(Vec::new());
        }

        self.last_poll_time = now;

        let mut events = Vec::new();

        // Check if LM Studio is running
        let is_healthy = self.check_health().await.unwrap_or(false);

        if !is_healthy {
            if self.is_running {
                // LM Studio went offline
                self.is_running = false;
                error!("LM Studio went offline");
            }
            return Ok(events);
        }

        // LM Studio came online
        if !self.is_running {
            self.is_running = true;
            self.last_seen = Some(Self::current_timestamp());
            info!("LM Studio came online");

            // Refresh models list
            if let Ok(models) = self.fetch_models().await {
                self.models_available = models.clone();
            }

            // Generate heartbeat event
            events.push(AgentEvent {
                agent_name: self.agent_name(),
                agent_type: AgentType::LMStudio,
                event_type: EventType::Heartbeat,
                timestamp: Self::current_timestamp(),
                model: None,
                prompt: None,
                response: None,
                file: None,
                duration_ms: None,
                tokens_used: None,
                metadata: Some(serde_json::json!({
                    "status": "online",
                    "models_available": self.models_available.len(),
                    "base_url": self.base_url,
                })),
            });
        }

        // Update last seen
        self.last_seen = Some(Self::current_timestamp());

        Ok(events)
    }

    fn agent_type(&self) -> AgentType {
        AgentType::LMStudio
    }

    fn agent_name(&self) -> String {
        "lmstudio".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_lmstudio_adapter_creation() {
        let config = AgentConfig::default();
        let adapter = LMStudioAdapter::new(None, None, config);

        assert_eq!(adapter.base_url, "http://localhost:1234");
        assert_eq!(adapter.agent_name(), "lmstudio");
        assert_eq!(adapter.agent_type(), AgentType::LMStudio);
    }

    #[tokio::test]
    async fn test_custom_base_url() {
        let config = AgentConfig::default();
        let adapter = LMStudioAdapter::new(
            Some("http://localhost:5000".to_string()),
            None,
            config
        );

        assert_eq!(adapter.base_url, "http://localhost:5000");
    }
}
