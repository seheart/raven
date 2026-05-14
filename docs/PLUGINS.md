# Plugins

Plugins are small JavaScript files that subscribe to Raven's event stream and
emit triggers. They run inside a hardened Node `vm` sandbox — no `require`,
no `fs`, no network, no `process`. The point is to let you add rule-based
detection without forking Raven.

Pre-1.0 surface. Things can change. The runtime lives in
`backend/services/plugin-runtime.ts`.

## Where they live

Drop `.js` files into:

- `~/.raven/plugins/` (installed via npx)
- `<repo>/.raven/plugins/` (running from source)

The directory is created on first boot, and an `example.js` is seeded if it's
missing. Restart Raven (`./restart.sh`) to pick up a new or edited plugin —
hot-reload is **not** supported today.

## The sandbox

Each plugin runs in a fresh `vm.Context` with:

- **No `require`, no `import`** — plugins can't pull in npm modules.
- **No `process`, no `Buffer`, no `globalThis` access to host realm** — the
  context starts with a null-prototype root so `globalThis.constructor`
  doesn't chain to host `Object`.
- **`codeGeneration: { strings: false, wasm: false }`** — `Function(string)`
  and `eval(string)` throw inside the sandbox.
- **A 50ms per-handler time budget.** Anything slower is logged as a timeout.
- **Auto-disable on five timeouts.** A misbehaving plugin won't drag the rest
  of the runtime down.

The runtime was recently hardened against host-realm `Function` access through
`.constructor` on injected host functions. The fix: build the API as
sandbox-realm functions that close over a single host bridge, then `delete
globalThis.__bridge` before user code runs. Source: `buildBridge()` and
`SANDBOX_PREAMBLE` in `backend/services/plugin-runtime.ts`.

Plugin errors are caught and logged to the plugin's own log buffer (visible
via `GET /api/plugins`). They do not crash Raven.

## API surface

Inside a plugin, you get a single global, `raven`:

```js
raven.on(eventName, handler);
raven.trigger(name, payload);
raven.log(...args);
raven.warn(...args);
raven.error(...args);
// `console.log`, `console.warn`, `console.error`, `console.info` are
// aliased to raven.log / .warn / .error so existing patterns work.
```

You also have the sandbox-realm standard built-ins: `Math`, `JSON`, `Date`,
`RegExp`, `Map`, `Set`, `Array`, `Object`, `String`, `Number`, `Boolean`,
`Symbol`, `Error`, `parseInt`, `parseFloat`, `isNaN`, `isFinite`. These come
from the sandbox's own realm, so their `.constructor` honors the
`codeGeneration` restriction.

Not available: `require`, `import`, `process`, `Buffer`, `fetch`, anything in
`fs`, anything in `net`, async runtime APIs that hit I/O, `globalThis.constructor`.

## Events you can subscribe to

The runtime dispatches two event types into plugins today, via
`EventBus.onFileEvent` and `EventBus.onAgentEvent`:

| `eventName` | Payload shape (key fields)                                                                          | When it fires                                               |
| ----------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `'file'`    | `{ type: 'add'\|'change'\|'unlink', path, ts, content?, hash?, size?, projectName?, projectPath? }` | Every file system event after persistence                   |
| `'agent'`   | `{ agent, eventType, file?, linesChanged?, durationMs?, message, metadata? }`                       | Every Claude/Codex/Ollama telemetry event after persistence |

The runtime declares two more event types (`'token-usage'` and `'trigger'`)
that callers can dispatch explicitly, but no producer is currently wired to
emit them into the plugin bus. If you write a plugin that subscribes to
`'token-usage'` or `'trigger'`, the handler will register cleanly but never
fire. The canonical event source list is `backend/modules/eventBus.ts` —
check there before relying on a new event name.

## Emitting triggers

`raven.trigger(name, payload)` dispatches a `trigger_fired` event into the
EventBus. The shape it produces:

```js
{
  ruleName: 'plugin:<plugin-name>:<your-name>',
  message: payload.message || `plugin ${pluginName} fired trigger ${name}`,
  severity: 'info' | 'warning' | 'error',
  metadata: payload  // your full payload, attached as-is
}
```

