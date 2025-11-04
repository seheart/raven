<script>
  import { logger } from './logger.js';
  import { onMount, onDestroy } from 'svelte';
  import { api } from './apiClient.js';
  import { notifications } from './notificationService.js';
  import { websocketService } from './websocket.js';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import { formatDateTime } from './timeFormat.js';
  import { router } from './router.js';
  import { Chart, registerables } from 'chart.js';
  import { initializeCharts, setupChartThemeObserver, getChartThemeColors } from './utils/chartHelpers.js';

  Chart.register(...registerables);

  let projects = [];
  let loading = true;
  let sortBy = 'activity'; // activity, events, errors, name, path
  let sortDesc = true;
  let searchQuery = '';
  let filterStatus = 'all'; // all, active, recent, idle, never
  let autoRefresh = true;
  let showCharts = false; // Toggle for showing/hiding charts

  // Charts
  let charts = {};
  let themeObserver;

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

  // Chart Functions
  function createCharts() {
    // Destroy existing charts
    Object.values(charts).forEach(chart => chart?.destroy());
    charts = {};

    if (!showCharts || projects.length === 0) return;

    const colors = getChartThemeColors();

    // Chart 1: Horizontal Bar Chart - Projects by Activity Level (Total Events)
    const activityCanvas = document.getElementById('chart-projects-activity');
    if (activityCanvas) {
      // Sort projects by total events and take top 10
      const sortedProjects = [...projects]
        .sort((a, b) => b.total_events - a.total_events)
        .slice(0, 10);

      charts.activityChart = new Chart(activityCanvas, {
        type: 'bar',
        data: {
          labels: sortedProjects.map(p => p.name),
          datasets: [{
            label: 'Total Events',
            data: sortedProjects.map(p => p.total_events),
            backgroundColor: colors.accent,
            borderColor: colors.accent,
            borderWidth: 2,
            borderRadius: 4
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              callbacks: {
                label: (context) => `Events: ${context.parsed.x.toLocaleString()}`
              }
            }
          },
          scales: {
            x: {
              beginAtZero: true,
              ticks: {
                color: colors.muted,
                font: { size: 10, family: 'var(--mono)' }
              },
              grid: {
                color: colors.grid
              }
            },
            y: {
              ticks: {
                color: colors.muted,
                font: { size: 10, family: 'var(--mono)' }
              },
              grid: {
                display: false
              }
            }
          }
        }
      });
    }

    // Chart 2: Scatter Plot - Events vs. Errors Correlation
    const correlationCanvas = document.getElementById('chart-events-errors-correlation');
    if (correlationCanvas) {
      const scatterData = projects.map(p => ({
        x: p.total_events,
        y: p.total_errors,
        label: p.name
      }));

      charts.correlationChart = new Chart(correlationCanvas, {
        type: 'scatter',
        data: {
          datasets: [{
            label: 'Projects',
            data: scatterData,
            backgroundColor: colors.accent,
            borderColor: colors.accent,
            borderWidth: 2,
            pointRadius: 6,
            pointHoverRadius: 8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              callbacks: {
                title: (items) => items[0]?.raw?.label || '',
                label: (context) => {
                  const data = context.raw;
                  return [
                    `Events: ${data.x.toLocaleString()}`,
                    `Errors: ${data.y.toLocaleString()}`
                  ];
                }
              }
            }
          },
          scales: {
            x: {
              beginAtZero: true,
              title: {
                display: true,
                text: 'Total Events',
                color: colors.text,
                font: { size: 11, family: 'var(--mono)' }
              },
              ticks: {
                color: colors.muted,
                font: { size: 10, family: 'var(--mono)' }
              },
              grid: {
                color: colors.grid
              }
            },
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: 'Total Errors',
                color: colors.text,
                font: { size: 11, family: 'var(--mono)' }
              },
              ticks: {
                color: colors.muted,
                font: { size: 10, family: 'var(--mono)' }
              },
              grid: {
                color: colors.grid
              }
            }
          }
        }
      });
    }

    // Chart 3: Pie Chart - Active vs. Idle Projects Status Distribution
    const statusCanvas = document.getElementById('chart-status-distribution');
    if (statusCanvas) {
      const statusData = {
        active: 0,
        recent: 0,
        idle: 0,
        never: 0
      };

      projects.forEach(p => {
        const status = getActivityStatus(p.last_activity);
        statusData[status.class] = (statusData[status.class] || 0) + 1;
      });

      const statusColors = {
        active: '#00C853',
        recent: '#82B1FF',
        idle: colors.muted,
        never: colors.grid
      };

      const labels = Object.keys(statusData).filter(key => statusData[key] > 0);
      const data = labels.map(key => statusData[key]);
      const backgroundColors = labels.map(key => statusColors[key]);

      charts.statusChart = new Chart(statusCanvas, {
        type: 'pie',
        data: {
          labels: labels.map(l => l.charAt(0).toUpperCase() + l.slice(1)),
          datasets: [{
            data: data,
            backgroundColor: backgroundColors,
            borderColor: backgroundColors,
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              labels: {
                color: colors.text,
                font: { size: 11, family: 'var(--mono)' },
                padding: 8
              }
            },
            tooltip: {
              callbacks: {
                label: (context) => {
                  const label = context.label || '';
                  const value = context.parsed || 0;
                  const total = context.dataset.data.reduce((a, b) => a + b, 0);
                  const percentage = ((value / total) * 100).toFixed(1);
                  return `${label}: ${value} (${percentage}%)`;
                }
              }
            }
          }
        }
      });
    }
  }

  // Reactive: Recreate charts when showCharts or projects change
  $: if (showCharts && projects.length > 0) {
    setTimeout(createCharts, 200);
  }

  onMount(() => {
    loadProjects();
    setupWebSocket();

    // Initialize charts after data loads
    initializeCharts(createCharts, {
      data: projects,
      enabled: showCharts
    });

    // Setup theme observer for charts
    themeObserver = setupChartThemeObserver(createCharts, {
      enabled: showCharts
    });
  });

  onDestroy(() => {
    // Destroy charts
    Object.values(charts).forEach(chart => chart?.destroy());

    // Disconnect theme observer
    themeObserver?.disconnect();

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

    <button class="btn btn-primary btn-sm" on:click={loadProjects} disabled={loading} aria-label={loading ? 'Loading projects' : 'Refresh projects'}>
      <span aria-hidden="true">{#if loading}⏳{:else}🔄{/if}</span> Refresh
    </button>

    <button class="btn btn-secondary btn-sm" on:click={exportCSV} aria-label="Export comparison data to CSV">
      <span aria-hidden="true">📤</span> CSV
    </button>

    <button class="btn btn-secondary btn-sm" on:click={exportJSON} aria-label="Export comparison data to JSON">
      <span aria-hidden="true">📦</span> JSON
    </button>

    <button class="btn btn-ghost btn-sm" on:click={() => showCharts = !showCharts} aria-label="{showCharts ? 'Hide' : 'Show'} charts">
      <span aria-hidden="true">{showCharts ? '📊' : '📈'}</span> {showCharts ? 'Hide' : 'Show'} Charts
    </button>

    <div class="sort-info" role="status" aria-live="polite">
      Sorted by: <strong>{getSortDisplayName(sortBy)}</strong> ({sortDesc ? 'desc' : 'asc'})
    </div>
  </div>

  <!-- Charts Section -->
  {#if showCharts && projects.length > 0}
    <div class="charts-section" role="region" aria-label="Project comparison charts">
      <div class="charts-grid">
        <div class="chart-container">
          <div class="chart-header">
            <h3>Projects by Activity Level</h3>
            <p class="chart-description">Top 10 projects by total events</p>
          </div>
          <div class="chart-canvas-wrapper">
            <canvas id="chart-projects-activity"></canvas>
          </div>
        </div>

        <div class="chart-container">
          <div class="chart-header">
            <h3>Events vs. Errors</h3>
            <p class="chart-description">Correlation analysis</p>
          </div>
          <div class="chart-canvas-wrapper">
            <canvas id="chart-events-errors-correlation"></canvas>
          </div>
        </div>

        <div class="chart-container">
          <div class="chart-header">
            <h3>Status Distribution</h3>
            <p class="chart-description">Active vs. idle projects</p>
          </div>
          <div class="chart-canvas-wrapper">
            <canvas id="chart-status-distribution"></canvas>
          </div>
        </div>
      </div>
    </div>
  {/if}

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
    padding: var(--space-lg);
    max-width: 1600px;
    margin: 0 auto;
  }

  .controls {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-2xl);
    margin-bottom: var(--space-lg);
    display: flex;
    gap: var(--space-xl);
    align-items: center;
    flex-wrap: wrap;
  }

  .search-input {
    flex: 1;
    min-width: 200px;
    padding: var(--space-lg) var(--space-xl);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-family: var(--mono);
    font-size: 11px;
  }

  .filter-select {
    padding: var(--space-lg) var(--space-xl);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-family: var(--mono);
    font-size: 11px;
    cursor: pointer;
  }

  .auto-refresh {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
    padding: var(--space-lg) var(--space-xl);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: 11px;
  }

  .auto-refresh input {
    cursor: pointer;
  }


  .sort-info {
    margin-left: auto;
    font-size: 13px;
    color: var(--text-muted);
  }

  .comparison-table {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .table-header, .table-row {
    display: grid;
    grid-template-columns: 150px 1fr 100px 100px 200px 120px;
    gap: var(--space-lg);
    padding: var(--space-2xl);
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
    transition: color var(--duration-base) var(--ease-smooth);
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
    transition: background var(--duration-base) var(--ease-smooth);
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
    transition: opacity var(--duration-base) var(--ease-smooth);
  }

  .project-name-btn:hover {
    opacity: 0.8;
  }

  .col-path {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
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
    padding: var(--space-sm);
    opacity: 0.6;
    transition: opacity var(--duration-base) var(--ease-smooth);
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
    padding: var(--space-sm) var(--space-xl);
    border-radius: var(--radius-sm);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    border: none;
    cursor: pointer;
    font-family: inherit;
    transition: opacity var(--duration-base) var(--ease-smooth), transform var(--duration-base) var(--ease-smooth);
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
    padding: var(--space-lg) 0;
    margin-top: var(--space-lg);
  }

  .results-info strong {
    color: var(--accent);
    font-family: var(--mono);
  }

  .summary {
    display: flex;
    gap: var(--space-lg);
    padding: var(--space-lg);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    margin-top: var(--space-lg);
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
    padding: var(--space-4xl) var(--space-3xl);
    color: var(--text-muted);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .empty p {
    margin-bottom: var(--space-2xl);
    font-size: 14px;
  }

  .empty-hint {
    font-size: 12px;
    color: var(--text-muted);
    opacity: 0.8;
    margin-bottom: var(--space-lg);
  }

  /* Charts Section */
  .charts-section {
    margin-bottom: var(--space-lg);
  }

  .charts-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-lg);
  }

  .chart-container {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-2xl);
    border-left: 3px solid var(--accent);
  }

  .chart-header {
    margin-bottom: var(--space-xl);
  }

  .chart-header h3 {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
    margin: 0 0 var(--space-sm) 0;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .chart-description {
    font-size: 11px;
    color: var(--text-muted);
    margin: 0;
    font-family: var(--mono);
  }

  .chart-canvas-wrapper {
    position: relative;
    height: 280px;
  }

  /* Responsive Charts */
  @media (max-width: 1200px) {
    .charts-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 768px) {
    .charts-grid {
      grid-template-columns: 1fr;
    }

    .chart-canvas-wrapper {
      height: 250px;
    }
  }
</style>
