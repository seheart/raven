# 🎯 Raven Custom Triggers Documentation

**Version:** Phase II.4 - Custom Triggers
**Status:** ✅ Fully Implemented

---

## 📋 Overview

Raven's Custom Triggers feature enables you to define rules that automatically respond to specific events in your coding environment. Get desktop notifications, log important events, or execute custom commands when conditions are met - all with built-in rate limiting to prevent alert fatigue.

### Key Features

- **Rule-based evaluation** with flexible conditions
- **Multiple trigger actions**: Notify, Log, Command
- **Rate limiting** to prevent spam (configurable cooldown per trigger)
- **Pattern matching** for files (glob patterns supported)
- **Numeric conditions** for metrics (>, <, ==, >=, <=)
- **Desktop notifications** (Linux, macOS, Windows)
- **Event logging** to `.raven/triggers.log`
- **Custom shell commands** execution
- **Live configuration reload** without restarting

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  .raven/config.toml                          │
│              (User-defined trigger rules)                    │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ Parse & Load
                       ↓
┌─────────────────────────────────────────────────────────────┐
│                   TriggerEngine                              │
│                (Rust Backend Module)                         │
│                                                              │
│  - Evaluates rules against events                           │
│  - Manages rate limiting (cooldowns)                        │
│  - Executes actions (notify/log/command)                    │
│  - Tracks trigger history                                   │
└──────────────────────┬──────────────────────────────────────┘
                       │ Tauri IPC
                       ↓
