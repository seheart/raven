# Raven - Global AI Agent Monitor

> **Local-first, multi-project monitoring platform for AI coding agents**

Raven monitors **all your AI agent projects simultaneously** from a single, elegant dashboard. Track file changes, system metrics, and events across 13+ projects in real time — no GitHub required. Built for Claude Code and other local AI development tools.

**Architecture:** Web Application (Node.js + Svelte)
**Status:** Production Ready 🚀
**Version:** 0.10.1 - Professional UX Polish & Frontend Audit

## 🚀 Current Status: Production Quality Release - UX Audit Complete

✅ **Enterprise-grade monitoring platform with polished, consistent UX across all pages!**

### 🆕 What's New in 0.10.1 - Frontend UX Audit

**🎨 Consistent Professional UX (59 improvements across 14 components):**
- [x] **Loading States** - LoadingSkeleton with pulse animations on all pages
- [x] **Live Timestamps** - Real-time "Updated: Xs ago" displays (1-second refresh)
- [x] **Visual Feedback** - Spinning refresh icons during operations
- [x] **API Centralization** - All pages use API_CONFIG (no hardcoded URLs)
- [x] **Button States** - Proper disabled states during async operations
- [x] **Consistent Layout** - Unified header patterns across all sections
- [x] **Professional Polish** - Tokyo Night theme applied uniformly

**🐛 Critical Bug Fixes:**
- [x] **API Health Monitor** - Fixed crash from parameterized endpoints
- [x] **Svelte Reactivity** - Fixed grouped endpoints not updating
- [x] **Glowing Icons** - Removed excessive drop-shadow filters
- [x] **WebSocket URLs** - Fixed hardcoded localhost in ErrorLog
- [x] **Empty States** - Better handling of no-data scenarios

**📊 Pages Improved:**
- System: Status, Storage, Server Sync, Notifications, Errors, API Health, Settings (7 pages)
- Analysis: Performance, Triggers, Session Replay (3 pages)
- Activity: Activity Log (1 page)
- Dashboard: Live Feed, Overview, Agents (3 pages)

### Previous Release: 0.10.0

**🎯 System Section - Complete Overhaul (25+ Features):**
- [x] **Storage Management** - Export/optimize/clean databases with VACUUM
- [x] **Server Sync** - Auto-scheduler, SSH backup, progress tracking
- [x] **API Health Monitor** - Success rate tracking, sparkline graphs, dynamic endpoints
- [x] **Notifications** - Grouping, export, filtering, real-time updates
- [x] **Error Logging** - Search, pagination, export, WebSocket updates
- [x] **Settings** - Compact mode, auto-save, notification permissions
- [x] **Status Panel** - Uptime visualization, DB health, version info

**🔧 Production Quality & Code Improvements:**
- [x] **Error Boundary** - Global crash prevention with recovery UI
- [x] **Centralized Logging** - Level-based logger (dev/production modes)
- [x] **ESLint Integration** - Comprehensive code quality rules
- [x] **Pre-commit Hooks** - Automatic quality checks (blocks console.log)
- [x] **Code Audit** - Fixed 15 critical/high/medium issues
- [x] **Memory Leak Fixes** - Proper cleanup in all components
- [x] **Centralized Config** - Single source of truth for API URLs
- [x] **Zero Console Logs** - Production-clean codebase

### Previous Updates (0.9.0)

**Global Multi-Project Monitoring:**
- [x] Monitor 13+ projects simultaneously
- [x] Instant project filtering dropdown
- [x] Color-coded project badges
- [x] Recent projects quick access (★)
- [x] Keyboard shortcuts (p, Shift+P)
- [x] Visual feedback animations
- [x] Standardized empty states
- [x] Race condition prevention
- [x] Real-time project activity stats

