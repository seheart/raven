<script>
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';
  import { getTimeAgo } from './timeFormat.js';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import { API_CONFIG } from '../config.js';
  import { logger } from './logger.js';

  const API_BASE = API_CONFIG.API_BASE;

  let currentAgent = null;
  let runningAgents = [];
  let agentStats = [];
  let loading = true;
  let error = null;
  let lastUpdate = new Date();

  // WebSocket handlers
  const handleFileChanged = async () => {
    await loadAgentData();
  };

  const handleProjectSwitched = async () => {
    await loadAgentData();
  };

  onMount(async () => {
    await loadAgentData();

    websocketService.connect();
    websocketService.on('file-changed', handleFileChanged);
    websocketService.on('project-switched', handleProjectSwitched);
  });

  onDestroy(() => {
    websocketService.off('file-changed', handleFileChanged);
    websocketService.off('project-switched', handleProjectSwitched);
  });

  async function loadAgentData() {
    try {
      loading = true;

      const [activeRes, statsRes] = await Promise.all([
        fetch(`${API_BASE}/agents/active`),
        fetch(`${API_BASE}/agents/stats?hours=24`)
      ]);

      if (!activeRes.ok || !statsRes.ok) {
        throw new Error('Failed to fetch agent data');
      }

      const activeData = await activeRes.json();
      const statsData = await statsRes.json();

      currentAgent = activeData.currentAgent;
      runningAgents = activeData.runningAgents || [];
      agentStats = statsData.stats || [];

      lastUpdate = new Date();
      error = null;
    } catch (err) {
      logger.error('Failed to load agent data:', error);
      errorMessage = error.message;
    } finally {
      loading = false;
    }
  }

  function getAgentIcon(agent) {
    const icons = {
      'claude-code': '🤖',
      cursor: '↗️',
      copilot: '🤝',
      ant: '🐜',
      aider: '🛠️',
      manual: '👤'
    };
    return icons[agent] || '🔧';
  }

  function getAgentColor(agent) {
    const colors = {
      'claude-code': '#6366f1',
      cursor: '#10b981',
      copilot: '#0ea5e9',
      ant: '#f59e0b',
      aider: '#8b5cf6',
      manual: '#6b7280'
    };
    return colors[agent] || '#9ca3af';
  }

  $: timeSinceUpdate = getTimeAgo(lastUpdate);
</script>

