# Raven Backend Restart Guide

## Quick Start

To restart the backend cleanly and avoid port conflicts:

```bash
cd /home/seth/Projects/raven/backend
./restart.sh
```

That's it! The script handles everything automatically.

## What It Does

The `restart.sh` script prevents the common issues you've been experiencing:

1. **Kills old backend processes** - Prevents port conflicts
2. **Waits for ports to be freed** - Ensures clean startup
3. **Rebuilds TypeScript** - Ensures latest code is running
4. **Starts backend with proper config** - High rate limits, correct CORS
5. **Verifies startup** - Confirms backend is actually running

## Configuration

You can customize the restart by setting environment variables:

```bash
# Change port (default: 9100)
PORT=9200 ./restart.sh

# Change CORS origin (default: http://localhost:9000)
CORS_ORIGIN=http://localhost:5000 ./restart.sh

# Change rate limits
API_RATE_LIMIT_MAX=50000 ./restart.sh
```

## Manual Operations

### View logs in real-time

```bash
tail -f /tmp/raven-backend.log
```

### Stop the backend

```bash
pkill -f 'node dist/server.js'
```

### Check if backend is running

```bash
ss -tln | grep :9100
```

### Check for backend processes

```bash
ps aux | grep "node dist/server.js" | grep -v grep
```

## Common Issues - SOLVED

### ✅ Port Already in Use

**Old Problem:** Backend fails with "EADDRINUSE" error
**Solution:** The restart script automatically kills old processes first

### ✅ Database Schema Errors

**Old Problem:** "table pattern_warnings has no column named pattern_id"
**Solution:** Added missing `pattern_id` column to database (already fixed)

### ✅ .raven Directory Being Watched

**Old Problem:** Backend processing `.raven` files causing OOM
**Solution:** File watcher now uses function-based ignore patterns (already fixed in modules/watcher.ts:82-126)

## Architecture

- **Frontend (Vite)**: Port 9000
- **Backend API**: Port 9100
- **Vite Proxy**: `/api` and `/socket.io` → `http://localhost:9100`

Frontend makes requests to `http://localhost:9000/api/*` which Vite proxies to the backend.

## Root Causes (Now Fixed)

1. **Port Conflicts** - Multiple backend instances weren't getting killed
2. **Database Schema** - Missing `pattern_id` column in `pattern_warnings` table
3. **File Watcher** - Glob patterns not working, switched to function-based filtering

All these issues are now permanently fixed!
