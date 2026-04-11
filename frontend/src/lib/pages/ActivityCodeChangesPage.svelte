<script>
  import { logger } from '../logger.js';
  import { formatDateTime, formatTimeOnly } from '../timeFormat.js';
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

  const handleProjectSwitched = data => {
    logger.debug(' Project switched, reloading data:', data?.project);
    loadEvents();
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
      const data = await api.get(
        `/file-events?limit=1&diff=true&filepath=${encodeURIComponent(event.filepath)}`
      );
      const events = Array.isArray(data) ? data : [];
      if (events.length > 0 && events[0].diff) {
        diffText = events[0].diff;
        diffOldContent = '';
        diffNewContent = '';
        showDiff = true;
      }
    } catch (err) {
      logger.error('Failed to load diff:', err);
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

    // Connect to WebSocket for real-time updates
    websocketService.connect();

    // Listen for file change events
    websocketService.on('file-changed', handleFileChanged);
    websocketService.on('agent-event', handleAgentEvent);
    websocketService.on('project-switched', handleProjectSwitched);

    // Cleanup
    return () => {
      abortRequests();
      websocketService.off('file-changed', handleFileChanged);
      websocketService.off('agent-event', handleAgentEvent);
      websocketService.off('project-switched', handleProjectSwitched);

      if (debouncedTimeoutId) {
        clearTimeout(debouncedTimeoutId);
      }
    };
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-6xl mx-auto">
    <!-- Header -->
    <div class="flex justify-between items-start mb-6 flex-wrap gap-4">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">Code Changes</h1>
        <p class="text-sm text-[var(--muted)] font-sans">Source code file change history</p>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-xs text-[var(--muted)] font-mono">{formatTimeOnly(lastUpdated)}</span
        >
        <button
          onclick={loadEvents}
          disabled={loading}
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors disabled:opacity-50"
        >
          {loading ? '...' : '↻'} Refresh
        </button>
      </div>
    </div>

    {#if error}
      <div class="bg-[var(--error-subtle)] border border-[var(--error)] rounded-lg p-4 mb-6">
        <span class="text-sm text-[var(--error)] font-sans"> {error}</span>
      </div>
    {/if}

    <!-- Stats -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
        <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
          Total Changes
        </div>
        <div class="text-sm font-mono text-[var(--text)]">{stats.total}</div>
      </div>
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
        <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
          Created
        </div>
        <div class="text-sm font-mono text-[var(--text)]">{stats.created}</div>
      </div>
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
        <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
          Modified
        </div>
        <div class="text-sm font-mono text-[var(--text)]">{stats.modified}</div>
      </div>
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
        <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
          Deleted
        </div>
        <div class="text-sm font-mono text-[var(--text)]">{stats.deleted}</div>
      </div>
    </div>

    <!-- Filters -->
    <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 mb-6">
      <div class="flex flex-wrap gap-4 items-center">
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Search files or projects..."
          class="flex-1 min-w-[200px] px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-mono text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)]"
        />
        <select
          bind:value={selectedType}
          class="px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
        >
          <option value="all">All Types</option>
          <option value="created">Created</option>
          <option value="modified">Modified</option>
          <option value="deleted">Deleted</option>
        </select>
        <div class="text-xs text-[var(--muted)] font-mono">
          {filteredEvents.length} of {events.length} changes
        </div>
      </div>
    </div>

    <!-- Events List -->
    {#if loading}
      <div class="text-center py-12">
        <div class="text-sm text-[var(--muted)] font-sans">Loading changes...</div>
      </div>
    {:else if filteredEvents.length === 0}
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center">
        <div class="text-sm font-semibold text-[var(--text-heading)] mb-2">No changes found</div>
        <div class="text-sm text-[var(--muted)] font-sans">
          {searchQuery || selectedType !== 'all'
            ? 'Try adjusting your filters'
            : 'Waiting for code changes to be detected'}
        </div>
      </div>
    {:else}
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="bg-[var(--bg)] border-b border-[var(--border)]">
              <tr class="text-left">
                <th
                  class="px-3 py-2 text-xs font-semibold text-[var(--muted)] uppercase tracking-wide"
                  >Type</th
                >
                <th
                  class="px-3 py-2 text-xs font-semibold text-[var(--muted)] uppercase tracking-wide"
                  >File</th
                >
                <th
                  class="px-3 py-2 text-xs font-semibold text-[var(--muted)] uppercase tracking-wide"
                  >Project</th
                >
                <th
                  class="px-3 py-2 text-xs font-semibold text-[var(--muted)] uppercase tracking-wide text-right"
                  >Size</th
                >
                <th
                  class="px-3 py-2 text-xs font-semibold text-[var(--muted)] uppercase tracking-wide text-right"
                  >Time</th
                >
              </tr>
            </thead>
            <tbody>
              {#each filteredEvents as event (event.id)}
                <tr
                  class="border-b border-[var(--border)] hover:bg-[var(--bg)] transition-colors cursor-pointer"
                  onclick={() => viewDiff(event)}
                >
                  <td class="px-3 py-2">
                    <span
                      class="text-xs px-2 py-0.5 rounded font-semibold font-mono"
                      style="background: {getChangeTypeColor(
                        event.change_type
                      )}15; color: {getChangeTypeColor(event.change_type)}"
                    >
                      {event.change_type?.toUpperCase() || 'UNKNOWN'}
                    </span>
                  </td>
                  <td class="px-3 py-2 text-sm font-mono text-[var(--text)] max-w-md">
                    <div class="truncate" title={event.filepath}>
                      {event.filepath || 'Unknown'}
                    </div>
                  </td>
                  <td class="px-3 py-2 text-sm font-mono text-[var(--muted)]">
                    {event.project || '-'}
                  </td>
                  <td class="px-3 py-2 text-sm font-mono text-[var(--muted)] text-right">
                    {formatBytes(event.event_size)}
                  </td>
                  <td class="px-3 py-2 text-xs font-mono text-[var(--muted)] text-right">
                    {formatTime(event.timestamp)}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>

      {#if filteredEvents.length < events.length}
        <div class="mt-4 text-center">
          <button
            onclick={loadMore}
            class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors"
          >
            Load More ({filteredEvents.length} of {events.length})
          </button>
        </div>
      {:else if events.length > 0}
        <div class="mt-4 text-center text-sm text-[var(--muted)] font-sans">
          Showing all {filteredEvents.length} changes
        </div>
      {/if}
    {/if}
  </div>

  <!-- DiffViewer Modal -->
  {#if showDiff}
    <DiffViewer
      diff={diffText}
      oldContent={diffOldContent}
      newContent={diffNewContent}
      onClose={() => (showDiff = false)}
    />
  {/if}
</div>
