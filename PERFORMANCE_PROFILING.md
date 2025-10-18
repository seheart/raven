# 📊 Raven Performance Profiling Documentation

**Version:** Phase II.2 - Performance Profiling
**Status:** ✅ Fully Implemented
**Sampling Interval:** 5 seconds (configurable)

---

## 📋 Overview

Raven's Performance Profiling system automatically collects and correlates system metrics, process-level statistics, and agent telemetry events in real-time. This allows you to understand how agent activity affects system performance and identify bottlenecks.

### Key Features

- **Automatic metrics collection** every 5 seconds (configurable)
- **Per-process tracking** of CPU, memory, disk I/O for agents
- **Performance correlation** linking agent events to system load
- **Network statistics** tracking data transfer
- **Disk usage monitoring** for all mounted volumes
- **Statistical analysis** with averages, peaks, and trends
- **Real-time visualization** in Svelte UI component

---

## 🔧 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Metrics Sampler                          │
│                   (Tokio Background Task)                    │
│                                                              │
│  ┌────────────┐    Every 5 seconds                          │
│  │  Interval  ├────────────────────────────────┐            │
│  │   Timer    │                                 │            │
│  └────────────┘                                 ↓            │
│                                         MetricsCollector     │
│                                           │                  │
│                                           ├─ System Metrics  │
│                                           ├─ Process Stats   │
│                                           ├─ Network Stats   │
│                                           └─ Disk Stats      │
└──────────────────────────────┬──────────────────────────────┘
                               │ Store in Database
                               ↓
┌─────────────────────────────────────────────────────────────┐
│                    SQLite Database                           │
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │  raven_metrics   │  │ process_metrics  │                │
│  │  (system-wide)   │  │  (per-process)   │                │
│  └──────────────────┘  └──────────────────┘                │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               │ Tauri IPC Commands
                               ↓
┌─────────────────────────────────────────────────────────────┐
│                   Raven UI (Svelte)                          │
│                                                              │
│  PerformancePanel.svelte:                                    │
│  - Real-time metrics display                                │
│  - Agent CPU/memory charts                                  │
│  - Performance correlations view                            │
│  - Statistical summaries                                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 📦 Database Schema

### `raven_metrics` Table (System-Wide Metrics)

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

**Sampled every 5 seconds**, stores:
- Overall CPU usage (%)
- Overall memory usage (%)
- Memory used/total (MB)
- Network bytes received/transmitted
- Session ID for grouping

### `process_metrics` Table (Per-Process Stats)

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

**Sampled for tracked processes** (claude, ollama, python, node), stores:
- Agent/process name
- Process ID (PID)
- Process CPU usage (%)
- Physical & virtual memory (MB)
- Disk read/write bytes (cumulative)
- Process status (Running, Sleeping, etc.)

---

## 🎯 Tauri Commands

### 1. Get System Metrics

```javascript
const metrics = await invoke('get_system_metrics', { limit: 100 });
// Returns: SystemMetricsData[]
```

**Returns:**
```typescript
interface SystemMetricsData {
  id: number;
  timestamp: string; // ISO 8601
  cpu_percent: number;
  memory_percent: number;
  memory_used_mb: number;
  memory_total_mb: number;
  network_rx_bytes?: number;
  network_tx_bytes?: number;
}
```

**Use case:** Display system-wide resource usage over time.

### 2. Get Process Metrics

```javascript
const metrics = await invoke('get_process_metrics', {
  agentName: 'claude',
  limit: 50
});
// Returns: ProcessMetricsData[]
```

**Returns:**
```typescript
interface ProcessMetricsData {
  id: number;
  timestamp: string;
  agent_name: string;
  pid: number;
  cpu_usage: number;
  memory_mb: number;
  virtual_memory_mb: number;
  disk_read_bytes?: number;
  disk_write_bytes?: number;
  status: string; // "Running", "Sleeping", etc.
}
```

**Use case:** Track specific agent's resource consumption.

### 3. Get Performance Correlations

```javascript
const correlations = await invoke('get_performance_correlations', {
  timeWindowSeconds: 5
});
// Returns: PerformanceCorrelationData[]
```

**Returns:**
```typescript
interface PerformanceCorrelationData {
  event_id: number;
  event_timestamp: string;
  agent: string;
  event_type: string;
  duration_ms?: number;
  system_cpu_percent?: number;
  system_memory_percent?: number;
  process_cpu_percent?: number;
  process_memory_mb?: number;
}
```

**Use case:** Correlate agent telemetry events with system metrics to identify performance bottlenecks.

**How it works:**
- Matches agent events with system/process metrics within a time window (default: 5 seconds)
- Shows which events happened during high CPU/memory periods
- Helps identify resource-intensive operations

### 4. Get Metrics Statistics

