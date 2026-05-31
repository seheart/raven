# Raven Database Schema Reference

**Version:** 0.6.1
**Database:** SQLite 3
**Driver:** better-sqlite3
**Location:** `.raven/db/raven.db`
**Status:** ✅ Production Ready

---

## 📋 Overview

Raven uses SQLite with Write-Ahead Logging (WAL) mode for optimal performance and concurrency. The database stores all file events, agent telemetry, system metrics, and process data.

### Quick Reference

- **Total Tables:** 4
- **Journal Mode:** WAL (Write-Ahead Logging)
- **Location:** `/home/seth/Projects/raven/.raven/db/raven.db`
- **Initialization:** Automatic on first run

---

## 🗄️ Database Configuration

### Connection Settings

```javascript
this.db = new Database(dbPath);
this.db.pragma('journal_mode = WAL'); // Better performance
```

**WAL Mode Benefits:**

- Concurrent readers don't block writers
- Faster write performance
- Better crash recovery
- Automatic checkpointing

---

## 📊 Table Schemas

### 1. events

**Purpose:** File system events (file changes, creations, deletions)

**Source:** `db.js:21-34`

```sql
CREATE TABLE IF NOT EXISTS events (
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
)
```

**Columns:**

| Column        | Type    | Nullable | Description                                           |
| ------------- | ------- | -------- | ----------------------------------------------------- |
| `id`          | INTEGER | NO       | Auto-incrementing primary key                         |
| `timestamp`   | TEXT    | NO       | ISO 8601 timestamp (e.g., "2025-10-19T12:34:56.789Z") |
| `filepath`    | TEXT    | YES      | Relative file path (e.g., "src/main.js")              |
| `change_type` | TEXT    | YES      | Change type: "created", "modified", "deleted"         |
| `diff`        | TEXT    | YES      | Unified diff output                                   |
| `cpu`         | REAL    | YES      | CPU usage at time of event (0-100)                    |
| `mem`         | REAL    | YES      | Memory usage at time of event (0-100)                 |
| `session_id`  | TEXT    | YES      | UUID of current session                               |
| `file_hash`   | TEXT    | YES      | SHA-256 hash of file content                          |
| `event_size`  | INTEGER | YES      | Size of diff/change in bytes                          |

**Example Row:**

```json
{
  "id": 123,
  "timestamp": "2025-10-19T12:34:56.789Z",
  "filepath": "src/main.js",
  "change_type": "modified",
  "diff": "Index: src/main.js\n===\n@@ -1,3 +1,4 @@\n // Code\n+console.log('New');",
  "cpu": 13.54,
  "mem": 20.44,
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "file_hash": "abc123def456...",
  "event_size": 1024
}
```

**Indexes:** None (small dataset, sequential access patterns)

**Typical Queries:**

```sql
-- Get recent events
SELECT * FROM events ORDER BY timestamp DESC LIMIT 100;

-- Get events for specific file
SELECT * FROM events WHERE filepath = 'src/main.js' ORDER BY timestamp ASC;

-- Get events in time range
SELECT * FROM events
WHERE timestamp BETWEEN '2025-10-19T00:00:00Z' AND '2025-10-19T23:59:59Z'
ORDER BY timestamp ASC;

-- Get events by session
SELECT * FROM events WHERE session_id = '550e8400-...' ORDER BY timestamp DESC;
```

---

### 2. agent_events

**Purpose:** Agent telemetry events (edits, executions, analyses)

**Source:** `db.js:37-51`

```sql
CREATE TABLE IF NOT EXISTS agent_events (
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
)
```

**Columns:**

