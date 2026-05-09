<script>
  import { logger } from '../logger.js';
  import { formatDateTime, formatTimeOnly } from '../timeFormat.js';
  import { PageLayout, PageHeader } from '../components/layout/index.js';
  import { RefreshButton, EmptyState, ToolbarButton } from '../components/ui/index.js';
  /**
   * Activity Code Changes Page - Detailed file change log with real-time updates
   */

  import { onMount } from 'svelte';
  import { websocketService } from '../services/websocket.js';
  import { createPageApi } from '../apiClient.js';
  const { api, abort: abortRequests } = createPageApi();
  import { isSourceCodeFile, debounce } from '../utils/helpers.js';
  import DiffViewer from '../DiffViewer.svelte';

  // State
  let events = $state([]);
  let loading = $state(false);
  let error = $state(null);
  let searchQuery = $state('');
  let selectedType = $state('all');
  let eventsLimit = $state(50);
  let lastUpdated = $state(new Date());
  let isPaused = $state(false);

  // DiffViewer state
  let showDiff = $state(false);
  let diffOldContent = $state('');
  let diffNewContent = $state('');
  let diffText = $state('');
  /** @type {Array<{line_number:number, severity:string, rule_id:string, rule_name:string, message:string}>} */
  let diffAnnotations = $state([]);

  // Per-event risk roll-ups for the events list (keyed by event_id).
  /** @type {Record<number, { critical_count:number, warning_count:number, info_count:number, highest_severity:string|null }>} */
  let riskByEventId = $state({});

  // Debounced timeout reference
  let debouncedTimeoutId;

  // Normalize change type (map various event types to standard ones)
  function normalizeChangeType(changeType) {
    if (!changeType) return 'modified';
    const type = changeType.toLowerCase();
    if (type === 'add' || type === 'create') return 'created';
    if (type === 'change' || type === 'modify' || type === 'edit') return 'modified';
    if (type === 'unlink' || type === 'delete') return 'deleted';
    return 'modified';
  }

  // Derived
  const filteredEvents = $derived.by(() => {
    let filtered = events;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        e =>
          e.filepath?.toLowerCase().includes(query) ||
          e.agent?.toLowerCase().includes(query) ||
          e.project?.toLowerCase().includes(query)
      );
    }

    if (selectedType !== 'all') {
      filtered = filtered.filter(e => e.change_type === selectedType);
    }

    return filtered.slice(0, eventsLimit);
  });

  const stats = $derived.by(() => {
    const total = events.length;
    const created = events.filter(e => e.change_type === 'created').length;
    const modified = events.filter(e => e.change_type === 'modified').length;
    const deleted = events.filter(e => e.change_type === 'deleted').length;
    return { total, created, modified, deleted };
  });

  // Debounced reload function
  const debouncedLoadEvents = debounce(async () => {
    if (!isPaused) {
      await loadEvents();
    }
  }, 300);

  // WebSocket event handlers
  const handleFileChanged = data => {
    if (isPaused) return;
    logger.debug(' File change detected:', data);
    debouncedLoadEvents();
  };

  const handleAgentEvent = () => {
    if (isPaused) return;
    debouncedLoadEvents();
  };

  async function loadEvents() {
    try {
      loading = true;
      error = null;

      const response = await api.get('/file-events?limit=500&diff=false');
      const allEvents = Array.isArray(response) ? response : [];
      // Filter to only show real source code (exclude build artifacts)
      const sourceEvents = allEvents.filter(event => isSourceCodeFile(event.filepath));

      // Process and normalize events
      events = sourceEvents.map(event => ({
        id: event.id || `${event.filepath}-${event.timestamp}`,
        timestamp: event.timestamp || new Date().toISOString(),
        filepath: event.filepath || event.file,
        change_type: normalizeChangeType(event.change_type || event.event_type),
        agent: event.agent,
        event_size: event.event_size || 0,
        duration_ms: event.duration_ms,
        project: event.filepath?.split('/')[0] || event.project_name || event.project,
        file_hash: event.file_hash
      }));

      lastUpdated = new Date();
      loading = false;
    } catch (err) {
      logger.error('Failed to load events:', err);
      error = err.message;
      loading = false;
    }
  }

  function formatTime(timestamp) {
    if (!timestamp) return 'N/A';
    return formatDateTime(timestamp);
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return 'N/A';
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }

  async function viewDiff(event) {
    try {
      // Prefer the new /api/diffs/:event_id endpoint when we know the
      // event id — it returns the diff and any persisted annotations in
      // a single round-trip and lazily computes annotations on first
      // read. Fall back to the filepath-based file-events query when no
      // id is available (defensive; events should always have one).
      if (event?.id != null) {
        const data = await api.get(`/diffs/${event.id}`);
        if (data?.event?.diff) {
          diffText = data.event.diff;
          diffOldContent = '';
          diffNewContent = '';
          diffAnnotations = Array.isArray(data.annotations) ? data.annotations : [];
          showDiff = true;
          return;
        }
      }
      const data = await api.get(
        `/file-events?limit=1&diff=true&filepath=${encodeURIComponent(event.filepath)}`
      );
      const events = Array.isArray(data) ? data : [];
      if (events.length > 0 && events[0].diff) {
        diffText = events[0].diff;
        diffOldContent = '';
        diffNewContent = '';
        diffAnnotations = [];
        showDiff = true;
      }
    } catch (err) {
      logger.error('Failed to load diff:', err);
    }
  }

  async function loadRiskSummaries() {
    try {
      const data = await api.get('/diffs/risk/recent?limit=100');
      const next = {};
      for (const row of Array.isArray(data) ? data : []) {
        next[row.event_id] = row;
      }
      riskByEventId = next;
    } catch {
      // Silent — risk badges are supplementary
    }
  }

  function loadMore() {
    eventsLimit += 50;
  }

  function _togglePause() {
    isPaused = !isPaused;
  }

  function getChangeTypeColor(changeType) {
    switch (changeType) {
      case 'created':
        return 'var(--success)';
      case 'modified':
        return 'var(--accent)';
      case 'deleted':
        return 'var(--error)';
      default:
        return 'var(--text)';
    }
  }

  // Lifecycle - mount
  onMount(() => {
    // Load initial data
    loadEvents();
    loadRiskSummaries();

    // Connect to WebSocket for real-time updates
    websocketService.connect();

    // Listen for file change events ('project-switched' had no backend emit)
    websocketService.on('file-changed', handleFileChanged);
    websocketService.on('agent-event', handleAgentEvent);

    // Cleanup
    return () => {
      abortRequests();
      websocketService.off('file-changed', handleFileChanged);
      websocketService.off('agent-event', handleAgentEvent);

      if (debouncedTimeoutId) {
        clearTimeout(debouncedTimeoutId);
      }
    };
  });
