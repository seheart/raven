<script>
  /**
   * Activity Code Changes Page - Detailed file change log with real-time updates
   */

  import { websocketService } from '../services/websocket.js';
  import { api } from '../apiClient.js';
  import { isSourceCodeFile, debounce } from '../utils/helpers.js';
  import DiffViewer from '../DiffViewer.svelte';

  // State
  let events = $state([]);
  let loading = $state(true);
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
  let selectedFilePath = $state('');

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
      filtered = filtered.filter(e =>
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
  const handleFileChanged = (data) => {
    if (isPaused) return;
    console.log('📡 File change detected:', data);
    debouncedLoadEvents();
  };

  const handleAgentEvent = () => {
    if (isPaused) return;
    debouncedLoadEvents();
  };

  const handleProjectSwitched = (data) => {
    console.log('📡 Project switched, reloading data:', data?.project);
    loadEvents();
  };

  async function loadEvents() {
    try {
      loading = true;
      error = null;

      const response = await api.get('/all-file-events?limit=500&diff=false');
      const allEvents = Array.isArray(response) ? response : [];
      console.log('[ActivityCodeChanges] API returned:', allEvents.length, 'events');
      console.log('[ActivityCodeChanges] First event:', allEvents[0]);

      // Filter to only show real source code (exclude build artifacts)
      // TEMPORARILY DISABLED FOR DEBUGGING
      // const sourceEvents = allEvents.filter(event => isSourceCodeFile(event.filepath));
      const sourceEvents = allEvents; // Show ALL events for now
      console.log('[ActivityCodeChanges] After isSourceCodeFile filter:', sourceEvents.length, 'events');

      // Process and normalize events
      events = sourceEvents.map(event => ({
        id: event.id || `${event.filepath}-${event.timestamp}`,
        timestamp: event.timestamp || new Date().toISOString(),
        filepath: event.filepath || event.file,
        change_type: normalizeChangeType(event.change_type || event.event_type),
        agent: event.agent,
        event_size: event.event_size || 0,
        duration_ms: event.duration_ms,
        project: event.project,
        file_hash: event.file_hash
      }));

      lastUpdated = new Date();
      loading = false;
    } catch (err) {
      console.error('Failed to load events:', err);
      error = err.message;
      loading = false;
    }
  }

  function formatTime(timestamp) {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleString();
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return 'N/A';
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }

  function loadMore() {
    eventsLimit += 50;
  }

  function togglePause() {
    isPaused = !isPaused;
  }

  function getChangeTypeColor(changeType) {
    switch (changeType) {
      case 'created': return 'var(--success)';
      case 'modified': return 'var(--accent)';
      case 'deleted': return 'var(--error)';
      default: return 'var(--text)';
    }
  }

  async function viewDiff(event) {
    try {
      selectedFilePath = event.filepath;

      // Try to fetch the diff from the API
      const response = await api.get(`/file-diff/${event.id}`);

      if (response.diff) {
        diffText = response.diff;
        diffOldContent = '';
        diffNewContent = '';
      } else if (response.oldContent !== undefined && response.newContent !== undefined) {
        diffOldContent = response.oldContent || '';
        diffNewContent = response.newContent || '';
        diffText = '';
      } else {
        // Fallback: create a simple diff message
        diffText = '';
        diffOldContent = `File: ${event.filepath}\nChange Type: ${event.change_type}\nTimestamp: ${formatTime(event.timestamp)}`;
        diffNewContent = `No diff available for this change.\n\nThis is a ${event.change_type} event.`;
      }

      showDiff = true;
    } catch (err) {
      console.error('Failed to load diff:', err);
      // Show error in diff viewer
      diffOldContent = `Error loading diff for ${event.filepath}`;
      diffNewContent = `Error: ${err.message}`;
      diffText = '';
      showDiff = true;
    }
  }

  // Lifecycle - mount
  $effect(() => {
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
  <div class="max-w-7xl mx-auto">
    <!-- Header -->
    <div class="flex justify-between items-start mb-6">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">Code Changes</h1>
        <p class="text-base text-[var(--muted)] font-sans">Detailed file change history • Source code only</p>
      </div>
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-2">
          <span class="text-sm text-[var(--muted)] font-sans">Status:</span>
          <span
            class="flex items-center gap-1 text-sm font-sans"
            style="color: {websocketService.isConnected() ? 'var(--success)' : 'var(--error)'}"
          >
            <span class="w-2 h-2 rounded-full" style="background: {websocketService.isConnected() ? 'var(--success)' : 'var(--error)'}"></span>
            {websocketService.isConnected() ? 'Live' : 'Offline'}
          </span>
        </div>
        <button
          onclick={togglePause}
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors"
          class:bg-warning={isPaused}
          class:text-white={isPaused}
        >
          {isPaused ? '▶️ Resume' : '⏸️ Pause'}
        </button>
        <button
          onclick={loadEvents}
          disabled={loading}
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors disabled:opacity-50"
        >
          {loading ? '⏳' : '🔄'} Refresh
        </button>
      </div>
    </div>

    {#if error}
      <div class="bg-[var(--error-subtle)] border border-[var(--error)] rounded-lg p-4 mb-6">
        <span class="text-sm text-[var(--error)] font-sans">⚠️ {error}</span>
      </div>
    {/if}

    {#if isPaused}
      <div class="bg-[var(--warning)] bg-opacity-10 border border-[var(--warning)] rounded-lg p-4 mb-6 text-center">
        <span class="text-sm text-[var(--warning)] font-sans font-semibold">⏸️ Live updates paused - Click Resume to continue</span>
      </div>
    {/if}

    <!-- Stats -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
        <div class="text-sm text-[var(--muted)] font-sans">Total Changes</div>
        <div class="text-2xl font-bold text-[var(--text-heading)]">{stats.total}</div>
      </div>
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
        <div class="text-sm text-[var(--muted)] font-sans">Created</div>
        <div class="text-2xl font-bold text-[var(--success)]">{stats.created}</div>
      </div>
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
        <div class="text-sm text-[var(--muted)] font-sans">Modified</div>
        <div class="text-2xl font-bold text-[var(--accent)]">{stats.modified}</div>
      </div>
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
        <div class="text-sm text-[var(--muted)] font-sans">Deleted</div>
        <div class="text-2xl font-bold text-[var(--error)]">{stats.deleted}</div>
      </div>
    </div>

    <!-- Filters -->
    <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 mb-4">
      <div class="flex flex-wrap gap-4 items-center">
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Search files, agents, or projects..."
          class="flex-1 min-w-[200px] px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-sans text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)]"
        />
        <select
          bind:value={selectedType}
          class="px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-sans text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
        >
          <option value="all">All Types</option>
          <option value="created">Created</option>
          <option value="modified">Modified</option>
          <option value="deleted">Deleted</option>
        </select>
        <div class="text-xs text-[var(--muted)] font-sans">
          Last updated: {lastUpdated.toLocaleTimeString()}
        </div>
      </div>
    </div>

    <!-- Events List -->
    {#if loading}
      <div class="text-center py-12">
        <div class="text-4xl mb-4">⏳</div>
        <div class="text-[var(--muted)] font-sans">Loading changes...</div>
      </div>
    {:else if filteredEvents.length === 0}
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center">
        <div class="text-5xl mb-4">📝</div>
        <div class="text-xl font-semibold text-[var(--text-heading)] mb-2">No changes found</div>
        <div class="text-base text-[var(--muted)] font-sans">
          {searchQuery || selectedType !== 'all' ? 'Try adjusting your filters' : 'Waiting for code changes to be detected'}
        </div>
      </div>
    {:else}
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="bg-[var(--bg)] border-b border-[var(--border)]">
              <tr>
                <th class="px-4 py-3 text-left text-sm font-semibold text-[var(--muted)] font-sans">Type</th>
                <th class="px-4 py-3 text-left text-sm font-semibold text-[var(--muted)] font-sans">File</th>
                <th class="px-4 py-3 text-left text-sm font-semibold text-[var(--muted)] font-sans">Project</th>
                <th class="px-4 py-3 text-left text-sm font-semibold text-[var(--muted)] font-sans">Agent</th>
                <th class="px-4 py-3 text-left text-sm font-semibold text-[var(--muted)] font-sans">Time</th>
                <th class="px-4 py-3 text-left text-sm font-semibold text-[var(--muted)] font-sans">Size</th>
                <th class="px-4 py-3 text-left text-sm font-semibold text-[var(--muted)] font-sans">Hash</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-[var(--border)]">
              {#each filteredEvents as event (event.id)}
                <tr class="hover:bg-[var(--bg)] transition-colors cursor-pointer" onclick={() => viewDiff(event)}>
                  <td class="px-4 py-3">
                    <span
                      class="text-xs px-2 py-1 rounded font-semibold"
                      style="background: {getChangeTypeColor(event.change_type)}20; color: {getChangeTypeColor(event.change_type)}"
                    >
                      {event.change_type?.toUpperCase() || 'UNKNOWN'}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-sm font-mono text-[var(--text)] max-w-md">
                    <div class="truncate" title={event.filepath}>
                      {event.filepath || 'Unknown'}
                    </div>
                  </td>
                  <td class="px-4 py-3 text-sm font-mono text-[var(--muted)]">
                    {#if event.project}
                      <span class="text-xs px-2 py-1 rounded bg-[var(--accent)] bg-opacity-20 text-[var(--accent)]">
                        {event.project}
                      </span>
                    {:else}
                      <span class="text-[var(--muted)]">-</span>
                    {/if}
                  </td>
                  <td class="px-4 py-3 text-sm font-mono text-[var(--muted)]">
                    {event.agent || '-'}
                  </td>
                  <td class="px-4 py-3 text-sm text-[var(--muted)] font-sans">
                    {formatTime(event.timestamp)}
                  </td>
                  <td class="px-4 py-3 text-sm text-[var(--muted)] font-mono">
                    {formatBytes(event.event_size)}
                  </td>
                  <td class="px-4 py-3 text-xs text-[var(--muted)] font-mono">
                    {event.file_hash ? event.file_hash.substring(0, 8) : '-'}
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
            class="px-4 py-2 bg-[var(--accent)] text-white rounded text-sm font-sans hover:opacity-90 transition-opacity"
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
      onClose={() => showDiff = false}
    />
  {/if}
</div>

<style>
  .bg-warning { background: var(--warning); }
  .text-warning { color: var(--warning); }
  .bg-success { background: var(--success); }
  .text-success { color: var(--success); }
  .bg-accent { background: var(--accent); }
  .text-accent { color: var(--accent); }
  .bg-error { background: var(--error); }
  .text-error { color: var(--error); }
  .bg-bg { background: var(--bg); }
  .border { border-width: 1px; }
  .border-border { border-color: var(--border); }
  .text-white { color: white; }
</style>
