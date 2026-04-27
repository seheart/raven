/**
 * Static content for the About page. Edit here, not in the .svelte file.
 *
 * Pattern modelled on ANT's `ant/web/content/architecture.py`: the page is a
 * dumb template that iterates over these arrays. Adding a persona / decision /
 * principle is editing one entry; the layout takes care of itself.
 */

export const HERO = {
  title: 'Always-on, host-only observability for AI coding agents.',
  lede: 'Raven watches what Claude Code, Codex, and your local Ollama models do across every project on your machine, persists the raw events in a single SQLite file, and renders dashboards in real time. Source code never leaves the host.',
  whatItIs:
    "A passive monitor that tails agent session logs and your working tree, normalizes the events, and shows you what's happening as it happens.",
  whatItDoes:
    'Watches files + agent logs · ingests to local SQLite · scores diffs for risk · pushes live updates over WebSocket · exposes everything via SQL.',
  whatItDoesnt:
    'Edit your code · trigger CI · file PRs · phone home · need an account · break when the network does. Bound to 127.0.0.1; the only outbound request is when you click the GitHub link.',
  badges: [
    {
      label: 'LOCAL-FIRST',
      items: ['Inference + storage on this host', '0 outbound for monitoring', 'bound to 127.0.0.1']
    }
  ]
};

export const PERSONAS = [
  {
    tag: 'Running in parallel',
    headline: "You've got Claude Code, Codex, and Aider open at once.",
    body: "Three terminals, three projects, three agents pulling at different parts of your codebase. You want one place to see what each is doing — what files they're hot on, where they're stuck, which one just touched the database layer.",
    fits: [
      'Unified timeline across Claude Code, Codex, Ollama',
      'Per-agent file heatmap and recent-activity feed',
      'Live status (running / thinking / waiting / errored)'
    ]
  },
  {
    tag: 'Watching the meter',
    headline: "You're paying for tokens and want a real-time read.",
    body: 'Claude credits add up fast when three sessions are running. You want to know which agent burned the last $5, which model is doing the actual work, and where the bursts come from — without waiting for the monthly invoice.',
    fits: [
      'Per-agent + per-model cost rollup, refreshed live',
      'Token usage by session and by file',
      'Anomaly callout when a single session spikes'
    ]
  },
  {
    tag: 'Trust but verify',
    headline: 'You let the agent edit your repo but want a tail of every diff.',
    body: "You're not a babysitter, but you do want a real-time stream of every file change, with a risk score next to it. If an agent rewrites your auth middleware at 2 AM, you'd like the alert before the regression test fails.",
    fits: [
      'Live diff timeline with file + agent attribution',
      'Local LLM-scored risk per change (optional Ollama tier)',
      'Pattern + syntax warnings surfaced as they happen'
    ]
  },
  {
    tag: 'Analytics in SQL',
    headline: 'You want to ask weird questions of the past three months.',
    body: "Three months from now: which agent's edits get reverted most? What time of day does Codex break tests? Which projects accumulate the most syntax warnings? You need plain data, not an opaque store and a vendor's pre-built charts.",
    fits: [
      'One SQLite file, full SQL access via the sqlite3 CLI',
      'Append-only event log with timestamps + provenance',
      'Schema visible at /api/system/introspection'
    ]
  }
];

export const NOT_FOR = [
  {
    who: 'Centralized enterprise dashboards',
    why: "Raven is single-host by design. There's no aggregation tier, no auth on top of LAN exposure, no multi-tenant story. If you need a fleet view across 50 dev machines, you'd be wiring that up yourself."
  },
  {
    who: 'Teams that want AI to take action',
    why: "Raven observes. It does not trigger CI, file PRs, run linters, or auto-apply suggestions. The agent under observation is the one doing the work; Raven only surfaces what happened. If you want an automation layer, this isn't it."
  },
  {
    who: 'Cloud-only ops',
    why: "There is no hosted Raven and no plan for one. If your machine has to be off, Raven is off. If your laptop is asleep, you're not observing. The whole pitch is that the data lives on your hardware."
  },
  {
    who: 'Anyone who needs role-based access',
    why: 'Auth is wired but off in dev. There are no roles, no per-user views, no audit log of who looked at what. Add an SSO proxy if you need it; the project will not grow this layer in-tree.'
  }
];