| Column          | Type    | Nullable | Description                                               |
| --------------- | ------- | -------- | --------------------------------------------------------- |
| `id`            | INTEGER | NO       | Auto-incrementing primary key                             |
| `timestamp`     | TEXT    | NO       | ISO 8601 timestamp                                        |
| `agent`         | TEXT    | NO       | Agent identifier (e.g., "claude", "ollama", "lmstudio")   |
| `event_type`    | TEXT    | NO       | Event type (e.g., "edit", "create", "execute", "analyze") |
| `file`          | TEXT    | YES      | File affected by event                                    |
| `lines_changed` | INTEGER | YES      | Number of lines modified                                  |
| `duration_ms`   | INTEGER | YES      | Operation duration in milliseconds                        |
| `message`       | TEXT    | NO       | Human-readable description                                |
| `metadata`      | TEXT    | YES      | JSON string with additional data                          |
| `session_id`    | TEXT    | YES      | UUID of current session                                   |

**Example Row:**

```json
{
  "id": 456,
  "timestamp": "2025-10-19T12:34:56.789Z",
  "agent": "claude",
  "event_type": "edit",
  "file": "src/auth.js",
  "lines_changed": 42,
  "duration_ms": 3480,
  "message": "Refactored authentication module",
  "metadata": "{\"model\": \"claude-sonnet-4-5\", \"tokens\": 1500}",
  "session_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Indexes:** None (small dataset)

**Typical Queries:**

```sql
-- Get recent agent events
SELECT * FROM agent_events ORDER BY timestamp DESC LIMIT 100;

-- Get events by agent
SELECT * FROM agent_events WHERE agent = 'claude' ORDER BY timestamp DESC;

-- Get agent statistics
SELECT
  agent,
  COUNT(*) as event_count,
  SUM(lines_changed) as total_lines_changed,
  AVG(duration_ms) as avg_duration,
  SUM(duration_ms) as total_duration
FROM agent_events
GROUP BY agent;

-- Get events for specific file
SELECT * FROM agent_events WHERE file = 'src/auth.js' ORDER BY timestamp ASC;

