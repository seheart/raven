use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::net::{UnixListener, UnixStream};
use tokio::sync::mpsc;
use tracing::{debug, error, info, warn};

/// JSON event schema for agent telemetry
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct AgentEvent {
    /// Agent identifier (e.g., "claude", "ollama", "lmstudio")
    pub agent: String,

    /// Event type (e.g., "edit", "read", "create", "delete", "execute")
    pub event: String,

    /// File path affected by the event (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file: Option<String>,

    /// Number of lines changed (for edit events)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lines_changed: Option<u32>,

    /// Duration of the operation in milliseconds
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,

    /// Human-readable message describing the event
    pub message: String,

    /// Optional authentication token
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_token: Option<String>,

    /// Additional metadata (flexible JSON object)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

/// Telemetry server configuration
#[derive(Debug, Clone)]
pub struct TelemetryConfig {
    /// Path to Unix socket
    pub socket_path: PathBuf,

    /// Optional authentication token for security
    pub auth_token: Option<String>,

    /// Maximum events in buffer before blocking
    pub buffer_size: usize,
}

impl Default for TelemetryConfig {
    fn default() -> Self {
        Self {
            socket_path: PathBuf::from("/tmp/raven-telemetry.sock"),
            auth_token: None,
            buffer_size: 1000,
        }
    }
}

/// Telemetry server for receiving agent events via Unix socket
pub struct TelemetryServer {
    config: TelemetryConfig,
    event_tx: mpsc::Sender<AgentEvent>,
}

impl TelemetryServer {
    /// Create a new telemetry server
    pub fn new(config: TelemetryConfig) -> (Self, mpsc::Receiver<AgentEvent>) {
        let (event_tx, event_rx) = mpsc::channel(config.buffer_size);

        let server = Self {
            config,
            event_tx,
        };

        (server, event_rx)
    }

    /// Start the telemetry server
    pub async fn start(&self) -> Result<()> {
        // Remove existing socket if present
        if self.config.socket_path.exists() {
            std::fs::remove_file(&self.config.socket_path)
                .context("Failed to remove existing socket")?;
        }

        // Create Unix socket listener
        let listener = UnixListener::bind(&self.config.socket_path)
            .context("Failed to bind Unix socket")?;

        info!("Telemetry server listening on {:?}", self.config.socket_path);

        loop {
            match listener.accept().await {
                Ok((stream, _addr)) => {
                    let tx = self.event_tx.clone();
                    let auth_token = self.config.auth_token.clone();

                    // Spawn a new task for each connection
                    tokio::spawn(async move {
                        if let Err(e) = handle_connection(stream, tx, auth_token).await {
                            error!("Connection handler error: {}", e);
                        }
                    });
                }
                Err(e) => {
                    error!("Failed to accept connection: {}", e);
                }
            }
        }
    }
}

/// Handle a single client connection
async fn handle_connection(
    stream: UnixStream,
    event_tx: mpsc::Sender<AgentEvent>,
    auth_token: Option<String>,
) -> Result<()> {
    let mut reader = BufReader::new(stream);
    let mut line = String::new();

    loop {
        line.clear();

        let bytes_read = reader.read_line(&mut line).await
            .context("Failed to read from socket")?;

        if bytes_read == 0 {
            // Connection closed
            debug!("Client disconnected");
            break;
        }

        // Parse JSON event
        match serde_json::from_str::<AgentEvent>(&line) {
            Ok(mut event) => {
                // Verify authentication if token is configured
                if let Some(ref token) = auth_token {
                    match &event.auth_token {
                        Some(provided) if provided == token => {
                            // Valid token, remove it before processing
                            event.auth_token = None;
                        }
                        _ => {
                            warn!("Rejected event with invalid auth token");
                            continue;
                        }
                    }
                }

                debug!("Received telemetry event: {:?}", event);

                // Send event to processing channel
                if let Err(e) = event_tx.send(event).await {
                    error!("Failed to send event to processor: {}", e);
                    break;
                }
            }
            Err(e) => {
                warn!("Failed to parse JSON event: {} - Line: {}", e, line.trim());
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::AsyncWriteExt;
    use tokio::net::UnixStream as TokioUnixStream;

    #[tokio::test]
    async fn test_event_serialization() {
        let event = AgentEvent {
            agent: "claude".to_string(),
            event: "edit".to_string(),
            file: Some("src/main.rs".to_string()),
            lines_changed: Some(42),
            duration_ms: Some(1234),
            message: "Refactored main function".to_string(),
            auth_token: None,
            metadata: None,
        };

        let json = serde_json::to_string(&event).unwrap();
        let parsed: AgentEvent = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.agent, "claude");
        assert_eq!(parsed.event, "edit");
        assert_eq!(parsed.lines_changed, Some(42));
    }

    #[tokio::test]
    async fn test_telemetry_server_creation() {
        let config = TelemetryConfig::default();
        let (server, _rx) = TelemetryServer::new(config);

        assert_eq!(server.config.socket_path, PathBuf::from("/tmp/raven-telemetry.sock"));
    }
}
