<script>
  import { onMount } from 'svelte';
  import { createPageApi } from '../apiClient.js';
  const { api } = createPageApi();

  /** @type {any} */
  let intro = $state(null);
  /** @type {Array<{name:string,row_count:number,columns:string[]}>} */
  let tables = $state([]);
  /** @type {Array<{methods:string[],path:string,summary:string}>} */
  let routes = $state([]);
  /** @type {any} */
  let hardware = $state(null);
  /** @type {Array<{name:string,size_gb:number|null,params:string|null,quantization:string|null,family:string|null,fit:string}>} */
  let models = $state([]);
  /** @type {{usable_vram_gib:number|null, vram_total_gib:number|null}} */
  let modelsMeta = $state({ usable_vram_gib: null, vram_total_gib: null });
  /** @type {string|null} */
  let loadError = $state(null);

  onMount(async () => {
    try {
      const [introRes, tablesRes, routesRes, hwRes, modelsRes] = await Promise.allSettled([
        api.get('/system/introspection'),
        api.get('/system/tables'),
        api.get('/system/routes'),
        api.get('/system/hardware'),
        api.get('/system/models')
      ]);
      if (introRes.status === 'fulfilled') intro = introRes.value;
      if (tablesRes.status === 'fulfilled') tables = tablesRes.value.tables || [];
      if (routesRes.status === 'fulfilled') routes = routesRes.value.routes || [];
      if (hwRes.status === 'fulfilled') hardware = hwRes.value;
      if (modelsRes.status === 'fulfilled') {
        models = modelsRes.value.models || [];
        modelsMeta = {
          usable_vram_gib: modelsRes.value.usable_vram_gib,
          vram_total_gib: modelsRes.value.vram_total_gib
        };
      }
    } catch (err) {
      loadError = err instanceof Error ? err.message : String(err);
    }
  });

  // -------- Static content (edit here as the project evolves) --------

  const stackSections = [
    {
      title: 'Frontend',
      items: [
        { name: 'Svelte 5', role: 'UI framework with runes-based reactivity', url: 'https://svelte.dev' },
        { name: 'Vite', role: 'Dev server and build tool', url: 'https://vitejs.dev' },
        { name: 'Tailwind CSS 4', role: 'Utility-first styling on CSS variable tokens', url: 'https://tailwindcss.com' },
        { name: 'Chart.js', role: 'Time-series and breakdown charts', url: 'https://www.chartjs.org' },
        { name: 'socket.io-client', role: 'Realtime updates from the backend', url: 'https://socket.io' },
        { name: 'DOMPurify', role: 'Sanitizes any rendered HTML', url: 'https://github.com/cure53/DOMPurify' }
      ]
    },
    {
      title: 'Backend',
      items: [
        { name: 'Node.js + TypeScript', role: 'Runtime and type-checked source for the API server' },
        { name: 'Express', role: 'HTTP routing and middleware', url: 'https://expressjs.com' },
        { name: 'Socket.IO', role: 'WebSocket transport pushing live events to the UI', url: 'https://socket.io' },
        { name: 'better-sqlite3', role: 'Synchronous SQLite driver — Raven stores everything locally', url: 'https://github.com/WiseLibs/better-sqlite3' },
        { name: 'chokidar', role: 'File watcher that picks up Claude session logs', url: 'https://github.com/paulmillr/chokidar' },
        { name: 'simple-git', role: 'Reads branch and status info shown in footer/overview', url: 'https://github.com/steveukx/git-js' },
        { name: 'winston', role: 'Structured server logs', url: 'https://github.com/winstonjs/winston' }
      ]
    },
    {
      title: 'Security & API',
      items: [
        { name: 'helmet', role: 'Sets safe-by-default HTTP headers', url: 'https://helmetjs.github.io' },
        { name: 'express-rate-limit', role: 'Per-route request limiting' },
        { name: 'cors / compression', role: 'Cross-origin handling and gzip on responses' },
        { name: 'joi', role: 'Request payload validation', url: 'https://joi.dev' },
        { name: 'jsonwebtoken + bcryptjs', role: 'Token signing and password hashing primitives' },
        { name: 'Swagger UI', role: 'Interactive API docs from JSDoc-annotated routes' },
        { name: 'prom-client', role: 'Prometheus-compatible metrics endpoint' }
      ]
    },
    {
      title: 'Testing & Quality',
      items: [
        { name: 'Vitest', role: 'Frontend unit tests', url: 'https://vitest.dev' },
        { name: 'Playwright', role: 'End-to-end browser tests', url: 'https://playwright.dev' },
        { name: 'Jest + Supertest', role: 'Backend unit and HTTP integration tests' },
        { name: 'Storybook', role: 'Component workshop and visual regression sandbox', url: 'https://storybook.js.org' },
        { name: 'ESLint + Prettier', role: 'Linting and formatting across JS, TS, Svelte' },
        { name: 'svelte-check + tsc', role: 'Type-checking for Svelte components and backend TS' }
      ]
    }
  ];

  const architecture = [
    { head: 'Watchers', body: 'chokidar tails Claude/Codex/Ollama session logs and the working tree.' },
    { head: 'Pipeline', body: 'Events are normalized, categorized, scored, and persisted in SQLite.' },
    { head: 'API', body: 'Express + Socket.IO expose REST endpoints and live event streams.' },
    { head: 'Frontend', body: 'Svelte 5 renders dashboards; charts, alerts, code-health views.' },
    { head: 'You', body: 'A single browser tab — local-first, no cloud, runs on localhost.' }
  ];

  const parameters = [
    { label: 'Backend port', value: '9100' },
    { label: 'Frontend port (dev)', value: '9000' },
    { label: 'Database', value: 'SQLite (local file)' },
    { label: 'Auth (dev)', value: 'Disabled — bound to localhost' },
    { label: 'Retention', value: 'Unlimited (manual prune)' },
    { label: 'WebSocket transport', value: 'Socket.IO (polling + WS upgrade)' }
  ];

  const provisioning = {
    now: [
      { label: 'Live session monitoring (Claude, Codex, Ollama)' },
      { label: 'Code-health self-analysis' },
      { label: 'Cost tracking and per-agent breakdowns' },
      { label: 'Sub-agent orchestration trees' },
      { label: 'Pattern detection + trigger engine' },
      { label: 'Health monitor with alerting' },
      { label: 'System & API introspection (this page)' }
    ],
    next: [
      { label: 'Inline diff scoring & risk annotations', detail: 'Per-file scoring with per-line callouts.' },
      { label: 'Multi-machine roll-up', detail: 'Aggregate sessions across hosts.' },
      { label: 'Decision audit trail', detail: 'Structured decision log feeding the About page.' },
      { label: 'Plugin surface for custom triggers', detail: 'User-authored JS rules with a sandbox.' }
    ]
  };

  // -------- Helpers --------

  /** @param {number|null|undefined} n */
  function fmtGiB(n) {
    if (n == null) return '—';
    return `${n.toFixed(1)} GiB`;
  }
  /** @param {number|null|undefined} s */
  function fmtUptime(s) {
    if (s == null) return '—';
    const sec = Math.floor(s);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const r = sec % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${r}s`;
    return `${r}s`;
  }
  /** @param {string} method */
  function methodBadgeClass(method) {
    switch (method) {
      case 'GET':
        return 'bg-[var(--info)]/15 text-[var(--info)]';
      case 'POST':
        return 'bg-[var(--success)]/15 text-[var(--success)]';
      case 'PUT':
      case 'PATCH':
        return 'bg-[var(--warning)]/15 text-[var(--warning)]';
      case 'DELETE':
        return 'bg-[var(--error)]/15 text-[var(--error)]';
      default:
        return 'bg-[var(--surface-2,var(--surface))] text-[var(--muted)]';
    }
  }
  /** @param {string} fit */
  function fitBadgeClass(fit) {
    switch (fit) {
      case 'fits':
        return 'bg-[var(--success)]/15 text-[var(--success)]';
      case 'tight':
        return 'bg-[var(--warning)]/15 text-[var(--warning)]';
      case 'overflow':
        return 'bg-[var(--error)]/15 text-[var(--error)]';
      default:
        return 'bg-[var(--surface-2,var(--surface))] text-[var(--muted)]';
    }
  }
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-none space-y-8">
    <!-- Header -->
    <header>
      <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">System</h1>
      <p class="text-sm text-[var(--muted)] font-sans">
        How Raven is built and how the running instance looks right now — stack, schema, routes,
        hardware, and decisions.
      </p>
    </header>

    {#if loadError}
      <div class="bg-[var(--error)]/10 border border-[var(--error)]/30 text-[var(--error)] rounded-lg p-3 text-sm">
        Failed to load system data: {loadError}
      </div>
    {/if}

    <!-- Metadata bar -->
    <section class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-3 text-sm font-mono">
        {#each [
          { k: 'Platform', v: intro?.platform_label },
          { k: 'Agents', v: intro?.agent_count },
          { k: 'Tables', v: intro?.table_count },
          { k: 'Endpoints', v: intro?.endpoint_count },
          { k: 'Uptime', v: fmtUptime(intro?.uptime_seconds) },
          { k: 'PID', v: intro?.pid }
        ] as row (row.k)}
          <div class="flex flex-col gap-0.5">
            <span class="text-[var(--muted)] uppercase tracking-wide">{row.k}</span>
            <span class="text-[var(--text)] truncate" title={row.v ?? '—'}>{row.v ?? '—'}</span>
          </div>
        {/each}
      </div>
    </section>

    <!-- Architecture flow -->
    <section>
      <h2 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-3">
        Architecture
      </h2>
      <div class="flex flex-wrap gap-2 items-stretch">
        {#each architecture as box, i (box.head)}
          <div class="flex items-stretch gap-2 flex-1 min-w-[180px]">
            <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 flex-1">
              <div class="font-mono text-sm font-semibold text-[var(--accent)] mb-1">
                {box.head}
              </div>
              <div class="text-sm text-[var(--muted)] font-sans leading-relaxed">{box.body}</div>
            </div>
            {#if i < architecture.length - 1}
              <div class="flex items-center text-[var(--muted)] font-mono text-lg select-none">
                →
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </section>

    <!-- Stack -->
    <section>
      <h2 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-3">Stack</h2>
      <div class="space-y-4">
        {#each stackSections as section (section.title)}
          <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
            <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-4">
              {section.title}
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              {#each section.items as item (item.name)}
                <div class="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 border-b border-[var(--border)] pb-2 last:border-b-0 last:pb-0">
                  <div class="font-mono text-[var(--text)] sm:w-44 sm:flex-shrink-0">
                    {#if item.url}
                      <a href={item.url} target="_blank" rel="noopener noreferrer" class="text-[var(--accent)] hover:underline">{item.name}</a>
                    {:else}
                      {item.name}
                    {/if}
                  </div>
                  <div class="text-[var(--muted)] font-sans flex-1">{item.role}</div>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </section>

    <!-- Data Model -->
    <section>
      <h2 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-3">
        Data Model <span class="text-[var(--muted)]/60 font-normal">· live ({tables.length} tables)</span>
      </h2>
      {#if tables.length === 0}
        <div class="text-sm text-[var(--muted)] italic">Loading…</div>
      {:else}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          {#each tables as t (t.name)}
            <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3">
              <div class="flex items-baseline justify-between gap-3 mb-2">
                <span class="font-mono text-sm text-[var(--accent)]">{t.name}</span>
                <span class="text-xs font-mono text-[var(--muted)]">{t.row_count.toLocaleString()} rows</span>
              </div>
              <div class="text-sm font-mono text-[var(--muted)] leading-relaxed break-words">
                {t.columns.join(' · ')}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <!-- Public API -->
    <section>
      <h2 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-3">
        Public API <span class="text-[var(--muted)]/60 font-normal">· live ({routes.length} endpoints)</span>
      </h2>
      {#if routes.length === 0}
        <div class="text-sm text-[var(--muted)] italic">Loading…</div>
      {:else}
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
          <div class="max-h-96 overflow-y-auto">
            <table class="w-full text-sm">
              <thead class="bg-[var(--bg)] sticky top-0 z-10">
                <tr class="text-xs text-[var(--muted)] uppercase tracking-wide">
                  <th class="text-left font-semibold px-4 py-2 w-20">Method</th>
                  <th class="text-left font-semibold px-4 py-2">Path</th>
                  <th class="text-left font-semibold px-4 py-2 hidden md:table-cell">Summary</th>
                </tr>
              </thead>
              <tbody>
                {#each routes as r (r.methods.join(',') + r.path)}
                  <tr class="border-t border-[var(--border)]">
                    <td class="px-4 py-1.5">
                      {#each r.methods as m}
                        <span class="inline-block text-[10px] font-mono font-bold px-1.5 py-0.5 rounded {methodBadgeClass(m)} mr-1">{m}</span>
                      {/each}
                    </td>
                    <td class="px-4 py-1.5 font-mono text-[var(--text)] break-all">{r.path}</td>
                    <td class="px-4 py-1.5 text-[var(--muted)] hidden md:table-cell">{r.summary}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      {/if}
    </section>

    <!-- Parameters -->
    <section>
      <h2 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-3">Parameters</h2>
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          {#each parameters as p (p.label)}
            <div class="flex justify-between gap-3 border-b border-[var(--border)] pb-2 last:border-b-0 last:pb-0">
              <span class="text-[var(--muted)]">{p.label}</span>
              <span class="font-mono text-[var(--text)] text-right">{p.value}</span>
            </div>
          {/each}
        </div>
      </div>
    </section>

    <!-- Hardware Capacity -->
    <section>
      <h2 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-3">
        Hardware Capacity <span class="text-[var(--muted)]/60 font-normal">· live</span>
      </h2>
      {#if !hardware}
        <div class="text-sm text-[var(--muted)] italic">Loading…</div>
      {:else}
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
            <div class="text-xs text-[var(--muted)] uppercase tracking-wide mb-1">CPU</div>
            <div class="font-mono text-sm text-[var(--text)] break-words leading-tight">{hardware.cpu}</div>
            <div class="text-xs text-[var(--muted)] mt-1">{hardware.cores} threads</div>
          </div>
          <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
            <div class="text-xs text-[var(--muted)] uppercase tracking-wide mb-1">RAM</div>
            <div class="font-mono text-lg text-[var(--text)]">{fmtGiB(hardware.ram_gib)}</div>
            <div class="text-xs text-[var(--muted)] mt-1">{fmtGiB(hardware.ram_free_gib)} free</div>
          </div>
          <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
            <div class="text-xs text-[var(--muted)] uppercase tracking-wide mb-1">GPU</div>
            <div class="font-mono text-sm text-[var(--text)] break-words leading-tight">{hardware.gpu ?? '—'}</div>
            <div class="text-xs text-[var(--muted)] mt-1">
              {hardware.vram_total_gib != null ? `${fmtGiB(hardware.vram_total_gib)} total · ${fmtGiB(hardware.vram_free_gib)} free` : 'no nvidia-smi'}
            </div>
          </div>
          <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
            <div class="text-xs text-[var(--muted)] uppercase tracking-wide mb-1">Disk</div>
            <div class="font-mono text-lg text-[var(--text)]">{fmtGiB(hardware.disk_total_gib)}</div>
            <div class="text-xs text-[var(--muted)] mt-1">{fmtGiB(hardware.disk_free_gib)} free</div>
          </div>
        </div>
        <div class="mt-3 text-xs font-mono text-[var(--muted)] leading-relaxed">
          {hardware.os} · kernel {hardware.kernel} · arch {hardware.arch}{hardware.vram_usable_gib != null ? ` · ~${fmtGiB(hardware.vram_usable_gib)} usable VRAM for models` : ''}
        </div>
      {/if}
    </section>

    <!-- Installed Models -->
    {#if models.length > 0}
      <section>
        <h2 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-3">
          Installed Models <span class="text-[var(--muted)]/60 font-normal">· live ({models.length})</span>
        </h2>
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
          <table class="w-full text-sm">
            <thead class="bg-[var(--bg)]">
              <tr class="text-xs text-[var(--muted)] uppercase tracking-wide">
                <th class="text-left font-semibold px-4 py-2">Fit</th>
                <th class="text-left font-semibold px-4 py-2">Model</th>
                <th class="text-left font-semibold px-4 py-2 hidden md:table-cell">Size</th>
                <th class="text-left font-semibold px-4 py-2 hidden md:table-cell">Params</th>
                <th class="text-left font-semibold px-4 py-2 hidden md:table-cell">Quant</th>
              </tr>
            </thead>
            <tbody>
              {#each models as m (m.name)}
                <tr class="border-t border-[var(--border)]">
                  <td class="px-4 py-1.5">
                    <span class="inline-block text-[10px] font-mono font-bold px-1.5 py-0.5 rounded uppercase {fitBadgeClass(m.fit)}">{m.fit}</span>
                  </td>
                  <td class="px-4 py-1.5 font-mono text-[var(--text)]">{m.name}</td>
                  <td class="px-4 py-1.5 font-mono text-[var(--muted)] hidden md:table-cell">{m.size_gb != null ? `${m.size_gb.toFixed(2)} GiB` : '—'}</td>
                  <td class="px-4 py-1.5 font-mono text-[var(--muted)] hidden md:table-cell">{m.params ?? '—'}</td>
                  <td class="px-4 py-1.5 font-mono text-[var(--muted)] hidden md:table-cell">{m.quantization ?? '—'}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if modelsMeta.usable_vram_gib != null}
          <div class="mt-2 text-xs font-mono text-[var(--muted)]">
            Fit assessed against ~{fmtGiB(modelsMeta.usable_vram_gib)} usable VRAM (of {fmtGiB(modelsMeta.vram_total_gib)} total).
          </div>
        {/if}
      </section>
    {/if}

    <!-- Provisioning Roadmap -->
    <section>
      <h2 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-3">Provisioning Roadmap</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <h3 class="text-xs font-semibold text-[var(--success)] uppercase tracking-wide mb-3">Now — Provisioned</h3>
          <ul class="space-y-1.5 text-sm">
            {#each provisioning.now as item (item.label)}
              <li class="flex gap-2">
                <span class="text-[var(--success)] flex-shrink-0">✓</span>
                <span class="text-[var(--text)]">{item.label}</span>
              </li>
            {/each}
          </ul>
        </div>
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <h3 class="text-xs font-semibold text-[var(--info)] uppercase tracking-wide mb-3">Next — To Build</h3>
          <ol class="space-y-2 text-sm list-decimal list-inside">
            {#each provisioning.next as item (item.label)}
              <li class="text-[var(--text)]">
                <span class="font-medium">{item.label}</span>
                {#if item.detail}
                  <div class="ml-5 text-sm text-[var(--muted)] font-sans mt-0.5">{item.detail}</div>
                {/if}
              </li>
            {/each}
          </ol>
        </div>
      </div>
    </section>

  </div>
</div>
