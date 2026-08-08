/**
 * Static content for the System page. Same pattern as content/about.js —
 * data lives here, the .svelte file iterates.
 */

export const HERO = {
  title: 'System',
  lede: 'A live, single-page reference to how Raven is built — from the data flow at the top, through the stack that runs it, to the SQLite shape and Express routes pulled at request time. Below the structure: the tool choices, implementation decisions, and quality gates that produced it.',
  badges: [
    {
      label: 'LOCAL-FIRST',
      items: ['All monitoring on this host', '0 outbound for monitoring', 'bound to 127.0.0.1']
    }
  ]
};

export const ARCHITECTURE = [
  {
    head: 'Watchers',
    body: 'chokidar tails the working tree; log watchers tail Claude / Codex / Ollama session logs.'
  },
  {
    head: 'Pipeline',
    body: 'Events are normalized, scored against a fixed rubric, and persisted to a single SQLite file.'
  },
  {
    head: 'API',
    body: 'Express + Socket.IO expose REST endpoints and live event streams to localhost.'
  },
  {
    head: 'Frontend',
    body: 'Svelte 5 renders dashboards, charts, alerts, code-health views — all read-only.'
  },
  { head: 'You', body: 'A single browser tab. Local-first, no cloud, runs on 127.0.0.1.' }
];

export const STACK_SECTIONS = [
  {
    title: 'Frontend',
    items: [
      {
        name: 'Svelte 5',
        role: 'UI framework with runes-based reactivity',
        url: 'https://svelte.dev'
      },
      { name: 'Vite', role: 'Dev server and build tool', url: 'https://vitejs.dev' },
      {
        name: 'Tailwind CSS 4',
        role: 'Utility-first styling on CSS variable tokens',
        url: 'https://tailwindcss.com'
      },
      {
        name: 'Chart.js',
        role: 'Time-series and breakdown charts',
        url: 'https://www.chartjs.org'
      },
      {
        name: 'Mermaid',
        role: 'Architecture diagrams (lazy-loaded on About)',
        url: 'https://mermaid.js.org'
      },
      {
        name: 'socket.io-client',
        role: 'Realtime updates from the backend',
        url: 'https://socket.io'
      },
      {
        name: 'DOMPurify',
        role: 'Sanitizes any rendered HTML',
        url: 'https://github.com/cure53/DOMPurify'
      }
    ]
  },
  {
    title: 'Backend',
    items: [
      { name: 'Node.js + TypeScript', role: 'Runtime and type-checked source for the API server' },
      { name: 'Express', role: 'HTTP routing and middleware', url: 'https://expressjs.com' },
      {
        name: 'Socket.IO',
        role: 'WebSocket transport pushing live events to the UI',
        url: 'https://socket.io'
      },
      {
        name: 'better-sqlite3',
        role: 'Synchronous SQLite driver — Raven stores everything locally',
        url: 'https://github.com/WiseLibs/better-sqlite3'
      },
      {
        name: 'chokidar',
        role: 'File watcher that picks up Claude session logs',
        url: 'https://github.com/paulmillr/chokidar'
      },
      {
        name: 'simple-git',
        role: 'Reads branch and status info shown in footer/overview',
        url: 'https://github.com/steveukx/git-js'
      },
      {
        name: 'winston',
        role: 'Structured server logs',
        url: 'https://github.com/winstonjs/winston'
      }
    ]
  },
  {
    title: 'Security & API',
    items: [
      {
        name: 'helmet',
        role: 'Sets safe-by-default HTTP headers',
        url: 'https://helmetjs.github.io'
      },
      { name: 'express-rate-limit', role: 'Per-route request limiting' },
      { name: 'cors / compression', role: 'Cross-origin handling and gzip on responses' },
      { name: 'jsonwebtoken', role: 'Token signing primitive (off in dev)' },
      { name: 'Swagger UI', role: 'Interactive API docs from JSDoc-annotated routes' }
    ]
  },
  {
    title: 'Testing & Quality',
    items: [
      { name: 'Vitest', role: 'Frontend unit tests', url: 'https://vitest.dev' },
      { name: 'Playwright', role: 'End-to-end browser tests', url: 'https://playwright.dev' },
      { name: 'Jest + Supertest', role: 'Backend unit and HTTP integration tests' },
      { name: 'ESLint + Prettier', role: 'Linting and formatting across JS, TS, Svelte' },
      { name: 'svelte-check + tsc', role: 'Type-checking for Svelte components and backend TS' },
      {
        name: 'validate-patterns.sh',
        role: 'Design-system governance — bans raw hex, raw h1/h2, scoped style blocks, and arbitrary tokens on migrated pages.'
      }
    ]
  }
];