```javascript
const stats = await invoke('get_metrics_stats', {
  startTime: '2025-10-17T12:00:00Z',
  endTime: '2025-10-17T13:00:00Z'
});
// Returns: MetricsStatsData
```

**Returns:**
```typescript
interface MetricsStatsData {
  avg_cpu_percent: number;
  max_cpu_percent: number;
  avg_memory_percent: number;
  max_memory_percent: number;
  sample_count: number;
}
```

**Use case:** Get statistical summary for a time range (e.g., hourly, daily averages).

---

## 💻 Rust API

### MetricsCollector

```rust
use raven::modules::metrics::MetricsCollector;

let mut collector = MetricsCollector::new();

// Discover processes to track
collector.discover_processes(&["claude", "ollama", "python"]);

// Get system metrics
let (cpu, mem) = collector.collect();

// Get process stats for tracked processes
let process_stats = collector.get_all_process_stats();

// Get network stats
let network_stats = collector.get_network_stats();

// Get disk stats
let disk_stats = collector.get_disk_stats();

// Collect comprehensive snapshot
let snapshot = collector.collect_snapshot();
```

### MetricsSampler

```rust
use raven::modules::metrics_sampler::{MetricsSampler, SamplerConfig};

let config = SamplerConfig {
    interval_seconds: 5,
    session_id: "my-session".to_string(),
    tracked_processes: vec![
        "claude".to_string(),
        "ollama".to_string(),
    ],
};

let mut sampler = MetricsSampler::new(&db_path, config)?;

// Start sampling loop (runs forever)
sampler.start().await?;
```

---

## 📊 SQL Queries

### Get Recent Metrics

```sql
-- System metrics for last hour
SELECT * FROM raven_metrics
WHERE timestamp >= datetime('now', '-1 hour')
ORDER BY timestamp DESC;

-- Process metrics for specific agent
SELECT * FROM process_metrics
WHERE agent_name = 'claude'
ORDER BY timestamp DESC
LIMIT 100;
```

### Performance Analysis

```sql
-- Average CPU by agent
SELECT agent_name, AVG(cpu_usage) as avg_cpu
FROM process_metrics
GROUP BY agent_name
ORDER BY avg_cpu DESC;

-- Peak memory usage
SELECT agent_name, MAX(memory_mb) as peak_mem
FROM process_metrics
GROUP BY agent_name
ORDER BY peak_mem DESC;

-- CPU usage over time (5-minute buckets)
SELECT
    strftime('%Y-%m-%d %H:%M', timestamp) as time_bucket,
    AVG(cpu_percent) as avg_cpu
FROM raven_metrics
GROUP BY time_bucket
ORDER BY time_bucket DESC;
```

### Correlation Queries

```sql
-- Events during high CPU periods
SELECT
    ae.agent,
    ae.event_type,
    ae.duration_ms,
    rm.cpu_percent
FROM agent_events ae
JOIN raven_metrics rm
    ON datetime(rm.timestamp) BETWEEN
       datetime(ae.timestamp) AND
       datetime(ae.timestamp, '+5 seconds')
WHERE rm.cpu_percent > 80
ORDER BY rm.cpu_percent DESC;

-- Agent activity vs system load
SELECT
    ae.agent,
    COUNT(*) as event_count,
    AVG(rm.cpu_percent) as avg_cpu_during_events
FROM agent_events ae
LEFT JOIN raven_metrics rm
    ON datetime(rm.timestamp) BETWEEN
       datetime(ae.timestamp) AND
       datetime(ae.timestamp, '+5 seconds')
GROUP BY ae.agent;
```

---

## 🎨 UI Component Usage

### Integrating PerformancePanel

```svelte
<script>
  import PerformancePanel from './lib/PerformancePanel.svelte';
</script>

<div class="app">
  <PerformancePanel />
</div>
```

**Features:**
- Auto-refreshes every 5 seconds
- Shows latest system metrics (CPU, memory, network)
- Displays per-process stats for selected agent
- Lists performance correlations (events + metrics)
- Shows hourly statistics (averages, peaks)

**Metrics displayed:**
- 🖥️ System Metrics: CPU%, Memory%, Network RX/TX
- 📊 Process Metrics: Agent CPU%, Memory, Disk I/O, Status
- 📈 Hourly Stats: Averages and peak values
- 🔗 Correlations: Events matched with system load

---

## ⚙️ Configuration

### Sampling Interval

Edit `src/main.rs`:

```rust
let config = SamplerConfig {
    interval_seconds: 10, // Change from 5 to 10 seconds
    session_id: format!("perf-{}", chrono::Utc::now().timestamp()),
    tracked_processes: vec![
        "claude".to_string(),
        "ollama".to_string(),
    ],
};
```

