<script>
  import { onMount, onDestroy } from 'svelte';
  import { api } from './apiClient.js';
  import { websocketService } from './websocket.js';

  let agents = [];
  let loading = true;
  let error = null;
  let selectedProject = 'all';
  let availableProjects = [];

  // Agent badge configuration
  const agentConfig = {
    'ant': { icon: '🐜', color: '#7aa2f7', name: 'ANT' },
    'claude-code': { icon: '🤖', color: '#bb9af7', name: 'Claude Code' },
    'cursor': { icon: '↗️', color: '#9ece6a', name: 'Cursor' },
    'github-copilot': { icon: '🤝', color: '#f7768e', name: 'Copilot' },
    'aider': { icon: '💬', color: '#e0af68', name: 'Aider' },
    'manual': { icon: '👤', color: '#a9b1d6', name: 'Manual' },
    'unknown': { icon: '❓', color: '#565f89', name: 'Unknown' }
  };

  async function loadProjects() {
    try {
      const projects = await api.get('/projects');
      availableProjects = projects.projects || [];
    } catch (err) {
      console.error('Failed to load projects:', err);
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
      console.error('Failed to load agent profiles:', err);
      error = err.message;
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
      'aggressive': '🔥',
      'conservative': '🛡️',
      'balanced': '⚖️'
    };
    return moods[mood] || '❓';
  }

  function getStyleIcon(style) {
    const styles = {
      'builder': '🏗️',
      'cleanup': '🧹',
      'refactorer': '🔧',
      'mixed': '🎨'
    };
    return styles[style] || '📝';
  }

  function handleProjectChange(event) {
    selectedProject = event.target.value;
    loadAgentProfiles();
  }
</script>

<div class="agent-profile-panel">
  <div class="panel-header">
    <h2>🤖 Agent Profiles</h2>
    <div class="panel-controls">
      <select class="project-select" bind:value={selectedProject} on:change={handleProjectChange}>
        <option value="all">All Projects</option>
        {#each availableProjects as project}
          <option value={project.name}>{project.name}</option>
        {/each}
      </select>
      <button class="refresh-btn" on:click={loadAgentProfiles} title="Refresh">
        🔄
      </button>
    </div>
  </div>

  {#if loading && agents.length === 0}
    <div class="loading">Loading agent profiles...</div>
  {:else if error}
    <div class="error">
      <p>❌ Error loading agent profiles</p>
      <p class="error-detail">{error}</p>
    </div>
  {:else if agents.length === 0}
    <div class="empty">
      <p>No agent activity found</p>
      <p class="hint">Start coding with AI agents to see their profiles here</p>
    </div>
  {:else}
    <div class="agents-grid">
      {#each agents as agent (agent.agent)}
        <div class="agent-card">
          <!-- Agent Header -->
          <div class="agent-header">
            <div
              class="agent-avatar"
              style="background: {getAgentBadge(agent.agent).color}33; border-color: {getAgentBadge(agent.agent).color};"
            >
              <span class="agent-avatar-icon">{getAgentBadge(agent.agent).icon}</span>
            </div>
            <div class="agent-info">
              <div class="agent-name">{getAgentBadge(agent.agent).name}</div>
              <div class="agent-stats-quick">
                <span class="stat-item">{agent.totalChanges} changes</span>
                <span class="stat-separator">•</span>
                <span class="stat-item">{agent.confidence}% confidence</span>
              </div>
            </div>
          </div>

          <!-- Agent Characteristics -->
          <div class="agent-characteristics">
            <div class="characteristic">
              <span class="char-icon">{getMoodEmoji(agent.mood)}</span>
              <span class="char-label">Mood:</span>
              <span class="char-value">{agent.mood}</span>
            </div>
            <div class="characteristic">
              <span class="char-icon">{getStyleIcon(agent.style)}</span>
              <span class="char-label">Style:</span>
              <span class="char-value">{agent.style}</span>
            </div>
          </div>

          <!-- Metrics Grid -->
          <div class="metrics-grid">
            <div class="metric-box">
              <div class="metric-label">Changes/Day</div>
              <div class="metric-value">{agent.changesPerDay.toFixed(1)}</div>
            </div>
            <div class="metric-box">
              <div class="metric-label">Avg Size</div>
              <div class="metric-value">{agent.avgChangeSize} bytes</div>
            </div>
            <div class="metric-box">
              <div class="metric-label">Unique Files</div>
              <div class="metric-value">{agent.uniqueFiles}</div>
            </div>
          </div>

          <!-- Change Type Breakdown -->
          <div class="change-breakdown">
            <div class="breakdown-label">Change Distribution:</div>
            <div class="breakdown-bars">
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
            <div class="breakdown-legend">
              <span class="legend-item create">➕ Create</span>
              <span class="legend-item modify">✏️ Modify</span>
              <span class="legend-item delete">🗑️ Delete</span>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .agent-profile-panel {
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: 8px;
    padding: 20px;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }

  .panel-header h2 {
    margin: 0;
    font-size: 18px;
    color: var(--text);
    font-weight: 700;
  }

  .panel-controls {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .project-select {
    padding: 6px 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
    font-size: 12px;
    cursor: pointer;
  }

  .project-select:focus {
    outline: none;
    border-color: var(--accent);
  }

  .refresh-btn {
    padding: 6px 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .refresh-btn:hover {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .loading, .error, .empty {
    text-align: center;
    padding: 40px 20px;
    color: var(--muted);
  }

  .error p {
    margin: 8px 0;
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
    gap: 20px;
  }

  .agent-card {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 20px;
    transition: all 0.2s;
  }

  .agent-card:hover {
    border-color: var(--accent);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px color-mix(in srgb, var(--accent) 20%, transparent);
  }

  .agent-header {
    display: flex;
    gap: 16px;
    align-items: center;
    margin-bottom: 16px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border);
  }

  .agent-avatar {
    width: 50px;
    height: 50px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid;
    flex-shrink: 0;
  }

  .agent-avatar-icon {
    font-size: 28px;
  }

  .agent-info {
    flex: 1;
  }

  .agent-name {
    font-size: 16px;
    font-weight: 700;
    color: var(--text);
    margin-bottom: 4px;
  }

  .agent-stats-quick {
    font-size: 11px;
    color: var(--muted);
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .stat-separator {
    color: var(--border);
  }

  .agent-characteristics {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 16px;
  }

  .characteristic {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }

  .char-icon {
    font-size: 18px;
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
    gap: 12px;
    margin-bottom: 16px;
  }

  .metric-box {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 12px;
    text-align: center;
  }

  .metric-label {
    font-size: 9px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
  }

  .metric-value {
    font-size: 16px;
    font-weight: 700;
    color: var(--text);
    font-family: var(--mono);
  }

  .change-breakdown {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
  }

  .breakdown-label {
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
    font-weight: 600;
    margin-bottom: 10px;
  }

  .breakdown-bars {
    display: flex;
    height: 24px;
    border-radius: 6px;
    overflow: hidden;
    margin-bottom: 10px;
    background: var(--surface-2);
  }

  .breakdown-bar {
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s ease;
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
    font-size: 10px;
    font-weight: 700;
    color: white;
    text-shadow: 0 1px 2px rgba(0,0,0,0.3);
  }

  .breakdown-legend {
    display: flex;
    gap: 16px;
    justify-content: center;
    font-size: 11px;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 4px;
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