┌─────────────────────────────────────────────────────────────┐
│              TriggersPanel.svelte                            │
│                 (Svelte UI Component)                        │
│                                                              │
│  Features:                                                   │
│  - View configured triggers                                 │
│  - See triggered events history                             │
│  - Trigger statistics & counts                              │
│  - Reload configuration                                     │
│  - Clear cooldowns                                          │
└─────────────────────────────────────────────────────────────┘
```

---

## ⚙️ Configuration

### Config File Location

```
.raven/config.toml
```

This file is automatically created with example triggers when Raven first starts.

### Basic Structure

```toml
[triggers.trigger_name]
file = "pattern"           # Optional: file pattern
agent = "agent_name"       # Optional: agent filter
event_type = "type"        # Optional: event type
lines_changed = ">100"     # Optional: lines condition
duration_ms = ">5000"      # Optional: duration condition
cpu_percent = ">80"        # Optional: CPU condition
memory_percent = ">70"     # Optional: memory condition
action = "notify"          # Required: notify | log | command
message = "Custom message" # Optional: notification message
command = "shell command"  # Required if action=command
cooldown_seconds = 60      # Optional: default 60
```

---

## 📦 Trigger Rules Reference

### Conditions

#### File Pattern
```toml
file = "main.rs"          # Exact match
file = "*.rs"             # Extension match
file = "src/**"           # Path prefix match
file = "**/test/**"       # Contains pattern
```

#### Agent Filter
```toml
agent = "claude"          # Only Claude events
agent = "ollama"          # Only Ollama events
```

#### Event Type
```toml
event_type = "edit"       # File edits
event_type = "create"     # File creations
event_type = "deleted"    # File deletions
event_type = "modified"   # File modifications
```

#### Numeric Conditions
Supported for: `lines_changed`, `duration_ms`, `cpu_percent`, `memory_percent`

```toml
lines_changed = ">100"    # Greater than
lines_changed = "<10"     # Less than
lines_changed = "==50"    # Exactly equal
lines_changed = ">=100"   # Greater or equal
lines_changed = "<=10"    # Less or equal
```

### Actions

#### 1. Notify (Desktop Notification)
```toml
[triggers.example_notify]
action = "notify"
message = "Alert: {file} changed with {lines_changed} lines"
```

**Supported placeholders:**
- `{file}` - File path
- `{agent}` - Agent name
- `{event_type}` - Event type
- `{lines_changed}` - Number of lines
- `{duration_ms}` - Duration in milliseconds
- `{cpu_percent}` - CPU percentage
- `{memory_percent}` - Memory percentage

**Platform-specific notifications:**
- **Linux**: `notify-send` (automatic)
- **macOS**: `osascript` (automatic)
- **Windows**: PowerShell ToastNotification (automatic)

#### 2. Log (File Logging)
```toml
[triggers.example_log]
action = "log"
message = "Logged event: {file}"
```

Logs to: `.raven/triggers.log`

Format:
```
[2025-10-17T14:30:45Z] trigger_name - Message content
```

#### 3. Command (Shell Execution)
```toml
[triggers.example_command]
action = "command"
command = "cp {file} {file}.backup"
message = "Backing up {file}"
```

**⚠️ Security Warning:** Commands execute with full shell access. Only use trusted commands.

### Rate Limiting

```toml
cooldown_seconds = 60     # Wait 60 seconds between triggers
cooldown_seconds = 0      # No cooldown (fire every time)
cooldown_seconds = 300    # 5 minute cooldown
```

---

## 📚 Example Triggers

### 1. Large Edit Alert
```toml
[triggers.large_edit]
file = "*.rs"
lines_changed = ">100"
action = "notify"
message = "Large edit detected: {file} ({lines_changed} lines)"
cooldown_seconds = 60
```

**Triggers when:** Any `.rs` file is edited with more than 100 lines changed.

---

### 2. Slow Operation Warning
```toml
[triggers.slow_operation]
agent = "claude"
duration_ms = ">10000"
action = "notify"
message = "Slow {agent} operation: {file} took {duration_ms}ms"
cooldown_seconds = 120
```

**Triggers when:** Claude takes longer than 10 seconds on any operation.

---

### 3. High CPU Alert
```toml
[triggers.high_cpu]
cpu_percent = ">80"
action = "notify"
message = "High CPU usage: {cpu_percent}%"
cooldown_seconds = 300
```

**Triggers when:** CPU usage exceeds 80% (checks every 5 minutes max).

---

### 4. Track All Deletions
```toml
[triggers.track_deletes]
event_type = "deleted"
action = "log"
message = "File deleted: {file}"
cooldown_seconds = 0
```

**Triggers when:** Any file is deleted (logs immediately, no cooldown).

---

### 5. Automatic Backup on Edit
```toml
[triggers.backup_on_edit]
file = "main.rs"
event_type = "modified"
action = "command"
command = "cp main.rs main.rs.backup"
message = "Backed up main.rs"
cooldown_seconds = 3600
```

**Triggers when:** `main.rs` is modified (max once per hour).

---

### 6. Critical File Protection
```toml
[triggers.protect_critical]
file = "src/database.rs"
event_type = "modified"
lines_changed = ">20"
action = "notify"
message = "⚠️ CRITICAL: Database module changed ({lines_changed} lines)"
cooldown_seconds = 0
```

**Triggers when:** Critical database file changes significantly.

---

### 7. Memory Leak Detection
```toml
[triggers.memory_leak]
memory_percent = ">85"
action = "notify"
message = "🚨 Memory usage critical: {memory_percent}%"
cooldown_seconds = 180
```

**Triggers when:** Memory usage exceeds 85% (max every 3 minutes).

---

### 8. Agent Performance Monitor
```toml
[triggers.agent_perf]
agent = "ollama"
duration_ms = ">15000"
action = "log"
message = "{agent} slow response: {duration_ms}ms on {file}"
cooldown_seconds = 60
```

**Triggers when:** Ollama responses take longer than 15 seconds.

---

### 9. Comprehensive Test File Changes
```toml
[triggers.test_changes]
file = "**/test/**"
event_type = "modified"
action = "command"
command = "npm test"
message = "Running tests due to test file change: {file}"
cooldown_seconds = 300
```

**Triggers when:** Any file in `test/` directories changes (runs tests max every 5 min).

---

### 10. Multi-Condition Complex Trigger
```toml
[triggers.complex_trigger]
file = "src/**"
agent = "claude"
lines_changed = ">50"
duration_ms = ">5000"
cpu_percent = ">70"
action = "notify"
message = "Complex event: {agent} edited {file} ({lines_changed} lines, {duration_ms}ms, CPU: {cpu_percent}%)"
cooldown_seconds = 120
```

**Triggers when:** ALL conditions are met simultaneously.

---

## 🎯 Tauri Commands

### 1. Get Triggers Configuration

```javascript
const triggers = await invoke('get_triggers_config');
// Returns: TriggerRuleData[]
```

**Returns:**
```typescript
interface TriggerRuleData {
  name: string;
  file?: string;
  agent?: string;
  event_type?: string;
  lines_changed?: string;
  duration_ms?: string;
  cpu_percent?: string;
  memory_percent?: string;
  action: 'notify' | 'log' | 'command';
  message?: string;
  command?: string;
  cooldown_seconds: number;
}
```

---

### 2. Get Triggered Events

```javascript
const events = await invoke('get_triggered_events', { limit: 100 });
// Returns: TriggeredEventData[]
```

**Returns:**
```typescript
interface TriggeredEventData {
  trigger_name: string;
  timestamp: number; // Unix timestamp (seconds)
  message: string;
  action: string;
}
```

---

### 3. Get Trigger Statistics

```javascript
const stats = await invoke('get_trigger_stats');
// Returns: TriggerStatsData
```

**Returns:**
```typescript
interface TriggerStatsData {
  total_triggers: number;          // Total times any trigger fired
  active_triggers: number;          // Number of configured triggers
  trigger_counts: Record<string, number>; // Per-trigger fire counts
}
```

---

### 4. Reload Triggers Configuration

```javascript
const message = await invoke('reload_triggers_config');
// Returns: "Reloaded 5 trigger rules"
```

Reloads `.raven/config.toml` without restarting Raven.

---

### 5. Clear Trigger Cooldowns

```javascript
const message = await invoke('clear_trigger_cooldowns');
// Returns: "All trigger cooldowns cleared"
```

Resets all rate limiting state, allowing triggers to fire immediately.

---

## 💻 Rust API

### TriggerEngine

```rust
use raven::modules::trigger_engine::TriggerEngine;
use raven::modules::triggers::{TriggerEvent, load_config};

