# Troubleshooting

Honest answers to the things that actually break. Each entry: what you'll see,
what's probably wrong, how to confirm it, how to fix it.

If a symptom isn't here, the diagnostic page at `http://localhost:9000/diagnostic`
runs every health check at once and links straight at the page that explains
each failure.

## Backend won't start

### Symptom: `start.sh` fails at "Backend booting..."

- **Likely cause:** Something else is bound to port 9100, or the TypeScript
  build crashed.
- **Verify:**
  ```bash
  tail -n 50 /tmp/raven-backend.log
  ss -tlnp | grep :9100         # what's holding the port
  ```
- **Fix:**
  - If the log shows `EADDRINUSE`, kill the process on `:9100`
    (`./stop.sh` does this) and retry.
  - If the log shows a TypeScript error, run `cd backend && npm run build`
    by hand to see the full output. The `dist/` directory needs to exist
    before `start.sh` will boot.
  - If the log shows a schema migration error, the DB has migrated past what
    this checkout knows about. Back up `.raven/db/raven.db` (or
    `~/.raven/db/raven.db`) and let it recreate.

### Symptom: `start.sh` reports backend ready but `/api/health` returns 503

- **Likely cause:** One of the subsystems came up `"down"`. The HTTP code is
  503 if any subsystem reports `down`; the JSON body tells you which.
- **Verify:**
  ```bash
  curl -s http://localhost:9100/api/health | jq .subsystems
  ```
- **Fix:** treat each `down` subsystem separately — most of the entries below
  match a `subsystems.*.status` value.

## Frontend won't load

### Symptom: nothing at `http://localhost:9000`

- **Likely cause:** Vite dev server crashed, or the port is being held by
  another process.
- **Verify:**
  ```bash
  tail -n 50 /tmp/raven-frontend.log
  ss -tlnp | grep :9000
  ```
- **Fix:** `./restart.sh`. If Vite reports a missing dependency, run
  `npm install` from the repo root.

### Symptom: Page loads but updates never arrive (HMR / WebSocket broken)

- **Likely cause:** Browser proxy or extension intercepting WebSocket; or the
  Socket.IO handshake failed because the backend isn't reachable from the
  page origin.
- **Verify:** Open the browser DevTools network tab, filter on `socket.io`,
  reload. Look for a `101 Switching Protocols` on `/socket.io/?EIO=4&...`.
- **Fix:** Hard reload (Ctrl-Shift-R), disable extensions on localhost, and
  confirm `CORS_ORIGIN` matches your frontend URL. Default is
  `http://localhost:9000`.

## Dashboard is all zeros

### Symptom: cost is $0.00, no agents, empty timeline

- **Likely cause:** No Claude / Codex / Ollama activity has been observed
  yet. This is the normal first-boot state — the watchers are running, but
  there's nothing to tail.
- **Verify:**
  ```bash
  curl -s http://localhost:9100/api/health | jq '.status, .subsystems.watcher, .subsystems.claude_log_watcher'
  ```
  Expect `"healthy"` and `status: "ok"` on the watchers. If both are `"ok"`
  and the dashboard is still empty, the watchers are healthy and just have
  nothing to report.
