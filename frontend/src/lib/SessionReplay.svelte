<script>
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';
  import { formatDateTime } from './timeFormat.js';
  import PageInfo from './PageInfo.svelte';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import { API_CONFIG } from '../config.js';

  const API_BASE = API_CONFIG.BASE_URL + '/api';
  let events = [];
  let allSessions = [];
  let selectedSession = 'all'; // 'all' or a specific session ID
  let loading = true;
  let lastUpdated = null;
  let isManualRefresh = false;

  // Enhanced filtering
  let searchQuery = '';
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

  // Filter events based on search, event type, and agent
  $: filteredEvents = events.filter(event => {
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

  // Extract unique agents whenever events change
  $: {
    const agents = new Set();
    events.forEach(e => {
      if (e.agent) agents.add(e.agent);
    });
    uniqueAgents = Array.from(agents).sort();
  }

  // Timeline data - group events into hourly buckets
  let selectedTimeBucket = null;
  $: timelineBuckets = (() => {
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
          endTime: time + bucketSize,
          count: bucketEvents.length,
          events: bucketEvents,
          label: new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
      }
    }

    return buckets;
  })();

  // Get max count for scaling timeline bars
  $: maxBucketCount = timelineBuckets.length > 0
    ? Math.max(...timelineBuckets.map(b => b.count))
    : 1;

  function selectTimeBucket(bucket) {
    selectedTimeBucket = bucket === selectedTimeBucket ? null : bucket;
  }

  // Filter events by selected time bucket
  $: displayedEvents = selectedTimeBucket
    ? selectedTimeBucket.events
    : filteredEvents;

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
      console.error('Failed to load sessions:', e);
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
      console.error('Failed to load events:', e);
      loading = false;
      isManualRefresh = false;
    }
  }

  async function onSessionChange() {
    await loadEvents();
  }

  // Format "time ago" for last updated timestamp
  function getTimeAgo() {
    if (!lastUpdated) return 'Never';
    const seconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
    if (seconds < 10) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  }

  // Reactive "time ago" - updates when lastUpdated changes (no polling!)
  $: timeAgo = getTimeAgo();

  // WebSocket event handler for project switches
  const handleProjectSwitched = async (data) => {
    await loadSessions();
    await loadEvents();
  };

  function formatTimestamp(timestamp) {
    return formatDateTime(timestamp);
  }

  function getEventIcon(eventType) {
    const icons = {
      'edit': '✏️',
      'create': '➕',
      'delete': '🗑️',
      'read': '👁️',
      'execute': '⚙️',
      'session-start': '▶️',
      'session-end': '⏹️'
    };
    return icons[eventType] || '📝';
  }

  function getEventColor(eventType) {
    const colors = {
      'edit': 'var(--info)',
      'create': 'var(--success)',
      'delete': 'var(--error)',
      'read': 'var(--muted)',
      'execute': 'var(--warning)',
      'session-start': 'var(--accent)',
      'session-end': 'var(--accent)'
    };
    return colors[eventType] || 'var(--text)';
  }
</script>

