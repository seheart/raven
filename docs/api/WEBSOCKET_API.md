# Raven WebSocket API Reference

**Version:** 0.6.1
**WebSocket URL:** `ws://localhost:3030`
**Library:** Socket.IO 4.8.1
**Status:** ✅ Production Ready

---

## 📋 Overview

Raven uses Socket.IO for real-time bidirectional communication. The server pushes events to connected clients automatically when changes occur. All events are broadcast to all connected clients.

### Quick Reference

- **Total Events:** 8
- **Transport:** WebSocket (with polling fallback)
- **Reconnection:** Automatic
- **Authentication:** None (local-only)

---

## 🔌 Connection

### Client Connection (JavaScript)

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3030', {
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 10
});

socket.on('connect', () => {
  console.log('✅ Connected to Raven WebSocket');
  console.log('Socket ID:', socket.id);
});

socket.on('disconnect', (reason) => {
  console.log('❌ Disconnected:', reason);
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
});
```

### Connection Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `connect` | Server → Client | Connection established |
| `disconnect` | Server → Client | Connection closed |
| `connect_error` | Server → Client | Connection failed |
| `reconnect` | Server → Client | Reconnection successful |

---

## 📡 Real-Time Events

### 1. file-changed

**Emitted When:** File system change detected

**Source:** `server.js:286`

**Frequency:** Real-time (debounced 50ms)

**Payload:**
```javascript
{
  filepath: 'src/main.js',
  change_type: 'modified',  // 'created' | 'modified' | 'deleted'
  timestamp: '2025-10-19T12:34:56.789Z',
  cpu: 13.54,
  mem: 20.44,
  session_id: '550e8400-e29b-41d4-a716-446655440000',
  file_hash: 'abc123...',
  event_size: 1024
}
```

**Example:**
```javascript
socket.on('file-changed', (data) => {
  console.log(`📝 File ${data.change_type}:`, data.filepath);
  console.log(`   CPU: ${data.cpu}% | Memory: ${data.mem}%`);

  // Update UI
  addToEventFeed(data);
  updateFileList(data.filepath);
});
```

---

### 2. git-status-updated

**Emitted When:** Git status changes (after file modification in Git repo)

**Source:** `server.js:377`

**Frequency:** After file changes in Git repository

**Payload:**
```javascript
{
  branch: 'main',
  ahead: 2,
  behind: 0,
  staged: 3,
  modified: 5,
  untracked: 2,
  clean: false,
  files: [
    {
      path: 'src/main.js',
      status: 'modified',  // 'modified' | 'added' | 'deleted' | 'untracked'
      staged: false
    }
  ]
}
```

**Example:**
```javascript
socket.on('git-status-updated', (data) => {
  console.log(`🔧 Git status updated on ${data.branch}`);
  console.log(`   Modified: ${data.modified} | Staged: ${data.staged}`);

  // Update Git panel UI
  updateGitPanel(data);

  if (!data.clean) {
    showGitWarning(`${data.modified} uncommitted changes`);
  }
});
```

---

### 3. project-switched

**Emitted When:** Active project is switched

**Source:** `server.js:470`

**Frequency:** On project selection

**Payload:**
```javascript
{
  project_name: 'ant312',
  project_path: '/home/seth/Projects/ant312',
  previous_project: 'raven',
  timestamp: '2025-10-19T12:34:56.789Z'
}
```

**Example:**
```javascript
socket.on('project-switched', (data) => {
  console.log(`📂 Project switched: ${data.previous_project} → ${data.project_name}`);

  // Clear old data and reload
  clearDashboard();
  loadProjectData(data.project_name);
  updateProjectSelector(data.project_name);

  // Show notification
  showNotification(`Now monitoring: ${data.project_name}`);
});
```

---

### 4. agent-event

**Emitted When:** New agent telemetry event received

**Source:** `server.js:536`

**Frequency:** Real-time (when agent sends telemetry)

**Payload:**
```javascript
{
  id: 123,
  timestamp: '2025-10-19T12:34:56.789Z',
  agent: 'claude',
  event_type: 'edit',  // 'edit' | 'create' | 'delete' | 'execute' | 'analyze' | etc.
  file: 'src/auth.js',
  lines_changed: 42,
  duration_ms: 3480,
  message: 'Refactored authentication module',
  metadata: {
    custom_field: 'value'
  },
  session_id: '550e8400-e29b-41d4-a716-446655440000'
}
```

**Example:**
```javascript
socket.on('agent-event', (data) => {
  console.log(`🤖 ${data.agent} - ${data.event_type}: ${data.message}`);

  if (data.file) {
    console.log(`   File: ${data.file} (${data.lines_changed} lines changed)`);
  }

  if (data.duration_ms) {
    console.log(`   Duration: ${data.duration_ms}ms`);
  }

  // Update UI
  addToAgentFeed(data);
  updateAgentStats(data.agent);

  // Trigger notification for important events
  if (data.lines_changed > 100) {
    showNotification(`Large edit by ${data.agent}: ${data.lines_changed} lines`);
  }
});
```

---

### 5. agent-stats

**Emitted When:** Agent statistics updated

**Source:** `server.js:549`

**Frequency:** After each agent event

**Payload:**
```javascript
[
  {
    agent: 'claude',
    event_count: 150,
    total_lines_changed: 4500,
    avg_duration_ms: 2340,
    total_duration_ms: 351000
  },
  {
    agent: 'ollama',
    event_count: 42,
    total_lines_changed: 850,
    avg_duration_ms: 1200,
    total_duration_ms: 50400
  }
]
```

**Example:**
```javascript
socket.on('agent-stats', (stats) => {
  console.log('📊 Agent statistics updated');

  stats.forEach(agent => {
    console.log(`   ${agent.agent}: ${agent.event_count} events, avg ${agent.avg_duration_ms}ms`);
    updateAgentCard(agent.agent, agent);
  });

  // Update charts
  updateAgentPerformanceChart(stats);
});
```

---

### 6. system-metrics

**Emitted When:** System metrics collected

**Source:** `metrics-collector.js:49`

**Frequency:** Every 1 second

**Payload:**
```javascript
{
  timestamp: '2025-10-19T12:34:56.789Z',
  cpu_percent: 13.54,
  memory_percent: 20.44,
  disk_usage_percent: 45.2,
  network_rx_mbps: 1.5,
  network_tx_mbps: 0.8,
  session_id: '550e8400-e29b-41d4-a716-446655440000'
}
```

**Example:**
```javascript
socket.on('system-metrics', (metrics) => {
  // Update real-time charts
  updateCPUChart(metrics.cpu_percent);
  updateMemoryChart(metrics.memory_percent);
  updateNetworkChart(metrics.network_rx_mbps, metrics.network_tx_mbps);

  // Check thresholds
  if (metrics.cpu_percent > 80) {
    showWarning(`High CPU usage: ${metrics.cpu_percent.toFixed(1)}%`);
  }

  if (metrics.memory_percent > 90) {
    showError(`Critical memory usage: ${metrics.memory_percent.toFixed(1)}%`);
  }
});
```

---

### 7. trigger-fired

**Emitted When:** Trigger condition met

**Source:** `trigger-engine.js:121`

**Frequency:** When trigger activates (with cooldown)

**Payload:**
```javascript
{
  trigger_name: 'high_cpu',
  timestamp: '2025-10-19T12:34:56.789Z',
  message: 'High CPU usage: 85.2%',
  metadata: {
    cpu: 85.2,
    threshold: 80,
    duration_ms: 0
  }
}
```

**Example:**
```javascript
socket.on('trigger-fired', (event) => {
  console.log(`🚨 Trigger fired: ${event.trigger_name}`);
  console.log(`   ${event.message}`);

  // Show alert notification
  showAlert({
    title: event.trigger_name,
    message: event.message,
    severity: 'warning',
    timestamp: event.timestamp
  });

  // Add to trigger log
  addToTriggerLog(event);

  // Play sound alert (optional)
  if (event.trigger_name.includes('critical')) {
    playAlertSound();
  }
});
```

---

### 8. trigger-stats

**Emitted When:** Trigger statistics updated

**Source:** `trigger-engine.js:122`

**Frequency:** After each trigger event

**Payload:**
```javascript
{
  total_triggers: 5,
  total_fired: 23,
  triggers: [
    {
      name: 'high_cpu',
      fired_count: 15,
      last_fired: '2025-10-19T12:30:00.000Z'
    },
    {
      name: 'slow_operation',
      fired_count: 8,
      last_fired: '2025-10-19T12:25:00.000Z'
    }
  ]
}
```

**Example:**
```javascript
socket.on('trigger-stats', (stats) => {
  console.log(`📈 Trigger stats: ${stats.total_fired} total events`);

  // Update trigger panel
  updateTriggerStats(stats);

  // Highlight most active triggers
  const mostActive = stats.triggers.sort((a, b) => b.fired_count - a.fired_count)[0];
  if (mostActive) {
    highlightTrigger(mostActive.name);
  }
});
```

---

## 🔧 Complete Integration Example

### Full React/Svelte Component Example

```javascript
import { onMount, onDestroy } from 'svelte';
import { io } from 'socket.io-client';

