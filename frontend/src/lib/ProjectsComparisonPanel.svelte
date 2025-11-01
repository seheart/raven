<script>
  import { logger } from './logger.js';
  import { onMount, onDestroy } from 'svelte';
  import { api } from './apiClient.js';
  import { notifications } from './notificationService.js';
  import { websocketService } from './websocket.js';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import { formatDateTime } from './timeFormat.js';
  import { router } from './router.js';

  let projects = [];
  let loading = true;
  let sortBy = 'activity'; // activity, events, errors, name, path
  let sortDesc = true;
  let searchQuery = '';
  let filterStatus = 'all'; // all, active, recent, idle, never
  let autoRefresh = true;

  async function loadProjects() {
    try {
      loading = true;
      const data = await api.get('/projects/list');
      projects = data.projects || [];

      // Load stats for each project
      const statsPromises = projects.map(async (project) => {
        try {
          const [eventsData, errorsData] = await Promise.all([
            api.get(`/file-events?limit=1&project=${encodeURIComponent(project.name)}`),
            api.get(`/errors/stats?project=${encodeURIComponent(project.name)}`)
          ]);
          return {
            ...project,
            total_events: eventsData.total || 0,
            total_errors: errorsData.total || 0,
            last_activity: eventsData.events?.[0]?.timestamp || null
          };
        } catch (error) {
          logger.error(`Failed to load stats for project ${project.name}:`, error);
          return { ...project, total_events: 0, total_errors: 0, last_activity: null };
        }
      });

      projects = await Promise.all(statsPromises);
      sortProjects();
    } catch (error) {
      notifications.error(`Failed to load projects: ${error.message}`);
    } finally {
      loading = false;
    }
  }

  function sortProjects() {
    projects = projects.sort((a, b) => {
      let valA, valB;
      switch (sortBy) {
      case 'activity':
        valA = a.last_activity ? new Date(a.last_activity).getTime() : 0;
        valB = b.last_activity ? new Date(b.last_activity).getTime() : 0;
        break;
      case 'events':
        valA = a.total_events || 0;
        valB = b.total_events || 0;
        break;
      case 'errors':
        valA = a.total_errors || 0;
        valB = b.total_errors || 0;
        break;
      case 'name':
        valA = a.name;
        valB = b.name;
        return sortDesc ? valB.localeCompare(valA) : valA.localeCompare(valB);
      case 'path':
        valA = a.path;
        valB = b.path;
        return sortDesc ? valB.localeCompare(valA) : valA.localeCompare(valB);
      default:
        valA = 0;
        valB = 0;
      }
      return sortDesc ? valB - valA : valA - valB;
    });
  }

  // Get friendly name for sort display
  function getSortDisplayName(sortKey) {
    const names = {
      'activity': 'Last Activity',
      'events': 'Events',
      'errors': 'Errors',
      'name': 'Project Name',
      'path': 'Path'
    };
    return names[sortKey] || sortKey;
  }

  function handleSort(newSortBy) {
    if (sortBy === newSortBy) {
      sortDesc = !sortDesc;
    } else {
      sortBy = newSortBy;
      sortDesc = true;
    }
    sortProjects();
  }

  // Simplified to 4 status levels (was 7)
  function getActivityStatus(lastActivity) {
    if (!lastActivity) return { label: 'Never', class: 'never' };

    const now = new Date();
    const last = new Date(lastActivity);
    const diffMs = now - last;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    // Active: < 1 hour
    if (diffMins < 60) {
      return { label: diffMins < 5 ? 'Active now' : `${diffMins}m ago`, class: 'active' };
    }

    // Recent: < 24 hours
    if (diffHours < 24) {
      return { label: `${diffHours}h ago`, class: 'recent' };
    }

    // Idle: >= 24 hours
    return { label: `${diffDays}d ago`, class: 'idle' };
  }

  function copyPath(path) {
    navigator.clipboard.writeText(path);
    notifications.success('Path copied to clipboard!');
  }

  function navigateToProject(projectName) {
    // Navigate to overview and filter by project
    router.navigate('overview');
    // Note: This would ideally set a filter, but for now just navigate
    notifications.info(`Filtering by project: ${projectName}`);
  }

  function handleStatusFilter(status) {
    filterStatus = status;
  }

  function exportCSV() {
    const headers = ['Project', 'Path', 'Total Events', 'Total Errors', 'Last Activity', 'Status'];
    const rows = filteredProjects.map(p => [
      p.name,
      p.path,
      p.total_events,
      p.total_errors,
      p.last_activity || 'Never',
      getActivityStatus(p.last_activity).label
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `raven-projects-comparison-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    notifications.success('Projects exported to CSV');
  }

  function exportJSON() {
    const exportData = {
      exported_at: new Date().toISOString(),
      total_projects: filteredProjects.length,
      projects: filteredProjects.map(p => ({
        name: p.name,
        path: p.path,
        total_events: p.total_events,
        total_errors: p.total_errors,
        last_activity: p.last_activity,
        status: getActivityStatus(p.last_activity).label
      }))
    };

    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `raven-projects-comparison-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    notifications.success('Projects exported to JSON');
  }

  // Filter projects based on search and status
  $: filteredProjects = projects.filter(project => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesName = project.name.toLowerCase().includes(query);
      const matchesPath = project.path.toLowerCase().includes(query);
      if (!matchesName && !matchesPath) {
        return false;
      }
    }

    // Status filter
    if (filterStatus !== 'all') {
      const status = getActivityStatus(project.last_activity);
      if (status.class !== filterStatus) {
        return false;
      }
    }

    return true;
  });

  function setupWebSocket() {
    websocketService.on('file-changed', () => {
      if (autoRefresh) {
        loadProjects();
      }
    });
  }

  onMount(() => {
    loadProjects();
    setupWebSocket();
  });

  onDestroy(() => {
    websocketService.off('file-changed', loadProjects);
  });
