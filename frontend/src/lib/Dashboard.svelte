<script>
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';

  const API_BASE = 'http://localhost:3030/api';

  let stats = {
    total_events: 0,
    total_files: 0,
    total_agents: 0,
    session_duration_seconds: 0,
    active_files_today: 0
  };

  let topFiles = [];
  let longestEdits = [];
  let agents = [];
  let loading = true;
  let refreshInterval;

  // WebSocket event handlers
  const handleAgentEvent = async () => {
    // Reload dashboard stats when new events come in
    const statsData = await fetch(`${API_BASE}/dashboard-stats`).then(r => r.json());
    stats = statsData;
  };

  const handleAgentStats = async () => {
    // Reload agents status when stats update
    const agentsData = await fetch(`${API_BASE}/agents-status`).then(r => r.json());
    agents = agentsData;
  };

  const handleProjectSwitched = async (data) => {
    console.log('📡 Project switched, reloading dashboard data:', data.project);
    await loadAllData();
  };

  onMount(async () => {
    await loadAllData();

    // Connect to WebSocket for real-time updates
    websocketService.connect();

    // Listen for real-time agent events (triggers stats reload)
    websocketService.on('agent-event', handleAgentEvent);

    // Listen for real-time agent stats
    websocketService.on('agent-stats', handleAgentStats);

    // Listen for project switch events
    websocketService.on('project-switched', handleProjectSwitched);

    // Fallback: refresh every 30 seconds (WebSocket should handle real-time)
    refreshInterval = setInterval(loadAllData, 30000);
  });

  onDestroy(() => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }

    // Clean up WebSocket listeners
    websocketService.off('agent-event', handleAgentEvent);
    websocketService.off('agent-stats', handleAgentStats);
    websocketService.off('project-switched', handleProjectSwitched);
  });

  async function loadAllData() {
    try {
      const [statsData, filesData, editsData, agentsData] = await Promise.all([
        fetch(`${API_BASE}/dashboard-stats`).then(r => r.json()),
        fetch(`${API_BASE}/top-modified-files?limit=10`).then(r => r.json()),
        fetch(`${API_BASE}/longest-edits?limit=10`).then(r => r.json()),
        fetch(`${API_BASE}/agents-status`).then(r => r.json())
      ]);

      stats = statsData;
      topFiles = filesData;
      longestEdits = editsData;
      agents = agentsData;
    } catch (e) {
      console.error('Failed to load dashboard data:', e);
    } finally {
      loading = false;
    }
  }

  function formatDuration(seconds) {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  }

  function formatTimestamp(timestamp) {
    return new Date(timestamp).toLocaleString();
  }

  function getAgentColor(agentName) {
    const agent = agents.find(a => a.agent_name === agentName);
    return agent ? agent.color : 'var(--muted)';
  }
</script>

