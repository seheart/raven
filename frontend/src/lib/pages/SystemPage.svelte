<script>
  import { onMount } from 'svelte';
  import { PageLayout, PageHeader, PageSection, ProseBlock } from '../components/layout/index.js';
  import { createPageApi } from '../apiClient.js';
  import { websocketService } from '../services/websocket.js';
  import {
    HERO,
    ARCHITECTURE,
    STACK_SECTIONS,
    PARAMETERS,
    PROVISIONING,
    TOOL_CATALOG,
    SYSTEM_DECISIONS,
    GOVERNANCE
  } from '../content/system.js';

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
  let modelsError = $state(null);
  /** @type {string|null} */
  let loadError = $state(null);
  let websocketConnected = $state(false);

  // Tool catalog tier filter
  let toolTier = $state('all');

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
        // Backend returns 200 with {error: 'fetch failed'} when Ollama is
        // unreachable. Capture that so the section can show a "service
        // unavailable" stub instead of silently disappearing.
        modelsError = modelsRes.value.error || null;
        modelsMeta = {
          usable_vram_gib: modelsRes.value.usable_vram_gib,
          vram_total_gib: modelsRes.value.vram_total_gib
        };
      } else {
        modelsError = modelsRes.reason?.message || 'request failed';
      }
    } catch (err) {
      loadError = err instanceof Error ? err.message : String(err);
    }

    websocketConnected = websocketService.isConnected();
    const updateStatus = () => {
      websocketConnected = websocketService.isConnected();
    };
    websocketService.on('connect', updateStatus);
    websocketService.on('disconnect', updateStatus);
    return () => {
      websocketService.off('connect', updateStatus);
      websocketService.off('disconnect', updateStatus);
    };
  });

  /** @param {number|null|undefined} n */
  function fmtGiB(n) {
    return n == null ? '—' : `${n.toFixed(1)} GiB`;
  }

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

  /** @param {string} method */
  function methodTextClass(method) {
    switch (method) {
      case 'GET':
        return 'text-info';
      case 'POST':
        return 'text-success';
      case 'PUT':
      case 'PATCH':
        return 'text-warning';
      case 'DELETE':
        return 'text-error';
      default:
        return 'text-muted';
    }
  }

  /** @param {string} fit */
  function fitTextClass(fit) {
    switch (fit) {
      case 'fits':
        return 'text-success';
      case 'tight':
        return 'text-warning';
      case 'overflow':
        return 'text-error';
      default:
        return 'text-muted';
    }
  }

  /** @param {string} status */
  function statusTextClass(status) {
    switch (status) {
      case 'selected':
        return 'text-success';
      case 'backup':
        return 'text-info';
      case 'manual':
        return 'text-warning';
      case 'excluded':
        return 'text-error';
      default:
        return 'text-muted';
    }
  }

  const TIER_DOT_CLASS = {
    accent: 'bg-accent',
    success: 'bg-success',
    warning: 'bg-warning',
    info: 'bg-info'
  };
  function tierDotClass(c) {
    return TIER_DOT_CLASS[c] || TIER_DOT_CLASS.accent;
  }

  const visibleTiers = $derived(
    toolTier === 'all' ? TOOL_CATALOG : TOOL_CATALOG.filter(g => g.tier === toolTier)
  );
</script>

