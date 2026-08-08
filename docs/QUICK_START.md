# Quick Start

The fastest path is the [README](../README.md) — this page is just the checklist.

## Prerequisites

| Requirement          | Version                       | Check                   |
| -------------------- | ----------------------------- | ----------------------- |
| Node.js              | **20.19+**                    | `node --version`        |
| npm                  | 10+                           | `npm --version`         |
| An AI agent to watch | Claude Code, Codex, or Ollama | `ls ~/.claude/projects` |

Raven is a recorder. If you have no Claude Code / Codex history and no Ollama, the dashboards start empty and fill as you work — that's expected, not broken.

Platforms: Linux and macOS. Windows works via WSL.

## Run it

```bash
npx raven-monitor
```

One process, one port: **`http://localhost:9100`** (the backend serves the built frontend). The browser opens when the server is ready. Data lives in `~/.raven/`; your existing Claude Code history is imported on first boot.

Useful knobs: `PORT=<n>` to move it, `RAVEN_NO_OPEN=1` to skip the browser tab. The full list is in the [README](../README.md#configuration).

## From source (for hacking on Raven)

```bash
git clone https://github.com/seheart/raven.git
cd raven
npm install     # postinstall pulls backend/ + frontend/ deps too
./start.sh      # dev mode: UI on :9000, API on :9100
./stop.sh       # stop both
```

Logs land in `/tmp/raven-backend.log` and `/tmp/raven-frontend.log`.

## First five minutes

1. **Dashboard** — cost so far today, narrative beats, files touched.
2. Start (or continue) a Claude Code session anywhere on the machine — watch the heartbeat dot in the header come alive.
3. **Activity → Changes** — every file the agent touches, risk-scored.
4. **Insights → Costs** — spend by model/project/session, plus the 5-hour plan-limit burn-down (set your tier in Settings → Billing).
5. **Footer → Diagnostic** — if anything looks empty, this page says why.

## When something's off

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) — symptom → cause → fix, with real commands.
