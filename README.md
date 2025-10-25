# Raven - Global AI Agent Monitor

> **Local-first, multi-project monitoring platform for AI coding agents**

Raven monitors **all your AI agent projects simultaneously** from a single, elegant dashboard. Track file changes, system metrics, and events across 13+ projects in real time — no GitHub required. Built for Claude Code and other local AI development tools.

**Architecture:** Web Application (Node.js + Svelte)
**Status:** Production Ready 🚀
**Version:** 0.13.0 - Snapshot Protection & Recovery

## 🚀 Current Status: Comprehensive Snapshot Protection

✅ **Never lose code again! Complete protection against AI agent overwrites with instant recovery.**

### 🆕 What's New in 0.13.0 - Snapshot Protection Features

**🛡️ Comprehensive Snapshot Protection:**
- [x] **"Undo Claude" Button** - One-click restore to any previous snapshot
- [x] **Large Deletion Alerts** - Automatic warnings when >100 lines deleted
- [x] **Snapshot Comparison Tool** - Side-by-side diff between any two snapshots
- [x] **Advanced Search & Filters** - Search by time, event type, or event ID
- [x] **Real-time Filtering** - Filter by change type (modified/created/deleted)

**🔍 File History Enhancements:**
- [x] **Smart Search** - Instant search across timestamps, types, and event IDs
- [x] **Type Filters** - Dropdown with event counts for each change type
- [x] **Filter Statistics** - "Showing X of Y snapshots" display
- [x] **Empty States** - Helpful messages when no results match filters
- [x] **Comparison Mode** - Select any 2 snapshots for unified diff view
- [x] **Unified Diff Display** - Professional diff viewer with syntax highlighting

**⚙️ Backend Improvements:**
- [x] **Trigger System** - Configurable alerts for large deletions
- [x] **Event-Driven Snapshots** - Superior to periodic snapshots (saves on every change)
- [x] **1,566+ Snapshots** - Already protecting your code (22MB compressed)
- [x] **getEventById() API** - Retrieve specific events for restoration
- [x] **Dual API Support** - Compatible with both old and new restore formats

**💡 Why This Matters:**
Raven was built to solve the exact problem of AI agents overwriting or forgetting code.
With these features, you have complete visibility into every change, instant recovery
options, and automatic alerts before anything goes wrong.

### Previous Release: 0.12.0 - Agent Conversation Tracker

**🤖 Conversation History Tracking:**
- [x] **Agent Conversations Table** - Full conversation event storage in database
- [x] **Conversation Import** - Parse and import Claude Code .ant/ session files
- [x] **Unified Event Feed** - See file changes AND conversation history together
- [x] **Expandable Details** - Click to view full prompts and AI responses
- [x] **Search & Filter** - Find conversations by content, agent, or project
- [x] **Real-time Updates** - WebSocket notifications for new conversations
- [x] **Batch Import Scripts** - Node.js and Python importers for .ant/ files

**🔧 Critical Authentication Fixes (Zero Console Errors):**
- [x] **ServerSyncPanel** - Fixed 4 raw fetch() calls causing 401 errors
- [x] **ErrorLog WebSocket** - Fixed authentication causing connection failures
- [x] **Process Metrics API** - Added missing /api/process-metrics endpoint (404 fix)
- [x] **Session ID API** - Made /api/session-id public (401 fix)
- [x] **LiveCodeFeed** - Fixed process_metrics column mapping
- [x] **Clean Console** - Zero authentication or API errors in production

**📊 API Endpoints Added:**
- GET `/api/conversations` - Retrieve conversation events with filtering
- GET `/api/conversations/stats` - Activity statistics and insights
- POST `/api/conversations` - Import conversation data
- GET `/api/process-metrics` - Process metrics with pagination
- GET `/api/session-id` - Public session ID endpoint (no auth required)

**🛠️ Developer Experience:**
- [x] **723+ Events Imported** - Full conversation history from Claude sessions
- [x] **Debugging Insights** - Understand AI decision-making process
- [x] **Context Recovery** - Never lose track of what you asked AI to do
- [x] **Zero Breaking Changes** - Fully backward compatible

### Previous Release: 0.11.0 - Backend Production Ready

**🔒 Production Deployment & Security (Docker + CI/CD):**
- [x] **Multi-stage Docker Build** - Production image 28% smaller (50MB reduction)
- [x] **Docker Compose** - Full-stack deployment with health checks
- [x] **GitHub Actions CI/CD** - Automated testing, building, and deployment
- [x] **Security Hardening** - Non-root containers, JWT validation, secret management
- [x] **Data Persistence** - Proper volume mounting for databases and logs
- [x] **Health Checks** - Dedicated healthcheck script for container orchestration

**📊 Observability & Monitoring (Prometheus + Structured Logging):**
- [x] **Prometheus Metrics** - HTTP request duration, in-flight requests, error rates
- [x] **Structured Logging** - Winston-based logging with correlation IDs
- [x] **Request Tracing** - Distributed tracing with X-Correlation-ID headers
- [x] **Performance Metrics** - Percentile calculations (p50, p90, p99) with caching
- [x] **Route Normalization** - Memory-bounded metrics (prevents DoS attacks)
- [x] **Query Sanitization** - Recursive sanitization prevents sensitive data leaks

**📚 API Documentation & Testing:**
- [x] **OpenAPI/Swagger** - Interactive API documentation at `/api-docs`
- [x] **Integration Tests** - 23 tests covering metrics, telemetry, dashboard
- [x] **Health Endpoint** - `/health` and `/metrics` for monitoring
- [x] **API Standardization** - Consistent error responses and validation

**🛠️ Code Quality & Performance:**
- [x] **Comprehensive Code Review** - 20 issues identified and fixed
- [x] **Security Fixes** - Sensitive data sanitization, memory leak prevention
- [x] **Performance Optimization** - 3x faster metrics endpoint, O(1) array operations
- [x] **Perfect Score** - 10/10 code quality (Security, Performance, Reliability)
- [x] **79% Faster Health Endpoint** - Optimized from 18ms to 3.8ms
- [x] **Zero Breaking Changes** - Fully backward compatible

### Previous Release: 0.10.1 - Frontend UX Audit

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

**📖 Contributing:** See [CONTRIBUTING.md](CONTRIBUTING.md) for development best practices and guidelines.

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

**⚠️ Important:** Never use regex/sed for code refactoring! See [CONTRIBUTING.md](CONTRIBUTING.md) for safe refactoring practices.

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

- **[Contributing Guide](CONTRIBUTING.md)** - Development best practices and guidelines
- **[Setup Guide](docs/SETUP.md)** - Installation instructions
- **[Testing Guide](docs/TESTING.md)** - Running tests
- **[Lessons Learned](docs/LESSONS_LEARNED.md)** - Post-mortems and what we learned
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