<div class="agent-monitoring-panel">
  <div class="panel-header">
    <div class="header-left">
      <h2>🤖 Multi-Agent Monitoring</h2>
      <p class="subtitle">Real-time agent detection • Activity tracking • Process monitoring</p>
    </div>
    <div class="header-right">
      <span class="last-update">Updated: {timeSinceUpdate}</span>
      <button class="btn-primary" on:click={loadAgentData}>↻ Refresh</button>
    </div>
  </div>

  {#if loading}
    <LoadingSkeleton />
  {:else if error}
    <div class="error-state">
      <p>❌ Error: {error}</p>
      <button on:click={loadAgentData}>Retry</button>
    </div>
  {:else}
    <!-- Currently Running Agents -->
    <div class="section">
      <h3>Currently Running Agents</h3>
      {#if runningAgents.length === 0}
        <div class="empty-box">
          <p>No AI agents detected running</p>
        </div>
      {:else}
        <div class="agent-cards">
          {#each runningAgents as agent (agent.agent)}
            <div class="agent-card running" style="border-left-color: {getAgentColor(agent.agent)}">
              <div class="agent-header">
                <span class="agent-icon">{getAgentIcon(agent.agent)}</span>
                <div class="agent-info">
                  <div class="agent-name">{agent.agent}</div>
                  <div class="agent-meta">Process: {agent.processName}</div>
                </div>
                <div class="confidence-badge">
                  <div class="confidence-value">{agent.confidence}%</div>
                  <div class="confidence-label">confidence</div>
                </div>
              </div>
              {#if currentAgent?.agent === agent.agent}
                <div class="current-badge">✓ Current Agent</div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Agent Activity Stats (Last 24h) -->
    <div class="section">
      <h3>Activity Statistics (Last 24h)</h3>
      {#if agentStats.length === 0}
        <div class="empty-box">
          <p>No agent activity recorded yet</p>
        </div>
      {:else}
        <div class="stats-grid">
          {#each agentStats as stat (stat.agent)}
            <div class="stat-card" style="border-left-color: {getAgentColor(stat.agent)}">
              <div class="stat-header">
                <span class="agent-icon">{getAgentIcon(stat.agent)}</span>
                <div class="agent-name">{stat.agent}</div>
              </div>
              <div class="stat-metrics">
                <div class="metric">
                  <div class="metric-value">{stat.totalChanges}</div>
                  <div class="metric-label">Total Changes</div>
                </div>
                <div class="metric">
                  <div class="metric-value">{stat.uniqueFiles}</div>
                  <div class="metric-label">Files</div>
                </div>
              </div>
              <div class="stat-breakdown">
                <span class="breakdown-item">
                  <span class="breakdown-label">Created:</span>
                  <span class="breakdown-value">{stat.creates}</span>
                </span>
                <span class="breakdown-item">
                  <span class="breakdown-label">Edited:</span>
                  <span class="breakdown-value">{stat.edits}</span>
                </span>
                <span class="breakdown-item">
                  <span class="breakdown-label">Deleted:</span>
                  <span class="breakdown-value">{stat.deletes}</span>
                </span>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Detection Info -->
    <div class="info-box">
      <h4>🔍 How Agent Detection Works</h4>
      <ul>
        <li><strong>Process Scanning:</strong> Detects running AI coding tools</li>
        <li><strong>Log Analysis:</strong> Correlates Claude Code session logs</li>
        <li><strong>Pattern Matching:</strong> Identifies editing patterns</li>
        <li><strong>Git Attribution:</strong> Analyzes commit authors</li>
      </ul>
    </div>
  {/if}
</div>

<style>
  .agent-monitoring-panel {
    padding: var(--space-lg);
    max-width: 1400px;
    margin: 0 auto;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: var(--space-lg);
  }

  .header-left h2 {
    margin: 0 0 var(--space-sm) 0;
    font-size: 24px;
    color: var(--text);
  }

  .subtitle {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
  }

  .header-right {
    display: flex;
    gap: var(--space-md);
    align-items: center;
  }

  .last-update {
    font-size: 12px;
    color: var(--muted);
    font-family: var(--mono);
  }

  .btn-primary {
    padding: 8px 16px;
    border-radius: var(--radius);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    background: var(--accent);
    color: white;
    border: 1px solid var(--accent);
    transition: all 0.2s;
  }

  .btn-primary:hover {
    opacity: 0.9;
  }

  .section {
    margin-bottom: var(--space-xl);
  }

  .section h3 {
    margin: 0 0 var(--space-md) 0;
    font-size: 18px;
    color: var(--text);
  }

  .agent-cards {
    display: grid;
    gap: var(--space-md);
  }

  .agent-card {
    padding: var(--space-md);
    background: var(--surface);
    border: 1px solid var(--border);
    border-left: 4px solid;
    border-radius: var(--radius);
    transition: all 0.2s;
  }

  .agent-card.running {
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.9;
    }
  }

  .agent-header {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  .agent-icon {
    font-size: 24px;
  }

  .agent-info {
    flex: 1;
  }

  .agent-name {
    font-size: 16px;
    font-weight: 600;
    color: var(--text);
    font-family: var(--mono);
  }

  .agent-meta {
    font-size: 12px;
    color: var(--muted);
    font-family: var(--mono);
  }

  .confidence-badge {
    text-align: center;
    padding: 4px 12px;
    background: var(--bg);
    border-radius: var(--radius);
  }

  .confidence-value {
    font-size: 18px;
    font-weight: 700;
    font-family: var(--mono);
    color: var(--text);
  }

  .confidence-label {
    font-size: 10px;
    color: var(--muted);
    text-transform: uppercase;
  }

  .current-badge {
    margin-top: var(--space-sm);
    padding: 4px 8px;
    background: var(--accent);
    color: white;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    display: inline-block;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: var(--space-md);
  }

  .stat-card {
    padding: var(--space-md);
    background: var(--surface);
    border: 1px solid var(--border);
    border-left: 4px solid;
    border-radius: var(--radius);
  }

  .stat-header {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: var(--space-md);
  }

  .stat-metrics {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-md);
    margin-bottom: var(--space-md);
  }

  .metric {
    text-align: center;
  }

  .metric-value {
    font-size: 28px;
    font-weight: 700;
    font-family: var(--mono);
    color: var(--text);
  }

  .metric-label {
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
  }

  .stat-breakdown {
    display: flex;
    gap: var(--space-md);
    padding-top: var(--space-sm);
    border-top: 1px solid var(--border);
    font-size: 12px;
  }

  .breakdown-item {
    display: flex;
    gap: 4px;
  }

  .breakdown-label {
    color: var(--muted);
  }

  .breakdown-value {
    color: var(--text);
    font-family: var(--mono);
    font-weight: 600;
  }

  .info-box {
    padding: var(--space-md);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .info-box h4 {
    margin: 0 0 var(--space-sm) 0;
    font-size: 14px;
    color: var(--text);
  }

  .info-box ul {
    margin: 0;
    padding-left: var(--space-lg);
    color: var(--muted);
    font-size: 13px;
    line-height: 1.6;
  }

  .info-box li {
    margin-bottom: 4px;
  }

  .info-box strong {
    color: var(--text);
  }

  .empty-box {
    padding: var(--space-xl);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    text-align: center;
  }

  .empty-box p {
    margin: 0;
    color: var(--muted);
  }

  .error-state {
    padding: var(--space-xl);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    text-align: center;
  }

  .error-state p {
    margin: 0 0 var(--space-md) 0;
    color: var(--text);
  }

  .error-state button {
    padding: 8px 16px;
    background: var(--accent);
    color: white;
    border: none;
    border-radius: var(--radius);
    cursor: pointer;
  }
</style>