<PageLayout>
  <div class="space-y-12">
    <!-- Status bar -->
    <div
      class="flex items-center justify-between text-xs font-mono text-muted border-b border-border pb-2"
    >
      <div class="flex items-center gap-2">
        <span class="text-accent font-semibold">RAVEN.SYSTEM</span>
        <span aria-hidden="true">::</span>
        <span class="uppercase tracking-wide">Architecture · Stack · State</span>
      </div>
      <div class="flex items-center gap-2">
        <span
          class="w-1.5 h-1.5 rounded-full {websocketConnected
            ? 'bg-success animate-pulse'
            : 'bg-warning'}"
        ></span>
        <span
          class="uppercase tracking-wide {websocketConnected ? 'text-success' : 'text-warning'}"
        >
          {websocketConnected ? 'Operational' : 'Disconnected'}
        </span>
      </div>
    </div>

    <!-- Hero — two-column: prose-heavy main + vital stats aside -->
    <section class="flex flex-col lg:flex-row gap-8">
      <!-- Main column -->
      <div class="flex-1 min-w-0 max-w-[48rem]">
        <PageHeader title={HERO.title} />

        <p class="mt-4 text-base text-body font-sans leading-relaxed">{HERO.lede}</p>

        <div class="mt-4 flex flex-wrap items-center gap-2 text-xs font-mono text-muted">
          {#each HERO.badges as badge (badge.label)}
            <span
              class="px-2 py-0.5 bg-accent-subtle text-accent rounded font-semibold tracking-wide"
              >{badge.label}</span
            >
            {#each badge.items as item, i (item)}
              <span>{item}</span>
              {#if i < badge.items.length - 1}<span class="text-muted/40">·</span>{/if}
            {/each}
          {/each}
        </div>

        {#if loadError}
          <div class="mt-4 bg-error/10 border border-error/30 text-error rounded-lg p-3 text-sm">
            Failed to load system data: {loadError}
          </div>
        {/if}
      </div>

      <!-- Aside: vital stats -->
      <aside class="lg:w-72 lg:flex-shrink-0">
        <div class="bg-surface border border-border rounded-lg p-4 lg:sticky lg:top-20">
          <div class="text-xs font-mono uppercase tracking-wide text-muted mb-3">Vital stats</div>
          <dl class="space-y-1.5 text-sm font-mono">
            {#each [{ k: 'Runtime', v: intro?.platform_label }, { k: 'Agents', v: intro?.agent_count }, { k: 'Tables', v: intro?.table_count }, { k: 'Endpoints', v: intro?.endpoint_count }, { k: 'Uptime', v: fmtUptime(intro?.uptime_seconds) }, { k: 'PID', v: intro?.pid }, { k: 'Scope', v: 'Local · Host-Only' }] as row (row.k)}
              <div class="flex items-baseline justify-between gap-3">
                <dt class="text-muted">{row.k}</dt>
                <dd class="text-body text-right truncate">{row.v ?? '—'}</dd>
              </div>
            {/each}
          </dl>
        </div>
      </aside>
    </section>

    <!-- 01 // Architecture -->
    <PageSection title="01 // Architecture">
      <div class="flex flex-wrap gap-2 items-stretch">
        {#each ARCHITECTURE as box, i (box.head)}
          <div class="flex items-stretch gap-2 flex-1 min-w-[180px]">
            <div class="bg-surface border border-border rounded-lg p-3 flex-1">
              <div class="font-mono text-sm font-semibold text-accent mb-1">{box.head}</div>
              <div class="text-sm text-muted font-sans leading-relaxed">{box.body}</div>
            </div>
            {#if i < ARCHITECTURE.length - 1}
              <div class="flex items-center text-muted font-mono text-lg select-none">→</div>
            {/if}
          </div>
        {/each}
      </div>
    </PageSection>

    <!-- 02 // Stack -->
    <PageSection title="02 // Stack">
      <div class="space-y-4">
        {#each STACK_SECTIONS as section (section.title)}
          <div class="bg-surface border border-border rounded-lg p-5">
            <h3 class="text-xs font-semibold text-muted uppercase tracking-wide mb-4">
              {section.title}
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              {#each section.items as item (item.name)}
                <div
                  class="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 border-b border-border pb-2 last:border-b-0 last:pb-0"
                >
                  <div class="font-mono text-body sm:w-44 sm:flex-shrink-0">
                    {#if item.url}
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="text-accent hover:underline">{item.name}</a
                      >
                    {:else}
                      {item.name}
                    {/if}
                  </div>
                  <div class="text-muted font-sans flex-1">{item.role}</div>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </PageSection>

    <!-- 03 // Data Model -->
    <PageSection title="03 // Data Model" meta="live · auto-generated from sqlite_master">
      {#if tables.length === 0}
        <div class="text-sm text-muted italic">Loading…</div>
      {:else}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          {#each tables as t (t.name)}
            <div class="bg-surface border border-border rounded-lg p-3">
              <div class="flex items-baseline justify-between gap-3 mb-2">
                <span class="font-mono text-sm text-accent">{t.name}</span>
                <span class="text-xs font-mono text-muted">{t.row_count.toLocaleString()} rows</span
                >
              </div>
              <div class="text-sm font-mono text-muted leading-relaxed break-words">
                {t.columns.join(' · ')}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </PageSection>

    <!-- 04 // Public API -->
    <PageSection title="04 // Public API" meta="live · auto-generated from Express routes">
      {#if routes.length === 0}
        <div class="text-sm text-muted italic">Loading…</div>
      {:else}
        <div class="border-t border-b border-border max-h-96 overflow-auto font-mono text-sm">
          <table class="w-full">
            <thead class="bg-canvas sticky top-0 z-10">
              <tr class="text-[11px] text-muted uppercase tracking-wide">
                <th class="text-left font-semibold px-3 py-1 w-24">Method</th>
                <th class="text-left font-semibold px-3 py-1">Path</th>
                <th class="text-left font-semibold px-3 py-1 hidden md:table-cell">Summary</th>
              </tr>
            </thead>
            <tbody>
              {#each routes as r (r.methods.join(',') + r.path)}
                <tr class="hover:bg-surface/40">
                  <td class="px-3 py-0.5 align-top">
                    {#each r.methods as m, i (m)}
                      <span class="font-bold {methodTextClass(m)}">{m}</span
                      >{#if i < r.methods.length - 1}<span class="text-muted">,</span>{/if}
                    {/each}
                  </td>
                  <td class="px-3 py-0.5 text-body break-all">{r.path}</td>
                  <td class="px-3 py-0.5 text-muted hidden md:table-cell">{r.summary}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </PageSection>

    <!-- 05 // Parameters -->
    <PageSection title="05 // Parameters">
      <div class="bg-surface border border-border rounded-lg p-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          {#each PARAMETERS as p (p.label)}
            <div
              class="flex justify-between gap-3 border-b border-border pb-2 last:border-b-0 last:pb-0"
            >
              <span class="text-muted">{p.label}</span>
              <span class="font-mono text-body text-right">{p.value}</span>
            </div>
          {/each}
        </div>
      </div>
    </PageSection>

    <!-- 06 // Capacity -->
    <PageSection title="06 // Capacity" meta="live · CPU / RAM / GPU / disk">
      {#if !hardware}
        <div class="text-sm text-muted italic">Loading…</div>
      {:else}
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div class="bg-surface border border-border rounded-lg p-4">
            <div class="text-xs text-muted uppercase tracking-wide mb-1">CPU</div>
            <div class="font-mono text-sm text-body break-words leading-tight">{hardware.cpu}</div>
            <div class="text-xs text-muted mt-1">{hardware.cores} threads</div>
          </div>
          <div class="bg-surface border border-border rounded-lg p-4">
            <div class="text-xs text-muted uppercase tracking-wide mb-1">RAM</div>
            <div class="font-mono text-lg text-body">{fmtGiB(hardware.ram_gib)}</div>
            <div class="text-xs text-muted mt-1">{fmtGiB(hardware.ram_free_gib)} free</div>
          </div>
          <div class="bg-surface border border-border rounded-lg p-4">
            <div class="text-xs text-muted uppercase tracking-wide mb-1">GPU</div>
            <div class="font-mono text-sm text-body break-words leading-tight">
              {hardware.gpu ?? '—'}
            </div>
            <div class="text-xs text-muted mt-1">
              {hardware.vram_total_gib != null
                ? `${fmtGiB(hardware.vram_total_gib)} total · ${fmtGiB(hardware.vram_free_gib)} free`
                : 'no nvidia-smi'}
            </div>
          </div>
          <div class="bg-surface border border-border rounded-lg p-4">
            <div class="text-xs text-muted uppercase tracking-wide mb-1">Disk</div>
            <div class="font-mono text-lg text-body">{fmtGiB(hardware.disk_total_gib)}</div>
            <div class="text-xs text-muted mt-1">{fmtGiB(hardware.disk_free_gib)} free</div>
          </div>
        </div>
        <div class="mt-3 text-xs font-mono text-muted leading-relaxed">
          {hardware.os} · kernel {hardware.kernel} · arch {hardware.arch}{hardware.vram_usable_gib !=
          null
            ? ` · ~${fmtGiB(hardware.vram_usable_gib)} usable VRAM for models`
            : ''}
        </div>
      {/if}
    </PageSection>

    <!-- 07 // Installed Models. Render the section header even when empty
         so a fetch failure shows up as "service unavailable" instead of
         silently disappearing — that was the whole genre of bug we hit. -->
    {#if modelsError && models.length === 0}
      <PageSection title="07 // Installed Models" meta="ollama unreachable">
        <ProseBlock>
          <p class="text-sm text-error font-sans mb-1">Models data unavailable.</p>
          <p class="text-xs text-muted font-mono">
            <code>/api/system/models</code> returned: {modelsError}. Verify Ollama is running and
            reachable from the backend (check OLLAMA_URL env; localhost vs 127.0.0.1 IPv6 traps).
          </p>
        </ProseBlock>
      </PageSection>
    {:else if models.length > 0}
      <PageSection title="07 // Installed Models" meta="live · fit assessment vs. usable VRAM">
        <ProseBlock>
          <p class="text-sm text-body font-sans mb-3">
            Each model's GGUF size shown alongside whether it fits in usable VRAM (total minus
            display headroom). Overflow models spill to CPU and run an order of magnitude slower.
          </p>
        </ProseBlock>
        <div class="border-t border-b border-border font-mono text-sm overflow-x-auto">
          <table class="w-full">
            <thead class="bg-canvas">
              <tr class="text-[11px] text-muted uppercase tracking-wide">
                <th class="text-left font-semibold px-3 py-1 w-20">Fit</th>
                <th class="text-left font-semibold px-3 py-1">Model</th>
                <th class="text-left font-semibold px-3 py-1 hidden md:table-cell">Size</th>
                <th class="text-left font-semibold px-3 py-1 hidden md:table-cell">Params</th>
                <th class="text-left font-semibold px-3 py-1 hidden md:table-cell">Quant</th>
              </tr>
            </thead>
            <tbody>
              {#each models as m (m.name)}
                <tr class="hover:bg-surface/40">
                  <td class="px-3 py-0.5 font-bold uppercase {fitTextClass(m.fit)}">{m.fit}</td>
                  <td class="px-3 py-0.5 text-body">{m.name}</td>
                  <td class="px-3 py-0.5 text-muted hidden md:table-cell"
                    >{m.size_gb != null ? `${m.size_gb.toFixed(2)} GiB` : '—'}</td
                  >
                  <td class="px-3 py-0.5 text-muted hidden md:table-cell">{m.params ?? '—'}</td>
                  <td class="px-3 py-0.5 text-muted hidden md:table-cell"
                    >{m.quantization ?? '—'}</td
                  >
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if modelsMeta.usable_vram_gib != null}
          <div class="mt-2 text-xs font-mono text-muted">
            Fit assessed against ~{fmtGiB(modelsMeta.usable_vram_gib)} usable VRAM (of {fmtGiB(
              modelsMeta.vram_total_gib
            )} total).
          </div>
        {/if}
      </PageSection>
    {:else}
      <PageSection title="07 // Installed Models" meta="none pulled yet">
        <ProseBlock>
          <p class="text-sm text-body font-sans mb-1">No Ollama models installed yet.</p>
          <p class="text-xs text-muted font-mono">
            Pull one with <code>ollama pull llama3.2</code> (or any model from
            <code>ollama.com/library</code>) and refresh — Raven will list it here with a fit
            assessment against your usable VRAM.
          </p>
        </ProseBlock>
      </PageSection>
    {/if}

    <!-- 08 // Provisioning -->
    <PageSection title="08 // Provisioning">
      <ProseBlock>
        <p class="text-sm text-body font-sans mb-4">
          Capacity vs. orchestration. Raven's <strong>capacity</strong> is provisioned — what's
          missing is more <strong>orchestration</strong> on top.
        </p>
      </ProseBlock>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="bg-surface border border-border rounded-lg p-4">
          <h3 class="text-xs font-semibold text-success uppercase tracking-wide mb-3">
            Now — Provisioned
          </h3>
          <ul class="space-y-1.5 text-sm">
            {#each PROVISIONING.now as item (item.label)}
              <li class="flex gap-2">
                <span class="text-success flex-shrink-0">✓</span>
                <span class="text-body">{item.label}</span>
              </li>
            {/each}
          </ul>
        </div>
        <div class="bg-surface border border-border rounded-lg p-4">
          <h3 class="text-xs font-semibold text-info uppercase tracking-wide mb-3">
            Next — To Build
          </h3>
          <ol class="space-y-2 text-sm list-decimal list-inside">
            {#each PROVISIONING.next as item (item.label)}
              <li class="text-body">
                <span class="font-medium">{item.label}</span>
                {#if item.detail}
                  <div class="ml-5 text-sm text-muted font-sans mt-0.5">{item.detail}</div>
                {/if}
              </li>
            {/each}
          </ol>
        </div>
      </div>
    </PageSection>

    <!-- 09 // Tool Catalog -->
    <PageSection title="09 // Tool Catalog" meta="selected · backup · manual · excluded">
      <ProseBlock>
        <p class="text-sm text-body font-sans mb-4">
          The "why these and not those" rationale for Raven's stack. Filter by tier to focus.
        </p>
      </ProseBlock>

      <!-- Tier filter chips -->
      <div class="flex flex-wrap gap-2 mb-4">
        <button
          type="button"
          class="px-3 py-1 text-xs font-mono rounded border transition-colors {toolTier === 'all'
            ? 'bg-accent text-canvas border-accent'
            : 'bg-surface border-border hover:border-accent'}"
          onclick={() => (toolTier = 'all')}>All</button
        >
        {#each TOOL_CATALOG as g (g.tier)}
          <button
            type="button"
            class="px-3 py-1 text-xs font-mono rounded border transition-colors {toolTier === g.tier
              ? 'bg-accent text-canvas border-accent'
              : 'bg-surface border-border hover:border-accent'}"
            onclick={() => (toolTier = g.tier)}>{g.tier}</button
          >
        {/each}
      </div>

      {#each visibleTiers as group (group.tier)}
        <div class="mb-6">
          <h3 class="flex items-center gap-2 text-sm font-semibold text-heading mb-2">
            <span class="w-2 h-2 rounded-full {tierDotClass(group.color)}"></span>
            {group.tier}
          </h3>
          <p class="text-sm text-muted font-sans mb-3">{group.blurb}</p>
          <div class="border-t border-b border-border font-mono text-sm overflow-x-auto">
            <table class="w-full">
              <thead class="bg-canvas">
                <tr class="text-[11px] text-muted uppercase tracking-wide">
                  <th class="text-left font-semibold px-3 py-1 w-24">Status</th>
                  <th class="text-left font-semibold px-3 py-1">Tool</th>
                  <th class="text-left font-semibold px-3 py-1 hidden md:table-cell">Provider</th>
                  <th class="text-left font-semibold px-3 py-1 hidden lg:table-cell">Cost</th>
                  <th class="text-left font-semibold px-3 py-1 hidden lg:table-cell">License</th>
                  <th class="text-left font-semibold px-3 py-1">Notes</th>
                </tr>
              </thead>
              <tbody>
                {#each group.tools as t (t.name)}
                  <tr class="hover:bg-surface/40 align-top">
                    <td class="px-3 py-0.5 font-bold uppercase {statusTextClass(t.status)}"
                      >{t.status}</td
                    >
                    <td class="px-3 py-0.5 text-body">
                      <div class="font-semibold">{t.name}</div>
                      <div class="text-muted">{t.bestFor}</div>
                    </td>
                    <td class="px-3 py-0.5 text-muted hidden md:table-cell">{t.provider}</td>
                    <td class="px-3 py-0.5 text-muted hidden lg:table-cell">{t.cost}</td>
                    <td class="px-3 py-0.5 text-muted hidden lg:table-cell">{t.license}</td>
                    <td class="px-3 py-0.5 text-body">
                      {t.notes}
                      {#if t.status === 'excluded' && t.reason}
                        <div class="text-muted">— {t.reason}</div>
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      {/each}
    </PageSection>

    <!-- 10 // Key Design Decisions -->
    <PageSection title="10 // Key Design Decisions">
      <ProseBlock>
        <p class="text-sm text-muted font-sans mb-4">
          Implementation-level choices behind the running system. Architectural decisions (data
          model, scope, single-host) live on the About page.
        </p>
      </ProseBlock>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        {#each SYSTEM_DECISIONS as d (d.head)}
          <div class="bg-surface border border-border rounded-lg p-4">
            <div class="text-sm font-semibold text-accent mb-2">{d.head}</div>
            <p class="text-sm text-body font-sans leading-relaxed">{d.body}</p>
          </div>
        {/each}
      </div>
    </PageSection>

    <!-- 11 // Governance -->
    <PageSection
      title="11 // Governance"
      meta="every gate, linter, validator, CI check — in one place"
    >
      <ProseBlock>
        <p class="text-sm text-body font-sans mb-6">
          What's protecting you from breaking things. Each gate runs locally (via the pre-commit
          hook on git commit, or manually) AND in CI on every push. Bypassing locally with <code
            class="font-mono text-accent">--no-verify</code
          > is caught by CI.
        </p>
      </ProseBlock>

      <h3 class="text-sm font-semibold text-heading mb-3">Quality gates</h3>
      <div class="border-t border-b border-border font-mono text-sm mb-6 overflow-x-auto">
        <table class="w-full">
          <thead class="bg-canvas">
            <tr class="text-[11px] text-muted uppercase tracking-wide">
              <th class="text-left font-semibold px-3 py-1">Gate</th>
              <th class="text-left font-semibold px-3 py-1">What it catches</th>
              <th class="text-left font-semibold px-3 py-1 hidden md:table-cell w-32"
                >Where it runs</th
              >
              <th class="text-left font-semibold px-3 py-1 hidden lg:table-cell">Config</th>
            </tr>
          </thead>
          <tbody>
            {#each GOVERNANCE.gates as g (g.name)}
              <tr class="hover:bg-surface/40 align-top">
                <td class="px-3 py-0.5 text-body font-semibold">{g.name}</td>
                <td class="px-3 py-0.5 text-body">{g.what}</td>
                <td class="px-3 py-0.5 text-success hidden md:table-cell">{g.where}</td>
                <td class="px-3 py-0.5 text-muted hidden lg:table-cell">{g.config}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <h3 class="text-sm font-semibold text-heading mb-3">
        Design-system linter rules <span class="text-xs font-mono text-muted ml-2"
          >{GOVERNANCE.dsRules.length} active</span
        >
      </h3>
      <div class="border-t border-b border-border font-mono text-sm mb-6 overflow-x-auto">
        <table class="w-full">
          <thead class="bg-canvas">
            <tr class="text-[11px] text-muted uppercase tracking-wide">
              <th class="text-left font-semibold px-3 py-1">Rule</th>
              <th class="text-left font-semibold px-3 py-1">What it forbids / warns</th>
              <th class="text-left font-semibold px-3 py-1 hidden md:table-cell">Fix</th>
            </tr>
          </thead>
          <tbody>
            {#each GOVERNANCE.dsRules as r (r.name)}
              <tr class="hover:bg-surface/40 align-top">
                <td class="px-3 py-0.5 text-accent">{r.name}</td>
                <td class="px-3 py-0.5 text-body">{r.kind}</td>
                <td class="px-3 py-0.5 text-muted hidden md:table-cell">{r.fix}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <h3 class="text-sm font-semibold text-heading mb-3">
        CI workflow <span class="text-xs font-mono text-muted ml-2">.github/workflows/ci.yml</span>
      </h3>
      <div class="border-t border-b border-border font-mono text-sm mb-6 overflow-x-auto">
        <table class="w-full">
          <thead class="bg-canvas">
            <tr class="text-[11px] text-muted uppercase tracking-wide">
              <th class="text-left font-semibold px-3 py-1">Job</th>
              <th class="text-left font-semibold px-3 py-1">What it does</th>
            </tr>
          </thead>
          <tbody>
            {#each GOVERNANCE.ci as c (c.job)}
              <tr class="hover:bg-surface/40 align-top">
                <td class="px-3 py-0.5 text-body">{c.job}</td>
                <td class="px-3 py-0.5 text-body">{c.what}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <h3 class="text-sm font-semibold text-heading mb-3">Test suites</h3>
      <div class="border-t border-b border-border font-mono text-sm mb-6 overflow-x-auto">
        <table class="w-full">
          <thead class="bg-canvas">
            <tr class="text-[11px] text-muted uppercase tracking-wide">
              <th class="text-left font-semibold px-3 py-1">Path</th>
              <th class="text-left font-semibold px-3 py-1">What's there</th>
            </tr>
          </thead>
          <tbody>
            {#each GOVERNANCE.tests as t (t.path)}
              <tr class="hover:bg-surface/40 align-top">
                <td class="px-3 py-0.5 text-body">{t.path}</td>
                <td class="px-3 py-0.5 text-body">{t.what}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <h3 class="text-sm font-semibold text-heading mb-3">Dev tools</h3>
      <div class="border-t border-b border-border font-mono text-sm mb-6 overflow-x-auto">
        <table class="w-full">
          <thead class="bg-canvas">
            <tr class="text-[11px] text-muted uppercase tracking-wide">
              <th class="text-left font-semibold px-3 py-1">Tool</th>
              <th class="text-left font-semibold px-3 py-1">What it does</th>
            </tr>
          </thead>
          <tbody>
            {#each GOVERNANCE.devTools as d (d.name)}
              <tr class="hover:bg-surface/40 align-top">
                <td class="px-3 py-0.5 text-body">{d.name}</td>
                <td class="px-3 py-0.5 text-body">{d.what}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <h3 class="text-sm font-semibold text-heading mb-3">Convention docs</h3>
      <div class="border-t border-b border-border font-mono text-sm mb-6 overflow-x-auto">
        <table class="w-full">
          <thead class="bg-canvas">
            <tr class="text-[11px] text-muted uppercase tracking-wide">
              <th class="text-left font-semibold px-3 py-1">Path</th>
              <th class="text-left font-semibold px-3 py-1">What's there</th>
            </tr>
          </thead>
          <tbody>
            {#each GOVERNANCE.docs as d (d.path)}
              <tr class="hover:bg-surface/40 align-top">
                <td class="px-3 py-0.5 text-body">{d.path}</td>
                <td class="px-3 py-0.5 text-body">{d.what}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <ProseBlock width="wide">
        <div class="bg-warning/10 border-l-4 border-warning rounded-r p-4">
          <div class="text-xs font-mono uppercase tracking-wide text-warning mb-1">
            ! {GOVERNANCE.invoke.summary}
          </div>
          <div class="text-sm text-body font-sans">{GOVERNANCE.invoke.body}</div>
        </div>
      </ProseBlock>
    </PageSection>
  </div>
</PageLayout>
