# WebSocket API Documentation

Raven uses Socket.io for real-time bidirectional communication between the backend and frontend. All events are emitted server-to-client for real-time updates.

## Connection

```javascript
// Frontend connection
import { io } from 'socket.io-client';
const socket = io('http://localhost:3030');
```

## Event Types

### File System Events

#### `file-changed`
**Description:** Emitted when a file is modified, created, or deleted and successfully tracked in the database.

**Payload:**
```typescript
{
  id: string;           // Event ID from database
  timestamp: string;    // ISO 8601 timestamp
  project: string;      // Project name
  filepath: string;     // Relative file path
  change_type: string;  // 'add' | 'change' | 'unlink'
  agent_event?: object; // Optional agent data if available
}
```

**Source:** `server.js:770`, `routes/telemetry.js:152`

---

#### `file-changed-untracked`
**Description:** Emitted when a file change is detected but failed to persist to database.

**Payload:**
```typescript
{
  timestamp: string;
  project: string;
  filepath: string;
  change_type: string;
  error: string;        // Error description
}
```

**Source:** `server.js:782`

---

#### `file-too-large`
**Description:** Emitted when a file exceeds the maximum allowed size (10MB).

**Payload:**
```typescript
{
  timestamp: string;
  project: string;
  filepath: string;
  size_bytes: number;
  limit_bytes: number;
}
```

**Source:** `server.js:672`

---

#### `file-watcher-error`
**Description:** Emitted when the file watcher encounters an error.

**Payload:**
```typescript
{
  project: string;
  timestamp: string;
  message: string;
  error: string;
}
```

**Source:** `server.js:1062`

---

### Git Events

#### `git-status-updated`
**Description:** Emitted when Git status changes are detected.

**Payload:**
```typescript
{
  project: string;
  branch: string;
  modified: string[];  // List of modified files
  created: string[];   // List of new files
  deleted: string[];   // List of deleted files
  ahead: number;       // Commits ahead of remote
  behind: number;      // Commits behind remote
}
```

**Source:** `server.js:965`

---

### Performance & System Events

#### `performance-alert`
**Description:** Emitted when system memory or heap usage exceeds thresholds.

**Payload:**
```typescript
{
  type: 'memory' | 'heap';
  severity: 'critical' | 'warning';
  title: string;
  message: string;
  value: string;  // Percentage as string (e.g., "92.5")
}
```

**Thresholds:**
- **Critical Memory:** >90% system memory usage
- **Warning Heap:** >90% heap usage
- **Warning Memory:** >85% system memory usage

**Source:** `server.js:456,466,476`

---

#### `system-metrics`
**Description:** Emitted periodically with system resource metrics.

**Payload:**
```typescript
{
  timestamp: string;
  cpu_percent: number;
  memory_percent: number;
  memory_used_mb: number;
  memory_total_mb: number;
  disk_usage_percent: number;
  active_connections: number;
}
```

**Source:** `metrics-collector.js:56`

---

#### `storage-warning`
**Description:** Emitted when disk storage usage exceeds thresholds.

**Payload:**
```typescript
{
  percentage: string;  // e.g., "92.5"
  size: number;        // Size in bytes
  critical: boolean;   // true if >90%, false if >85%
}
```

**Source:** `routes/health.js:75,83`

---

#### `health-check-failed`
**Description:** Emitted when a health check fails.

**Payload:**
```typescript
{
  checkName: string;
  category: string;
  message: string;
  timestamp: string;
}
```

**Source:** `health-checks.js:116`

---

### Agent & Telemetry Events

#### `agent-event`
**Description:** Emitted when agent activity is detected and tracked.

**Payload:**
```typescript
{
  id: string;
  timestamp: string;
  project: string;
  agent_name: string;
  event_type: string;
  filepath?: string;
  tool_name?: string;
  command?: string;
  duration_ms?: number;
  lines_changed?: number;
  token_count?: number;
  cost_usd?: number;
}
```

**Source:** `routes/telemetry.js:137`

---

### Trigger Events

#### `trigger-fired`
**Description:** Emitted when a custom trigger rule is activated.

**Payload:**
```typescript
{
  trigger_name: string;
  action: string;      // 'notify' | 'log' | 'command'
  message: string;
  timestamp: number;   // Unix timestamp in seconds
  project?: string;
}
```

**Source:** `trigger-engine.js:155`

---

#### `trigger-stats`
**Description:** Emitted alongside `trigger-fired` to update trigger statistics.

**Payload:**
```typescript
{
  total_triggers: number;
  active_triggers: number;
  trigger_counts: {
    [triggerName: string]: number;
  };
}
```

**Source:** `trigger-engine.js:156`

---

#### `notification`
**Description:** Emitted for trigger-generated notifications.

**Payload:**
```typescript
{
  id: string;
  timestamp: string;
  type: 'trigger';
  severity: 'info' | 'warning' | 'error';
  title: string;
  message: string;
  project?: string;
}
```

**Source:** `trigger-engine.js:140`

---

## Usage Examples

### Listening to File Changes

```javascript
socket.on('file-changed', (data) => {
  console.log(`File ${data.change_type}: ${data.filepath}`);
  // Update UI with new file event
});
```

### Monitoring Performance Alerts

```javascript
socket.on('performance-alert', (alert) => {
  if (alert.severity === 'critical') {
    showNotification(`${alert.title}: ${alert.message}`, 'error');
  }
});
```

### Tracking Git Status

```javascript
socket.on('git-status-updated', (status) => {
  updateGitBadge({
    branch: status.branch,
    modified: status.modified.length,
    ahead: status.ahead,
    behind: status.behind
  });
});
```

### Real-time Trigger Notifications

```javascript
socket.on('trigger-fired', (trigger) => {
  console.log(`Trigger activated: ${trigger.trigger_name}`);
  showToast(trigger.message);
});

socket.on('trigger-stats', (stats) => {
  updateTriggerDashboard(stats);
});
```

## Event Frequency

| Event | Frequency | Notes |
|-------|-----------|-------|
| `file-changed` | Real-time | On every file system change |
| `git-status-updated` | Real-time | After file changes in Git repos |
| `performance-alert` | Threshold-based | Only when thresholds exceeded |
| `system-metrics` | Periodic | Every 5 seconds (configurable) |
| `storage-warning` | Threshold-based | >85% and >90% disk usage |
| `agent-event` | Real-time | On every agent action |
| `trigger-fired` | Real-time | When trigger conditions met |

## WebSocket Rooms (Future Feature)

Planned support for project-specific rooms to subscribe only to events for specific projects:

```javascript
// Join a project room
socket.emit('join-project', 'my-project');

// Leave a project room
socket.emit('leave-project', 'my-project');
```

## Error Handling

Always handle connection errors and reconnection:

```javascript
socket.on('connect_error', (error) => {
  console.error('Connection failed:', error);
});

socket.on('reconnect', (attemptNumber) => {
  console.log(`Reconnected after ${attemptNumber} attempts`);
});

socket.on('disconnect', (reason) => {
  if (reason === 'io server disconnect') {
    // Server initiated disconnect, reconnect manually
    socket.connect();
  }
  // else the socket will automatically try to reconnect
});
```

## Testing WebSocket Events

Use the included test suite to verify WebSocket functionality:

```bash
cd backend
npm test -- __tests__/services/websocket.test.js
```

## References

- Socket.io Documentation: https://socket.io/docs/v4/
- Raven Backend: `/backend/server.js`
- Frontend WebSocket Service: `/frontend/src/lib/websocket.js`

---

**Last Updated:** v1.3.0
**Date:** October 26, 2025