<div class="dashboard">
  <div class="header">
    <h2>Raven Dashboard</h2>
    <button on:click={loadAllData} class="btn-refresh">
      ↻ Refresh
    </button>
  </div>

  {#if loading}
    <div class="loading">Loading dashboard...</div>
  {:else}
    <!-- Stats Cards -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon">📊</div>
        <div class="stat-content">
          <div class="stat-value">{stats.total_events}</div>
          <div class="stat-label">Total Events</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon">📁</div>
        <div class="stat-content">
          <div class="stat-value">{stats.total_files}</div>
          <div class="stat-label">Tracked Files</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon">🤖</div>
        <div class="stat-content">
          <div class="stat-value">{stats.total_agents}</div>
          <div class="stat-label">AI Agents</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon">⏱️</div>
        <div class="stat-content">
          <div class="stat-value">{formatDuration(stats.session_duration_seconds)}</div>
          <div class="stat-label">Session Duration</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon">🔥</div>
        <div class="stat-content">
          <div class="stat-value">{stats.active_files_today}</div>
          <div class="stat-label">Active Today</div>
        </div>
      </div>
    </div>

    <!-- Main Content Grid -->
    <div class="content-grid">
      <!-- Top Modified Files -->
      <div class="panel">
        <div class="panel-header">
          <h2>📝 Top Modified Files</h2>
          <span class="panel-count">{topFiles.length}</span>
        </div>
        <div class="panel-content">
          {#if topFiles.length === 0}
            <div class="empty-state">No file modifications yet</div>
          {:else}
            <div class="table">
              <div class="table-header">
                <div class="col-file">File</div>
                <div class="col-count">Edits</div>
                <div class="col-time">Last Modified</div>
              </div>
              {#each topFiles as file}
                <div class="table-row">
                  <div class="col-file" title={file.filepath}>
                    <span class="file-icon">📄</span>
                    <span class="file-path">{file.filepath}</span>
                  </div>
                  <div class="col-count">
                    <span class="badge">{file.edit_count}</span>
                  </div>
                  <div class="col-time">
                    {formatTimestamp(file.last_modified)}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>

      <!-- Longest Edits -->
      <div class="panel">
        <div class="panel-header">
          <h2>🎯 Longest Edits</h2>
          <span class="panel-count">{longestEdits.length}</span>
        </div>
        <div class="panel-content">
          {#if longestEdits.length === 0}
            <div class="empty-state">No agent edits recorded yet</div>
          {:else}
            <div class="table">
              <div class="table-header">
                <div class="col-file">File</div>
                <div class="col-count">Lines</div>
                <div class="col-agent">Agent</div>
              </div>
              {#each longestEdits as edit}
                <div class="table-row">
                  <div class="col-file" title={edit.filepath}>
                    <span class="file-icon">📄</span>
                    <span class="file-path">{edit.filepath || 'Unknown'}</span>
                  </div>
                  <div class="col-count">
                    <span class="badge lines">{edit.lines_changed}</span>
                  </div>
                  <div class="col-agent">
                    {#if edit.agent}
                      <span class="agent-badge" style="background-color: {getAgentColor(edit.agent)}">
                        {edit.agent}
                      </span>
                    {:else}
                      <span class="agent-badge unknown">Unknown</span>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>

      <!-- Active Agents -->
      <div class="panel agents-panel">
        <div class="panel-header">
          <h2>🤖 Active Agents</h2>
          <span class="panel-count">{agents.filter(a => a.is_running).length} / {agents.length}</span>
        </div>
        <div class="panel-content">
          {#if agents.length === 0}
            <div class="empty-state">No agents detected</div>
          {:else}
            <div class="agents-list">
              {#each agents as agent}
                <div class="agent-item" style="border-left-color: {agent.color}">
                  <div class="agent-status" class:running={agent.is_running}>
                    {agent.is_running ? '🟢' : '🔴'}
                  </div>
                  <div class="agent-info">
                    <div class="agent-name">{agent.agent_name}</div>
                    <div class="agent-meta">
                      {agent.models_available.length} models
                      {#if agent.requests_handled > 0}
                        · {agent.requests_handled} requests
                      {/if}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .dashboard {
    padding: 12px;
    width: 100%;
    margin: 0;
    font-family: var(--mono);
    background-color: var(--bg);
    min-height: calc(100vh - 200px);
    color: var(--text);
    position: relative;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }

  h2 {
    margin: 0;
    font-size: 13px;
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

  .loading {
    text-align: center;
    padding: 16px;
    font-size: 12px;
    color: var(--muted);
  }

  /* Stats Grid */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
    margin-bottom: 10px;
    padding: 0 20px;
  }

  .stat-card {
    background: linear-gradient(135deg, var(--surface) 0%, var(--bg) 100%);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px;
    display: flex;
    align-items: center;
    gap: 12px;
    transition: all 0.2s;
  }

  .stat-card:hover {
    border-color: var(--accent);
    background: var(--surface-2);
  }

  .stat-icon {
    font-size: 13px;
    width: 56px;
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    border-radius: var(--radius);
  }

  .stat-content {
    flex: 1;
  }

  .stat-value {
    font-size: 13px;
    font-weight: 700;
    color: var(--accent);
    margin-bottom: 4px;
  }

  .stat-label {
    font-size: 13px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* Content Grid */
  .content-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(400px, 100%), 1fr));
    gap: 12px;
    width: 100%;
    padding: 0 20px 20px 20px;
  }

  .panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .panel-header {
    padding: 12px 16px;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .panel-header h2 {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
  }

  .panel-count {
    padding: 4px 12px;
    background: color-mix(in srgb, var(--accent) 20%, transparent);
    color: var(--accent);
    border-radius: var(--radius);
    font-size: 13px;
    font-weight: 600;
  }

  .panel-content {
    padding: 0;
  }

  .empty-state {
    padding: 16px 24px;
    text-align: center;
    color: var(--muted);
    font-size: 12px;
  }

  /* Table */
  .table {
    display: flex;
    flex-direction: column;
  }

  .table-header {
    display: grid;
    grid-template-columns: 2fr 1fr 1.5fr;
    gap: 12px;
    padding: 16px 24px;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .table-row {
    display: grid;
    grid-template-columns: 2fr 1fr 1.5fr;
    gap: 12px;
    padding: 16px 24px;
    border-bottom: 1px solid var(--border);
    transition: all 0.2s;
  }

  .table-row:hover {
    background: color-mix(in srgb, var(--accent) 5%, transparent);
  }

  .table-row:last-child {
    border-bottom: none;
  }

  .col-file {
    display: flex;
    align-items: center;
    gap: 8px;
    overflow: hidden;
  }

  .file-icon {
    font-size: 12px;
    flex-shrink: 0;
  }

  .file-path {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    color: var(--text);
  }

  .col-count {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .col-time, .col-agent {
    display: flex;
    align-items: center;
    font-size: 13px;
    color: var(--muted);
  }

  .badge {
    padding: 4px 12px;
    background: color-mix(in srgb, var(--info) 20%, transparent);
    color: var(--info);
    border-radius: var(--radius);
    font-size: 13px;
    font-weight: 600;
  }

  .badge.lines {
    background: color-mix(in srgb, var(--success) 20%, transparent);
    color: var(--success);
  }

  .agent-badge {
    padding: 4px 12px;
    border-radius: var(--radius);
    font-size: 12px;
    font-weight: 600;
    text-transform: capitalize;
    color: white;
  }

  .agent-badge.unknown {
    background: var(--muted);
  }

  /* Agents Panel */
  .agents-list {
    padding: 12px;
  }

  .agent-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-left-width: 4px;
    border-radius: var(--radius);
    margin-bottom: 12px;
    transition: all 0.2s;
  }

  .agent-item:last-child {
    margin-bottom: 0;
  }

  .agent-item:hover {
    background: var(--surface);
    transform: translateX(4px);
  }

  .agent-status {
    font-size: 12px;
  }

  .agent-info {
    flex: 1;
  }

  .agent-name {
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
    text-transform: capitalize;
    margin-bottom: 4px;
  }

  .agent-meta {
    font-size: 13px;
    color: var(--muted);
  }

  @media (max-width: 1200px) {
    .content-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 768px) {
    .stats-grid {
      grid-template-columns: 1fr;
    }

    .table-header, .table-row {
      grid-template-columns: 2fr 1fr;
    }

    .col-time {
      display: none;
    }
  }
</style>
