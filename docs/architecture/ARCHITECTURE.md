# Raven Architecture

**Version:** 0.6.0
**Architecture:** Web Application (Client-Server)
**Status:** Production Ready

---

## 🏗️ System Overview

Raven is a **web-based** AI agent monitoring tool with a client-server architecture:

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT BROWSER                       │
│  ┌──────────────────────────────────────────────────┐  │
│  │         Svelte Frontend (Port 9000)              │  │
│  │  - Dashboard, Metrics, Agents, Triggers UI       │  │
│  │  - Real-time updates via Socket.IO               │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                           │
                           │ HTTP + WebSocket
                           ▼
┌─────────────────────────────────────────────────────────┐
│              Node.js Backend (Port 9100)                │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Express Server                                  │  │
│  │  - REST API (21 endpoints)                       │  │
│  │  - Socket.IO WebSocket server                    │  │
│  │  - File watcher (chokidar)                       │  │
│  │  - Metrics collector (systeminformation)         │  │
│  │  - Trigger engine (TOML config)                  │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│              SQLite Database (.raven/db/)               │
│  - events                                               │
│  - agent_events                                         │
│  - raven_metrics                                        │
│  - process_metrics                                      │
└─────────────────────────────────────────────────────────┘
```

---

## 📂 Project Structure

```
raven/
├── backend/                    # Node.js Express Server
│   ├── server.js              # Main server (Express + Socket.IO)
│   ├── db.js                  # SQLite database wrapper
│   ├── metrics-collector.js   # System metrics (CPU, memory)
│   ├── trigger-engine.js      # Alert trigger system
│   ├── package.json           # Node.js dependencies
│   └── node_modules/          # Dependencies (132 packages)
│
├── frontend/                   # Svelte Web Application
│   ├── src/
│   │   ├── App.svelte         # Main app with tab navigation
│   │   ├── lib/               # UI components (18 Svelte files)
│   │   │   ├── Dashboard.svelte
│   │   │   ├── AgentsPanel.svelte
│   │   │   ├── MetricsPanel.svelte
│   │   │   ├── SessionReplay.svelte
│   │   │   ├── TriggersPanel.svelte
│   │   │   └── ...
│   │   └── main.js
│   ├── package.json
│   └── vite.config.js
│
├── .raven/                     # Runtime data
│   ├── config.toml            # Configuration file
│   ├── db/raven.db           # SQLite database
│   └── snapshots/            # File snapshots
│
├── docs/                       # Documentation (10 files)
├── scripts/                    # Build and test scripts
└── test_workspace/            # Test directory for monitoring
```

---

## 🎯 Tech Stack

### Backend (Node.js)

| Component         | Technology        | Version | Purpose                        |
| ----------------- | ----------------- | ------- | ------------------------------ |
| **Runtime**       | Node.js           | 20+     | JavaScript runtime             |
| **Framework**     | Express           | 4.21.2  | HTTP server & REST API         |
| **WebSockets**    | Socket.IO         | 4.8.1   | Real-time bidirectional events |
| **Database**      | better-sqlite3    | 11.8.1  | SQLite database wrapper        |
| **File Watching** | chokidar          | 4.0.3   | File system monitoring         |
| **Metrics**       | systeminformation | 5.27.11 | System metrics collection      |
| **Config**        | toml              | 3.0.0   | TOML configuration parsing     |
| **UUID**          | uuid              | 11.0.5  | Session ID generation          |
| **CORS**          | cors              | 2.8.5   | Cross-origin resource sharing  |

### Frontend (Svelte)

| Component            | Technology       | Version | Purpose                  |
| -------------------- | ---------------- | ------- | ------------------------ |
| **Framework**        | Svelte           | Latest  | Reactive UI framework    |
| **Build Tool**       | Vite             | Latest  | Fast development server  |
| **WebSocket Client** | Socket.IO Client | Latest  | Real-time event handling |
| **HTTP Client**      | Fetch API        | Native  | REST API calls           |
| **Testing**          | Vitest           | Latest  | Unit testing             |

---

## 🔌 Communication Protocols

### REST API (HTTP)

**Base URL:** `http://localhost:9100/api`

**Endpoints (21):**

