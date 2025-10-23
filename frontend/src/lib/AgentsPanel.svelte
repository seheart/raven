<script>
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';
  import { formatDateTime } from './timeFormat.js';
  import PageInfo from './PageInfo.svelte';

  const API_BASE = 'http://localhost:3030/api';

  let activeTab = 'overview'; // 'overview', 'activity', 'performance'
  let agents = [];
  let agentStats = [];
  let agentEvents = [];
  let loading = true;
  let error = null;
  let refreshInterval;

  // Agent color mapping
  const AGENT_COLORS = {
    'claude': 'var(--accent)',
    'gpt': 'var(--success)',
    'gemini': 'var(--info)',
    'ollama': 'var(--warning)',
    'default': 'var(--muted)'
  };

  // WebSocket event handlers
  const handleAgentEvent = (event) => {
    // Add to events list
    agentEvents = [event, ...agentEvents].slice(0, 20);
  };

  const handleAgentStats = (stats) => {
    agentStats = stats;
  };

  const handleProjectSwitched = async (data) => {
    console.log('📡 Project switched, reloading agents data:', data.project);
    await loadAllData();
  };

  onMount(async () => {
    // Initial data load
    await loadAllData();

    // Connect to WebSocket for real-time updates
    websocketService.connect();

    // Listen for real-time agent events
    websocketService.on('agent-event', handleAgentEvent);

    // Listen for real-time agent stats
    websocketService.on('agent-stats', handleAgentStats);

    // Listen for project switch events
    websocketService.on('project-switched', handleProjectSwitched);

    // Fallback: refresh every 30 seconds (much slower since WebSocket handles real-time)
    refreshInterval = setInterval(loadAllData, 30000);
  });

  onDestroy(() => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }

    // Remove WebSocket listeners
    websocketService.off('agent-event', handleAgentEvent);
    websocketService.off('agent-stats', handleAgentStats);
    websocketService.off('project-switched', handleProjectSwitched);
  });

  async function loadAllData() {
    loading = activeTab === 'overview'; // Only show loading on first load
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
    } catch (e) {
      error = `Failed to load agent data: ${e}`;
      console.error(error);
    } finally {
      loading = false;
    }
  }

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
</script>