export const QUICKSTART = [
  {
    step: '01',
    title: 'Clone and install',
    body: 'One repo, one install. Backend and frontend live in the same tree.',
    code: `git clone https://github.com/seheart/raven
cd raven && npm install`
  },
  {
    step: '02',
    title: 'Start Raven',
    body: 'Backend on :9100, frontend on :9000, both behind 127.0.0.1. The script handles port cleanup, schema migrations, and cache warming.',
    code: './start.sh'
  },
  {
    step: '03',
    title: 'Open the dashboard',
    body: 'Defaults to localhost-only. To expose on LAN, set RAVEN_HOST=0.0.0.0 — but read the security model first.',
    code: 'open http://localhost:9000'
  }
];

export const WHY = [
  'I had three Claude Code sessions running, a Codex tab open in one IDE, and Aider in a terminal driving a third project. None of the existing observability tools spoke to all three, and the cloud ones wanted my source code uploaded.',
  'So I built it for myself one weekend, then realized the friend whose codebase I was reviewing had the same problem. Open-sourcing in case you do too.',
  'Architectural choices (local-first, plain SQLite, read-only on the working tree, single-host by default) are documented as decisions further down. If a call turns out wrong later, the original framing is still there.'
];

export const DIFFERENTIATORS = [
  {
    name: 'Multi-agent unified view',
    body: 'Claude Code, Codex, and Ollama all surface in one timeline, with the same event shape and the same risk-scoring pipeline. Most monitoring tools track one model family or one provider; Raven treats them as peers.'
  },
  {
    name: 'Read-only on your code',
    body: 'Raven never edits files, never runs commits, never starts subprocesses against your repo. The agent under observation does all the writing. That makes Raven safe to point at any project — even ones with active CI.'
  },
  {
    name: 'Live, not polled',
    body: 'Socket.IO pushes every event as it happens. The dashboard reflects state from milliseconds ago, not the last cron tick. WebSocket events are coalesced server-side into 2-second windows so dashboards stay smooth even under bursts.'
  },
  {
    name: 'Plain SQLite, full provenance',
    body: "One file under .raven/db/raven.db. Every event carries timestamp, agent, model, session ID, file path, byte counts. You can sqlite3 the file directly and ask questions Raven's UI doesn't answer. Three months from now, the data is still there in the same shape."
  },
  {
    name: 'Schema-enforced privacy',
    body: 'No auth in dev mode because no remote surface — bound to 127.0.0.1. No telemetry endpoints. No PII columns. The only outbound network call Raven makes is to render the GitHub icon in the footer; even that is from your browser, not the server.'
  }
];

// Mermaid source for the architecture diagram. Theme tokens are injected at
// runtime by MermaidDiagram.svelte — colors here are placeholders.
export const ARCHITECTURE_DIAGRAM = `
flowchart LR
  AGENTS["Claude Code · Codex · Ollama"]
  TREE["Working tree<br/>(your projects)"]
  USER(("You"))

  subgraph raven ["Raven — runs continuously on your machine"]
    direction LR
    WATCH["Watchers<br/>chokidar · journalctl<br/>log tailers"]
    DB[("SQLite<br/>.raven/db/raven.db")]
    TRIG["Trigger engine<br/>rule-based scoring"]
    INS["Insights<br/>local LLM via Ollama<br/>(optional)"]
    SSE["Socket.IO<br/>broadcaster"]
    UI["Svelte dashboard<br/>:9000"]
    WATCH --> DB
    DB --> TRIG
    DB --> INS
    TRIG --> SSE
    INS --> SSE
    SSE --> UI
  end

  AGENTS -->|session logs| WATCH
  TREE -->|file events| WATCH
  USER --> UI

  classDef neutral stroke-width:1px;
  classDef accent stroke-width:1.5px;
  classDef success stroke-width:1.5px;
  classDef warning stroke-width:1.5px;
  classDef info stroke-width:1.5px;
  class AGENTS,TREE,USER neutral
  class DB accent
  class WATCH,SSE success
  class TRIG info
  class INS warning
  class UI accent
`.trim();

