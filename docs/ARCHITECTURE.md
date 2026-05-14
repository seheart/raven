# Architecture

How Raven actually fits together. Pairs with the [README](../README.md) for the
elevator-pitch version and with [DECISIONS.md](../DECISIONS.md) for the "why"
behind the load-bearing choices.

Pre-1.0. Single-host, single-user, bound to `127.0.0.1`. If a thing here looks
overbuilt for a single machine, see the decisions file — most of it is honest
scope reduction, not eager generalization.

## The five tiers

Raven is a one-way pipeline. Events come in from the left, get persisted in
the middle, and push out to the browser on the right. Nothing in the right-hand
stages can write back to the left.

```
Watchers ──► SQLite ──► Triggers ──► Insights (optional) ──► Broadcaster ──► Frontend
```

### 1. Watchers

Tail external producers and turn them into normalized events.

- **Does:** tail Claude Code and Codex JSONL session logs; watch each registered
  project tree with chokidar; observe Ollama via the transparent proxy; restart
  themselves with exponential backoff on transient failure.
- **Doesn't:** edit anything, hold persistent state in memory, run subprocesses
  against your repo. File positions are checkpointed to disk so a restart
  resumes mid-stream instead of replaying.
- **Implementation:**
  - `backend/modules/watcher.ts` (FileWatcher, chokidar-based)
  - `backend/services/claude-log-watcher.ts`
  - `backend/services/codex-log-watcher.ts`
  - `backend/services/ollama-log-watcher.ts`
  - `backend/modules/transparent-ollama-proxy.ts`

When a watcher hits an error it can't shrug off, it bumps a `restartAttempts`
counter and schedules a backoff retry. After five failed attempts it sets
`permanentlyFailed = true`, which surfaces as `subsystems.watcher.status =
"down"` in `/api/health`.

### 2. SQLite

The source of truth. One file under `.raven/db/raven.db`, WAL mode, full SQL
exposed to anyone with read access to the file.

- **Does:** persist every event with timestamp + agent + model + session +
  project + path + bytes; keep rollup tables in sync via SQL triggers; reclaim
  freed pages with incremental vacuum.
- **Doesn't:** encrypt (filesystem permissions are the boundary), replicate,
  encode anything in opaque blobs.
- **Implementation:** `backend/db.ts` (RavenDB class, `initializeSchema()`).

Repository layer in `backend/repositories/*` is the only thing allowed to
import `better-sqlite3` directly (see the dependency-cruiser policy below).

### 3. Trigger engine

Cheap deterministic rules over the event stream.

- **Does:** match each event against rules in `.raven/config.toml`; emit
  `trigger_fired` events with a name, message, and severity; honor per-rule
  cooldowns so a noisy condition doesn't spam the UI.
- **Doesn't:** call any LLM, block the writer (runs after persistence), auto-
  resolve anything.
