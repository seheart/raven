<script>
  import { onMount, onDestroy } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';

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

  onMount(async () => {
    await loadAllData();
    // Auto-refresh every 5 seconds
    refreshInterval = setInterval(loadAllData, 5000);
  });

  onDestroy(() => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }
  });

  async function loadAllData() {
    try {
      const [statsData, filesData, editsData, agentsData] = await Promise.all([
        invoke('get_dashboard_stats'),
        invoke('get_top_modified_files', { limit: 10 }),
        invoke('get_longest_edits', { limit: 10 }),
        invoke('get_agents_status')
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
    return agent ? agent.color : '#6b7280';
  }
</script>

<div class="dashboard">
  <div class="header">
    <h1>🦅 Raven Dashboard</h1>
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
    padding: 20px;
    max-width: 1400px;
    margin: 0 auto;
    font-family: 'Inter', sans-serif;
    background-color: #0f0f0f;
    min-height: 100vh;
    color: #e5e5e5;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 30px;
    padding-bottom: 20px;
    border-bottom: 2px solid #1f1f1f;
  }

  h1 {
    margin: 0;
    font-size: 32px;
    font-weight: 700;
    background: linear-gradient(135deg, #FF6B35 0%, #F7931A 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .btn-refresh {
    padding: 10px 20px;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
    transition: all 0.2s;
    box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
  }

  .btn-refresh:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
  }

  .loading {
    text-align: center;
    padding: 60px;
    font-size: 18px;
    color: #6b7280;
  }

  /* Stats Grid */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 20px;
    margin-bottom: 30px;
  }

  .stat-card {
    background: linear-gradient(135deg, #1a1a1a 0%, #0f0f0f 100%);
    border: 1px solid #2a2a2a;
    border-radius: 12px;
    padding: 24px;
    display: flex;
    align-items: center;
    gap: 16px;
    transition: all 0.2s;
  }

  .stat-card:hover {
    border-color: #3a3a3a;
    transform: translateY(-4px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  }

  .stat-icon {
    font-size: 36px;
    width: 56px;
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 107, 53, 0.1);
    border-radius: 12px;
  }

  .stat-content {
    flex: 1;
  }

  .stat-value {
    font-size: 28px;
    font-weight: 700;
    color: #FF6B35;
    margin-bottom: 4px;
  }

  .stat-label {
    font-size: 13px;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* Content Grid */
  .content-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(450px, 1fr));
    gap: 20px;
  }

  .panel {
    background: #1a1a1a;
    border: 1px solid #2a2a2a;
    border-radius: 12px;
    overflow: hidden;
  }

  .panel-header {
    padding: 20px 24px;
    background: #0f0f0f;
    border-bottom: 1px solid #2a2a2a;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .panel-header h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: #e5e5e5;
  }

  .panel-count {
    padding: 4px 12px;
    background: rgba(255, 107, 53, 0.2);
    color: #FF6B35;
    border-radius: 12px;
    font-size: 13px;
    font-weight: 600;
  }

  .panel-content {
    padding: 0;
  }

  .empty-state {
    padding: 60px 24px;
    text-align: center;
    color: #6b7280;
    font-size: 14px;
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
    background: #0f0f0f;
    border-bottom: 1px solid #2a2a2a;
    font-size: 12px;
    font-weight: 600;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .table-row {
    display: grid;
    grid-template-columns: 2fr 1fr 1.5fr;
    gap: 12px;
    padding: 16px 24px;
    border-bottom: 1px solid #1f1f1f;
    transition: all 0.2s;
  }

  .table-row:hover {
    background: rgba(255, 107, 53, 0.05);
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
    font-size: 16px;
    flex-shrink: 0;
  }

  .file-path {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 14px;
    color: #e5e5e5;
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
    color: #9ca3af;
  }

  .badge {
    padding: 4px 12px;
    background: rgba(59, 130, 246, 0.2);
    color: #3b82f6;
    border-radius: 12px;
    font-size: 13px;
    font-weight: 600;
  }

  .badge.lines {
    background: rgba(16, 185, 129, 0.2);
    color: #10b981;
  }

  .agent-badge {
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
    text-transform: capitalize;
    color: white;
  }

  .agent-badge.unknown {
    background: #374151;
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
    background: #0f0f0f;
    border: 1px solid #2a2a2a;
    border-left-width: 4px;
    border-radius: 8px;
    margin-bottom: 12px;
    transition: all 0.2s;
  }

  .agent-item:last-child {
    margin-bottom: 0;
  }

  .agent-item:hover {
    background: #1a1a1a;
    transform: translateX(4px);
  }

  .agent-status {
    font-size: 16px;
  }

  .agent-info {
    flex: 1;
  }

  .agent-name {
    font-size: 15px;
    font-weight: 600;
    color: #e5e5e5;
    text-transform: capitalize;
    margin-bottom: 4px;
  }

  .agent-meta {
    font-size: 13px;
    color: #6b7280;
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
