# Raven REST API Reference

**Version:** 0.6.1
**Base URL:** `http://localhost:3030`
**Status:** ✅ Production Ready

---

## 📋 Overview

Raven provides a comprehensive REST API for accessing all monitoring data, agent telemetry, system metrics, and configuration. All endpoints return JSON responses.

### Quick Reference

- **Total Endpoints:** 37
- **Authentication:** None (local-only)
- **Rate Limiting:** None
- **CORS:** Enabled for `http://localhost:5173`

---

## 🏥 Health & Status

### GET /health

**Purpose:** Health check endpoint

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-10-19T12:34:56Z",
  "uptime": 3600,
  "database": "connected",
  "watcher": "active"
}
```

### GET /api/session-id

**Purpose:** Get current session ID

**Response:**
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

## 📊 Dashboard & Statistics

### GET /api/dashboard-stats

**Purpose:** Get dashboard statistics

**Response:**
```json
{
  "total_events": 1234,
  "total_files": 56,
  "total_agents": 3,
  "session_duration_seconds": 3600,
  "active_files_today": 12
}
```

### GET /api/top-modified-files

**Purpose:** Get most frequently modified files

**Query Parameters:**
- `limit` (optional, default: 10) - Number of files to return

**Example:** `GET /api/top-modified-files?limit=20`

**Response:**
```json
[
  {
    "filepath": "src/main.js",
    "edit_count": 42,
    "total_lines_changed": 350,
    "last_modified": "2025-10-19T12:30:00Z"
  }
]
```

### GET /api/longest-edits

**Purpose:** Get largest edits by line count

**Query Parameters:**
- `limit` (optional, default: 10) - Number of edits to return

**Example:** `GET /api/longest-edits?limit=20`

**Response:**
```json
[
  {
    "filepath": "src/components/Dashboard.svelte",
    "lines_changed": 650,
    "timestamp": "2025-10-19T12:00:00Z",
    "agent": "claude"
  }
]
```

---

## 🤖 Agent Telemetry

### POST /telemetry

**Purpose:** Receive agent telemetry events

**Request Body:**
```json
{
  "agent": "claude",
  "event": "edit",
  "message": "Refactored authentication module",
  "file": "src/auth.js",
  "lines_changed": 42,
  "duration_ms": 3480,
  "metadata": {
    "custom_field": "value"
  }
}
```

**Response:**
```json
{
  "success": true,
  "event_id": 123
}
```

### GET /api/agents-status

**Purpose:** Get status of all detected agents

**Response:**
```json
[
  {
    "agent_name": "claude",
    "agent_type": "claude",
    "is_running": true,
    "last_seen": "2025-10-19T12:34:56Z",
    "models_available": [],
    "requests_handled": 42,
    "errors": 0,
    "color": "#FF6B35"
  }
]
```

### GET /api/agent-events

**Purpose:** Get agent telemetry events

**Query Parameters:**
- `limit` (optional, default: 100) - Number of events to return

**Example:** `GET /api/agent-events?limit=50`

**Response:**
```json
[
  {
    "id": 123,
    "timestamp": "2025-10-19T12:34:56Z",
    "agent": "claude",
    "event_type": "edit",
    "file": "src/main.js",
    "lines_changed": 42,
    "duration_ms": 3480,
    "message": "Refactored authentication",
    "metadata": null,
    "session_id": "550e8400-..."
  }
]
```

### GET /api/events-by-agent/:agent

**Purpose:** Get events for a specific agent

**Parameters:**
- `agent` (required) - Agent name (e.g., "claude", "ollama")

**Query Parameters:**
- `limit` (optional, default: 100)

**Example:** `GET /api/events-by-agent/claude?limit=50`

**Response:** Same as `/api/agent-events`

### GET /api/agent-stats

**Purpose:** Get agent statistics

**Response:**
```json
[
  {
    "agent": "claude",
    "event_count": 150,
    "total_lines_changed": 4500,
    "avg_duration_ms": 2340,
    "total_duration_ms": 351000
  }
]
```

---

## 📈 System Metrics

### GET /api/system-metrics

**Purpose:** Get recent system metrics

**Query Parameters:**
- `limit` (optional, default: 100) - Number of metrics samples

**Example:** `GET /api/system-metrics?limit=200`

**Response:**
```json
[
  {
    "id": 1234,
    "timestamp": "2025-10-19T12:34:56Z",
    "cpu_percent": 13.54,
    "memory_percent": 20.44,
    "disk_usage_percent": 45.2,
    "network_rx_mbps": 1.5,
    "network_tx_mbps": 0.8,
    "session_id": "550e8400-..."
  }
]
```

### GET /api/process-metrics/:agent

**Purpose:** Get process metrics for specific agent

**Parameters:**
- `agent` (required) - Agent name

**Query Parameters:**
- `limit` (optional, default: 100)

**Example:** `GET /api/process-metrics/claude?limit=50`

**Response:**
```json
[
  {
    "id": 123,
    "timestamp": "2025-10-19T12:34:56Z",
    "process_name": "claude",
    "pid": 12345,
    "cpu_percent": 5.2,
    "memory_mb": 256.4,
    "session_id": "550e8400-..."
  }
]
```

### GET /api/metrics-stats

**Purpose:** Get aggregated metrics statistics

**Response:**
```json
{
  "avg_cpu": 12.5,
  "avg_memory": 18.3,
  "max_cpu": 45.2,
  "max_memory": 35.6,
  "sample_count": 3600
}
```

### GET /api/performance-correlations

**Purpose:** Get performance correlations between metrics and events

**Response:**
```json
{
  "cpu_vs_events": 0.67,
  "memory_vs_events": 0.42,
  "events_per_hour": 120
}
```

---

## 📁 File Monitoring

### GET /api/tracked-files

**Purpose:** Get list of all tracked files

**Response:**
```json
[
  {
    "filepath": "src/main.js",
    "first_seen": "2025-10-19T10:00:00Z",
    "last_modified": "2025-10-19T12:30:00Z",
    "change_count": 15
  }
]
```

### GET /api/file-events

**Purpose:** Get file change events

**Query Parameters:**
- `limit` (optional, default: 100) - Number of events
- `diff` (optional, boolean) - Include diff content

**Example:** `GET /api/file-events?limit=50&diff=true`

**Response:**
```json
[
  {
    "id": 456,
    "timestamp": "2025-10-19T12:34:56Z",
    "filepath": "src/main.js",
    "change_type": "modified",
    "diff": "Index: src/main.js\n===\n@@ -1,3 +1,4 @@\n // Code\n+console.log('New line');",
    "cpu": 13.5,
    "mem": 20.4,
    "session_id": "550e8400-...",
    "file_hash": "abc123...",
    "event_size": 1024
  }
]
```

### GET /api/events-by-session/:sessionId

**Purpose:** Get all events for a specific session

**Parameters:**
- `sessionId` (required) - Session UUID

**Example:** `GET /api/events-by-session/550e8400-e29b-41d4-a716-446655440000`

**Response:** Same as `/api/file-events`

### GET /api/activity-log

**Purpose:** Get combined activity log (files + agents)

**Query Parameters:**
- `limit` (optional, default: 100)

**Example:** `GET /api/activity-log?limit=50`

**Response:**
```json
[
  {
    "timestamp": "2025-10-19T12:34:56Z",
    "type": "file",
    "filepath": "src/main.js",
    "change_type": "modified"
  },
  {
    "timestamp": "2025-10-19T12:34:50Z",
    "type": "agent",
    "agent": "claude",
    "event_type": "edit",
    "message": "Updated function"
  }
]
```

### GET /api/snapshots/:filepath

**Purpose:** Get all snapshots for a file

**Parameters:**
- `filepath` (required) - File path (URL encoded)

**Example:** `GET /api/snapshots/src%2Fmain.js`

**Response:**
```json
[
  {
    "id": 1,
    "timestamp": "2025-10-19T12:00:00Z",
    "content": "// File content at this time",
    "hash": "abc123..."
  }
]
```

### POST /api/restore

**Purpose:** Restore file to a specific snapshot

**Request Body:**
```json
{
  "filepath": "src/main.js",
  "snapshot_id": 123
}
```

**Response:**
```json
{
  "success": true,
  "message": "File restored to snapshot 123"
}
```

---

## ⚡ Triggers & Alerts

### GET /api/triggers-config

**Purpose:** Get trigger configuration

**Response:**
```json
{
  "triggers": [
    {
      "name": "high_cpu",
      "condition": "cpu > 80",
      "action": "log",
      "message": "High CPU usage: {cpu}%",
      "cooldown_seconds": 60
    }
  ]
}
```

### GET /api/triggered-events

**Purpose:** Get triggered alert events

**Query Parameters:**
- `limit` (optional, default: 100)

**Example:** `GET /api/triggered-events?limit=50`

**Response:**
```json
[
  {
    "id": 123,
    "timestamp": "2025-10-19T12:34:56Z",
    "trigger_name": "high_cpu",
    "message": "High CPU usage: 85.2%",
    "metadata": {
      "cpu": 85.2
    }
  }
]
```

### GET /api/trigger-stats

**Purpose:** Get trigger statistics

**Response:**
```json
{
  "total_triggers": 5,
  "total_fired": 23,
  "triggers": [
    {
      "name": "high_cpu",
      "fired_count": 15,
      "last_fired": "2025-10-19T12:30:00Z"
    }
  ]
}
```

### POST /api/triggers-reload

**Purpose:** Reload trigger configuration from file

**Response:**
```json
{
  "success": true,
  "triggers_loaded": 5
}
```

### POST /api/triggers-clear-cooldowns

**Purpose:** Clear all trigger cooldowns

**Response:**
```json
{
  "success": true,
  "message": "All trigger cooldowns cleared"
}
```

---

## 🎛️ Control & Maintenance

### POST /api/control/clear-cache

**Purpose:** Clear file content cache

**Response:**
```json
{
  "success": true,
  "cleared_entries": 150
}
```

### POST /api/database/clear-old/:days

**Purpose:** Clear database records older than N days

**Parameters:**
- `days` (required) - Number of days (e.g., 7, 30)

**Example:** `POST /api/database/clear-old/30`

**Response:**
```json
{
  "success": true,
  "deleted_events": 500,
  "deleted_metrics": 86400,
  "deleted_agent_events": 250
}
```

### POST /api/control/restart-watcher

**Purpose:** Restart file watcher

**Response:**
```json
{
  "success": true,
  "message": "File watcher restarted"
}
```

### GET /api/control/export-health

**Purpose:** Export health metrics as JSON

**Response:**
```json
{
  "timestamp": "2025-10-19T12:34:56Z",
  "uptime_seconds": 3600,
  "database": {
    "size_mb": 12.5,
    "events_count": 1234,
    "metrics_count": 86400
  },
  "watcher": {
    "status": "active",
    "watched_paths": 1,
    "tracked_files": 56
  },
  "performance": {
    "total_requests": 5000,
    "successful_requests": 4950,
    "failed_requests": 50,
    "avg_response_time_ms": 15.3
  }
}
```

---

## 📂 Projects

### GET /api/projects/list

**Purpose:** Get list of all discovered projects

**Response:**
```json
{
  "projects": [
    {
      "name": "raven",
      "path": "raven",
      "description": "Raven monitoring project",
      "active": true
    },
    {
      "name": "ant312",
      "path": "ant312",
      "description": "Auto-discovered project",
      "active": false
    }
  ],
  "active_project": "raven"
}
```

### POST /api/projects/refresh

**Purpose:** Refresh project list (re-scan directory)

**Response:**
```json
{
  "success": true,
  "projects_found": 10,
  "new_projects": 2
}
```

### POST /api/projects/select

**Purpose:** Switch active project

**Request Body:**
```json
{
  "project_name": "ant312"
}
```

**Response:**
```json
{
  "success": true,
  "active_project": "ant312",
  "watch_path": "/home/seth/Projects/ant312"
}
```

---

## 🔧 Git Integration

### GET /api/git/status

**Purpose:** Get Git status for active project

**Response:**
```json
{
  "branch": "main",
  "ahead": 2,
  "behind": 0,
  "staged": 3,
  "modified": 5,
  "untracked": 2,
  "clean": false,
  "files": [
    {
      "path": "src/main.js",
      "status": "modified",
      "staged": false
    }
  ]
}
```

### GET /api/git/branches

**Purpose:** Get list of Git branches

**Response:**
```json
{
  "current": "main",
  "branches": [
    {
      "name": "main",
      "current": true,
      "commit": "abc1234",
      "message": "Latest commit"
    },
    {
      "name": "feature/new-ui",
      "current": false,
      "commit": "def5678",
      "message": "UI improvements"
    }
  ]
}
```

### GET /api/git/history

**Purpose:** Get Git commit history

**Query Parameters:**
- `limit` (optional, default: 50) - Number of commits

**Example:** `GET /api/git/history?limit=100`

**Response:**
```json
[
  {
    "hash": "abc1234",
    "author": "Seth Eheart",
    "email": "seth@example.com",
    "date": "2025-10-19T12:00:00Z",
    "message": "Add new feature",
    "files_changed": 5
  }
]
```

### GET /api/git/diff/:filepath

**Purpose:** Get Git diff for specific file

**Parameters:**
- `filepath` (required) - File path (URL encoded, can include slashes using `*` route)

**Example:** `GET /api/git/diff/src/main.js`

**Response:**
```json
{
  "filepath": "src/main.js",
  "diff": "diff --git a/src/main.js b/src/main.js\nindex abc1234..def5678 100644\n--- a/src/main.js\n+++ b/src/main.js\n@@ -1,3 +1,4 @@\n // Code\n+console.log('New');"
}
```

### GET /api/git/diff

**Purpose:** Get Git diff for entire working tree

**Response:**
```json
{
  "diff": "diff --git a/src/main.js...\n...",
  "files_changed": 3,
  "insertions": 42,
  "deletions": 15
}
```

---

## 🔄 Error Handling

All endpoints return standard HTTP status codes:

### Success Codes
- `200 OK` - Request successful
- `201 Created` - Resource created

### Error Codes
- `400 Bad Request` - Invalid request parameters
- `404 Not Found` - Resource not found
- `500 Internal Server Error` - Server error

### Error Response Format
```json
{
  "error": true,
  "message": "Error description",
  "details": "Additional error details"
}
```

---

## 📝 Examples

### Complete Example: Fetch Dashboard Data

```javascript
const API_BASE = 'http://localhost:3030/api';

