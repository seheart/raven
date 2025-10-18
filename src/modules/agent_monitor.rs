use anyhow::Result;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};

/// Normalized event from any AI agent
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentEvent {
    pub agent_name: String,
    pub agent_type: AgentType,
    pub event_type: EventType,
    pub timestamp: String,
    pub model: Option<String>,
    pub prompt: Option<String>,
    pub response: Option<String>,
    pub file: Option<String>,
    pub duration_ms: Option<u64>,
    pub tokens_used: Option<u64>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum AgentType {
    Claude,
    Ollama,
    LMStudio,
    OpenAI,
    Custom(String),
}

impl AgentType {
    pub fn as_str(&self) -> &str {
        match self {
            AgentType::Claude => "claude",
            AgentType::Ollama => "ollama",
            AgentType::LMStudio => "lmstudio",
            AgentType::OpenAI => "openai",
            AgentType::Custom(name) => name,
        }
    }

    pub fn color(&self) -> &str {
        match self {
            AgentType::Claude => "#FF6B35", // Orange
            AgentType::Ollama => "#4ECDC4", // Teal
            AgentType::LMStudio => "#95E1D3", // Mint
            AgentType::OpenAI => "#10B981", // Green
            AgentType::Custom(_) => "#6B7280", // Gray
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum EventType {
    Generate,    // Text generation
    Chat,        // Chat completion
    Edit,        // Code edit
    Embed,       // Embeddings
    Complete,    // Code completion
    Error,       // Error occurred
    Heartbeat,   // Agent is alive
}

/// Configuration for agent monitoring
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    pub enabled: bool,
    pub poll_interval_ms: u64,
    pub timeout_ms: u64,
    pub auto_discover: bool,
}

impl Default for AgentConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            poll_interval_ms: 5000, // Poll every 5 seconds
            timeout_ms: 10000,      // 10 second timeout
            auto_discover: true,
        }
    }
}

/// Agent status information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentStatus {
    pub agent_name: String,
    pub agent_type: AgentType,
    pub is_running: bool,
    pub last_seen: Option<String>,
    pub models_available: Vec<String>,
    pub requests_handled: u64,
    pub errors: u64,
}

/// Trait for monitoring different AI agents
#[async_trait]
pub trait AgentMonitor: Send + Sync {
    /// Start monitoring the agent
    async fn start(&mut self) -> Result<()>;

    /// Stop monitoring the agent
    async fn stop(&mut self) -> Result<()>;

    /// Check if agent is running
    async fn is_running(&self) -> bool;

    /// Get agent status
    async fn get_status(&self) -> Result<AgentStatus>;

    /// Poll for new events (called periodically)
    async fn poll_events(&mut self) -> Result<Vec<AgentEvent>>;

    /// Get agent type
    fn agent_type(&self) -> AgentType;

    /// Get agent name
    fn agent_name(&self) -> String;
}

/// Agent registry to track all monitored agents
pub struct AgentRegistry {
    agents: Vec<Box<dyn AgentMonitor>>,
}

impl AgentRegistry {
    pub fn new() -> Self {
        Self {
            agents: Vec::new(),
        }
    }

    pub fn register(&mut self, agent: Box<dyn AgentMonitor>) {
        self.agents.push(agent);
    }

    pub async fn start_all(&mut self) -> Result<()> {
        for agent in &mut self.agents {
            if let Err(e) = agent.start().await {
                tracing::warn!("Failed to start agent {}: {}", agent.agent_name(), e);
            }
        }
        Ok(())
    }

    pub async fn stop_all(&mut self) -> Result<()> {
        for agent in &mut self.agents {
            if let Err(e) = agent.stop().await {
                tracing::warn!("Failed to stop agent {}: {}", agent.agent_name(), e);
            }
        }
        Ok(())
    }

    pub async fn get_all_status(&self) -> Vec<AgentStatus> {
        let mut statuses = Vec::new();
        for agent in &self.agents {
            if let Ok(status) = agent.get_status().await {
                statuses.push(status);
            }
        }
        statuses
    }

    pub async fn poll_all_events(&mut self) -> Vec<AgentEvent> {
        let mut all_events = Vec::new();
        for agent in &mut self.agents {
            if let Ok(events) = agent.poll_events().await {
                all_events.extend(events);
            }
        }
        all_events
    }

    pub fn agent_count(&self) -> usize {
        self.agents.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_agent_type_color() {
        assert_eq!(AgentType::Claude.color(), "#FF6B35");
        assert_eq!(AgentType::Ollama.color(), "#4ECDC4");
        assert_eq!(AgentType::LMStudio.color(), "#95E1D3");
    }

    #[test]
    fn test_agent_type_as_str() {
        assert_eq!(AgentType::Claude.as_str(), "claude");
        assert_eq!(AgentType::Ollama.as_str(), "ollama");
        assert_eq!(AgentType::Custom("test".to_string()).as_str(), "test");
    }

    #[test]
    fn test_agent_config_default() {
        let config = AgentConfig::default();
        assert_eq!(config.poll_interval_ms, 5000);
        assert_eq!(config.timeout_ms, 10000);
        assert!(config.enabled);
        assert!(config.auto_discover);
    }
}
