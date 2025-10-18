use super::triggers::{TriggerAction, TriggerEvent, TriggerRule, TriggersConfig};
use anyhow::{Context, Result};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::sync::Mutex;
use tracing::{info, warn, error};

/// Triggered event record
#[derive(Debug, Clone)]
pub struct TriggeredEvent {
    pub trigger_name: String,
    pub timestamp: u64,
    pub message: String,
    pub action: TriggerAction,
}

/// Trigger engine with rate limiting
pub struct TriggerEngine {
    config: TriggersConfig,
    last_triggered: Arc<Mutex<HashMap<String, u64>>>, // trigger_name -> last_timestamp
    triggered_events: Arc<Mutex<Vec<TriggeredEvent>>>,
}

impl TriggerEngine {
    /// Create new trigger engine
    pub fn new(config: TriggersConfig) -> Self {
        Self {
            config,
            last_triggered: Arc::new(Mutex::new(HashMap::new())),
            triggered_events: Arc::new(Mutex::new(Vec::new())),
        }
    }

    /// Reload configuration
    pub async fn reload_config(&mut self, config: TriggersConfig) {
        info!("Reloading trigger configuration ({} rules)", config.triggers.len());
        self.config = config;
    }

    /// Evaluate all triggers against an event
    pub async fn evaluate(&self, event: TriggerEvent) -> Result<Vec<TriggeredEvent>> {
        let mut triggered = Vec::new();
        let now = current_timestamp();

        for (name, rule) in &self.config.triggers {
            // Check if trigger matches
            if !rule.matches(&event) {
                continue;
            }

            // Check rate limiting
            let mut last_triggered = self.last_triggered.lock().await;
            if let Some(&last_time) = last_triggered.get(name) {
                let elapsed = now.saturating_sub(last_time);
                if elapsed < rule.cooldown_seconds {
                    continue; // Still in cooldown
                }
            }

            // Trigger matched and not in cooldown
            let message = format_message(rule, &event);

            info!("🔔 Trigger '{}' activated: {}", name, message);

            // Execute action
            match self.execute_action(name, rule, &message).await {
                Ok(_) => {
                    // Update last triggered time
                    last_triggered.insert(name.clone(), now);

                    // Record triggered event
                    let triggered_event = TriggeredEvent {
                        trigger_name: name.clone(),
                        timestamp: now,
                        message: message.clone(),
                        action: rule.action.clone(),
                    };

                    triggered.push(triggered_event.clone());

                    // Store in history
                    let mut history = self.triggered_events.lock().await;
                    history.push(triggered_event);

                    // Keep only last 1000 events
                    if history.len() > 1000 {
                        history.remove(0);
                    }
                }
                Err(e) => {
                    error!("Failed to execute trigger '{}': {}", name, e);
                }
            }
        }

        Ok(triggered)
    }

    /// Execute trigger action
    async fn execute_action(&self, name: &str, rule: &TriggerRule, message: &str) -> Result<()> {
        match rule.action {
            TriggerAction::Notify => {
                self.send_notification(name, message).await?;
            }
            TriggerAction::Log => {
                self.log_trigger(name, message).await?;
            }
            TriggerAction::Command => {
                if let Some(cmd) = &rule.command {
                    self.execute_command(name, cmd, message).await?;
                } else {
                    warn!("Trigger '{}' has 'command' action but no command specified", name);
                }
            }
        }
        Ok(())
    }

    /// Send desktop notification
    async fn send_notification(&self, name: &str, message: &str) -> Result<()> {
        #[cfg(target_os = "linux")]
        {
            // Use notify-send on Linux
            let output = tokio::process::Command::new("notify-send")
                .arg("Raven Trigger")
                .arg(format!("{}: {}", name, message))
                .arg("--urgency=normal")
                .arg("--icon=dialog-information")
                .output()
                .await;

            match output {
                Ok(result) => {
                    if !result.status.success() {
                        warn!("notify-send failed: {}", String::from_utf8_lossy(&result.stderr));
                    }
                }
                Err(e) => {
                    warn!("Failed to execute notify-send: {}", e);
                }
            }
        }

        #[cfg(target_os = "macos")]
        {
            // Use osascript on macOS
            let script = format!(
                "display notification \"{}\" with title \"Raven Trigger: {}\"",
                message, name
            );
            let output = tokio::process::Command::new("osascript")
                .arg("-e")
                .arg(script)
                .output()
                .await;

            match output {
                Ok(result) => {
                    if !result.status.success() {
                        warn!("osascript failed: {}", String::from_utf8_lossy(&result.stderr));
                    }
                }
                Err(e) => {
                    warn!("Failed to execute osascript: {}", e);
                }
            }
        }

        #[cfg(target_os = "windows")]
        {
            // Use PowerShell on Windows
            let ps_command = format!(
                "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null; \
                $template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02); \
                $template.SelectSingleNode('//text[@id=\"1\"]').InnerText = 'Raven Trigger: {}'; \
                $template.SelectSingleNode('//text[@id=\"2\"]').InnerText = '{}'; \
                $toast = [Windows.UI.Notifications.ToastNotification]::new($template); \
                [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Raven').Show($toast);",
                name, message
            );

            let output = tokio::process::Command::new("powershell")
                .arg("-Command")
                .arg(ps_command)
                .output()
                .await;

            match output {
                Ok(result) => {
                    if !result.status.success() {
                        warn!("PowerShell notification failed: {}", String::from_utf8_lossy(&result.stderr));
                    }
                }
                Err(e) => {
                    warn!("Failed to execute PowerShell: {}", e);
                }
            }
        }

        info!("📢 Notification sent: {} - {}", name, message);
        Ok(())
    }

