# Raven - AI Agent Monitor

> **Local-first, web-based monitoring tool for AI coding agents**

Raven captures file changes, system metrics, and API events in real time — without relying on GitHub. Built for Claude Code and other local AI development tools.

**Architecture:** Web Application (Node.js + Svelte)
**Status:** Production Ready

## 🚀 Current Status: Phase II.7 Complete - Code Optimized

✅ **Production-ready with optimized performance!**

- [x] Async file watcher with 50ms debounce
- [x] Event logging to SQLite with diffs
- [x] System metrics collection (CPU, memory)
- [x] Real-time event streaming to UI
- [x] File snapshots on every change
- [x] Time-travel file history viewer
- [x] Restore files to any past state
- [x] Snapshot viewing and browsing
- [x] Side-by-side diff viewer
- [x] Event search and filtering
- [x] Keyboard shortcuts system
- [x] Export to JSON/CSV
- [x] Visual timeline slider
- [x] Backend integration tests
- [x] 10 Frontend unit tests
- [x] Stress tests (10K lines, concurrent access)
- [x] Memory profiling tools
- [x] **Open source ready (LICENSE, CONTRIBUTING)**
- [x] **🆕 WebSocket memory leak fixes (11 components)**
- [x] **🆕 Code optimization and cleanup**
- [x] **🆕 Zero breaking changes, 100% backward compatible**

**⚠️ Requires system dependencies to run** (see [docs/SETUP.md](docs/SETUP.md))

## ⚡ Quick Start

```bash
# Start both backend and frontend (fast!)
./start.sh

# Stop all servers
./stop.sh

# Restart everything
./restart.sh
```

**URLs:**
- Backend: http://localhost:3030
- Frontend: http://localhost:5173

**Logs:**
- Backend: `tail -f /tmp/raven-backend.log`
- Frontend: `tail -f /tmp/raven-frontend.log`

## 🎯 Features

### Phase 0 - Foundation ✅
- Project structure and build system
- Core Rust modules
- Svelte frontend UI
- Configuration system
- Test workspace

### Phase 1 - Core Backend ✅
- [x] Async file watcher with 50ms debounce
- [x] Event logging to SQLite
- [x] Diff generation using `similar` crate
- [x] System metrics collection (CPU, memory)
- [x] Real-time event streaming to UI

### Phase 2 - Short-Term Memory ✅
- [x] Automatic snapshots in `.raven/snapshots/`
- [x] Snapshot retrieval API
- [x] Time-travel restore feature (single file)
- [x] File history timeline viewer
- [x] FileBrowser UI component
- [x] Snapshot viewer modal

### Phase 3 - UI Enhancement ✅
- [x] Live event feed from backend
- [x] Real-time resource monitoring
- [x] Visual timeline slider for history browsing
- [x] Side-by-side diff viewer
- [x] Event filtering and search (text + type filters)
- [x] Keyboard shortcuts system
- [x] Export to JSON/CSV

### Phase 4 - Testing & QA ✅
- [x] Backend integration tests
- [x] Frontend unit tests (10 tests, keyboard service)
- [x] Stress testing with large files (10K lines)
- [x] Concurrent database access tests
- [x] Performance benchmarks (all targets met)
- [x] Memory profiling tools
- [x] Comprehensive test documentation

### Phase 5 - Production Ready ✅
- [x] Web-based deployment architecture
- [x] Open source documentation (LICENSE, CONTRIBUTING, CHANGELOG)
- [x] Version management and metadata
- [x] Production startup/shutdown scripts

## 📦 Installation

See [docs/SETUP.md](docs/SETUP.md) for detailed installation instructions.

**First-time setup:**

```bash
# Install backend dependencies
cd backend && npm install && cd ..

# Install frontend dependencies
cd frontend && npm install && cd ..

# Start everything
./start.sh
```

## 🛠️ Tech Stack

**Current Architecture:** Web Application (Client-Server)

