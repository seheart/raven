<script>
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';
  import { formatTime as formatTimeString } from './timeFormat.js';
  import TimelineSlider from './TimelineSlider.svelte';
  import VirtualScroll from './VirtualScroll.svelte';
  import { debounceInput } from './utils/debounce.js';
  import ProjectBadge from './ProjectBadge.svelte';
  import PageInfo from './PageInfo.svelte';

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
      const response = await fetch(`${API_BASE}/all-file-events?limit=1000`);
      const recentEvents = await response.json();

      events = recentEvents.map(e => ({
        id: e.id,
        timestamp: e.timestamp,
        filepath: e.filepath || 'unknown',
        changeType: mapChangeType(e.change_type),
        project: e.project || null,
        cpu: e.cpu || 0,
        mem: e.mem || 0
      }));
    } catch (error) {
      console.error('Failed to load events:', error);
    }
  }

  // Map backend change_type to frontend changeType
  function mapChangeType(backendType) {
    switch(backendType) {
      case 'add': return 'created';
      case 'change': return 'modified';
      case 'unlink': return 'deleted';
      default: return 'modified';
    }
  }

  // WebSocket event handlers
  const handleFileChanged = (event) => {
    // Add new event to the top of the list
    events = [{
      id: event.id || Date.now(),
      timestamp: event.timestamp || new Date().toISOString(),
      filepath: event.filepath || 'unknown',
      changeType: mapChangeType(event.change_type || event.changeType),
      project: event.project || null,
      cpu: event.cpu || 0,
      mem: event.mem || 0
    }, ...events].slice(0, 1000); // Keep last 1000 events
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

    // Listen for real-time file change events
    websocketService.on('file-changed', handleFileChanged);

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
    websocketService.off('file-changed', handleFileChanged);
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
  <PageInfo
    title="Event Log"
    description="This is your complete file system activity ledger - think of it like a **detailed transaction log** for every file operation across all your monitored projects. The Event Log records EVERY file event chronologically: when files were created, edited, deleted, or renamed, along with timestamps, file paths, and change sizes. Unlike the Live Code Feed (which shows diffs), this is a pure chronological list - perfect for auditing what changed when or exporting for analysis."
    keyPoints={[
      '**Event List** - Scrollable table showing all file system events in chronological order (newest first). Columns: Timestamp (exact date/time), Event Type (Create/Edit/Delete/Rename with color-coded icons), Project (which project the file belongs to), File Path (full path to the file), Change Size (bytes added/removed if applicable). Can display thousands of events with virtual scrolling (smooth performance).',
      '**Event Type Icons** - ➕ Create (green) = New file created, ✏️ Edit (blue) = Existing file modified, 🗑️ Delete (red) = File removed, 🔄 Rename (orange) = File moved or renamed (appears as Delete old path + Create new path). Color coding makes it easy to scan for specific operations.',
      '**Search & Filter** - Search box: Type filename or path fragment to filter events (e.g., server.js shows all events for files matching that). Event Type filter: Show only Creates, Edits, Deletes, or Renames. Project filter: Narrow to events from specific project. Date range filter: Show events from specific time period.',
      '**Timeline Slider** - Visual timeline showing activity density over time. Drag slider handles to select a time range - event list updates to show only events within that window. Useful for focusing on specific time periods like what happened between 2-3pm.',
      '**Export Functionality** - JSON button exports filtered events as JSON file (machine-readable, good for scripts). CSV button exports as CSV (opens in Excel/Google Sheets). Exported data includes all columns: timestamp, type, project, path, size. Great for analysis, reporting, or backup.',
      '**Real-Time Updates** - New file events appear at the top of the list immediately via WebSocket as they happen. No refresh needed. Watch the list grow in real-time while you or AI agents work.',
      '**Virtual Scrolling** - Even with 10,000+ events, the list stays smooth. Only renders visible rows. Scroll up/down to browse through massive event history without lag. Event counter shows filtered count and total events.'
    ]}
    whenToCheck="Use Event Log **to audit file changes** (who changed config.json and when), **find when a file was modified** (search filename and check timestamps), **export data for analysis** (generate reports of coding activity), **debug unexpected changes** (see what file operations happened), or **track AI agent file activity** (see which files AI modified and when)."
    warnings={[
      '**Very large event counts (>50,000)** - Filtering and searching might slow down with massive datasets. Solutions: Use date range filter to narrow scope first (e.g., last 7 days only), Clear old events via Storage page, Export to JSON and analyze externally instead of in browser. Virtual scrolling helps, but filtering still processes all events.',
      '**Events stop appearing** - File watcher stopped working. Check Status page to verify file watchers are active. Possible causes: EMFILE error (too many files open - see SETUP.md), Watcher crashed (check backend logs), Directories not being monitored (check backend config). Edit a file in monitored project to test - should appear within 2 seconds.',
      '**Renamed/moved files show as Delete + Create** - This is expected behavior. File system does not have a true rename event - it is implemented as delete old path + create new path. Both events will have same timestamp. If you see Delete immediately followed by Create with same file content, it was a rename.',
      '**Event timestamps are confusing** - Make sure your system clock is correct. Events are timestamped when Raven detects them, not when they actually happened. If you edit a file while Raven is stopped, the event will not be recorded. Timestamps reflect when Raven saw the change.',
      '**Huge change sizes (>1GB)** - Indicates binary file or very large file was modified. Examples: Database dump, Video file, Large log. These are usually unintentional (should not be in git) or build artifacts. Consider adding to .gitignore and Raven ignore patterns.',
      '**Timeline slider does not narrow results** - JavaScript issue or browser compatibility. Try: Refreshing page, Clearing browser cache, Using search/filters instead, Checking browser console for errors. Timeline is a nice-to-have feature - search and filters are more reliable.',
      '**Export creates empty file** - No events match current filters. Check that: Filter dropdowns are not excluding everything, Date range includes events, Search term matches filenames. Clear all filters and try export again to verify events exist.'
    ]}
  />

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

  <div class="timeline-container">
    <TimelineSlider events={events} onTimeRangeChange={handleTimeRangeChange} />
  </div>

  {#if filteredEvents.length > 0}
    <div class="events">
      <VirtualScroll
        bind:this={virtualScroll}
        items={filteredEvents}
        itemHeight={90}
        containerHeight={500}
        overscan={3}
        getKey={event => event.id}
        let:item
      >
        <div class="event-card {getChangeClass(item.changeType)}">
          <div class="event-type-indicator">
            <span class="event-icon">
              {#if item.changeType === 'created'}
                ➕
              {:else if item.changeType === 'modified'}
                ✏️
              {:else if item.changeType === 'deleted'}
                🗑️
              {/if}
            </span>
          </div>

          <div class="event-content">
            <div class="event-main">
              <div class="event-filepath">
                <span class="filepath-text">{item.filepath}</span>
                {#if item.project}
                  <ProjectBadge project={item.project} size="small" />
                {/if}
              </div>
              <span class="event-time">{formatTime(item.timestamp)}</span>
            </div>

            <div class="event-metadata">
              <span class="event-badge {item.changeType}">
                {item.changeType}
              </span>
              <div class="event-metrics">
                <span class="metric cpu">
                  <span class="metric-icon">⚙️</span>
                  <span class="metric-value">{(item.cpu ?? 0).toFixed(1)}%</span>
                  <span class="metric-label">CPU</span>
                </span>
                <span class="metric mem">
                  <span class="metric-icon">💾</span>
                  <span class="metric-value">{(item.mem ?? 0).toFixed(1)}%</span>
                  <span class="metric-label">RAM</span>
                </span>
              </div>
            </div>
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
      <p class="hint">Try adjusting your search or filter criteria</p>
    </div>
  {/if}
</div>

<style>
  .event-feed {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 24px;
    position: relative;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border);
  }

  .count {
    color: var(--muted);
    font-size: 13px;
    font-family: var(--mono);
  }

  .header-actions {
    display: flex;
    gap: 8px;
  }

  .export-btn {
    padding: 6px 12px;
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
    padding: 6px 12px;
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
    gap: 12px;
    background: var(--bg);
    padding: 8px;
  }

  /* Card Layout */
  .event-card {
    display: flex;
    gap: 16px;
    background: var(--bg);
    padding: 16px;
    border-radius: 8px;
    border-left: 4px solid var(--info);
    border: 1px solid var(--border);
    border-left: 4px solid var(--info);
  }

  .event-card.change-created {
    border-left-color: var(--success);
  }

  .event-card.change-modified {
    border-left-color: var(--warning);
  }

  .event-card.change-deleted {
    border-left-color: var(--error);
  }

  /* Icon Indicator */
  .event-type-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 40px;
    height: 40px;
  }

  .event-icon {
    font-size: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Content Area */
  .event-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }

  .event-main {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
  }

  .event-filepath {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
    min-width: 0;
  }

  .filepath-text {
    font-family: 'Courier New', monospace;
    color: var(--text);
    font-weight: 500;
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .event-time {
    color: var(--muted);
    font-size: 11px;
    white-space: nowrap;
    font-family: var(--mono);
  }

  /* Metadata Row */
  .event-metadata {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .event-badge {
    padding: 4px 10px;
    font-size: 10px;
    border-radius: 4px;
    text-transform: uppercase;
    font-weight: 700;
    letter-spacing: 0.5px;
  }

  .event-badge.modified {
    background: color-mix(in srgb, var(--warning) 20%, transparent);
    color: var(--warning);
    border: 1px solid color-mix(in srgb, var(--warning) 30%, transparent);
  }

  .event-badge.created {
    background: color-mix(in srgb, var(--success) 20%, transparent);
    color: var(--success);
    border: 1px solid color-mix(in srgb, var(--success) 30%, transparent);
  }

  .event-badge.deleted {
    background: color-mix(in srgb, var(--error) 20%, transparent);
    color: var(--error);
    border: 1px solid color-mix(in srgb, var(--error) 30%, transparent);
  }

  /* Metrics */
  .event-metrics {
    display: flex;
    gap: 16px;
    margin-left: auto;
  }

  .metric {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    background: var(--surface-2);
    border-radius: 6px;
    border: 1px solid var(--border);
  }

  .metric-icon {
    font-size: 14px;
  }

  .metric-value {
    font-family: var(--mono);
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
  }

  .metric-label {
    font-size: 10px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
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
    gap: 16px;
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border);
  }

  .search-input {
    width: 100%;
    padding: 10px 12px;
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
    gap: 20px;
    flex-wrap: wrap;
  }

  .filter-checkbox {
    display: flex;
    align-items: center;
    gap: 8px;
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
    padding: 5px 10px;
    border-radius: 4px;
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

  .timeline-container {
    margin-bottom: 24px;
  }
</style>
