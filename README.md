# Raven

> Local-first AI agent monitoring for developers

Raven watches your AI coding sessions in real time. It tracks file changes, system metrics, and agent activity across all your projects from a single dashboard. Built for Claude Code and compatible with other AI development tools.

## Quick Start

```bash
npm run dev
```

Opens at [http://localhost:9000](http://localhost:9000). Backend runs on port 9100.

## What It Does

- **Real-time file monitoring** — watches file changes as your AI agent works
- **Agent detection** — automatically identifies Claude Code sessions from JSONL logs
- **System metrics** — CPU, memory, and performance tracking
- **Safety checks** — pattern detection for hardcoded credentials, eval usage
- **Syntax validation** — automatic syntax checking across JS, TS, Python, JSON, YAML
- **Trigger rules** — configurable alerts for large deletions, high CPU, etc.
- **Historical trends** — activity patterns over time with Chart.js visualizations
- **Global search** — search across all file events and agent activity

## Architecture

```
frontend/          Svelte 5 + Tailwind CSS (port 9000)
backend/           Node.js + Express + TypeScript (port 9100)
  server.ts        Main application server
  db.ts            SQLite database (better-sqlite3)
  services/        File watcher, Claude log watcher, health monitor
  routes/          API route handlers
  modules/         EventBus, Git monitor, diff engine
```

## Pages

| Section          | Pages                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------ |
| **Dashboard**    | Real-time overview with live metrics, file feed, agent status                              |
| **Code Changes** | Live diff viewer for active file modifications                                             |
| **History**      | Activity log, timeline, code changes, file browser, projects, health, search               |
| **Analysis**     | Performance profiling, historical trends, agent stats, monitoring, conversations, triggers |
| **Safety**       | Pattern warnings, syntax errors                                                            |
| **System**       | Server health, health monitor, errors, projects                                            |

## API

Backend exposes a REST API on port 9100. Key endpoints:

- `GET /api/dashboard-stats` — session statistics
- `GET /api/file-events` — file change events
- `GET /api/system-metrics` — CPU/memory metrics
- `GET /api/agents-status` — detected AI agents
- `GET /api/agent-events` — agent activity log
- `GET /api/conversations` — parsed Claude session data
- `GET /api/health` — server health status
- `GET /api/triggers-config` — trigger rules
- `GET /api/trends/historical` — activity trends

WebSocket events: `system-metrics`, `file-changed`, `agent-event`, `trigger-fired`

## Configuration

Trigger rules are defined in `.raven/config.toml`:

```toml
[[trigger]]
name = "large_deletion"
lines_deleted = ">100"
action = "log"
message = "Large deletion detected: {file}"
cooldown_seconds = 60
```

## Tech Stack

- **Frontend:** Svelte 5, Tailwind CSS, Chart.js, Socket.IO client
- **Backend:** Node.js, Express, TypeScript, better-sqlite3, Socket.IO
- **Monitoring:** Chokidar (file watching), Claude JSONL log parsing
- **Testing:** Jest (backend), Vitest (frontend), Playwright (E2E)

## Scripts

```bash
npm run dev          # Start both frontend and backend in dev mode
npm run build        # Build frontend for production
npm run test         # Run all tests
npm run start        # Start production (via start.sh)
npm run stop         # Stop production (via stop.sh)
```

## License

MIT