export const PARAMETERS = [
  { label: 'Backend port', value: '9100' },
  { label: 'Frontend port (dev)', value: '9000' },
  { label: 'Bind host', value: '127.0.0.1 (RAVEN_HOST to override)' },
  { label: 'Database', value: '.raven/db/raven.db (SQLite, WAL)' },
  { label: 'Auto-vacuum', value: 'incremental — reclaims pages on retention sweep' },
  { label: 'Event retention', value: 'keep forever by default (RETENTION_EVENT_DAYS opts in)' },
  { label: 'Metrics retention', value: 'keep forever by default (RETENTION_METRICS_DAYS opts in)' },
  { label: 'Diff size cap', value: '64 KB per text-file change' },
  { label: 'Auth', value: 'None — loopback bind (127.0.0.1) is the boundary' },
  { label: 'WebSocket transport', value: 'Socket.IO — websocket + polling fallback' },
  { label: 'Agent-stats coalesce', value: '2s broadcast window + 2s memo' },
  { label: 'Insights model (default)', value: 'qwen2.5-coder:14b via local Ollama' }
];

export const PROVISIONING = {
  now: [
    { label: 'Live session monitoring (Claude Code, Codex, Ollama)' },
    { label: 'Code-health self-analysis with rubric scoring' },
    { label: 'Cost tracking and per-agent token rollups' },
    { label: 'Sub-agent orchestration trees' },
    { label: 'Pattern detection + trigger engine (rule-based, deterministic)' },
    { label: 'Insights tier — local LLM diff scoring with circuit breaker' },
    { label: 'Health monitor with alerting via Socket.IO' },
    { label: 'System & API introspection (this page)' },
    { label: 'Design system: tokens, layout primitives, ratcheted lint governance' },
    { label: 'About page with theme-aware Mermaid architecture diagram' }
  ],
  next: [
    {
      label: 'Inline diff scoring with per-line risk callouts',
      detail: 'Surface per-line model output alongside the existing per-file score.'
    },
    {
      label: 'Multi-machine roll-up',
      detail:
        'Aggregate sessions across hosts; design tradeoffs (push vs pull, schema versioning, auth at boundary) parked on the About page.'
    },
    {
      label: 'Plugin surface for custom triggers',
      detail: 'User-authored JS rules with a sandbox; opt-in only.'
    },
    {
      label: 'Native desktop shell (maybe)',
      detail:
        'Tauri or Electron buys notifications and tray status; cost is real, demand signal not yet there.'
    }
  ]
};

