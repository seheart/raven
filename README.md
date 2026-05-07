# Raven

> Local-first AI agent monitoring for developers. See what your coding agent is doing — and what it's costing you — in real time, on your machine.

Raven watches your Claude Code (and other AI coding) sessions live. It tracks file changes, agent activity, and token spend across all your projects from a single dashboard. Nothing leaves your machine — no telemetry, no cloud, no account.

## Why

If you've ever stared at a Claude Code session wondering *what just happened* — which files it touched, how much you spent, whether the diff is safe to ship — Raven is the answer. It's the dashboard your AI coding workflow has been missing.

## Quick start

Requirements: **Node 18+**, Linux or macOS, and (optionally) [Ollama](https://ollama.com) for local-LLM narration.

```bash
git clone https://github.com/seheart/raven.git
cd raven
npm install
./start.sh
```

Open <http://localhost:9000>. The first thing you'll see is the **Today** view: cost so far, recent activity in plain English, files Claude touched, and a one-sentence summary of your day.

To stop or restart:

```bash
./stop.sh
./restart.sh
```

## What you get

- **Live cost ticker** — token spend ticking up in real time, with an hourly sparkline. Cost anxiety, answered before you ask.
- **Today landing view** — narrative beats ("Back on atf after 4 days — welcome back.", "This week, raven has been your main focus."), recent activity in plain English, files touched today.
- **Active models card** — live VRAM-resident Ollama models alongside cloud agents (Claude Code, Codex), with per-state activity rhythms and connection counts.
- **File-by-file diff viewer** — every change Claude makes, with project + session attribution.
- **Pattern + safety checks** — hardcoded-credential and eval-usage detection across edited files.
- **Local-LLM narrated insights** — daily digests, code reviews, and project-health summaries narrated by a local Ollama model. Zero data leaves your machine.
- **Token usage analytics** — by model, by project, by session. API billing or Claude Max subscription mode.
- **Trigger rules** — configurable alerts for large deletions, high CPU, runaway sessions.

## How it works

1. Raven runs on `localhost:9000` (frontend) and `:9100` (backend).
2. A file watcher tails your project directories and records every edit, create, and delete in a SQLite database under `.raven/db/raven.db`.
3. A Claude log parser tails Claude Code's JSONL output to attribute events to sessions, projects, and tools.
4. A transparent Ollama proxy on `:11434` observes any tool that talks to local Ollama — no per-app config required.
5. Everything is rendered in a Svelte 5 + Tailwind UI with WebSocket push for live updates.

No data ever leaves the host. The only outbound traffic is what your AI agents themselves make — Raven just observes.

## Architecture

```
frontend/        Svelte 5 + Tailwind CSS (port 9000)
backend/         Node.js + Express + TypeScript (port 9100)
  server.ts        Bootstrap, WebSocket, scheduling
  routes/          REST handlers (split by concern)
  repositories/    SQLite access layer (one repo per table)
  services/        File watcher, Ollama proxy, insights, health
  modules/         EventBus, Git monitor, diff engine
.raven/db/       SQLite — events, agent_events, token_usage, insights
```

The backend is split into ~30 route files and ~15 repositories under a strict dependency-cruiser policy. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full breakdown.

## Pages

| Section          | What's there                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------ |
| **Today**        | Lightweight first-run view: cost ticker, narrative beats, recent activity, files touched   |
| **Dashboard**    | Power-user overview: live metrics, file feed, agent status                                 |
| **Insights**     | Local-LLM narrated summaries, code reviews, daily digests                                  |
| **Analysis**     | Token usage, sub-agents, models, performance, trends, conversations, triggers              |
| **Code Changes** | Live diff viewer for active file modifications                                             |
| **History**      | Activity log, timeline, file browser, projects comparison, health, search                  |
| **System**       | Architecture, hardware, installed Ollama models, errors, storage                           |

## Configuration

Trigger rules live in `.raven/config.toml`:

```toml
[[trigger]]
name = "large_deletion"
lines_deleted = ">100"
action = "log"
message = "Large deletion detected: {file}"
cooldown_seconds = 60
```

Environment knobs:

- `OLLAMA_URL` — defaults to `http://127.0.0.1:11435` (transparent-proxy backend)
- `RAVEN_INSIGHTS_DISABLED=1` — turn off local-LLM narration
- `TRANSPARENT_OLLAMA_PORT` — proxy port (default `11434`, Ollama's default)
- `RAVEN_DEV_DISABLE_AUTH=true` — local-only dev, skip auth
- `RETENTION_EVENT_DAYS` — high-churn tables (events, agent_events, …) keep N days (default 7)
- `RETENTION_METRICS_DAYS` — slower-moving tables (token_usage, insights, …) keep N days (default 30)
- `RETENTION_SNAPSHOT_DAYS` — snapshot files keep N days (default 7)

## Tech stack

- **Frontend:** Svelte 5 (runes), Tailwind CSS v4, Chart.js, Socket.IO client
- **Backend:** Node.js, Express 4, TypeScript, better-sqlite3, Socket.IO
- **Monitoring:** Chokidar (file watching), Claude/Codex JSONL parsing, transparent Ollama proxy
- **Testing:** Jest (backend), Vitest (frontend), Playwright (E2E)
- **Governance:** Knip (dead-code), dependency-cruiser (architecture rules), type-coverage ratchet

## Scripts

```bash
./start.sh           # Start both servers
./stop.sh            # Stop both
./restart.sh         # Restart both

cd backend  && npm test           # Jest
cd frontend && npm test           # Vitest
npm run e2e                       # Playwright
```

## API

Backend exposes a REST API on `:9100`. The complete schema is auto-generated via `npm run openapi:dump` and consumed by the frontend through `frontend/src/lib/typedApi.js`. A few highlights:

- `GET /api/today/narrative` — today + week per-project breakdowns, longest session, returning-to projects
- `GET /api/costs/summary?start=<iso>` — cost totals over a window
- `GET /api/costs/timeline?bucket=hour&start=<iso>` — bucketed cost time series
- `GET /api/insights/latest?type=session_summary` — most recent local-LLM summary
- `POST /api/insights/generate/summary` — request a fresh narration

WebSocket events: `system-metrics`, `file-changed`, `agent-event`, `trigger-fired`, `model-loaded`, `analysis-progress`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for dev setup, test commands, and the commit-message convention.

## License

[MIT](LICENSE)
