<script>
  import { onMount, onDestroy } from 'svelte';
  import { api } from './apiClient.js';
  import { websocketService } from './websocket.js';
  import { logger } from './logger.js';

  let agents = [];
  let loading = true;
  let error = null;
  let selectedProject = 'all';
  let availableProjects = [];

  // Agent badge configuration
  const agentConfig = {
    ant: { icon: '🐜', color: 'var(--info)', name: 'ANT' },
    'claude-code': { icon: '🤖', color: 'var(--accent)', name: 'Claude Code' },
    cursor: { icon: '↗️', color: 'var(--success)', name: 'Cursor' },
    'github-copilot': { icon: '🤝', color: 'var(--error)', name: 'Copilot' },
    aider: { icon: '💬', color: 'var(--warning)', name: 'Aider' },
    manual: { icon: '👤', color: '#a9b1d6', name: 'Manual' },
    unknown: { icon: '❓', color: '#565f89', name: 'Unknown' }
  };

  async function loadProjects() {
    try {
      const projects = await api.get('/projects');
      availableProjects = projects.projects || [];
    } catch (err) {
      logger.error('Failed to load projects:', error);
    }
  }

  async function loadAgentProfiles() {
    loading = true;
    error = null;

    try {
      // Get agent comparison for selected project
      const projectParam = selectedProject !== 'all' ? `?project=${selectedProject}` : '';
      const data = await api.get(`/agents/compare${projectParam}`);

      agents = data.agents || [];
    } catch (err) {
      logger.error('Failed to load agent profiles:', error);
      errorMessage = error.message;
      agents = [];
    } finally {
      loading = false;
    }
  }

  // WebSocket event handlers (event-driven, no polling!)
  const handleFileChanged = async () => {
    await loadAgentProfiles();
  };

  const handleProjectSwitched = async () => {
    await loadProjects();
    await loadAgentProfiles();
  };

  onMount(async () => {
    await loadProjects();
    await loadAgentProfiles();

    // Connect to WebSocket for real-time updates
    websocketService.connect();
    websocketService.on('file-changed', handleFileChanged);
    websocketService.on('project-switched', handleProjectSwitched);
  });

  onDestroy(() => {
    // Clean up WebSocket listeners
    websocketService.off('file-changed', handleFileChanged);
    websocketService.off('project-switched', handleProjectSwitched);
  });

  function getAgentBadge(agent) {
    return agentConfig[agent] || agentConfig.unknown;
  }

  function getMoodEmoji(mood) {
    const moods = {
      aggressive: '🔥',
      conservative: '🛡️',
      balanced: '⚖️'
    };
    return moods[mood] || '❓';
  }

  function getStyleIcon(style) {
    const styles = {
      builder: '🏗️',
      cleanup: '🧹',
      refactorer: '🔧',
      mixed: '🎨'
    };
    return styles[style] || '📝';
  }

  function handleProjectChange(event) {
    selectedProject = event.target.value;
    loadAgentProfiles();
  }
</script>

