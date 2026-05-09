<script>
  /**
   * Plugins page — list installed plugins, enable/disable, view source.
   * Plugins are JS files in `.raven/plugins/`. The runtime loads them
   * into a vm sandbox; this page is the frontend surface.
   */

  import { onMount, onDestroy } from 'svelte';
  import { PageLayout, PageHeader, PageSection } from '../components/layout/index.js';
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
  /** @type {string|null} */
  let activeSource = $state(null);
  /** @type {string|null} */
  let loadError = $state(null);

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
    try {
      const data = await api.post('/plugins/reload', {});
      plugins = Array.isArray(data?.plugins) ? data.plugins : [];
    } catch (err) {
      loadError = err?.message || String(err);
    }
  }

  async function toggle(plugin) {
    const path = plugin.enabled ? 'disable' : 'enable';
    try {
      await api.post(`/plugins/${encodeURIComponent(plugin.name)}/${path}`, {});
      await load();
    } catch (err) {
      loadError = err?.message || String(err);
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
    } catch (err) {
      activeSource = `// failed to load source: ${err?.message || err}`;
    }
  }

  function fmtTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${d.toLocaleTimeString()}`;
  }

  onMount(load);
  onDestroy(() => abort());
</script>

<PageLayout>
  <div class="space-y-8">
    <div
      class="flex items-center justify-between text-xs font-mono text-muted border-b border-border pb-2"
    >
      <div class="flex items-center gap-2">
        <span class="text-accent font-semibold">RAVEN.PLUGINS</span>
        <span aria-hidden="true">::</span>
        <span class="uppercase tracking-wide">.raven/plugins/*.js · vm sandbox</span>
      </div>
      <button
        type="button"
        onclick={reload}
        class="px-2 py-1 rounded bg-canvas border border-border hover:border-accent text-muted hover:text-body transition-colors text-[10px] uppercase tracking-wide cursor-pointer"
        >Reload from disk</button
      >
    </div>

    <PageHeader
      title="Plugins"
      description="User-authored JavaScript rules that subscribe to Raven's event stream and emit triggers. Drop a .js file into .raven/plugins/, hit reload, and the sandbox loads it. No require, no fs, no network — pure logic over events."
    />

    {#if loadError}
      <div class="bg-error/10 border border-error/30 text-error rounded-lg p-3 text-sm">
        {loadError}
      </div>
    {/if}

    <PageSection title="Installed">
      {#if loading}
        <div class="text-sm text-muted italic">Loading…</div>
      {:else if plugins.length === 0}
        <div class="text-sm text-muted italic">
          No plugins yet. The runtime seeds <code class="text-body">.raven/plugins/example.js</code>
          on first start; if it's missing, hit Reload.
        </div>
      {:else}
        <div class="space-y-3">
          {#each plugins as p (p.name)}
            <div class="bg-surface border border-border rounded-lg p-4">
              <div class="flex items-baseline justify-between gap-3 flex-wrap">
                <div class="flex items-baseline gap-3 min-w-0">
                  <span
                    class="inline-block w-1.5 h-1.5 rounded-full {p.enabled
                      ? 'bg-success'
                      : 'bg-muted'}"
                    aria-hidden="true"
                  ></span>
                  <span class="font-mono text-sm font-semibold text-heading truncate">{p.name}</span
                  >
                  <span class="text-xs font-mono text-muted">{p.file}</span>
                  {#if p.last_error}
                    <span
                      class="text-[10px] font-mono uppercase tracking-wide bg-error/15 text-error border border-error/30 rounded px-1.5 py-0.5"
                      title={p.last_error}>error</span
                    >
                  {/if}
                  {#if p.timeouts > 0}
                    <span
                      class="text-[10px] font-mono uppercase tracking-wide bg-warning/15 text-warning border border-warning/30 rounded px-1.5 py-0.5"
                      title="{p.timeouts} handler timeout{p.timeouts === 1
                        ? ''
                        : 's'} since runtime start">{p.timeouts} timeouts</span
                    >
                  {/if}
                </div>
                <div class="flex flex-wrap items-center gap-2">
                  <span class="text-[10px] font-mono text-muted">
                    {p.invocations} invocations · loaded {fmtTime(p.last_loaded)}
                  </span>
                  <button
                    type="button"
                    onclick={() => showSource(p.name)}
                    class="px-2 py-1 rounded bg-canvas border border-border hover:border-accent text-muted hover:text-body transition-colors text-[10px] uppercase tracking-wide cursor-pointer"
                    >{activeName === p.name ? 'Hide' : 'View'} source</button
                  >
                  <button
                    type="button"
                    onclick={() => toggle(p)}
                    class="px-2 py-1 rounded {p.enabled
                      ? 'bg-canvas border border-border hover:border-error/40 text-muted hover:text-error'
                      : 'bg-success/10 border border-success/30 text-success hover:bg-success/20'} transition-colors text-[10px] uppercase tracking-wide cursor-pointer"
                    >{p.enabled ? 'Disable' : 'Enable'}</button
                  >
                </div>
              </div>

              {#if p.logs?.length}
                <div class="mt-3 pt-3 border-t border-border">
                  <div class="text-[10px] font-mono uppercase tracking-wide text-muted mb-1">
                    Recent activity
                  </div>
                  <ul class="space-y-0.5 text-xs font-mono">
                    {#each p.logs.slice(-5).reverse() as l (l.timestamp + l.message)}
                      <li class="flex items-baseline gap-2">
                        <span class="text-muted/70 w-16 flex-shrink-0">{fmtTime(l.timestamp)}</span>
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
                <div class="mt-3 pt-3 border-t border-border">
                  <div class="text-[10px] font-mono uppercase tracking-wide text-muted mb-1">
                    Source · {p.file}
                  </div>
                  {#if activeSource == null}
                    <div class="text-xs font-mono text-muted italic">Loading…</div>
                  {:else}
                    <pre
                      class="text-xs font-mono p-3 bg-canvas border border-border rounded overflow-auto max-h-96 m-0 whitespace-pre-wrap break-all">{activeSource}</pre>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </PageSection>

    <PageSection title="Writing a plugin">
      <div
        class="bg-surface border border-border rounded-lg p-4 text-sm font-sans text-body leading-relaxed space-y-3"
      >
        <p>
          Plugins are plain JavaScript files in <code class="font-mono text-accent"
            >.raven/plugins/*.js</code
          >. Each is loaded into a fresh <code class="font-mono text-accent">vm.Context</code> with
          a constrained API surface and no access to
          <code class="font-mono">require</code>, <code class="font-mono">fs</code>,
          <code class="font-mono">process</code>, or the network.
        </p>
        <p>
          The <code class="font-mono text-accent">raven</code> global exposes:
        </p>
        <ul class="list-disc list-inside ml-2 space-y-1 font-mono text-xs text-muted">
          <li>
            <code class="text-body">raven.on('file' | 'agent', handler)</code> — subscribe to events
          </li>
          <li>
            <code class="text-body"
              >raven.trigger(name, &#123; message, severity, ...payload &#125;)</code
            > — fire a trigger
          </li>
          <li>
            <code class="text-body">raven.log / raven.warn / raven.error</code> — write to the plugin's
            recent-activity log
          </li>
        </ul>
        <p>
          Each handler runs with a <span class="font-mono text-accent">50ms</span> time budget. A
          plugin that times out 5 times in a session is auto-disabled. See
          <code class="font-mono text-accent">.raven/plugins/example.js</code>
          for a runaway-edits detector to copy from.
        </p>
      </div>
    </PageSection>
  </div>
</PageLayout>