<div class="session-replay">
  <PageInfo
    title="Session Replay"
    description="This is your Raven time machine - imagine a DVR (digital video recorder) for your coding sessions, letting you rewind and replay everything that happened. Session Replay shows a **chronological timeline** of every AI agent action during a specific monitoring session. Think of each session as one continuous run of Raven from start to restart - when you run `./restart.sh`, a new session begins with a new Session ID."
    keyPoints={[
      '**Session Filter Dropdown** - At the top, select which session to view: "All Sessions" shows events from all historical sessions (can be overwhelming), "Current Session (a3b7f12d...)" shows only events since the last Raven restart (most recent 8 chars of Session ID shown). The current session is usually what you want.',
      '**Recent Activity Timeline** - Scrollable list of events in reverse chronological order (newest at top). Each event shows: Timestamp (exact date/time like "2025-01-15 14:32:15"), Agent name (which AI did it - Claude, GPT, etc.), Event type (edit/create/delete/read/execute), Message (description of what happened), File path (if applicable), Lines changed (if code edit), Duration (how long it took in milliseconds).',
      '**Event Types Explained** - `edit` = Modified existing file, `create` = Created new file, `delete` = Removed file, `read` = Opened/analyzed file without changes, `execute` = Ran a command or tool. Each has a corresponding icon in other pages.',
      '**Event Count** - Shows total events in timeline like "Recent Activity (47 events)". This is the number of distinct actions AI agents took during the selected session(s). Example: 47 events might be 30 edits, 10 reads, 5 creates, 2 deletes.',
      '**Duration Field** - Shown in milliseconds (ms). Example: "1200ms" = 1.2 seconds. Tells you how long that specific action took from start to finish. Useful for finding slow operations.',
      '**Empty State** - If you see "No events recorded yet", either: (1) AI agents haven\'t done anything since Raven started, or (2) You selected a session with no activity. Switch to "Current Session" if you\'re actively working.',
      '**Use Cases** - After an AI coding session: Review what the AI actually did step-by-step. Debugging: Find when a bug was introduced by seeing file edit timestamps. Code review: Share session timeline with team to show AI contributions. Learning: Study how AI agents approach problems by watching their sequence of actions.'
    ]}
    whenToCheck="Check Session Replay **after any AI coding session** to review what changed, **when debugging** to find when/where a bug was introduced, **before committing code** to verify AI changes make sense, or **when learning** to understand how AI agents approach coding tasks."
    warnings={[
      '**Long sessions (>500 events) take time to load** - Fetching hundreds of events from database can take 5-10 seconds. Be patient if you see "Loading events..." for a while. Consider filtering to current session only.',
      '**Incomplete sessions / gaps in timeline** - Happens if: Raven crashed mid-session (events before crash are saved, after crash are lost), Backend was restarted (new session started, old session closed), AI agent failed to send telemetry for some actions. Gaps are normal after crashes.',
      '**Very active sessions overwhelming** - 1000+ events can be hard to parse visually. Use the session filter to narrow down, or export the data and analyze in a spreadsheet. Future versions may add event type filters.',
      '**Timestamp shows future date** - Clock skew between your system and the server. Check that your computer\'s time/timezone is correct. Usually does not affect functionality, just confusing.',
      '**No session dropdown appears** - Backend is not responding to `/api/session-id` endpoint. Check Status page to verify backend is online. Refresh the page if dropdown is empty.',
      '**"All Sessions" shows nothing despite having data** - Database might be new/empty, or events are in a different database file. Raven uses separate SQLite files per project - make sure you\'re viewing the right project.'
    ]}
  />

  <div class="header">
    <h2>🎬 Session Replay</h2>
    <div class="header-controls">
      <span class="last-updated">Updated: {timeAgo}</span>
      <div class="filter-group">
        <label for="session-filter">Session:</label>
        <select
          id="session-filter"
          bind:value={selectedSession}
          on:change={onSessionChange}
          class="session-select"
        >
          {#each allSessions || [] as session}
            <option value={session.id}>{session.label}</option>
          {/each}
        </select>
      </div>
      <button on:click={() => loadEvents(true)} class="btn-refresh" disabled={loading}>
        <span class="refresh-icon" class:spinning={isManualRefresh}>↻</span>
        Refresh
      </button>
    </div>
  </div>

  <!-- Enhanced Filters Bar -->
  {#if !loading && events.length > 0}
    <div class="filters-section">
      <!-- Search Bar -->
      <div class="search-bar">
        <input
          type="text"
          placeholder="Search by file, agent, or message..."
          bind:value={searchQuery}
          class="search-input"
        />
      </div>

      <!-- Event Type Filters -->
      <div class="filter-row">
        <div class="filter-label">Event Types:</div>
        <div class="event-type-filters">
          <label class="filter-checkbox">
            <input type="checkbox" bind:checked={selectedEventTypes.edit} />
            <span class="filter-badge edit">✏️ Edit</span>
          </label>
          <label class="filter-checkbox">
            <input type="checkbox" bind:checked={selectedEventTypes.create} />
            <span class="filter-badge create">➕ Create</span>
          </label>
          <label class="filter-checkbox">
            <input type="checkbox" bind:checked={selectedEventTypes.delete} />
            <span class="filter-badge delete">🗑️ Delete</span>
          </label>
          <label class="filter-checkbox">
            <input type="checkbox" bind:checked={selectedEventTypes.read} />
            <span class="filter-badge read">👁️ Read</span>
          </label>
          <label class="filter-checkbox">
            <input type="checkbox" bind:checked={selectedEventTypes.execute} />
            <span class="filter-badge execute">⚙️ Execute</span>
          </label>
        </div>
      </div>

      <!-- Agent Filter -->
      {#if uniqueAgents.length > 1}
        <div class="filter-row">
          <div class="filter-label">Agent:</div>
          <select class="agent-select" bind:value={selectedAgent}>
            <option value="all">All Agents ({uniqueAgents.length})</option>
            {#each uniqueAgents as agent}
              <option value={agent}>{agent}</option>
            {/each}
          </select>
        </div>
      {/if}

      <!-- Filter Stats -->
      <div class="filter-stats">
        Showing {filteredEvents.length} / {events.length} events
      </div>
    </div>
  {/if}

  <!-- Timeline Visualization -->
  {#if !loading && filteredEvents.length > 0 && timelineBuckets.length > 1}
    <div class="timeline-viz">
      <h3>⏱️ Activity Timeline</h3>
      <p class="timeline-hint">
        {selectedTimeBucket ? `Showing ${selectedTimeBucket.count} events from ${selectedTimeBucket.label}` : 'Click a time bucket to filter events'}
      </p>
      <div class="timeline-buckets">
        {#each timelineBuckets as bucket}
          <button
            class="timeline-bucket"
            class:selected={bucket === selectedTimeBucket}
            on:click={() => selectTimeBucket(bucket)}
            title="{bucket.count} events at {bucket.label}"
          >
            <div
              class="timeline-bar"
              style="height: {(bucket.count / maxBucketCount) * 100}%"
            ></div>
            <div class="timeline-label">{bucket.label}</div>
            <div class="timeline-count">{bucket.count}</div>
          </button>
        {/each}
      </div>
      {#if selectedTimeBucket}
        <button class="btn-clear-filter" on:click={() => selectedTimeBucket = null}>
          ✕ Clear Time Filter
        </button>
      {/if}
    </div>
  {/if}

  {#if loading}
    <LoadingSkeleton count={5} height="80px" />
  {:else if filteredEvents.length === 0 && events.length > 0}
    <div class="empty-state">
      <p>🔍 No events match your filters</p>
      <p>Try adjusting your search or event type filters.</p>
    </div>
  {:else if events.length === 0}
    <div class="empty-state">
      <p>No events recorded yet.</p>
      <p>Events will appear here as AI agents make changes.</p>
    </div>
  {:else}
    <div class="timeline">
      <h3>📜 Recent Activity ({displayedEvents.length} events)</h3>
      <div class="events-list">
        {#each displayedEvents || [] as event}
          <div class="event-item" style="border-left-color: {getEventColor(event.event_type)}">
            <div class="event-header">
              <span class="timestamp">{formatTimestamp(event.timestamp)}</span>
              <span class="agent">{event.agent}</span>
              <span class="event-type" style="background: color-mix(in srgb, {getEventColor(event.event_type)} 20%, transparent); color: {getEventColor(event.event_type)}">
                {getEventIcon(event.event_type)} {event.event_type}
              </span>
            </div>
            <div class="event-body">
              <p class="message">{event.message}</p>
              {#if event.file}
                <p class="file">📄 {event.file}</p>
              {/if}
              {#if event.lines_changed}
                <p class="lines">Lines changed: {event.lines_changed}</p>
              {/if}
              {#if event.duration_ms}
                <p class="duration">Duration: {event.duration_ms}ms</p>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .session-replay {
    padding: 12px;
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
    margin-bottom: 10px;
    padding: 0 8px;
  }

  h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }

  .last-updated {
    font-size: 12px;
    color: var(--muted);
    font-family: var(--mono);
  }

  .btn-refresh {
    padding: 8px 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 6px;
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
    font-size: 14px;
  }

  .refresh-icon.spinning {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .header-controls {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .filter-group {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .filter-group label {
    font-size: 12px;
    font-weight: 500;
    color: var(--muted);
  }

  .session-select {
    padding: 8px 16px;
    border: 1px solid var(--surface-2);
    border-radius: 6px;
    background: var(--surface);
    color: var(--text);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
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

  .loading, .empty-state {
    text-align: center;
    padding: 16px;
    color: var(--muted);
    font-size: 12px;
  }

  .timeline {
    margin-top: 20px;
    padding: 0 20px;
  }

  h3 {
    font-size: 15px;
    margin-bottom: 10px;
    color: var(--text);
  }

  .events-list {
    display: flex;
    flex-direction: column;
    gap: 15px;
    padding-bottom: 10px;
  }

  .event-item {
    background: var(--surface);
    border: 1px solid var(--surface-2);
    border-left: 4px solid var(--accent);
    border-radius: 8px;
    padding: 12px;
    transition: all 0.2s;
  }

  .event-item:hover {
    background: var(--border);
    border-left-color: var(--accent-2);
    transform: translateX(4px);
  }

  .event-header {
    display: flex;
    gap: 12px;
    align-items: center;
    margin-bottom: 12px;
    flex-wrap: wrap;
  }

  .timestamp {
    color: var(--accent-2);
    font-size: 13px;
    font-family: 'Courier New', monospace;
  }

  .agent {
    padding: 4px 12px;
    background: color-mix(in srgb, var(--accent) 20%, transparent);
    color: var(--accent);
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
  }

  .event-type {
    padding: 4px 12px;
    background: color-mix(in srgb, var(--accent-2) 20%, transparent);
    color: var(--accent-2);
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
  }

  .event-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .message {
    color: var(--text);
    font-size: 12px;
    margin: 0;
  }

  .file, .lines, .duration {
    color: var(--muted);
    font-size: 13px;
    margin: 0;
  }

  .file {
    font-family: 'Courier New', monospace;
  }

  /* Enhanced Filters Section */
  .filters-section {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
    margin: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .search-bar {
    width: 100%;
  }

  .search-input {
    width: 100%;
    padding: 10px 16px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    font-family: var(--mono);
    font-size: 13px;
    transition: all 0.2s;
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
    gap: 12px;
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
    gap: 10px;
    flex-wrap: wrap;
    flex: 1;
  }

  .filter-checkbox {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    user-select: none;
  }

  .filter-checkbox input[type="checkbox"] {
    cursor: pointer;
    width: 16px;
    height: 16px;
    accent-color: var(--accent);
  }

  .filter-badge {
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    transition: all 0.2s;
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

  .filter-checkbox input[type="checkbox"]:not(:checked) + .filter-badge {
    opacity: 0.4;
    filter: grayscale(0.7);
  }

  .agent-select {
    padding: 8px 16px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    font-family: var(--mono);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;
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
    padding: 6px 12px;
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    color: var(--accent);
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
  }

  /* Timeline Visualization */
  .timeline-viz {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 20px;
    margin: 16px 20px;
  }

  .timeline-viz h3 {
    margin: 0 0 8px 0;
    font-size: 15px;
    color: var(--text);
  }

  .timeline-hint {
    margin: 0 0 16px 0;
    font-size: 12px;
    color: var(--muted);
    font-style: italic;
  }

  .timeline-buckets {
    display: flex;
    gap: 8px;
    align-items: flex-end;
    height: 120px;
    padding: 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow-x: auto;
    margin-bottom: 12px;
  }

  .timeline-bucket {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    min-width: 60px;
    cursor: pointer;
    background: transparent;
    border: none;
    padding: 0;
    position: relative;
    transition: all 0.2s;
  }

  .timeline-bucket:hover {
    transform: translateY(-2px);
  }

  .timeline-bucket.selected {
    transform: translateY(-4px);
  }

  .timeline-bar {
    width: 40px;
    min-height: 20px;
    background: linear-gradient(to top, var(--accent), var(--accent-2));
    border-radius: 4px 4px 0 0;
    transition: all 0.3s;
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
    font-size: 10px;
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
    padding: 8px 16px;
    background: color-mix(in srgb, var(--error) 20%, transparent);
    border: 1px solid var(--error);
    border-radius: 6px;
    color: var(--error);
    font-family: var(--mono);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
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
      margin: 12px;
      padding: 12px;
    }

    .filter-row {
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
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