</script>

<PageLayout>
  <PageHeader title="Code Changes" description="Source code file change history">
    {#snippet actions()}
      <div class="flex items-center gap-3">
        <span class="text-xs text-muted font-mono">{formatTimeOnly(lastUpdated)}</span>
        <RefreshButton onClick={loadEvents} {loading} />
      </div>
    {/snippet}
  </PageHeader>

  {#if error}
    <div class="bg-error-subtle border border-error rounded-lg p-4 mb-6">
      <span class="text-sm text-error font-sans"> {error}</span>
    </div>
  {/if}

  <!-- Stats -->
  <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
    <div class="bg-surface border border-border rounded p-4">
      <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Total Changes</div>
      <div class="text-sm font-mono text-body">{stats.total}</div>
    </div>
    <div class="bg-surface border border-border rounded p-4">
      <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Created</div>
      <div class="text-sm font-mono text-body">{stats.created}</div>
    </div>
    <div class="bg-surface border border-border rounded p-4">
      <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Modified</div>
      <div class="text-sm font-mono text-body">{stats.modified}</div>
    </div>
    <div class="bg-surface border border-border rounded p-4">
      <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Deleted</div>
      <div class="text-sm font-mono text-body">{stats.deleted}</div>
    </div>
  </div>

  <!-- Filters -->
  <div class="bg-surface border border-border rounded-lg p-4 mb-6">
    <div class="flex flex-wrap gap-4 items-center">
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Search files or projects..."
        class="flex-1 min-w-[200px] px-3 py-1.5 bg-canvas border border-border rounded text-sm font-mono text-body placeholder:text-muted focus:outline-none focus:border-accent"
      />
      <select
        bind:value={selectedType}
        class="px-3 py-1.5 bg-canvas border border-border rounded text-sm font-mono text-body focus:outline-none focus:border-accent"
      >
        <option value="all">All Types</option>
        <option value="created">Created</option>
        <option value="modified">Modified</option>
        <option value="deleted">Deleted</option>
      </select>
      <div class="text-xs text-muted font-mono">
        {filteredEvents.length} of {events.length} changes
      </div>
    </div>
  </div>

  <!-- Events List -->
  {#if loading}
    <div class="text-center py-12">
      <div class="text-sm text-muted font-sans">Loading changes...</div>
    </div>
  {:else if filteredEvents.length === 0}
    <EmptyState
      title="No changes found"
      description={searchQuery || selectedType !== 'all'
        ? 'Try adjusting your filters'
        : 'Waiting for code changes to be detected'}
    />
  {:else}
    <div class="border-t border-b border-border font-mono text-sm overflow-x-auto">
      <table class="w-full">
        <thead class="bg-canvas">
          <tr class="text-[11px] text-muted uppercase tracking-wide">
            <th class="text-left font-semibold px-3 py-1 w-24">Type</th>
            <th class="text-left font-semibold px-3 py-1">File</th>
            <th class="text-left font-semibold px-3 py-1">Project</th>
            <th class="text-right font-semibold px-3 py-1">Size</th>
            <th class="text-right font-semibold px-3 py-1">Time</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredEvents as event (event.id)}
            <tr class="hover:bg-surface/40 cursor-pointer" onclick={() => viewDiff(event)}>
              <td class="px-3 py-0.5">
                <span
                  class="font-bold uppercase"
                  style="color: {getChangeTypeColor(event.change_type)}"
                  >{event.change_type?.toUpperCase() || 'UNKNOWN'}</span
                >
              </td>
              <td class="px-3 py-0.5 text-body max-w-[28rem]">
                <div class="flex items-baseline gap-2">
                  {#if riskByEventId[event.id]?.highest_severity}
                    {@const r = riskByEventId[event.id]}
                    <span
                      class="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold border flex-shrink-0 {r.highest_severity ===
                      'critical'
                        ? 'bg-error/15 text-error border-error/30'
                        : r.highest_severity === 'warning'
                          ? 'bg-warning/15 text-warning border-warning/30'
                          : 'bg-info/15 text-info border-info/30'}"
                      title="{r.critical_count} critical · {r.warning_count} warning · {r.info_count} info"
                      aria-label="risk: {r.highest_severity}"
                      >{r.highest_severity === 'critical'
                        ? '!'
                        : r.highest_severity === 'warning'
                          ? '⚠'
                          : 'i'}</span
                    >
                  {/if}
                  <span class="truncate" title={event.filepath}>{event.filepath || 'Unknown'}</span>
                </div>
              </td>
              <td class="px-3 py-0.5 text-muted">{event.project || '-'}</td>
              <td class="px-3 py-0.5 text-muted text-right">{formatBytes(event.event_size)}</td>
              <td class="px-3 py-0.5 text-muted text-right">{formatTime(event.timestamp)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    {#if filteredEvents.length < events.length}
      <div class="mt-4 text-center">
        <ToolbarButton onClick={loadMore}
          >Load More ({filteredEvents.length} of {events.length})</ToolbarButton
        >
      </div>
    {:else if events.length > 0}
      <div class="mt-4 text-center text-sm text-muted font-sans">
        Showing all {filteredEvents.length} changes
      </div>
    {/if}
  {/if}

  <!-- DiffViewer Modal -->
  {#if showDiff}
    <DiffViewer
      diff={diffText}
      oldContent={diffOldContent}
      newContent={diffNewContent}
      annotations={diffAnnotations}
      onClose={() => (showDiff = false)}
    />
  {/if}
</PageLayout>
