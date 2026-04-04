<script>
  import { onMount } from 'svelte';
  import { api } from '../apiClient.js';

  let warnings = $state([]);
  let loading = $state(true);
  let searchQuery = $state('');
  let severityFilter = $state('all');

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
      const data = await api.get('/pattern-warnings?limit=500').catch(() => ({ warnings: [] }));
      warnings = data.warnings || [];
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

  onMount(loadWarnings);
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-6xl mx-auto">
    <div class="flex justify-between items-start mb-6 flex-wrap gap-4">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">Safety</h1>
        <p class="text-sm text-[var(--muted)] font-sans">
          Pattern detection: credentials, debug statements, code quality
        </p>
      </div>
      <div class="flex gap-2">
        {#if warnings.length > 0}
          <button
            onclick={resolveAll}
            class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--success)] rounded text-sm font-sans text-[var(--success)] hover:bg-[var(--success-subtle)] transition-colors"
          >
            Resolve All
          </button>
        {/if}
        <button
          onclick={loadWarnings}
          disabled={loading}
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors disabled:opacity-50"
        >
          {loading ? '...' : '↻'} Refresh
        </button>
      </div>
    </div>

    {#if loading}
      <div class="space-y-3">
        {#each Array(3) as _, i (i)}
          <div
            class="h-16 bg-[var(--surface)] border border-[var(--border)] rounded animate-pulse"
          ></div>
        {/each}
      </div>
    {:else}
      <!-- Status -->
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4 mb-6">
        <div class="flex items-center gap-2">
          <span
            class="w-2 h-2 rounded-full {status === 'healthy'
              ? 'bg-[var(--success)]'
              : 'bg-[var(--warning)]'}"
          ></span>
          <span class="text-sm font-mono font-semibold text-[var(--text)]">
            {status === 'healthy'
              ? 'All Clear — no pattern warnings detected'
              : `${warnings.length} pattern warning${warnings.length === 1 ? '' : 's'} detected`}
          </span>
        </div>
      </div>

      {#if warnings.length > 0}
        <!-- Search + Filter -->
        <div class="flex gap-3 mb-4 flex-wrap items-center">
          <input
            type="text"
            placeholder="Search warnings..."
            bind:value={searchQuery}
            class="flex-1 min-w-[200px] px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
          />
          {#each ['all', 'error', 'warning', 'info'] as sev (sev)}
            <button
              onclick={() => (severityFilter = sev)}
              class="px-3 py-1.5 border rounded text-sm font-sans transition-colors {severityFilter ===
              sev
                ? 'bg-[var(--accent-subtle)] border-[var(--accent)] text-[var(--accent)]'
                : 'bg-[var(--surface)] border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)]'}"
            >
              {sev === 'all' ? 'All' : sev.charAt(0).toUpperCase() + sev.slice(1)}
            </button>
          {/each}
        </div>

        <!-- Warnings List -->
        {#if filteredWarnings.length === 0}
          <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-8 text-center">
            <p class="text-sm text-[var(--muted)]">No matching warnings</p>
          </div>
        {:else}
          <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg">
            <div class="divide-y divide-[var(--border)]">
              {#each filteredWarnings as warning (warning.id)}
                <div class="px-5 py-3 flex items-start gap-3">
                  <span
                    class="w-2 h-2 rounded-full flex-shrink-0 mt-1.5 {warning.severity ===
                      'error' || warning.severity === 'critical'
                      ? 'bg-[var(--error)]'
                      : warning.severity === 'warning'
                        ? 'bg-[var(--warning)]'
                        : 'bg-[var(--accent)]'}"
                  ></span>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-0.5">
                      <span class="text-sm font-mono font-semibold text-[var(--text)]"
                        >{warning.pattern_name || 'Pattern'}</span
                      >
                      <span class="text-xs text-[var(--muted)] font-mono">{warning.severity}</span>
                    </div>
                    <div class="text-xs text-[var(--muted)] mb-1">{warning.message}</div>
                    <div class="text-xs text-[var(--muted)] font-mono">
                      {shortenPath(warning.filepath)}
                      {warning.line_number ? `· Line ${warning.line_number}` : ''}
                    </div>
                    {#if warning.context || warning.match_text}
                      <code
                        class="block mt-2 px-2 py-1 bg-[var(--bg)] rounded text-xs font-mono text-[var(--text)] overflow-x-auto"
                        >{warning.context || warning.match_text}</code
                      >
                    {/if}
                  </div>
                  <button
                    onclick={() => resolveWarning(warning.id)}
                    class="px-2 py-1 bg-[var(--surface)] border border-[var(--success)] rounded text-xs font-sans text-[var(--success)] hover:bg-[var(--success-subtle)] transition-colors flex-shrink-0"
                  >
                    Resolve
                  </button>
                </div>
              {/each}
            </div>
          </div>
          <div class="text-xs text-[var(--muted)] text-center mt-3">
            Showing {filteredWarnings.length} of {warnings.length} warnings
          </div>
        {/if}
      {/if}
    {/if}
  </div>
</div>