let socket;
let events = [];
let gitStatus = null;
let metrics = { cpu: 0, memory: 0 };
let agents = [];

onMount(() => {
  // Connect to WebSocket
  socket = io('http://localhost:3030', {
    transports: ['websocket', 'polling'],
    reconnection: true
  });

  // Connection events
  socket.on('connect', () => {
    console.log('✅ Connected to Raven');
  });

  socket.on('disconnect', () => {
    console.log('❌ Disconnected from Raven');
  });

  // File events
  socket.on('file-changed', (data) => {
    events = [data, ...events].slice(0, 100);  // Keep last 100
  });

  // Git events
  socket.on('git-status-updated', (data) => {
    gitStatus = data;
  });

  // Project switching
  socket.on('project-switched', (data) => {
    events = [];  // Clear events for new project
    console.log(`Switched to ${data.project_name}`);
  });

  // Agent events
  socket.on('agent-event', (data) => {
    console.log(`Agent event: ${data.agent} - ${data.message}`);
  });

  socket.on('agent-stats', (data) => {
    agents = data;
  });

  // System metrics
  socket.on('system-metrics', (data) => {
    metrics = {
      cpu: data.cpu_percent,
      memory: data.memory_percent
    };
  });

  // Triggers
  socket.on('trigger-fired', (event) => {
    alert(`Trigger: ${event.message}`);
  });

  socket.on('trigger-stats', (stats) => {
    console.log('Trigger stats updated:', stats);
  });
});