- **Fix:** Open a Claude Code or Codex session and edit a file. The dashboard
  catches up within ~2s (the broadcaster's coalescing window).

## Ollama features stopped working

### Symptom: Insights stop generating, "Ollama" chip is degraded

- **Likely cause:** The Ollama circuit breaker tripped. It opens after three
  consecutive failures (timeout, non-2xx, or refused connection) and stays
  open for 30 seconds before allowing a half-open probe.
- **Verify:**
  ```bash
  curl -s http://localhost:9100/api/health | jq .subsystems.ollama
  ```
  `state: "open"` confirms the breaker; `retryInSec` tells you when the next
  probe will fire.
- **Fix:** Wait 30s for the breaker to half-open. If Ollama itself is sick,
  restart it (`systemctl --user restart ollama`) and the next probe will
  close the breaker. If you don't want insights at all, set
  `RAVEN_INSIGHTS_DISABLED=1` before `./start.sh`.

## "DB is locked" or SQLITE_BUSY in the log

### Symptom: occasional `SQLITE_BUSY` in `/tmp/raven-backend.log`

- **Likely cause:** Two writers collided. The retention sweep (nightly at
  3 AM by default) holds the DB briefly; under load, a normal insert can race
  it. The retry helper in `backend/utils/sqlite-retry.ts` retries writes up
  to three times with exponential backoff (10/50/200 ms), and a `SQLITE_BUSY`
  log line at `debug` level is the retry path doing its job, not a failure.
- **Verify:**
  ```bash
  grep -c SQLITE_BUSY /tmp/raven-backend.log
  ```
- **Fix:** if `SQLITE_BUSY` is showing up as a `WARN` or `ERROR` (not `debug`
  / retry-attempt log lines), the retries are exhausting. The most common
  cause is the retention sweep colliding with a heavy insert burst. Move the
  sweep away from your busiest hour by editing `scheduleDaily(3, run)` in
  `backend/services/retention-cleanup.ts`.

## Watcher not detecting changes

### Symptom: files change, nothing shows up in the live timeline

- **Likely cause:** chokidar can't open a watch on the path (permissions, or
  the kernel's inotify watch limit is exhausted), or the watcher has
  permanently failed after five restart attempts.
- **Verify:**
  ```bash
  curl -s http://localhost:9100/api/health | jq .subsystems.watcher
  ```
  Look at `permanently_failed`, `restart_attempts`, and `last_error`.
  `"permanently_failed": true` means the watcher gave up.
- **Fix:**
  - On Linux, raise the inotify limit:
    ```bash
    sudo sysctl fs.inotify.max_user_watches=524288
    ```
  - On macOS, `chokidar` falls back to `fsevents` — confirm the watched path
    isn't on a network mount.
  - If `last_error` shows `EACCES` or `EPERM`, fix the permissions on the
    watched path.
  - After fixing, `./restart.sh`. The watcher resets its restart counter on
    a clean start.

## Disk full / every POST returns 503

### Symptom: `/api/health` reports `subsystems.disk.status = "down"`,

write-dependent routes 503

- **Likely cause:** Raven hit `ENOSPC` on a write. The disk-state singleton
  in `backend/utils/disk-state.ts` flips a process-lifetime flag the moment
  the SQLite retry helper sees `ENOSPC` or `SQLITE_FULL`. The flag clears
  the next time any write succeeds.
- **Verify:**
  ```bash
  df -h ~/.raven
  curl -s http://localhost:9100/api/health | jq .subsystems.disk
  ```
- **Fix:** free disk. The flag auto-clears on the first successful write
  after recovery — no restart needed. The most common space hog is the
  snapshot directory; lower `RAVEN_SNAPSHOT_DAYS` or delete
  `~/.raven/snapshots/`.

## Wipe state and start over

### Symptom: "I want to nuke everything and start fresh."

- **Where state lives:**
  - Installed mode: `~/.raven/`
  - Dev mode (from repo): `.raven/` inside the repo
- **Fix:**
  ```bash
  ./stop.sh
  # Optional: keep an export of the DB first
  curl -s "http://localhost:9100/api/export?format=sqlite" -o raven-backup.db
  rm -rf ~/.raven       # or .raven/ for dev
  ./start.sh
  ```
  `/api/export?format=sqlite` writes a `VACUUM INTO` backup before returning,
  so you get a consistent snapshot even if Raven is still ingesting.

## Backend memory keeps growing

### Symptom: `node` RSS climbs over hours / days

- **Likely cause:** A leak. Raven did a leak audit pass already, but the
  surface area is large; the most likely culprit is an event-bus listener
  that wasn't unbound on hot-reload.
- **Verify:**
  ```bash
  curl -s http://localhost:9100/api/health | jq .subsystems.memory  # if exposed
  # Or watch process.memoryUsage() over time
  watch -n 30 "ps -o pid,rss,cmd -p \$(cat /tmp/raven-backend.pid)"
  ```
- **Fix:** capture a heap snapshot
  (`node --inspect dist/server.js`, then connect from Chrome DevTools, then
  `Heap snapshot`) and file an issue with the dominant retainer.
  In the meantime, `./restart.sh` resets RSS.

## Plugin not loading

### Symptom: plugin file dropped in `.raven/plugins/`, nothing happens

- **Likely cause:** Plugin syntax error, plugin hit five timeouts and got
  auto-disabled, or the file isn't a `.js` file.
- **Verify:**
  ```bash
  grep '\[plugin\]' /tmp/raven-backend.log
  curl -s http://localhost:9100/api/plugins | jq
  ```
  Each plugin's `last_error`, `enabled`, `timeouts`, and `invocations` fields
  tell you exactly what happened.
- **Fix:** read [PLUGINS.md](PLUGINS.md). Common gotchas: `require` /
  `import` aren't available (sandbox is a `vm` context), no `fs` /
  `process`, and handlers must finish within 50ms. Hot-reload isn't
  supported — `./restart.sh` after edits.

## Where to look

- **Backend log:** `/tmp/raven-backend.log` (rotated by start.sh, overwritten
  on restart)
- **Frontend log:** `/tmp/raven-frontend.log`
- **PID files:** `/tmp/raven-backend.pid`, `/tmp/raven-frontend.pid`
- **Process state:** `curl -s http://localhost:9100/api/health | jq`
- **Diagnostic page:** `http://localhost:9000/diagnostic` — runs every
  health check at once and links straight at the page that explains each
  failure.

## Filing an issue

GitHub: <https://github.com/seheart/raven/issues/new>. Include:

- `curl -s http://localhost:9100/api/health | jq` output
- The last ~50 lines of `/tmp/raven-backend.log`
- Your platform (Linux distro / macOS version) + Node version (`node -v`)
- Whether you're running from `npx` or from a clone
