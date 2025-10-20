<script>
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';
  import { formatTime as formatTimeString } from './timeFormat.js';
  import TimelineSlider from './TimelineSlider.svelte';
  import VirtualScroll from './VirtualScroll.svelte';
  import { debounceInput } from './utils/debounce.js';

  const API_BASE = 'http://localhost:3030/api';

  let events = [];
  let pollIntervalId = null;
  let searchQuery = '';
  let selectedTypes = {
    created: true,
    modified: true,
    deleted: true
  };
  let timeRangeStart = 0;
  let timeRangeEnd = Date.now();
  let virtualScroll; // Reference to virtual scroll component

  function handleTimeRangeChange(start, end) {
    timeRangeStart = start;
    timeRangeEnd = end;
  }

  // Debounced search handler
  function handleDebouncedSearch(event) {
    searchQuery = event.detail;
    // Reset scroll position when searching
    if (virtualScroll) {
      virtualScroll.scrollToItem(0);
    }
  }

  function clearEvents() {
    events = [];
  }

  function refreshEvents() {
    loadRecentEvents();
  }

  function exportToJSON() {
    const exportData = {
      timestamp: new Date().toISOString(),
      total_events: events.length,
      filtered_events: filteredEvents.length,
      events: filteredEvents.map(e => ({
        id: e.id,
        timestamp: e.timestamp,
        filepath: e.filepath,
        change_type: e.changeType,
        cpu: e.cpu,
        mem: e.mem
      }))
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `raven-events-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportToCSV() {
    const headers = ['ID', 'Timestamp', 'Filepath', 'Change Type', 'CPU %', 'Memory %'];
    const rows = filteredEvents.map(e => [
      e.id,
      e.timestamp,
      e.filepath,
      e.changeType,
      (e.cpu ?? 0).toFixed(2),
      (e.mem ?? 0).toFixed(2)
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => {
        // Escape quotes and wrap in quotes if contains comma
        const escaped = String(cell).replace(/"/g, '""');
        return escaped.includes(',') ? `"${escaped}"` : escaped;
      }).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `raven-events-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Memoization cache for filtered events (avoids re-filtering on unrelated reactive changes)
  let cachedFilterEvents = null;
  let cachedFilterQuery = '';
  let cachedFilterTypes = null;
  let cachedFilterStartTime = 0;
  let cachedFilterEndTime = 0;
  let cachedFilteredResult = [];

  // Optimized: Only filter when dependencies actually change
  $: {
    const typesKey = JSON.stringify(selectedTypes);

    if (events !== cachedFilterEvents ||
        searchQuery !== cachedFilterQuery ||
        typesKey !== cachedFilterTypes ||
        timeRangeStart !== cachedFilterStartTime ||
        timeRangeEnd !== cachedFilterEndTime) {

      cachedFilterEvents = events;
      cachedFilterQuery = searchQuery;
      cachedFilterTypes = typesKey;
      cachedFilterStartTime = timeRangeStart;
      cachedFilterEndTime = timeRangeEnd;

      const lowerQuery = searchQuery.toLowerCase();

      cachedFilteredResult = events.filter(event => {
        // Filter by search query
        if (searchQuery && !event.filepath?.toLowerCase().includes(lowerQuery)) {
          return false;
        }

        // Filter by event type
        if (!selectedTypes[event.changeType]) {
          return false;
        }

        // Filter by time range
        const eventTime = new Date(event.timestamp).getTime();
        if (eventTime < timeRangeStart || eventTime > timeRangeEnd) {
          return false;
        }

        return true;
      });
    }
  }

  $: filteredEvents = cachedFilteredResult;

  async function loadRecentEvents() {
    try {
      const response = await fetch(`${API_BASE}/agent-events?limit=50`);
      const recentEvents = await response.json();

      events = recentEvents.map(e => ({
        id: e.id,
        timestamp: e.timestamp,
        filepath: e.file || 'unknown',
        changeType: e.event_type || 'modified',
        cpu: 0, // CPU/memory metrics would need to be correlated from system metrics
        mem: 0
      }));
    } catch (error) {
      console.error('Failed to load events:', error);
    }
  }

  // WebSocket event handlers
  const handleAgentEvent = (event) => {
    // Add new event to the top of the list
    events = [{
      id: event.id,
      timestamp: event.timestamp,
      filepath: event.file || 'unknown',
      changeType: event.event_type || 'modified',
      cpu: 0,
      mem: 0
    }, ...events].slice(0, 100); // Keep last 100 events
  };

  const handleProjectSwitched = async (data) => {
    console.log('📡 Project switched, reloading events:', data.project);
    await loadRecentEvents();
  };

  onMount(async () => {
    // Load initial events from database
    await loadRecentEvents();

    // Connect to WebSocket for real-time updates
    websocketService.connect();

    // Listen for real-time agent events
    websocketService.on('agent-event', handleAgentEvent);

    // Listen for project switch events
    websocketService.on('project-switched', handleProjectSwitched);

    // Fallback: refresh every 30 seconds (WebSocket should handle real-time)
    pollIntervalId = setInterval(loadRecentEvents, 30000);
  });

  onDestroy(() => {
    if (pollIntervalId) {
      clearInterval(pollIntervalId);
    }

    // Clean up WebSocket listeners
    websocketService.off('agent-event', handleAgentEvent);
    websocketService.off('project-switched', handleProjectSwitched);
  });

  function formatTime(timestamp) {
    return formatTimeString(timestamp);
  }

  function getChangeClass(type) {
    return {
      'modified': 'change-modified',
      'created': 'change-created',
      'deleted': 'change-deleted'
    }[type] || '';
  }
</script>

<div class="event-feed">
  <div class="header">
    <span class="count">{filteredEvents.length} / {events.length} events</span>
    <div class="header-actions">
      <button class="export-btn" on:click={exportToJSON} title="Export to JSON">
        📥 JSON
      </button>
      <button class="export-btn" on:click={exportToCSV} title="Export to CSV">
        📥 CSV
      </button>
      <button class="clear-btn" on:click={clearEvents} title="Clear events (C)">
        🗑️ Clear
      </button>
    </div>
  </div>

  <div class="filters">
    <input
      type="text"
      class="search-input"
      placeholder="Search by filename..."
      use:debounceInput={{ delay: 300 }}
      on:debounced={handleDebouncedSearch}
    />
    <div class="type-filters">
      <label class="filter-checkbox" title="Toggle created events (1)">
        <input type="checkbox" bind:checked={selectedTypes.created} />
        <span class="filter-label created">Created</span>
      </label>
      <label class="filter-checkbox" title="Toggle modified events (2)">
        <input type="checkbox" bind:checked={selectedTypes.modified} />
        <span class="filter-label modified">Modified</span>
      </label>
      <label class="filter-checkbox" title="Toggle deleted events (3)">
        <input type="checkbox" bind:checked={selectedTypes.deleted} />
        <span class="filter-label deleted">Deleted</span>
      </label>
    </div>
  </div>

  <TimelineSlider events={events} onTimeRangeChange={handleTimeRangeChange} />

  {#if filteredEvents.length > 0}
    <div class="events">
      <VirtualScroll
        bind:this={virtualScroll}
        items={filteredEvents}
        itemHeight={70}
        containerHeight={400}
        overscan={3}
        getKey={event => event.id}
        let:item
      >
        <div class="event {getChangeClass(item.changeType)}">
          <div class="event-header">
            <span class="filepath">{item.filepath}</span>
            <span class="time">{formatTime(item.timestamp)}</span>
          </div>
          <div class="event-details">
            <span class="badge {item.changeType}">{item.changeType}</span>
            <span class="metric">CPU: {(item.cpu ?? 0).toFixed(1)}%</span>
            <span class="metric">MEM: {(item.mem ?? 0).toFixed(1)}%</span>
          </div>
        </div>
      </VirtualScroll>
    </div>
  {:else if events.length === 0}
    <div class="empty">
      <p>No events yet...</p>
      <p class="hint">Waiting for file changes to be detected</p>
    </div>
  {:else}
    <div class="empty">
      <p>No events match your filters</p>
      <p class="hint">Try adjusting your search or filters</p>
    </div>
  {/if}
</div>

<style>
  .event-feed {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    padding: 0 8px;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border);
  }

  .count {
    color: var(--muted);
    font-size: 12px;
  }

  .header-actions {
    display: flex;
    gap: 0.5rem;
  }

  .export-btn {
    padding: 4px 0.75rem;
    font-size: 11px;
    background: var(--surface-2);
    color: var(--info);
    border: 1px solid var(--info);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .export-btn:hover {
    background: var(--info);
    color: var(--text);
  }

  .clear-btn {
    padding: 4px 0.75rem;
    font-size: 11px;
    background: var(--surface-2);
    color: var(--error);
    border: 1px solid var(--error);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .clear-btn:hover {
    background: var(--error);
    color: var(--text);
  }

  .events {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .event {
    background: var(--surface-2);
    padding: 10px;
    border-radius: 6px;
    border-left: 3px solid var(--info);
    transition: background 0.2s;
  }

  .event:hover {
    background: var(--surface-2);
  }

  .event.change-created {
    border-left-color: var(--success);
  }

  .event.change-modified {
    border-left-color: var(--warning);
  }

  .event.change-deleted {
    border-left-color: var(--error);
  }

  .event-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .filepath {
    font-family: 'Courier New', monospace;
    color: var(--text);
    font-weight: 500;
  }

  .time {
    color: var(--muted);
    font-size: 11px;
  }

  .event-details {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }

  .badge {
    padding: 4px 0.5rem;
    font-size: 11px;
    border-radius: 3px;
    text-transform: uppercase;
    font-weight: 600;
  }

  .badge.modified {
    background: var(--warning)33;
    color: var(--warning);
  }

  .badge.created {
    background: var(--success)33;
    color: var(--success);
  }

  .badge.deleted {
    background: var(--error)33;
    color: var(--error);
  }

  .metric {
    color: var(--muted);
    font-size: 11px;
  }

  .empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    color: var(--muted);
  }

  .empty p {
    margin: 0.5rem 0;
  }

  .hint {
    font-size: 12px;
    color: var(--muted);
  }

  .filters {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 8px;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--border);
  }

  .search-input {
    width: 100%;
    padding: 6px 0.75rem;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
    font-size: 12px;
    font-family: 'Courier New', monospace;
  }

  .search-input:focus {
    outline: none;
    border-color: var(--info);
    background: var(--surface-2);
  }

  .search-input::placeholder {
    color: var(--muted);
  }

  .type-filters {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  .filter-checkbox {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    user-select: none;
  }

  .filter-checkbox input[type="checkbox"] {
    cursor: pointer;
    width: 16px;
    height: 16px;
  }

  .filter-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    padding: 4px 0.5rem;
    border-radius: 3px;
  }

  .filter-label.created {
    background: var(--success)33;
    color: var(--success);
  }

  .filter-label.modified {
    background: var(--warning)33;
    color: var(--warning);
  }

  .filter-label.deleted {
    background: var(--error)33;
    color: var(--error);
  }
</style>
