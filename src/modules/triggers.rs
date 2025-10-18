use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use anyhow::{Context, Result};
use tracing::{info, warn, error};

/// Trigger configuration loaded from .raven/config.toml
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TriggersConfig {
    #[serde(default)]
    pub triggers: HashMap<String, TriggerRule>,
}

impl Default for TriggersConfig {
    fn default() -> Self {
        Self {
            triggers: HashMap::new(),
        }
    }
}

/// Individual trigger rule
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TriggerRule {
    /// Optional file pattern (e.g., "main.py", "*.rs", "src/**/*.ts")
    pub file: Option<String>,

    /// Optional agent name (e.g., "claude", "ollama")
    pub agent: Option<String>,

    /// Optional event type (e.g., "edit", "create", "delete")
    pub event_type: Option<String>,

    /// Lines changed condition (e.g., ">100", "<10", "==0")
    pub lines_changed: Option<String>,

    /// Duration condition in milliseconds (e.g., ">5000", "<1000")
    pub duration_ms: Option<String>,

    /// CPU percentage condition (e.g., ">80", "<20")
    pub cpu_percent: Option<String>,

    /// Memory percentage condition (e.g., ">70", "<30")
    pub memory_percent: Option<String>,

    /// Action to take when triggered (e.g., "notify", "log", "command")
    pub action: TriggerAction,

    /// Optional custom message for notification
    pub message: Option<String>,

    /// Optional shell command to execute
    pub command: Option<String>,

    /// Rate limiting: minimum seconds between triggers
    #[serde(default = "default_cooldown")]
    pub cooldown_seconds: u64,
}