// Load configuration
let config = load_config(".raven")?;

// Create trigger engine
let engine = TriggerEngine::new(config);

// Evaluate event against all triggers
let event = TriggerEvent {
    file: Some("main.rs".to_string()),
    agent: Some("claude".to_string()),
    event_type: Some("edit".to_string()),
    lines_changed: Some(150),
    duration_ms: Some(3500),
    cpu_percent: Some(45.2),
    memory_percent: Some(62.1),
};

let triggered = engine.evaluate(event).await?;
// Returns: Vec<TriggeredEvent>
```

### TriggerEvent

```rust
pub struct TriggerEvent {
    pub file: Option<String>,
    pub agent: Option<String>,
    pub event_type: Option<String>,
    pub lines_changed: Option<u32>,
    pub duration_ms: Option<u64>,
    pub cpu_percent: Option<f64>,
    pub memory_percent: Option<f64>,
}
```

### TriggerRule

```rust
pub struct TriggerRule {
    pub file: Option<String>,
    pub agent: Option<String>,
    pub event_type: Option<String>,
    pub lines_changed: Option<String>,
    pub duration_ms: Option<String>,
    pub cpu_percent: Option<String>,
    pub memory_percent: Option<String>,
    pub action: TriggerAction,
    pub message: Option<String>,
    pub command: Option<String>,
    pub cooldown_seconds: u64,
}
```

---

## 🎨 UI Component Usage

### Basic Integration

```svelte
<script>
  import TriggersPanel from './lib/TriggersPanel.svelte';
</script>

<div class="app">
  <TriggersPanel />