export const ROLES = [
  {
    role: 'Watchers',
    color: 'success',
    tagline: 'Observe; never write.',
    impl: 'chokidar · journalctl · log tailers',
    does: [
      'Tail Claude / Codex session logs',
      'Watch every project tree for file events',
      'Follow journalctl -u ollama for inference activity'
    ],
    doesNot: [
      'Edit any file',
      'Trigger any subprocess against your repo',
      'Hold persistent state — restartable any time'
    ]
  },
  {
    role: 'Database',
    color: 'accent',
    tagline: 'Single SQLite file, full provenance.',
    impl: 'better-sqlite3 · WAL · auto_vacuum=incremental',
    does: [
      'Append events with agent + model + session + path + bytes',
      'Run a 7-day retention sweep nightly at 3 AM',
      'Reclaim freed pages incrementally so the file stays small'
    ],
    doesNot: [
      'Hold opaque blobs — every column is queryable',
      'Encrypt — your filesystem permissions are the boundary',
      'Replicate — single-host, full stop'
    ]
  },
  {
    role: 'Trigger engine',
    color: 'info',
    tagline: 'Cheap, deterministic, always-on.',
    impl: 'rule-based scoring · pattern detection',
    does: [
      'Score each event for risk against a fixed rubric',
      'Surface anomalies (auth touch, mass deletes, big diffs)',
      'Emit warnings into the live timeline'
    ],
    doesNot: [
      'Call out to any LLM',
      'Block the writer — runs after the event is persisted',
      'Auto-resolve anything'
    ]
  },
  {
    role: 'Insights',
    color: 'warning',
    tagline: 'Optional LLM tier — degrades gracefully.',
    impl: 'local Ollama · qwen2.5-coder by default',
    does: [
      'Pipe diffs through a local model for nuanced risk scoring',
      'Generate anomaly summaries + daily digests',
      'Skip entirely if Ollama is not running'
    ],
    doesNot: [
      'Call any cloud LLM',
      'Block trigger-engine output',
      'Run if VRAM is tight (per-call budget caps + circuit breaker)'
    ]
  },
  {
    role: 'Broadcaster',
    color: 'success',
    tagline: 'Push, do not poll.',
    impl: 'Socket.IO · 2s coalescing window',
    does: [
      'Push file + agent events to all connected dashboards',
      'Coalesce burst traffic into ~2s windows',
      'Reconnect transparently across server restarts'
    ],
    doesNot: [
      'Send anywhere except connected localhost clients',
      'Authenticate (no users, single host)',
      'Buffer indefinitely — drops on slow consumers'
    ]
  },
  {
    role: 'Frontend',
    color: 'accent',
    tagline: 'Svelte 5 + Tailwind v4.',
    impl: 'Vite dev · single bundle in prod',
    does: [
      'Render dashboards from REST + Socket.IO',
      'Theme via CSS variables (light + dark)',
      'Stay read-only — no writes to your repo'
    ],
    doesNot: [
      'Phone home (no analytics, no error reporting)',
      'Require sign-in',
      'Touch any file outside its own bundle'
    ]
  }
];

export const OPERATION_STEPS = [
  {
    title: 'Watch',
    body: 'chokidar tails the working tree of every registered project; log watchers tail Claude Code, Codex, and Ollama session logs. Raven observes; it never edits or commits on your behalf.'
  },
  {
    title: 'Ingest',
    body: "Events are normalized into a common shape (agent, model, session, file, change_type, bytes) and persisted to SQLite. Binary files and lockfiles are skipped at the diff layer so the table doesn't bloat."
  },
  {
    title: 'Analyze',
    body: 'The trigger engine scores each event against a fixed rubric. The optional insights tier sends nuanced cases through a local Ollama model. Findings are append-only — nothing is ever overwritten.'
  },
  {
    title: 'Present',
    body: 'The Svelte UI renders dashboards, live timelines, and code-health views. Socket.IO pushes updates so what you see is always current. There is no caching layer between you and the truth.'
  }
];