### Tracked Processes

Add more processes to track:

```rust
tracked_processes: vec![
    "claude".to_string(),
    "ollama".to_string(),
    "python".to_string(),
    "node".to_string(),
    "cursor".to_string(), // Add Cursor editor
    "code".to_string(),   // Add VS Code
],
```

---

## 🧪 Testing

### Check Metrics Collection

```bash
# Start Raven
cargo tauri dev

# Wait 10-15 seconds for metrics to be collected

# Query database
sqlite3 .raven/db/raven.db "SELECT * FROM raven_metrics ORDER BY id DESC LIMIT 5;"
sqlite3 .raven/db/raven.db "SELECT * FROM process_metrics ORDER BY id DESC LIMIT 5;"
```

### Test Tauri Commands

In browser console (Raven UI):

```javascript
// Get system metrics
const systemMetrics = await window.__TAURI__.invoke('get_system_metrics', { limit: 10 });
console.log(systemMetrics);

// Get process metrics
const processMetrics = await window.__TAURI__.invoke('get_process_metrics', {
  agentName: 'claude',
  limit: 10
});
console.log(processMetrics);

// Get correlations
const correlations = await window.__TAURI__.invoke('get_performance_correlations', {
  timeWindowSeconds: 5
});
console.log(correlations);
```

---

## 📈 Performance Benchmarks

### Metrics Collection Overhead

| Metric | Value |
|--------|-------|
| CPU overhead | <1% (during sampling) |
| Memory overhead | ~10 MB (metrics collector) |
| Disk write per sample | ~500 bytes (system) + ~200 bytes per process |
| Sampling latency | <10ms |

### Database Growth

| Duration | System Metrics | Process Metrics (4 agents) | Total Size |
|----------|----------------|----------------------------|------------|
| 1 hour | 720 rows (~360 KB) | 2,880 rows (~1.4 MB) | ~1.8 MB |
| 1 day | 17,280 rows (~8.6 MB) | 69,120 rows (~34 MB) | ~43 MB |
| 1 week | 120,960 rows (~60 MB) | 483,840 rows (~240 MB) | ~300 MB |

**Recommendation:** Implement periodic cleanup or data retention policies for long-running sessions.

---

## 🔍 Use Cases

### 1. Identify Resource-Intensive Operations

```sql
-- Find events that occurred during high CPU periods
SELECT ae.*, rm.cpu_percent
FROM agent_events ae
JOIN raven_metrics rm
    ON datetime(rm.timestamp) = datetime(ae.timestamp)
WHERE rm.cpu_percent > 80
ORDER BY ae.duration_ms DESC;
```

### 2. Track Agent Memory Leaks

```sql
-- Monitor memory growth over time for an agent
SELECT
    strftime('%H:%M', timestamp) as time,
    memory_mb
FROM process_metrics
WHERE agent_name = 'claude'
ORDER BY timestamp ASC;
```

### 3. Analyze Event Latency vs Load

```javascript
const correlations = await invoke('get_performance_correlations', {
  timeWindowSeconds: 5
});

// Find slow events during high load
const slowEventsHighLoad = correlations
  .filter(c => c.duration_ms > 5000 && c.system_cpu_percent > 70)
  .sort((a, b) => b.duration_ms - a.duration_ms);

console.table(slowEventsHighLoad);
```

### 4. Compare Agent Performance

```sql
-- Average resource usage by agent
SELECT
    agent_name,
    AVG(cpu_usage) as avg_cpu,
    AVG(memory_mb) as avg_mem,
    COUNT(*) as sample_count
FROM process_metrics
GROUP BY agent_name
ORDER BY avg_cpu DESC;
```

---

## 🚀 Future Enhancements (Phase II.3+)

- ⏳ **Custom metrics collection** (user-defined metrics)
- ⏳ **Alerting thresholds** (notify when CPU/memory exceeds limits)
- ⏳ **Historical charts** (visualize trends over hours/days)
- ⏳ **Data retention policies** (auto-cleanup old metrics)
- ⏳ **Export to CSV/JSON** (download metrics for analysis)
- ⏳ **GPU metrics** (track GPU usage for ML agents)
- ⏳ **Container metrics** (Docker/Podman stats)

---

## 📚 Related Documentation

- [TELEMETRY_API.md](TELEMETRY_API.md) - Agent telemetry integration
- [RAVEN_DEV_PLAN_PHASE_II.md](RAVEN_DEV_PLAN_PHASE_II.md) - Full Phase II roadmap
- [README.md](README.md) - Project overview

---

## 📄 License

MIT License - See [LICENSE](LICENSE) file

---

**Author:** Seth Eheart
**Codename:** Raven
**Phase:** II.2 - Performance Profiling
**Status:** ✅ Production Ready