<div class="agents-panel">
  <PageInfo
    title="AI Agents Monitor"
    description="Real-time monitoring of AI agents (Claude, GPT, Gemini, Ollama, etc.) working across your projects. Track what your AI assistants are doing, which files they're editing, and their overall activity patterns."
    keyPoints={[
      'Active agents show 🟢 green status indicator',
      'Event count shows total actions taken by each agent',
      'Response time indicates agent performance',
      'Recent events stream shows latest agent actions in real-time',
      'Lines changed tracks total code modifications by agents'
    ]}
    whenToCheck="Check this page when you want to see what AI agents are doing, track their productivity, or verify they're responding properly to your requests."
    warnings={[
      'No agents showing means Raven hasn\'t detected any AI activity yet',
      'Very high event counts might indicate an agent stuck in a loop',
      'Long response times could mean slow API connections or rate limiting'
    ]}
  />

  <div class="header">
    <h2>🤖 AI Agents</h2>
    <button on:click={loadAllData} class="btn-refresh">
      ↻ Refresh
    </button>
  </div>

  {#if error}
    <div class="message error">{error}</div>
  {/if}

  <!-- Summary Stats -->
  <div class="summary-stats">
    <div class="stat-card">
      <div class="stat-value">{agentStats.length}</div>
      <div class="stat-label">Active Agents</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">{getTotalEvents()}</div>
      <div class="stat-label">Total Events</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">{getTotalLinesChanged()}</div>
      <div class="stat-label">Lines Changed</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">{formatDuration(getAverageResponseTime())}</div>
      <div class="stat-label">Avg Response Time</div>
    </div>
  </div>

  <!-- Tabs -->
  <div class="tabs">
    <button
      class="tab"
      class:active={activeTab === 'overview'}
      on:click={() => activeTab = 'overview'}
    >
      📊 Overview
    </button>
    <button
      class="tab"
      class:active={activeTab === 'activity'}
      on:click={() => activeTab = 'activity'}
    >
      📝 Recent Activity
    </button>
    <button
      class="tab"
      class:active={activeTab === 'performance'}
      on:click={() => activeTab = 'performance'}
    >
      ⚡️ Performance
    </button>
  </div>

  <!-- Tab Content -->
  <div class="tab-content">
    {#if loading}
      <div class="loading">Loading agents...</div>
    {:else if activeTab === 'overview'}
      <!-- Overview Tab -->
      {#if agentStats.length === 0}
        <div class="empty">
          <div class="icon">🤖</div>
          <h3>No Agent Activity Yet</h3>
          <p>Send telemetry events to see agent statistics here.</p>
          <p class="hint">Agents will appear automatically when they start sending events.</p>
        </div>
      {:else}
        <div class="agents-grid">
          {#each agentStats as stat}
            <div class="agent-card" style="border-left-color: {getAgentColor(stat.agent)}">
              <div class="agent-header">
                <div class="agent-icon" style="background-color: {getAgentColor(stat.agent)}">
                  {stat.agent.charAt(0).toUpperCase()}
                </div>
                <div class="agent-info">
                  <h3>{stat.agent}</h3>
                  <span class="agent-type">AI Agent</span>
                </div>
              </div>

              <div class="agent-stats">
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
            </div>
          {/each}
        </div>
      {/if}

    {:else if activeTab === 'activity'}
      <!-- Activity Tab -->
      {#if agentEvents.length === 0}
        <div class="empty">
          <div class="icon">📝</div>
          <h3>No Recent Activity</h3>
          <p>Agent events will appear here as they occur.</p>
        </div>
      {:else}
        <div class="events-list">
          {#each agentEvents as event}
            <div class="event-row">
              <span class="event-icon">{getEventIcon(event.event_type)}</span>
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
                <span class="event-time">{formatTimestamp(event.timestamp)}</span>
              </div>
            </div>
          {/each}
        </div>
      {/if}

    {:else if activeTab === 'performance'}
      <!-- Performance Tab -->
      {#if agentStats.length === 0}
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
              {#each agentStats.sort((a, b) => (b.avg_duration_ms || 0) - (a.avg_duration_ms || 0)) as stat}
                <div class="bar-row">
                  <span class="bar-label" style="color: {getAgentColor(stat.agent)}">
                    {stat.agent}
                  </span>
                  <div class="bar-container">
                    <div
                      class="bar-fill"
                      style="width: {Math.min(100, (stat.avg_duration_ms || 0) / 50)}%; background-color: {getAgentColor(stat.agent)}"
                    ></div>
                  </div>
                  <span class="bar-value">{formatDuration(stat.avg_duration_ms)}</span>
                </div>
              {/each}
            </div>
          </div>

          <div class="performance-card">
            <h3>Activity Distribution</h3>
            <div class="performance-bars">
              {#each agentStats.sort((a, b) => b.event_count - a.event_count) as stat}
                {@const maxEvents = agentStats.length > 0 ? Math.max(...agentStats.map(s => s?.event_count || 0)) : 1}
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
              {#each agentStats.sort((a, b) => (b.total_lines_changed || 0) - (a.total_lines_changed || 0)) as stat}
                {@const maxLines = agentStats.length > 0 ? Math.max(...agentStats.map(s => s?.total_lines_changed || 0)) : 1}
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

  .btn-refresh {
    padding: 8px 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    cursor: pointer;
    font-size: 12px;
    transition: all 0.2s;
  }

  .btn-refresh:hover {
    background: var(--surface-2);
    border-color: var(--border);
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
    transition: all 0.2s;
  }

  .agent-card:hover {
    border-color: var(--warning);
    background: var(--surface-2);
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