async function fetchDashboard() {
  try {
    // Get stats
    const statsRes = await fetch(`${API_BASE}/dashboard-stats`);
    const stats = await statsRes.json();

    // Get top files
    const filesRes = await fetch(`${API_BASE}/top-modified-files?limit=10`);
    const files = await filesRes.json();

    // Get agents
    const agentsRes = await fetch(`${API_BASE}/agents-status`);
    const agents = await agentsRes.json();

    return { stats, files, agents };
  } catch (error) {
    console.error('Failed to fetch dashboard data:', error);
  }
}
```

### Complete Example: Send Telemetry

```javascript
async function sendTelemetry(agent, eventType, message, options = {}) {
  const event = {
    agent,
    event: eventType,
    message,
    ...options
  };

  const response = await fetch('http://localhost:3030/telemetry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event)
  });

  return response.json();
}

// Usage
await sendTelemetry('claude', 'edit', 'Refactored auth module', {
  file: 'src/auth.js',
  lines_changed: 42,
  duration_ms: 3480
});
```

---

## 📚 Related Documentation

- [WebSocket API](WEBSOCKET_API.md) - Real-time WebSocket events
- [Telemetry API](TELEMETRY_API.md) - Detailed telemetry guide
- [Database Schema](DATABASE_SCHEMA.md) - Database structure
- [Setup Guide](../SETUP.md) - Installation instructions

---

**Last Updated:** 2025-10-19
**API Version:** 0.6.1
**Status:** ✅ Production Ready