// === Tool Catalog ===
// Tiers group choices by purpose. Each tool carries a status (selected /
// backup / manual / excluded) and a short rationale.
export const TOOL_CATALOG = [
  {
    tier: 'Runtime & data',
    color: 'accent',
    blurb:
      'What runs the server and where events live. Single-process, single-file, single-host: every choice in this tier defends that property.',
    tools: [
      {
        name: 'better-sqlite3',
        provider: 'WiseLibs',
        status: 'selected',
        cost: 'free',
        license: 'MIT',
        bestFor: 'Synchronous, in-process SQL with WAL + auto_vacuum',
        notes: 'No async overhead, no connection pool to manage, no daemon to install.'
      },
      {
        name: 'sqlite (CLI)',
        provider: 'SQLite team',
        status: 'manual',
        cost: 'free',
        license: 'public domain',
        bestFor: 'Ad-hoc queries against the live DB',
        notes: 'Available on every system — exposes the underlying file directly.'
      },
      {
        name: 'PostgreSQL',
        provider: 'PostgreSQL Global',
        status: 'excluded',
        cost: 'free',
        license: 'PostgreSQL',
        bestFor: 'Multi-process, multi-host backends',
        notes:
          'Overkill for a single-host monitor; introduces a second daemon and an ops surface Raven actively avoids.',
        reason: 'Single-host scope makes a separate database service pure cost.'
      },
      {
        name: 'Express',
        provider: 'OpenJS Foundation',
        status: 'selected',
        cost: 'free',
        license: 'MIT',
        bestFor: 'Mature HTTP routing with broad middleware ecosystem',
        notes:
          'Most monitoring middleware (helmet, rate-limit, compression) ships first-class for Express.'
      },
      {
        name: 'Fastify',
        provider: 'Fastify',
        status: 'excluded',
        cost: 'free',
        license: 'MIT',
        bestFor: 'High-throughput JSON APIs',
        notes:
          "Faster on paper, but Raven's load profile (a couple of dashboards) is far below the inflection where it matters.",
        reason: 'Express ecosystem fit > marginal throughput at this scale.'
      }
    ]
  },
  {
    tier: 'Realtime',
    color: 'success',
    blurb: 'How live events get pushed to the dashboard without polling.',
    tools: [
      {
        name: 'Socket.IO',
        provider: 'OpenJS Foundation',
        status: 'selected',
        cost: 'free',
        license: 'MIT',
        bestFor: 'Auto-reconnect, transport fallback, room broadcasts',
        notes:
          'Reconnection across server restarts is free; the cost is a slightly heavier wire format than raw WS.'
      },
      {
        name: 'Native WebSocket',
        provider: 'browser API',
        status: 'backup',
        cost: 'free',
        license: 'spec',
        bestFor: 'Bandwidth-sensitive deployments',
        notes: 'Available if Socket.IO ever becomes a constraint; not currently warranted.'
      },
      {
        name: 'Server-Sent Events',
        provider: 'spec',
        status: 'excluded',
        cost: 'free',
        license: 'spec',
        bestFor: 'One-way server→client streams',
        notes:
          'Lighter than Socket.IO but no client→server channel; would need a parallel POST path for any control surface.',
        reason: 'Socket.IO covers both directions in one transport.'
      }
    ]
  },
  {
    tier: 'Frontend',
    color: 'info',
    blurb:
      'How the dashboard is built. Bundle weight, theme support, and componentization were the load-bearing requirements.',
    tools: [
      {
        name: 'Svelte 5',
        provider: 'Svelte team',
        status: 'selected',
        cost: 'free',
        license: 'MIT',
        bestFor: 'Compile-time reactivity, small bundle, runes API',
        notes:
          'Smallest dashboard bundle in the field; runes ($state, $derived, $props) replaced the Svelte-store boilerplate.'
      },
      {
        name: 'React',
        provider: 'Meta',
        status: 'excluded',
        cost: 'free',
        license: 'MIT',
        bestFor: 'Mainstream component ecosystem',
        notes:
          'Larger runtime + reconciliation overhead, and the ecosystem mostly assumes a server you do not have.',
        reason: 'Svelte gives the same DX with a much smaller surface for a single-host app.'
      },
      {
        name: 'Tailwind CSS 4',
        provider: 'Tailwind Labs',
        status: 'selected',
        cost: 'free',
        license: 'MIT',
        bestFor: 'Utility-first styling on CSS-variable design tokens',
        notes:
          '@theme block compiles design tokens into CSS variables; the dark class lives on <html> so the aliases resolve at :root.'
      },
      {
        name: 'Chart.js',
        provider: 'Chart.js team',
        status: 'selected',
        cost: 'free',
        license: 'MIT',
        bestFor: 'Common time-series + breakdown charts with theme observers',
        notes: 'Canvas-rendered; pages observe documentElement class to redraw on theme flip.'
      },
      {
        name: 'D3',
        provider: 'D3 contributors',
        status: 'manual',
        cost: 'free',
        license: 'ISC',
        bestFor: 'Bespoke visualization beyond Chart.js primitives',
        notes: 'Available; would only show up if a chart truly needs custom geometry.'
      },
      {
        name: 'Mermaid',
        provider: 'Mermaid contributors',
        status: 'selected',
        cost: 'free',
        license: 'MIT',
        bestFor: 'Architecture flowcharts in docs',
        notes: 'Lazy-loaded only when an about-class page renders; ~1 MB chunk avoided elsewhere.'
      }
    ]
  },
  {
    tier: 'Quality gates',
    color: 'warning',
    blurb:
      'Linters, formatters, type-checkers, validators. Runs locally via the pre-commit hook AND in CI on every push — bypass via --no-verify is caught by CI.',
    tools: [
      {
        name: 'ESLint',
        provider: 'OpenJS Foundation',
        status: 'selected',
        cost: 'free',
        license: 'MIT',
        bestFor: 'JS / TS / Svelte linting with one config tree',
        notes: 'svelte-eslint-parser handles .svelte; rules cover both frontend and backend.'
      },
      {
        name: 'Prettier',
        provider: 'Prettier contributors',
        status: 'selected',
        cost: 'free',
        license: 'MIT',
        bestFor: 'Auto-formatting with no debate',
        notes: 'Applied via lint-staged on commit.'
      },
      {
        name: 'svelte-check',
        provider: 'Svelte team',
        status: 'selected',
        cost: 'free',
        license: 'MIT',
        bestFor: 'Type-check + reactivity warnings inside Svelte files',
        notes: 'Catches state_referenced_locally and other Svelte 5 runes mistakes at CI time.'
      },
      {
        name: 'tsc --noEmit',
        provider: 'Microsoft',
        status: 'selected',
        cost: 'free',
        license: 'Apache 2.0',
        bestFor: 'Type-checking the backend without producing output',
        notes: 'Backend ships compiled JS; tsc is the type-only gate.'
      },
      {
        name: 'validate-patterns.sh',
        provider: 'in-tree',
        status: 'selected',
        cost: 'free',
        license: 'MIT',
        bestFor: 'Ratcheted design-system enforcement on migrated pages',
        notes:
          'Bans raw <h1>/<h2>, scoped <style> blocks, raw hex (without allow comment), arbitrary tokens. Only applies to pages that import PageLayout.'
      },
      {
        name: 'check-design-system-coverage.sh',
        provider: 'in-tree',
        status: 'selected',
        cost: 'free',
        license: 'MIT',
        bestFor: 'Ensures every ui/ primitive is referenced by DesignSystemPage',
        notes: "Stops primitives from going dark — if it's not on the design page, it gets caught."
      },
      {
        name: 'Biome',
        provider: 'Biome team',
        status: 'excluded',
        cost: 'free',
        license: 'MIT',
        bestFor: 'Faster lint + format than ESLint + Prettier',
        notes:
          'Tempting, but the .svelte tooling story is still maturing; lock-in cost not worth the speed yet.',
        reason: 'ESLint/Prettier ecosystem fit for Svelte > Biome speed today.'
      }
    ]
  },
  {
    tier: 'Optional services',
    color: 'warning',
    blurb: 'Extras Raven uses if available; degrades gracefully if not.',
    tools: [
      {
        name: 'Ollama',
        provider: 'Ollama',
        status: 'selected',
        cost: 'free',
        license: 'MIT',
        bestFor: 'Local LLM inference for diff risk scoring + insights',
        notes:
          'Auto-detects installed models; circuit-breaker trips after repeated failures so a flaky local install never blocks the rest.'
      },
      {
        name: 'qwen2.5-coder',
        provider: 'Alibaba',
        status: 'selected',
        cost: 'free',
        license: 'Apache 2.0',
        bestFor: 'Default insights model — strong on code, fits 12GB VRAM',
        notes: 'Smaller variants (7b) run faster; 14b is the default trade-off.'
      },
      {
        name: 'Anthropic API',
        provider: 'Anthropic',
        status: 'manual',
        cost: 'pay-per-token',
        license: 'Anthropic ToS',
        bestFor: 'Cloud LLM for cases where local quality is insufficient',
        notes:
          'Wired via env var; off by default. Source code is not sent — only synthesized event metadata.'
      }
    ]
  }
];

