# Raven API Documentation

Complete reference for the Raven REST API and WebSocket interface.

**Base URL**: `http://localhost:3030`
**Version**: 1.6.0
**Authentication**: JWT Bearer tokens

## Table of Contents

- [Authentication](#authentication)
- [Dashboard & Stats](#dashboard--stats)
- [Events](#events)
- [Sessions](#sessions)
- [Projects](#projects)
- [Health & Status](#health--status)
- [Telemetry](#telemetry)
- [WebSocket API](#websocket-api)
- [Error Handling](#error-handling)

---

## Authentication

### POST /api/auth/login

Authenticate and receive a JWT token.

**Request:**
```json
{
  "username": "admin",
  "password": "your-password"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "username": "admin",
    "role": "admin"
  }
}
```

**Example:**
```bash
curl -X POST http://localhost:3030/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"changeme"}'
```

### GET /api/auth/verify

Verify JWT token validity.

**Headers:**
```
Authorization: Bearer YOUR_TOKEN
```

**Response:**
```json
{
  "valid": true,
  "user": {
    "id": 1,
    "username": "admin",
    "role": "admin"
  }
}
```

---

## Dashboard & Stats

### GET /api/dashboard-stats

Get comprehensive dashboard statistics.

**Authentication**: Required

**Response:**
```json
{
  "total_events": 1543,
  "recent_events": 127,
  "total_files": 89,
  "active_sessions": 3,
  "agents_status": {
    "claude": { "active": true, "last_seen": "2025-10-27T12:00:00Z" }
  },
  "health_score": 98,
  "last_updated": "2025-10-27T12:00:00Z"
}
```

**Example:**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3030/api/dashboard-stats
```

### GET /api/top-modified-files

Get most frequently modified files.

**Authentication**: Required

**Query Parameters:**
- `limit` (optional): Number of results (default: 10, max: 100)
- `days` (optional): Time range in days (default: 7)

**Response:**
```json
{
  "files": [
    {
      "filepath": "src/components/Dashboard.svelte",
      "edit_count": 45,
      "last_modified": "2025-10-27T11:30:00Z",
      "project": "raven"
    }
  ]
}
```

**Example:**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:3030/api/top-modified-files?limit=5&days=30"
```

---

## Events

### GET /api/events

Get paginated list of events.

**Authentication**: Required

**Query Parameters:**
- `limit` (optional): Number of results (default: 50, max: 500)
- `offset` (optional): Pagination offset (default: 0)
- `event_type` (optional): Filter by event type
- `project` (optional): Filter by project name
- `since` (optional): ISO timestamp to get events after

**Response:**
```json
{
  "events": [
    {
      "id": 1234,
      "event_type": "file_modified",
      "timestamp": "2025-10-27T12:00:00Z",
      "filepath": "src/App.svelte",
      "project": "raven",
      "session_id": "abc-123",
      "diff_summary": {
        "lines_added": 15,
        "lines_deleted": 3
      }
    }
  ],
  "total": 1543,
  "limit": 50,
  "offset": 0
}
```

**Example:**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:3030/api/events?limit=10&event_type=file_modified"
```

### GET /api/events/:id

Get specific event by ID.

**Authentication**: Required

**Response:**
```json
{
  "id": 1234,
  "event_type": "file_modified",
  "timestamp": "2025-10-27T12:00:00Z",
  "filepath": "src/App.svelte",
  "project": "raven",
  "session_id": "abc-123",
  "diff": {
    "before": "...",
    "after": "...",
    "lines_added": 15,
    "lines_deleted": 3
  },
  "metadata": {}
}
```

### POST /api/events

Create a new event (typically used by telemetry bridge).

**Authentication**: Required

**Request:**
```json
{
  "event_type": "tool_use",
  "data": {
    "tool": "bash",
    "command": "npm test",
    "result": "success"
  },
  "timestamp": "2025-10-27T12:00:00Z",
  "project": "raven"
}
```

**Response:**
```json
{
  "id": 1235,
  "created": true
}
```

---

## Sessions

### GET /api/sessions

Get list of Claude Code sessions.

**Authentication**: Required

**Query Parameters:**
- `limit` (optional): Number of results (default: 20)
- `active_only` (optional): Filter to active sessions only

**Response:**
```json
{
  "sessions": [
    {
      "session_id": "abc-123",
      "start_time": "2025-10-27T10:00:00Z",
      "end_time": null,
      "event_count": 127,
      "file_count": 15,
      "status": "active",
      "project": "raven"
    }
  ]
}
```

### GET /api/sessions/:id

Get detailed session information.

**Authentication**: Required

**Response:**
```json
{
  "session_id": "abc-123",
  "start_time": "2025-10-27T10:00:00Z",
  "end_time": null,
  "duration_seconds": 7200,
  "events": [...],
  "files_modified": [...],
  "statistics": {
    "total_events": 127,
    "lines_added": 450,
    "lines_deleted": 123
  }
}
```

---

## Projects

### GET /api/projects

Get list of monitored projects.

**Authentication**: Required

**Response:**
```json
{
  "projects": [
    {
      "name": "raven",
      "path": "/Users/seth/projects/raven",
      "active": true,
      "last_activity": "2025-10-27T12:00:00Z",
      "file_count": 270,
      "event_count": 1543
    }
  ]
}
```

### GET /api/projects/:name/stats

Get statistics for a specific project.

**Authentication**: Required

**Response:**
```json
{
  "project": "raven",
  "statistics": {
    "total_events": 1543,
    "total_files": 270,
    "active_sessions": 1,
    "lines_of_code": 107882,
    "last_24h_events": 127
  }
}
```

---

## Health & Status

### GET /health

Health check endpoint (no authentication required).

**Response:**
```json
{
  "status": "healthy",
  "uptime": 86400,
  "version": "1.6.0",
  "database": "connected",
  "telemetry_bridge": "running"
}
```

### GET /api/system-status

Detailed system status information.

**Authentication**: Required

**Response:**
```json
{
  "backend": {
    "status": "online",
    "version": "1.6.0",
    "uptime": 86400,
    "memory_usage_mb": 145.2,
    "cpu_percent": 12.5
  },
  "database": {
    "status": "connected",
    "size_mb": 23.4,
    "tables": 12
  },
  "telemetry_bridge": {
    "running": true,
    "pid": 12345,
    "healthy": true
  },
  "websocket": {
    "connected": true,
    "clients": 3
  }
}
```

---

## Telemetry

### POST /api/telemetry

Receive telemetry data from Claude Code bridge.

**Authentication**: Optional (can use API key)

**Request:**
```json
{
  "type": "conversation",
  "timestamp": "2025-10-27T12:00:00Z",
  "data": {
    "role": "user",
    "content": "Help me implement feature X"
  },
  "session_id": "abc-123"
}
```

**Response:**
```json
{
  "received": true,
  "event_id": 1235
}
```

### GET /api/telemetry/status

Get telemetry bridge status.

**Authentication**: Required

**Response:**
```json
{
  "bridge_running": true,
  "pid": 12345,
  "healthy": true,
  "last_heartbeat": "2025-10-27T12:00:00Z",
  "events_processed": 1543
}
```

### POST /api/telemetry/restart

Restart the telemetry bridge.

**Authentication**: Required (admin only)

**Response:**
```json
{
  "success": true,
  "new_pid": 12346,
  "message": "Telemetry bridge restarted successfully"
}
```

---

## WebSocket API

### Connection

Connect to WebSocket for real-time updates.

**URL**: `ws://localhost:3030`

**Authentication**: Send JWT token after connection
```javascript
socket.emit('authenticate', { token: 'YOUR_JWT_TOKEN' })
```

### Events (Server → Client)

**file-changed**
```json
{
  "type": "file-changed",
  "data": {
    "filepath": "src/App.svelte",
    "changeType": "modified",
    "project": "raven",
    "timestamp": "2025-10-27T12:00:00Z"
  }
}
```

**session-started**
```json
{
  "type": "session-started",
  "data": {
    "session_id": "abc-123",
    "timestamp": "2025-10-27T10:00:00Z"
  }
}
```

**session-ended**
```json
{
  "type": "session-ended",
  "data": {
    "session_id": "abc-123",
    "duration": 7200,
    "event_count": 127
  }
}
```

**health-update**
```json
{
  "type": "health-update",
  "data": {
    "health_score": 98,
    "checks": {
      "syntax_errors": 0,
      "test_failures": 0
    }
  }
}
```

### Events (Client → Server)

**subscribe**
```javascript
socket.emit('subscribe', {
  channels: ['file-events', 'session-updates']
})
```

**unsubscribe**
```javascript
socket.emit('unsubscribe', {
  channels: ['file-events']
})
```

---

## Error Handling

### Error Response Format

All errors follow this format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {},
  "timestamp": "2025-10-27T12:00:00Z"
}
```

### Status Codes

- **200** - Success
- **201** - Created
- **400** - Bad Request
- **401** - Unauthorized
- **403** - Forbidden
- **404** - Not Found
- **429** - Too Many Requests
- **500** - Internal Server Error

### Common Errors

**Authentication Failed (401)**
```json
{
  "error": "Invalid credentials",
  "code": "AUTH_FAILED"
}
```

**Token Expired (401)**
```json
{
  "error": "Token has expired",
  "code": "TOKEN_EXPIRED"
}
```

**Resource Not Found (404)**
```json
{
  "error": "Event not found",
  "code": "RESOURCE_NOT_FOUND",
  "details": {
    "resource_type": "event",
    "resource_id": 9999
  }
}
```

**Rate Limit Exceeded (429)**
```json
{
  "error": "Too many requests",
  "code": "RATE_LIMIT_EXCEEDED",
  "details": {
    "retry_after": 60
  }
}
```

---

## Rate Limiting

API endpoints are rate limited to prevent abuse:

- **Default**: 100 requests per minute
- **Authentication**: 10 requests per minute
- **Telemetry**: 1000 requests per minute

Rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1635340800
```

---

## Best Practices

### Authentication

- Store JWT tokens securely
- Refresh tokens before expiration
- Never expose tokens in URLs or logs

### Pagination

- Use `limit` and `offset` for large datasets
- Default page size is 50, max is 500
- Cache results when possible

### WebSocket

- Implement reconnection logic
- Handle connection errors gracefully
- Subscribe only to needed channels

### Error Handling

- Always check status codes
- Implement retry logic for 5xx errors
- Log errors for debugging

---

## Support

- **Issues**: https://github.com/seheart/raven/issues
- **Documentation**: https://github.com/seheart/raven/docs
- **Email**: seth@example.com
