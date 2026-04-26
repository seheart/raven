<script>
  import { onMount } from 'svelte';
  import { logger } from '../logger.js';
  import { createPageApi } from '../apiClient.js';
  import { PageLayout, PageHeader } from '../components/layout/index.js';
  const { api, abort: abortRequests } = createPageApi();
  import { websocketService } from '../services/websocket.js';

  /** @type {{platform_label?:string, agent_count?:number, table_count?:number, endpoint_count?:number, uptime_seconds?:number}|null} */
  let intro = $state(null);
  let websocketConnected = $state(false);

  const VERSION = '2.2.0';
  const LICENSE = 'MIT';
  const SCOPE = 'Local · Host-Only';
  const SOURCE_URL = 'https://github.com/seheart/raven';

  const operation = [
    {
      title: 'Watch',
      body: 'chokidar tails Claude/Codex/Ollama session logs and the working tree. Raven observes; it never edits or commits on your behalf.'
    },
    {
      title: 'Ingest',
      body: 'Events are normalized, categorized, and persisted to a local SQLite database with full provenance — agent, model, session, file path, byte counts.'
    },
    {
      title: 'Analyze',
      body: 'Pattern detection and the trigger engine score each event for risk and surface anomalies; the self-analysis service grades the codebase against a fixed rubric.'
    },
    {
      title: 'Present',
      body: 'A Svelte UI renders dashboards, live timelines, and code-health views. Socket.IO pushes updates so what you see is always current.'
    }
  ];

  const resolvedDecisions = [
    {
      q: 'Where do events live?',
      decision: 'Local SQLite via better-sqlite3. One file, no daemon to install, full SQL available for ad-hoc queries.',
      lives_at: 'backend/db.ts'
    },
    {
      q: 'Local-only or networked?',
      decision: 'Bind to 127.0.0.1 by default. LAN exposure is opt-in; documented in the README with the assumption you trust every host on the bound network.',
      lives_at: 'backend/server.ts'
    },
    {
      q: 'Auth on or off?',
      decision: 'Off in dev (DISABLE_AUTH=true). The middleware is wired and ready to enable for LAN/cloud deployments.',
      lives_at: 'backend/middleware/security.ts'
    },
    {
      q: 'How do we track Ollama inference?',
      decision: 'Proxy /ollama → :11434 with telemetry interception. Tools point at the proxy; we log every request without modifying upstream clients.',
      lives_at: 'backend/routes/ollama-proxy.ts'
    },
    {
      q: 'How do we expose live system state?',
      decision: 'On-demand introspection at /api/system/* — sqlite_master walks for the schema, nvidia-smi for GPU, app router walk for endpoints. No background polling.',
      lives_at: 'backend/routes/system.ts'
    },
    {
      q: 'Single port or split frontend/backend?',
      decision: 'Two ports in dev (Vite + Express) for HMR; one port in prod (Express serves the built static bundle). Single binary at runtime.',
      lives_at: 'bin/raven-npx.js · start.sh'
    }
  ];

  const openQuestions = [
    {
      q: 'How do we roll up multiple hosts?',
      note: 'Each Raven instance is single-host today. A central aggregator is the obvious next step but the design tradeoffs (push vs pull, auth, schema versioning) are unsettled.'
    },
    {
      q: 'Auto-generate decisions from git history?',
      note: 'This page is hand-curated. We could mine commit messages and PR descriptions for an "auto-decisions" track, but signal quality is unproven.'
    },
    {
      q: 'How far do we push anomaly scoring?',
      note: 'Trigger rules cover the obvious cases. Per-agent baselining and learned thresholds are tempting but raise the question of how much state Raven should hold.'
    }
  ];

  const principles = [
    {
      name: 'Local-first, Always',
      body: 'Inference, storage, and rendering run on your machine. There is no telemetry endpoint to disable, no credentials to manage, no remote service to trust.'
    },
    {
      name: 'Read-only on Your Code',
      body: 'Raven never edits files, runs commits, or kicks off automation. It is an observation layer; the agent it watches is the one doing the work.'
    },
    {
      name: 'Plain Data',
      body: 'A single SQLite file is the source of truth. You can inspect it with the sqlite3 CLI, export it, back it up, or grep the schema — no opaque store.'
    },
    {
      name: 'Live or Nothing',
      body: 'Numbers shown on screen reflect the current process. When data is stale, it is labelled. When a probe fails, the UI says so instead of pretending.'
    },
    {
      name: 'Single Binary, Single Port',
      body: 'Production is one Node process listening on one port. No background daemons, no orchestration, no PATH manipulation. start, stop, and restart are scripts.'
    },
    {
      name: 'Privacy by Default',
      body: 'No analytics, no error reporting, no cloud sync. The footer GitHub link is the only network call Raven makes that is not yours to authorize.'
    }
  ];

  /** @param {number|null|undefined} s */
  function fmtUptime(s) {
    if (s == null) return '—';
    const sec = Math.floor(s);
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  async function loadAll() {
    try {
      intro = await api.get('/system/introspection');
    } catch (err) {
      logger.error('About page failed to load:', err);
    }
  }

  onMount(() => {
    loadAll();
    websocketConnected = websocketService.isConnected();
    const updateStatus = () => {
      websocketConnected = websocketService.isConnected();
    };
    websocketService.on('connect', updateStatus);
    websocketService.on('disconnect', updateStatus);
    return () => {
      abortRequests();
      websocketService.off('connect', updateStatus);
      websocketService.off('disconnect', updateStatus);
    };
  });
</script>

<PageLayout>
  <div class="space-y-10">
    <!-- Status bar -->
    <div class="flex items-center justify-between text-xs font-mono text-muted border-b border-border pb-2">
      <div class="flex items-center gap-2">
        <span class="text-accent font-semibold">RAVEN.SYSTEM</span>
        <span>::</span>
        <span class="uppercase tracking-wide">Resident Monitoring</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="w-1.5 h-1.5 rounded-full {websocketConnected ? 'bg-success animate-pulse' : 'bg-warning'}"></span>
        <span class="uppercase tracking-wide {websocketConnected ? 'text-success' : 'text-warning'}">
          {websocketConnected ? 'Operational' : 'Disconnected'}
        </span>
      </div>
    </div>

    <!-- Hero + metadata -->
    <div>
      <PageHeader title="Raven" />
      <div class="space-y-1.5 text-sm font-mono mt-4">
        {#each [
          { k: 'Version', v: VERSION },
          { k: 'License', v: LICENSE },
          { k: 'Scope', v: SCOPE },
          { k: 'Source', v: SOURCE_URL, link: SOURCE_URL }
        ] as row (row.k)}
          <div class="flex items-baseline gap-2">
            <span class="text-muted w-20 flex-shrink-0">{row.k}</span>
            <span class="flex-1 border-b border-dotted border-border mb-0.5"></span>
            {#if row.link}
              <a href={row.link} target="_blank" rel="noopener noreferrer" class="text-accent hover:underline">{row.v}</a>
            {:else}
              <span class="text-body">{row.v}</span>
            {/if}
          </div>
        {/each}
      </div>
    </div>

    <!-- 01 // Overview -->
    <section>
      <div class="text-xs font-mono text-muted uppercase tracking-widest mb-3 flex items-center gap-3">
        <span>01 // Overview</span>
        <span class="flex-1 border-t border-dashed border-border"></span>
      </div>
      <div class="space-y-3 text-sm text-body font-sans leading-relaxed">
        <p class="text-base">
          Raven is a resident monitor for AI coding agents — always on, always local. It watches what
          Claude, Codex, and local Ollama models do across your projects, persists the raw events,
          and renders dashboards in real time. The aim is to make the work legible, not to drive it.
        </p>
        <p>
          The data lives on the host. Source code does not travel. There are no telemetry endpoints
          to disable, no credentials to manage, no remote service to trust. The system continues to
          operate when the network does not.
        </p>
      </div>
      <div class="mt-4 bg-warning/10 border-l-4 border-warning rounded-r p-4">
        <div class="text-xs font-mono uppercase tracking-wide text-warning mb-1">! Security Model</div>
        <div class="text-sm text-body font-sans">
          No authentication in dev mode. Bind only to <code class="font-mono text-accent">127.0.0.1</code> unless every host on the bound network is trusted.
        </div>
      </div>
    </section>

    <!-- 02 // Operation -->
    <section>
      <div class="text-xs font-mono text-muted uppercase tracking-widest mb-3 flex items-center gap-3">
        <span>02 // Operation</span>
        <span class="flex-1 border-t border-dashed border-border"></span>
      </div>
      <div class="space-y-4">
        {#each operation as step, i (step.title)}
          <div class="flex gap-4">
            <div class="font-mono text-2xl font-bold text-accent w-12 flex-shrink-0">
              {String(i + 1).padStart(2, '0')}
            </div>
            <div class="flex-1 pt-1">
              <div class="text-sm font-semibold text-heading mb-1">{step.title}</div>
              <p class="text-sm text-body font-sans leading-relaxed">{step.body}</p>
            </div>
          </div>
        {/each}
      </div>
    </section>

    <!-- 03 // Telemetry -->
    <section>
      <div class="text-xs font-mono text-muted uppercase tracking-widest mb-3 flex items-center gap-3">
        <span>03 // System Telemetry</span>
        <span class="flex-1 border-t border-dashed border-border"></span>
        <span class="text-muted/60 normal-case">live</span>
      </div>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {#each [
          { label: 'Agents', value: intro?.agent_count },
          { label: 'Tables', value: intro?.table_count },
          { label: 'Endpoints', value: intro?.endpoint_count },
          { label: 'Uptime', value: fmtUptime(intro?.uptime_seconds) }
        ] as stat (stat.label)}
          <div class="bg-surface border border-border rounded-lg p-4">
            <div class="text-xs text-muted uppercase tracking-wide mb-2">{stat.label}</div>
            <div class="font-mono text-2xl font-bold text-body">{stat.value ?? '—'}</div>
          </div>
        {/each}
      </div>
    </section>

    <!-- 04 // Decisions -->
    <section>
      <div class="text-xs font-mono text-muted uppercase tracking-widest mb-3 flex items-center gap-3">
        <span>04 // Decisions</span>
        <span class="flex-1 border-t border-dashed border-border"></span>
      </div>
      <h3 class="text-sm font-semibold text-heading mb-2">Decisions made</h3>
      <p class="text-sm text-muted font-sans mb-4">
        The questions we walked through and the calls we made. Preserved as an audit trail — if a
        decision turns out wrong later, the original framing is still here.
      </p>
      <div class="space-y-3 mb-8">
        {#each resolvedDecisions as d, i (d.q)}
          <div class="bg-surface border border-border rounded-lg p-4">
            <div class="text-sm font-semibold text-accent mb-1">
              {i + 1}. {d.q}
            </div>
            <p class="text-sm text-body font-sans leading-relaxed mb-2">{d.decision}</p>
            <div class="text-xs font-mono text-muted">
              Lives at <code class="text-body">{d.lives_at}</code>
            </div>
          </div>
        {/each}
      </div>

      <h3 class="text-sm font-semibold text-heading mb-2">Still open</h3>
      <p class="text-sm text-muted font-sans mb-4">
        Items intentionally parked. Each has a clear shape and reason for the deferral.
      </p>
      <div class="space-y-3">
        {#each openQuestions as q (q.q)}
          <div class="bg-surface border border-dashed border-border rounded-lg p-4">
            <div class="text-sm font-semibold text-heading mb-1">{q.q}</div>
            <p class="text-sm text-body font-sans leading-relaxed">{q.note}</p>
          </div>
        {/each}
      </div>
    </section>

    <!-- 05 // Principles -->
    <section>
      <div class="text-xs font-mono text-muted uppercase tracking-widest mb-3 flex items-center gap-3">
        <span>05 // Principles</span>
        <span class="flex-1 border-t border-dashed border-border"></span>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        {#each principles as p, i (p.name)}
          <div class="bg-surface border border-border rounded-lg p-4">
            <div class="flex items-baseline justify-between gap-3 mb-2">
              <span class="text-sm font-semibold text-accent">{p.name}</span>
              <span class="text-xs font-mono text-muted">{String(i + 1).padStart(2, '0')}/0{principles.length}</span>
            </div>
            <p class="text-sm text-body font-sans leading-relaxed">{p.body}</p>
          </div>
        {/each}
      </div>
    </section>

    <!-- Manifest -->
    <section>
      <div class="text-xs font-mono text-muted uppercase tracking-widest mb-3 flex items-center gap-3">
        <span>06 // Manifest</span>
        <span class="flex-1 border-t border-dashed border-border"></span>
      </div>
      <div class="space-y-1.5 text-sm font-mono">
        {#each [
          { k: 'Created', v: 'Seth Eheart' },
          { k: 'Version', v: VERSION },
          { k: 'License', v: LICENSE },
          { k: 'Source', v: 'github.com/seheart/raven', link: SOURCE_URL }
        ] as row (row.k)}
          <div class="flex items-baseline gap-2">
            <span class="text-muted w-20 flex-shrink-0">{row.k}</span>
            <span class="flex-1 border-b border-dotted border-border mb-0.5"></span>
            {#if row.link}
              <a href={row.link} target="_blank" rel="noopener noreferrer" class="text-accent hover:underline">{row.v}</a>
            {:else}
              <span class="text-body">{row.v}</span>
            {/if}
          </div>
        {/each}
      </div>
    </section>
  </div>
</PageLayout>