fn default_cooldown() -> u64 {
    60 // Default 60 seconds cooldown
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TriggerAction {
    Notify,  // Desktop notification
    Log,     // Log to file
    Command, // Execute shell command
}

/// Condition evaluator for numeric comparisons
#[derive(Debug, Clone)]
pub enum Condition {
    GreaterThan(f64),
    LessThan(f64),
    Equal(f64),
    GreaterOrEqual(f64),
    LessOrEqual(f64),
}

impl Condition {
    /// Parse condition string like ">100", "<=50", "==10"
    pub fn parse(s: &str) -> Result<Self> {
        let s = s.trim();

        if let Some(val) = s.strip_prefix(">=") {
            let num = val.trim().parse::<f64>()
                .context("Failed to parse number in >= condition")?;
            Ok(Condition::GreaterOrEqual(num))
        } else if let Some(val) = s.strip_prefix("<=") {
            let num = val.trim().parse::<f64>()
                .context("Failed to parse number in <= condition")?;
            Ok(Condition::LessOrEqual(num))
        } else if let Some(val) = s.strip_prefix('>') {
            let num = val.trim().parse::<f64>()
                .context("Failed to parse number in > condition")?;
            Ok(Condition::GreaterThan(num))
        } else if let Some(val) = s.strip_prefix('<') {
            let num = val.trim().parse::<f64>()
                .context("Failed to parse number in < condition")?;
            Ok(Condition::LessThan(num))
        } else if let Some(val) = s.strip_prefix("==") {
            let num = val.trim().parse::<f64>()
                .context("Failed to parse number in == condition")?;
            Ok(Condition::Equal(num))
        } else {
            // Default to equal
            let num = s.parse::<f64>()
                .context("Failed to parse number in condition")?;
            Ok(Condition::Equal(num))
        }
    }

    /// Evaluate condition against a value
    pub fn evaluate(&self, value: f64) -> bool {
        match self {
            Condition::GreaterThan(n) => value > *n,
            Condition::LessThan(n) => value < *n,
            Condition::Equal(n) => (value - n).abs() < 0.001,
            Condition::GreaterOrEqual(n) => value >= *n,
            Condition::LessOrEqual(n) => value <= *n,
        }
    }
}

/// Event context for trigger evaluation
#[derive(Debug, Clone)]
pub struct TriggerEvent {
    pub file: Option<String>,
    pub agent: Option<String>,
    pub event_type: Option<String>,
    pub lines_changed: Option<u32>,
    pub duration_ms: Option<u64>,
    pub cpu_percent: Option<f64>,
    pub memory_percent: Option<f64>,
}

impl TriggerRule {
    /// Evaluate if this rule matches the given event
    pub fn matches(&self, event: &TriggerEvent) -> bool {
        // Check file pattern
        if let Some(pattern) = &self.file {
            if let Some(event_file) = &event.file {
                if !matches_pattern(pattern, event_file) {
                    return false;
                }
            } else {
                return false;
            }
        }

        // Check agent
        if let Some(agent) = &self.agent {
            if event.agent.as_ref() != Some(agent) {
                return false;
            }
        }

        // Check event type
        if let Some(event_type) = &self.event_type {
            if event.event_type.as_ref() != Some(event_type) {
                return false;
            }
        }

        // Check lines_changed condition
        if let Some(condition_str) = &self.lines_changed {
            if let Some(lines) = event.lines_changed {
                match Condition::parse(condition_str) {
                    Ok(condition) => {
                        if !condition.evaluate(lines as f64) {
                            return false;
                        }
                    }
                    Err(e) => {
                        warn!("Failed to parse lines_changed condition: {}", e);
                        return false;
                    }
                }
            } else {
                return false;
            }
        }

        // Check duration_ms condition
        if let Some(condition_str) = &self.duration_ms {
            if let Some(duration) = event.duration_ms {
                match Condition::parse(condition_str) {
                    Ok(condition) => {
                        if !condition.evaluate(duration as f64) {
                            return false;
                        }
                    }
                    Err(e) => {
                        warn!("Failed to parse duration_ms condition: {}", e);
                        return false;
                    }
                }
            } else {
                return false;
            }
        }

        // Check cpu_percent condition
        if let Some(condition_str) = &self.cpu_percent {
            if let Some(cpu) = event.cpu_percent {
                match Condition::parse(condition_str) {
                    Ok(condition) => {
                        if !condition.evaluate(cpu) {
                            return false;
                        }
                    }
                    Err(e) => {
                        warn!("Failed to parse cpu_percent condition: {}", e);
                        return false;
                    }
                }
            } else {
                return false;
            }
        }

        // Check memory_percent condition
        if let Some(condition_str) = &self.memory_percent {
            if let Some(mem) = event.memory_percent {
                match Condition::parse(condition_str) {
                    Ok(condition) => {
                        if !condition.evaluate(mem) {
                            return false;
                        }
                    }
                    Err(e) => {
                        warn!("Failed to parse memory_percent condition: {}", e);
                        return false;
                    }
                }
            } else {
                return false;
            }
        }

        true
    }
}

/// Simple glob pattern matching
fn matches_pattern(pattern: &str, text: &str) -> bool {
    // Simple wildcard matching
    if pattern == "*" {
        return true;
    }

    // Exact match
    if pattern == text {
        return true;
    }

    // Extension match (e.g., "*.rs")
    if let Some(ext) = pattern.strip_prefix("*.") {
        if text.ends_with(&format!(".{}", ext)) {
            return true;
        }
    }

    // Prefix match (e.g., "src/**")
    if let Some(prefix) = pattern.strip_suffix("/**") {
        if text.starts_with(prefix) {
            return true;
        }
    }

    // Contains match (e.g., "**/test/**")
    if pattern.contains("**") {
        let parts: Vec<&str> = pattern.split("**").collect();
        if parts.len() == 2 {
            let start = parts[0].trim_matches('/');
            let end = parts[1].trim_matches('/');

            if start.is_empty() && end.is_empty() {
                return true;
            }
            if start.is_empty() {
                return text.contains(end);
            }
            if end.is_empty() {
                return text.starts_with(start);
            }
            return text.contains(start) && text.contains(end);
        }
    }

    false
}

/// Load triggers configuration from .raven/config.toml
pub fn load_config<P: AsRef<Path>>(raven_dir: P) -> Result<TriggersConfig> {
    let config_path = raven_dir.as_ref().join("config.toml");

    if !config_path.exists() {
        info!("No config.toml found, creating default configuration");
        let default_config = create_default_config();
        fs::write(&config_path, &default_config)
            .context("Failed to write default config.toml")?;
        return Ok(TriggersConfig::default());
    }

    let contents = fs::read_to_string(&config_path)
        .context("Failed to read config.toml")?;

    let config: TriggersConfig = toml::from_str(&contents)
        .context("Failed to parse config.toml")?;

    info!("Loaded {} trigger rules from config.toml", config.triggers.len());
    Ok(config)
}

/// Create default config.toml with example triggers
fn create_default_config() -> String {
    r#"# Raven Custom Triggers Configuration
# Define rules that trigger notifications when specific events occur

# Example: Notify on large edits
[triggers.large_edit]
file = "*.rs"
lines_changed = ">100"
action = "notify"
message = "Large edit detected: {file} ({lines_changed} lines)"
cooldown_seconds = 60

# Example: Alert on slow agent operations
[triggers.slow_operation]
agent = "claude"
duration_ms = ">10000"
action = "notify"
message = "Slow {agent} operation: {file} took {duration_ms}ms"
cooldown_seconds = 120

# Example: High CPU usage warning
[triggers.high_cpu]
cpu_percent = ">80"
action = "notify"
message = "High CPU usage: {cpu_percent}%"
cooldown_seconds = 300

# Example: Log all delete operations
[triggers.track_deletes]
event_type = "deleted"
action = "log"
message = "File deleted: {file}"
cooldown_seconds = 0

# Example: Execute custom command
# [triggers.backup_on_edit]
# file = "main.rs"
# event_type = "modified"
# action = "command"
# command = "cp main.rs main.rs.backup"
# cooldown_seconds = 3600
"#.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_condition_parse() {
        assert!(matches!(Condition::parse(">100").unwrap(), Condition::GreaterThan(100.0)));
        assert!(matches!(Condition::parse("<50").unwrap(), Condition::LessThan(50.0)));
        assert!(matches!(Condition::parse("==10").unwrap(), Condition::Equal(10.0)));
        assert!(matches!(Condition::parse(">=75").unwrap(), Condition::GreaterOrEqual(75.0)));
        assert!(matches!(Condition::parse("<=25").unwrap(), Condition::LessOrEqual(25.0)));
    }

    #[test]
    fn test_condition_evaluate() {
        let gt = Condition::GreaterThan(100.0);
        assert!(gt.evaluate(101.0));
        assert!(!gt.evaluate(100.0));
        assert!(!gt.evaluate(99.0));

        let eq = Condition::Equal(50.0);
        assert!(eq.evaluate(50.0));
        assert!(!eq.evaluate(50.5));
    }

    #[test]
    fn test_pattern_matching() {
        assert!(matches_pattern("*", "anything.txt"));
        assert!(matches_pattern("main.rs", "main.rs"));
        assert!(matches_pattern("*.rs", "main.rs"));
        assert!(matches_pattern("*.rs", "lib.rs"));
        assert!(!matches_pattern("*.rs", "main.py"));
        assert!(matches_pattern("src/**", "src/main.rs"));
        assert!(matches_pattern("src/**", "src/utils/helper.rs"));
    }

    #[test]
    fn test_trigger_matching() {
        let rule = TriggerRule {
            file: Some("*.rs".to_string()),
            agent: None,
            event_type: None,
            lines_changed: Some(">100".to_string()),
            duration_ms: None,
            cpu_percent: None,
            memory_percent: None,
            action: TriggerAction::Notify,
            message: None,
            command: None,
            cooldown_seconds: 60,
        };

        let event = TriggerEvent {
            file: Some("main.rs".to_string()),
            agent: Some("claude".to_string()),
            event_type: Some("edit".to_string()),
            lines_changed: Some(150),
            duration_ms: None,
            cpu_percent: None,
            memory_percent: None,
        };

        assert!(rule.matches(&event));

        let event_small = TriggerEvent {
            file: Some("main.rs".to_string()),
            agent: Some("claude".to_string()),
            event_type: Some("edit".to_string()),
            lines_changed: Some(50),
            duration_ms: None,
            cpu_percent: None,
            memory_percent: None,
        };

        assert!(!rule.matches(&event_small));
    }
}
