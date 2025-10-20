# 📚 Raven Documentation

**Version:** 0.6.1
**Last Updated:** 2025-10-19
**Status:** ✅ Production Ready

---

## 🚀 Quick Links

| For... | Start Here |
|--------|------------|
| **New Users** | [Quick Start Guide](QUICK_START.md) ⚡️ |
| **Installation** | [Setup Guide](SETUP.md) 🔧 |
| **API Integration** | [REST API Reference](api/REST_API.md) 📡 |
| **Real-time Events** | [WebSocket API](api/WEBSOCKET_API.md) 🔌 |
| **Contributing** | [Contributing Guide](../CONTRIBUTING.md) 🤝 |

---

## 📖 Documentation Index

### 🎯 Getting Started

| Document | Description | For Who |
|----------|-------------|---------|
| [Quick Start](QUICK_START.md) | **5-minute guide** to get Raven running | Everyone (start here!) |
| [Setup Guide](SETUP.md) | Complete installation and configuration | New users, DevOps |
| [Architecture](ARCHITECTURE.md) | System design and tech stack | Developers, architects |
| [Features](FEATURES.md) | Complete feature list with status | Product managers, users |

### 🔌 API Reference

| Document | Description | For Who |
|----------|-------------|---------|
| [REST API](api/REST_API.md) | **37 REST endpoints** with examples | Developers, integrators |
| [WebSocket API](api/WEBSOCKET_API.md) | **8 real-time events** with examples | Frontend developers |
| [Database Schema](api/DATABASE_SCHEMA.md) | **4 SQLite tables** with queries | DBAs, data analysts |
| [Telemetry API](api/TELEMETRY_API.md) | Agent integration guide | AI agent developers |

### 🎨 Feature Guides

| Document | Description | For Who |
|----------|-------------|---------|
| [Agent Monitoring](api/AGENT_MONITORING.md) | Monitor Claude, Ollama, LM Studio | AI developers |
| [Custom Triggers](api/CUSTOM_TRIGGERS.md) | Alert system configuration | DevOps, power users |
| [Session Replay](api/SESSION_REPLAY.md) | Time-travel debugging | Developers, QA |
| [Performance Profiling](api/PERFORMANCE_PROFILING.md) | System performance analysis | DevOps, optimizers |
| [User Experience](api/USER_EXPERIENCE.md) | Dashboard, CLI, UI features | All users |

### 🛠️ Operations

| Document | Description | For Who |
|----------|-------------|---------|
| [Deployment](DEPLOYMENT.md) | Production deployment guide | DevOps, sysadmins |
| [Testing](TESTING.md) | Testing infrastructure | QA, developers |
| [Security](SECURITY.md) | Security policy | Security teams |

### 📊 Project Management

| Document | Description | For Who |
|----------|-------------|---------|
| [Project Plan](PROJECT_PLAN.md) | Roadmap and phases | Product managers |
| [History](HISTORY.md) | Development timeline | Curious users |
| [Changelog](CHANGELOG.md) | Version history | All users |
| [Governance](GOVERNANCE_PLAN.md) | Project governance | Contributors |

### 📝 Reports & Audits

| Document | Description | Status |
|----------|-------------|--------|
| [Documentation Audit](DOCUMENTATION_AUDIT.md) | **Complete verification** of docs vs implementation | ✅ Latest |
| [Final Test Summary](FINAL_TEST_SUMMARY.md) | v0.6.1 test results | ✅ Complete |
| [Test Report](../TEST_REPORT.md) | Detailed test documentation | ✅ Complete |
| [Phase 1 Complete](PHASE_1_COMPLETE.md) | Phase 1 completion report | ✅ Archived |
| [Phase 2 Complete](PHASE_2_COMPLETE.md) | Phase 2 completion report | ✅ Archived |

### 🤝 Contributing

| Document | Description | For Who |
|----------|-------------|---------|
| [Contributing Guide](../CONTRIBUTING.md) | How to contribute | Contributors |
| [Pull Request Template](../.github/PULL_REQUEST_TEMPLATE.md) | PR checklist | Contributors |
| [Bug Report Template](../.github/ISSUE_TEMPLATE/bug_report.md) | Report bugs | Users |
| [Feature Request Template](../.github/ISSUE_TEMPLATE/feature_request.md) | Request features | Users |

---

## 🏗️ System Overview

### What is Raven?

Raven is a **local-first AI agent monitoring tool** that tracks file changes, agent activity, system metrics, and Git status in real-time. Think of it as a "black box recorder" for your AI-assisted development sessions.

### Architecture at a Glance

