<script>
  import { logger } from '../logger.js';
  import { api } from '../apiClient.js';
  /**
   * Session Replay Page
   * Review coding sessions and event timelines
   */

  import { onMount } from 'svelte';

  // State
  let events = $state([]);
  let allSessions = $state([]);
  let selectedSession = $state('all');
  let loading = $state(true);
  let lastUpdated = $state(null);

  // Filters
  let searchQuery = $state('');
  let selectedEventTypes = $state({
    edit: true,
    create: true,
    delete: true,
    read: true,
    execute: true,
    'session-start': true,
    'session-end': true
  });
  let selectedAgent = $state('all');
  let selectedTimeBucket = $state(null);

  // Derived data
  const filteredEvents = $derived.by(() => {
    return events.filter(event => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesFile = event.file?.toLowerCase().includes(query);
        const matchesAgent = event.agent?.toLowerCase().includes(query);
        const matchesMessage = event.message?.toLowerCase().includes(query);
        if (!matchesFile && !matchesAgent && !matchesMessage) {
          return false;
        }
      }

      // Event type filter
      if (event.event_type && !selectedEventTypes[event.event_type]) {
        return false;
      }

      // Agent filter
      if (selectedAgent !== 'all' && event.agent !== selectedAgent) {
        return false;
      }

      return true;
    });
  });

  const uniqueAgents = $derived.by(() => {
    const agents = new Set();
    events.forEach(e => {
      if (e.agent) agents.add(e.agent);
    });
    return Array.from(agents).sort();
  });

  const timelineBuckets = $derived.by(() => {
    if (filteredEvents.length === 0) return [];

    // Find time range
    const timestamps = filteredEvents.map(e => new Date(e.timestamp).getTime());
    const minTime = Math.min(...timestamps);
    const maxTime = Math.max(...timestamps);

    // Create hourly buckets
    const bucketSize = 60 * 60 * 1000; // 1 hour in ms
    const buckets = [];

    for (let time = minTime; time <= maxTime; time += bucketSize) {
      const bucketEvents = filteredEvents.filter(e => {
        const eventTime = new Date(e.timestamp).getTime();
        return eventTime >= time && eventTime < time + bucketSize;
      });

      if (bucketEvents.length > 0) {
        buckets.push({
          startTime: time,
          count: bucketEvents.length,
          events: bucketEvents,
          label: new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
      }
    }

    return buckets;
  });

  const maxBucketCount = $derived(
    timelineBuckets.length > 0 ? Math.max(...timelineBuckets.map(b => b.count)) : 1
  );

  const displayedEvents = $derived(selectedTimeBucket ? selectedTimeBucket.events : filteredEvents);

  const timeAgo = $derived.by(() => {
    if (!lastUpdated) return 'Just now';
    const seconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
    if (seconds < 10) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  });

  async function loadSessions() {
    try {
      const data = await api.get('/session-id');
      const currentSessionId = data.session_id;

      allSessions = [
        { id: 'all', label: 'All Sessions' },
        { id: currentSessionId, label: `Current Session (${currentSessionId?.slice(0, 8)}...)` }
      ];
    } catch {
      logger.error('Failed to load sessions:', e);
      allSessions = [{ id: 'all', label: 'All Sessions' }];
    }
  }

  async function loadEvents() {
    try {
      loading = true;
      let url = 'http://localhost:3030/api/agent-events?limit=50';

      if (selectedSession !== 'all') {
        url = `http://localhost:3030/api/events-by-session/${selectedSession}`;
      }

      await fetch(url);
      lastUpdated = new Date();
    } catch {
      logger.error('Failed to load events:', e);
    } finally {
      loading = false;
    }
  }

  function onSessionChange() {
    loadEvents();
  }

  function selectTimeBucket(bucket) {
    selectedTimeBucket = bucket === selectedTimeBucket ? null : bucket;
  }

  function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function getEventIcon(eventType) {
    const icons = {
      edit: '✏️',
      create: '➕',
      delete: '🗑️',
      read: '👁️',
      execute: '⚙️',
      'session-start': '▶️',
      'session-end': '⏹️'
    };
    return icons[eventType] || '📝';
  }

  function getEventColor(eventType) {
    const colors = {
      edit: 'var(--info)',
      create: 'var(--success)',
      delete: 'var(--error)',
      read: 'var(--muted)',
      execute: 'var(--warning)',
      'session-start': 'var(--accent)',
      'session-end': 'var(--accent)'
    };
    return colors[eventType] || 'var(--text)';
  }

  onMount(async () => {
    await loadSessions();
    await loadEvents();
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-7xl mx-auto">
    <!-- Header -->
    <div class="flex justify-between items-start mb-6 flex-wrap gap-4">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">🎬 Session Replay</h1>
        <p class="text-base text-[var(--muted)] font-sans">
          Review coding sessions and event timelines
        </p>
      </div>
      <div class="flex items-center gap-3 flex-wrap">
        <span class="text-sm text-[var(--muted)] font-mono">Updated: {timeAgo}</span>
        <div class="flex items-center gap-2">
          <label for="session-select" class="text-sm text-[var(--muted)] font-sans">Session:</label>
          <select
            id="session-select"
            bind:value={selectedSession}
            onchange={onSessionChange}
            class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-mono text-[var(--text)] hover:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          >
            {#each allSessions as session (session.id)}
              <option value={session.id}>{session.label}</option>
            {/each}
          </select>
        </div>
        <button
          onclick={() => loadEvents()}
          disabled={loading}
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors disabled:opacity-50"
        >
          {loading ? '⏳' : '↻'} Refresh
        </button>
      </div>
    </div>

    <!-- Filters -->
    {#if !loading && events.length > 0}
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 mb-6 space-y-4">
        <!-- Search -->
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Search by file, agent, or message..."
          class="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-mono text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
        />

        <!-- Event Type Filters -->
        <div>
          <div class="text-sm text-[var(--muted)] font-sans mb-2">Event Types:</div>
          <div class="flex flex-wrap gap-2">
            <label
              class="flex items-center gap-2 px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded cursor-pointer hover:border-[var(--info)] transition-colors"
            >
              <input type="checkbox" bind:checked={selectedEventTypes.edit} class="w-4 h-4" />
              <span class="text-sm font-mono">✏️ Edit</span>
            </label>
            <label
              class="flex items-center gap-2 px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded cursor-pointer hover:border-[var(--success)] transition-colors"
            >
              <input type="checkbox" bind:checked={selectedEventTypes.create} class="w-4 h-4" />
              <span class="text-sm font-mono">➕ Create</span>
            </label>
            <label
              class="flex items-center gap-2 px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded cursor-pointer hover:border-[var(--error)] transition-colors"
            >
              <input type="checkbox" bind:checked={selectedEventTypes.delete} class="w-4 h-4" />
              <span class="text-sm font-mono">🗑️ Delete</span>
            </label>
            <label
              class="flex items-center gap-2 px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded cursor-pointer hover:border-[var(--muted)] transition-colors"
            >
              <input type="checkbox" bind:checked={selectedEventTypes.read} class="w-4 h-4" />
              <span class="text-sm font-mono">👁️ Read</span>
            </label>
            <label
              class="flex items-center gap-2 px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded cursor-pointer hover:border-[var(--warning)] transition-colors"
            >
              <input type="checkbox" bind:checked={selectedEventTypes.execute} class="w-4 h-4" />
              <span class="text-sm font-mono">⚙️ Execute</span>
            </label>
          </div>
        </div>

        <!-- Agent Filter -->
        {#if uniqueAgents.length > 1}
          <div class="flex items-center gap-3">
            <label for="agent-select" class="text-sm text-[var(--muted)] font-sans">Agent:</label>
            <select
              id="agent-select"
              bind:value={selectedAgent}
              class="px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-mono text-[var(--text)] hover:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            >
              <option value="all">All Agents ({uniqueAgents.length})</option>
              {#each uniqueAgents as agent (agent)}
                <option value={agent}>{agent}</option>
              {/each}
            </select>
          </div>
        {/if}

        <!-- Filter Stats -->
        <div class="text-sm text-[var(--muted)] font-mono">
          Showing {filteredEvents.length} / {events.length} events
        </div>
      </div>
    {/if}

    <!-- Timeline Visualization -->
    {#if !loading && filteredEvents.length > 0 && timelineBuckets.length > 1}
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 mb-6">
        <h3 class="text-lg font-semibold text-[var(--text-heading)] font-sans mb-2">
          ⏱️ Activity Timeline
        </h3>
        <p class="text-sm text-[var(--muted)] font-sans mb-4">
          {selectedTimeBucket
            ? `Showing ${selectedTimeBucket.count} events from ${selectedTimeBucket.label}`
            : 'Click a time bucket to filter events'}
        </p>
        <div class="flex items-end gap-1 h-32 mb-4">
          {#each timelineBuckets as bucket (bucket.startTime)}
            <button
              onclick={() => selectTimeBucket(bucket)}
              class="flex-1 flex flex-col items-center gap-1 group transition-all {bucket ===
              selectedTimeBucket
                ? 'opacity-100'
                : 'opacity-70 hover:opacity-100'}"
            >
              <div
                class="w-full bg-[var(--accent)] rounded-t transition-all {bucket ===
                selectedTimeBucket
                  ? 'ring-2 ring-[var(--accent)]'
                  : 'group-hover:bg-[var(--warning)]'}"
                style="height: {(bucket.count / maxBucketCount) * 100}%"
              ></div>
              <div class="text-xs text-[var(--muted)] font-mono">{bucket.label}</div>
              <div class="text-xs text-[var(--text)] font-mono font-semibold">{bucket.count}</div>
            </button>
          {/each}
        </div>
        {#if selectedTimeBucket}
          <button
            onclick={() => (selectedTimeBucket = null)}
            class="px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--error)] hover:text-[var(--error)] transition-colors"
          >
            ✕ Clear Time Filter
          </button>
        {/if}
      </div>
    {/if}

    <!-- Events List -->
    {#if loading}
      <div class="space-y-3">
        {#each Array(5) as _, i (i)}
          <div
            class="h-24 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-pulse"
          ></div>
        {/each}
      </div>
    {:else if filteredEvents.length === 0 && events.length > 0}
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-8 text-center">
        <div class="text-4xl mb-3">🔍</div>
        <p class="text-lg text-[var(--text)] font-sans mb-2">No events match your filters</p>
        <p class="text-sm text-[var(--muted)] font-sans">
          Try adjusting your search or event type filters.
        </p>
      </div>
    {:else if events.length === 0}
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-8 text-center">
        <div class="text-4xl mb-3">📭</div>
        <p class="text-lg text-[var(--text)] font-sans mb-2">No events recorded yet</p>
        <p class="text-sm text-[var(--muted)] font-sans">
          Events will appear here as AI agents make changes.
        </p>
      </div>
    {:else}
      <div>
        <h3 class="text-lg font-semibold text-[var(--text-heading)] font-sans mb-4">
          📜 Recent Activity ({displayedEvents.length} events)
        </h3>
        <div class="space-y-3">
          {#each displayedEvents as event, i (event.id || event.timestamp || i)}
            <div
              class="bg-[var(--surface)] border-l-4 border-r border-t border-b border-[var(--border)] rounded-lg p-4 hover:bg-[var(--bg)] transition-colors"
              style="border-left-color: {getEventColor(event.event_type)}"
            >
              <div class="flex items-start justify-between gap-3 mb-2">
                <div class="flex items-center gap-2">
                  <time class="text-sm text-[var(--muted)] font-mono"
                    >{formatTimestamp(event.timestamp)}</time
                  >
                  <span class="text-sm text-[var(--text)] font-mono">{event.agent}</span>
                </div>
                <span
                  class="px-2 py-1 rounded text-xs font-mono capitalize"
                  style="background: {getEventColor(event.event_type)}15; color: {getEventColor(
                    event.event_type
                  )}"
                >
                  {getEventIcon(event.event_type)}
                  {event.event_type}
                </span>
              </div>
              <p class="text-sm text-[var(--text)] font-mono mb-2">{event.message}</p>
              {#if event.file}
                <p class="text-xs text-[var(--muted)] font-mono">📄 {event.file}</p>
              {/if}
              {#if event.lines_changed}
                <p class="text-xs text-[var(--muted)] font-mono">
                  Lines changed: {event.lines_changed}
                </p>
              {/if}
              {#if event.duration_ms}
                <p class="text-xs text-[var(--muted)] font-mono">Duration: {event.duration_ms}ms</p>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>
