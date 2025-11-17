<script>
  import { logger } from './logger.js';
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './services/websocket.js';
  import { formatDateTime } from './timeFormat.js';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import { API_CONFIG } from '../config.js';

  const API_BASE = API_CONFIG.API_BASE;
  let events = [];
  let allSessions = [];
  let selectedSession = 'all'; // 'all' or a specific session ID
  let loading = true;
  let lastUpdated = null;
  let isManualRefresh = false;

  // Enhanced filtering
  let searchQuery = '';
  let debouncedSearchQuery = '';
  let searchDebounceTimeout;
  let selectedEventTypes = {
    edit: true,
    create: true,
    delete: true,
    read: true,
    execute: true,
    'session-start': true,
    'session-end': true
  };
  let selectedAgent = 'all'; // 'all' or specific agent name
  let uniqueAgents = [];

  // Debounce search query
  $: {
    clearTimeout(searchDebounceTimeout);
    searchDebounceTimeout = setTimeout(() => {
      debouncedSearchQuery = searchQuery;
    }, 300);
  }

  // Cache for timeline buckets to prevent expensive recomputation
  let cachedFilteredEvents = null;
  let cachedTimelineBuckets = [];

  // Filter events based on search, event type, and agent
  $: filteredEvents = events.filter(event => {
    // Search filter (debounced)
    if (debouncedSearchQuery) {
      const query = debouncedSearchQuery.toLowerCase();
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

  // Extract unique agents whenever events change
  $: {
    const agents = new Set();
    events.forEach(e => {
      if (e.agent) agents.add(e.agent);
    });
    uniqueAgents = Array.from(agents).sort();
  }

  // Timeline data - group events into hourly buckets (optimized with caching)
  let selectedTimeBucket = null;
  $: timelineBuckets = (() => {
    // Check if we can use cached result
    if (cachedFilteredEvents === filteredEvents) {
      return cachedTimelineBuckets;
    }

    if (filteredEvents.length === 0) {
      cachedFilteredEvents = filteredEvents;
      cachedTimelineBuckets = [];
      return [];
    }

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
          endTime: time + bucketSize,
          count: bucketEvents.length,
          events: bucketEvents,
          label: new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
      }
    }

    // Cache the result
    cachedFilteredEvents = filteredEvents;
    cachedTimelineBuckets = buckets;

    return buckets;
  })();

  // Get max count for scaling timeline bars
  $: maxBucketCount =
    timelineBuckets.length > 0 ? Math.max(...timelineBuckets.map(b => b.count)) : 1;

  function selectTimeBucket(bucket) {
    selectedTimeBucket = bucket === selectedTimeBucket ? null : bucket;
  }

  // Filter events by selected time bucket
  $: displayedEvents = selectedTimeBucket ? selectedTimeBucket.events : filteredEvents;

  onMount(async () => {
    await loadSessions();
    await loadEvents();

    // Connect to WebSocket and listen for project switches (event-driven, no polling!)
    websocketService.connect();
    websocketService.on('project-switched', handleProjectSwitched);
  });

  onDestroy(() => {
    // Clean up WebSocket listeners
    websocketService.off('project-switched', handleProjectSwitched);

    // Clean up timeouts
    clearTimeout(searchDebounceTimeout);
  });

  async function loadSessions() {
    try {
      const response = await fetch(`${API_BASE}/session-id`);
      const data = await response.json();
      const currentSessionId = data.session_id;

      // For now, just show current session (could be expanded to show multiple sessions)
      allSessions = [
        { id: 'all', label: 'All Sessions' },
        { id: currentSessionId, label: `Current Session (${currentSessionId?.slice(0, 8)}...)` }
      ];
    } catch (e) {
      logger.error('Failed to load sessions:', e);
      allSessions = [{ id: 'all', label: 'All Sessions' }];
    }
  }

  async function loadEvents(manual = false) {
    try {
      loading = true;
      isManualRefresh = manual;
      let url = `${API_BASE}/agent-events?limit=50`;

      // If a specific session is selected, use the session filter endpoint
      if (selectedSession !== 'all') {
        url = `${API_BASE}/events-by-session/${selectedSession}`;
      }

      const response = await fetch(url);
      events = await response.json();
      lastUpdated = new Date();
      loading = false;
      isManualRefresh = false;
    } catch (e) {
      logger.error('Failed to load events:', e);
      loading = false;
      isManualRefresh = false;
    }
  }

  async function onSessionChange() {
    await loadEvents();
  }

  // Format "time ago" for last updated timestamp

  // Reactive "time ago" - updates when lastUpdated changes (no polling!)
  let timeAgo = 'Just now';
  // Update time ago when lastUpdated changes (prevents infinite loop)
  $: if (lastUpdated) {
    if (!lastUpdated) timeAgo = 'Just now';
    else {
      const seconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
      if (seconds < 10) timeAgo = 'Just now';
      else if (seconds < 60) timeAgo = `${seconds}s ago`;
      else if (seconds < 3600) timeAgo = `${Math.floor(seconds / 60)}m ago`;
      else timeAgo = `${Math.floor(seconds / 3600)}h ago`;
    }
  }

  // WebSocket event handler for project switches
  const handleProjectSwitched = async _data => {
    await loadSessions();
    await loadEvents();
  };

  function formatTimestamp(timestamp) {
    return formatDateTime(timestamp);
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
</script>

<div class="session-replay" role="region" aria-label="Session replay panel">
  <div class="header">
    <h2 id="session-replay-heading"><span aria-hidden="true">🎬</span> Session Replay</h2>
    <div class="header-controls" role="toolbar" aria-label="Session replay controls">
      <span class="last-updated" role="status" aria-live="polite">Updated: {timeAgo}</span>
      <div class="filter-group">
        <label for="session-filter">Session:</label>
        <select
          id="session-filter"
          bind:value={selectedSession}
          on:change={onSessionChange}
          class="session-select"
          aria-label="Filter events by session"
        >
          {#each allSessions || [] as session (session.id)}
            <option value={session.id}>{session.label}</option>
          {/each}
        </select>
      </div>
      <button
        on:click={() => loadEvents(true)}
        class="btn-refresh"
        disabled={loading}
        aria-label={loading ? 'Loading events' : 'Refresh events'}
      >
        <span class="refresh-icon" class:spinning={isManualRefresh} aria-hidden="true">↻</span>
        Refresh
      </button>
    </div>
  </div>

  <!-- Enhanced Filters Bar -->
  {#if !loading && events.length > 0}
    <div class="filters-section" role="region" aria-label="Event filters">
      <!-- Search Bar -->
      <div class="search-bar" role="search">
        <input
          type="text"
          placeholder="Search by file, agent, or message..."
          bind:value={searchQuery}
          class="search-input"
          aria-label="Search events by file, agent, or message"
        />
      </div>

      <!-- Event Type Filters -->
      <div class="filter-row">
        <div class="filter-label">Event Types:</div>
        <div class="event-type-filters" role="group" aria-label="Filter by event type">
          <label class="filter-checkbox">
            <input
              type="checkbox"
              bind:checked={selectedEventTypes.edit}
              aria-label="Filter edit events"
            />
            <span class="filter-badge edit"><span aria-hidden="true">✏️</span> Edit</span>
          </label>
          <label class="filter-checkbox">
            <input
              type="checkbox"
              bind:checked={selectedEventTypes.create}
              aria-label="Filter create events"
            />
            <span class="filter-badge create"><span aria-hidden="true">➕</span> Create</span>
          </label>
          <label class="filter-checkbox">
            <input
              type="checkbox"
              bind:checked={selectedEventTypes.delete}
              aria-label="Filter delete events"
            />
            <span class="filter-badge delete"><span aria-hidden="true">🗑️</span> Delete</span>
          </label>
          <label class="filter-checkbox">
            <input
              type="checkbox"
              bind:checked={selectedEventTypes.read}
              aria-label="Filter read events"
            />
            <span class="filter-badge read"><span aria-hidden="true">👁️</span> Read</span>
          </label>
          <label class="filter-checkbox">
            <input
              type="checkbox"
              bind:checked={selectedEventTypes.execute}
              aria-label="Filter execute events"
            />
            <span class="filter-badge execute"><span aria-hidden="true">⚙️</span> Execute</span>
          </label>
        </div>
      </div>

      <!-- Agent Filter -->
      {#if uniqueAgents.length > 1}
        <div class="filter-row">
          <div class="filter-label">Agent:</div>
          <select
            class="agent-select"
            bind:value={selectedAgent}
            aria-label="Filter events by agent"
          >
            <option value="all">All Agents ({uniqueAgents.length})</option>
            {#each uniqueAgents as agent (agent)}
              <option value={agent}>{agent}</option>
            {/each}
          </select>
        </div>
      {/if}

      <!-- Filter Stats -->
      <div class="filter-stats" role="status" aria-live="polite">
        Showing {filteredEvents.length} / {events.length} events
      </div>
    </div>
  {/if}

  <!-- Timeline Visualization -->
  {#if !loading && filteredEvents.length > 0 && timelineBuckets.length > 1}
    <div class="timeline-viz" role="region" aria-labelledby="timeline-heading">
      <h3 id="timeline-heading"><span aria-hidden="true">⏱️</span> Activity Timeline</h3>
      <p class="timeline-hint" role="status" aria-live="polite">
        {selectedTimeBucket
          ? `Showing ${selectedTimeBucket.count} events from ${selectedTimeBucket.label}`
          : 'Click a time bucket to filter events'}
      </p>
      <div class="timeline-buckets" role="group" aria-label="Activity timeline by hour">
        {#each timelineBuckets as bucket (bucket)}
          <button
            class="timeline-bucket"
            class:selected={bucket === selectedTimeBucket}
            on:click={() => selectTimeBucket(bucket)}
            aria-label="{bucket.count} events at {bucket.label}"
            aria-pressed={bucket === selectedTimeBucket}
          >
            <div
              class="timeline-bar"
              style="height: {(bucket.count / maxBucketCount) * 100}%"
              aria-hidden="true"
            ></div>
            <div class="timeline-label" aria-hidden="true">{bucket.label}</div>
            <div class="timeline-count" aria-hidden="true">{bucket.count}</div>
          </button>
        {/each}
      </div>
      {#if selectedTimeBucket}
        <button
          class="btn-clear-filter"
          on:click={() => (selectedTimeBucket = null)}
          aria-label="Clear time filter"
        >
          <span aria-hidden="true">✕</span> Clear Time Filter
        </button>
      {/if}
    </div>
  {/if}

  {#if loading}
    <LoadingSkeleton count={5} height="80px" />
  {:else if filteredEvents.length === 0 && events.length > 0}
    <div class="empty-state" role="status">
      <p><span aria-hidden="true">🔍</span> No events match your filters</p>
      <p>Try adjusting your search or event type filters.</p>
    </div>
  {:else if events.length === 0}
    <div class="empty-state" role="status">
      <p>No events recorded yet.</p>
      <p>Events will appear here as AI agents make changes.</p>
    </div>
  {:else}
    <section class="timeline" aria-labelledby="recent-activity-heading">
      <h3 id="recent-activity-heading">
        <span aria-hidden="true">📜</span> Recent Activity (<span role="status"
          >{displayedEvents.length} events</span
        >)
      </h3>
      <div class="events-list" role="feed" aria-label="Recent activity events">
        {#each displayedEvents || [] as event (event.id || event.timestamp)}
          <article class="event-item" style="border-left-color: {getEventColor(event.event_type)}">
            <div class="event-header">
              <time class="timestamp" datetime={event.timestamp}
                >{formatTimestamp(event.timestamp)}</time
              >
              <span class="agent">{event.agent}</span>
              <span
                class="event-type"
                style="background: color-mix(in srgb, {getEventColor(
                  event.event_type
                )} 20%, transparent); color: {getEventColor(event.event_type)}"
                role="status"
              >
                <span aria-hidden="true">{getEventIcon(event.event_type)}</span>
                {event.event_type}
              </span>
            </div>
            <div class="event-body">
              <p class="message">{event.message}</p>
              {#if event.file}
                <p class="file"><span aria-hidden="true">📄</span> {event.file}</p>
              {/if}
              {#if event.lines_changed}
                <p class="lines">Lines changed: {event.lines_changed}</p>
              {/if}
              {#if event.duration_ms}
                <p class="duration">Duration: {event.duration_ms}ms</p>
              {/if}
            </div>
          </article>
        {/each}
      </div>
    </section>
  {/if}
</div>

<style>
  .session-replay {
    padding: var(--space-xl);
    background: var(--bg);
    min-height: 80vh;
    color: var(--text);
    font-family: var(--mono);
    width: 100%;
    position: relative;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-lg);
    padding: 0 var(--space-lg);
  }

  h2 {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
  }

  .last-updated {
    font-size: 12px;
    color: var(--muted);
    font-family: var(--mono);
  }

  .btn-refresh {
    padding: var(--space-lg) var(--space-2xl);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    transition: all var(--duration-base) var(--ease-smooth);
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  .btn-refresh:hover:not(:disabled) {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .btn-refresh:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .refresh-icon {
    display: inline-block;
    font-size: 11px;
  }

  .refresh-icon.spinning {
    animation: spin 1s linear infinite;
  }

  .header-controls {
    display: flex;
    align-items: center;
    gap: var(--space-xl);
  }

  .filter-group {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
  }

  .filter-group label {
    font-size: 12px;
    font-weight: 500;
    color: var(--muted);
  }

  .session-select {
    padding: var(--space-lg) var(--space-2xl);
    border: 1px solid var(--surface-2);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .session-select:hover {
    border-color: var(--surface-2);
    background: var(--surface-2);
  }

  .session-select:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 10%, transparent);
  }

  .empty-state {
    text-align: center;
    padding: var(--space-2xl);
    color: var(--muted);
    font-size: 12px;
  }

  .timeline {
    margin-top: var(--space-lg);
    padding: 0 var(--space-3xl);
  }

  h3 {
    font-size: 12px;
    margin-bottom: var(--space-lg);
    color: var(--text);
  }

  .events-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xl);
    padding-bottom: 10px;
  }

  .event-item {
    background: var(--surface);
    border: 1px solid var(--surface-2);
    border-left: 4px solid var(--accent);
    border-radius: var(--radius);
    padding: var(--space-xl);
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .event-item:hover {
    background: var(--border);
    border-left-color: var(--accent-2);
    transform: translateX(4px);
  }

  .event-header {
    display: flex;
    gap: var(--space-xl);
    align-items: center;
    margin-bottom: var(--space-xl);
    flex-wrap: wrap;
  }

  .timestamp {
    color: var(--accent-2);
    font-size: 13px;
    font-family: var(--mono);
  }

  .agent {
    padding: var(--space-sm) var(--space-xl);
    background: color-mix(in srgb, var(--accent) 20%, transparent);
    color: var(--accent);
    border-radius: var(--radius-sm);
    font-size: 12px;
    font-weight: 600;
  }

  .event-type {
    padding: var(--space-sm) var(--space-xl);
    background: color-mix(in srgb, var(--accent-2) 20%, transparent);
    color: var(--accent-2);
    border-radius: var(--radius-sm);
    font-size: 12px;
    font-weight: 600;
  }

  .event-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .message {
    color: var(--text);
    font-size: 12px;
    margin: 0;
  }

  .file,
  .lines,
  .duration {
    color: var(--muted);
    font-size: 13px;
    margin: 0;
  }

  .file {
    font-family: var(--mono);
  }

  /* Enhanced Filters Section */
  .filters-section {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-2xl);
    margin: var(--space-2xl) var(--space-3xl);
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .search-bar {
    width: 100%;
  }

  .search-input {
    width: 100%;
    padding: var(--space-md) var(--space-lg);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-family: var(--mono);
    font-size: 13px;
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .search-input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 10%, transparent);
  }

  .search-input::placeholder {
    color: var(--muted);
  }

  .filter-row {
    display: flex;
    align-items: center;
    gap: var(--space-xl);
    flex-wrap: wrap;
  }

  .filter-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    min-width: 90px;
  }

  .event-type-filters {
    display: flex;
    gap: var(--space-lg);
    flex-wrap: wrap;
    flex: 1;
  }

  .filter-checkbox {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    cursor: pointer;
    user-select: none;
  }

  .filter-checkbox input[type='checkbox'] {
    cursor: pointer;
    width: var(--icon-xs);
    height: var(--icon-xs);
    accent-color: var(--accent);
  }

  .filter-badge {
    padding: var(--space-md) var(--space-xl);
    border-radius: var(--radius-sm);
    font-size: 12px;
    font-weight: 500;
    transition: all var(--duration-base) var(--ease-smooth);
    border: 1px solid transparent;
  }

  .filter-badge.edit {
    background: color-mix(in srgb, var(--info) 15%, transparent);
    color: var(--info);
    border-color: color-mix(in srgb, var(--info) 30%, transparent);
  }

  .filter-badge.create {
    background: color-mix(in srgb, var(--success) 15%, transparent);
    color: var(--success);
    border-color: color-mix(in srgb, var(--success) 30%, transparent);
  }

  .filter-badge.delete {
    background: color-mix(in srgb, var(--error) 15%, transparent);
    color: var(--error);
    border-color: color-mix(in srgb, var(--error) 30%, transparent);
  }

  .filter-badge.read {
    background: color-mix(in srgb, var(--muted) 15%, transparent);
    color: var(--muted);
    border-color: color-mix(in srgb, var(--muted) 30%, transparent);
  }

  .filter-badge.execute {
    background: color-mix(in srgb, var(--warning) 15%, transparent);
    color: var(--warning);
    border-color: color-mix(in srgb, var(--warning) 30%, transparent);
  }

  .filter-checkbox input[type='checkbox']:not(:checked) + .filter-badge {
    opacity: 0.4;
    filter: grayscale(0.7);
  }

  .agent-select {
    padding: var(--space-lg) var(--space-2xl);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-family: var(--mono);
    font-size: 12px;
    cursor: pointer;
    transition: all var(--duration-base) var(--ease-smooth);
    min-width: 200px;
  }

  .agent-select:hover {
    border-color: var(--accent);
  }

  .agent-select:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 10%, transparent);
  }

  .filter-stats {
    margin-left: auto;
    padding: var(--space-md) var(--space-xl);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    color: var(--accent);
    border-radius: var(--radius-sm);
    font-size: 12px;
    font-weight: 600;
  }

  /* Timeline Visualization */
  .timeline-viz {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-lg);
    margin: var(--space-2xl) var(--space-3xl);
  }

  .timeline-viz h3 {
    margin: 0 0 var(--space-lg) 0;
    font-size: 12px;
    color: var(--text);
  }

  .timeline-hint {
    margin: 0 0 var(--space-lg) 0;
    font-size: 12px;
    color: var(--muted);
    font-style: italic;
  }

  .timeline-buckets {
    display: flex;
    gap: var(--space-lg);
    align-items: flex-end;
    height: 120px;
    padding: var(--space-xl);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    overflow-x: auto;
    margin-bottom: var(--space-xl);
    position: relative;
    /* Add scroll snap for better mobile experience */
    scroll-snap-type: x proximity;
    -webkit-overflow-scrolling: touch;
  }

  /* Add fade indicators at edges to show scrollability */
  .timeline-buckets::before,
  .timeline-buckets::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    width: 40px;
    pointer-events: none;
    z-index: 1;
  }

  .timeline-buckets::before {
    left: 0;
    background: linear-gradient(to right, var(--bg), transparent);
  }

  .timeline-buckets::after {
    right: 0;
    background: linear-gradient(to left, var(--bg), transparent);
  }

  /* Improve scrollbar visibility on mobile */
  .timeline-buckets::-webkit-scrollbar {
    height: 6px;
  }

  .timeline-buckets::-webkit-scrollbar-track {
    background: color-mix(in srgb, var(--border) 30%, transparent);
    border-radius: var(--radius-sm);
  }

  .timeline-buckets::-webkit-scrollbar-thumb {
    background: var(--accent);
    border-radius: var(--radius-sm);
  }

  .timeline-buckets::-webkit-scrollbar-thumb:hover {
    background: var(--accent-2, var(--accent));
  }

  .timeline-bucket {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-sm);
    min-width: 60px;
    cursor: pointer;
    background: transparent;
    border: none;
    padding: 0;
    position: relative;
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .timeline-bucket:hover {
    transform: translateY(-2px);
  }

  .timeline-bucket:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .timeline-bucket.selected {
    transform: translateY(-4px);
  }

  .timeline-bar {
    width: 40px;
    min-height: var(--icon-sm);
    background: linear-gradient(to top, var(--accent), var(--accent-2));
    border-radius: var(--radius) var(--radius) 0 0;
    transition: all var(--duration-slow) var(--ease-smooth);
    box-shadow: 0 2px 8px color-mix(in srgb, var(--accent) 30%, transparent);
  }

  .timeline-bucket:hover .timeline-bar {
    background: linear-gradient(to top, var(--accent-2), var(--warning));
    box-shadow: 0 4px 12px color-mix(in srgb, var(--accent) 50%, transparent);
  }

  .timeline-bucket.selected .timeline-bar {
    background: linear-gradient(to top, var(--warning), var(--error));
    box-shadow: 0 6px 16px color-mix(in srgb, var(--warning) 60%, transparent);
  }

  .timeline-label {
    font-size: 11px;
    color: var(--muted);
    font-family: var(--mono);
    white-space: nowrap;
  }

  .timeline-count {
    font-size: 11px;
    font-weight: 600;
    color: var(--accent);
    font-family: var(--mono);
  }

  .timeline-bucket:hover .timeline-count,
  .timeline-bucket.selected .timeline-count {
    color: var(--warning);
  }

  .btn-clear-filter {
    padding: var(--space-lg) var(--space-2xl);
    background: color-mix(in srgb, var(--error) 20%, transparent);
    border: 1px solid var(--error);
    border-radius: var(--radius-sm);
    color: var(--error);
    font-family: var(--mono);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .btn-clear-filter:hover {
    background: var(--error);
    color: white;
  }

  @media (max-width: 768px) {
    .event-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .filters-section {
      margin: var(--space-xl);
      padding: var(--space-xl);
    }

    .filter-row {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-lg);
    }

    .filter-label {
      min-width: auto;
    }

    .filter-stats {
      margin-left: 0;
      align-self: flex-start;
    }
  }
</style>