export const SYSTEM_DECISIONS = [
  {
    head: 'better-sqlite3 (synchronous) over async drivers',
    body: 'Single-process server with predictable load. Synchronous queries simplify error handling and let prepared statements drop into hot loops without await ceremony. Async drivers buy nothing here.'
  },
  {
    head: 'Theme class on <html>, not <body>',
    body: "Tailwind v4's @theme block compiles aliases like --color-canvas: var(--bg) into :root. CSS resolves var() at the declaring element — putting the override on <body> leaves the alias frozen at the light value. Verified empirically across 31 routes."
  },
  {
    head: 'Skip-diff filter at the write path',
    body: 'shouldSkipDiff() screens binary extensions, lockfiles, and visual-test PNG dirs before any diff is generated. Text diffs cap at 64 KB. Without this, lockfile churn and PNG diffs grew the events table to 7.5 GB on a 6-day window.'
  },
  {
    head: 'Incremental vacuum after retention sweep',
    body: 'auto_vacuum=INCREMENTAL + a PRAGMA incremental_vacuum at the end of the nightly retention sweep. Reclaims pages back to the OS so the file shrinks instead of just emptying.'
  },
  {
    head: 'Memo getAgentStats() for 2 s on the DB class',
    body: 'Both the Socket.IO broadcast and the /api/agent-stats route hit a full GROUP BY agent_events. 2 s of staleness is invisible; the duplicate scan was not. Cache lives on the RavenDB instance so both callers share.'
  },
  {
    head: 'Coalesce SSE broadcasts to 2 s windows',
    body: 'Telemetry events arrive faster than dashboards can repaint. AGENT_STATS_BROADCAST_MS smooths burst traffic without making the UI feel stale; the user-visible cadence stays under perception.'
  },
  {
    head: 'Inline-script theme bootstrap before the bundle paints',
    body: "An inline <script> in index.html reads localStorage and applies the dark class to <html> synchronously, before Vite's bundle hydrates Svelte. Eliminates the flash of light theme on every page load for dark-mode users."
  },
  {
    head: 'Ratcheted design-system governance',
    body: "validate-patterns.sh only enforces design rules on pages that import PageLayout. Legacy pages don't block CI but cannot regress once migrated. Adding <style> or raw hex to a migrated page fails the build."
  }
];

