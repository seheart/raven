# Decisions

A living audit trail of the architectural choices Raven has made, plus the
questions still parked. Edit this file to update the About page — the
backend parses it on demand and exposes it at `/api/decisions`.

The format is loose Markdown. Two top-level sections (`## resolved` and
`## open`); inside each, one `###` heading per item. For resolved items
the parser recognizes the bold-prefix metadata lines:

- `**Decision:**`
- `**Alternatives:**`
- `**Lives at:**`

For open questions, everything under the `###` heading until the next
heading is treated as the note.

## resolved

### Where do events live?

**Decision:** Local SQLite via better-sqlite3, single file under `.raven/db/raven.db`. WAL journal mode, `auto_vacuum=incremental`. Retention defaults to keep-forever; `RETENTION_*_DAYS` env vars opt into nightly sweeps (snapshots default to 7 days). Full SQL is exposed for ad-hoc queries.
**Alternatives:** Postgres (overkill for single-host), Parquet (no live writes), event-stream service (cloud), mandatory retention (rejected — deleting a user's history by default is worse than a big file).
**Lives at:** backend/db.ts, backend/services/retention-cleanup.ts

### Local-only or networked?

**Decision:** Bind to 127.0.0.1 by default. `RAVEN_BIND=0.0.0.0` exists as a deliberate, documented escape hatch for trusted networks — with the README and Settings both stating plainly that Raven has no auth, so exposure means everything it records is readable by the network. Cloud is not on the roadmap. (This entry originally recorded the escape hatch as rejected; the code shipped one anyway, and the record now matches the code.)
**Alternatives:** No escape hatch at all (the friction punished legitimate single-user LAN setups), per-instance API key, mTLS between dev machines, hosted aggregator.
**Lives at:** backend/server.ts

### Auth on or off?

**Decision:** No auth, period. Raven is a single-user localhost tool; the JWT middleware that used to ship "wired and ready" was never mounted on a single route, so it was deleted rather than left implying protection that didn't exist. If a multi-user deployment story ever becomes real, auth gets designed then — in front of a threat model, not ahead of one.
**Alternatives:** Mandatory auth even on localhost (friction without payoff for the single-user case), keeping the unmounted middleware (rejected — a security suite testing code that never runs is worse than nothing).
**Lives at:** backend/middleware/security.js (helmet/cors/rate-limit only)

### How do we capture diffs without bloating the DB?

**Decision:** `shouldSkipDiff()` filters binary extensions, `__diffs__` / `__snapshots__` directories, and 9 lockfile basenames at the write path. Text diffs cap at 64 KB. Retention deletes + incremental vacuum reclaim space nightly.
**Alternatives:** Store full diffs (caused a 7 GB events table on a 6-day window before this fix).
**Lives at:** backend/utils/file-processing-helpers.js

### How do we track Ollama inference?

**Decision:** Proxy `/ollama` → `:11434` with telemetry interception. Tools point at Raven's port; we log every request without modifying upstream clients.
**Alternatives:** Patch every client config (fragile), poll Ollama metrics (lossy).
**Lives at:** backend/routes/ollama-proxy.ts

### How do we expose live system state?

**Decision:** On-demand introspection at `/api/system/*` — `sqlite_master` walks for the schema, `nvidia-smi` for the GPU, app router walk for endpoints. No background polling, no cached snapshots.
**Alternatives:** Background metrics collector (extra cost when the page is closed).
**Lives at:** backend/routes/system.ts

### How does the dark theme actually flip?

**Decision:** The `dark` class lives on `<html>`, not `<body>`. Tailwind v4 `@theme` aliases like `--color-canvas: var(--bg)` compile into `:root`, and CSS resolves `var()` at the declaring element — so the override has to be on `:root` too.
**Alternatives:** Body-scoped `dark` class (semantic utilities froze at the light hex; verified empirically across 31 routes).
**Lives at:** frontend/src/app.css

### Single port or split frontend/backend?

**Decision:** Two ports in dev (Vite `:9000` + Express `:9100`) for HMR; one binary in prod (Express serves the built static bundle).
**Alternatives:** One Express in dev too (slower iteration, no HMR).
**Lives at:** bin/raven-npx.js · start.sh

## open

### How do we roll up multiple hosts?

Each Raven instance is single-host today. A central aggregator is the obvious next step but the design tradeoffs (push vs pull, schema versioning, auth at the boundary) are unsettled. Parking until the demand signal is clearer.

### Auto-generate decisions from git history?

This page is hand-curated. We could mine commit messages and PR descriptions for an "auto-decisions" track, but signal quality is unproven and a wrong-shape decision is worse than no decision.

### How far do we push anomaly scoring?

Trigger rules cover the obvious cases. Per-agent baselining and learned thresholds are tempting but raise the question of how much state Raven should hold beyond raw events.

### Native desktop or stay browser-served?

Browser-served is fine today and avoids a Tauri/Electron build pipeline. A native shell would buy notifications and tray status, but the cost is real and the use case isn't yet.