onDestroy(() => {
  if (socket) {
    socket.disconnect();
  }
});
```

---

## ⚡ Performance Considerations

### Event Frequency

| Event | Frequency | Notes |
|-------|-----------|-------|
| `file-changed` | ~1-100/sec | Debounced (50ms), varies with activity |
| `git-status-updated` | ~1-10/sec | Only on Git repo changes |
| `project-switched` | Rare | User-triggered only |
| `agent-event` | ~1-50/sec | Varies with agent activity |
| `agent-stats` | Same as agent-event | Sent after each event |
| `system-metrics` | 1/sec | Fixed interval |
| `trigger-fired` | Variable | Depends on conditions + cooldown |
| `trigger-stats` | Same as trigger-fired | Sent after each trigger |

### Best Practices

1. **Debounce UI Updates**
   ```javascript
   let updateTimeout;
   socket.on('system-metrics', (data) => {
     clearTimeout(updateTimeout);
     updateTimeout = setTimeout(() => {
       updateCharts(data);
     }, 100);  // Update UI every 100ms max
   });
   ```

2. **Limit Event History**
   ```javascript
   const MAX_EVENTS = 1000;
   socket.on('file-changed', (data) => {
     events = [data, ...events].slice(0, MAX_EVENTS);
   });
   ```

3. **Use Event Filtering**
   ```javascript
   socket.on('agent-event', (data) => {
     // Only process events from specific agents
     if (['claude', 'ollama'].includes(data.agent)) {
       processEvent(data);
     }
   });
   ```

4. **Batch Updates**
   ```javascript
   let metricsBuffer = [];
   let flushInterval;

   socket.on('system-metrics', (data) => {
     metricsBuffer.push(data);
   });

   flushInterval = setInterval(() => {
     if (metricsBuffer.length > 0) {
       updateMetricsChart(metricsBuffer);
       metricsBuffer = [];
     }
   }, 1000);  // Flush every second
   ```

---

## 🐛 Error Handling

### Connection Errors

```javascript
socket.on('connect_error', (error) => {
  console.error('WebSocket connection error:', error);

  // Show user-friendly message
  showError('Unable to connect to Raven server. Please check if the server is running.');

  // Attempt to reconnect
  setTimeout(() => {
    socket.connect();
  }, 5000);
});
```

### Disconnection Handling

```javascript
socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);

  if (reason === 'io server disconnect') {
    // Server disconnected, reconnect manually
    socket.connect();
  }

  // Show offline indicator
  showOfflineIndicator();
});
```

### Reconnection

```javascript
socket.io.on('reconnect', (attemptNumber) => {
  console.log(`✅ Reconnected after ${attemptNumber} attempts`);

  // Reload data after reconnection
  loadDashboardData();
  hideOfflineIndicator();
});

socket.io.on('reconnect_attempt', (attemptNumber) => {
  console.log(`🔄 Reconnection attempt ${attemptNumber}`);
});

socket.io.on('reconnect_failed', () => {
  console.error('❌ Reconnection failed');
  showError('Unable to reconnect to Raven server');
});
```

---

## 📚 Related Documentation

- [REST API](REST_API.md) - REST API reference
- [Telemetry API](TELEMETRY_API.md) - Agent telemetry guide
- [Database Schema](DATABASE_SCHEMA.md) - Database structure
- [Setup Guide](../SETUP.md) - Installation instructions

---

**Last Updated:** 2025-10-19
**Socket.IO Version:** 4.8.1
**Status:** ✅ Production Ready