export const GOVERNANCE = {
  gates: [
    {
      name: 'ESLint',
      what: 'JS / TS / Svelte lint',
      where: 'pre-commit + CI',
      config: 'eslint.config.js'
    },
    {
      name: 'Prettier',
      what: 'Formatting via lint-staged',
      where: 'pre-commit',
      config: '.prettierrc.json'
    },
    {
      name: 'svelte-check',
      what: 'Svelte 5 runes + reactivity validation',
      where: 'manual + CI (via build)',
      config: 'jsconfig.json'
    },
    {
      name: 'tsc --noEmit',
      what: 'Backend TypeScript type-check',
      where: 'pre-build',
      config: 'backend/tsconfig.json'
    },
    {
      name: 'Vitest',
      what: 'Frontend unit tests',
      where: 'pre-commit + CI',
      config: 'frontend/package.json'
    },
    {
      name: 'Jest + Supertest',
      what: 'Backend unit + HTTP integration tests',
      where: 'CI',
      config: 'backend/jest.config.js'
    },
    {
      name: 'Playwright',
      what: 'End-to-end browser tests',
      where: 'manual',
      config: 'playwright.config.js'
    },
    {
      name: 'validate-patterns.sh',
      what: 'Design-system ratchet on migrated pages',
      where: 'manual + CI',
      config: 'frontend/scripts/validate-patterns.sh'
    },
    {
      name: 'check-design-system-coverage.sh',
      what: 'All ui/ primitives reachable from DesignSystemPage',
      where: 'manual + CI',
      config: 'frontend/scripts/check-design-system-coverage.sh'
    }
  ],
  dsRules: [
    {
      name: 'no-raw-h1-h2',
      kind: 'Forbids raw <h1>/<h2> on migrated pages',
      fix: 'Use <PageHeader> / <PageSection title>'
    },
    {
      name: 'no-style-blocks',
      kind: 'Forbids <style> blocks on migrated pages',
      fix: 'Lift to lib/styles/animations.css or compose with Tailwind'
    },
    {
      name: 'no-arbitrary-tokens',
      kind: 'Forbids text-[var(--…)] arbitrary syntax',
      fix: 'Use semantic utilities (text-heading, bg-surface, …)'
    },
    {
      name: 'no-raw-hex',
      kind: 'Forbids raw #hex literals (except brand colors with allow comment)',
      fix: 'Use design tokens or annotate with // design-system-allow: hex (vendor brand colors)'
    },
    {
      name: 'page-layout-wrap',
      kind: 'Migrated pages must wrap in <PageLayout>',
      fix: 'Import from lib/components/layout'
    }
  ],
  ci: [
    { job: 'lint (frontend)', what: 'eslint . over the entire frontend tree' },
    { job: 'build (frontend)', what: 'vite build — proves the bundle still compiles' },
    { job: 'test (frontend)', what: 'vitest run on lib/__tests__/' },
    { job: 'test (backend)', what: 'jest with coverage; runs serial under --runInBand' },
    { job: 'upload-artifact', what: 'Backend coverage uploaded as an artifact' }
  ],
  tests: [
    {
      path: 'frontend/src/lib/__tests__/',
      what: 'Vitest — apiClient, formatUtils, numberFormat, createPageApi'
    },
    {
      path: 'backend/__tests__/',
      what: 'Jest + Supertest — services, routes, integration, websocket-resilience'
    },
    { path: 'e2e/', what: 'Playwright — full-stack browser tests (manual run)' },
    { path: 'tests/', what: 'Cross-cutting integration tests' }
  ],
  devTools: [
    {
      name: './start.sh',
      what: 'Cleans ports, builds backend if needed, launches both servers, warms cache, prints URLs'
    },
    { name: './stop.sh', what: 'Stops backend + frontend, cleans up PIDs' },
    { name: './restart.sh', what: 'stop + start in one shot' },
    { name: './start-fast.sh', what: 'Same as start but skips cache warming (~5 s vs ~30 s)' },
    {
      name: 'bin/raven-npx.js',
      what: 'npx-friendly launcher; serves the built bundle in production mode'
    },
    {
      name: 'scripts/check-metrics-health.sh',
      what: 'Probes the metrics surface for non-zero readings'
    },
    { name: 'scripts/nightly-test-run.sh', what: 'Runs the full test suite with reporting' }
  ],
  docs: [
    { path: 'README.md', what: 'Top-level — install, quick start, screenshots' },
    { path: 'frontend/README.md', what: 'Frontend dev workflow + design system overview' },
    { path: 'backend/README.md', what: 'Backend services, routes, retention, telemetry' },
    {
      path: 'frontend/src/lib/components/layout/README.md',
      what: 'Layout primitives — when to use each'
    },
    { path: 'docs/README.md', what: 'Architecture notes, deeper dives' },
    { path: 'e2e/README.md', what: 'Playwright run instructions' },
    { path: 'CLAUDE.md', what: 'Repository conventions for AI agents working on Raven' }
  ],
  invoke: {
    summary: 'How to run the gates locally',
    body: 'From frontend/: npm run validate runs lint + lint:css + validate:patterns + validate:design-coverage. From backend/: npm run lint && npm test. The pre-commit hook runs lint-staged automatically; CI runs the full matrix on every push and PR via .github/workflows/ci.yml.'
  }
};