| Method | Endpoint                            | Purpose                    |
| ------ | ----------------------------------- | -------------------------- |
| GET    | `/api/session-id`                   | Get current session ID     |
| GET    | `/api/dashboard-stats`              | Dashboard statistics       |
| GET    | `/api/top-modified-files`           | Most edited files          |
| GET    | `/api/longest-edits`                | Largest code changes       |
| GET    | `/api/agents-status`                | Active agents status       |
| GET    | `/api/agent-events`                 | Agent telemetry events     |
| GET    | `/api/events-by-agent/:agent`       | Events for specific agent  |
| GET    | `/api/agent-stats`                  | Agent statistics           |
| GET    | `/api/system-metrics`               | System CPU/memory metrics  |
| GET    | `/api/process-metrics/:agent`       | Per-process metrics        |
| GET    | `/api/metrics-stats`                | Metrics aggregations       |
| GET    | `/api/performance-correlations`     | Correlation analysis       |
| GET    | `/api/tracked-files`                | List of monitored files    |
| GET    | `/api/events-by-session/:sessionId` | Events by session          |
| GET    | `/api/triggers-config`              | Trigger configuration      |
| GET    | `/api/triggered-events`             | Fired trigger events       |
| GET    | `/api/trigger-stats`                | Trigger statistics         |
| POST   | `/api/triggers-reload`              | Reload trigger config      |
| POST   | `/api/triggers-clear-cooldowns`     | Clear trigger cooldowns    |
| POST   | `/telemetry`                        | Send agent telemetry event |
| GET    | `/health`                           | Health check endpoint      |

### WebSocket (Socket.IO)

**URL:** `ws://localhost:9100`

**Events:**

| Event            | Direction       | Purpose                  |
| ---------------- | --------------- | ------------------------ |
| `agent-event`    | Server → Client | New telemetry event      |
| `agent-stats`    | Server → Client | Updated agent statistics |
| `metrics-update` | Server → Client | System metrics update    |
| `trigger-fired`  | Server → Client | Alert triggered          |
| `file-changed`   | Server → Client | File system change       |

---

## 💾 Database Schema

**File:** `.raven/db/raven.db` (SQLite 3)

### Table: `events`

File system change events.

```sql
CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    filepath TEXT,
    change_type TEXT,
    diff TEXT,
    cpu REAL,
    mem REAL,
    session_id TEXT,
    file_hash TEXT,
    event_size INTEGER
);
```

### Table: `agent_events`

AI agent telemetry events.

```sql
CREATE TABLE agent_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    agent TEXT NOT NULL,
    event_type TEXT NOT NULL,
    file TEXT,
    lines_changed INTEGER,
    duration_ms INTEGER,
    message TEXT NOT NULL,
    metadata TEXT,
    session_id TEXT
);
```

### Table: `raven_metrics`

System-wide metrics (CPU, memory, network).

```sql
CREATE TABLE raven_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    cpu_percent REAL NOT NULL,
    memory_percent REAL NOT NULL,
    memory_used_mb INTEGER NOT NULL,
    memory_total_mb INTEGER NOT NULL,
    network_rx_bytes INTEGER,
    network_tx_bytes INTEGER,
    session_id TEXT
);
```

### Table: `process_metrics`

Per-process metrics for AI agents.

```sql
CREATE TABLE process_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    pid INTEGER NOT NULL,
    cpu_usage REAL NOT NULL,
    memory_mb INTEGER NOT NULL,
    virtual_memory_mb INTEGER NOT NULL,
    disk_read_bytes INTEGER,
    disk_write_bytes INTEGER,
    status TEXT,
    session_id TEXT
);
```

---

## 🔧 Configuration

**File:** `.raven/config.toml`

```toml
[monitoring]
watch_path = "../test_workspace"
ignore_patterns = ["**/node_modules/**", "**/.git/**"]
debounce_ms = 50
max_events = 1000

[database]
db_path = "db/raven.db"

[snapshots]
enabled = true
retention_days = 7
max_snapshot_size_mb = 10

[metrics]
enabled = true
interval_seconds = 2
cpu_threshold = 80.0
memory_threshold = 85.0

[triggers.large_edit]
file = "*.js"
lines_changed = ">100"
action = "log"
message = "Large edit detected: {file} ({lines_changed} lines)"
cooldown_seconds = 60
```

---

## 🚀 Deployment

### Development

```bash
# Terminal 1: Start backend
cd backend
npm install
npm start

# Terminal 2: Start frontend
cd frontend
npm install
npm run dev

# Access: http://localhost:9000
```

### Production

**Option 1: Separate processes**

```bash
# Backend
cd backend && npm install
pm2 start server.js --name raven-backend

# Frontend
cd frontend && npm install && npm run build
# Serve dist/ with nginx or Apache
```

