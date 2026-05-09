<script>
  import { onMount, onDestroy } from 'svelte';
  import { createPageApi } from '../apiClient.js';
  import { PageLayout, PageHeader } from '../components/layout/index.js';
  import { RefreshButton, EmptyState, FilterToggle } from '../components/ui/index.js';
  const { api, abort: abortRequests } = createPageApi();

  let warnings = $state([]);
  let ignores = $state([]);
  let loading = $state(true);
  let searchQuery = $state('');
  let severityFilter = $state('all');
  let copied = $state(false);
  let ignoresOpen = $state(false);

  const filteredWarnings = $derived.by(() => {
    let filtered = warnings;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        w =>
          w.filepath?.toLowerCase().includes(q) ||
          w.message?.toLowerCase().includes(q) ||
          w.pattern_name?.toLowerCase().includes(q)
      );
    }
    if (severityFilter !== 'all') {
      filtered = filtered.filter(w => w.severity === severityFilter);
    }
    return filtered;
  });

  const status = $derived(warnings.length === 0 ? 'healthy' : 'warning');

  async function loadWarnings() {
    try {
      loading = true;
      const [data, ig] = await Promise.all([
        api.get('/pattern-warnings?limit=500').catch(() => ({ warnings: [] })),
        api.get('/pattern-warnings/ignores').catch(() => ({ ignores: [] }))
      ]);
      warnings = data.warnings || [];
      ignores = ig.ignores || [];
    } catch {
      // Silent fail
    } finally {
      loading = false;
    }
  }

  async function resolveWarning(id) {
    try {
      await api.post(`/pattern-warnings/${id}/resolve`);
      await loadWarnings();
    } catch (err) {
      alert('Failed to resolve: ' + err.message);
    }
  }

  async function ignoreWarning(warning) {
    const reason = prompt(
      `Ignore this warning permanently?\n\n` +
        `${warning.pattern_name} in ${shortenPath(warning.filepath)}\n\n` +
        `Reason (recorded for audit — leave blank to skip):`,
      'false positive'
    );
    if (reason === null) return;
    try {
      await api.post(`/pattern-warnings/${warning.id}/ignore`, { reason: reason || undefined });
      await loadWarnings();
    } catch (err) {
      alert('Failed to ignore: ' + err.message);
    }
  }

  async function unignore(ignore) {
    if (
      !confirm(
        `Un-ignore this suppression?\n\n` +
          `${ignore.pattern_id} in ${shortenPath(ignore.filepath)}\n\n` +
          `The next scan will re-raise the warning if the pattern still matches.`
      )
    )
      return;
    try {
      await api.delete(`/pattern-warnings/ignores/${ignore.id}`);
      await loadWarnings();
    } catch (err) {
      alert('Failed to un-ignore: ' + err.message);
    }
  }

  async function resolveAll() {
    if (!confirm(`Resolve all ${filteredWarnings.length} warnings?`)) return;
    try {
      await api.post('/pattern-warnings/resolve-all');
      await loadWarnings();
    } catch (err) {
      alert('Failed: ' + err.message);
    }
  }

  function shortenPath(filepath) {
    if (!filepath) return '';
    return filepath.replace(/^\/home\/[^/]+\/Projects\//, '');
  }

  async function copyAll() {
    const list = filteredWarnings;
    if (list.length === 0) return;
    const text = list
      .map(w => {
        const lines = [
          `[${w.severity || 'info'}] ${w.pattern_name || 'Pattern'}`,
          w.message || '',
          `${shortenPath(w.filepath) || ''}${w.line_number ? `:${w.line_number}` : ''}`
        ];
        const ctx = w.context || w.match_text;
        if (ctx) lines.push(ctx);
        return lines.filter(Boolean).join('\n');
      })
      .join('\n\n---\n\n');
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch (err) {
      alert('Copy failed: ' + err.message);
    }
  }

  onMount(loadWarnings);

  onDestroy(() => abortRequests());
</script>

<PageLayout>
  <PageHeader
    title="Safety"
    description="Pattern detection: credentials, debug statements, code quality"
  >
    {#snippet actions()}
      <div class="flex gap-2">
        {#if warnings.length > 0}
          <button
            onclick={copyAll}
            disabled={filteredWarnings.length === 0}
            class="px-3 py-1.5 bg-surface border border-border rounded text-sm font-sans text-body hover:border-accent hover:text-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {copied
              ? 'Copied'
              : `Copy${severityFilter !== 'all' || searchQuery.trim() ? ' Filtered' : ' All'}`}
          </button>
          <button
            onclick={resolveAll}
            class="px-3 py-1.5 bg-surface border border-success rounded text-sm font-sans text-success hover:bg-success-subtle transition-colors"
          >
            Resolve All
          </button>
        {/if}
        <RefreshButton onClick={loadWarnings} {loading} />
      </div>
    {/snippet}
  </PageHeader>

  {#if loading}
    <div class="space-y-3">
      {#each Array(3) as _, i (i)}
        <div class="h-16 bg-surface border border-border rounded animate-pulse"></div>
      {/each}
    </div>
  {:else}
    <!-- Status -->
    <div class="bg-surface border border-border rounded p-4 mb-6">
      <div class="flex items-center gap-2">
        <span class="w-2 h-2 rounded-full {status === 'healthy' ? 'bg-success' : 'bg-warning'}"
        ></span>
        <span class="text-sm font-mono font-semibold text-body">
          {status === 'healthy'
            ? 'All Clear — no pattern warnings detected'
            : `${warnings.length} pattern warning${warnings.length === 1 ? '' : 's'} detected`}
        </span>
        {#if ignores.length > 0}
          <span class="text-xs text-muted font-mono ml-2">
            · {ignores.length} ignored
          </span>
        {/if}
      </div>
    </div>

    {#if warnings.length > 0}
      <!-- Search + Filter -->
      <div class="flex gap-3 mb-4 flex-wrap items-center">
        <input
          type="text"
          placeholder="Search warnings..."
          bind:value={searchQuery}
          class="flex-1 min-w-[200px] px-3 py-1.5 bg-surface border border-border rounded text-sm font-mono text-body focus:outline-none focus:border-accent"
        />
        {#each ['all', 'critical', 'error', 'warning', 'info'] as sev (sev)}
          <FilterToggle active={severityFilter === sev} onClick={() => (severityFilter = sev)}>
            {sev === 'all' ? 'All' : sev.charAt(0).toUpperCase() + sev.slice(1)}
          </FilterToggle>
        {/each}
      </div>

      <!-- Warnings List -->
      {#if filteredWarnings.length === 0}
        <EmptyState size="compact" title="No matching warnings" />
      {:else}
        <div class="bg-surface border border-border rounded-lg">
          <div class="divide-y divide-[var(--border)]">
            {#each filteredWarnings as warning (warning.id)}
              <div class="px-5 py-3 flex items-start gap-3">
                <span
                  class="w-2 h-2 rounded-full flex-shrink-0 mt-1.5 {warning.severity === 'error' ||
                  warning.severity === 'critical'
                    ? 'bg-error'
                    : warning.severity === 'warning'
                      ? 'bg-warning'
                      : 'bg-accent'}"
                ></span>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-0.5">
                    <span class="text-sm font-mono font-semibold text-body"
                      >{warning.pattern_name || 'Pattern'}</span
                    >
                    <span class="text-xs text-muted font-mono">{warning.severity}</span>
                  </div>
                  <div class="text-xs text-muted mb-1">{warning.message}</div>
                  <div class="text-xs text-muted font-mono">
                    {shortenPath(warning.filepath)}
                    {warning.line_number ? `· Line ${warning.line_number}` : ''}
                  </div>
                  {#if warning.context || warning.match_text}
                    <code
                      class="block mt-2 px-2 py-1 bg-canvas rounded text-xs font-mono text-body overflow-x-auto"
                      >{warning.context || warning.match_text}</code
                    >
                  {/if}
                </div>
                <div class="flex gap-1.5 flex-shrink-0">
                  <button
                    onclick={() => ignoreWarning(warning)}
                    title="Suppress this exact match permanently (false positive)"
                    class="px-2 py-1 bg-surface border border-border rounded text-xs font-sans text-muted hover:text-body hover:border-accent transition-colors"
                  >
                    Ignore
                  </button>
                  <button
                    onclick={() => resolveWarning(warning.id)}
                    class="px-2 py-1 bg-surface border border-success rounded text-xs font-sans text-success hover:bg-success-subtle transition-colors"
                  >
                    Resolve
                  </button>
                </div>
              </div>
            {/each}
          </div>
        </div>
        <div class="text-xs text-muted text-center mt-3">
          Showing {filteredWarnings.length} of {warnings.length} warnings
        </div>
      {/if}
    {/if}

    {#if ignores.length > 0}
      <div class="mt-8 bg-surface border border-border rounded-lg">
        <button
          onclick={() => (ignoresOpen = !ignoresOpen)}
          class="w-full px-5 py-3 flex items-center justify-between text-left hover:bg-canvas transition-colors rounded-lg"
        >
          <span class="text-sm font-mono font-semibold text-body">
            Ignored ({ignores.length})
            <span class="text-xs text-muted font-normal ml-2"
              >— suppressed false positives, audit trail</span
            >
          </span>
          <span class="text-muted text-xs">{ignoresOpen ? '▾' : '▸'}</span>
        </button>
        {#if ignoresOpen}
          <div class="divide-y divide-[var(--border)] border-t border-[var(--border)]">
            {#each ignores as ignore (ignore.id)}
              <div class="px-5 py-3 flex items-start gap-3">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-0.5">
                    <span class="text-sm font-mono font-semibold text-body"
                      >{ignore.pattern_id}</span
                    >
                    <span class="text-xs text-muted font-mono"
                      >{new Date(ignore.created_at).toLocaleDateString()}</span
                    >
                  </div>
                  <div class="text-xs text-muted font-mono mb-1">
                    {shortenPath(ignore.filepath)}
                  </div>
                  {#if ignore.match_text}
                    <code
                      class="block px-2 py-1 bg-canvas rounded text-xs font-mono text-body overflow-x-auto"
                      >{ignore.match_text}</code
                    >
                  {/if}
                  {#if ignore.reason}
                    <div class="text-xs text-muted italic mt-1">Reason: {ignore.reason}</div>
                  {/if}
                </div>
                <button
                  onclick={() => unignore(ignore)}
                  title="Remove this suppression — pattern will be re-raised on next scan"
                  class="px-2 py-1 bg-surface border border-border rounded text-xs font-sans text-muted hover:text-warning hover:border-warning transition-colors flex-shrink-0"
                >
                  Un-ignore
                </button>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  {/if}
</PageLayout>