- **Implementation:** `backend/trigger-engine.ts`. Rule shape lives in
  `.raven/config.toml`; see [README — Configuration](../README.md#configuration).

### 4. Insights (optional)

Local-LLM narration. Off if Ollama isn't running.

- **Does:** narrate sessions, summarize anomalies, score nuanced diffs through
  a local model (default `qwen2.5-coder`); skip entirely if the Ollama circuit
  breaker is open.
- **Doesn't:** call cloud LLMs, block trigger output, send anything off-host.
- **Implementation:** `backend/services/insights-service.ts`. Set
  `RAVEN_INSIGHTS_DISABLED=1` to kill it outright.

The breaker (`backend/utils/circuit-breaker.ts`) trips after 3 consecutive
failures and stays open for 30s. While open, every insight call fast-fails
with `CircuitOpenError` — the user sees a degraded chip in `/api/health`'s
`subsystems.ollama` block, not a stalled UI.

### 5. Broadcaster

Push real-time updates to every connected dashboard.

- **Does:** emit Socket.IO events (`file-changed`, `agent-event`,
  `trigger-fired`, `model-loaded`, `system-metrics`, `analysis-progress`,
  `health-alert`) to all connected clients; coalesce bursts into ~2s windows.
- **Doesn't:** authenticate (single host, no users), buffer indefinitely,
  reach outside `localhost`.
- **Implementation:** Socket.IO server set up in `backend/server.ts`; bindings
  in `backend/services/event-bus-bindings.ts`.

### Frontend

Svelte 5 + Tailwind v4. Renders the dashboards from REST + Socket.IO.

- **Does:** subscribe to the broadcaster, render the dashboards, theme via CSS
  variables on `:root` (see DECISIONS.md on the dark-theme flip).
- **Doesn't:** phone home, require sign-in, write to your repo.
- **Implementation:** `frontend/src/lib/pages/*`.

## Schema map

All tables live in `.raven/db/raven.db`. Created by `RavenDB.initializeSchema()`
in `backend/db.ts`.

Retention windows are tunable. See the
[README — Configuration](../README.md#configuration) for the env vars
(`RETENTION_EVENT_DAYS`, `RETENTION_METRICS_DAYS`, `RETENTION_SNAPSHOT_DAYS`).
The defaults in `server.ts` are `0` (kept forever) for events and metrics, and
`7` days for snapshot files — user preference is to keep historical data unless
disk pressure forces a trim.

### Event ingestion (high-churn)

| Table              | Purpose                                                  | Primary key   | Retention                       |
| ------------------ | -------------------------------------------------------- | ------------- | ------------------------------- |
| `events`           | File system change events                                | `id` AUTOINCR | high-churn — trim window opt-in |
| `agent_events`     | Claude/Codex/Ollama telemetry events                     | `id` AUTOINCR | high-churn — trim window opt-in |
| `file_events`      | (via `file_events_repository`, projection over `events`) | n/a           | derived                         |
| `syntax_errors`    | Syntax errors detected on a file change                  | `id` AUTOINCR | high-churn                      |
| `pattern_warnings` | Pattern-match findings (eval, hard-coded creds)          | `id` AUTOINCR | high-churn                      |
| `api_latency`      | Per-request latency for Claude/Ollama calls              | `id` AUTOINCR | high-churn                      |
| `diff_annotations` | Per-line risk findings tied to a single event            | `id` AUTOINCR | high-churn                      |
| `diff_risk_scores` | LLM-generated risk scores for a diff                     | `id` AUTOINCR | high-churn                      |

### Aggregates (lifetime, trigger-maintained)

These survive the retention sweep. Triggers on `events` / `agent_events` keep
them current atomically with each insert, so a 7-day events trim doesn't
collapse the lifetime odometers on the dashboard.

| Table              | Purpose                                             | Primary key    | Retention |
| ------------------ | --------------------------------------------------- | -------------- | --------- |
| `project_stats`    | Per-project event counters + first/last seen        | `project_name` | lifetime  |
| `file_stats`       | Per-filepath rollup (mods, creates, edits, deletes) | `filepath`     | lifetime  |
| `event_type_stats` | Per-change_type counter for dashboard header        | `change_type`  | lifetime  |

Triggers (declared in `db.ts`): `bump_project_stats_events`,
`bump_project_stats_agent_events`, `bump_file_stats_events`,
`bump_event_type_stats_events`. All are `INSERT … ON CONFLICT DO UPDATE`, so
they're single-statement and atomic with the source insert. Each rollup is
backfilled once at boot from surviving rows if its row count is zero.

### Telemetry (slow-moving)

| Table             | Purpose                                     | Primary key   | Retention          |
| ----------------- | ------------------------------------------- | ------------- | ------------------ |
| `raven_metrics`   | System CPU/memory/network, sampled          | `id` AUTOINCR | slow — trim opt-in |
| `process_metrics` | Per-agent CPU/memory/FD/thread snapshots    | `id` AUTOINCR | slow — trim opt-in |
| `gpu_metrics`     | nvidia-smi snapshots (one row per GPU)      | `id` AUTOINCR | slow — trim opt-in |
| `token_usage`     | Per-request input/output/cache tokens + USD | `id` AUTOINCR | slow — trim opt-in |
| `app_errors`      | Application error log (frontend + backend)  | `id` AUTOINCR | slow               |
| `test_results`    | Jest/Vitest/Playwright run results          | `id` AUTOINCR | slow               |

### Insights + self-analysis (lifetime)

| Table             | Purpose                                   | Primary key   | Retention |
| ----------------- | ----------------------------------------- | ------------- | --------- |
| `insights`        | Local-LLM narrations + structured digests | `id` TEXT     | lifetime  |
| `analysis_runs`   | Self-analysis (code health) run header    | `id` AUTOINCR | lifetime  |
| `analysis_checks` | Per-check rows for an analysis run        | `id` AUTOINCR | cascade   |
| `subagent_tree`   | Sub-agent parent/child tree per session   | `id` AUTOINCR | lifetime  |

### Config (JSON, not SQLite)

Two pieces of state intentionally live outside the DB so they're trivially
diffable:

- `~/.raven/host.json` — host identity (host_id, host_name).
- `~/.raven/projects.json` — registered projects + watcher paths.
- `~/.raven/log-positions-claude.json` and `…-codex.json` — log tailer offsets
  (so a restart resumes mid-file).
- `.raven/config.toml` — trigger rules.

## Directory layout

```
backend/
  routes/         REST handlers, one file per concern, all wired in routes/index.ts
  repositories/   SQLite access layer — only place allowed to import better-sqlite3
  services/       File/log watchers, Ollama proxy, insights, plugins, health
  modules/        EventBus, GitMonitor, diff engine, transparent Ollama proxy
  middleware/     auth, errorHandler, security/Helmet, performance, rate-limit
  utils/          Pure helpers — logger, circuit-breaker, disk-state, sqlite-retry
  migrations/     Numbered, idempotent DB migrations (rare — schema is mostly in db.ts)

frontend/src/lib/
  pages/          One Svelte component per route — Dashboard, Activity, Agents, etc.
  components/     Shared UI — insights/, layout/, live/, llm-lab/, pulse-shapes/, today/, ui/
  services/       websocket.js — single Socket.IO client wired to typedApi
  stores/         settingsStore, notificationHistory
  utils/          chartUtils, helpers, formatUsd, markdown, router.svelte.js
  content/        Static page copy as data — about.js, roadmap.js, design.js

scripts/          Operator scripts — claude-telemetry-bridge.js, nightly-test-run.sh, etc.
e2e/              Playwright specs covering the navigation + main views
docs/             This directory — architecture, troubleshooting, plugins, etc.
```

## Dependency policy

`backend/.dependency-cruiser.cjs` encodes the architecture rules as lint. The
load-bearing ones:

- **`no-circular`** (error) — Circular deps make refactors risky; rejected.
- **`better-sqlite3-only-in-data-layer`** (error) — Only `db.ts`, `database/`,
  `repositories/`, `scripts/`, `migrations/`, and `run-migrations.js` may
  import `better-sqlite3`. Everything else goes through a repository.
- **`no-raw-sql-in-routes`** (error) — `routes/*.ts` cannot import
  `better-sqlite3` at all. Pair with the ESLint `no-restricted-syntax` rule
  that catches `db.db.prepare()` patterns (depcruise only sees imports).
- **`middleware-no-routes`** (error) — `middleware/` is a lower layer than
  `routes/` and must not import from it.
- **`routes-not-coupled`** (warn) — `routes/*.ts` cannot import each other.
  `routes/index.ts` is the wiring aggregator and is exempt.
- **`utils-pure`** (warn) — `utils/` is leaf-level. No imports from
  `services/`, `routes/`, or `middleware/`.
- **`not-to-test`** (error) — Production code cannot import test files.
- **`no-non-package-json-deps`** (error) — Every import is declared in
  `package.json`.

Run it: `cd backend && npx depcruise --config .dependency-cruiser.cjs .`.

## Boot sequence

What `./start.sh` actually does, in order:

1. **Clean up.** Kill any stale `node dist/server.js` / `vite` processes and
   any leftover listeners on ports 9100 / 9000.
2. **Build if needed.** If `backend/dist/` is missing, run `npm run build` in
   `backend/`.
3. **Start backend** (`node backend/dist/server.js`) in the background, logging
   to `/tmp/raven-backend.log`, PID to `/tmp/raven-backend.pid`. Inherits
   `OLLAMA_URL`, `TRANSPARENT_OLLAMA_PORT`, and `RAVEN_INSIGHTS_DISABLED` from
   the env (with documented defaults).
4. **Start frontend** (`npm run dev` in `frontend/`) in the background, logging
   to `/tmp/raven-frontend.log`, PID to `/tmp/raven-frontend.pid`.
5. **Wait for backend health.** Poll `GET /api/health` until
   `"status":"healthy"` (up to 30s). Bail if it doesn't come up.
6. **Wait for frontend.** Poll `http://localhost:9000` until it responds (up
   to 10s).
7. **Warm caches.** Fire 28 parallel `curl`s at endpoints the first page load
   would hit (`/api/dashboard-stats`, `/api/system-metrics`, `/api/projects`,
   `/api/sessions`, etc.) so first-paint isn't paying the cold-cache cost.
   Skip with `SKIP_HEALTH_CHECKS=1`.
8. **Open browser.** `xdg-open http://localhost:9000`. Suppressed with
   `RAVEN_NO_OPEN=1` or on restart (cold start only).

`initializeSchema()` (called by the `RavenDB` constructor on first connection)
is idempotent: every `CREATE TABLE` and `CREATE INDEX` is `IF NOT EXISTS`,
legacy columns are added with `ALTER TABLE` only when `PRAGMA table_info`
shows them missing, and the rollup-table backfills are guarded by
`SELECT COUNT(*) = 0`. Safe to run on every boot.

## Failure-mode behavior

Raven leans into "degrade visibly" rather than "crash on first error". The
load-bearing pieces:

- **Circuit breakers** for unreliable external services (today: Ollama). Defaults
  to 3 consecutive failures → open for 30s; recovery is a half-open probe.
  Source: `backend/utils/circuit-breaker.ts`.
- **SQLite write retry** with exponential backoff (10ms / 50ms / 200ms) on
  `SQLITE_BUSY`. `ENOSPC` and `SQLITE_FULL` skip retry and flip the disk-full
  flag immediately. Source: `backend/utils/sqlite-retry.ts`.
- **Disk-state singleton.** When the retry helper sees `ENOSPC`, it sets a
  process-lifetime flag; `/api/health`'s `subsystems.disk.status` flips to
  `"down"`; write-dependent routes can return 503 instead of crashing. The
  next successful write clears the flag. Source: `backend/utils/disk-state.ts`.
- **Watcher auto-restart.** Both `FileWatcher` and the log watchers track
  `restartAttempts`, retry with exponential backoff, and set
  `permanentlyFailed = true` after five attempts. State surfaces in
  `/api/health`'s `subsystems.watcher`, `…claude_log_watcher`,
  `…codex_log_watcher`.
- **Plugin sandbox failures** are logged to the plugin's own log buffer and
  bumped against a timeout counter. Five timeouts auto-disables the plugin.
  See [PLUGINS.md](PLUGINS.md).

User-visible symptoms and how to read them: [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
