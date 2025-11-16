<script>
  import { logger } from './logger.js';
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';
  import { notifications } from './notificationService.js';
  import { desktopNotifications } from './services/desktopNotifications.js';
  import { formatNumber } from './numberFormat.js';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import Chart from 'chart.js/auto';
  import {
    initializeCharts,
    setupChartThemeObserver,
    getChartThemeColors
  } from './utils/chartHelpers.js';

  let warnings = [];
  let loading = true;
  let warningCount = 0;
  let ws = null;
  let selectedCategory = 'all';
  let selectedProject = 'all';
  let projects = [];
  let limit = 30;
  let loadingMore = false;
  let showExportDropdown = false;
  let showCharts = true;

  // Chart instances
  let categoryChart = null;
  let severityChart = null;
  let filesChart = null;
  let projectsChart = null;
  let themeObserver = null;

  const categories = [
    { id: 'all', label: 'All', icon: '🔍' },
    { id: 'security', label: 'Security', icon: '🔒' },
    { id: 'quality', label: 'Quality', icon: '✨' },
    { id: 'maintenance', label: 'Maintenance', icon: '🔧' },
    { id: 'performance', label: 'Performance', icon: '⚡' }
  ];

  // Fetch warnings
  async function fetchWarnings(append = false) {
    try {
      if (append) {
        loadingMore = true;
      } else {
        loading = true;
        limit = 30; // Reset limit when fetching fresh
      }

      const url =
        selectedCategory === 'all'
          ? `/api/pattern-warnings?limit=${limit}`
          : `/api/pattern-warnings/category/${selectedCategory}?limit=${limit}`;

      const response = await fetch(url);

      const data = await response.json();

      if (append) {
        warnings = data.warnings;
      } else {
        warnings = data.warnings;
      }
      warningCount = data.count;

      loading = false;
      loadingMore = false;
    } catch (error) {
      logger.error('Failed to fetch pattern warnings:', error);
      notifications.error('Failed to load pattern warnings');
      loading = false;
      loadingMore = false;
    }
  }

  // Load more warnings
  async function loadMore() {
    limit += 30;
    await fetchWarnings(true);
  }

  // Resolve warning

  // Resolve all warnings
  async function resolveAllWarnings() {
    if (!confirm(`Are you sure you want to resolve all ${warningCount} pattern warnings?`)) {
      return;
    }

    try {
      const url =
        selectedCategory === 'all'
          ? '/api/pattern-warnings/resolve-all'
          : `/api/pattern-warnings/resolve-all?category=${selectedCategory}`;

      const response = await fetch(url, { method: 'POST' });

      const data = await response.json();
      notifications.success(data.message || 'All warnings resolved');
      await fetchWarnings();
    } catch (error) {
      logger.error('Failed to resolve all warnings:', error);
      notifications.error('Failed to resolve all warnings');
    }
  }

  // Export warnings
  async function exportWarnings(format = 'csv') {
    try {
      const categoryParam = selectedCategory === 'all' ? '' : `&category=${selectedCategory}`;
      const url = `/api/pattern-warnings/export?format=${format}${categoryParam}`;

      const response = await fetch(url);

      // Get filename from Content-Disposition header or generate one
      const contentDisposition = response.headers.get('Content-Disposition');
      const filename = contentDisposition
        ? contentDisposition.split('filename=')[1].replace(/"/g, '')
        : `pattern-warnings-${Date.now()}.${format}`;

      // Download file
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);

      notifications.success(`Exported ${warningCount} warning(s) as ${format.toUpperCase()}`);
      showExportDropdown = false;
    } catch (error) {
      logger.error('Failed to export warnings:', error);
      notifications.error('Failed to export warnings');
      showExportDropdown = false;
    }
  }

  // Toggle export dropdown
  function toggleExportDropdown() {
    showExportDropdown = !showExportDropdown;
  }

  // Subscribe to WebSocket for real-time updates
  function setupWebSocket() {
    ws = websocketService.subscribe('pattern-warning', data => {
      logger.info('Pattern warning detected:', data);

      // Show desktop notification for critical patterns
      if (data.warnings && data.warnings.length > 0) {
        const criticalWarnings = data.warnings.filter(w => w.severity === 'critical');
        if (criticalWarnings.length > 0) {
          desktopNotifications.show({
            title: 'Critical Pattern Detected',
            body: `${criticalWarnings.length} critical issue(s) in ${data.filepath}`,
            severity: 'critical',
            requireInteraction: true
          });
        }
      }

      // Refresh warning list
      fetchWarnings();
    });
  }

  onMount(() => {
    fetchWarnings();
    setupWebSocket();
    themeObserver = setupChartThemeObserver(createCharts, { enabled: showCharts });
  });

  onDestroy(() => {
    if (ws) ws();
    destroyCharts();
    themeObserver?.disconnect();
  });

  // Watch category changes (project filtering is client-side only)
  $: if (selectedCategory !== undefined) {
    fetchWarnings();
  }

  // Extract unique projects from all warnings
  $: {
    const uniqueProjects = [...new Set(warnings.map(w => w.project_name).filter(Boolean))];
    projects = uniqueProjects.sort();
  }

  // Filter warnings by selected project
  $: filteredWarnings =
    selectedProject === 'all' ? warnings : warnings.filter(w => w.project_name === selectedProject);

  // Group filtered warnings by file
  $: warningsByFile = filteredWarnings.reduce((acc, warning) => {
    if (!acc[warning.filepath]) {
      acc[warning.filepath] = [];
    }
    acc[warning.filepath].push(warning);
    return acc;
  }, {});

  // Shorten file path for display
  function shortenPath(filepath) {
    if (!filepath) return '';
    // Remove home directory prefix
    let shortened = filepath.replace(/^\/home\/[^/]+\/Projects\//, '');
    // If still too long, show just filename with parent dir
    if (shortened.length > 60) {
      const parts = shortened.split('/');
      if (parts.length > 2) {
        return '.../' + parts.slice(-2).join('/');
      }
    }
    return shortened;
  }

  // Get severity color
  function getSeverityColor(severity) {
    switch (severity) {
      case 'critical':
        return 'var(--error)';
      case 'warning':
        return 'var(--warning)';
      case 'info':
        return 'var(--info)';
      default:
        return 'var(--muted)';
    }
  }

  // Get severity stats from filtered warnings
  $: severityStats = filteredWarnings.reduce((acc, warning) => {
    acc[warning.severity] = (acc[warning.severity] || 0) + 1;
    return acc;
  }, {});

  // Count filtered warnings
  $: filteredCount = filteredWarnings.length;

  // Destroy chart instances
  function destroyCharts() {
    categoryChart?.destroy();
    severityChart?.destroy();
    filesChart?.destroy();
    projectsChart?.destroy();
    categoryChart = null;
    severityChart = null;
    filesChart = null;
    projectsChart = null;
  }

  // Create all charts
  function createCharts() {
    destroyCharts();

    if (!showCharts || filteredWarnings.length === 0) return;

    const colors = getChartThemeColors();

    // 1. Pie Chart: Warnings by category
    const categoryData = filteredWarnings.reduce((acc, w) => {
      acc[w.category] = (acc[w.category] || 0) + 1;
      return acc;
    }, {});

    const categoryCanvas = document.getElementById('categoryChart');
    if (categoryCanvas) {
      categoryChart = new Chart(categoryCanvas, {
        type: 'pie',
        data: {
          labels: Object.keys(categoryData).map(
            c => categories.find(cat => cat.id === c)?.label || c
          ),
          datasets: [
            {
              data: Object.values(categoryData),
              backgroundColor: [
                colors.error,
                colors.warning,
                colors.info,
                colors.success,
                colors.accent
              ],
              borderWidth: 2,
              borderColor: colors.grid
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                color: colors.text,
                font: { size: 11, family: 'var(--mono)' },
                padding: 8
              }
            },
            tooltip: {
              callbacks: {
                label: function (context) {
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

    // 2. Donut Chart: Severity distribution
    const severityData = filteredWarnings.reduce((acc, w) => {
      acc[w.severity] = (acc[w.severity] || 0) + 1;
      return acc;
    }, {});

    const severityCanvas = document.getElementById('severityChart');
    if (severityCanvas) {
      severityChart = new Chart(severityCanvas, {
        type: 'doughnut',
        data: {
          labels: Object.keys(severityData).map(s => s.charAt(0).toUpperCase() + s.slice(1)),
          datasets: [
            {
              data: Object.values(severityData),
              backgroundColor: [colors.error, colors.warning, colors.info],
              borderWidth: 2,
              borderColor: colors.grid
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                color: colors.text,
                font: { size: 11, family: 'var(--mono)' },
                padding: 8
              }
            },
            tooltip: {
              callbacks: {
                label: function (context) {
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

    // 3. Horizontal Bar Chart: Top files with most warnings
    const fileData = filteredWarnings.reduce((acc, w) => {
      const shortPath = shortenPath(w.filepath);
      acc[shortPath] = (acc[shortPath] || 0) + 1;
      return acc;
    }, {});

    const topFiles = Object.entries(fileData)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    const filesCanvas = document.getElementById('filesChart');
    if (filesCanvas && topFiles.length > 0) {
      filesChart = new Chart(filesCanvas, {
        type: 'bar',
        data: {
          labels: topFiles.map(f => f[0]),
          datasets: [
            {
              label: 'Warnings',
              data: topFiles.map(f => f[1]),
              backgroundColor: colors.warning,
              borderColor: colors.warning,
              borderWidth: 1
            }
          ]
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
                label: function (context) {
                  return `Warnings: ${context.parsed.x}`;
                }
              }
            }
          },
          scales: {
            x: {
              beginAtZero: true,
              ticks: {
                color: colors.muted,
                font: { size: 10, family: 'var(--mono)' },
                stepSize: 1
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

    // 4. Bar Chart: Warnings by project
    const projectData = filteredWarnings.reduce((acc, w) => {
      if (w.project_name) {
        acc[w.project_name] = (acc[w.project_name] || 0) + 1;
      }
      return acc;
    }, {});

    const projectsCanvas = document.getElementById('projectsChart');
    if (projectsCanvas && Object.keys(projectData).length > 0) {
      projectsChart = new Chart(projectsCanvas, {
        type: 'bar',
        data: {
          labels: Object.keys(projectData),
          datasets: [
            {
              label: 'Warnings',
              data: Object.values(projectData),
              backgroundColor: colors.accent,
              borderColor: colors.accent,
              borderWidth: 1
            }
          ]
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
                label: function (context) {
                  return `Warnings: ${context.parsed.y}`;
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                color: colors.muted,
                font: { size: 10, family: 'var(--mono)' },
                stepSize: 1
              },
              grid: {
                color: colors.grid
              }
            },
            x: {
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
  }

  // Watch for data changes and recreate charts
  $: if (filteredWarnings && showCharts) {
    initializeCharts(createCharts, { data: filteredWarnings, enabled: showCharts });
  }
</script>

<div class="pattern-warnings-panel" role="region" aria-label="Pattern warnings panel">
  <div class="panel-header">
    <div class="header-top">
      <h2 id="pattern-warnings-heading">Code Pattern Warnings</h2>
      <div class="header-actions">
        <button
          class="action-btn"
          on:click={fetchWarnings}
          aria-label="Refresh pattern warnings"
          title="Refresh"
        >
          <span aria-hidden="true">↻</span>
        </button>
        {#if warningCount > 0}
          <div class="export-dropdown">
            <button
              class="action-btn export-btn"
              on:click={toggleExportDropdown}
              on:keydown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggleExportDropdown();
                }
                if (e.key === 'Escape' && showExportDropdown) {
                  showExportDropdown = false;
                }
              }}
              aria-label="Export warnings"
              aria-haspopup="menu"
              aria-expanded={showExportDropdown}
              title="Export"
            >
              <span aria-hidden="true">⬇</span>
            </button>
            {#if showExportDropdown}
              <div class="dropdown-menu" role="menu">
                <button
                  on:click={() => exportWarnings('csv')}
                  on:keydown={e => {
                    if (e.key === 'Escape') {
                      showExportDropdown = false;
                    }
                  }}
                  role="menuitem"
                  aria-label="Export as CSV"
                >
                  Export as CSV
                </button>
                <button
                  on:click={() => exportWarnings('json')}
                  on:keydown={e => {
                    if (e.key === 'Escape') {
                      showExportDropdown = false;
                    }
                  }}
                  role="menuitem"
                  aria-label="Export as JSON"
                >
                  Export as JSON
                </button>
              </div>
            {/if}
          </div>
          <button
            class="action-btn resolve-all-btn"
            on:click={resolveAllWarnings}
            aria-label="Resolve all warnings"
            title="Resolve All"
          >
            <span aria-hidden="true">✓</span>
            <span class="btn-label">Resolve All</span>
          </button>
        {/if}
      </div>
    </div>
    <p class="panel-description">
      Automatic detection of problematic patterns: hardcoded secrets, debug statements, and code
      quality issues
    </p>
  </div>

  <!-- Filters -->
  <div class="filters-container">
    <!-- Category Filter -->
    <div class="filter-group">
      <span class="filter-label">Category:</span>
      <div class="category-filter" role="radiogroup" aria-label="Filter warnings by category">
        {#each categories as category (category)}
          <button
            class="category-btn"
            class:active={selectedCategory === category.id}
            on:click={() => (selectedCategory = category.id)}
            role="radio"
            aria-checked={selectedCategory === category.id}
            aria-label="{category.label} warnings filter"
          >
            <span class="category-icon" aria-hidden="true">{category.icon}</span>
            <span class="category-label">{category.label}</span>
          </button>
        {/each}
      </div>
    </div>

    <!-- Project Filter -->
    {#if projects.length > 0}
      <div class="filter-group">
        <span class="filter-label">Project:</span>
        <div class="project-filter">
          <button
            class="project-btn"
            class:active={selectedProject === 'all'}
            on:click={() => (selectedProject = 'all')}
          >
            All Projects
          </button>
          {#each projects as project (project)}
            <button
              class="project-btn"
              class:active={selectedProject === project}
              on:click={() => (selectedProject = project)}
            >
              {project}
            </button>
          {/each}
        </div>
      </div>
    {/if}
  </div>

  <!-- Stats Bar -->
  {#if !loading && filteredCount > 0}
    <div class="stats-bar" role="region" aria-label="Warning statistics">
      <div class="stat-item">
        <span class="stat-label">Showing:</span>
        <span class="stat-value" role="status">{formatNumber(filteredCount)}</span>
        {#if filteredCount !== warningCount}
          <span class="stat-sublabel">of {formatNumber(warningCount)}</span>
        {/if}
      </div>
      {#if severityStats.critical}
        <div class="stat-item critical">
          <span class="stat-icon" aria-hidden="true">🚨</span>
          <span class="stat-value" role="status">{formatNumber(severityStats.critical)}</span>
          <span class="stat-label">Critical</span>
        </div>
      {/if}
      {#if severityStats.warning}
        <div class="stat-item warning">
          <span class="stat-icon" aria-hidden="true">⚠️</span>
          <span class="stat-value" role="status">{formatNumber(severityStats.warning)}</span>
          <span class="stat-label">Warning</span>
        </div>
      {/if}
      {#if severityStats.info}
        <div class="stat-item info">
          <span class="stat-icon" aria-hidden="true">ℹ️</span>
          <span class="stat-value" role="status">{formatNumber(severityStats.info)}</span>
          <span class="stat-label">Info</span>
        </div>
      {/if}
    </div>

    <!-- Charts Section -->
    {#if showCharts}
      <div class="charts-section" role="region" aria-label="Warning visualizations">
        <div class="charts-grid">
          <!-- Pie Chart: Warnings by category -->
          <div class="chart-container">
            <h3 class="chart-title">Warnings by Category</h3>
            <div class="chart-wrapper">
              <canvas id="categoryChart"></canvas>
            </div>
          </div>

          <!-- Donut Chart: Severity distribution -->
          <div class="chart-container">
            <h3 class="chart-title">Severity Distribution</h3>
            <div class="chart-wrapper">
              <canvas id="severityChart"></canvas>
            </div>
          </div>

          <!-- Horizontal Bar Chart: Top files with most warnings -->
          <div class="chart-container chart-container-wide">
            <h3 class="chart-title">Top Files with Most Warnings</h3>
            <div class="chart-wrapper">
              <canvas id="filesChart"></canvas>
            </div>
          </div>

          <!-- Bar Chart: Warnings by project -->
          {#if projects.length > 0}
            <div class="chart-container chart-container-wide">
              <h3 class="chart-title">Warnings by Project</h3>
              <div class="chart-wrapper">
                <canvas id="projectsChart"></canvas>
              </div>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  {/if}

  {#if loading}
    <LoadingSkeleton type="list" count={5} height="80px" />
  {:else if filteredCount === 0}
    <div class="empty-state" role="status">
      <div class="empty-icon" aria-hidden="true">✅</div>
      <h3>No Pattern Warnings</h3>
      <p>
        {#if warningCount === 0}
          No problematic patterns detected in your code!
        {:else if selectedProject !== 'all'}
          No warnings found for project "{selectedProject}".
        {:else if selectedCategory !== 'all'}
          No {selectedCategory} issues found.
        {:else}
          No warnings match your filters.
        {/if}
      </p>
    </div>
  {:else}
    <div class="warnings-list" role="region" aria-label="Pattern warnings grouped by file">
      {#each Object.entries(warningsByFile) as [filepath, fileWarnings] (filepath)}
        <section class="file-group" role="group" aria-label="Warnings in {filepath}">
          <div class="file-header">
            <div class="file-header-left">
              <span class="file-icon" aria-hidden="true">📄</span>
              <span class="file-path" title={filepath}>{shortenPath(filepath)}</span>
            </div>
            <div class="file-badges">
              {#if fileWarnings[0]?.project_name}
                <span class="project-badge-file">{fileWarnings[0].project_name}</span>
              {/if}
              {#if fileWarnings.some(w => w.severity === 'critical')}
                <span class="severity-badge critical" role="status">CRITICAL</span>
              {/if}
              <span class="warning-count" role="status">{formatNumber(fileWarnings.length)}</span>
            </div>
          </div>

          <div class="warnings" role="list" aria-label="Warnings in {filepath}">
            {#each fileWarnings as warning (warning.id || warning.name || warning)}
              <article
                class="warning-item"
                style="--severity-color: {getSeverityColor(warning.severity)}"
                role="listitem"
              >
                <div class="warning-header">
                  <div class="warning-title-group">
                    <span class="warning-name">{warning.pattern_name}</span>
                    <span
                      class="severity-badge"
                      style="background: {getSeverityColor(warning.severity)}"
                      role="status"
                    >
                      {warning.severity}
                    </span>
                  </div>
                  <span class="line-number">Line {warning.line_number}</span>
                </div>

                <div class="warning-message">{warning.message || ''}</div>

                {#if warning.context || warning.match_text}
                  <div class="warning-code">
                    <code class="code-snippet">{warning.context || warning.match_text}</code>
                  </div>
                {/if}

                {#if warning.suggestion}
                  <div class="warning-suggestion">
                    <span class="suggestion-icon" aria-hidden="true">💡</span>
                    <span class="suggestion-text">{warning.suggestion}</span>
                  </div>
                {/if}
              </article>
            {/each}
          </div>
        </section>
      {/each}

      <!-- Load More Button -->
      {#if filteredCount > 0 && filteredCount < warningCount}
        <div class="load-more-container">
          <button class="load-more-btn" on:click={loadMore} disabled={loadingMore}>
            {#if loadingMore}
              <span class="spinner-small"></span> Loading...
            {:else}
              Load More ({formatNumber(Math.min(30, warningCount - filteredCount))} more)
            {/if}
          </button>
          <span class="load-more-info"
            >Showing {formatNumber(filteredCount)} of {formatNumber(warningCount)}</span
          >
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .pattern-warnings-panel {
    background: var(--surface);
    border-radius: var(--radius);
    padding: var(--space-lg);
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .panel-header {
    padding-bottom: var(--space-2xl);
    border-bottom: 1px solid var(--border);
  }

  .header-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-lg);
  }

  .panel-header h2 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }

  .panel-description {
    margin: 0;
    font-size: 13px;
    color: var(--muted);
    line-height: 1.5;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
  }

  .action-btn {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    min-width: var(--icon-lg);
    height: var(--icon-lg);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-md);
    padding: 0 var(--space-lg);
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
    color: var(--text);
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .action-btn:hover {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }

  .action-btn:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .action-btn:first-child:hover {
    transform: rotate(180deg);
  }

  .resolve-all-btn {
    background: var(--success);
    border-color: var(--success);
    color: white;
  }

  .resolve-all-btn:hover {
    background: #059669;
    border-color: #059669;
  }

  .btn-label {
    font-size: 13px;
  }

  /* Export Dropdown */
  .export-dropdown {
    position: relative;
  }

  .dropdown-menu {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: var(--space-sm);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    min-width: 140px;
    z-index: 1000;
    overflow: hidden;
  }

  .dropdown-menu button {
    width: 100%;
    padding: var(--space-lg) var(--space-xl);
    background: transparent;
    border: none;
    text-align: left;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    color: var(--text);
    transition: background var(--duration-base) var(--ease-smooth);
  }

  .dropdown-menu button:hover {
    background: var(--surface-2);
  }

  .dropdown-menu button:not(:last-child) {
    border-bottom: 1px solid var(--border);
  }

  /* Filters */
  .filters-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
  }

  .filter-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .filter-label {
    font-size: 12px;
    font-weight: 700;
    color: var(--text);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* Category Filter */
  .category-filter {
    display: flex;
    gap: var(--space-lg);
    flex-wrap: wrap;
  }

  .category-btn {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-lg) var(--space-xl);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    cursor: pointer;
    transition: all var(--duration-base) var(--ease-smooth);
    font-size: 13px;
    font-weight: 600;
    color: var(--muted);
  }

  .category-btn:hover {
    background: var(--surface);
    border-color: var(--accent);
  }

  .category-btn.active {
    background: var(--accent);
    border-color: var(--accent);
    color: white;
  }

  .category-btn:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .category-icon {
    font-size: 12px;
  }

  .category-label {
    font-size: 13px;
  }

  /* Project Filter */
  .project-filter {
    display: flex;
    gap: var(--space-lg);
    flex-wrap: wrap;
  }

  .project-btn {
    padding: var(--space-lg) var(--space-xl);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    cursor: pointer;
    transition: all var(--duration-base) var(--ease-smooth);
    font-size: 13px;
    font-weight: 600;
    color: var(--muted);
    font-family: var(--mono);
    text-transform: uppercase;
  }

  .project-btn:hover {
    background: var(--surface);
    border-color: var(--accent);
  }

  .project-btn.active {
    background: var(--accent);
    border-color: var(--accent);
    color: white;
  }

  .project-btn:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  /* Stats Bar */
  .stats-bar {
    display: flex;
    gap: var(--space-lg);
    padding: var(--space-md) var(--space-lg);
    background: var(--surface-2);
    border-radius: var(--radius);
    flex-wrap: wrap;
  }

  .stat-item {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  .stat-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
  }

  .stat-value {
    font-size: 11px;
    font-weight: 700;
    font-family: var(--mono);
    color: var(--text);
  }

  .stat-item.critical .stat-value {
    color: var(--error);
  }

  .stat-item.warning .stat-value {
    color: var(--warning);
  }

  .stat-item.info .stat-value {
    color: var(--info);
  }

  .stat-icon {
    font-size: 12px;
  }

  .stat-sublabel {
    font-size: 11px;
    color: var(--muted);
    margin-left: var(--space-sm);
  }

  /* Charts Section */
  .charts-section {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-2xl);
  }

  .charts-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: var(--space-2xl);
  }

  .chart-container {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-xl);
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
  }

  .chart-container-wide {
    grid-column: 1 / -1;
  }

  .chart-title {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .chart-wrapper {
    position: relative;
    height: 250px;
    width: 100%;
  }

  .chart-container-wide .chart-wrapper {
    height: 300px;
  }

  /* Empty State */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-lg) var(--space-xl);
    gap: var(--space-lg);
    text-align: center;
  }

  .empty-icon {
    font-size: 11px;
  }

  .empty-state h3 {
    margin: 0 0 var(--space-lg) 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
  }

  .empty-state p {
    margin: 0;
    font-size: 11px;
    color: var(--muted);
  }

  /* Warnings List */
  .warnings-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .file-group {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .file-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-xl);
    padding: var(--space-lg) var(--space-xl);
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }

  .file-header-left {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
    flex: 1;
    min-width: 0;
  }

  .file-icon {
    font-size: 14px;
    flex-shrink: 0;
  }

  .file-path {
    flex: 1;
    font-family: var(--mono);
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-badges {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
    flex-shrink: 0;
  }

  .project-badge-file {
    padding: var(--space-sm) var(--space-lg);
    border-radius: var(--radius-sm);
    font-size: 11px;
    font-weight: 700;
    background: var(--accent);
    color: white;
    font-family: var(--mono);
    text-transform: uppercase;
  }

  .warning-count {
    padding: var(--space-sm) var(--space-lg);
    border-radius: var(--radius);
    font-size: 12px;
    font-weight: 700;
    background: color-mix(in srgb, var(--error) 10%, var(--surface));
    color: var(--error);
  }

  .severity-badge {
    padding: var(--space-sm) var(--space-lg);
    border-radius: var(--radius);
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    color: white;
  }

  .severity-badge.critical {
    background: var(--error);
  }

  /* Warning Items */
  .warnings {
    display: flex;
    flex-direction: column;
  }

  .warning-item {
    padding: var(--space-xl) var(--space-2xl);
    border-bottom: 1px solid var(--border);
    border-left: 3px solid var(--severity-color);
  }

  .warning-item:last-child {
    border-bottom: none;
  }

  .warning-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-xl);
    margin-bottom: var(--space-lg);
  }

  .warning-title-group {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
    flex: 1;
  }

  .warning-name {
    font-size: 13px;
    font-weight: 700;
    color: var(--text);
  }

  .line-number {
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
    font-family: var(--mono);
    white-space: nowrap;
  }

  .warning-message {
    font-size: 13px;
    color: var(--text);
    margin-bottom: var(--space-lg);
    line-height: 1.5;
  }

  .warning-code {
    margin-bottom: var(--space-lg);
  }

  .code-snippet {
    display: block;
    font-family: var(--mono);
    font-size: 13px;
    background: var(--surface);
    padding: var(--space-lg) var(--space-xl);
    border-radius: var(--radius);
    color: var(--text);
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .warning-suggestion {
    display: flex;
    align-items: start;
    gap: var(--space-lg);
    padding: var(--space-lg) var(--space-xl);
    background: color-mix(in srgb, var(--success) 10%, var(--surface));
    border-left: 3px solid var(--success);
    border-radius: var(--radius);
    font-size: 12px;
    color: var(--success);
    line-height: 1.5;
  }

  .suggestion-icon {
    font-size: 14px;
    flex-shrink: 0;
    margin-top: var(--space-xs);
  }

  .suggestion-text {
    flex: 1;
  }

  /* Load More */
  .load-more-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-xl);
    padding: var(--space-3xl);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    margin-top: var(--space-lg);
  }

  .load-more-btn {
    padding: var(--space-xl) var(--space-3xl);
    background: var(--accent);
    color: white;
    border: none;
    border-radius: var(--radius);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-base) var(--ease-smooth);
    display: flex;
    align-items: center;
    gap: var(--space-lg);
  }

  .load-more-btn:hover:not(:disabled) {
    background: var(--accent-hover, var(--accent));
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  .load-more-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .load-more-info {
    font-size: 12px;
    color: var(--muted);
  }

  .spinner-small {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }
</style>