    /// Log trigger to file
    async fn log_trigger(&self, name: &str, message: &str) -> Result<()> {
        use tokio::io::AsyncWriteExt;

        let log_path = std::env::current_dir()
            .context("Failed to get current directory")?
            .join(".raven")
            .join("triggers.log");

        let timestamp = chrono::Utc::now().to_rfc3339();
        let log_line = format!("[{}] {} - {}\n", timestamp, name, message);

        let mut file = tokio::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)
            .await
            .context("Failed to open triggers.log")?;

        file.write_all(log_line.as_bytes())
            .await
            .context("Failed to write to triggers.log")?;

        info!("📝 Logged trigger: {} - {}", name, message);
        Ok(())
    }

    /// Execute shell command
    async fn execute_command(&self, name: &str, command: &str, message: &str) -> Result<()> {
        info!("⚙️ Executing command for trigger '{}': {}", name, command);

        let output = tokio::process::Command::new("sh")
            .arg("-c")
            .arg(command)
            .output()
            .await
            .context("Failed to execute command")?;

        if output.status.success() {
            info!("✅ Command succeeded for trigger '{}'", name);
        } else {
            warn!(
                "❌ Command failed for trigger '{}': {}",
                name,
                String::from_utf8_lossy(&output.stderr)
            );
        }

        Ok(())
    }

    /// Get recent triggered events
    pub async fn get_recent_triggers(&self, limit: usize) -> Vec<TriggeredEvent> {
        let history = self.triggered_events.lock().await;
        let start = history.len().saturating_sub(limit);
        history[start..].to_vec()
    }

    /// Get trigger statistics
    pub async fn get_stats(&self) -> TriggerStats {
        let history = self.triggered_events.lock().await;
        let last_triggered = self.last_triggered.lock().await;

        let mut trigger_counts: HashMap<String, usize> = HashMap::new();
        for event in history.iter() {
            *trigger_counts.entry(event.trigger_name.clone()).or_insert(0) += 1;
        }

        TriggerStats {
            total_triggers: history.len(),
            active_triggers: self.config.triggers.len(),
            trigger_counts,
            cooldowns: last_triggered.clone(),
        }
    }

    /// Clear all rate limiting state
    pub async fn clear_cooldowns(&self) {
        let mut last_triggered = self.last_triggered.lock().await;
        last_triggered.clear();
        info!("Cleared all trigger cooldowns");
    }
}

/// Trigger statistics
#[derive(Debug, Clone)]
pub struct TriggerStats {
    pub total_triggers: usize,
    pub active_triggers: usize,
    pub trigger_counts: HashMap<String, usize>,
    pub cooldowns: HashMap<String, u64>,
}

/// Format message with event placeholders
fn format_message(rule: &TriggerRule, event: &TriggerEvent) -> String {
    let base_message = rule.message.as_deref().unwrap_or("Trigger activated");

    let mut message = base_message.to_string();

    // Replace placeholders
    if let Some(file) = &event.file {
        message = message.replace("{file}", file);
    }
    if let Some(agent) = &event.agent {
        message = message.replace("{agent}", agent);
    }
    if let Some(event_type) = &event.event_type {
        message = message.replace("{event_type}", event_type);
    }
    if let Some(lines) = event.lines_changed {
        message = message.replace("{lines_changed}", &lines.to_string());
    }
    if let Some(duration) = event.duration_ms {
        message = message.replace("{duration_ms}", &duration.to_string());
    }
    if let Some(cpu) = event.cpu_percent {
        message = message.replace("{cpu_percent}", &format!("{:.1}", cpu));
    }
    if let Some(mem) = event.memory_percent {
        message = message.replace("{memory_percent}", &format!("{:.1}", mem));
    }

    message
}

/// Get current Unix timestamp
fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::triggers::TriggerAction;

    #[tokio::test]
    async fn test_trigger_engine_creation() {
        let config = TriggersConfig::default();
        let engine = TriggerEngine::new(config);
        let stats = engine.get_stats().await;
        assert_eq!(stats.active_triggers, 0);
    }

    #[tokio::test]
    async fn test_message_formatting() {
        let rule = TriggerRule {
            file: Some("*.rs".to_string()),
            agent: None,
            event_type: None,
            lines_changed: None,
            duration_ms: None,
            cpu_percent: None,
            memory_percent: None,
            action: TriggerAction::Notify,
            message: Some("File {file} changed with {lines_changed} lines".to_string()),
            command: None,
            cooldown_seconds: 60,
        };

        let event = TriggerEvent {
            file: Some("main.rs".to_string()),
            agent: None,
            event_type: None,
            lines_changed: Some(150),
            duration_ms: None,
            cpu_percent: None,
            memory_percent: None,
        };

        let message = format_message(&rule, &event);
        assert_eq!(message, "File main.rs changed with 150 lines");
    }
}
