<script>
  import { logger } from './logger.js';
  import { onMount, onDestroy } from 'svelte';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import { exportCSV, exportJSON } from './exportUtils.js';
  import { websocketService } from './websocket.js';
  import { notifications } from './notificationService.js';
  import { router } from './router.js';
  import { API_CONFIG } from '../config.js';

  let projects = [];
  let totalProjects = 0;
  let activeProjects = 0;
  let recentProjects = 0;
  let loading = true;
  let error = null;
  let lastUpdate = new Date();
  let sortBy = 'health'; // health, name, activity, errors
  let sortDesc = true;
  let searchQuery = '';
  let filterHealth = 'all'; // all, excellent, good, fair, poor
  let filterStatus = 'all'; // all, active, recent, idle, inactive
  let autoRefresh = true;

  const API_BASE = API_CONFIG.API_BASE;

  // Filter projects based on search and filters
  $: filteredProjects = projects.filter(project => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!project.name.toLowerCase().includes(query)) {
        return false;
      }
    }

    // Health filter
    if (filterHealth !== 'all') {
      const healthLabel = getHealthLabel(project.health_score).toLowerCase();
      if (filterHealth === 'excellent' && healthLabel !== 'excellent') return false;
      if (filterHealth === 'good' && healthLabel !== 'good') return false;
      if (filterHealth === 'fair' && healthLabel !== 'fair') return false;
      if (filterHealth === 'poor' && healthLabel !== 'needs attention') return false;
    }

    // Status filter
    if (filterStatus !== 'all') {
      if (project.status !== filterStatus) {
        return false;
      }
    }

    return true;
  });

  // Sort filtered projects
  $: sortedProjects = [...filteredProjects].sort((a, b) => {
    let result;
    switch (sortBy) {
    case 'health':
      result = b.health_score - a.health_score;
      break;
    case 'name':
      result = a.name.localeCompare(b.name);
      break;
    case 'activity':
      result = b.recent_events - a.recent_events;
      break;
    case 'errors':
      result = b.error_count - a.error_count;
      break;
    default:
      result = 0;
    }
    return sortDesc ? result : -result;
  });

  // WebSocket event handlers (event-driven, no polling!)
  const handleFileChanged = async () => {
    if (autoRefresh) {
      await loadHealthData();
    }
  };

  const handleProjectSwitched = async () => {
    if (autoRefresh) {
      await loadHealthData();
    }
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

  function copyProjectName(name) {
    navigator.clipboard.writeText(name);
    notifications.success(`Copied "${name}" to clipboard!`);
  }

  function navigateToProject(projectName) {
    router.navigate('overview');
    notifications.info(`Filtering by project: ${projectName}`);
  }

  function handleSort(newSortBy) {
    if (sortBy === newSortBy) {
      sortDesc = !sortDesc;
    } else {
      sortBy = newSortBy;
      sortDesc = true;
    }
  }

  function filterByStatsCard(type) {
    switch (type) {
    case 'active':
      filterStatus = 'active';
      break;
    case 'recent':
      filterStatus = 'recent';
      break;
    case 'idle':
      filterStatus = filterStatus === 'idle' ? 'all' : 'idle';
      break;
    default:
      filterStatus = 'all';
    }
  }

  function getHealthBarColor(score) {
    if (score >= 75) return 'var(--success)'; // green - excellent
    if (score >= 50) return 'var(--info)'; // blue - good
    if (score >= 25) return 'var(--warning)'; // yellow - fair
    return 'var(--error)'; // red - poor
  }

  function handleExportCSV() {
    const data = filteredProjects.map(p => ({
      Project: p.name,
      Status: getStatusLabel(p.status),
      'Health Score': p.health_score,
      'Health Label': getHealthLabel(p.health_score),
      'Recent Events': p.recent_events,
      Errors: p.error_count,
      'Last Activity': p.last_activity || 'Never'
    }));
    exportCSV(data, 'project-health');
  }

  function handleExportJSON() {
    const data = {
      total_projects: totalProjects,
      filtered_count: filteredProjects.length,
      active: activeProjects,
      recent: recentProjects,
      filters: {
        search: searchQuery,
        health: filterHealth,
        status: filterStatus
      },
      projects: filteredProjects,
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
      <label class="auto-refresh">
        <input type="checkbox" bind:checked={autoRefresh} />
        Auto-refresh
      </label>
      <span class="last-update" role="status" aria-live="polite">Updated: {timeSinceUpdate}</span>
      <button class="btn btn-secondary btn-sm" on:click={handleExportCSV} aria-label="Export project health data as CSV"><span aria-hidden="true">📤</span> CSV</button>
      <button class="btn btn-secondary btn-sm" on:click={handleExportJSON} aria-label="Export project health data as JSON"><span aria-hidden="true">📦</span> JSON</button>
      <button class="btn btn-primary btn-sm" on:click={loadHealthData} aria-label="Refresh project health data"><span aria-hidden="true">🔄</span> Refresh</button>
    </div>
  </div>

  <div class="stats-row" role="group" aria-label="Project statistics summary">
    <button class="stat-card clickable" on:click={() => filterByStatsCard('all')} title="Show all projects">
      <div class="stat-value" role="status">{totalProjects}</div>
      <div class="stat-label">Total Projects</div>
    </button>
    <button class="stat-card active clickable" on:click={() => filterByStatsCard('active')} title="Filter by active projects">
      <div class="stat-value" role="status">{activeProjects}</div>
      <div class="stat-label">Active Now</div>
    </button>
    <button class="stat-card recent clickable" on:click={() => filterByStatsCard('recent')} title="Filter by recently active projects">
      <div class="stat-value" role="status">{recentProjects}</div>
      <div class="stat-label">Recently Active</div>
    </button>
    <button class="stat-card idle clickable" on:click={() => filterByStatsCard('idle')} title="Filter by idle/inactive projects">
      <div class="stat-value" role="status">{totalProjects - activeProjects - recentProjects}</div>
      <div class="stat-label">Idle/Inactive</div>
    </button>
  </div>

  <div class="controls">
    <div class="controls-row">
      <input
        type="text"
        class="search-input"
        placeholder="🔍 Search projects..."
        bind:value={searchQuery}
        aria-label="Search projects by name"
      />

      <select class="filter-select" bind:value={filterHealth} aria-label="Filter by health level">
        <option value="all">All Health</option>
        <option value="excellent">Excellent (75+)</option>
        <option value="good">Good (50-74)</option>
        <option value="fair">Fair (25-49)</option>
        <option value="poor">Poor (&lt;25)</option>
      </select>

      <select class="filter-select" bind:value={filterStatus} aria-label="Filter by status">
        <option value="all">All Status</option>
        <option value="active">Active</option>
        <option value="recent">Recent</option>
        <option value="idle">Idle</option>
        <option value="inactive">Inactive</option>
      </select>
    </div>

    <div class="control-group" role="radiogroup" aria-labelledby="sort-label">
      <span id="sort-label">Sort by:</span>
      <button class="btn btn-ghost btn-sm" class:active={sortBy === 'health'} on:click={() => handleSort('health')} role="radio" aria-checked={sortBy === 'health'}>
        Health {sortBy === 'health' ? (sortDesc ? '▼' : '▲') : ''}
      </button>
      <button class="btn btn-ghost btn-sm" class:active={sortBy === 'name'} on:click={() => handleSort('name')} role="radio" aria-checked={sortBy === 'name'}>
        Name {sortBy === 'name' ? (sortDesc ? '▼' : '▲') : ''}
      </button>
      <button class="btn btn-ghost btn-sm" class:active={sortBy === 'activity'} on:click={() => handleSort('activity')} role="radio" aria-checked={sortBy === 'activity'}>
        Activity {sortBy === 'activity' ? (sortDesc ? '▼' : '▲') : ''}
      </button>
      <button class="btn btn-ghost btn-sm" class:active={sortBy === 'errors'} on:click={() => handleSort('errors')} role="radio" aria-checked={sortBy === 'errors'}>
        Errors {sortBy === 'errors' ? (sortDesc ? '▼' : '▲') : ''}
      </button>
    </div>
  </div>

  {#if loading}
    <LoadingSkeleton count={4} height="200px" />
  {:else if error}
    <div class="error-state" role="alert">
      <p><span aria-hidden="true">❌</span> Error loading project health: {error}</p>
      <button class="btn btn-primary btn-sm" on:click={loadHealthData} aria-label="Retry loading project health">Try Again</button>
    </div>
  {:else if projects.length === 0}
    <div class="empty-state" role="status">
      <p><span aria-hidden="true">📭</span> No projects found</p>
      <p class="hint">Projects will appear here automatically when Raven detects activity.</p>
      <p class="hint">Make sure the telemetry bridge is running and tracking your projects.</p>
    </div>
  {:else if filteredProjects.length === 0}
    <div class="empty-state" role="status">
      <p><span aria-hidden="true">🔍</span> No projects match your filters</p>
      <p class="hint">Try adjusting your search or filter criteria.</p>
    </div>
  {:else}
    <div class="results-info" role="status">
      Showing <strong>{filteredProjects.length}</strong> of <strong>{projects.length}</strong> projects
    </div>
    <div class="projects-grid" role="list" aria-labelledby="multi-project-heading">
      {#each sortedProjects as project (project.name)}
        <div
          class="project-card"
          class:card-active={project.status === 'active'}
          class:card-recent={project.status === 'recent'}
          class:card-idle={project.status === 'idle' || project.status === 'inactive'}
        >
          <div class="project-header">
            <div class="project-name-container">
              <span class="project-name">{project.name}</span>
            </div>
            <div class="project-actions">
              <span
                class="copy-btn"
                on:click|stopPropagation={() => copyProjectName(project.name)}
                on:keydown={(e) => e.key === 'Enter' && (e.stopPropagation(), copyProjectName(project.name))}
                role="button"
                tabindex="0"
                title="Copy project name"
              >
                📋
              </span>
              <div class="project-status">
                <span
                  class="status-dot"
                  class:status-active={project.status === 'active'}
                  class:status-recent={project.status === 'recent'}
                  class:status-idle={project.status === 'idle' || project.status === 'inactive'}
                  aria-label="{getStatusLabel(project.status)}"
                  role="img"
                ></span>
                <span class="status-label">{getStatusLabel(project.status)}</span>
              </div>
            </div>
          </div>

          <div class="health-bar-container" role="img" aria-label="Health score: {project.health_score}% - {getHealthLabel(project.health_score)}">
            <div
              class="health-bar"
              style="width: {project.health_score}%; background: {getHealthBarColor(project.health_score)};"
              role="progressbar"
              aria-valuenow={project.health_score}
              aria-valuemin="0"
              aria-valuemax="100"
            ></div>
          </div>

          <div class="health-score">
            <span class="score-value" role="status">{project.health_score}</span>
            <span class="score-label">
              {getHealthLabel(project.health_score)}
            </span>
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
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .multi-project-health-panel {
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
    font-size: 11px;
    color: var(--text);
  }

  .subtitle {
    margin: 0;
    color: var(--muted);
    font-size: 11px;
  }

  .header-right {
    display: flex;
    gap: var(--space-xl);
    align-items: center;
    flex-wrap: wrap;
  }

  .auto-refresh {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
    padding: var(--space-lg) var(--space-xl);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    cursor: pointer;
    font-size: 11px;
  }

  .auto-refresh input {
    cursor: pointer;
  }

  .last-update {
    font-size: 12px;
    color: var(--muted);
  }

  .stats-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--space-lg);
    margin-bottom: var(--space-lg);
  }

  .stat-card {
    padding: var(--space-lg);
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: var(--radius);
    text-align: center;
    width: 100%;
    font-family: inherit;
    color: inherit;
  }

  .stat-card.clickable {
    cursor: pointer;
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .stat-card.clickable:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  }

  .stat-card.active {
    border-color: var(--success);
  }

  .stat-card.recent {
    border-color: var(--info);
  }

  .stat-card.idle {
    border-color: #6b7280;
  }

  .stat-value {
    font-size: 12px;
    font-weight: 700;
    font-family: var(--mono);
    color: var(--text);
    margin-bottom: var(--space-lg);
  }

  .stat-label {
    font-size: 13px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .controls {
    margin-bottom: var(--space-lg);
    padding: var(--space-2xl);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .controls-row {
    display: flex;
    gap: var(--space-xl);
    margin-bottom: var(--space-2xl);
    flex-wrap: wrap;
  }

  .search-input {
    flex: 1;
    min-width: 200px;
    padding: var(--space-lg) var(--space-xl);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text);
    font-family: var(--mono);
    font-size: 11px;
  }

  .filter-select {
    padding: var(--space-lg) var(--space-xl);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text);
    font-family: var(--mono);
    font-size: 11px;
    cursor: pointer;
  }

  .control-group {
    display: flex;
    align-items: center;
    gap: var(--space-xl);
    flex-wrap: wrap;
  }

  .btn.active {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }

  .projects-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: var(--space-lg);
  }

  .project-card {
    padding: var(--space-lg);
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: var(--radius);
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .project-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }

  .project-card.card-active {
    border-color: var(--success);
  }

  .project-card.card-recent {
    border-color: var(--info);
  }

  .project-card.card-idle {
    border-color: #6b7280;
  }

  .project-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: var(--space-md);
    gap: var(--space-lg);
  }

  .project-name-container {
    flex: 1;
  }

  .project-name {
    font-size: 11px;
    font-weight: 600;
    font-family: var(--mono);
    color: var(--accent);
  }

  .project-actions {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
  }

  .copy-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 14px;
    padding: var(--space-sm);
    opacity: 0.6;
    transition: opacity var(--duration-base) var(--ease-smooth);
  }

  .copy-btn:hover {
    opacity: 1;
  }

  .project-status {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  .status-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #6b7280;
    flex-shrink: 0;
    transition: all var(--duration-slow) var(--ease-smooth);
  }

  .status-dot.status-active {
    background: var(--success);
    box-shadow: 0 0 8px rgba(16, 185, 129, 0.6);
  }

  .status-dot.status-recent {
    background: var(--info);
    box-shadow: 0 0 8px rgba(59, 130, 246, 0.5);
  }

  .status-dot.status-idle {
    background: #6b7280;
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
    border-radius: var(--radius);
    overflow: hidden;
    margin-bottom: var(--space-xl);
  }

  .health-bar {
    height: 100%;
    transition: width var(--duration-slow) var(--ease-smooth), background var(--duration-slow) var(--ease-smooth);
  }

  .health-score {
    display: flex;
    align-items: baseline;
    gap: var(--space-lg);
    margin-bottom: var(--space-md);
  }

  .score-value {
    font-size: 11px;
    font-weight: 700;
    font-family: var(--mono);
    color: var(--text);
  }

  .score-label {
    font-size: 13px;
    color: var(--muted);
  }

  .results-info {
    font-size: 12px;
    color: var(--text-muted);
    padding: var(--space-lg) 0;
    margin-bottom: var(--space-lg);
  }

  .results-info strong {
    color: var(--accent);
    font-family: var(--mono);
  }

  .project-metrics {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-xl);
    margin-bottom: var(--space-md);
    padding-top: var(--space-2xl);
    border-top: 1px solid var(--border);
  }

  .metric {
    text-align: center;
  }

  .metric-value {
    font-size: 11px;
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


  .empty-state, .error-state {
    text-align: center;
    padding: var(--space-lg) var(--space-xl);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .empty-state p, .error-state p {
    margin: var(--space-lg) 0;
    color: var(--text);
  }

  .hint {
    font-size: 13px;
    color: var(--muted);
  }

  @media (max-width: 768px) {
    .panel-header {
      flex-direction: column;
      gap: var(--space-lg);
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