```
┌─────────────────────────────────────────────────────┐
│              Frontend (Svelte + Vite)               │
│              http://localhost:5173                  │
│                                                     │
│  Dashboard | Git Panel | Session Replay | Agents   │
└─────────────────────┬───────────────────────────────┘
                      │ WebSocket (Socket.IO)
                      │ REST API
┌─────────────────────▼───────────────────────────────┐
│         Backend (Node.js + Express)                 │
│         http://localhost:3030                       │
│                                                     │
│  ┌──────────┐ ┌──────────┐ ┌─────────────────┐    │
│  │ File     │ │ Metrics  │ │ Trigger Engine  │    │
│  │ Watcher  │ │ Collector│ │                 │    │
│  └──────────┘ └──────────┘ └─────────────────┘    │
└─────────────────────┬───────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────┐
│            SQLite Database (WAL mode)               │
│                                                     │
│  events | agent_events | raven_metrics |           │
│  process_metrics                                    │
└─────────────────────────────────────────────────────┘
```

### Tech Stack

| Component | Technology |
|-----------|------------|
| **Backend** | Node.js 18+, Express 4.21.2 |
| **Frontend** | Svelte, Vite |
| **Database** | SQLite 3 (better-sqlite3) |
| **Real-time** | Socket.IO 4.8.1 |
| **File Watching** | chokidar 4.0.3 |
| **Metrics** | systeminformation |
| **Git** | Custom GitMonitor module |

---

## 📊 Features by Category

### 🔍 Monitoring

- ✅ Real-time file change detection
- ✅ Git status and commit tracking
- ✅ System metrics (CPU, memory, disk, network)
- ✅ Process-level metrics
- ✅ Multi-project support with auto-discovery
- ✅ File snapshots for time travel

### 🤖 Agent Integration

- ✅ Agent telemetry API (Claude, Ollama, LM Studio, Custom)
- ✅ Multi-agent support
- ✅ Agent performance tracking
- ✅ Agent status monitoring
- ✅ Color-coded agent visualization

### 📊 Analytics

- ✅ Dashboard statistics
- ✅ Top modified files
- ✅ Longest edits leaderboard
- ✅ Performance correlations
- ✅ Metrics charts (CPU/memory over time)
- ✅ Activity timeline

### ⚡️ Alerts

- ✅ Custom trigger system
- ✅ TOML-based configuration
- ✅ Cooldown periods
- ✅ Multiple action types (log, notify)
- ✅ Trigger statistics
- ✅ Real-time trigger events

### 🎨 User Interface

- ✅ Modern dark/light/dusk themes
- ✅ Real-time WebSocket updates
- ✅ Keyboard shortcuts
- ✅ Responsive design
- ✅ Project switcher
- ✅ JSON/CSV export

---

## 🚀 Quick Start Commands

```bash
# Installation
git clone https://github.com/seheart/raven.git
cd raven
./start.sh

# Management
./stop.sh      # Stop all servers
./restart.sh   # Restart everything

# Testing
curl http://localhost:3030/health              # Backend health
curl http://localhost:3030/api/dashboard-stats # Get statistics
curl http://localhost:5173                     # Frontend health

# Logs
tail -f /tmp/raven-backend.log   # Backend logs
tail -f /tmp/raven-frontend.log  # Frontend logs

# Database
sqlite3 .raven/db/raven.db       # Direct SQL access
```

---

## 📡 API Quick Reference

### REST API (37 endpoints)

```javascript
const API = 'http://localhost:3030/api';

// Dashboard
GET  /api/dashboard-stats           // Statistics
GET  /api/top-modified-files        // Most edited files
GET  /api/longest-edits             // Largest edits

// Agents
POST /telemetry                     // Send agent event
GET  /api/agents-status             // All agents
GET  /api/agent-events              // Agent events
GET  /api/agent-stats               // Agent statistics

// Metrics
GET  /api/system-metrics            // System metrics
GET  /api/process-metrics/:agent    // Process metrics

// Files
GET  /api/file-events               // File changes
GET  /api/tracked-files             // All files
GET  /api/snapshots/:filepath       // File snapshots
POST /api/restore                   // Restore file

// Projects
GET  /api/projects/list             // All projects
POST /api/projects/select           // Switch project

// Git
GET  /api/git/status                // Git status
GET  /api/git/history               // Commit history
GET  /api/git/diff/:filepath        // File diff
```

### WebSocket Events (8 events)

```javascript
import { io } from 'socket.io-client';
const socket = io('http://localhost:3030');

socket.on('file-changed', data => {});        // File change
socket.on('git-status-updated', data => {});  // Git update
socket.on('project-switched', data => {});    // Project change
socket.on('agent-event', data => {});         // Agent event
socket.on('agent-stats', data => {});         // Agent stats
socket.on('system-metrics', data => {});      // System metrics
socket.on('trigger-fired', data => {});       // Trigger alert
socket.on('trigger-stats', data => {});       // Trigger stats
```

---

## 🎯 Common Use Cases

### 1. Monitor AI Coding Session

