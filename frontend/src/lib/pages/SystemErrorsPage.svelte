<script>
  import { onMount, onDestroy } from 'svelte';
  import { api } from '../apiClient.js';
  import { websocketService } from '../services/websocket.js';

  let errors = $state([]);
  let total = $state(0);
  let loading = $state(true);
  let searchQuery = $state('');
  let severityFilter = $state('all');
  let selectedError = $state(null);
  let currentPage = $state(0);
  let pageSize = 50;

  async function loadErrors() {
    try {
      loading = true;
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: (currentPage * pageSize).toString()
      });
      if (searchQuery) params.append('search', searchQuery);
      if (severityFilter !== 'all') params.append('severity', severityFilter);

      const data = await api.get(`/errors?${params}`);
      errors = data.errors || (Array.isArray(data) ? data : []);
      total = data.total || errors.length;
    } catch (err) {
      console.error('Failed to load errors:', err);
    } finally {
      loading = false;
    }
  }

  async function clearAll() {
    if (!confirm('Clear all error logs?')) return;
    try {
      await api.delete('/errors/clear');
      await loadErrors();
    } catch (err) {
      console.error('Failed to clear:', err);
    }
  }

  function toggleError(err) {
    selectedError = selectedError?.id === err.id ? null : err;
  }

  function timeAgo(timestamp) {
    if (!timestamp) return '';
    const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  let searchTimeout;
  function handleSearch(e) {
    clearTimeout(searchTimeout);
    searchQuery = e.target.value;
    searchTimeout = setTimeout(() => {
      currentPage = 0;
      loadErrors();
    }, 300);
  }

  onMount(() => {
    loadErrors();
    websocketService.on('error-logged', () => loadErrors());
  });

  onDestroy(() => {
    websocketService.off('error-logged');
    clearTimeout(searchTimeout);
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-6xl mx-auto">
    <!-- Header -->
    <div class="flex justify-between items-start mb-6 flex-wrap gap-4">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">Errors</h1>
        <p class="text-sm text-[var(--muted)] font-sans">{total} total errors logged</p>
      </div>
      <div class="flex items-center gap-2">
        {#if total > 0}
          <button
            onclick={clearAll}
            class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--error)] rounded text-sm font-sans text-[var(--error)] hover:bg-[var(--error-subtle)] transition-colors"
          >
            Clear All
          </button>
        {/if}
        <button
          onclick={() => {
            currentPage = 0;
            loadErrors();
          }}
          disabled={loading}
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors disabled:opacity-50"
        >
          {loading ? '...' : '↻'} Refresh
        </button>
      </div>
    </div>

    <!-- Search + Filters -->
    <div class="flex gap-3 mb-4 flex-wrap items-center">
      <input
        type="text"
        placeholder="Search errors..."
        value={searchQuery}
        oninput={handleSearch}
        class="flex-1 min-w-[200px] px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
      />
      {#each ['all', 'error', 'warning', 'info'] as sev (sev)}
        <button
          onclick={() => {
            severityFilter = sev;
            currentPage = 0;
            loadErrors();
          }}
          class="px-3 py-1.5 border rounded text-sm font-sans transition-colors {severityFilter ===
          sev
            ? 'bg-[var(--accent-subtle)] border-[var(--accent)] text-[var(--accent)]'
            : 'bg-[var(--surface)] border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)]'}"
        >
          {sev === 'all' ? 'All' : sev.charAt(0).toUpperCase() + sev.slice(1)}
        </button>
      {/each}
    </div>

    <!-- Error List -->
    {#if loading && errors.length === 0}
      <div class="space-y-2">
        {#each Array(5) as _, i (i)}
          <div
            class="h-16 bg-[var(--surface)] border border-[var(--border)] rounded animate-pulse"
          ></div>
        {/each}
      </div>
    {:else if errors.length === 0}
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center">
        <p class="text-sm text-[var(--muted)]">No errors found</p>
      </div>
    {:else}
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg">
        <div class="divide-y divide-[var(--border)]">
          {#each errors as err (err.id)}
            <div>
              <button
                onclick={() => toggleError(err)}
                class="w-full text-left px-5 py-3 flex items-start gap-3 hover:bg-[var(--bg)] transition-colors"
              >
                <span
                  class="w-2 h-2 rounded-full flex-shrink-0 mt-1.5 {err.severity === 'error'
                    ? 'bg-[var(--error)]'
                    : err.severity === 'warning'
                      ? 'bg-[var(--warning)]'
                      : 'bg-[var(--accent)]'}"
                ></span>
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-mono text-[var(--text)] truncate">{err.message}</div>
                  <div class="text-xs text-[var(--muted)] mt-0.5 flex gap-2">
                    <span>{err.file || err.component || 'unknown'}</span>
                    <span>·</span>
                    <span>{err.severity || 'error'}</span>
                  </div>
                </div>
                <span class="text-xs text-[var(--muted)] font-mono flex-shrink-0"
                  >{timeAgo(err.timestamp)}</span
                >
              </button>

              {#if selectedError?.id === err.id}
                <div class="px-5 pb-4 border-t border-[var(--border)] bg-[var(--bg)]">
                  <div class="grid grid-cols-2 gap-3 py-3 text-sm">
                    <div class="flex justify-between border-b border-[var(--border)] pb-2">
                      <span class="text-[var(--muted)]">ID</span>
                      <span class="font-mono text-[var(--text)]">{err.id}</span>
                    </div>
                    <div class="flex justify-between border-b border-[var(--border)] pb-2">
                      <span class="text-[var(--muted)]">Severity</span>
                      <span class="font-mono text-[var(--text)]">{err.severity}</span>
                    </div>
                    <div class="flex justify-between border-b border-[var(--border)] pb-2">
                      <span class="text-[var(--muted)]">File</span>
                      <span class="font-mono text-[var(--text)] text-xs">{err.file || 'N/A'}</span>
                    </div>
                    <div class="flex justify-between border-b border-[var(--border)] pb-2">
                      <span class="text-[var(--muted)]">Line</span>
                      <span class="font-mono text-[var(--text)]">{err.line || 'N/A'}</span>
                    </div>
                    <div
                      class="col-span-2 flex justify-between border-b border-[var(--border)] pb-2"
                    >
                      <span class="text-[var(--muted)]">Timestamp</span>
                      <span class="font-mono text-[var(--text)] text-xs">{err.timestamp}</span>
                    </div>
                  </div>
                  {#if err.stack}
                    <div class="mt-2">
                      <div
                        class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-1"
                      >
                        Stack Trace
                      </div>
                      <pre
                        class="text-xs font-mono bg-[var(--surface)] border border-[var(--border)] rounded p-3 overflow-x-auto max-h-48 overflow-y-auto text-[var(--text)]">{err.stack}</pre>
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>

      <!-- Pagination -->
      {#if total > pageSize}
        <div class="flex justify-center items-center gap-4 mt-4">
          <button
            onclick={() => {
              currentPage--;
              loadErrors();
            }}
            disabled={currentPage === 0}
            class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm hover:border-[var(--accent)] transition-colors disabled:opacity-30"
          >
            Previous
          </button>
          <span class="text-xs text-[var(--muted)] font-mono">
            Page {currentPage + 1} of {Math.ceil(total / pageSize)}
          </span>
          <button
            onclick={() => {
              currentPage++;
              loadErrors();
            }}
            disabled={(currentPage + 1) * pageSize >= total}
            class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm hover:border-[var(--accent)] transition-colors disabled:opacity-30"
          >
            Next
          </button>
        </div>
      {/if}
    {/if}
  </div>
</div>