**🤖 Claude Code Integration:**
- [x] Automatic telemetry bridge for Claude Code
- [x] Real-time file operation tracking
- [x] Agent activity visible in Agents panel
- [x] Automatic startup/shutdown with Raven
- [x] Lines changed estimation
- [x] Session start/end tracking

**Previous Features (Still Awesome):**

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
- Claude Bridge: `tail -f /tmp/claude-telemetry-bridge.log`

### 🤖 Claude Code Integration (New!)

Raven now includes **automatic telemetry tracking** for Claude Code! Every file operation is automatically tracked and appears in the Agents panel.

**The telemetry bridge starts automatically with Raven.** All your edits, creates, and deletes will show up in real-time!

**Manual control:**
```bash
# Start bridge manually
./scripts/start-claude-bridge.sh

# Stop bridge
./scripts/stop-claude-bridge.sh

# View activity
tail -f /tmp/claude-telemetry-bridge.log
```

See `scripts/README-CLAUDE-BRIDGE.md` for full documentation.

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

### Phase 6 - Global Multi-Project Monitoring ✅ 🆕
- [x] Monitor 13+ projects simultaneously from single dashboard
- [x] Global project filter in header with dropdown
- [x] Color-coded project badges (10-color Tokyo Night palette)
- [x] Recent projects quick access with ★ icons
- [x] Keyboard shortcuts: `p` (cycle), `Shift+P` (view all)
- [x] Visual feedback animations on filter change
- [x] Standardized empty states with context-aware messaging
- [x] Race condition prevention in Git panel
- [x] Real-time project activity aggregation
- [x] localStorage validation and auto-reset
- [x] Reusable ProjectBadge component
- [x] Shared project filter utilities library

## 📦 Installation

See [docs/SETUP.md](docs/SETUP.md) for detailed installation instructions.

### Platform Support

✅ **Linux** - Fully supported (Arch, Ubuntu, Debian, etc.)
✅ **macOS** - Fully supported (Intel + Apple Silicon)
⚠️ **Windows** - Via WSL (not tested natively)

**macOS users:** Requires Xcode Command Line Tools for native module compilation. See [macOS Setup](docs/SETUP.md#macos-specific-requirements).

### First-time setup

```bash
# macOS only: Install build tools first
xcode-select --install

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

**🆕 Global Multi-Project Dashboard** featuring:

**Header:**
- **Project Filter Dropdown** - 👁️ Switch between 13+ projects instantly
- **Recent Projects** - Quick access with ★ icons
- **Visual Feedback** - Pulse animation on filter change

**Panels (All Project-Aware):**
- **Overview Panel** - Multi-project grid with activity status
- **System Metrics** - Real-time CPU and memory per project
- **Event Feed** - Live file changes with color-coded project badges
- **Live Code Feed** - Real-time diffs and changes per project
- **Git Panel** - Per-project repository status
- **Triggers Panel** - Project-specific alert events
- **Status Panel** - Quick-switch between monitored projects

**Power User Features:**
- **Keyboard Shortcuts** - Press `?` for help, `p` to cycle projects, `Shift+P` for all
- **Time Travel Panel** - Browse tracked files with project context
- **Diff Viewer** - Side-by-side comparison of changes
- **Export Tools** - Download filtered events as JSON or CSV

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
- **Global by Default** - Monitor your entire AI project portfolio simultaneously
- **Local-first** - All data stays on your machine
- **Open source** - Transparent and auditable
- **Lightweight** - Target <50 MB memory footprint
- **Privacy-focused** - No telemetry, no cloud dependency
- **Developer-centric** - Keyboard shortcuts, color coding, instant filtering

**Vision:** Every line of code an AI agent touches across *all your projects* can be traced, compared, and understood from a single elegant interface.

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
Version: 0.9.0 (Global Multi-Project Monitoring)

---

**Status:** 🚀 Global multi-project monitoring platform! Monitor 13+ AI agent projects simultaneously with color-coded badges, keyboard shortcuts, and instant filtering. Every project, one dashboard.
