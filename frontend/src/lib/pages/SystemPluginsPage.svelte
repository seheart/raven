<script>
  /**
   * Plugins page — list installed plugins, enable/disable, view source.
   * Plugins are JS files in `.raven/plugins/`. The runtime loads them
   * into a vm sandbox; this page is the frontend surface.
   */

  import { onMount, onDestroy } from 'svelte';
  import { PageLayout, PageHeader, StatusBar } from '../components/layout/index.js';
  import { RefreshButton, EmptyState, DataFetchError } from '../components/ui/index.js';
  import { createPageApi } from '../apiClient.js';

  const { api, abort } = createPageApi();

  /**
   * @typedef {{
   *   name:string, file:string, enabled:boolean, last_loaded:string|null,
   *   timeouts:number, invocations:number, last_error:string|null,
   *   logs: Array<{timestamp:string, level:string, message:string}>
   * }} Plugin
   */
  /** @type {Plugin[]} */
  let plugins = $state([]);
  let loading = $state(true);
  let activeName = $state(null);
  let logsOpen = $state({});
  /** @type {string|null} */
  let activeSource = $state(null);
  /** @type {string|null} */
  let loadError = $state(null);
  let copiedPath = $state(null);
  // Per-plugin scraped description, cached by name once its source is fetched.
  // Persisting it here means the description keeps showing after the source
  // viewer is closed (previously it was computed inline only while open).
  /** @type {Record<string, string|null>} */
  let descriptions = $state({});

  const totals = $derived.by(() => {
    const enabled = plugins.filter(p => p.enabled).length;
    const invocations = plugins.reduce((s, p) => s + (p.invocations || 0), 0);
    const timeouts = plugins.reduce((s, p) => s + (p.timeouts || 0), 0);
    const errors = plugins.filter(p => p.last_error).length;
    const lastLoaded = plugins
      .map(p => (p.last_loaded ? new Date(p.last_loaded).getTime() : 0))
      .reduce((m, t) => Math.max(m, t), 0);
    return { enabled, invocations, timeouts, errors, lastLoaded };
  });

  async function load() {
    loading = true;
    try {
      const data = await api.get('/plugins');
      plugins = Array.isArray(data) ? data : [];
      loadError = null;
    } catch (err) {
      loadError = err?.message || String(err);
    } finally {
      loading = false;
    }
  }

  async function reload() {
    loading = true;
    try {
      const data = await api.post('/plugins/reload', {});
      plugins = Array.isArray(data?.plugins) ? data.plugins : [];
      loadError = null;
    } catch (err) {
      loadError = err?.message || String(err);
    } finally {
      loading = false;
    }
  }

  async function toggle(plugin) {
    const path = plugin.enabled ? 'disable' : 'enable';
    const action = plugin.enabled ? 'disable' : 'enable';
    try {
      await api.post(`/plugins/${encodeURIComponent(plugin.name)}/${path}`, {});
      await load();
    } catch (err) {
      const msg = err?.message || String(err);
      // Reconcile real state before surfacing the error: re-load the list so
      // the toggle reflects the actual backend state, then keep the error
      // banner (load() clears loadError on success, so re-set it after).
      await load().catch(() => {});
      loadError = `Failed to ${action} ${plugin.name}: ${msg}`;
    }
  }

  async function showSource(name) {
    if (activeName === name) {
      activeName = null;
      activeSource = null;
      return;
    }
    activeName = name;
    activeSource = null;
    try {
      const text = await api.get(`/plugins/${encodeURIComponent(name)}/source`);
      activeSource = typeof text === 'string' ? text : JSON.stringify(text, null, 2);
      // Cache the scraped description so it persists after the viewer closes.
      if (descriptions[name] == null) {
        descriptions = { ...descriptions, [name]: descriptionFromSource(activeSource) };
      }
    } catch (err) {
      activeSource = `// failed to load source: ${err?.message || err}`;
    }
  }

  function toggleLogs(name) {
    logsOpen = { ...logsOpen, [name]: !logsOpen[name] };
  }

  function fmtTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function timeAgo(iso) {
    if (!iso) return '—';
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 5_000) return 'just now';
    if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
    if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
    if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
    return `${Math.floor(ms / 86_400_000)}d ago`;
  }

  function formatNumber(n) {
    return (n ?? 0).toLocaleString();
  }

  async function copyPath(file) {
    const full = `.raven/plugins/${file}`;
    try {
      await navigator.clipboard.writeText(full);
      copiedPath = file;
      setTimeout(() => {
        if (copiedPath === file) copiedPath = null;
      }, 1500);
    } catch {
      /* ignore */
    }
  }

  // Quick description scrape: strip the leading /** ... */ block and grab
  // the first non-empty, non-boilerplate sentence. Boilerplate = lines that
  // are obviously meta ("Example Raven plugin.", "Plugins are plain JS...").
  // Returns null when nothing useful is found.
  function descriptionFromSource(src) {
    if (!src) return null;
    const m = src.match(/^\s*\/\*\*([\s\S]*?)\*\//);
    if (!m) return null;
    const lines = m[1]
      .split('\n')
      .map(l => l.replace(/^\s*\*\s?/, '').trim())
      .filter(Boolean)
      .filter(
        l =>
          !/^Example Raven plugin/i.test(l) &&
          !/^Plugins are plain JavaScript/i.test(l) &&
          !/^The `?raven`? global/i.test(l) &&
          !/^No require/i.test(l) &&
          !/^Security posture/i.test(l)
      );
    if (lines.length === 0) return null;
    // First sentence of the first remaining line, capped.
    const first = lines.find(l => /\w/.test(l)) || '';
    const sentence = first.split(/(?<=[.!?])\s/)[0];
    return sentence.length > 180 ? sentence.slice(0, 180) + '…' : sentence;
  }

  onMount(load);
  onDestroy(() => abort());
</script>

<PageLayout>
  <StatusBar label="Plugins" />
  <PageHeader
    title="Plugins"
    description="User-authored JavaScript rules over Raven's event stream. Drop a .js file into .raven/plugins/, hit reload, and the sandbox loads it."
  >
    {#snippet actions()}
      <RefreshButton onClick={reload} {loading} />
    {/snippet}
  </PageHeader>

  {#if loadError}
    <DataFetchError
      endpoint="/api/plugins"
      message="Failed to load plugins"
      hint={loadError}
      onRetry={load}
    />
  {/if}

  <!-- Stats strip — matches /storage and /system patterns. Shows the
       at-a-glance plugin runtime health. -->
  <div class="grid grid-cols-2 xl:grid-cols-5 gap-4 mb-6">
    <div class="bg-surface border border-border rounded p-4">
      <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Installed</div>
      <div class="text-sm font-mono text-body">{plugins.length}</div>
    </div>
    <div class="bg-surface border border-border rounded p-4">
      <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Enabled</div>
      <div class="text-sm font-mono text-body">
        {totals.enabled}
        {#if plugins.length > 0}
          <span class="text-muted/70 text-xs">/ {plugins.length}</span>
        {/if}
      </div>
    </div>
    <div class="bg-surface border border-border rounded p-4">
      <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Invocations</div>
      <div class="text-sm font-mono text-body">{formatNumber(totals.invocations)}</div>
    </div>
    <div class="bg-surface border border-border rounded p-4">
      <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Timeouts</div>
      <div class="text-sm font-mono {totals.timeouts > 0 ? 'text-warning' : 'text-body'}">
        {totals.timeouts}
      </div>
    </div>
    <div class="bg-surface border border-border rounded p-4">
      <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Last loaded</div>
      <div class="text-sm font-mono text-body">
        {totals.lastLoaded ? timeAgo(new Date(totals.lastLoaded).toISOString()) : '—'}
      </div>
    </div>
  </div>

  {#if loading && plugins.length === 0}
    <div class="space-y-3 mb-6">
      {#each Array(2) as _, i (i)}
        <div class="h-24 bg-surface border border-border rounded animate-pulse"></div>
      {/each}
    </div>
  {:else if plugins.length === 0}
    <!-- Empty state with onboarding. The example plugin is normally seeded
         on first start; if it's missing the user should hit reload. -->
    <div class="mb-6">
      <EmptyState
        size="compact"
        title="No plugins installed"
        description="The runtime seeds .raven/plugins/example.js on first start. If it's missing, click Reload above. To add your own, drop a .js file into .raven/plugins/ and reload."
      />
    </div>
  {:else}
    <!-- Plugin list — one card per plugin with name, scraped description,
         file path (copyable), big enabled/disabled toggle, and stat row.
         Recent activity + source viewer collapse on demand. -->
    <div class="bg-surface border border-border rounded-lg mb-6">
      <div class="px-5 py-3 border-b border-border flex items-baseline justify-between">
        <h3 class="text-xs font-semibold text-muted uppercase tracking-wide">Installed plugins</h3>
        <span class="text-[10px] font-mono text-muted">{plugins.length} total</span>
      </div>
      <div class="divide-y divide-border">
        {#each plugins as p (p.name)}
          {@const desc = descriptions[p.name] ?? null}
          <div class="px-5 py-4">
            <div class="flex items-start justify-between gap-4 flex-wrap">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span
                    class="w-2 h-2 rounded-full {p.enabled ? 'bg-success' : 'bg-muted'}"
                    aria-label={p.enabled ? 'enabled' : 'disabled'}
                  ></span>
                  <span class="font-mono text-sm font-semibold text-body">{p.name}</span>
                  {#if p.last_error}
                    <span
                      class="text-[10px] font-mono uppercase tracking-wide bg-error-subtle text-error border border-error rounded px-1.5 py-0.5"
                      title={p.last_error}>error</span
                    >
                  {/if}
                  {#if p.timeouts > 0}
                    <span
                      class="text-[10px] font-mono uppercase tracking-wide bg-warning-subtle text-warning border border-warning rounded px-1.5 py-0.5"
                      title="{p.timeouts} handler timeout{p.timeouts === 1 ? '' : 's'}"
                      >{p.timeouts} timeout{p.timeouts === 1 ? '' : 's'}</span
                    >
                  {/if}
                </div>
                <button
                  type="button"
                  onclick={() => copyPath(p.file)}
                  class="mt-1 text-xs font-mono text-muted hover:text-accent transition-colors flex items-center gap-1 cursor-pointer"
                  title="Copy path"
                >
                  <span>.raven/plugins/{p.file}</span>
                  <span class="text-[10px] opacity-50">{copiedPath === p.file ? '✓' : '⎘'}</span>
                </button>
                {#if desc}
                  <div class="mt-2 text-sm text-body font-sans leading-snug max-w-[42rem]">
                    {desc}
                  </div>
                {/if}
              </div>
              <div class="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onclick={() => showSource(p.name)}
                  class="px-2.5 py-1 rounded bg-surface border border-border hover:border-accent hover:text-accent text-muted transition-colors text-xs font-sans cursor-pointer"
                  >{activeName === p.name ? 'Hide source' : 'View source'}</button
                >
                <button
                  type="button"
                  onclick={() => toggle(p)}
                  aria-pressed={p.enabled}
                  title={p.enabled ? 'Disable plugin' : 'Enable plugin'}
                  class="relative w-12 h-6 rounded-full transition-colors cursor-pointer {p.enabled
                    ? 'bg-success'
                    : 'bg-surface-2 border border-border'}"
                >
                  <span
                    class="absolute top-0.5 w-5 h-5 rounded-full bg-canvas shadow transition-all {p.enabled
                      ? 'left-[26px]'
                      : 'left-0.5'}"
                  ></span>
                </button>
              </div>
            </div>

            <!-- Stat row, terminal-density -->
            <div class="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs font-mono text-muted">
              <span>
                <span class="text-body tabular-nums">{formatNumber(p.invocations)}</span> invocations
              </span>
              <span>
                last loaded
                <span class="text-body" title={p.last_loaded || ''}>{timeAgo(p.last_loaded)}</span>
              </span>
              {#if p.logs?.length}
                <button
                  type="button"
                  onclick={() => toggleLogs(p.name)}
                  class="text-muted hover:text-accent transition-colors cursor-pointer"
                  >{logsOpen[p.name] ? '▾' : '▸'}
                  {p.logs.length} log{p.logs.length === 1 ? '' : 's'}</button
                >
              {/if}
            </div>

            {#if logsOpen[p.name] && p.logs?.length}
              <div class="mt-3 bg-canvas border border-border rounded p-3">
                <ul class="space-y-1 text-xs font-mono">
                  {#each p.logs.slice(-10).reverse() as l (l.timestamp + l.message)}
                    <li class="flex items-baseline gap-3">
                      <span class="text-muted/60 w-20 flex-shrink-0">{fmtTime(l.timestamp)}</span>
                      <span
                        class="text-[10px] font-bold uppercase tracking-wide w-12 flex-shrink-0 {l.level ===
                        'error'
                          ? 'text-error'
                          : l.level === 'warn'
                            ? 'text-warning'
                            : 'text-muted'}">{l.level}</span
                      >
                      <span class="text-body break-all">{l.message}</span>
                    </li>
                  {/each}
                </ul>
              </div>
            {/if}

            {#if activeName === p.name}
              <div class="mt-3">
                <div class="text-[10px] font-mono uppercase tracking-wide text-muted mb-1">
                  Source · .raven/plugins/{p.file}
                </div>
                {#if activeSource == null}
                  <div class="text-xs font-mono text-muted italic py-3">Loading…</div>
                {:else}
                  <pre
                    class="text-xs font-mono p-3 bg-canvas border border-border rounded overflow-auto max-h-96 m-0 whitespace-pre">{activeSource}</pre>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Help: how to write a plugin. Always visible — short enough that even
       experienced users don't mind, and the snippet is the fastest way to
       see the API in one shot. -->
  <div class="bg-surface border border-border rounded-lg p-5">
    <h3 class="text-xs font-semibold text-muted uppercase tracking-wide mb-4">Write your own</h3>
    <div class="grid md:grid-cols-2 gap-5 text-sm font-sans text-body leading-relaxed">
      <div class="space-y-3">
        <p>
          Create <code class="font-mono text-accent">.raven/plugins/&lt;name&gt;.js</code> and click
          Reload. Plugins run in a fresh
          <code class="font-mono text-accent">vm.Context</code> with no require, fs, network, or process
          access.
        </p>
        <ul class="space-y-1.5 text-xs font-mono">
          <li>
            <code class="text-accent">raven.on('file' | 'agent' | 'token-usage', fn)</code>
          </li>
          <li>
            <code class="text-accent">raven.trigger(name, &#123; message, severity, ...&#125;)</code
            >
          </li>
          <li>
            <code class="text-accent">raven.log / .warn / .error</code>
          </li>
        </ul>
        <p class="text-xs text-muted">
          Each handler has a <span class="font-mono text-body">50ms</span> budget. Five timeouts auto-disables
          the plugin.
        </p>
      </div>
      <pre
        class="text-xs font-mono p-3 bg-canvas border border-border rounded overflow-auto m-0 leading-relaxed">{`// .raven/plugins/hot-file.js
const counts = new Map();

raven.on('file', (e) => {
  if (!e.filepath) return;
  const n = (counts.get(e.filepath) || 0) + 1;
  counts.set(e.filepath, n);
  if (n === 25) {
    raven.trigger('hot_file', {
      message: e.filepath + ' edited 25 times',
      severity: 'info',
      filepath: e.filepath
    });
  }
});`}</pre>
    </div>
  </div>
</PageLayout>
