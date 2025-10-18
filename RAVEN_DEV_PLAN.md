# 🦅 Raven Development Plan
**Purpose:**  
Build a local-first, lightning-fast monitoring and short-term memory tool for AI coding agents (starting with Claude Code).  
Raven captures file changes, system metrics, and API events in real time — without relying on GitHub.

---

## 🚀 Phase 0 – Goals & Setup
### 🎯 Objective
Create a foundational architecture that:
- Runs fully offline (local monitoring only)
- Captures and timestamps Claude Code edits
- Stores diffs and metadata in SQLite
- Displays events and system stats in a simple UI

### ✅ Tasks
- [ ] Define project folder structure  
- [ ] Initialize Rust + Tauri + Svelte stack  
- [ ] Configure Cargo dependencies and npm environment  
- [ ] Add `.raven/config.toml` for runtime settings  
- [ ] Create local test workspace for Claude Code sessions  

---

## 🧱 Phase 1 – Core Rust Backend

### 🔧 Modules
| Module | Purpose |
|---------|----------|
| `repo_watcher.rs` | Watches target folder using `notify` crate |
| `event_logger.rs` | Logs file events to SQLite + JSON |
| `diff_engine.rs` | Generates diffs using `similar` crate |
| `metrics.rs` | Tracks CPU, memory, I/O stats via `sysinfo` |
| `db.rs` | Handles `rusqlite` schema and writes |
| `main.rs` | Async orchestrator using `tokio` runtime |

### ⚙️ Setup
```bash
cargo new raven
cd raven
cargo add notify sysinfo rusqlite serde serde_json similar tracing tokio
```

### 🧠 Database Schema (SQLite)
```sql
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  filepath TEXT,
  change_type TEXT,
  diff TEXT,
  cpu REAL,
  mem REAL
);
```

### ✅ Backend Milestones
- [ ] Initialize async runtime  
- [ ] Implement file watcher with debounce (50ms)  
- [ ] Log every modification event  
- [ ] Compute and store diffs  
- [ ] Record system stats per event  

---

## 🪶 Phase 2 – Snapshot & Short-Term Memory

### 🎯 Objective
Enable lightweight rollback and timeline replay without Git.

### 🧩 Features
- Automatic `.raven/snapshots/` folder per workspace
- Diffs saved as text patches
- SQLite index referencing snapshot paths

### ✅ Tasks
- [ ] Add snapshot writer to `event_logger.rs`  
- [ ] Implement retrieval API (get state by timestamp)  
- [ ] Test time-travel restore feature (single file + entire repo)  

---

## 💻 Phase 3 – UI Layer (Tauri + Svelte)

### 🧠 Stack
- **Frontend:** Svelte + Vite  
- **Backend:** Tauri (Rust)  
- **IPC:** Tauri event bridge (`emit`/`listen`)  

### 📂 Structure
```
/raven
  /src
    main.rs
    repo_watcher.rs
    event_logger.rs
    db.rs
  /frontend
    /src
      App.svelte
      components/
      stores/
  tauri.conf.json
  Cargo.toml
```

### ✅ UI Features
- [ ] Live event feed (“Claude modified src/utils.py”)  
- [ ] Resource monitor (CPU, memory, latency)  
- [ ] Timeline slider (browse diff history)  
- [ ] Diff viewer modal (before/after)  

### 🧰 Frontend Setup
```bash
npm create vite@latest frontend -- --template svelte
cd frontend && npm install
cargo tauri dev
```

---

## 🧪 Phase 4 – Integration & Testing

### 🧩 Testing Goals
- Verify Raven captures Claude Code file writes in real time  
- Validate diff and timestamp accuracy  
- Stress-test large edits and multiple file events  
- Confirm zero data loss during session  

### ✅ QA Checklist
- [ ] Detect external file edits instantly  
- [ ] Log timestamped diffs correctly  
- [ ] Handle simultaneous changes gracefully  
- [ ] Maintain <50 MB memory footprint during long sessions  
- [ ] Export logs and diffs as `.zip` bundle  

---

## 🌍 Phase 5 – Cross-Platform & Open Source

### 🪶 Platform Order
1. Linux (Arch/Omarchy)  
2. macOS (WKWebView build)  
3. Windows (MSVC packaging)

### ✅ Release Prep
- [ ] Add build targets in Cargo for macOS + Windows  
- [ ] Create GitHub Actions CI for all platforms  
- [ ] Write developer setup guide  
- [ ] Add MIT or Apache-2.0 license  
- [ ] Publish to GitHub as open-source project  

---

## 🔮 Future Enhancements

| Feature | Description |
|----------|-------------|
| **Agent Telemetry API** | Capture structured “Claude events” over local socket |
| **VS Code Extension Bridge** | Optional plugin to stream Raven data into sidebar |
| **Performance Profiling** | Track latency of Claude’s requests vs. CPU load |
| **Session Replay** | Visual playback of all file changes as timeline animation |
| **Custom Triggers** | e.g. “Notify if Claude rewrites main.py > 100 lines” |
| **Ollama / LM Studio Monitors** | Extend Raven to other local LLM agents |

---

## 🧭 Notes & Philosophy
- Raven is **local-first**, **open source**, and **transparent**.  
- No telemetry leaves the machine.  
- Every line of code Claude touches can be traced, replayed, and understood.  
- Designed to protect developer trust in AI-assisted workflows.

---

**Author:** Seth Eheart  
**Codename:** Raven  
**Version:** Draft v0.1  
