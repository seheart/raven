use super::agent_monitor::{AgentConfig, AgentEvent, AgentMonitor, AgentStatus, AgentType, EventType};
use anyhow::{Context, Result};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use tracing::{info, warn, error};

#[derive(Debug, Clone, Deserialize)]
struct OllamaModel {
    name: String,
    modified_at: String,
    size: u64,
}

#[derive(Debug, Clone, Deserialize)]
struct OllamaModelsResponse {
    models: Vec<OllamaModel>,
}

#[derive(Debug, Clone, Deserialize)]
struct OllamaProcessResponse {
    models: Vec<OllamaRunningModel>,
}

#[derive(Debug, Clone, Deserialize)]
struct OllamaRunningModel {
    name: String,
    size: u64,
    #[serde(default)]
    expires_at: String,
}

/// Ollama agent adapter
pub struct OllamaAdapter {
    base_url: String,
    config: AgentConfig,
    is_running: bool,
    last_seen: Option<String>,
    models_available: Vec<String>,
    requests_handled: u64,
    errors: u64,
    last_poll_time: u64,
}

impl OllamaAdapter {
    pub fn new(base_url: Option<String>, config: AgentConfig) -> Self {
        Self {
            base_url: base_url.unwrap_or_else(|| "http://localhost:11434".to_string()),
            config,
            is_running: false,
            last_seen: None,
            models_available: Vec::new(),
            requests_handled: 0,
            errors: 0,
            last_poll_time: 0,
        }
    }

    /// Check if Ollama is accessible
    async fn check_health(&self) -> Result<bool> {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_millis(self.config.timeout_ms))
            .build()?;

        let response = client
            .get(format!("{}/api/tags", self.base_url))
            .send()
            .await;

        match response {
            Ok(resp) => Ok(resp.status().is_success()),
            Err(_) => Ok(false),
        }
    }

    /// Fetch available models from Ollama
    async fn fetch_models(&self) -> Result<Vec<String>> {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_millis(self.config.timeout_ms))
            .build()?;

        let response = client
            .get(format!("{}/api/tags", self.base_url))
            .send()
            .await
            .context("Failed to connect to Ollama")?;

        if !response.status().is_success() {
            return Ok(Vec::new());
        }

        let models_response: OllamaModelsResponse = response
            .json()
            .await
            .context("Failed to parse Ollama models response")?;

        Ok(models_response.models.iter().map(|m| m.name.clone()).collect())
    }

    /// Fetch currently running models (Ollama keeps recently used models in memory)
    async fn fetch_running_models(&self) -> Result<Vec<String>> {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_millis(self.config.timeout_ms))
            .build()?;

        let response = client
            .get(format!("{}/api/ps", self.base_url))
            .send()
            .await;

        match response {
            Ok(resp) if resp.status().is_success() => {
                let process_response: OllamaProcessResponse = resp
                    .json()
                    .await
                    .context("Failed to parse Ollama process response")?;

                Ok(process_response.models.iter().map(|m| m.name.clone()).collect())
            }
            _ => Ok(Vec::new()),
        }
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
impl AgentMonitor for OllamaAdapter {
    async fn start(&mut self) -> Result<()> {
        info!("Starting Ollama adapter at {}", self.base_url);

        // Check if Ollama is accessible
        let is_healthy = self.check_health().await?;

        if !is_healthy {
            warn!("Ollama is not accessible at {}", self.base_url);
            self.is_running = false;
            return Ok(());
        }

        // Fetch available models
        match self.fetch_models().await {
            Ok(models) => {
                self.models_available = models.clone();
                info!("Discovered {} Ollama models: {:?}", models.len(), models);
            }
            Err(e) => {
                warn!("Failed to fetch Ollama models: {}", e);
            }
        }

        self.is_running = true;
        self.last_seen = Some(Self::current_timestamp());
        info!("Ollama adapter started successfully");

        Ok(())
    }

    async fn stop(&mut self) -> Result<()> {
        info!("Stopping Ollama adapter");
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
            agent_type: AgentType::Ollama,
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

        // Check if Ollama is running
        let is_healthy = self.check_health().await.unwrap_or(false);

        if !is_healthy {
            if self.is_running {
                // Ollama went offline
                self.is_running = false;
                error!("Ollama went offline");
            }
            return Ok(events);
        }

        // Ollama came online
        if !self.is_running {
            self.is_running = true;
            self.last_seen = Some(Self::current_timestamp());
            info!("Ollama came online");

            // Generate heartbeat event
            events.push(AgentEvent {
                agent_name: self.agent_name(),
                agent_type: AgentType::Ollama,
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
                })),
            });
        }

        // Check for running models
        match self.fetch_running_models().await {
            Ok(running_models) => {
                if !running_models.is_empty() {
                    self.last_seen = Some(Self::current_timestamp());
                    self.requests_handled += running_models.len() as u64;

                    // Generate events for active models
                    for model in running_models {
                        events.push(AgentEvent {
                            agent_name: self.agent_name(),
                            agent_type: AgentType::Ollama,
                            event_type: EventType::Generate,
                            timestamp: Self::current_timestamp(),
                            model: Some(model.clone()),
                            prompt: None,
                            response: None,
                            file: None,
                            duration_ms: None,
                            tokens_used: None,
                            metadata: Some(serde_json::json!({
                                "model": model,
                                "status": "active",
                            })),
                        });
                    }
                }
            }
            Err(e) => {
                self.errors += 1;
                warn!("Failed to fetch running Ollama models: {}", e);
            }
        }

        Ok(events)
    }

    fn agent_type(&self) -> AgentType {
        AgentType::Ollama
    }

    fn agent_name(&self) -> String {
        "ollama".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_ollama_adapter_creation() {
        let config = AgentConfig::default();
        let adapter = OllamaAdapter::new(None, config);

        assert_eq!(adapter.base_url, "http://localhost:11434");
        assert_eq!(adapter.agent_name(), "ollama");
        assert_eq!(adapter.agent_type(), AgentType::Ollama);
    }

    #[tokio::test]
    async fn test_custom_base_url() {
        let config = AgentConfig::default();
        let adapter = OllamaAdapter::new(Some("http://localhost:8080".to_string()), config);

        assert_eq!(adapter.base_url, "http://localhost:8080");
    }
}