**Option 2: Backend serves frontend**

```bash
# Build frontend
cd frontend && npm run build

# Copy dist/ to backend/public/
mkdir -p backend/public
cp -r frontend/dist/* backend/public/

# Configure Express to serve static files
# (Add to server.js: app.use(express.static('public')))

# Start combined server
cd backend && npm start
```

### Environment Variables

```bash
# Backend
PORT=9100                    # Server port
NODE_ENV=production          # Production mode
DB_PATH=.raven/db/raven.db  # Database path

# Frontend
VITE_API_URL=http://localhost:9100  # API base URL
```

---

## 📊 Performance Characteristics

### Resource Usage

| Metric          | Typical  | Peak                      |
| --------------- | -------- | ------------------------- |
| Backend Memory  | 50-80 MB | 120 MB                    |
| Frontend Memory | 30-50 MB | 80 MB                     |
| Database Size   | 5-10 MB  | 50 MB (with snapshots)    |
| CPU Usage       | 2-5%     | 15% (during file changes) |

### Scalability Limits

- **File Events:** ~1000 events/sec max throughput
- **WebSocket Clients:** 100+ concurrent connections
- **Database:** Millions of events (SQLite limit: 281 TB)
- **Metrics Sampling:** 5-second intervals (configurable)

---

## 🔐 Security Considerations

### Current Implementation

- ✅ CORS enabled (localhost:9000)
- ✅ JSON payload limit (50 MB)
- ⚠️ No authentication (localhost only)
- ⚠️ No HTTPS (development)

### Production Recommendations

1. **Keep it loopback-only** (Raven deliberately ships no auth — see DECISIONS.md).
   If you must expose it, put an authenticating reverse proxy in front.

2. **Enable HTTPS:**
   - SSL/TLS certificates
   - Redirect HTTP to HTTPS

3. **Secure Database:**
   - File permissions (chmod 600)
   - Regular backups

4. **Rate Limiting:**
   - Prevent telemetry spam
   - DOS protection

---

## ⚡ Feature Modules

### File Watcher (`chokidar`)

Monitors `test_workspace/` for file changes:

- Detects: create, modify, delete, rename
- Debounced: 50ms (configurable)
- Ignores: node_modules, .git, target, dist
- Generates diffs on modify events

### Metrics Collector (`systeminformation`)

Collects system metrics every 2 seconds:

- CPU usage (%)
- Memory usage (%, MB)
- Network I/O (bytes)
- Process-specific metrics (per-agent)

### Trigger Engine (`trigger-engine.js`)

Evaluates rules from `.raven/config.toml`:

- File patterns (e.g., "\*.js > 100 lines")
- Agent events (e.g., "claude > 5000ms")
- System metrics (e.g., "CPU > 80%")
- Cooldown mechanism (prevents spam)

### Real-time Events (Socket.IO)

Broadcasts events to all connected clients:

- File changes
- Agent events
- Metrics updates
- Trigger alerts

---

## 🧪 Testing

### Backend Tests

```bash
cd backend
npm test  # (if test suite exists)
```

### Frontend Tests

```bash
cd frontend
npm test
```

**Existing Tests:**

- `keyboardService.test.js` - 10 tests
- `EventFeed.test.js` - 8 tests
- `MetricsPanel.test.js` - 4 tests

---

## 🔄 Original Plan vs Reality

### Architecture

- ✅ Web application (browser-based)
- ✅ Node.js Express backend
- ✅ Svelte frontend with Vite
- ✅ Real-time WebSocket communication
- ✅ SQLite database
- ✅ Cross-platform via browser

### Why Web-Based?

**Advantages of Web Architecture:**

1. **Easier deployment** - Standard web hosting
2. **Cross-platform** - Works on any OS with browser
3. **Remote access** - Can monitor from any device
4. **Faster iteration** - Hot reload during development
5. **No installation** - Just visit URL
6. **Lightweight** - No desktop runtime required

---

## 🔮 Future Enhancements

### Short-term

- [ ] Health monitoring dashboard

### Long-term

- [ ] Multi-workspace support
- [ ] Cloud sync (opt-in)
- [ ] Team collaboration features
- [ ] VS Code extension integration
- [ ] Plugin system for custom integrations

---

## 📞 Support

- **Documentation:** See [docs/](docs/) directory
- **Issues:** GitHub Issues
- **Architecture Questions:** See this file

---

**Last Updated:** 2025-10-18
**Version:** 0.6.0
**Architecture:** Web Application (Node.js + Svelte)
