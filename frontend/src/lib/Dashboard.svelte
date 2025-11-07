<script>
  import { logger } from './logger.js';
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';
  import { formatDateTime } from './timeFormat.js';
  import { formatDurationSeconds } from './formatUtils.js';
  import AgentProfilePanel from './AgentProfilePanel.svelte';
  import SessionDashboard from './SessionDashboard.svelte';
  import { API_CONFIG } from '../config.js';

  const API_BASE = API_CONFIG.API_BASE;

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

  // WebSocket event handlers
  const handleAgentEvent = async () => {
    try {
      // Reload dashboard stats when new events come in
      const response = await fetch(`${API_BASE}/dashboard-stats`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const statsData = await response.json();
      stats = statsData;
    } catch (error) {
      logger.error('Failed to handle agent event:', error);
    }
  };

  const handleAgentStats = async () => {
    try {
      // Reload agents status when stats update
      const response = await fetch(`${API_BASE}/agents-status`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const agentsData = await response.json();
      agents = agentsData;
    } catch (error) {
      logger.error('Failed to handle agent stats:', error);
    }
  };

  const handleProjectSwitched = async data => {
    try {
      logger.info('📡 Project switched, reloading dashboard data:', data.project);
      await loadAllData();
    } catch (error) {
      logger.error('Failed to handle project switch:', error);
    }
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

    // Listen for file changes to trigger dashboard updates (event-driven, no polling!)
    websocketService.on('file-changed', loadAllData);
  });

  onDestroy(() => {
    try {
      // Clean up WebSocket listeners
      websocketService.off('agent-event', handleAgentEvent);
      websocketService.off('agent-stats', handleAgentStats);
      websocketService.off('project-switched', handleProjectSwitched);
      websocketService.off('file-changed', loadAllData);
    } catch (error) {
      logger.error('Error during Dashboard cleanup:', error);
    }
  });

  async function loadAllData() {
    try {
      const [statsData, filesData, editsData, agentsData] = await Promise.all([
        fetch(`${API_BASE}/dashboard-stats`).then(r =>
          r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))
        ),
        fetch(`${API_BASE}/top-modified-files?limit=10`).then(r =>
          r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))
        ),
        fetch(`${API_BASE}/longest-edits?limit=10`).then(r =>
          r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))
        ),
        fetch(`${API_BASE}/agents-status`).then(r =>
          r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))
        )
      ]);

      stats = statsData;
      topFiles = filesData;
      longestEdits = editsData;
      agents = agentsData;
    } catch (e) {
      logger.error('Failed to load dashboard data:', e);
    } finally {
      loading = false;
    }
  }

  function formatTimestamp(timestamp) {
    return formatDateTime(timestamp);
  }

  function getAgentColor(agentName) {
    const agent = agents.find(a => a.agent_name === agentName);
    return agent ? agent.color : 'var(--muted)';
  }
</script>

