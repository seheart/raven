# Raven Setup Guide

## Prerequisites

### All Platforms

- Node.js 20.19+ (`node --version`)
- npm 10+ (`npm --version`)
- **rsync** (for Server Sync feature)
  - Arch Linux: `sudo pacman -S rsync`
  - Ubuntu/Debian: `sudo apt install rsync`
  - macOS: `brew install rsync` (usually pre-installed)
  - Windows: Install via WSL or [Cygwin](https://www.cygwin.com/)

### macOS-Specific Requirements

Raven uses `better-sqlite3`, a native Node.js module that must be compiled during installation. You'll need:

```bash
# Install Xcode Command Line Tools (required for native module compilation)
xcode-select --install
```

**What this provides:**

- ✅ C/C++ compiler toolchain
- ✅ Python (needed by node-gyp for building native modules)
- ✅ Essential build tools

**Note:** The installation may take a few minutes. After installing, `npm install` will automatically compile the native SQLite module for your Mac.

**Compatibility:**

- ✅ Intel Macs - Fully supported
- ✅ Apple Silicon (M1/M2/M3) - Fully supported (native ARM64 builds)
- ✅ systeminformation - Full macOS support for CPU, memory, and system metrics

## Quick Start

```bash
# Clone the repository
git clone https://github.com/seheart/raven.git
cd raven

# Start both backend and frontend
./start.sh

# Open browser to http://localhost:9000
```

**That's it!** The start script handles everything automatically.

## Manual Setup

If you prefer to set up manually or the start script doesn't work:

### 1. Install Backend Dependencies

```bash
cd backend
npm install
cd ..
```

### 2. Install Frontend Dependencies

```bash
cd frontend
npm install
cd ..
```

### 3. Start Backend Server

```bash
cd backend
npm start
# Server runs on http://localhost:9100
```

### 4. Start Frontend Dev Server

In a new terminal:

```bash
cd frontend
npm run dev
# UI runs on http://localhost:9000
```

## Project Structure

```
raven/
├── backend/                   # Node.js Express Server
│   ├── server.js             # Main server (port 9100)
│   ├── db.js                 # SQLite database wrapper
│   ├── metrics-collector.js  # System metrics
│   ├── trigger-engine.js     # Alert system
│   └── package.json          # Backend dependencies
│
├── frontend/                  # Svelte Web UI
│   ├── src/
│   │   ├── App.svelte        # Main application
│   │   └── lib/              # UI components
│   │       ├── Dashboard.svelte
│   │       ├── AgentsPanel.svelte
│   │       ├── PerformancePanel.svelte
│   │       └── ...
│   ├── package.json          # Frontend dependencies
│   └── vite.config.js
│
├── .raven/                    # Runtime data
│   ├── config.toml           # Configuration
│   ├── db/                   # SQLite databases
│   └── snapshots/            # File snapshots
│
├── docs/                      # Documentation
├── scripts/                   # Helper scripts
├── start.sh                   # Start both servers
├── stop.sh                    # Stop all servers
└── restart.sh                 # Restart everything
```

## Verifying Installation

### 1. Check Backend

```bash
curl http://localhost:9100/api/session-id
```

Expected output:

```json
{ "session_id": "..." }
```

### 2. Check Frontend

Open http://localhost:9000 in your browser. You should see the Raven dashboard.

### 3. Test Real-Time Updates

1. Open the Dashboard tab
2. Create/edit a file in the monitored project
3. Watch events appear in real-time

## Configuration

Edit `.raven/config.toml` to customize:

```toml
[monitoring]
watch_path = "../test_workspace"  # Directory to monitor
debounce_ms = 50                  # File change debounce

[metrics]
enabled = true
interval_seconds = 1              # Metrics collection frequency

[projects]
active = "raven"                  # Active project name
```

## Troubleshooting

### Backend won't start

**Error:** `Cannot find module`

- **Solution:** Run `cd backend && npm install`

**Error:** `Port 9100 already in use`

- **Solution:** Kill the existing process or change port in `backend/server.js`

### Frontend won't start

**Error:** `Cannot find module`

- **Solution:** Run `cd frontend && npm install`

**Error:** `Port 9000 already in use`

- **Solution:** Vite will automatically try port 5174

### WebSocket connection fails

**Symptom:** Real-time updates not working

- **Solution:** Ensure backend is running on port 9100
- Check browser console for WebSocket errors
- Verify CORS is enabled in `backend/server.js`

### Database errors

**Error:** `Database locked` or `SQLITE_BUSY`

- **Solution:** Stop all Raven instances and restart
- If persists: `rm .raven/db/*.db-wal .raven/db/*.db-shm`

### macOS-Specific Issues

**Error during `npm install`:** `gyp: No Xcode or CLT version detected!`

- **Solution:** Install Xcode Command Line Tools: `xcode-select --install`
- **Verify:** `xcode-select -p` should show `/Library/Developer/CommandLineTools`

**Error:** `node-gyp build failed`

- **Solution:**
  1. Update Xcode tools: `softwareupdate --all --install --force`
  2. Reset tools path: `sudo xcode-select --reset`
  3. Try install again: `npm install`

**Performance issue:** System metrics collection slow

- **Note:** This is normal on macOS. The `systeminformation` library is slightly slower on macOS compared to Linux due to system API differences. All functionality works correctly.

**Error:** `EMFILE: too many open files` when watching projects

- **Root cause:** macOS has a default soft limit of 256 file descriptors. Large projects with node_modules can exceed this.
- **Solution (Automatic):** Raven now automatically:
  1. Excludes itself (`raven` project) from auto-discovery to prevent watching its own `node_modules`
  2. Uses macOS FSEvents API (`useFsEvents: true`) for more efficient file watching
  3. Applies ignore patterns to skip `node_modules`, `.git`, and other large directories
- **Manual workaround (if needed):**

  ```bash
  # Increase file descriptor limit for current session
  ulimit -n 10240

  # Make permanent: Add to ~/.zshrc or ~/.bash_profile
  echo "ulimit -n 10240" >> ~/.zshrc
  ```

- **Verify fix:** Check backend logs for successful watcher initialization without EMFILE errors:
  ```bash
  tail -f /tmp/raven-backend.log | grep "File watcher ready"
  ```

## Development Commands

```bash
# Start everything
./start.sh

# Stop everything
./stop.sh

# Restart everything
./restart.sh

# Backend only (manual)
cd backend && npm start

# Frontend only (manual)
cd frontend && npm run dev

# Build frontend for production
cd frontend && npm run build

# View backend logs
tail -f /tmp/raven-backend.log

# View frontend logs
tail -f /tmp/raven-frontend.log
```

## Testing File Monitoring

1. **Start Raven:**

   ```bash
   ./start.sh
   ```

2. **Open the UI:**
   - Navigate to http://localhost:9000
   - Click on "Live Feed" tab

3. **Test file changes:**
   - Edit any file in your monitored project
   - Watch real-time updates appear immediately
   - Check snapshots in `.raven/snapshots/`

## Next Steps

- ✅ Installation complete
- ✅ Servers running
- 📖 Read [ARCHITECTURE.md](ARCHITECTURE.md) for system design
- 📖 Read [TELEMETRY_API.md](./api/TELEMETRY_API.md) for API docs
- 📖 Read [USER_EXPERIENCE.md](./api/USER_EXPERIENCE.md) for UI features
- 🚀 Start monitoring your AI coding sessions!

## System Requirements

### Minimum

- Node.js 20.19+
- 2GB RAM
- 500MB disk space

### Recommended

- Node.js 22+
- 4GB RAM
- 2GB disk space (for snapshots)
- Modern browser (Chrome, Firefox, Edge)

## Production Deployment

For production use:

1. **Build frontend:**

   ```bash
   cd frontend
   npm run build
   ```

2. **Serve via backend:**
   Backend automatically serves built frontend from `frontend/dist/`

3. **Run as service:**

   ```bash
   # Using systemd (Linux)
   sudo systemctl start raven
   ```

4. **Configure reverse proxy (optional):**
   - Use nginx or Apache to proxy port 9100
   - Enable HTTPS with Let's Encrypt

## Support

- Issues: https://github.com/seheart/raven/issues
- Discussions: https://github.com/seheart/raven/discussions
- Email: seheart@gmail.com