</div>
```

### Features

**Three Tabs:**
1. **📋 Trigger Rules** - View all configured triggers with conditions and actions
2. **🔔 Triggered Events** - History of all fired triggers
3. **📊 Statistics** - Trigger counts and statistics

**Actions:**
- 🔄 **Reload Config** - Reload `.raven/config.toml`
- ⏰ **Clear Cooldowns** - Reset all rate limiting
- ↻ **Refresh** - Refresh UI data

---

## 🧪 Testing

### Manual Testing

1. **Start Raven:**
   ```bash
   cd /home/seth/Projects/raven3
   cargo tauri dev
   ```

2. **Edit `.raven/config.toml`:**
   ```toml
   [triggers.test_trigger]
   file = "test.txt"
   event_type = "modified"
   action = "notify"
   message = "Test trigger fired!"
   cooldown_seconds = 0
   ```

3. **Reload config in UI:**
   - Click "🔄 Reload Config" button

4. **Create test file:**
   ```bash
   echo "test content" > test_workspace/test.txt
   ```

5. **Edit test file:**
   ```bash
   echo "modified" >> test_workspace/test.txt
   ```

6. **Verify:**
   - Desktop notification should appear
   - Event should appear in "Triggered Events" tab

### Test Notification System

**Linux:**
```bash
notify-send "Test" "Raven notification test"
```

**macOS:**
```bash
osascript -e 'display notification "Test" with title "Raven"'
```

**Windows:**
```powershell
# (PowerShell notification command - see trigger_engine.rs)
```

---

## ⚡ Performance

### Trigger Evaluation

- **Per-event evaluation time:** <1ms
- **Rule matching:** O(n) where n = number of triggers
- **Memory overhead:** ~100 KB for 100 triggers
- **History limit:** Last 1000 triggered events retained

### Rate Limiting

- **Cooldown tracking:** HashMap lookup (O(1))
- **No database writes** for cooldown state
- **Memory-only** state management

---

## 🚀 Use Cases

### 1. Development Workflow Automation

**Scenario:** Automatically run tests when test files change.

```toml
[triggers.auto_test]
file = "**/test/**"
event_type = "modified"
action = "command"
command = "npm test"
cooldown_seconds = 300
```

---

### 2. Performance Monitoring

**Scenario:** Alert when agent operations are slow.

```toml
[triggers.slow_agent]
agent = "claude"
duration_ms = ">8000"
action = "notify"
message = "Slow {agent}: {duration_ms}ms"
cooldown_seconds = 120
```

---

### 3. Critical File Protection

**Scenario:** Get notified immediately when critical files change.

```toml
[triggers.critical_files]
file = "src/security.rs"
action = "notify"
message = "⚠️ Security file modified!"
cooldown_seconds = 0
```

---

### 4. Resource Usage Alerts

**Scenario:** Monitor system resources during development.

```toml
[triggers.high_memory]
memory_percent = ">80"
action = "notify"
message = "Memory high: {memory_percent}%"
cooldown_seconds = 300
```

---

### 5. Audit Trail

**Scenario:** Log all file deletions for audit purposes.

```toml
[triggers.audit_deletes]
event_type = "deleted"
action = "log"
message = "Deleted: {file} by {agent}"
cooldown_seconds = 0
```

---

## 📝 Best Practices

### 1. Use Appropriate Cooldowns
- **Frequent events** (file edits): 60-300 seconds
- **Rare events** (deletes): 0 seconds
- **System metrics**: 180-600 seconds
- **Performance alerts**: 120-300 seconds

### 2. Message Clarity
```toml
# Bad
message = "Alert"

# Good
message = "High CPU: {cpu_percent}% during {event_type} on {file}"
```

### 3. File Patterns
```toml
# Specific
file = "main.rs"              # Single file

# Moderate
file = "*.rs"                 # All Rust files

# Broad
file = "src/**"               # Entire src/ directory
```

### 4. Combine Conditions
```toml
# More specific = fewer false positives
file = "src/**"
lines_changed = ">50"
cpu_percent = ">60"
```

### 5. Test Before Deploying
Always test triggers with `cooldown_seconds = 0` first, then adjust.

---

## 🚀 Future Enhancements (Planned)

- ⏳ **Email notifications** (SMTP integration)
- ⏳ **Webhook actions** (HTTP POST to external services)
- ⏳ **Condition groups** (OR logic in addition to AND)
- ⏳ **Time-based triggers** (cron-style scheduling)
- ⏳ **Trigger templates** (predefined rule sets)
- ⏳ **UI-based trigger editor** (no TOML editing required)
- ⏳ **Trigger analytics** (performance tracking per trigger)

---

## 📚 Related Documentation

- [TELEMETRY_API.md](TELEMETRY_API.md) - Agent telemetry events
- [PERFORMANCE_PROFILING.md](PERFORMANCE_PROFILING.md) - Performance metrics
- [SESSION_REPLAY.md](SESSION_REPLAY.md) - Session timeline
- [RAVEN_DEV_PLAN_PHASE_II.md](RAVEN_DEV_PLAN_PHASE_II.md) - Full Phase II roadmap

---

## 📄 License

MIT License - See [LICENSE](LICENSE) file

---

**Author:** Seth Eheart
**Codename:** Raven
**Phase:** II.4 - Custom Triggers
**Status:** ✅ Production Ready
