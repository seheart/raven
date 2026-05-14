# Raven

> Local-first observability for AI coding agents. See what Claude Code, Codex, and local Ollama models are doing on your machine — in real time, with full provenance, without anything leaving the host.

Raven tails your Claude Code (and Codex, and Ollama) sessions live. It records every file change, agent event, and token spend across every project to a single SQLite file, scores diffs for risk, and renders dashboards in your browser. No telemetry, no cloud, no account.

Pre-1.0 — public preview at **`0.5.0`**. The wiring is solid; rough edges are honest.

## Why

If you've ever stared at a Claude Code session wondering _what just happened_ — which files it touched, how much you spent, whether the diff is safe to ship — Raven is the answer. It's the dashboard your AI coding workflow has been missing, and it runs entirely on your hardware.

## Quick start

Requirements: **Node 18+**, Linux or macOS, and (optionally) [Ollama](https://ollama.com) for local-LLM narration.

Fastest path — no clone, no install:

```bash
npx raven-monitor
```

Raven launches on `http://localhost:9000` and watches the directory you invoked it from. Data persists under `~/.raven/`. The browser opens automatically.

**From source** (for hacking on Raven itself):

```bash
git clone https://github.com/seheart/raven.git
cd raven
npm install
./start.sh
```

In dev mode the data dir is `.raven/` inside the repo. To stop or restart:

```bash
./stop.sh
./restart.sh
```

The first thing you'll see is the **Dashboard** view: cost so far, narrative beats about your week, recent activity in plain English, and the files Claude touched today.

## What you get

- **Live cost ticker** — token spend ticking up in real time, paired with a per-inference stream as calls land.
- **Dashboard landing view** — narrative beats ("Back on atf after 4 days — welcome back."), recent activity in plain English, files touched today, a full-width cost hero with an hourly sparkline.
- **Persistent agent heartbeat** — always-visible dot in the header: breathes when thinking, ticks when executing, falls still when idle.
- **Active models card** — VRAM-resident Ollama models alongside cloud agents (Claude Code, Codex), with per-state activity rhythms and connection counts.
- **Inline diff scoring** — every change Claude makes gets risk-scored (hardcoded credentials, token prefixes, `eval`, `--no-verify`, `.env` edits, PEM keys) with gutter pills and per-file severity badges.
- **Local-LLM narrated insights** — daily digests, code reviews, and project-health summaries narrated by a local Ollama model. Zero data leaves your machine.
- **Token usage analytics** — by model, by project, by session. API-billing or Claude Max subscription mode.
- **Anomaly detection** — 7-day rolling p50/p95 baselines per model; flags any model running ≥2× normal cost or latency.
- **Looking Back (Wrapped)** — year-end scrollable card stack — top model, top project, biggest day, peak hour.
- **Plugin sandbox** — drop `.js` files into `.raven/plugins/` and subscribe to events via a 50ms-budgeted `vm` context. No `require`, no `fs`, no network.
- **Trigger rules** — configurable alerts for large deletions, high CPU, runaway sessions.

## How it works

1. Backend listens on `:9100`, frontend (dev) on `:9000`. Both bind to `127.0.0.1`.
2. A file watcher tails your project directories and records every edit/create/delete in a SQLite database at `.raven/db/raven.db` (dev) or `~/.raven/db/raven.db` (installed).
3. A Claude/Codex log parser tails their JSONL output and attributes events to sessions, projects, and tools.
4. A transparent Ollama proxy on `:11434` observes any tool that talks to local Ollama — no per-app config required.
5. Everything renders in a Svelte 5 + Tailwind v4 UI with Socket.IO push for live updates.

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

The backend is ~30 route files and ~15 repositories under a strict dependency-cruiser policy. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full breakdown.

## Pages

Five top-level tabs. Each has its own sub-navigation.

| Tab           | Sub-tabs                                                                                            |
| ------------- | --------------------------------------------------------------------------------------------------- |
| **Dashboard** | Overview · Narrative                                                                                |
| **Activity**  | Overview · Live · Changes · Timeline · Files · Projects · Health · Search                           |
| **Agents**    | Monitor · Stats · Conversations · Sub-Agents · Sessions · Network · Models · Performance            |
| **Insights**  | Overview · Costs · Trends · Looking Back                                                            |
| **System**    | Overview · Code Health · Health Monitor · Safety · Errors · Projects · Storage · Plugins · Triggers |

Meta pages reachable from the footer: **About** (this hero, principles, decisions audit trail from `DECISIONS.md`, telemetry, manifest), **Design** (the design-system reference), **Roadmap** (phased plan toward 1.0), **Diagnostic** (run all health checks in one place).

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

- `OLLAMA_URL` — upstream Ollama backend (default `http://127.0.0.1:11435`)
- `TRANSPARENT_OLLAMA_PORT` — proxy port (default `11434`, Ollama's default)
- `RAVEN_INSIGHTS_DISABLED=1` — turn off local-LLM narration
- `RAVEN_DEV_DISABLE_AUTH=true` — local-only dev, skip auth middleware
- `RAVEN_DIR` — override the data directory (default: `.raven/` in dev, `~/.raven/` installed)
- `WATCH_PATH` — override the directory being watched
- `RETENTION_EVENT_DAYS` — high-churn tables keep N days (default 7)
- `RETENTION_METRICS_DAYS` — slower-moving tables keep N days (default 30)
- `RETENTION_SNAPSHOT_DAYS` — snapshot files keep N days (default 7)

## Tech stack

- **Frontend:** Svelte 5 (runes), Tailwind CSS v4, Chart.js, Socket.IO client
- **Backend:** Node.js, Express, TypeScript, better-sqlite3, Socket.IO
- **Monitoring:** Chokidar (file watching), Claude/Codex JSONL parsing, transparent Ollama proxy
- **Testing:** Jest (backend), Vitest (frontend), Playwright (E2E)
- **Governance:** Knip (dead-code), dependency-cruiser (architecture rules), type-coverage ratchet

## Scripts

```bash
./start.sh           # Start both servers
./stop.sh            # Stop both
./restart.sh         # Restart both

cd backend  && npm test    # Jest
cd frontend && npm test    # Vitest
npm run e2e                # Playwright
```

## API

The backend exposes a REST API on `:9100`. The full schema is auto-generated via `npm run openapi:dump` and consumed by the frontend through `frontend/src/lib/typedApi.js`. A few highlights:

- `GET /api/today/narrative` — today + week per-project breakdowns, longest session, returning-to projects
- `GET /api/costs/summary?start=<iso>` — cost totals over a window
- `GET /api/costs/timeline?bucket=hour&start=<iso>` — bucketed cost time series
- `GET /api/insights/latest?type=session_summary` — most recent local-LLM summary
- `POST /api/insights/generate/summary` — request a fresh narration

WebSocket events: `system-metrics`, `file-changed`, `agent-event`, `trigger-fired`, `model-loaded`, `analysis-progress`.

## Feedback

File a bug or share an idea on GitHub: [seheart/raven/issues](https://github.com/seheart/raven/issues). There's no in-app form, no phone-home, no second site — that's the canonical channel.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for dev setup, test commands, and the commit-message convention. By participating, you agree to abide by the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE)