`severity` is normalized: `'warning'` and `'error'` pass through; `'critical'`
maps to `'error'`; anything else (including missing) becomes `'info'`. The
trigger gets the same downstream treatment as a TOML-defined trigger — it
shows up in the live timeline, fires WebSocket `trigger-fired` events to the
frontend, and lands in the triggers page.

## Three worked examples

### 1. Flag `.env` edits

```js
raven.on('file', event => {
  if (event.type === 'unlink') return;
  if (!event.path) return;
  // Match .env, .env.local, .env.production, etc.
  if (!/(^|\/)\.env(\.|$)/.test(event.path)) return;

  raven.trigger('env_file_touched', {
    message: `${event.path} was ${event.type}d`,
    severity: 'warning',
    path: event.path,
    project: event.projectName
  });
});
```

### 2. "Session is hot" — agent_events per session

```js
const WINDOW_MS = 60_000;
const THRESHOLD = 30;
const recent = new Map(); // sessionId -> [timestamps]

raven.on('agent', event => {
  const sid = event.metadata && event.metadata.session_id;
  if (!sid) return;

  const now = Date.now();
  const list = recent.get(sid) || [];
  list.push(now);
  // Drop anything outside the window.
  while (list.length && now - list[0] > WINDOW_MS) list.shift();
  recent.set(sid, list);

  if (list.length === THRESHOLD) {
    raven.trigger('session_hot', {
      message: `session ${sid.slice(0, 8)} has ${list.length} agent events in 60s`,
      severity: 'info',
      session_id: sid,
      count: list.length
    });
  }
});
```

The runtime hard-caps each handler at 50ms, so keep the per-event work small
(no JSON-serializing the entire `recent` map every event).

### 3. Debug helper — log every agent event

```js
raven.on('agent', event => {
  raven.log(
    'agent:',
    event.agent,
    'type:',
    event.eventType,
    event.file ? `file:${event.file}` : ''
  );
});
```

`raven.log` writes into the plugin's own log buffer (capped at 50 lines per
plugin, viewable via `GET /api/plugins`). It doesn't hit `stdout`, so this is
safe to leave on in production — but the buffer is small, so use it for
debugging rather than as a real log sink.

## Things plugins can't do (and why)

- **No `fs`** — path-traversal risk. Even a read-only handle to your home
  directory would let a misbehaving plugin exfiltrate file contents via
  trigger payloads.
- **No network** — the whole point of Raven is "nothing leaves the host".
  Letting plugins make outbound requests would silently invert that.
- **No `require` / `import`** — npm dependency chains are an unbounded escape
  hatch from the sandbox. The 50ms budget assumes pure-CPU rule logic, not a
  giant transitive dep graph.
- **No `process`** — would expose env vars (`AWS_SECRET_…`, API keys),
  PID space, and `process.binding`.
- **No `Function(string)` / `eval(string)`** — the `codeGeneration` flag
  blocks them. Same realm-isolation concerns apply to host-realm Function
  reachable via `.constructor`; see `backend/services/plugin-runtime.ts`
  for the full rationale.
- **No async I/O** — plugins are synchronous over a sync event bus. If you
  return a Promise, nothing will await it.

If you need any of these, you're past plugin territory and into a backend
service. Open an issue.

## Testing locally

The easiest loop:

```bash
# Terminal 1
tail -f /tmp/raven-backend.log | grep -i plugin

# Terminal 2 — edit a file in a watched project to trigger 'file' events,
# or run a Claude Code command to trigger 'agent' events
```

Or hit the plugin status API directly:

```bash
curl -s http://localhost:9100/api/plugins | jq
```

Each plugin entry has `enabled`, `invocations`, `timeouts`, `last_error`,
and the last 50 log lines. That's usually enough to tell whether the plugin
loaded, whether your handler fired, and whether it timed out.

When you're done editing a plugin, `./restart.sh` to reload — the runtime
doesn't watch the plugins directory.