<div class="dashboard" role="main" aria-label="Raven Dashboard">
  <div class="header">
    <h2 id="dashboard-title">Raven Dashboard</h2>
    <button
      on:click={loadAllData}
      class="btn btn-secondary btn-sm"
      aria-label="Refresh dashboard data"
      title="Refresh dashboard data"
    >
      ↻ Refresh
    </button>
  </div>

  {#if loading}
    <div class="loading" role="status" aria-live="polite" aria-busy="true">
      Loading dashboard...
    </div>
  {:else}
    <!-- Stats Cards -->
    <div class="stats-grid" role="region" aria-labelledby="stats-heading">
      <h3 id="stats-heading" class="visually-hidden">Dashboard Statistics</h3>

      <div
        class="card-compact stat-card"
        role="status"
        aria-label="Total events: {stats.total_events}"
      >
        <div class="stat-icon" aria-hidden="true">📊</div>
        <div class="stat-content">
          <div class="stat-value">{stats.total_events}</div>
          <div class="stat-label">Total Events</div>
        </div>
      </div>

      <div
        class="card-compact stat-card"
        role="status"
        aria-label="Tracked files: {stats.total_files}"
      >
        <div class="stat-icon" aria-hidden="true">📁</div>
        <div class="stat-content">
          <div class="stat-value">{stats.total_files}</div>
          <div class="stat-label">Tracked Files</div>
        </div>
      </div>

      <div
        class="card-compact stat-card"
        role="status"
        aria-label="AI agents: {stats.total_agents}"
      >
        <div class="stat-icon" aria-hidden="true">🤖</div>
        <div class="stat-content">
          <div class="stat-value">{stats.total_agents}</div>
          <div class="stat-label">AI Agents</div>
        </div>
      </div>

      <div
        class="card-compact stat-card"
        role="status"
        aria-label="Session duration: {formatDurationSeconds(stats.session_duration_seconds)}"
      >
        <div class="stat-icon" aria-hidden="true">⏱️</div>
        <div class="stat-content">
          <div class="stat-value">{formatDurationSeconds(stats.session_duration_seconds)}</div>
          <div class="stat-label">Session Duration</div>
        </div>
      </div>

      <div
        class="card-compact stat-card"
        role="status"
        aria-label="Active files today: {stats.active_files_today}"
      >
        <div class="stat-icon" aria-hidden="true">🔥</div>
        <div class="stat-content">
          <div class="stat-value">{stats.active_files_today}</div>
          <div class="stat-label">Active Today</div>
        </div>
      </div>
    </div>

    <!-- Main Content Grid -->
    <div class="content-grid">
      <!-- Top Modified Files -->
      <section class="card panel" aria-labelledby="top-files-heading">
        <div class="panel-header">
          <h2 id="top-files-heading"><span aria-hidden="true">📝</span> Top Modified Files</h2>
          <span class="panel-count" aria-label="{topFiles.length} files">{topFiles.length}</span>
        </div>
        <div class="panel-content">
          {#if topFiles.length === 0}
            <div class="empty-state" role="status">No file modifications yet</div>
          {:else}
            <div class="table" role="table" aria-label="Top modified files">
              <div class="table-header" role="row">
                <div class="col-file" role="columnheader">File</div>
                <div class="col-count" role="columnheader">Edits</div>
                <div class="col-time" role="columnheader">Last Modified</div>
              </div>
              {#each topFiles || [] as file (file.filepath)}
                <div class="table-row" role="row">
                  <div class="col-file" role="cell" title={file.filepath}>
                    <span class="file-icon" aria-hidden="true">📄</span>
                    <span class="file-path">{file.filepath}</span>
                  </div>
                  <div class="col-count" role="cell">
                    <span class="badge" aria-label="{file.edit_count} edits">{file.edit_count}</span
                    >
                  </div>
                  <div class="col-time" role="cell">
                    <time datetime={file.last_modified}>{formatTimestamp(file.last_modified)}</time>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </section>

      <!-- Longest Edits -->
      <section class="card panel" aria-labelledby="longest-edits-heading">
        <div class="panel-header">
          <h2 id="longest-edits-heading"><span aria-hidden="true">🎯</span> Longest Edits</h2>
          <span class="panel-count" aria-label="{longestEdits.length} edits"
            >{longestEdits.length}</span
          >
        </div>
        <div class="panel-content">
          {#if longestEdits.length === 0}
            <div class="empty-state" role="status">No agent edits recorded yet</div>
          {:else}
            <div class="table" role="table" aria-label="Longest edits by AI agents">
              <div class="table-header" role="row">
                <div class="col-file" role="columnheader">File</div>
                <div class="col-count" role="columnheader">Lines</div>
                <div class="col-agent" role="columnheader">Agent</div>
              </div>
              {#each longestEdits || [] as edit (edit.id || `${edit.filepath}-${edit.timestamp}`)}
                <div class="table-row" role="row">
                  <div class="col-file" role="cell" title={edit.filepath}>
                    <span class="file-icon" aria-hidden="true">📄</span>
                    <span class="file-path">{edit.filepath || 'Unknown'}</span>
                  </div>
                  <div class="col-count" role="cell">
                    <span class="badge lines" aria-label="{edit.lines_changed} lines changed"
                      >{edit.lines_changed}</span
                    >
                  </div>
                  <div class="col-agent" role="cell">
                    {#if edit.agent}
                      <span
                        class="agent-badge"
                        style="background-color: {getAgentColor(edit.agent)}"
                        aria-label="Agent: {edit.agent}"
                      >
                        {edit.agent}
                      </span>
                    {:else}
                      <span class="agent-badge unknown" aria-label="Agent unknown">Unknown</span>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </section>

      <!-- Active Agents -->
      <section class="card panel agents-panel" aria-labelledby="active-agents-heading">
        <div class="panel-header">
          <h2 id="active-agents-heading"><span aria-hidden="true">🤖</span> Active Agents</h2>
          <span
            class="panel-count"
            aria-label="{agents.filter(a => a?.is_running)
              .length} of {agents.length} agents running"
            >{agents.filter(a => a?.is_running).length} / {agents.length}</span
          >
        </div>
        <div class="panel-content">
          {#if agents.length === 0}
            <div class="empty-state" role="status">No agents detected</div>
          {:else}
            <div class="agents-list" role="list" aria-label="AI agents">
              {#each agents || [] as agent (agent?.agent_name || agent?.id)}
                <div class="agent-item" style="border-left-color: {agent?.color}" role="listitem">
                  <div
                    class="agent-status"
                    class:running={agent?.is_running}
                    aria-label={agent?.is_running ? 'Running' : 'Stopped'}
                  >
                    <span aria-hidden="true">{agent?.is_running ? '🟢' : '🔴'}</span>
                  </div>
                  <div class="agent-info">
                    <div class="agent-name">{agent?.agent_name || 'Unknown'}</div>
                    <div
                      class="agent-meta"
                      aria-label="{agent?.models_available?.length ||
                        0} models available{agent?.requests_handled > 0
                        ? `, ${agent.requests_handled} requests handled`
                        : ''}"
                    >
                      {agent?.models_available?.length || 0} models
                      {#if agent?.requests_handled > 0}
                        · {agent.requests_handled} requests
                      {/if}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </section>
    </div>

    <!-- Agent Profile Panel -->
    <div class="full-width-panel">
      <AgentProfilePanel />
    </div>

    <!-- Session Dashboard -->
    <div class="full-width-panel">
      <SessionDashboard />
    </div>
  {/if}
</div>

<style>
  .dashboard {
    padding: var(--space-lg);
    width: 100%;
    margin: 0;
    background-color: var(--bg);
    min-height: calc(100vh - 102px); /* header + sub-nav + footer */
    color: var(--text);
    position: relative;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-lg);
    padding: 0 var(--space-md);
  }

  h2 {
    margin: 0;
    font-size: var(--text-3xl);
    font-weight: var(--weight-bold);
    font-family: var(--sans);
  }

  /* Button styles removed - now using global .btn classes */

  .loading {
    text-align: center;
    padding: var(--space-xl);
    font-size: 11px;
    color: var(--muted);
  }

  /* Stats Grid */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: var(--space-md);
    margin-bottom: var(--space-lg);
    padding: 0 var(--space-lg);
  }

  .stat-card {
    /* Using standardized .card-compact class */
    padding: var(--space-md) var(--space-lg); /* Custom: asymmetric padding */
    display: flex;
    align-items: center;
    gap: var(--space-lg);
    transition: all var(--duration-fast) var(--ease-smooth);
  }

  .stat-card:hover {
    border-color: var(--accent);
    background: var(--surface-2);
  }

  .stat-icon {
    font-size: 11px;
    width: var(--icon-md);
    height: var(--icon-md);
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    border-radius: var(--radius-sm);
    flex-shrink: 0;
  }

  .stat-content {
    flex: 1;
    min-width: 0;
  }

  .stat-value {
    font-size: 11px;
    font-weight: 700;
    color: var(--accent);
    margin-bottom: var(--space-xs);
  }

  .stat-label {
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  /* Content Grid */
  .content-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(350px, 100%), 1fr));
    gap: var(--space-md);
    width: 100%;
    padding: 0 var(--space-lg) var(--space-lg) var(--space-lg);
  }

  .panel {
    /* Using standardized .card class */
    padding: 0; /* Custom: no padding, children handle their own padding */
    overflow: hidden;
  }

  .full-width-panel {
    margin-top: var(--space-lg);
  }

  .panel-header {
    padding: var(--space-md) var(--space-lg);
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .panel-header h2 {
    margin: 0;
    font-size: var(--text-2xl);
    font-weight: var(--weight-semibold);
    color: var(--text);
    font-family: var(--sans);
  }

  .panel-count {
    padding: var(--space-xs) var(--space-md);
    background: color-mix(in srgb, var(--accent) 20%, transparent);
    color: var(--accent);
    border-radius: var(--radius-sm);
    font-size: 11px;
    font-weight: 600;
  }

  .panel-content {
    padding: 0;
  }

  .empty-state {
    padding: var(--space-lg) var(--space-xl);
    text-align: center;
    color: var(--muted);
    font-size: 11px;
  }

  /* Table */
  .table {
    display: flex;
    flex-direction: column;
  }

  .table-header {
    display: grid;
    grid-template-columns: 2fr 1fr 1.5fr;
    gap: var(--space-lg);
    padding: var(--space-md) var(--space-lg);
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    font-size: 11px;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.3px;
    font-family: var(--sans);
  }

  .table-row {
    display: grid;
    grid-template-columns: 2fr 1fr 1.5fr;
    gap: var(--space-lg);
    padding: var(--space-md) var(--space-lg);
    border-bottom: 1px solid var(--border);
    transition: all var(--duration-fast) var(--ease-smooth);
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
    gap: var(--space-md);
    overflow: hidden;
  }

  .file-icon {
    font-size: 11px;
    flex-shrink: 0;
  }

  .file-path {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
    color: var(--text);
  }

  .col-count {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .col-time,
  .col-agent {
    display: flex;
    align-items: center;
    font-size: 11px;
    color: var(--muted);
  }

  .badge {
    padding: var(--space-xs) var(--space-md);
    background: color-mix(in srgb, var(--info) 20%, transparent);
    color: var(--info);
    border-radius: var(--radius-sm);
    font-size: 11px;
    font-weight: 600;
  }

  .badge.lines {
    background: color-mix(in srgb, var(--success) 20%, transparent);
    color: var(--success);
  }

  .agent-badge {
    padding: var(--space-xs) var(--space-md);
    border-radius: var(--radius-sm);
    font-size: 11px;
    font-weight: 600;
    text-transform: capitalize;
    color: white;
  }

  .agent-badge.unknown {
    background: var(--muted);
  }

  /* Agents Panel */
  .agents-list {
    padding: var(--space-md);
  }

  .agent-item {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
    padding: var(--space-md) var(--space-lg);
    background: var(--bg);
    border: 1px solid var(--border);
    border-left-width: 3px;
    border-radius: var(--radius-sm);
    margin-bottom: var(--space-sm);
    transition: all var(--duration-fast) var(--ease-smooth);
  }

  .agent-item:last-child {
    margin-bottom: 0;
  }

  .agent-item:hover {
    background: var(--surface);
    transform: translateX(2px);
  }

  .agent-status {
    font-size: 11px;
  }

  .agent-info {
    flex: 1;
    min-width: 0;
  }

  .agent-name {
    font-size: 11px;
    font-weight: 600;
    color: var(--text);
    text-transform: capitalize;
    margin-bottom: var(--space-xs);
  }

  .agent-meta {
    font-size: 11px;
    color: var(--muted);
  }

  @media (max-width: 1200px) {
    .content-grid {
      grid-template-columns: 1fr;
    }
  }

  /* Accessibility */
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
  }

  @media (max-width: 768px) {
    .stats-grid {
      grid-template-columns: 1fr;
    }

    .table-header,
    .table-row {
      grid-template-columns: 2fr 1fr;
    }

    .col-time {
      display: none;
    }
  }
</style>