- **Backend:** Node.js + Express (REST API + Socket.IO)
- **Frontend:** Svelte + Vite (browser-based UI)
- **Database:** SQLite (better-sqlite3)
- **File Watching:** chokidar
- **Metrics:** systeminformation
- **Real-time:** Socket.IO WebSockets

## 📂 Project Structure

```
raven/
├── backend/                   # Node.js Express Server ⭐ ACTIVE
│   ├── server.js             # Main server (port 3030)
│   ├── db.js                 # SQLite database wrapper
│   ├── metrics-collector.js  # System metrics
│   ├── trigger-engine.js     # Alert system
│   └── package.json          # Dependencies
│
├── frontend/                  # Svelte Web UI ⭐ ACTIVE
│   ├── src/
│   │   ├── App.svelte        # Main application
│   │   └── lib/              # 18 UI components
│   │       ├── Dashboard.svelte
│   │       ├── AgentsPanel.svelte
│   │       ├── MetricsPanel.svelte
│   │       ├── SessionReplay.svelte
│   │       └── ...
│   └── package.json
│
├── .raven/                    # Runtime data
│   ├── config.toml           # Configuration
│   ├── db/raven.db          # SQLite database
│   └── snapshots/           # File snapshots
│
├── docs/                      # Documentation
└── test_workspace/           # Monitored directory
```

## 🧪 Development

```bash
# Backend development
cd backend
npm install
npm start                    # Start server on port 3030

# Frontend development
cd frontend
npm install
npm run dev                  # Start dev server on port 5173
npm test                     # Run Vitest tests
npm run build                # Build for production

# Full stack
npm run dev                  # Starts both backend and frontend (if configured)
```

## 🎨 UI Preview

Current UI includes:
- **System Metrics Panel** - Real-time CPU and memory usage
- **Event Feed** - Live file change events with search, filters, and timeline
- **Time Travel Panel** - Browse tracked files and view history
- **Diff Viewer** - Side-by-side comparison of changes
- **Keyboard Shortcuts** - Press `?` to see all shortcuts
- **Export Tools** - Download events as JSON or CSV

## 🔮 Future Enhancements

| Feature | Description |
|---------|-------------|
| **Agent Telemetry API** | Capture structured Claude events via local socket |
| **VS Code Extension** | Stream Raven data into IDE sidebar |
| **Performance Profiling** | Track latency vs CPU load |
| **Session Replay** | Visual timeline playback of all changes |
| **Custom Triggers** | Alerts for specific file change patterns |
| **Multi-Agent Support** | Extend to Ollama, LM Studio, etc. |

## 🧭 Philosophy

Raven is:
- **Local-first** - All data stays on your machine
- **Open source** - Transparent and auditable
- **Lightweight** - Target <50 MB memory footprint
- **Privacy-focused** - No telemetry, no cloud dependency

Every line of code an AI agent touches can be traced, replayed, and understood.

## 📝 Configuration

Edit `.raven/config.toml` to customize:

```toml
[monitoring]
watch_path = "../test_workspace"
debounce_ms = 50
max_events = 1000

[snapshots]
enabled = true
retention_days = 7

[metrics]
cpu_threshold = 80.0
memory_threshold = 85.0
```

## 🐛 Troubleshooting

See [docs/SETUP.md](docs/SETUP.md#troubleshooting) for common issues and solutions.

## 📚 Documentation

Complete documentation is available in the [docs/](docs/) directory:

- **[Setup Guide](docs/SETUP.md)** - Installation instructions
- **[Testing Guide](docs/TESTING.md)** - Running tests
- **[Development History](docs/HISTORY.md)** - Complete timeline (Phase 0 - II.6)
- **[API Documentation](docs/api/)** - Feature-specific technical docs

## 📄 License

MIT License - See [LICENSE](LICENSE) file

## 👤 Author

**Seth Eheart**
Codename: Raven
Version: 0.8.0 (UX Overhaul Complete)

---

**Status:** Complete UX overhaul! Consolidated navigation, notifications system, storage management, and full-page documentation views 🚀