<div class="card agent-profile-panel" role="region" aria-label="Agent profiles panel">
  <div class="panel-header">
    <h2 id="agent-profiles-heading"><span aria-hidden="true">🤖</span> Agent Profiles</h2>
    <div class="panel-controls" role="toolbar" aria-label="Agent profiles actions">
      <select
        class="project-select"
        bind:value={selectedProject}
        on:change={handleProjectChange}
        aria-label="Filter agents by project"
      >
        <option value="all">All Projects</option>
        {#each availableProjects as project (project.name || project)}
          <option value={project.name}>{project.name}</option>
        {/each}
      </select>
      <button class="refresh-btn" on:click={loadAgentProfiles} aria-label="Refresh agent profiles">
        <span aria-hidden="true">🔄</span>
      </button>
    </div>
  </div>

  {#if loading && agents.length === 0}
    <div class="loading" role="status" aria-live="polite">Loading agent profiles...</div>
  {:else if error}
    <div class="error" role="alert">
      <p><span aria-hidden="true">❌</span> Error loading agent profiles</p>
      <p class="error-detail">{error}</p>
    </div>
  {:else if agents.length === 0}
    <div class="empty" role="status">
      <p>No agent activity found</p>
      <p class="hint">Start coding with AI agents to see their profiles here</p>
    </div>
  {:else}
    <div class="agents-grid" role="list" aria-labelledby="agent-profiles-heading">
      {#each agents as agent (agent.agent)}
        <article class="agent-card" role="listitem">
          <!-- Agent Header -->
          <div class="agent-header">
            <div
              class="agent-avatar"
              style="background: {getAgentBadge(agent.agent).color}33; border-color: {getAgentBadge(
                agent.agent
              ).color};"
              aria-hidden="true"
            >
              <span class="agent-avatar-icon">{getAgentBadge(agent.agent).icon}</span>
            </div>
            <div class="agent-info">
              <div class="agent-name">{getAgentBadge(agent.agent).name}</div>
              <div class="agent-stats-quick" role="status">
                <span class="stat-item">{agent.totalChanges} changes</span>
                <span class="stat-separator" aria-hidden="true">•</span>
                <span class="stat-item">{agent.confidence}% confidence</span>
              </div>
            </div>
          </div>

          <!-- Agent Characteristics -->
          <div class="agent-characteristics" role="group" aria-label="Agent characteristics">
            <div class="characteristic">
              <span class="char-icon" aria-hidden="true">{getMoodEmoji(agent.mood)}</span>
              <span class="char-label">Mood:</span>
              <span class="char-value">{agent.mood}</span>
            </div>
            <div class="characteristic">
              <span class="char-icon" aria-hidden="true">{getStyleIcon(agent.style)}</span>
              <span class="char-label">Style:</span>
              <span class="char-value">{agent.style}</span>
            </div>
          </div>

          <!-- Metrics Grid -->
          <div class="metrics-grid" role="group" aria-label="Agent metrics">
            <div class="metric-box">
              <div class="metric-label">Changes/Day</div>
              <div class="metric-value" role="status">{agent.changesPerDay.toFixed(1)}</div>
            </div>
            <div class="metric-box">
              <div class="metric-label">Avg Size</div>
              <div class="metric-value" role="status">{agent.avgChangeSize} bytes</div>
            </div>
            <div class="metric-box">
              <div class="metric-label">Unique Files</div>
              <div class="metric-value" role="status">{agent.uniqueFiles}</div>
            </div>
          </div>

          <!-- Change Type Breakdown -->
          <div class="change-breakdown">
            <div class="breakdown-label">Change Distribution:</div>
            <div
              class="breakdown-bars"
              role="img"
              aria-label="Change distribution: {(agent.creationRate * 100).toFixed(0)}% create, {(
                agent.modificationRate * 100
              ).toFixed(0)}% modify, {(agent.deletionRate * 100).toFixed(0)}% delete"
            >
              <div
                class="breakdown-bar create"
                style="width: {agent.creationRate * 100}%"
                title="Created: {(agent.creationRate * 100).toFixed(0)}%"
              >
                {#if agent.creationRate > 0.15}
                  <span class="bar-label">{(agent.creationRate * 100).toFixed(0)}%</span>
                {/if}
              </div>
              <div
                class="breakdown-bar modify"
                style="width: {agent.modificationRate * 100}%"
                title="Modified: {(agent.modificationRate * 100).toFixed(0)}%"
              >
                {#if agent.modificationRate > 0.15}
                  <span class="bar-label">{(agent.modificationRate * 100).toFixed(0)}%</span>
                {/if}
              </div>
              <div
                class="breakdown-bar delete"
                style="width: {agent.deletionRate * 100}%"
                title="Deleted: {(agent.deletionRate * 100).toFixed(0)}%"
              >
                {#if agent.deletionRate > 0.15}
                  <span class="bar-label">{(agent.deletionRate * 100).toFixed(0)}%</span>
                {/if}
              </div>
            </div>
            <div class="breakdown-legend" aria-hidden="true">
              <span class="legend-item create">➕ Create</span>
              <span class="legend-item modify">✏️ Modify</span>
              <span class="legend-item delete">🗑️ Delete</span>
            </div>
          </div>
        </article>
      {/each}
    </div>
  {/if}
</div>

<style>
  .agent-profile-panel {
    /* Using standardized .card class - removed duplicate styling */
    border-width: 2px; /* Custom: thicker border for emphasis */
    padding: var(--space-lg); /* Custom: 8px instead of default 24px */
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-lg);
  }

  .panel-header h2 {
    margin: 0;
    font-size: 12px;
    color: var(--text);
    font-weight: 700;
  }

  .panel-controls {
    display: flex;
    gap: var(--space-xl);
    align-items: center;
  }

  .project-select {
    padding: var(--space-md) var(--space-xl);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text);
    font-size: 12px;
    cursor: pointer;
  }

  .project-select:focus {
    outline: none;
    border-color: var(--accent);
  }

  .refresh-btn {
    padding: var(--space-md) var(--space-xl);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text);
    font-size: 11px;
    cursor: pointer;
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .refresh-btn:hover {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .refresh-btn:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .loading,
  .error,
  .empty {
    text-align: center;
    padding: var(--space-4xl) var(--space-3xl);
    color: var(--muted);
  }

  .error p {
    margin: var(--space-lg) 0;
  }

  .error-detail {
    font-size: 12px;
    font-family: var(--mono);
    color: var(--error);
  }

  .hint {
    font-size: 12px;
  }

  .agents-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
    gap: var(--space-lg);
  }

  .agent-card {
    background: var(--bg); /* Custom: different background than default card */
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-lg); /* Custom: 8px padding */
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .agent-card:hover {
    border-color: var(--accent);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px color-mix(in srgb, var(--accent) 20%, transparent);
  }

  .agent-header {
    display: flex;
    gap: var(--space-lg);
    align-items: center;
    margin-bottom: var(--space-md);
    padding-bottom: var(--space-2xl);
    border-bottom: 1px solid var(--border);
  }

  .agent-avatar {
    width: 50px;
    height: 50px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid;
    flex-shrink: 0;
  }

  .agent-avatar-icon {
    font-size: var(--icon-lg);
  }

  .agent-info {
    flex: 1;
  }

  .agent-name {
    font-size: 11px;
    font-weight: 700;
    color: var(--text);
    margin-bottom: var(--space-sm);
  }

  .agent-stats-quick {
    font-size: 11px;
    color: var(--muted);
    display: flex;
    gap: var(--space-md);
    align-items: center;
  }

  .stat-separator {
    color: var(--border);
  }

  .agent-characteristics {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    margin-bottom: var(--space-md);
  }

  .characteristic {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
    font-size: 13px;
  }

  .char-icon {
    font-size: 12px;
  }

  .char-label {
    color: var(--muted);
    font-weight: 600;
  }

  .char-value {
    color: var(--text);
    text-transform: capitalize;
    font-weight: 600;
  }

  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-xl);
    margin-bottom: var(--space-md);
  }

  .metric-box {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--space-xl);
    text-align: center;
  }

  .metric-label {
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: var(--space-md);
  }

  .metric-value {
    font-size: 11px;
    font-weight: 700;
    color: var(--text);
    font-family: var(--mono);
  }

  .change-breakdown {
    margin-top: var(--space-2xl);
    padding-top: var(--space-2xl);
    border-top: 1px solid var(--border);
  }

  .breakdown-label {
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
    font-weight: 600;
    margin-bottom: var(--space-lg);
  }

  .breakdown-bars {
    display: flex;
    height: var(--icon-md);
    border-radius: var(--radius-sm);
    overflow: hidden;
    margin-bottom: var(--space-lg);
    background: var(--surface-2);
  }

  .breakdown-bar {
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--duration-slow) var(--ease-smooth);
  }

  .breakdown-bar.create {
    background: var(--success);
  }

  .breakdown-bar.modify {
    background: var(--warning);
  }

  .breakdown-bar.delete {
    background: var(--error);
  }

  .bar-label {
    font-size: 11px;
    font-weight: 700;
    color: white;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  }

  .breakdown-legend {
    display: flex;
    gap: var(--space-lg);
    justify-content: center;
    font-size: 11px;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    color: var(--muted);
  }

  .legend-item.create {
    color: var(--success);
  }

  .legend-item.modify {
    color: var(--warning);
  }

  .legend-item.delete {
    color: var(--error);
  }
</style>