**Goal:** Track all file changes made by Claude during coding

**Setup:**
1. Start Raven: `./start.sh`
2. Open Dashboard in browser
3. Let Claude make changes
4. Watch real-time updates in Live Code Feed

**Result:** See every file change, diff, and system impact in real-time

---

### 2. Track Multiple AI Agents

**Goal:** Compare performance of Claude, Ollama, and LM Studio

**Setup:**
1. Configure each agent to send telemetry to `POST /telemetry`
2. Open Agents panel
3. Monitor agent statistics

**Result:** See which agent is most active, fastest, and which files they modify

---

### 3. Debug Performance Issues

**Goal:** Find what causes CPU spikes during development

**Setup:**
1. Open Performance panel
2. Enable "High CPU" trigger in Triggers panel
3. Monitor CPU chart in real-time
4. Check Performance Correlations

**Result:** Correlate CPU spikes with file changes or agent activity

---

### 4. Review Session History

**Goal:** See what happened during yesterday's coding session

**Setup:**
1. Open Session Replay panel
2. Select date/time range
3. Use timeline slider to navigate
4. Review file changes and agent events

**Result:** Time-travel through your development history

---

### 5. Export Session Data

**Goal:** Share session data with team

**Setup:**
1. Open Event Feed
2. Filter events as needed
3. Click "📥 JSON" or "📥 CSV"
4. Share exported file

**Result:** Portable session data for analysis or documentation

---

## 🔧 Configuration

### Main Config: `.raven/config.toml`

```toml
[monitoring]
watch_path = "raven"           # Project to monitor
debounce_ms = 50               # File change debounce

[metrics]
enabled = true
interval_seconds = 1           # Metrics collection frequency

[projects]
active = "raven"               # Active project name
```

### Triggers: `.raven/triggers.toml`

```toml
[[triggers]]
name = "high_cpu"
condition = "cpu > 80"
action = "log"
message = "High CPU: {cpu}%"
cooldown_seconds = 60
```

---

## 🐛 Troubleshooting

### Quick Fixes

| Problem | Solution |
|---------|----------|
| Backend won't start | `cd backend && npm install` |
| Frontend won't start | `cd frontend && npm install` |
| Port 3030 in use | `lsof -ti:3030 \| xargs kill -9` |
| Database locked | `rm .raven/db/*.db-wal` then restart |
| WebSocket not connecting | Check backend is running: `curl http://localhost:3030/health` |

**See [Setup Guide](SETUP.md) for detailed troubleshooting.**

---

## 📈 Performance

### Typical Metrics

| Metric | Value |
|--------|-------|
| **API Response Time** | <100ms |
| **WebSocket Latency** | <50ms |
| **Database Query Time** | <10ms |
| **Memory Usage** | ~500MB total |
| **CPU Usage** | 3-15% idle |

### Scaling

- **Projects:** Unlimited (auto-discovery)
- **Agents:** Up to 10 concurrent
- **Events:** 100,000+ per day
- **Metrics:** 86,400 samples per day (1/sec)
- **Storage:** ~1GB per month

---

## 🆘 Support

### Documentation

- **This Index:** Complete documentation map
- **Quick Start:** [docs/QUICK_START.md](QUICK_START.md)
- **API Docs:** [docs/api/REST_API.md](api/REST_API.md)

### Community

- **GitHub Issues:** [github.com/seheart/raven/issues](https://github.com/seheart/raven/issues)
- **Discussions:** [github.com/seheart/raven/discussions](https://github.com/seheart/raven/discussions)
- **Email:** seheart@gmail.com

### Contributing

See [Contributing Guide](../CONTRIBUTING.md) for:
- Development setup
- Code style guidelines
- Pull request process
- Testing requirements

---

## 📊 Documentation Health

| Category | Score | Status |
|----------|-------|--------|
| **Accuracy** | 95% | ✅ Excellent |
| **Completeness** | 90% | ✅ Very Good |
| **Organization** | 95% | ✅ Excellent |
| **Up-to-date** | 100% | ✅ Perfect |
| **OVERALL** | **95%** | **✅ Excellent** |

**Last Audit:** 2025-10-19
**See:** [Documentation Audit](DOCUMENTATION_AUDIT.md)

---

## 🎉 Ready to Start?

1. **Brand New?** → [Quick Start Guide](QUICK_START.md)
2. **Need Details?** → [Setup Guide](SETUP.md)
3. **Building Integration?** → [REST API](api/REST_API.md) or [WebSocket API](api/WEBSOCKET_API.md)
4. **Want to Contribute?** → [Contributing Guide](../CONTRIBUTING.md)

---

**Happy coding with Raven!** 🚀

---

**Version:** 0.6.1
**Last Updated:** 2025-10-19
**Author:** Seth Eheart
**License:** MIT