-- Get largest edits
SELECT * FROM agent_events
WHERE lines_changed IS NOT NULL
ORDER BY lines_changed DESC
LIMIT 10;
```

---

### 3. raven_metrics

**Purpose:** System metrics (CPU, memory, disk, network)

**Source:** `db.js:54-67`

```sql
CREATE TABLE IF NOT EXISTS raven_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  cpu_percent REAL,
  memory_percent REAL,
  disk_usage_percent REAL,
  network_rx_mbps REAL,
  network_tx_mbps REAL,
  session_id TEXT
)
```

**Columns:**

| Column               | Type    | Nullable | Description                     |
| -------------------- | ------- | -------- | ------------------------------- |
| `id`                 | INTEGER | NO       | Auto-incrementing primary key   |
| `timestamp`          | TEXT    | NO       | ISO 8601 timestamp              |
| `cpu_percent`        | REAL    | YES      | CPU usage percentage (0-100)    |
| `memory_percent`     | REAL    | YES      | Memory usage percentage (0-100) |
| `disk_usage_percent` | REAL    | YES      | Disk usage percentage (0-100)   |
| `network_rx_mbps`    | REAL    | YES      | Network receive speed in Mbps   |
| `network_tx_mbps`    | REAL    | YES      | Network transmit speed in Mbps  |
| `session_id`         | TEXT    | YES      | UUID of current session         |

**Example Row:**

```json
{
  "id": 789,
  "timestamp": "2025-10-19T12:34:56.789Z",
  "cpu_percent": 13.54,
  "memory_percent": 20.44,
  "disk_usage_percent": 45.2,
  "network_rx_mbps": 1.5,
  "network_tx_mbps": 0.8,
  "session_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Collection Frequency:** Every 1 second

**Typical Row Count:** ~86,400 rows per day (1/second × 86,400 seconds)

**Indexes:** None (time-series data, sequential access)

**Typical Queries:**

```sql
-- Get recent metrics
SELECT * FROM raven_metrics ORDER BY timestamp DESC LIMIT 100;

-- Get metrics statistics
SELECT
  AVG(cpu_percent) as avg_cpu,
  AVG(memory_percent) as avg_memory,
  MAX(cpu_percent) as max_cpu,
  MAX(memory_percent) as max_memory,
  COUNT(*) as sample_count
FROM raven_metrics;

-- Get metrics in time range
SELECT * FROM raven_metrics
WHERE timestamp BETWEEN '2025-10-19T12:00:00Z' AND '2025-10-19T13:00:00Z'
ORDER BY timestamp ASC;

-- Get high CPU periods
SELECT * FROM raven_metrics
WHERE cpu_percent > 80
ORDER BY timestamp DESC;
```

---

### 4. process_metrics

**Purpose:** Process-level metrics (per-agent CPU/memory tracking)

**Source:** `db.js:70-82`

```sql
CREATE TABLE IF NOT EXISTS process_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  process_name TEXT NOT NULL,
  pid INTEGER,
  cpu_percent REAL,
  memory_mb REAL,
  session_id TEXT
)
```

**Columns:**

| Column         | Type    | Nullable | Description                                   |
| -------------- | ------- | -------- | --------------------------------------------- |
| `id`           | INTEGER | NO       | Auto-incrementing primary key                 |
| `timestamp`    | TEXT    | NO       | ISO 8601 timestamp                            |
| `process_name` | TEXT    | NO       | Process/agent name (e.g., "ollama", "claude") |
| `pid`          | INTEGER | YES      | Process ID                                    |
| `cpu_percent`  | REAL    | YES      | Process CPU usage percentage (0-100)          |
| `memory_mb`    | REAL    | YES      | Process memory usage in megabytes             |
| `session_id`   | TEXT    | YES      | UUID of current session                       |

**Example Row:**

```json
{
  "id": 1011,
  "timestamp": "2025-10-19T12:34:56.789Z",
  "process_name": "ollama",
  "pid": 12345,
  "cpu_percent": 5.2,
  "memory_mb": 256.4,
  "session_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Indexes:** None (small dataset)

**Typical Queries:**

```sql
-- Get recent process metrics
SELECT * FROM process_metrics ORDER BY timestamp DESC LIMIT 100;

-- Get metrics for specific process
SELECT * FROM process_metrics
WHERE process_name = 'ollama'
ORDER BY timestamp DESC LIMIT 100;

-- Get average resource usage per process
SELECT
  process_name,
  AVG(cpu_percent) as avg_cpu,
  AVG(memory_mb) as avg_memory,
  MAX(cpu_percent) as max_cpu,
  MAX(memory_mb) as max_memory
FROM process_metrics
GROUP BY process_name;

-- Find high resource consumers
SELECT process_name, cpu_percent, memory_mb, timestamp
FROM process_metrics
WHERE cpu_percent > 50 OR memory_mb > 1000
ORDER BY timestamp DESC;
```

---

## 🔧 Database Methods (RavenDB Class)

### Insert Methods

```javascript
// Insert file event
insertEvent(timestamp, filepath, changeType, diff, cpu, mem, sessionId, fileHash, eventSize);

// Insert agent event
insertAgentEvent(
  timestamp,
  agent,
  eventType,
  file,
  linesChanged,
  durationMs,
  message,
  metadata,
  sessionId
);

// Insert system metrics
insertMetrics(
  timestamp,
  cpuPercent,
  memoryPercent,
  diskUsagePercent,
  networkRxMbps,
  networkTxMbps,
  sessionId
);

// Insert process metrics
insertProcessMetrics(timestamp, processName, pid, cpuPercent, memoryMb, sessionId);
```

### Query Methods

```javascript
// Get recent events (default: 100)
getRecentEvents((limit = 100));

// Get recent agent events (default: 100)
getRecentAgentEvents((limit = 100));

// Get events by agent
getEventsByAgent(agent, (limit = 100));

// Get agent statistics
getAgentStats();

// Get recent metrics (default: 100)
getRecentMetrics((limit = 100));

// Get metrics statistics
getMetricsStats();

// Get process metrics by name
getProcessMetrics(processName, (limit = 100));

// Get events by session
getEventsBySession(sessionId);

// Get top modified files
getTopModifiedFiles((limit = 10));

// Get longest edits
getLongestEdits((limit = 10));

// Get tracked files
getTrackedFiles();

// Get dashboard statistics
getDashboardStats();
```

### Maintenance Methods

```javascript
// Delete old records
deleteOldRecords(days);

// Get database size
getDatabaseSize();

// Vacuum database
vacuum();

// Close database connection
close();
```

---

## 📈 Data Retention & Cleanup

### Automatic Cleanup

**API Endpoint:** `POST /api/database/clear-old/:days`

**Example:**

```javascript
// Delete records older than 30 days
fetch('http://localhost:9100/api/database/clear-old/30', {
  method: 'POST'
});
```

### Manual Cleanup

```sql
-- Delete old events (older than 30 days)
DELETE FROM events
WHERE timestamp < datetime('now', '-30 days');

-- Delete old agent events
DELETE FROM agent_events
WHERE timestamp < datetime('now', '-30 days');

-- Delete old metrics (older than 7 days to save space)
DELETE FROM raven_metrics
WHERE timestamp < datetime('now', '-7 days');

-- Delete old process metrics
DELETE FROM process_metrics
WHERE timestamp < datetime('now', '-7 days');

-- Vacuum to reclaim space
VACUUM;
```

---

## 💾 Database Maintenance

### Backup

```bash
# Backup database
cp .raven/db/raven.db .raven/db/raven.db.backup

# Or use SQLite backup command
sqlite3 .raven/db/raven.db ".backup '.raven/db/raven.db.backup'"
```

### Restore

```bash
# Restore from backup
cp .raven/db/raven.db.backup .raven/db/raven.db
```

### Check Integrity

```bash
sqlite3 .raven/db/raven.db "PRAGMA integrity_check;"
```

### Vacuum (Reclaim Space)

```bash
sqlite3 .raven/db/raven.db "VACUUM;"
```

### Analyze (Update Statistics)

```bash
sqlite3 .raven/db/raven.db "ANALYZE;"
```

---

## 📊 Example Queries

### Dashboard Statistics

```sql
-- Total events
SELECT COUNT(*) as total_events FROM events;

-- Total files tracked
SELECT COUNT(DISTINCT filepath) as total_files FROM events;

-- Total agents
SELECT COUNT(DISTINCT agent) as total_agents FROM agent_events;

-- Session duration
SELECT
  MIN(timestamp) as session_start,
  MAX(timestamp) as session_end,
  (julianday(MAX(timestamp)) - julianday(MIN(timestamp))) * 86400 as duration_seconds
FROM events;
```

### Performance Correlations

```sql
-- Events per hour with average CPU
SELECT
  strftime('%Y-%m-%d %H:00:00', timestamp) as hour,
  COUNT(*) as event_count,
  AVG(cpu) as avg_cpu
FROM events
GROUP BY hour
ORDER BY hour DESC;

-- Agent activity correlation with system load
SELECT
  a.agent,
  COUNT(*) as event_count,
  AVG(m.cpu_percent) as avg_cpu_during_activity
FROM agent_events a
LEFT JOIN raven_metrics m ON
  datetime(a.timestamp) BETWEEN datetime(m.timestamp, '-30 seconds') AND datetime(m.timestamp, '+30 seconds')
GROUP BY a.agent;
```

---

## 🔍 Database Explorer

### Direct SQL Access

```bash
# Open SQLite CLI
sqlite3 .raven/db/raven.db

# Common commands
.tables              # List all tables
.schema events       # Show table schema
.headers on          # Show column headers
.mode column         # Format output as columns

# Example query
SELECT * FROM events ORDER BY timestamp DESC LIMIT 10;
```

---

## 📚 Related Documentation

- [REST API](REST_API.md) - REST API endpoints that query this database
- [WebSocket API](WEBSOCKET_API.md) - Real-time events stored in database
- [Telemetry API](TELEMETRY_API.md) - Populates `agent_events` table
- [Setup Guide](../SETUP.md) - Database initialization

---

**Last Updated:** 2025-10-19
**Database Version:** SQLite 3
**Status:** ✅ Production Ready
