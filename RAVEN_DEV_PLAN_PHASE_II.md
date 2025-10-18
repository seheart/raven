# 🦅 Raven Development Plan — Phase II (Advanced Features)
**Purpose:**  
Expand Raven beyond core logging into a full-fledged local telemetry and analysis platform for AI coding agents.  
This version omits any VS Code integration and focuses entirely on open, local, and model-agnostic extensions.

---

## 🧩 Feature Set Overview
| Feature | Description |
|----------|-------------|
| **Agent Telemetry API** | Structured event interface for Claude, Ollama, and other agents |
| **Performance Profiling** | Correlate system metrics with AI request latency |
| **Session Replay** | Reconstruct the project timeline visually |
| **Custom Triggers** | User-defined rules for alerts and thresholds |
| **Ollama / LM Studio Monitors** | Native adapters for other local LLMs |

---

## 🚀 Phase 1 – Agent Telemetry API

### 🎯 Objective
Create a local communication interface for AI agents to send structured activity logs to Raven in real time.

### ⚙️ Implementation
- Use **Unix sockets** (Linux/macOS) and **localhost TCP** (Windows fallback)
- Define a shared **JSON schema** for events:
  ```json
  {
    "agent": "claude",
    "event": "edit",
    "file": "src/utils.py",
    "lines_changed": 12,
    "duration_ms": 3480,
    "message": "Refactored helper function"
  }
  ```
- Build a lightweight listener in Rust using `tokio` + `serde_json`
- Store incoming events in `raven_events` SQLite table

### ✅ Tasks
- [ ] Design JSON event schema  
- [ ] Implement socket listener service  
- [ ] Log and timestamp incoming events  
- [ ] Add basic authentication token for security (optional)  

---

## 🧠 Phase 2 – Performance Profiling

### 🎯 Objective
Measure system health and agent responsiveness during operation.

### ⚙️ Implementation
- Extend existing `metrics.rs` to record:
  - CPU %, RAM %, Disk I/O, Network usage
  - Per-process stats (Claude PID, etc.)
- Add latency sampling for each telemetry event
- Visualize latency vs. CPU in dashboard chart

### ✅ Tasks
- [ ] Integrate `sysinfo` + `tokio::time::interval` sampling  
- [ ] Store metrics in SQLite (`raven_metrics` table)  
- [ ] Correlate latency → CPU load → agent type  
- [ ] Render rolling average chart in UI  

---

## 🪶 Phase 3 – Session Replay

### 🎯 Objective
Enable visual playback of file changes and agent actions across a timeline.

### ⚙️ Implementation
- Use stored diffs + telemetry timestamps
- Build timeline scrubber UI in Svelte
- Animate diffs with Framer Motion or `svelte-animate`
- Provide play/pause + speed control

### ✅ Tasks
- [ ] Index file diffs by timestamp  
- [ ] Link agent telemetry → file snapshot  
- [ ] Build timeline visualization component  
- [ ] Add export-to-video or GIF option (optional)  

---

## ⚙️ Phase 4 – Custom Triggers

### 🎯 Objective
Allow users to define and react to events that match specific conditions.

### ⚙️ Implementation
- Config file: `.raven/config.toml`
  ```toml
  [triggers.large_edit]
  file = "main.py"
  lines_changed = ">100"
  action = "notify"
  ```
- Use rule engine (`evalexpr` or custom parser)
- Hook trigger evaluation into event loop

### ✅ Tasks
- [ ] Parse `.raven/config.toml`  
- [ ] Evaluate conditions per event  
- [ ] Add notification system (CLI + desktop)  
- [ ] Include rate limiting for alerts  

---

## 💻 Phase 5 – Ollama / LM Studio Monitors

### 🎯 Objective
Generalize Raven beyond Claude to other local agents.

### ⚙️ Implementation
- Define trait interface in Rust:
  ```rust
  trait AgentMonitor {
      fn start(&self);
      fn parse_event(&self, raw: String) -> RavenEvent;
  }
  ```
- Implement adapters for:
  - **Ollama:** via local REST API (`localhost:11434`)
  - **LM Studio:** via socket or file event listener
- Normalize all agents to Raven’s event schema

### ✅ Tasks
- [ ] Implement `AgentMonitor` trait  
- [ ] Add Ollama adapter (REST polling + diff capture)  
- [ ] Add LM Studio adapter (file watcher + diff capture)  
- [ ] Unify UI view: agent color-coding + filters  

---

## 🌍 Phase 6 – User Experience Enhancements

### 🧩 Dashboard Upgrades
- Real-time charts for agent activity
- Session replay timeline controls
- “Top modified files” and “Longest edits” stats
- Configurable dark/industrial theme (default)

### 🧠 CLI Enhancements
```bash
raven status          # show agent connections
raven replay <time>   # open timeline at timestamp
raven export          # package logs/diffs into zip
```

---

## 🧭 Notes & Philosophy
- 100% **open**, **local**, and **tool-independent**.  
- Zero telemetry — user data never leaves the system.  
- Modular design for community-built adapters.  
- Raven is not an IDE plugin; it’s an **AI development black box recorder**.

---

**Author:** Seth Eheart  
**Codename:** Raven  
**Version:** Phase II — Advanced Plan (No Proprietary Bridges)