</script>

<div class="comparison-panel" role="region" aria-label="Projects comparison panel">
  <div class="controls" role="toolbar" aria-label="Comparison controls">
    <input
      type="text"
      class="search-input"
      placeholder="🔍 Search projects..."
      bind:value={searchQuery}
      aria-label="Search projects by name or path"
    />

    <select class="filter-select" bind:value={filterStatus} aria-label="Filter by status">
      <option value="all">All Status</option>
      <option value="active">Active</option>
      <option value="recent">Recent</option>
      <option value="idle">Idle</option>
      <option value="never">Never</option>
    </select>

    <label class="auto-refresh">
      <input type="checkbox" bind:checked={autoRefresh} />
      Auto-refresh
    </label>

    <button class="btn-refresh" on:click={loadProjects} disabled={loading} aria-label={loading ? 'Loading projects' : 'Refresh projects'}>
      <span aria-hidden="true">{#if loading}⏳{:else}🔄{/if}</span> Refresh
    </button>

    <button class="btn-export" on:click={exportCSV} aria-label="Export comparison data to CSV">
      <span aria-hidden="true">📤</span> CSV
    </button>

    <button class="btn-export" on:click={exportJSON} aria-label="Export comparison data to JSON">
      <span aria-hidden="true">📦</span> JSON
    </button>

    <div class="sort-info" role="status" aria-live="polite">
      Sorted by: <strong>{getSortDisplayName(sortBy)}</strong> ({sortDesc ? 'desc' : 'asc'})
    </div>
  </div>

  {#if loading}
    <LoadingSkeleton count={5} height="80px" />
  {:else if projects.length === 0}
    <div class="empty" role="status">
      <p>No projects found</p>
      <p class="empty-hint">Projects are automatically discovered when you start monitoring code with Raven.</p>
      <p class="empty-hint">Make sure the Raven bridge is running and tracking your projects.</p>
    </div>
  {:else if filteredProjects.length === 0}
    <div class="empty" role="status">
      <p>No projects match your filters</p>
      <p class="empty-hint">Try adjusting your search or status filter.</p>
    </div>
  {:else}
    <div class="comparison-table" role="table" aria-label="Projects comparison table">
      <div class="table-header" role="row">
        <div class="col-project sortable" on:click={() => handleSort('name')} role="columnheader" aria-sort={sortBy === 'name' ? (sortDesc ? 'descending' : 'ascending') : 'none'} tabindex="0" on:keydown={(e) => e.key === 'Enter' && handleSort('name')}>
          Project {sortBy === 'name' ? (sortDesc ? '▼' : '▲') : ''}
        </div>
        <div class="col-path sortable" on:click={() => handleSort('path')} role="columnheader" aria-sort={sortBy === 'path' ? (sortDesc ? 'descending' : 'ascending') : 'none'} tabindex="0" on:keydown={(e) => e.key === 'Enter' && handleSort('path')}>
          Path {sortBy === 'path' ? (sortDesc ? '▼' : '▲') : ''}
        </div>
        <div class="col-events sortable" on:click={() => handleSort('events')} role="columnheader" aria-sort={sortBy === 'events' ? (sortDesc ? 'descending' : 'ascending') : 'none'} tabindex="0" on:keydown={(e) => e.key === 'Enter' && handleSort('events')}>
          Events {sortBy === 'events' ? (sortDesc ? '▼' : '▲') : ''}
        </div>
        <div class="col-errors sortable" on:click={() => handleSort('errors')} role="columnheader" aria-sort={sortBy === 'errors' ? (sortDesc ? 'descending' : 'ascending') : 'none'} tabindex="0" on:keydown={(e) => e.key === 'Enter' && handleSort('errors')}>
          Errors {sortBy === 'errors' ? (sortDesc ? '▼' : '▲') : ''}
        </div>
        <div class="col-activity sortable" on:click={() => handleSort('activity')} role="columnheader" aria-sort={sortBy === 'activity' ? (sortDesc ? 'descending' : 'ascending') : 'none'} tabindex="0" on:keydown={(e) => e.key === 'Enter' && handleSort('activity')}>
          Last Activity {sortBy === 'activity' ? (sortDesc ? '▼' : '▲') : ''}
        </div>
        <div class="col-status" role="columnheader">Status</div>
      </div>

      {#each filteredProjects as project (project.name || project)}
        {@const status = getActivityStatus(project.last_activity)}
        <div class="table-row" role="row">
          <div class="col-project" role="cell">
            <button
              class="project-name-btn"
              on:click={() => navigateToProject(project.name)}
              title="View project details"
            >
              {project.name}
            </button>
          </div>
          <div class="col-path" role="cell">
            <span class="path-text" title="{project.path}">{project.path}</span>
            <button class="copy-btn" on:click={() => copyPath(project.path)} title="Copy path">📋</button>
          </div>
          <div class="col-events" role="cell">
            <span class="metric-value" role="status">{project.total_events.toLocaleString()}</span>
          </div>
          <div class="col-errors" role="cell">
            <span class="metric-value error" role="status">{project.total_errors.toLocaleString()}</span>
          </div>
          <div class="col-activity" role="cell">
            {#if project.last_activity}
              <time datetime="{project.last_activity}">{formatDateTime(project.last_activity)}</time>
            {:else}
              Never
            {/if}
          </div>
          <div class="col-status" role="cell">
            <button
              class="status-badge {status.class}"
              on:click={() => handleStatusFilter(status.class)}
              title="Filter by {status.label}"
            >
              {status.label}
            </button>
          </div>
        </div>
      {/each}
    </div>

    <div class="results-info" role="status">
      Showing <strong>{filteredProjects.length}</strong> of <strong>{projects.length}</strong> projects
    </div>

    <div class="summary" role="region" aria-label="Projects summary statistics">
      <div class="summary-stat">
        <strong role="status">{filteredProjects.length}</strong> displayed
      </div>
      <div class="summary-stat">
        <strong role="status">{filteredProjects.reduce((sum, p) => sum + p.total_events, 0).toLocaleString()}</strong> total events
      </div>
      <div class="summary-stat">
        <strong role="status">{filteredProjects.reduce((sum, p) => sum + p.total_errors, 0).toLocaleString()}</strong> total errors
      </div>
      <div class="summary-stat">
        <strong role="status">{filteredProjects.filter(p => getActivityStatus(p.last_activity).class === 'active' || getActivityStatus(p.last_activity).class === 'recent').length}</strong> active
      </div>
    </div>
  {/if}
</div>

<style>
  .comparison-panel {
    padding: 8px;
    max-width: 1600px;
    margin: 0 auto;
  }

  .controls {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 16px;
    margin-bottom: 8px;
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
  }

  .search-input {
    flex: 1;
    min-width: 200px;
    padding: 8px 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--text);
    font-family: var(--mono);
    font-size: 11px;
  }

  .filter-select {
    padding: 8px 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--text);
    font-family: var(--mono);
    font-size: 11px;
    cursor: pointer;
  }

  .auto-refresh {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    cursor: pointer;
    font-size: 11px;
  }

  .auto-refresh input {
    cursor: pointer;
  }

  .btn-refresh, .btn-export {
    padding: 8px 16px;
    background: var(--accent);
    color: white;
    border: none;
    border-radius: 3px;
    font-family: var(--mono);
    font-size: 11px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-refresh:hover, .btn-export:hover {
    filter: brightness(1.2);
  }

  .btn-refresh:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-refresh:focus,
  .btn-export:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .sort-info {
    margin-left: auto;
    font-size: 13px;
    color: var(--text-muted);
  }

  .comparison-table {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    overflow: hidden;
  }

  .table-header, .table-row {
    display: grid;
    grid-template-columns: 150px 1fr 100px 100px 200px 120px;
    gap: 8px;
    padding: 16px;
    align-items: center;
  }

  .table-header {
    background: var(--bg);
    font-weight: 600;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
  }

  .table-header > div.sortable {
    cursor: pointer;
    user-select: none;
    transition: color 0.2s;
  }

  .table-header > div.sortable:hover {
    color: var(--accent);
  }

  .table-header > div.sortable:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .table-row {
    border-bottom: 1px solid var(--border);
    transition: background 0.2s;
  }

  .table-row:hover {
    background: var(--bg);
  }

  .table-row:last-child {
    border-bottom: none;
  }

  .project-name-btn {
    background: none;
    border: none;
    font-weight: 600;
    color: var(--accent);
    cursor: pointer;
    padding: 0;
    font-family: inherit;
    font-size: inherit;
    text-decoration: underline;
    text-decoration-style: dotted;
    transition: opacity 0.2s;
  }

  .project-name-btn:hover {
    opacity: 0.8;
  }

  .col-path {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--mono);
    font-size: 12px;
    color: var(--text-muted);
  }

  .path-text {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .copy-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 14px;
    padding: 4px;
    opacity: 0.6;
    transition: opacity 0.2s;
    flex-shrink: 0;
  }

  .copy-btn:hover {
    opacity: 1;
  }

  .metric-value {
    font-family: var(--mono);
    font-weight: 600;
  }

  .metric-value.error {
    color: #FF5370;
  }

  .status-badge {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 3px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    border: none;
    cursor: pointer;
    font-family: inherit;
    transition: opacity 0.2s, transform 0.2s;
  }

  .status-badge:hover {
    opacity: 0.8;
    transform: scale(1.05);
  }

  /* Simplified status badges: 4 levels instead of 7 */
  .status-badge.active {
    background: #00C853;  /* Green - Active (< 1 hour) */
    color: white;
    font-weight: 600;
  }

  .status-badge.recent {
    background: #82B1FF;  /* Blue - Recent (< 24 hours) */
    color: white;
  }

  .status-badge.idle {
    background: var(--border);  /* Gray - Idle (>= 24 hours) */
    color: var(--text);
  }

  .status-badge.never {
    background: transparent;  /* Transparent - Never active */
    color: var(--text-muted);
    border: 1px solid var(--border);
  }

  .results-info {
    font-size: 12px;
    color: var(--text-muted);
    padding: 8px 0;
    margin-top: 8px;
  }

  .results-info strong {
    color: var(--accent);
    font-family: var(--mono);
  }

  .summary {
    display: flex;
    gap: 8px;
    padding: 8px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    margin-top: 8px;
  }

  .summary-stat {
    font-size: 11px;
    color: var(--text-muted);
  }

  .summary-stat strong {
    color: var(--accent);
    font-size: 13px;
    font-family: var(--mono);
  }

  .empty {
    text-align: center;
    padding: 64px 24px;
    color: var(--text-muted);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
  }

  .empty p {
    margin-bottom: 16px;
    font-size: 14px;
  }

  .empty-hint {
    font-size: 12px;
    color: var(--text-muted);
    opacity: 0.8;
    margin-bottom: 8px;
  }
</style>
