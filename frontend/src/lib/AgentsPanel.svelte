<script>
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';
  import { formatDateTime } from './timeFormat.js';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import { API_CONFIG } from '../config.js';

  const API_BASE = API_CONFIG.API_BASE;

  let activeTab = 'overview'; // 'overview', 'activity', 'performance'
  let agents = [];
  let agentStats = [];
  let agentEvents = [];
  let loading = true;
  let error = null;
  let lastUpdated = null;
  let isRefreshing = false;
  let searchQuery = '';

  // Agent color mapping
  const AGENT_COLORS = {
    'claude': 'var(--accent)',
    'gpt': 'var(--success)',
    'gemini': 'var(--info)',
    'ollama': 'var(--warning)',
    'default': 'var(--muted)'
  };

  // WebSocket event handlers (event-driven, no polling)
  const handleAgentEvent = (event) => {
    // Add to events list
    agentEvents = [event, ...agentEvents].slice(0, 20);
    lastUpdated = new Date();
  };

  const handleAgentStats = (stats) => {
    agentStats = stats;
    lastUpdated = new Date();
  };

  const handleProjectSwitched = async (data) => {
    await loadAllData();
  };

  const handleFileChanged = async () => {
    // Reload agent data when files change (agents might have done work)
    await loadAllData();
  };

  onMount(async () => {
    // Initial data load
    await loadAllData();

    // Connect to WebSocket for real-time updates
    websocketService.connect();

    // Listen for real-time agent events (no polling needed!)
    websocketService.on('agent-event', handleAgentEvent);
    websocketService.on('agent-stats', handleAgentStats);
    websocketService.on('project-switched', handleProjectSwitched);
    websocketService.on('file-changed', handleFileChanged);
  });

  onDestroy(() => {
    // Remove WebSocket listeners
    websocketService.off('agent-event', handleAgentEvent);
    websocketService.off('agent-stats', handleAgentStats);
    websocketService.off('project-switched', handleProjectSwitched);
    websocketService.off('file-changed', handleFileChanged);
  });

  async function loadAllData(manual = false) {
    loading = activeTab === 'overview' && !lastUpdated; // Only show loading on first load
    isRefreshing = manual;
    error = null;

    try {
      const [agentsRes, statsRes, eventsRes] = await Promise.all([
        fetch(`${API_BASE}/agents-status`),
        fetch(`${API_BASE}/agent-stats`),
        fetch(`${API_BASE}/agent-events?limit=20`)
      ]);

      agents = await agentsRes.json();
      agentStats = await statsRes.json();
      agentEvents = await eventsRes.json();

      error = null;
      lastUpdated = new Date();
    } catch (e) {
      error = `Failed to load agent data: ${e}`;
    } finally {
      loading = false;
      isRefreshing = false;
    }
  }

  // Format time ago (reactive, no interval)
  function getTimeAgo() {
    if (!lastUpdated) return 'Just now';
    const seconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
    if (seconds < 10) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  }

  // Compute reactively when lastUpdated changes
  $: timeAgo = getTimeAgo();

  function getAgentColor(agentName) {
    const lowerName = agentName.toLowerCase();
    for (const [key, color] of Object.entries(AGENT_COLORS)) {
      if (lowerName.includes(key)) return color;
    }
    return AGENT_COLORS.default;
  }

  function getStatusIcon(isRunning) {
    return isRunning ? '🟢' : '⚫';
  }

  function getStatusText(isRunning) {
    return isRunning ? 'Active' : 'Idle';
  }

  function formatTimestamp(timestamp) {
    if (!timestamp) return 'Never';
    return formatDateTime(timestamp);
  }

  function formatDuration(ms) {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  function getEventIcon(eventType) {
    switch(eventType.toLowerCase()) {
    case 'edit': return '✏️';
    case 'create': return '➕';
    case 'delete': return '🗑️';
    case 'read': return '👁️';
    case 'execute': return '⚙️';
    default: return '📝';
    }
  }

  function getTotalEvents() {
    return agentStats.reduce((sum, stat) => sum + (stat?.event_count || 0), 0);
  }

  function getTotalLinesChanged() {
    return agentStats.reduce((sum, stat) => sum + (stat?.total_lines_changed || 0), 0);
  }

  function getAverageResponseTime() {
    const length = agentStats.length;
    if (length === 0) return 0;
    const total = agentStats.reduce((sum, stat) => sum + (stat.avg_duration_ms || 0), 0);
    return Math.round(total / length);
  }

  // Filter agents by search query
  $: filteredAgentStats = searchQuery
    ? agentStats.filter(stat => stat.agent.toLowerCase().includes(searchQuery.toLowerCase()))
    : agentStats;

  $: filteredAgentEvents = searchQuery
    ? agentEvents.filter(event => event.agent.toLowerCase().includes(searchQuery.toLowerCase()))
    : agentEvents;

  // Export functions
  function exportAgentStatsCSV() {
    const headers = ['Agent', 'Event Count', 'Lines Changed', 'Avg Duration (ms)'];
    const rows = agentStats.map(stat => [
      stat.agent,
      stat.event_count,
      stat.total_lines_changed || 0,
      stat.avg_duration_ms || 'N/A'
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    downloadFile(csv, 'agent-stats.csv', 'text/csv');
  }

  function exportAgentStatsJSON() {
    const data = {
      exported_at: new Date().toISOString(),
      total_agents: agentStats.length,
      total_events: getTotalEvents(),
      total_lines_changed: getTotalLinesChanged(),
      avg_response_time: getAverageResponseTime(),
      agents: agentStats
    };

    downloadFile(JSON.stringify(data, null, 2), 'agent-stats.json', 'application/json');
  }

  function downloadFile(content, filename, contentType) {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }
</script>

<div class="agents-panel" role="region" aria-label="AI Agents monitoring">
  <div class="header">
    <h2 id="agents-heading">🤖 AI Agents</h2>
    <div class="header-actions" role="toolbar" aria-label="Agent panel actions">
      <span class="last-updated" role="status" aria-live="polite">Updated: {timeAgo}</span>
      <div class="export-dropdown">
        <button class="btn-export" aria-label="Export agent data" aria-haspopup="menu">📊 Export</button>
        <div class="export-menu" role="menu" aria-label="Export options">
          <button on:click={exportAgentStatsCSV} role="menuitem" aria-label="Export as CSV">📄 Export CSV</button>
          <button on:click={exportAgentStatsJSON} role="menuitem" aria-label="Export as JSON">📋 Export JSON</button>
        </div>
      </div>
      <button on:click={() => loadAllData(true)} class="btn-refresh" disabled={isRefreshing} aria-label="Refresh agent data">
        <span class="refresh-icon" class:spinning={isRefreshing} aria-hidden="true">↻</span>
        <span>Refresh</span>
      </button>
    </div>
  </div>

  {#if error}
    <div class="message error" role="alert">{error}</div>
  {/if}

  <!-- Summary Stats -->
  <div class="summary-stats" role="group" aria-labelledby="agents-heading">
    <div class="stat-card" role="status">
      <div class="stat-value">{agentStats.length}</div>
      <div class="stat-label">Active Agents</div>
    </div>
    <div class="stat-card" role="status">
      <div class="stat-value">{getTotalEvents()}</div>
      <div class="stat-label">Total Events</div>
    </div>
    <div class="stat-card" role="status">
      <div class="stat-value">{getTotalLinesChanged()}</div>
      <div class="stat-label">Lines Changed</div>
    </div>
    <div class="stat-card" role="status">
      <div class="stat-value">{formatDuration(getAverageResponseTime())}</div>
      <div class="stat-label">Avg Response Time</div>
    </div>
  </div>

  <!-- Search & Filter -->
  <div class="search-section" role="search" aria-label="Search agents">
    <input
      type="text"
      class="search-input"
      placeholder="🔍 Search agents..."
      bind:value={searchQuery}
      aria-label="Search agents by name"
    />
  </div>

  <!-- Tabs -->
  <div class="tabs" role="tablist" aria-label="Agent information tabs">
    <button
      class="tab"
      class:active={activeTab === 'overview'}
      on:click={() => activeTab = 'overview'}
      role="tab"
      aria-selected={activeTab === 'overview'}
      aria-controls="agents-tabpanel"
      id="overview-tab"
    >
      <span aria-hidden="true">📊</span> Overview
    </button>
    <button
      class="tab"
      class:active={activeTab === 'activity'}
      on:click={() => activeTab = 'activity'}
      role="tab"
      aria-selected={activeTab === 'activity'}
      aria-controls="agents-tabpanel"
      id="activity-tab"
    >
      <span aria-hidden="true">📝</span> Recent Activity
    </button>
    <button
      class="tab"
      class:active={activeTab === 'performance'}
      on:click={() => activeTab = 'performance'}
      role="tab"
      aria-selected={activeTab === 'performance'}
      aria-controls="agents-tabpanel"
      id="performance-tab"
    >
      <span aria-hidden="true">⚡️</span> Performance
    </button>
  </div>

  <!-- Tab Content -->
  <div class="tab-content" id="agents-tabpanel" role="tabpanel" aria-labelledby="{activeTab}-tab">
    {#if loading}
      <div role="status" aria-live="polite" aria-busy="true"><LoadingSkeleton type="grid" count={4} /></div>
    {:else if activeTab === 'overview'}
      <!-- Overview Tab -->
      {#if filteredAgentStats.length === 0}
        <div class="empty" role="status">
          <div class="icon">{searchQuery ? '🔍' : '🤖'}</div>
          <h3>{searchQuery ? 'No agents match your search' : 'No Agent Activity Yet'}</h3>
          <p>{searchQuery ? 'Try a different search term' : 'Send telemetry events to see agent statistics here.'}</p>
          {#if !searchQuery}
            <p class="hint">Agents will appear automatically when they start sending events.</p>
          {/if}
        </div>
      {:else}
        <div class="agents-grid" role="list" aria-label="Agent list">
          {#each filteredAgentStats as stat (stat.agent)}
            <article class="agent-card" style="border-left-color: {getAgentColor(stat.agent)}" role="listitem">
              <div class="agent-header">
                <div class="agent-icon" style="background-color: {getAgentColor(stat.agent)}" aria-hidden="true">
                  {stat.agent.charAt(0).toUpperCase()}
                </div>
                <div class="agent-info">
                  <h3>{stat.agent}</h3>
                  <span class="agent-type">AI Agent</span>
                </div>
              </div>

              <div class="agent-stats" role="group" aria-label="{stat.agent} statistics">
                <div class="stat-row">
                  <span class="label">Events:</span>
                  <span class="value">{stat.event_count}</span>
                </div>
                <div class="stat-row">
                  <span class="label">Lines Changed:</span>
                  <span class="value">{stat.total_lines_changed || 0}</span>
                </div>
                <div class="stat-row">
                  <span class="label">Avg Duration:</span>
                  <span class="value">{formatDuration(stat.avg_duration_ms)}</span>
                </div>
              </div>
            </article>
          {/each}
        </div>
      {/if}

    {:else if activeTab === 'activity'}
      <!-- Activity Tab -->
      {#if filteredAgentEvents.length === 0}
        <div class="empty" role="status">
          <div class="icon" aria-hidden="true">{searchQuery ? '🔍' : '📝'}</div>
          <h3>{searchQuery ? 'No events match your search' : 'No Recent Activity'}</h3>
          <p>{searchQuery ? 'Try a different search term' : 'Agent events will appear here as they occur.'}</p>
        </div>
      {:else}
        <div class="events-list" role="feed" aria-label="Agent activity feed">
          {#each filteredAgentEvents as event (event.id || event.timestamp)}
            <article class="event-row" role="article">
              <span class="event-icon" aria-hidden="true">{getEventIcon(event.event_type)}</span>
              <div class="event-details">
                <div class="event-header">
                  <span class="event-agent" style="color: {getAgentColor(event.agent)}">
                    {event.agent}
                  </span>
                  <span class="event-type">{event.event_type}</span>
                </div>
                <div class="event-message">{event.message}</div>
                {#if event.file}
                  <div class="event-file">📄 {event.file}</div>
                {/if}
              </div>
              <div class="event-meta">
                {#if event.duration_ms}
                  <span class="event-duration">{formatDuration(event.duration_ms)}</span>
                {/if}
                {#if event.lines_changed}
                  <span class="event-lines">{event.lines_changed} lines</span>
                {/if}
                <time class="event-time" datetime="{event.timestamp}">{formatTimestamp(event.timestamp)}</time>
              </div>
            </article>
          {/each}
        </div>
      {/if}

    {:else if activeTab === 'performance'}
      <!-- Performance Tab -->
      {#if filteredAgentStats.length === 0}
        <div class="empty">
          <div class="icon">⚡️</div>
          <h3>No Performance Data</h3>
          <p>Performance metrics will appear here once agents are active.</p>
        </div>
      {:else}
        <div class="performance-grid">
          <div class="performance-card">
            <h3>Response Time Comparison</h3>
            <div class="performance-bars">
              {#each filteredAgentStats.slice().sort((a, b) => (b.avg_duration_ms || 0) - (a.avg_duration_ms || 0)) as stat (stat.agent)}
                {@const maxDuration = Math.max(...filteredAgentStats.map(s => s.avg_duration_ms || 0), 1)}
                <div class="bar-row">
                  <span class="bar-label" style="color: {getAgentColor(stat.agent)}">
                    {stat.agent}
                  </span>
                  <div class="bar-container">
                    <div
                      class="bar-fill"
                      style="width: {stat.avg_duration_ms ? ((stat.avg_duration_ms / maxDuration) * 100) : 0}%; background-color: {getAgentColor(stat.agent)}"
                    ></div>
                  </div>
                  <span class="bar-value">{stat.avg_duration_ms ? formatDuration(stat.avg_duration_ms) : 'N/A'}</span>
                </div>
              {/each}
            </div>
          </div>

          <div class="performance-card">
            <h3>Activity Distribution</h3>
            <div class="performance-bars">
              {#each filteredAgentStats.slice().sort((a, b) => b.event_count - a.event_count) as stat (stat.agent)}
                {@const maxEvents = filteredAgentStats.length > 0 ? Math.max(...filteredAgentStats.map(s => s?.event_count || 0)) : 1}
                <div class="bar-row">
                  <span class="bar-label" style="color: {getAgentColor(stat.agent)}">
                    {stat.agent}
                  </span>
                  <div class="bar-container">
                    <div
                      class="bar-fill"
                      style="width: {(stat.event_count / maxEvents) * 100}%; background-color: {getAgentColor(stat.agent)}"
                    ></div>
                  </div>
                  <span class="bar-value">{stat.event_count} events</span>
                </div>
              {/each}
            </div>
          </div>

          <div class="performance-card">
            <h3>Code Impact</h3>
            <div class="performance-bars">
              {#each filteredAgentStats.slice().sort((a, b) => (b.total_lines_changed || 0) - (a.total_lines_changed || 0)) as stat (stat.agent)}
                {@const maxLines = filteredAgentStats.length > 0 ? Math.max(...filteredAgentStats.map(s => s?.total_lines_changed || 0)) : 1}
                <div class="bar-row">
                  <span class="bar-label" style="color: {getAgentColor(stat.agent)}">
                    {stat.agent}
                  </span>
                  <div class="bar-container">
                    <div
                      class="bar-fill"
                      style="width: {maxLines > 0 ? ((stat.total_lines_changed || 0) / maxLines) * 100 : 0}%; background-color: {getAgentColor(stat.agent)}"
                    ></div>
                  </div>
                  <span class="bar-value">{stat.total_lines_changed || 0} lines</span>
                </div>
              {/each}
            </div>
          </div>
        </div>
      {/if}
    {/if}
  </div>

  <div class="footer">
    <p class="hint">
      Raven monitors AI agent activity through telemetry events.
      Supports: Claude, GPT, Gemini, Ollama, and more.
    </p>
  </div>
</div>

<style>
  .agents-panel {
    padding: 24px;
    width: 100%;
    margin: 0;
    font-family: var(--mono);
    background: var(--bg);
    color: var(--text);
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

  .header-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .last-updated {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--muted);
  }

  .btn-refresh {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    cursor: pointer;
    font-size: 12px;
    transition: all 0.2s;
  }

  .btn-refresh:hover:not(:disabled) {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
    transform: translateY(-1px);
  }

  .btn-refresh:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .refresh-icon {
    display: inline-block;
    transition: transform 0.3s ease;
  }

  .refresh-icon.spinning {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  /* Export Dropdown */
  .export-dropdown {
    position: relative;
  }

  .btn-export {
    padding: 8px 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    cursor: pointer;
    font-size: 12px;
    transition: all 0.2s;
  }

  .btn-export:hover {
    background: var(--surface-2);
  }

  .btn-export:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .export-menu {
    display: none;
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 4px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    z-index: 100;
    min-width: 150px;
  }

  .export-dropdown:hover .export-menu,
  .export-dropdown:focus-within .export-menu {
    display: block;
  }

  .export-menu button {
    display: block;
    width: 100%;
    padding: 10px 16px;
    background: transparent;
    border: none;
    color: var(--text);
    text-align: left;
    cursor: pointer;
    font-size: 12px;
    font-family: var(--mono);
    transition: background 0.2s;
  }

  .export-menu button:hover {
    background: var(--surface-2);
  }

  .export-menu button:first-child {
    border-radius: 6px 6px 0 0;
  }

  .export-menu button:last-child {
    border-radius: 0 0 6px 6px;
  }

  .message {
    padding: 12px;
    border-radius: 6px;
    margin-bottom: 10px;
    font-size: 12px;
  }

  .message.error {
    background: color-mix(in srgb, var(--error) 15%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--error) 25%, var(--surface));
    color: var(--error);
  }

  /* Search Section */
  .search-section {
    margin-bottom: 12px;
  }

  .search-input {
    width: 100%;
    padding: 10px 16px;
    background: var(--surface);
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
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent);
  }

  .search-input::placeholder {
    color: var(--muted);
  }

  /* Summary Stats */
  .summary-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
    margin-bottom: 10px;
  }

  .stat-card {
    background: var(--surface);
    border: 1px solid var(--surface-2);
    border-radius: 8px;
    padding: 12px;
    text-align: center;
  }

  .stat-value {
    font-size: 13px;
    font-weight: 700;
    color: var(--warning);
    margin-bottom: 8px;
  }

  .stat-label {
    font-size: 12px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* Tabs */
  .tabs {
    display: flex;
    gap: 4px;
    align-items: center;
    margin-bottom: 10px;
    border-bottom: 2px solid var(--surface-2);
  }

  .tab {
    padding: 12px 20px;
    background: transparent;
    border: none;
    border-bottom: 3px solid transparent;
    color: var(--muted);
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    transition: all 0.2s;
  }

  .tab:hover {
    color: var(--text);
    background: var(--surface);
  }

  .tab:focus {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .tab.active {
    color: var(--warning);
    border-bottom-color: var(--warning);
  }

  .tab-content {
    min-height: 400px;
  }

  .loading {
    text-align: center;
    padding: 16px 20px;
    color: var(--muted);
    font-size: 12px;
  }

  .empty {
    text-align: center;
    padding: 16px 20px;
    color: var(--muted);
  }

  .empty .icon {
    font-size: 13px;
    margin-bottom: 10px;
  }

  .empty h3 {
    color: var(--text);
    font-size: 15px;
    margin-bottom: 12px;
  }

  .empty p {
    font-size: 12px;
    line-height: 1.4;
    margin-bottom: 8px;
  }

  .empty .hint {
    font-size: 12px;
    color: var(--muted);
    font-style: italic;
  }

  /* Overview Tab */
  .agents-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 12px;
  }

  .agent-card {
    background: var(--surface);
    border: 1px solid var(--surface-2);
    border-left-width: 4px;
    border-radius: 8px;
    padding: 16px;
  }

  .agent-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 10px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--surface-2);
  }

  .agent-icon {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 13px;
    font-weight: 700;
    flex-shrink: 0;
  }

  .agent-info {
    flex: 1;
  }

  .agent-info h3 {
    margin: 0 0 4px 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--text);
  }

  .agent-type {
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .agent-stats {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .stat-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 13px;
  }

  .stat-row .label {
    color: var(--muted);
  }

  .stat-row .value {
    color: var(--text);
    font-weight: 600;
  }

  /* Activity Tab */
  .events-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .event-row {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    background: var(--surface);
    border: 1px solid var(--surface-2);
    border-radius: 6px;
    padding: 12px;
    transition: all 0.2s;
  }

  .event-row:hover {
    background: var(--surface-2);
    border-color: var(--surface-2);
  }

  .event-icon {
    font-size: 12px;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .event-details {
    flex: 1;
    min-width: 0;
  }

  .event-header {
    display: flex;
    gap: 12px;
    align-items: center;
    margin-bottom: 4px;
  }

  .event-agent {
    font-weight: 600;
    font-size: 12px;
  }

  .event-type {
    background: var(--surface-2);
    padding: 2px 8px;
    border-radius: 8px;
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
  }

  .event-message {
    color: var(--text);
    font-size: 13px;
    margin-bottom: 4px;
  }

  .event-file {
    color: var(--muted);
    font-size: 12px;
    font-family: monospace;
  }

  .event-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
    font-size: 11px;
    color: var(--muted);
  }

  .event-duration,
  .event-lines {
    background: var(--surface-2);
    padding: 2px 6px;
    border-radius: 6px;
  }

  /* Performance Tab */
  .performance-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
    gap: 12px;
  }

  .performance-card {
    background: var(--surface);
    border: 1px solid var(--surface-2);
    border-radius: 8px;
    padding: 12px;
  }

  .performance-card h3 {
    color: var(--text);
    font-size: 15px;
    margin-bottom: 10px;
    font-weight: 600;
  }

  .performance-bars {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .bar-row {
    display: grid;
    grid-template-columns: 120px 1fr 80px;
    gap: 12px;
    align-items: center;
  }

  .bar-label {
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .bar-container {
    height: 8px;
    background: var(--surface-2);
    border-radius: 4px;
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.3s ease;
  }

  .bar-value {
    font-size: 12px;
    color: var(--muted);
    text-align: right;
  }

  /* Footer */
  .footer {
    margin-top: 30px;
    padding-top: 20px;
    border-top: 1px solid var(--surface-2);
  }

  .footer .hint {
    font-size: 13px;
    color: var(--muted);
    text-align: center;
    line-height: 1.4;
  }

  @media (max-width: 768px) {
    .agents-grid,
    .performance-grid {
      grid-template-columns: 1fr;
    }

    .bar-row {
      grid-template-columns: 80px 1fr 60px;
    }
  }
</style>
