<script>
  import { logger } from './logger.js';
  import { onMount } from 'svelte';
  import { api } from './apiClient.js';
  import { notifications } from './notificationService.js';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import { formatDateTime } from './timeFormat.js';

  let projects = [];
  let loading = true;
  let sortBy = 'activity'; // activity, events, errors, size
  let sortDesc = true;

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
      default:
        valA = 0;
        valB = 0;
      }
      return sortDesc ? valB - valA : valA - valB;
    });
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

  function getActivityStatus(lastActivity) {
    if (!lastActivity) return { label: 'Never', class: 'inactive' };
    const now = new Date();
    const last = new Date(lastActivity);
    const diffMs = now - last;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 5) return { label: 'Active now', class: 'active-now' };
    if (diffMins < 60) return { label: `${diffMins}m ago`, class: 'recent' };
    if (diffHours < 24) return { label: `${diffHours}h ago`, class: 'today' };
    if (diffDays === 1) return { label: 'Yesterday', class: 'yesterday' };
    if (diffDays < 7) return { label: `${diffDays}d ago`, class: 'this-week' };
    return { label: `${diffDays}d ago`, class: 'old' };
  }

  function exportCSV() {
    const headers = ['Project', 'Path', 'Total Events', 'Total Errors', 'Last Activity', 'Status'];
    const rows = projects.map(p => [
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

  onMount(() => {
    loadProjects();
  });
</script>

<div class="comparison-panel" role="region" aria-label="Projects comparison panel">
  <div class="controls" role="toolbar" aria-label="Comparison controls">
    <button class="btn-refresh" on:click={loadProjects} disabled={loading} aria-label={loading ? 'Loading projects' : 'Refresh projects'}>
      <span aria-hidden="true">{#if loading}⏳{:else}🔄{/if}</span> Refresh
    </button>

    <button class="btn-export" on:click={exportCSV} aria-label="Export comparison data to CSV">
      <span aria-hidden="true">📤</span> Export CSV
    </button>

    <div class="sort-info" role="status" aria-live="polite">
      Sorted by: <strong>{sortBy}</strong> ({sortDesc ? 'desc' : 'asc'})
    </div>
  </div>

  {#if loading}
    <LoadingSkeleton count={5} height="80px" />
  {:else if projects.length === 0}
    <div class="empty" role="status">No projects found</div>
  {:else}
    <div class="comparison-table" role="table" aria-label="Projects comparison table">
      <div class="table-header" role="row">
        <div class="col-project" on:click={() => handleSort('name')} role="columnheader" aria-sort={sortBy === 'name' ? (sortDesc ? 'descending' : 'ascending') : 'none'} tabindex="0" on:keydown={(e) => e.key === 'Enter' && handleSort('name')}>
          Project {sortBy === 'name' ? (sortDesc ? '▼' : '▲') : ''}
        </div>
        <div class="col-path" role="columnheader">Path</div>
        <div class="col-events" on:click={() => handleSort('events')} role="columnheader" aria-sort={sortBy === 'events' ? (sortDesc ? 'descending' : 'ascending') : 'none'} tabindex="0" on:keydown={(e) => e.key === 'Enter' && handleSort('events')}>
          Events {sortBy === 'events' ? (sortDesc ? '▼' : '▲') : ''}
        </div>
        <div class="col-errors" on:click={() => handleSort('errors')} role="columnheader" aria-sort={sortBy === 'errors' ? (sortDesc ? 'descending' : 'ascending') : 'none'} tabindex="0" on:keydown={(e) => e.key === 'Enter' && handleSort('errors')}>
          Errors {sortBy === 'errors' ? (sortDesc ? '▼' : '▲') : ''}
        </div>
        <div class="col-activity" on:click={() => handleSort('activity')} role="columnheader" aria-sort={sortBy === 'activity' ? (sortDesc ? 'descending' : 'ascending') : 'none'} tabindex="0" on:keydown={(e) => e.key === 'Enter' && handleSort('activity')}>
          Last Activity {sortBy === 'activity' ? (sortDesc ? '▼' : '▲') : ''}
        </div>
        <div class="col-status" role="columnheader">Status</div>
      </div>

      {#each projects as project (project.name || project)}
        {@const status = getActivityStatus(project.last_activity)}
        <div class="table-row" role="row">
          <div class="col-project" role="cell">
            <span class="project-name">{project.name}</span>
          </div>
          <div class="col-path" role="cell">{project.path}</div>
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
            <span class="status-badge {status.class}" role="status">{status.label}</span>
          </div>
        </div>
      {/each}
    </div>

    <div class="summary" role="region" aria-label="Projects summary statistics">
      <div class="summary-stat">
        <strong role="status">{projects.length}</strong> projects monitored
      </div>
      <div class="summary-stat">
        <strong role="status">{projects.reduce((sum, p) => sum + p.total_events, 0).toLocaleString()}</strong> total events
      </div>
      <div class="summary-stat">
        <strong role="status">{projects.reduce((sum, p) => sum + p.total_errors, 0).toLocaleString()}</strong> total errors
      </div>
      <div class="summary-stat">
        <strong role="status">{projects.filter(p => getActivityStatus(p.last_activity).class === 'active-now' || getActivityStatus(p.last_activity).class === 'recent').length}</strong> active
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

  .table-header > div {
    cursor: pointer;
    user-select: none;
    transition: color 0.2s;
  }

  .table-header > div:hover {
    color: var(--accent);
  }

  .table-header > div:focus {
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

  .project-name {
    font-weight: 600;
    color: var(--accent);
  }

  .col-path {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
  }

  .status-badge.active-now {
    background: #00C853;
    color: white;
  }

  .status-badge.recent {
    background: #82B1FF;
    color: white;
  }

  .status-badge.today {
    background: #FFB74D;
    color: white;
  }

  .status-badge.yesterday {
    background: var(--border);
    color: var(--text);
  }

  .status-badge.this-week {
    background: var(--bg);
    color: var(--text-muted);
    border: 1px solid var(--border);
  }

  .status-badge.old, .status-badge.inactive {
    background: transparent;
    color: var(--text-muted);
    border: 1px solid var(--border);
  }

  .summary {
    display: flex;
    gap: 8px;
    padding: 8px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    margin-top: 16px;
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
</style>
