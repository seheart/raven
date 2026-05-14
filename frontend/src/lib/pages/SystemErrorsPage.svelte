<script>
  import { onMount, onDestroy } from 'svelte';
  import { createPageApi } from '../apiClient.js';
  import { PageLayout, PageHeader } from '../components/layout/index.js';
  import {
    RefreshButton,
    EmptyState,
    ToolbarButton,
    FilterToggle,
    DataFetchError
  } from '../components/ui/index.js';
  const { api, abort: abortRequests } = createPageApi();
  import { websocketService } from '../services/websocket.js';

  let errors = $state([]);
  let total = $state(0);
  let loading = $state(true);
  let searchQuery = $state('');
  let severityFilter = $state('all');
  let selectedError = $state(null);
  let currentPage = $state(0);
  let pageSize = 50;
  /** @type {string|null} */
  let loadError = $state(null);

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
      loadError = null;
    } catch (err) {
      // Don't swallow — surface inline so the page never silently shows
      // an empty state when the API actually failed.
      loadError = err?.message || String(err);
      errors = [];
      total = 0;
    } finally {
      loading = false;
    }
  }

  async function clearAll() {
    if (!confirm('Clear all error logs?')) return;
    try {
      await api.delete('/errors/clear');
      errors = [];
      total = 0;
      selectedError = null;
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

  // Backend emits 'app-error' (and 'errors-cleared'), not 'error-logged'.
  // Listening for 'error-logged' was effectively a no-op.
  const onErrorEvent = () => loadErrors();

  onMount(() => {
    loadErrors();
    websocketService.on('app-error', onErrorEvent);
    websocketService.on('errors-cleared', onErrorEvent);
  });

  onDestroy(() => {
    abortRequests();
    websocketService.off('app-error', onErrorEvent);
    websocketService.off('errors-cleared', onErrorEvent);
    clearTimeout(searchTimeout);
  });
</script>

<PageLayout>
  <PageHeader
    title="Errors"
    description={total === 0
      ? 'Backend errors and unhandled exceptions land here. A clean list means everything Raven has been asked to do has succeeded.'
      : `${total} total ${total === 1 ? 'error' : 'errors'} logged. Click a row to see the request body, stack, and severity.`}
  >
    {#snippet actions()}
      <div class="flex items-center gap-2">
        {#if total > 0}
          <ToolbarButton variant="danger" onClick={clearAll}>Clear All</ToolbarButton>
        {/if}
        <RefreshButton
          onClick={() => {
            currentPage = 0;
            loadErrors();
          }}
          {loading}
        />
      </div>
    {/snippet}
  </PageHeader>

  {#if loadError}
    <DataFetchError
      endpoint="/api/errors"
      message="Failed to load error log"
      hint={loadError}
      onRetry={() => loadErrors()}
    />
  {/if}

  <!-- Search + filters: only show when there's actually something to filter
         OR an active query/filter is in place. Audit flagged the empty-state
         filter row as confusing (chips + search box on a blank page). -->
  {#if total > 0 || searchQuery || severityFilter !== 'all'}
    <div class="flex gap-3 mb-4 flex-wrap items-center">
      <input
        type="text"
        placeholder="Search errors..."
        value={searchQuery}
        oninput={handleSearch}
        class="flex-1 min-w-[200px] px-3 py-1.5 bg-surface border border-border rounded text-sm font-mono text-body focus:outline-none focus:border-accent"
      />
      {#each ['all', 'error', 'warning', 'info'] as sev (sev)}
        <FilterToggle
          active={severityFilter === sev}
          onClick={() => {
            severityFilter = sev;
            currentPage = 0;
            loadErrors();
          }}
        >
          {sev === 'all' ? 'All' : sev.charAt(0).toUpperCase() + sev.slice(1)}
        </FilterToggle>
      {/each}
    </div>
  {/if}

  <!-- Error List -->
  {#if loading && errors.length === 0}
    <div class="space-y-2">
      {#each Array(5) as _, i (i)}
        <div class="h-16 bg-surface border border-border rounded animate-pulse"></div>
      {/each}
    </div>
  {:else if errors.length === 0}
    <EmptyState
      title="No errors detected"
      description="Raven's backend hasn't logged any 4xx/5xx responses or unhandled exceptions. If something fails — an API call, a parser, an analysis run — it'll appear here with the request body, stack, and severity. An empty list is the healthy state."
      icon="✓"
    />
  {:else}
    <div class="bg-surface border border-border rounded-lg">
      <div class="divide-y divide-[var(--border)] max-h-[500px] overflow-y-auto">
        {#each errors as err (err.id)}
          <div>
            <button
              onclick={() => toggleError(err)}
              class="w-full text-left px-5 py-3 flex items-start gap-3 hover:bg-canvas transition-colors"
            >
              <span
                class="w-2 h-2 rounded-full flex-shrink-0 mt-1.5 {err.severity === 'error'
                  ? 'bg-error'
                  : err.severity === 'warning'
                    ? 'bg-warning'
                    : 'bg-accent'}"
              ></span>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-mono text-body truncate">{err.message}</div>
                <div class="text-xs text-muted mt-0.5 flex gap-2">
                  <span>{err.component || err.url || 'unknown'}</span>
                  <span>·</span>
                  <span>{err.severity || 'error'}</span>
                </div>
              </div>
              <span class="text-xs text-muted font-mono flex-shrink-0"
                >{timeAgo(err.timestamp)}</span
              >
            </button>

            {#if selectedError?.id === err.id}
              <div class="px-5 pb-4 border-t border-border bg-canvas">
                <div class="grid grid-cols-2 gap-3 py-3 text-sm">
                  <div class="flex justify-between border-b border-border pb-2">
                    <span class="text-muted">ID</span>
                    <span class="font-mono text-body">{err.id}</span>
                  </div>
                  <div class="flex justify-between border-b border-border pb-2">
                    <span class="text-muted">Severity</span>
                    <span class="font-mono text-body">{err.severity}</span>
                  </div>
                  <div class="flex justify-between border-b border-border pb-2">
                    <span class="text-muted">Component</span>
                    <span class="font-mono text-body text-xs">{err.component || 'N/A'}</span>
                  </div>
                  <div class="flex justify-between border-b border-border pb-2">
                    <span class="text-muted">URL</span>
                    <span class="font-mono text-body text-xs">{err.url || 'N/A'}</span>
                  </div>
                  <div class="col-span-2 flex justify-between border-b border-border pb-2">
                    <span class="text-muted">Timestamp</span>
                    <span class="font-mono text-body text-xs">{err.timestamp}</span>
                  </div>
                </div>
                {#if err.stack}
                  <div class="mt-2">
                    <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-1">
                      Stack Trace
                    </div>
                    <pre
                      class="text-xs font-mono bg-surface border border-border rounded p-3 overflow-x-auto max-h-48 overflow-y-auto text-body">{err.stack}</pre>
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
          class="px-3 py-1.5 bg-surface border border-border rounded text-sm hover:border-accent transition-colors disabled:opacity-30"
        >
          Previous
        </button>
        <span class="text-xs text-muted font-mono">
          Page {currentPage + 1} of {Math.ceil(total / pageSize)}
        </span>
        <button
          onclick={() => {
            currentPage++;
            loadErrors();
          }}
          disabled={(currentPage + 1) * pageSize >= total}
          class="px-3 py-1.5 bg-surface border border-border rounded text-sm hover:border-accent transition-colors disabled:opacity-30"
        >
          Next
        </button>
      </div>
    {/if}
  {/if}
</PageLayout>