export const RESOLVED_DECISIONS = [
  {
    q: 'Where do events live?',
    decision:
      'Local SQLite via better-sqlite3, single file under .raven/db/raven.db. WAL journal mode, auto_vacuum=incremental, 7-day retention sweep nightly. Full SQL is exposed for ad-hoc queries.',
    alternatives:
      'Postgres (overkill for single-host), Parquet (no live writes), event-stream service (cloud).',
    livesAt: 'backend/db.ts'
  },
  {
    q: 'Local-only or networked?',
    decision:
      "Bind to 127.0.0.1 by default. LAN exposure is opt-in via RAVEN_HOST=0.0.0.0; documented as 'you trust every host on the bound network.' Cloud is not on the roadmap.",
    alternatives: 'Per-instance API key, mTLS between dev machines, hosted aggregator.',
    livesAt: 'backend/server.ts'
  },
  {
    q: 'Auth on or off?',
    decision:
      'Off in dev (DISABLE_AUTH=true). Middleware is wired and ready for LAN/cloud deployments — flip the env var and provide a JWT secret.',
    alternatives:
      'Mandatory auth even on localhost (friction without payoff for single-user case).',
    livesAt: 'backend/middleware/security.ts'
  },
  {
    q: 'How do we capture diffs without bloating the DB?',
    decision:
      'shouldSkipDiff() filters binary extensions, __diffs__/__snapshots__/, and 9 lockfile basenames at the write path. Text diffs cap at 64 KB. Retention deletes + incremental vacuum reclaim space nightly.',
    alternatives:
      'Store full diffs (caused a 7 GB events table on a 6-day window before this fix).',
    livesAt: 'backend/utils/file-processing-helpers.js'
  },
  {
    q: 'How do we track Ollama inference?',
    decision:
      "Proxy /ollama → :11434 with telemetry interception. Tools point at Raven's port; we log every request without modifying upstream clients.",
    alternatives: 'Patch every client config (fragile), poll Ollama metrics (lossy).',
    livesAt: 'backend/routes/ollama-proxy.ts'
  },
  {
    q: 'How do we expose live system state?',
    decision:
      'On-demand introspection at /api/system/* — sqlite_master walks for the schema, nvidia-smi for the GPU, app router walk for endpoints. No background polling, no cached snapshots.',
    alternatives: 'Background metrics collector (extra cost when the page is closed).',
    livesAt: 'backend/routes/system.ts'
  },
  {
    q: 'How does the dark theme actually flip?',
    decision:
      'The dark class lives on <html>, not <body>. Tailwind v4 @theme aliases like --color-canvas: var(--bg) compile into :root, and CSS resolves var() at the declaring element — so the override has to be on :root too.',
    alternatives:
      'Body-scoped dark class (semantic utilities froze at the light hex; verified empirically across 31 routes).',
    livesAt: 'frontend/src/app.css'
  },
  {
    q: 'Single port or split frontend/backend?',
    decision:
      'Two ports in dev (Vite :9000 + Express :9100) for HMR; one binary in prod (Express serves the built static bundle).',
    alternatives: 'One Express in dev too (slower iteration, no HMR).',
    livesAt: 'bin/raven-npx.js · start.sh'
  }
];

export const STILL_OPEN = [
  {
    q: 'How do we roll up multiple hosts?',
    note: 'Each Raven instance is single-host today. A central aggregator is the obvious next step but the design tradeoffs (push vs pull, schema versioning, auth at the boundary) are unsettled. Parking until the demand signal is clearer.'
  },
  {
    q: 'Auto-generate decisions from git history?',
    note: 'This page is hand-curated. We could mine commit messages and PR descriptions for an "auto-decisions" track, but signal quality is unproven and a wrong-shape decision is worse than no decision.'
  },
  {
    q: 'How far do we push anomaly scoring?',
    note: 'Trigger rules cover the obvious cases. Per-agent baselining and learned thresholds are tempting but raise the question of how much state Raven should hold beyond raw events.'
  },
  {
    q: 'Native desktop or stay browser-served?',
    note: "Browser-served is fine today and avoids a Tauri/Electron build pipeline. A native shell would buy notifications and tray status, but the cost is real and the use case isn't yet."
  }
];

export const PRINCIPLES = [
  {
    name: 'Local-first, always',
    body: 'Inference, storage, and rendering run on your machine. There is no telemetry endpoint to disable, no credentials to manage, no remote service to trust.'
  },
  {
    name: 'Read-only on your code',
    body: 'Raven never edits files, runs commits, or kicks off automation. It is an observation layer; the agent it watches is the one doing the work.'
  },
  {
    name: 'Plain data',
    body: 'A single SQLite file is the source of truth. Inspect it with sqlite3, export it, back it up, or grep the schema — no opaque store.'
  },
  {
    name: 'Live or nothing',
    body: 'Numbers shown on screen reflect the current process. When data is stale, it is labelled. When a probe fails, the UI says so instead of pretending.'
  },
  {
    name: 'Single binary, single port',
    body: 'Production is one Node process listening on one port. No background daemons, no orchestration, no PATH manipulation. start, stop, restart are scripts.'
  },
  {
    name: 'Privacy by default',
    body: 'No analytics, no error reporting, no cloud sync. The footer GitHub link is the only network call Raven makes that is not yours to authorize.'
  }
];

export const MANIFEST = [
  { k: 'Created by', v: 'Seth Eheart' },
  { k: 'Version', v: '2.2.0' },
  { k: 'License', v: 'MIT' },
  { k: 'Source', v: 'github.com/seheart/raven', link: 'https://github.com/seheart/raven' }
];
