<script>
  import { logger } from './logger.js';
  import { onMount, onDestroy } from 'svelte';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import { exportCSV, exportJSON } from './exportUtils.js';
  import { websocketService } from './websocket.js';
  import { API_CONFIG } from '../config.js';

  let projects = [];
  let totalProjects = 0;
  let activeProjects = 0;
  let recentProjects = 0;
  let loading = true;
  let error = null;
  let lastUpdate = new Date();
  let sortBy = 'health'; // health, name, activity, errors

  const API_BASE = API_CONFIG.API_BASE;

  $: sortedProjects = [...projects].sort((a, b) => {
    switch (sortBy) {
      case 'health':
        return b.health_score - a.health_score;
      case 'name':
        return a.name.localeCompare(b.name);
      case 'activity':
        return b.recent_events - a.recent_events;
      case 'errors':
        return b.error_count - a.error_count;
      default:
        return 0;
    }
  });

  // WebSocket event handlers (event-driven, no polling!)
  const handleFileChanged = async () => {
    await loadHealthData();
  };

  const handleProjectSwitched = async () => {
    await loadHealthData();
  };

  onMount(async () => {
    await loadHealthData();

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

  async function loadHealthData() {
    try {
      loading = true;
      const response = await fetch(`${API_BASE}/health/projects`);
      if (!response.ok) throw new Error('Failed to fetch project health');

      const data = await response.json();
      projects = data.projects || [];
      totalProjects = data.total_projects || 0;
      activeProjects = data.active_projects || 0;
      recentProjects = data.recent_projects || 0;
      lastUpdate = new Date();
      error = null;
    } catch (err) {
      logger.error('Failed to load project health:', err);
      error = err.message;
    } finally {
      loading = false;
    }
  }

  function getStatusIcon(status) {
    return {
      active: '🟢',
      recent: '🟡',
      idle: '🟠',
      inactive: '⚪'
    }[status] || '⚫';
  }

  function getStatusLabel(status) {
    return {
      active: 'Active',
      recent: 'Recent',
      idle: 'Idle',
      inactive: 'Inactive'
    }[status] || 'Unknown';
  }

  function getHealthColor(score) {
    if (score >= 75) return 'health-excellent';
    if (score >= 50) return 'health-good';
    if (score >= 25) return 'health-fair';
    return 'health-poor';
  }

  function getHealthLabel(score) {
    if (score >= 75) return 'Excellent';
    if (score >= 50) return 'Good';
    if (score >= 25) return 'Fair';
    return 'Needs Attention';
  }

  function formatLastActivity(timestamp) {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  function getTimeSinceUpdate() {
    const seconds = Math.floor((new Date() - lastUpdate) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  }

  // Reactive "time since update" - updates when lastUpdate changes (no polling!)
  $: timeSinceUpdate = getTimeSinceUpdate();

  function handleExportCSV() {
    const data = projects.map(p => ({
      Project: p.name,
      Status: getStatusLabel(p.status),
      'Health Score': p.health_score,
      'Recent Events': p.recent_events,
      Errors: p.error_count,
      'Last Activity': p.last_activity || 'Never'
    }));
    exportCSV(data, 'project-health');
  }

  function handleExportJSON() {
    const data = {
      total_projects: totalProjects,
      active: activeProjects,
      recent: recentProjects,
      projects,
      exported_at: new Date().toISOString()
    };
    exportJSON(data, 'project-health');
  }
</script>

<div class="multi-project-health-panel" role="region" aria-label="Multi-project health panel">
  <div class="panel-header">
    <div class="header-left">
      <h2 id="multi-project-heading"><span aria-hidden="true">🏥</span> Multi-Project Health</h2>
      <p class="subtitle">At-a-glance health status across all monitored projects</p>
    </div>
    <div class="header-right" role="toolbar" aria-label="Project health actions">
      <span class="last-update" role="status" aria-live="polite">Updated: {timeSinceUpdate}</span>
      <button class="btn-secondary" on:click={handleExportCSV} aria-label="Export project health data as CSV">Export CSV</button>
      <button class="btn-secondary" on:click={handleExportJSON} aria-label="Export project health data as JSON">Export JSON</button>
      <button class="btn-primary" on:click={loadHealthData} aria-label="Refresh project health data"><span aria-hidden="true">↻</span> Refresh</button>
    </div>
  </div>

  <div class="stats-row" role="list" aria-label="Project statistics summary">
    <article class="stat-card" role="listitem">
      <div class="stat-value" role="status">{totalProjects}</div>
      <div class="stat-label">Total Projects</div>
    </article>
    <article class="stat-card active" role="listitem">
      <div class="stat-value" role="status">{activeProjects}</div>
      <div class="stat-label">Active Now</div>
    </article>
    <article class="stat-card recent" role="listitem">
      <div class="stat-value" role="status">{recentProjects}</div>
      <div class="stat-label">Recently Active</div>
    </article>
    <article class="stat-card idle" role="listitem">
      <div class="stat-value" role="status">{totalProjects - activeProjects - recentProjects}</div>
      <div class="stat-label">Idle/Inactive</div>
    </article>
  </div>

  <div class="controls">
    <div class="control-group" role="radiogroup" aria-label="Sort projects by">
      <label id="sort-label">Sort by:</label>
      <button class="sort-btn" class:active={sortBy === 'health'} on:click={() => sortBy = 'health'} role="radio" aria-checked={sortBy === 'health'}>Health Score</button>
      <button class="sort-btn" class:active={sortBy === 'name'} on:click={() => sortBy = 'name'} role="radio" aria-checked={sortBy === 'name'}>Name</button>
      <button class="sort-btn" class:active={sortBy === 'activity'} on:click={() => sortBy = 'activity'} role="radio" aria-checked={sortBy === 'activity'}>Activity</button>
      <button class="sort-btn" class:active={sortBy === 'errors'} on:click={() => sortBy = 'errors'} role="radio" aria-checked={sortBy === 'errors'}>Errors</button>
    </div>
  </div>

  {#if loading}
    <LoadingSkeleton />
  {:else if error}
    <div class="error-state" role="alert">
      <p><span aria-hidden="true">❌</span> Error loading project health: {error}</p>
      <button on:click={loadHealthData} aria-label="Retry loading project health">Try Again</button>
    </div>
  {:else if projects.length === 0}
    <div class="empty-state" role="status">
      <p><span aria-hidden="true">📭</span> No projects found</p>
      <p class="hint">Start monitoring projects to see their health status here</p>
    </div>
  {:else}
    <div class="projects-grid" role="list" aria-labelledby="multi-project-heading">
      {#each sortedProjects as project (project.name)}
        <article class="project-card {getHealthColor(project.health_score)}" role="listitem">
          <div class="project-header">
            <div class="project-name">{project.name}</div>
            <div class="project-status">
              <span class="status-icon" aria-label="{getStatusLabel(project.status)}" role="img">{getStatusIcon(project.status)}</span>
              <span class="status-label">{getStatusLabel(project.status)}</span>
            </div>
          </div>

          <div class="health-bar-container" role="img" aria-label="Health score: {project.health_score}% - {getHealthLabel(project.health_score)}">
            <div class="health-bar" style="width: {project.health_score}%" role="progressbar" aria-valuenow={project.health_score} aria-valuemin="0" aria-valuemax="100"></div>
          </div>

          <div class="health-score">
            <span class="score-value" role="status">{project.health_score}</span>
            <span class="score-label">{getHealthLabel(project.health_score)}</span>
          </div>

          <div class="project-metrics" role="group" aria-label="Project metrics">
            <div class="metric">
              <div class="metric-value" role="status">{project.recent_events}</div>
              <div class="metric-label">Events (24h)</div>
            </div>
            <div class="metric">
              <div class="metric-value" role="status">{project.error_count}</div>
              <div class="metric-label">Errors</div>
            </div>
          </div>

          <div class="project-footer">
            <span class="last-activity"><time datetime="{project.last_activity}">Last: {formatLastActivity(project.last_activity)}</time></span>
          </div>
        </article>
      {/each}
    </div>
  {/if}
</div>

<style>
  .multi-project-health-panel {
    padding: 24px;
    max-width: 1400px;
    margin: 0 auto;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 24px;
  }

  .header-left h2 {
    margin: 0 0 4px 0;
    font-size: 24px;
    color: var(--text);
  }

  .subtitle {
    margin: 0;
    color: var(--muted);
    font-size: 14px;
  }

  .header-right {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .last-update {
    font-size: 12px;
    color: var(--muted);
  }

  .stats-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
  }

  .stat-card {
    padding: 20px;
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: var(--radius);
    text-align: center;
  }

  .stat-card.active {
    border-color: var(--success, #10b981);
  }

  .stat-card.recent {
    border-color: var(--warning, #e0af68);
  }

  .stat-card.idle {
    border-color: var(--muted);
  }

  .stat-value {
    font-size: 36px;
    font-weight: 700;
    font-family: var(--mono);
    color: var(--text);
    margin-bottom: 8px;
  }

  .stat-label {
    font-size: 13px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .controls {
    margin-bottom: 24px;
    padding: 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .control-group {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .control-group label {
    font-size: 14px;
    color: var(--muted);
    font-weight: 500;
  }

  .sort-btn {
    padding: 6px 14px;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .sort-btn:hover {
    border-color: var(--accent);
  }

  .sort-btn.active {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }

  .projects-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 20px;
  }

  .project-card {
    padding: 20px;
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: var(--radius);
    transition: all 0.2s;
  }

  .project-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .project-card.health-excellent {
    border-color: var(--success, #10b981);
  }

  .project-card.health-good {
    border-color: var(--accent, #7aa2f7);
  }

  .project-card.health-fair {
    border-color: var(--warning, #e0af68);
  }

  .project-card.health-poor {
    border-color: var(--error, #f7768e);
  }

  .project-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 16px;
  }

  .project-name {
    font-size: 16px;
    font-weight: 600;
    font-family: var(--mono);
    color: var(--text);
  }

  .project-status {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .status-icon {
    font-size: 14px;
  }

  .status-label {
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .health-bar-container {
    height: 8px;
    background: var(--bg);
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 12px;
  }

  .health-bar {
    height: 100%;
    background: linear-gradient(90deg, var(--accent), var(--success, #10b981));
    transition: width 0.3s ease;
  }

  .health-score {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 16px;
  }

  .score-value {
    font-size: 32px;
    font-weight: 700;
    font-family: var(--mono);
    color: var(--text);
  }

  .score-label {
    font-size: 13px;
    color: var(--muted);
  }

  .project-metrics {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
  }

  .metric {
    text-align: center;
  }

  .metric-value {
    font-size: 24px;
    font-weight: 600;
    font-family: var(--mono);
    color: var(--text);
  }

  .metric-label {
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
  }

  .project-footer {
    padding-top: 12px;
    border-top: 1px solid var(--border);
  }

  .last-activity {
    font-size: 12px;
    color: var(--muted);
    font-family: var(--mono);
  }

  .btn-primary, .btn-secondary {
    padding: 8px 16px;
    border-radius: var(--radius);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    border: 1px solid var(--border);
  }

  .btn-primary {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }

  .btn-primary:hover {
    opacity: 0.9;
  }

  .btn-secondary {
    background: var(--surface);
    color: var(--text);
  }

  .btn-secondary:hover {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .empty-state, .error-state {
    text-align: center;
    padding: 60px 20px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .empty-state p, .error-state p {
    margin: 8px 0;
    color: var(--text);
  }

  .hint {
    font-size: 13px;
    color: var(--muted);
  }

  @media (max-width: 768px) {
    .panel-header {
      flex-direction: column;
      gap: 16px;
    }

    .header-right {
      flex-wrap: wrap;
    }

    .projects-grid {
      grid-template-columns: 1fr;
    }

    .control-group {
      flex-wrap: wrap;
    }
  }
</style>
