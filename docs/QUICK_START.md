# 🚀 Raven Quick Start Guide

**Get up and running with Raven in 5 minutes!**

---

## ⚡ 60-Second Install

```bash
# 1. Clone repository
git clone https://github.com/seheart/raven.git
cd raven

# 2. Start Raven (installs dependencies automatically)
./start.sh

# 3. Open browser to http://localhost:5173
```

**That's it!** Raven is now monitoring your AI development activity.

---

## 📋 Prerequisites

| Requirement | Version | Check Command |
|-------------|---------|---------------|
| **Node.js** | 18+ | `node --version` |
| **npm** | 9+ | `npm --version` |

**Install Node.js:**
- Ubuntu/Debian: `sudo apt install nodejs npm`
- macOS: `brew install node`
- Windows: Download from [nodejs.org](https://nodejs.org/)

---

## 🎯 What You Get

After running `./start.sh`, you'll have:

✅ **Backend Server** running on `http://localhost:3030`
- REST API with 37 endpoints
- WebSocket server for real-time updates
- SQLite database for all events
- File watcher monitoring your projects
- Git integration
- System metrics collection

✅ **Frontend UI** running on `http://localhost:5173`
- Real-time dashboard
- Agent monitoring panel
- Performance metrics
- Session replay
- Trigger alerts
- Git status panel

---

## 🎨 First Steps

### 1. Choose Your Project

Raven auto-discovers all projects in `/home/seth/Projects/`. Select one from the dropdown in the top-right corner.

### 2. Explore the Dashboard

Click through the tabs:
- **Dashboard** (1) - Overview with stats cards
- **Git** (2) - Git status and commit history
- **Replay** (3) - Session timeline replay
- **Performance** (4) - System metrics and correlations
- **Triggers** (5) - Alert configuration
- **Agents** (6) - AI agent monitoring
- **Status** (7) - System health

### 3. Watch Real-Time Updates

Make changes to files in your project and watch them appear instantly in:
- Live Code Feed (Dashboard tab)
- Activity Log (bottom panel)
- Git Panel (uncommitted changes)

### 4. Send Agent Telemetry

Test the telemetry API:

```bash
curl -X POST http://localhost:3030/telemetry \
  -H "Content-Type: application/json" \
  -d '{
    "agent": "test",
    "event": "demo",
    "message": "Hello from Quick Start!"
  }'
```

Check the Agents tab - your event should appear!

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1-7` | Switch tabs |
| `?` | Show keyboard shortcuts |
| `Esc` | Close modals/dialogs |

---

## 🔧 Common Commands

```bash
# Start Raven
./start.sh

# Stop Raven
./stop.sh

# Restart Raven
./restart.sh

# View backend logs
tail -f /tmp/raven-backend.log

# View frontend logs
tail -f /tmp/raven-frontend.log

# Check if servers are running
curl http://localhost:3030/health    # Backend
curl http://localhost:5173           # Frontend
```

---

## 📊 Quick API Tests

### Get Dashboard Statistics
```bash
curl http://localhost:3030/api/dashboard-stats
```

### Get Top Modified Files
```bash
curl http://localhost:3030/api/top-modified-files?limit=10
```

### Get Agent Events
```bash
curl http://localhost:3030/api/agent-events?limit=20
```

### Get System Metrics
```bash
curl http://localhost:3030/api/system-metrics?limit=10
```

### Get Project List
```bash
curl http://localhost:3030/api/projects/list
```

---

## 🤖 Integrate Your AI Agent

Send telemetry from your agent (Python example):

```python
import requests
import json

def send_telemetry(agent, event_type, message, **kwargs):
    event = {
        "agent": agent,
        "event": event_type,
        "message": message,
        **kwargs
    }

    response = requests.post(
        'http://localhost:3030/telemetry',
        json=event
    )

    return response.json()

# Usage
send_telemetry(
    agent="my-agent",
    event_type="edit",
    message="Refactored authentication",
    file="src/auth.js",
    lines_changed=42,
    duration_ms=3480
)
```

---

## 🎨 Customize Your Experience

### Change Theme

Click the theme buttons in the top-right:
- **Day** - Gruvbox light theme
- **Dusk** - Ristretto warm theme
- **Night** - Tokyo Night dark theme (default)

### Configure Triggers

1. Edit `.raven/triggers.toml`
2. Add custom alert conditions
3. Reload triggers: `curl -X POST http://localhost:3030/api/triggers-reload`

**Example trigger:**
```toml
[[triggers]]
name = "my_custom_trigger"
condition = "cpu > 50"
action = "log"
message = "High CPU: {cpu}%"
cooldown_seconds = 60
```

---

## 📁 Project Structure

```
raven/
├── backend/                  # Node.js Express server
│   ├── server.js            # Main server (port 3030)
│   ├── db.js                # SQLite database
│   ├── metrics-collector.js # System metrics
│   └── trigger-engine.js    # Alert system
│
├── frontend/                 # Svelte web UI
│   └── src/
│       ├── App.svelte       # Main app
│       └── lib/             # UI components
│
├── .raven/                   # Runtime data
│   ├── config.toml          # Configuration
│   ├── triggers.toml        # Alert rules
│   ├── db/                  # SQLite databases
│   └── snapshots/           # File snapshots
│
├── docs/                     # Documentation
├── start.sh                  # Start script
├── stop.sh                   # Stop script
└── restart.sh                # Restart script
```

---

## 🐛 Troubleshooting

### Backend won't start

**Error:** `Port 3030 already in use`

```bash
# Kill existing process
lsof -ti:3030 | xargs kill -9

# Or change port in backend/server.js
```

**Error:** `Cannot find module`

```bash
cd backend && npm install
```

### Frontend won't start

**Error:** `Cannot find module`

```bash
cd frontend && npm install
```

### WebSocket not connecting

1. Check backend is running: `curl http://localhost:3030/health`
2. Check browser console for errors
3. Verify CORS settings in `backend/server.js`

### Database errors

```bash
# Stop Raven
./stop.sh

# Remove lock files
rm .raven/db/*.db-wal .raven/db/*.db-shm

# Restart
./start.sh
```

---

## 📚 Next Steps

Now that Raven is running, dive deeper:

### 📖 Read the Docs
- [Architecture](ARCHITECTURE.md) - System design and tech stack
- [REST API Reference](api/REST_API.md) - All 37 API endpoints
- [WebSocket API](api/WEBSOCKET_API.md) - Real-time events
- [Database Schema](api/DATABASE_SCHEMA.md) - Database structure
- [Telemetry API](api/TELEMETRY_API.md) - Agent integration guide
- [Features Guide](FEATURES.md) - Complete feature list
- [Deployment Guide](DEPLOYMENT.md) - Production deployment

### 🛠️ Customize
- Configure triggers in `.raven/triggers.toml`
- Adjust metrics collection in `backend/metrics-collector.js`
- Modify UI components in `frontend/src/lib/`

### 🤝 Contribute
- [Contributing Guide](../CONTRIBUTING.md)
- [GitHub Issues](https://github.com/seheart/raven/issues)

---

## 💡 Pro Tips

1. **Keep Dashboard Open** - Pin it to a second monitor for real-time visibility
2. **Use Keyboard Shortcuts** - Press `?` to see all shortcuts
3. **Monitor Multiple Projects** - Switch projects using the dropdown
4. **Review Longest Edits** - Find files that need review in Dashboard
5. **Check Agent Stats** - See which agents are most active
6. **Export Data** - Use JSON/CSV export in Event Feed
7. **Set Up Triggers** - Get alerts for important conditions

---

## 🎉 You're Ready!

Raven is now monitoring your AI development activity.

**Quick checklist:**
- ✅ Backend running on port 3030
- ✅ Frontend running on port 5173
- ✅ Dashboard accessible in browser
- ✅ File changes being monitored
- ✅ Git integration active
- ✅ System metrics collecting
- ✅ Ready to receive agent telemetry

**Happy coding!** 🚀

---

## 🆘 Need Help?

- **Documentation:** [docs/README.md](README.md)
- **Issues:** [github.com/seheart/raven/issues](https://github.com/seheart/raven/issues)
- **Discussions:** [github.com/seheart/raven/discussions](https://github.com/seheart/raven/discussions)

---

**Last Updated:** 2025-10-19
**Version:** 0.6.1
**Author:** Seth Eheart
