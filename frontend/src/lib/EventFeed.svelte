<script>
  import { invoke } from '@tauri-apps/api/core';
  import { listen } from '@tauri-apps/api/event';
  import { onMount, onDestroy } from 'svelte';
  import { keyboard } from './keyboardService.js';
  import TimelineSlider from './TimelineSlider.svelte';

  let events = [];
  let unlisten = null;
  let pollIntervalId = null;
  let searchQuery = '';
  let selectedTypes = {
    created: true,
    modified: true,
    deleted: true
  };
  let timeRangeStart = 0;
  let timeRangeEnd = Date.now();

  function handleTimeRangeChange(start, end) {
    timeRangeStart = start;
    timeRangeEnd = end;
  }

  function clearEvents() {
    events = [];
  }

  function toggleCreated() {
    selectedTypes.created = !selectedTypes.created;
  }

  function toggleModified() {
    selectedTypes.modified = !selectedTypes.modified;
  }

  function toggleDeleted() {
    selectedTypes.deleted = !selectedTypes.deleted;
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
      e.cpu.toFixed(2),
      e.mem.toFixed(2)
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

  $: filteredEvents = events.filter(event => {
    // Filter by search query
    if (searchQuery && !event.filepath.toLowerCase().includes(searchQuery.toLowerCase())) {
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

  async function loadRecentEvents() {
    try {
      const recentEvents = await invoke('get_recent_events', { limit: 50 });
      events = recentEvents.map(e => ({
        id: e.id,
        timestamp: e.timestamp,
        filepath: e.filepath || 'unknown',
        changeType: e.change_type,
        cpu: e.cpu,
        mem: e.mem
      }));
    } catch (error) {
      console.error('Failed to load events:', error);
    }
  }

  onMount(async () => {
    // Load initial events from database
    await loadRecentEvents();

    // Register keyboard shortcuts
    keyboard.register('1', toggleCreated);
    keyboard.register('2', toggleModified);
    keyboard.register('3', toggleDeleted);
    keyboard.register('c', clearEvents);
    keyboard.register('r', refreshEvents);

    // Listen for real-time file events
    try {
      unlisten = await listen('file-event', (event) => {
        const fileEvent = event.payload;

        // Add new event to the top of the list
        events = [{
          id: Date.now(), // Temporary ID until we reload from DB
          timestamp: fileEvent.timestamp,
          filepath: fileEvent.filepath,
          changeType: fileEvent.changeType,
          cpu: 0, // Will be updated on next poll
          mem: 0
        }, ...events].slice(0, 100); // Keep last 100 events
      });

      // Poll database every 5 seconds to get full event data with metrics
      pollIntervalId = setInterval(loadRecentEvents, 5000);
    } catch (error) {
      console.error('Failed to setup event listener:', error);

      // Fallback to mock data if Tauri not available
      const mockEventInterval = setInterval(() => {
        const files = ['src/main.rs', 'src/modules/db.rs', 'frontend/src/App.svelte', 'Cargo.toml'];
        const types = ['modified', 'created', 'deleted'];

        events = [{
          id: events.length + 1,
          timestamp: new Date().toISOString(),
          filepath: files[Math.floor(Math.random() * files.length)],
          changeType: types[Math.floor(Math.random() * types.length)],
          cpu: Math.random() * 100,
          mem: Math.random() * 100
        }, ...events].slice(0, 50);
      }, 5000);
    }
  });

  onDestroy(() => {
    if (unlisten) {
      unlisten();
    }
    if (pollIntervalId) {
      clearInterval(pollIntervalId);
    }
  });

  function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
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
      bind:value={searchQuery}
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

  <div class="events">
    {#each filteredEvents as event (event.id)}
      <div class="event {getChangeClass(event.changeType)}">
        <div class="event-header">
          <span class="filepath">{event.filepath}</span>
          <span class="time">{formatTime(event.timestamp)}</span>
        </div>
        <div class="event-details">
          <span class="badge {event.changeType}">{event.changeType}</span>
          <span class="metric">CPU: {event.cpu.toFixed(1)}%</span>
          <span class="metric">MEM: {event.mem.toFixed(1)}%</span>
        </div>
      </div>
    {/each}

    {#if events.length === 0}
      <div class="empty">
        <p>No events yet...</p>
        <p class="hint">Waiting for file changes to be detected</p>
      </div>
    {/if}
  </div>
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
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid #333;
  }

  .count {
    color: #888;
    font-size: 0.9rem;
  }

  .header-actions {
    display: flex;
    gap: 0.5rem;
  }

  .export-btn {
    padding: 0.25rem 0.75rem;
    font-size: 0.85rem;
    background: #2a2a2a;
    color: #646cff;
    border: 1px solid #646cff;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .export-btn:hover {
    background: #646cff;
    color: #fff;
  }

  .clear-btn {
    padding: 0.25rem 0.75rem;
    font-size: 0.85rem;
    background: #2a2a2a;
    color: #ef4444;
    border: 1px solid #ef4444;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .clear-btn:hover {
    background: #ef4444;
    color: #fff;
  }

  .events {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .event {
    background: #2a2a2a;
    padding: 1rem;
    border-radius: 6px;
    border-left: 3px solid #646cff;
    transition: background 0.2s;
  }

  .event:hover {
    background: #333;
  }

  .event.change-created {
    border-left-color: #4ade80;
  }

  .event.change-modified {
    border-left-color: #f59e0b;
  }

  .event.change-deleted {
    border-left-color: #ef4444;
  }

  .event-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .filepath {
    font-family: 'Courier New', monospace;
    color: #fff;
    font-weight: 500;
  }

  .time {
    color: #666;
    font-size: 0.85rem;
  }

  .event-details {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }

  .badge {
    padding: 0.2rem 0.5rem;
    font-size: 0.75rem;
    border-radius: 3px;
    text-transform: uppercase;
    font-weight: 600;
  }

  .badge.modified {
    background: #f59e0b33;
    color: #f59e0b;
  }

  .badge.created {
    background: #4ade8033;
    color: #4ade80;
  }

  .badge.deleted {
    background: #ef444433;
    color: #ef4444;
  }

  .metric {
    color: #888;
    font-size: 0.85rem;
  }

  .empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    color: #666;
  }

  .empty p {
    margin: 0.5rem 0;
  }

  .hint {
    font-size: 0.9rem;
    color: #555;
  }

  .filters {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-bottom: 1rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid #333;
  }

  .search-input {
    width: 100%;
    padding: 0.5rem 0.75rem;
    background: #2a2a2a;
    border: 1px solid #444;
    border-radius: 4px;
    color: #fff;
    font-size: 0.9rem;
    font-family: 'Courier New', monospace;
  }

  .search-input:focus {
    outline: none;
    border-color: #646cff;
    background: #333;
  }

  .search-input::placeholder {
    color: #666;
  }

  .type-filters {
    display: flex;
    gap: 1rem;
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
    font-size: 0.85rem;
    font-weight: 600;
    text-transform: uppercase;
    padding: 0.2rem 0.5rem;
    border-radius: 3px;
  }

  .filter-label.created {
    background: #4ade8033;
    color: #4ade80;
  }

  .filter-label.modified {
    background: #f59e0b33;
    color: #f59e0b;
  }

  .filter-label.deleted {
    background: #ef444433;
    color: #ef4444;
  }
</style>
