<script>
  import { logger } from './logger.js';
  import { onMount, onDestroy } from 'svelte';
  import { fetchErrorLogs, fetchErrorStats, clearErrorLogs, logError } from './errorLogger.js';
  import { formatDateTime, getTimeAgo } from './timeFormat.js';
  import { websocketService } from './services/websocket.js';
  import VirtualScroll from './VirtualScroll.svelte';
  import { debounceInput } from './utils/debounce.js';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import { TimeoutManager } from './utils/TimeoutManager.js';
  import { Chart, registerables } from 'chart.js';
  import {
    initializeCharts,
    setupChartThemeObserver,
    getChartThemeColors
  } from './utils/chartHelpers.js';

  Chart.register(...registerables);

  let errors = [];
  let stats = { total: 0, by_severity: [], recent_count: 0 };
  let searchQuery = '';
  let severityFilter = 'all';
  let loading = true;
  let error = null;
  let selectedError = null;
  let loadErrorsTimeout = null;
  let virtualScroll; // Reference to virtual scroll component
  let lastUpdated = null;
  let isManualRefresh = false;
  let showCharts = false; // Toggle for showing/hiding charts

  // Timeout manager for cleanup
  const timeouts = new TimeoutManager();

  // Charts
  let charts = {};
  let themeObserver;

  // Pagination
  let currentPage = 0;
  let pageSize = 50;
  let totalErrors = 0;
  let hasMore = false;

  // Stats breakdown
  let severityStats = {
    error: 0,
    warning: 0,
    info: 0
  };

  onMount(async () => {
    await loadErrors();
    await loadStats();
    setupWebSocket();

    // Initialize charts after data loads
    initializeCharts(createCharts, {
      data: errors,
      enabled: showCharts
    });

    // Setup theme observer for charts
    themeObserver = setupChartThemeObserver(createCharts, {
      enabled: showCharts
    });

    // Check if we should highlight a specific error (from notification click)
    const highlightMsg = sessionStorage.getItem('highlightError');
    if (highlightMsg) {
      // Find and select the error with matching message
      setTimeout(() => {
        const matchingError = errors.find(e => e.message && e.message.includes(highlightMsg));
        if (matchingError) {
          selectedError = matchingError;
          logger.info('Highlighted error from notification:', highlightMsg);
        }
        // Clear the session storage flag
        sessionStorage.removeItem('highlightError');
      }, 500);
    }
  });

  onDestroy(() => {
    // Destroy charts
    Object.values(charts).forEach(chart => chart?.destroy());

    // Disconnect theme observer
    themeObserver?.disconnect();

    // Remove WebSocket event listeners
    websocketService.off('error-logged', handleErrorLogged);

    // Clean up pending timeout
    if (loadErrorsTimeout) {
      clearTimeout(loadErrorsTimeout);
    }

    // Clean up all timeouts
    timeouts.cleanup();
  });

  // Handle error-logged WebSocket event
  function handleErrorLogged(_errorData) {
    // Debounce to prevent race conditions from rapid events
    clearTimeout(loadErrorsTimeout);
    loadErrorsTimeout = setTimeout(() => {
      loadErrors();
      loadStats();
    }, 300);
  }

  function setupWebSocket() {
    // Connect to WebSocket and listen for error-logged events
    websocketService.connect();
    websocketService.on('error-logged', handleErrorLogged);
  }

  async function loadErrors(manual = false) {
    try {
      loading = true;
      isManualRefresh = manual;
      error = null;

      const result = await fetchErrorLogs({
        limit: pageSize,
        offset: currentPage * pageSize,
        search: searchQuery,
        severity: severityFilter
      });

      errors = result.errors;
      totalErrors = result.total;
      hasMore = result.hasMore;
      lastUpdated = new Date();
    } catch (error) {
      errorMessage = error.message;
      logger.error('Failed to load errors:', error);
    } finally {
      loading = false;
      isManualRefresh = false;
    }
  }

  async function loadStats() {
    try {
      stats = await fetchErrorStats();

      // Build severity breakdown
      severityStats = {
        error: 0,
        warning: 0,
        info: 0
      };

      stats.by_severity?.forEach(s => {
        if (s.severity && severityStats.hasOwnProperty(s.severity)) {
          severityStats[s.severity] = s.count;
        }
      });
    } catch (error) {
      logger.error('Failed to load error stats:', error);
    }
  }

  async function handleSearch() {
    currentPage = 0;
    await loadErrors();
  }

  // Debounced search handler
  async function handleDebouncedSearch(event) {
    searchQuery = event.detail;
    currentPage = 0;
    await loadErrors();
    // Reset scroll position when searching
    if (virtualScroll) {
      virtualScroll.scrollToItem(0);
    }
  }

  async function handleSeverityFilter(severity) {
    severityFilter = severity;
    currentPage = 0;
    await loadErrors();
  }

  async function handleClearAll() {
    if (!confirm('Are you sure you want to clear all error logs?')) {
      return;
    }

    try {
      const result = await clearErrorLogs();
      alert(result.message);
      await loadErrors();
      await loadStats();
    } catch (error) {
      alert('Failed to clear error logs: ' + error.message);
    }
  }

  async function handleClearOld() {
    const days = prompt('Clear errors older than how many days?', '7');
    if (!days) return;

    const parsedDays = parseInt(days, 10);
    if (isNaN(parsedDays)) {
      alert('Invalid number of days');
      return;
    }

    try {
      const result = await clearErrorLogs(parsedDays);
      alert(result.message);
      await loadErrors();
      await loadStats();
    } catch (error) {
      alert('Failed to clear old error logs: ' + error.message);
    }
  }

  function toggleError(err) {
    if (selectedError?.id === err.id) {
      selectedError = null;
    } else {
      selectedError = err;
    }
  }

  function nextPage() {
    if (hasMore) {
      currentPage++;
      loadErrors();
    }
  }

  function prevPage() {
    if (currentPage > 0) {
      currentPage--;
      loadErrors();
    }
  }

  function getSeverityColor(severity) {
    switch (severity) {
    case 'error':
      return 'var(--error)';
    case 'warning':
      return 'var(--warning)';
    case 'info':
      return 'var(--info)';
    default:
      return 'var(--muted)';
    }
  }

  function getSeverityIcon(severity) {
    switch (severity) {
    case 'error':
      return '';
    case 'warning':
      return '';
    case 'info':
      return '';
    default:
      return '';
    }
  }

  function formatTimestamp(timestamp) {
    return formatDateTime(timestamp);
  }

  function formatRelativeTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  }

  async function triggerTestError() {
    try {
      await logError(
        new Error('This is a test error from ErrorLog component'),
        'ErrorLog',
        { test: true, user_action: 'test_button_click' },
        'warning'
      );
      // Reload after a short delay to let the backend process it
      timeouts.add(() => {
        loadErrors();
        loadStats();
      }, 200);
    } catch (error) {
      alert('Failed to log test error: ' + error.message);
    }
  }

  async function exportLog() {
    try {
      const result = await fetchErrorLogs({ limit: 10000 });
      const json = JSON.stringify(result.errors, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `raven-error-log-${Date.now()}.json`;
      a.click();

      URL.revokeObjectURL(url);
    } catch (error) {
      alert('Export failed: ' + error.message);
    }
  }

  function createCharts() {
    // Destroy existing charts
    Object.values(charts).forEach(chart => chart?.destroy());
    charts = {};

    if (!showCharts || errors.length === 0) return;

    const colors = getChartThemeColors();

    // Chart 1: Line Chart - Error Rate Over Time (Last 24 Hours)
    const timeCanvas = document.getElementById('chart-error-rate-time');
    if (timeCanvas) {
      // Group errors by hour for the last 24 hours
      const now = new Date();
      const last24Hours = Array.from({ length: 24 }, (_, i) => {
        const hour = new Date(now.getTime() - (23 - i) * 60 * 60 * 1000);
        hour.setMinutes(0, 0, 0);
        return hour;
      });

      const hourlyData = last24Hours.map(hour => {
        const hourEnd = new Date(hour.getTime() + 60 * 60 * 1000);
        return errors.filter(e => {
          const errorTime = new Date(e.timestamp);
          return errorTime >= hour && errorTime < hourEnd;
        }).length;
      });

      charts.timeChart = new Chart(timeCanvas, {
        type: 'line',
        data: {
          labels: last24Hours.map(h => h.getHours() + ':00'),
          datasets: [
            {
              label: 'Errors',
              data: hourlyData,
              borderColor: colors.error,
              backgroundColor: `${colors.error}33`,
              borderWidth: 2,
              fill: true,
              tension: 0.4
            }
          ]
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
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                color: colors.muted,
                font: { size: 10, family: 'var(--mono)' }
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
                color: colors.grid
              }
            }
          }
        }
      });
    }

    // Chart 2: Pie Chart - Errors by Severity
    const severityCanvas = document.getElementById('chart-errors-by-severity');
    if (severityCanvas) {
      const severityData = [
        severityStats.error || 0,
        severityStats.warning || 0,
        severityStats.info || 0
      ];

      charts.severityChart = new Chart(severityCanvas, {
        type: 'pie',
        data: {
          labels: ['Errors', 'Warnings', 'Info'],
          datasets: [
            {
              data: severityData,
              backgroundColor: [colors.error, colors.warning, colors.info],
              borderColor: [colors.error, colors.warning, colors.info],
              borderWidth: 2
            }
          ]
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
            }
          }
        }
      });
    }

    // Chart 3: Bar Chart - Most Common Error Types
    const typeCanvas = document.getElementById('chart-error-types');
    if (typeCanvas) {
      // Count error types
      const typeCount = {};
      errors.forEach(e => {
        const type = e.error_type || 'Unknown';
        typeCount[type] = (typeCount[type] || 0) + 1;
      });

      // Sort by count and take top 10
      const sortedTypes = Object.entries(typeCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      charts.typeChart = new Chart(typeCanvas, {
        type: 'bar',
        data: {
          labels: sortedTypes.map(([type]) => type),
          datasets: [
            {
              label: 'Count',
              data: sortedTypes.map(([, count]) => count),
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
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                color: colors.muted,
                font: { size: 10, family: 'var(--mono)' }
              },
              grid: {
                color: colors.grid
              }
            },
            x: {
              ticks: {
                color: colors.muted,
                font: { size: 10, family: 'var(--mono)' },
                maxRotation: 45,
                minRotation: 45
              },
              grid: {
                color: colors.grid
              }
            }
          }
        }
      });
    }
  }

  // Reactive: Recreate charts when showCharts or data changes
  $: if (showCharts && errors.length > 0) {
    setTimeout(createCharts, 100);
  }

  // Reactive "time ago" - updates when lastUpdated changes (no polling!)
  $: timeAgo = getTimeAgo(lastUpdated);
</script>

<div class="error-log" role="region" aria-label="Error Log">
  <div class="log-header">
    <div class="header-title">
      <h1 id="error-log-title"><span aria-hidden="true"></span> Error Log</h1>
      <p class="subtitle">Application errors and warnings</p>
    </div>
    <div class="header-actions" role="toolbar" aria-label="Error log actions">
      <span
        class="last-updated"
        role="status"
        aria-live="polite"
        aria-label="Last updated {timeAgo}">Updated: {timeAgo}</span
      >
      <button
        class="btn btn-ghost btn-sm"
        on:click={() => (showCharts = !showCharts)}
        aria-label="Toggle charts visibility"
      >
        <span aria-hidden="true"></span>
        {showCharts ? 'Hide' : 'Show'} Charts
      </button>
      <button
        class="btn btn-secondary btn-sm"
        on:click={triggerTestError}
        aria-label="Trigger test error"
      >
        <span aria-hidden="true"></span> Test Error
      </button>
      <button
        class="btn btn-primary btn-sm"
        on:click={exportLog}
        aria-label="Export error log to JSON file"
      >
        <span aria-hidden="true"></span> Export JSON
      </button>
      <button
        class="btn btn-secondary btn-sm"
        on:click={() => {
          currentPage = 0;
          loadErrors(true);
          loadStats();
        }}
        disabled={loading}
        aria-label="Refresh error log"
      >
        <span class="refresh-icon" class:spinning={isManualRefresh} aria-hidden="true"></span>
        Refresh
      </button>
    </div>
  </div>

  <!-- Stats Bar -->
  <div class="stats-bar" role="region" aria-label="Error statistics">
    <div class="stat-item">
      <span class="stat-label">Total</span>
      <span class="stat-value">{stats.total}</span>
    </div>
    <div class="stat-item">
      <span class="stat-label">Last Hour</span>
      <span class="stat-value">{stats.recent_count}</span>
    </div>
    <div class="stat-item error">
      <span class="stat-label">Errors</span>
      <span class="stat-value">{severityStats.error}</span>
    </div>
    <div class="stat-item warning">
      <span class="stat-label">Warnings</span>
      <span class="stat-value">{severityStats.warning}</span>
    </div>
    <div class="stat-item info">
      <span class="stat-label">Info</span>
      <span class="stat-value">{severityStats.info}</span>
    </div>
  </div>

  <!-- Search and Filters -->
  <div class="controls">
    <div class="search-bar">
      <input
        type="text"
        placeholder="Search errors..."
        use:debounceInput={{ delay: 300 }}
        on:debounced={handleDebouncedSearch}
      />
      <button class="btn btn-primary btn-sm" on:click={handleSearch}> Search</button>
    </div>

    <div class="filter-tabs">
      <button
        class="filter-tab"
        class:active={severityFilter === 'all'}
        on:click={() => handleSeverityFilter('all')}
      >
        All ({stats.total})
      </button>
      <button
        class="filter-tab"
        class:active={severityFilter === 'error'}
        on:click={() => handleSeverityFilter('error')}
      >
        Errors ({severityStats.error})
      </button>
      <button
        class="filter-tab"
        class:active={severityFilter === 'warning'}
        on:click={() => handleSeverityFilter('warning')}
      >
        Warnings ({severityStats.warning})
      </button>
      <button
        class="filter-tab"
        class:active={severityFilter === 'info'}
        on:click={() => handleSeverityFilter('info')}
      >
        Info ({severityStats.info})
      </button>
    </div>

    <div class="action-buttons">
      <button class="btn btn-secondary btn-sm" on:click={handleClearOld}> Clear Old</button>
      <button class="btn btn-danger btn-sm" on:click={handleClearAll}> Clear All</button>
    </div>
  </div>

  <!-- Charts Section -->
  {#if showCharts && errors.length > 0}
    <div class="charts-section" role="region" aria-label="Error charts">
      <div class="charts-grid">
        <div class="chart-container chart-wide">
          <div class="chart-header">
            <h3>Error Rate Over Time (Last 24 Hours)</h3>
          </div>
          <div class="chart-canvas-wrapper">
            <canvas id="chart-error-rate-time"></canvas>
          </div>
        </div>

        <div class="chart-container">
          <div class="chart-header">
            <h3>Errors by Severity</h3>
          </div>
          <div class="chart-canvas-wrapper">
            <canvas id="chart-errors-by-severity"></canvas>
          </div>
        </div>

        <div class="chart-container">
          <div class="chart-header">
            <h3>Most Common Error Types</h3>
          </div>
          <div class="chart-canvas-wrapper">
            <canvas id="chart-error-types"></canvas>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Error Timeline -->
  <div class="timeline">
    {#if loading && errors.length === 0}
      <LoadingSkeleton count={8} height="100px" />
    {:else if error}
      <div class="error-state">
        <div class="error-icon"></div>
        <h2>Failed to Load Errors</h2>
        <p>{error}</p>
      </div>
    {:else if errors.length === 0}
      <div class="empty-state">
        <div class="empty-icon"></div>
        <h2>No Errors Found</h2>
        <p>Your application is running smoothly!</p>
      </div>
    {:else}
      <VirtualScroll
        bind:this={virtualScroll}
        items={errors}
        itemHeight={100}
        containerHeight={500}
        overscan={3}
        getKey={err => err.id}
      >
        <!-- NOTE: itemHeight=100 works for collapsed errors. Expanded errors are taller
             but VirtualScroll handles this gracefully with overscan. For better accuracy,
             consider dynamic height calculation or disable VirtualScroll when expanded. -->
        {#snippet children(item)}
        <div class="error-item" class:expanded={selectedError?.id === item.id}>
          <button
            class="error-header"
            on:click={() => toggleError(item)}
            on:keydown={e => e.key === 'Enter' && toggleError(item)}
            aria-expanded={selectedError?.id === item.id}
            aria-label="Toggle error details for {item.message}"
            tabindex="0"
          >
            <div class="error-left">
              <span class="expand-arrow">{selectedError?.id === item.id ? '' : ''}</span>
              <span class="error-icon" style="color: {getSeverityColor(item.severity)}">
                {getSeverityIcon(item.severity)}
              </span>
              <div class="error-info">
                <div class="error-message">{item.message}</div>
                <div class="error-meta">
                  <span class="meta-item">{item.error_type}</span>
                  <span class="meta-separator">•</span>
                  <span class="meta-item">{item.component || 'Unknown'}</span>
                  <span class="meta-separator">•</span>
                  <span class="meta-item">{formatRelativeTime(item.timestamp)}</span>
                </div>
              </div>
            </div>
            <div class="error-right">
              <span class="error-time">{formatTimestamp(item.timestamp)}</span>
              <span
                class="error-severity"
                style="border-color: {getSeverityColor(item.severity)}; color: {getSeverityColor(
                  item.severity
                )}"
              >
                {item.severity}
              </span>
            </div>
          </button>

          {#if selectedError?.id === item.id}
            <div class="error-details">
              <div class="details-grid">
                <div class="detail-item">
                  <span class="detail-label">ID:</span>
                  <span class="detail-value">{item.id}</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">Type:</span>
                  <span class="detail-value">{item.error_type}</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">Severity:</span>
                  <span class="detail-value" style="color: {getSeverityColor(item.severity)}"
                    >{item.severity}</span
                  >
                </div>
                <div class="detail-item">
                  <span class="detail-label">Component:</span>
                  <span class="detail-value">{item.component || 'Unknown'}</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">Timestamp:</span>
                  <span class="detail-value">{item.timestamp}</span>
                </div>
                {#if item.url}
                  <div class="detail-item">
                    <span class="detail-label">URL:</span>
                    <span class="detail-value url">{item.url}</span>
                  </div>
                {/if}
              </div>

              {#if item.stack}
                <div class="stack-section">
                  <h4>Stack Trace</h4>
                  <pre class="stack-code">{item.stack}</pre>
                </div>
              {/if}

              {#if item.metadata}
                <div class="metadata-section">
                  <h4>Metadata</h4>
                  <pre class="metadata-code">{JSON.stringify(item.metadata, null, 2)}</pre>
                </div>
              {/if}

              {#if item.user_agent}
                <div class="metadata-section">
                  <h4>User Agent</h4>
                  <pre class="metadata-code">{item.user_agent}</pre>
                </div>
              {/if}
            </div>
          {/if}
        </div>
        {/snippet}
      </VirtualScroll>

      <!-- Pagination -->
      <div class="pagination">
        <button class="btn btn-secondary btn-sm" on:click={prevPage} disabled={currentPage === 0}
          >← Previous</button
        >
        <span class="page-info">
          Page {currentPage + 1} • {currentPage * pageSize + 1}-{Math.min(
            (currentPage + 1) * pageSize,
            totalErrors
          )} of {totalErrors}
        </span>
        <button class="btn btn-secondary btn-sm" on:click={nextPage} disabled={!hasMore}
          >Next →</button
        >
      </div>
    {/if}
  </div>
</div>

<style>
  .error-log {
    padding: var(--space-lg);
    position: relative;
    max-width: 1600px;
    margin: 0 auto;
  }

  .log-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-lg);
    padding-bottom: var(--space-2xl);
    border-bottom: 2px solid var(--border);
  }

  .header-title h1 {
    margin: 0 0 var(--space-sm) 0;
    font-size: 11px;
    color: var(--text);
  }

  .subtitle {
    margin: 0;
    font-size: 12px;
    color: var(--muted);
  }

  .header-actions {
    display: flex;
    gap: var(--space-md);
    align-items: center;
  }

  .last-updated {
    font-size: 12px;
    color: var(--muted);
    font-family: var(--mono);
  }

  .refresh-icon {
    display: inline-block;
    font-size: 11px;
  }

  .refresh-icon.spinning {
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .stats-bar {
    display: flex;
    gap: var(--space-md);
    margin-bottom: var(--space-lg);
  }

  .stat-item {
    flex: 1;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--space-md);
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .stat-item.error {
    border-left: 3px solid var(--error);
  }

  .stat-item.warning {
    border-left: 3px solid var(--warning);
  }

  .stat-item.info {
    border-left: 3px solid var(--info);
  }

  .stat-label {
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
    font-weight: 600;
  }

  .stat-value {
    font-size: 11px;
    color: var(--text);
    font-family: var(--mono);
    font-weight: 700;
  }

  .controls {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    margin-bottom: var(--space-lg);
    background: var(--surface);
    padding: var(--space-lg);
    border-radius: var(--radius);
    border: 1px solid var(--border);
  }

  .search-bar {
    display: flex;
    gap: var(--space-md);
  }

  .search-bar input {
    flex: 1;
    padding: var(--space-md) var(--space-lg);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-size: 12px;
    font-family: var(--mono);
  }

  .search-bar input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .filter-tabs {
    display: flex;
    gap: var(--space-lg);
    flex-wrap: wrap;
  }

  .filter-tab {
    padding: var(--space-lg) var(--space-2xl);
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .filter-tab:hover {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .filter-tab:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .filter-tab.active {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }

  .action-buttons {
    display: flex;
    gap: var(--space-lg);
  }

  .timeline {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .error-state,
  .empty-state {
    text-align: center;
    padding: var(--space-lg) var(--space-xl);
    color: var(--muted);
  }

  /* (removed unused spinner) */

  .empty-icon,
  .error-icon {
    font-size: 11px;
    margin-bottom: var(--space-lg);
  }

  .empty-state h2,
  .error-state h2 {
    font-size: 11px;
    margin: 0 0 var(--space-lg) 0;
    color: var(--text);
  }

  .error-item {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .error-item:hover {
    border-color: var(--accent);
    box-shadow: 0 2px 8px color-mix(in srgb, var(--accent) 20%, transparent);
  }

  .error-item.expanded {
    border-color: var(--accent);
  }

  button.error-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-md) var(--space-3xl);
    cursor: pointer;
    width: 100%;
    background: none;
    border: none;
    text-align: left;
    font-family: inherit;
    user-select: none;
  }

  button.error-header:focus {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
    background: var(--surface-2);
  }

  .error-left {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    flex: 1;
    min-width: 0;
  }

  .expand-arrow {
    font-size: 11px;
    color: var(--muted);
    width: 12px;
    flex-shrink: 0;
  }

  .error-icon {
    font-size: 11px;
    flex-shrink: 0;
  }

  .error-info {
    flex: 1;
    min-width: 0;
  }

  .error-message {
    font-size: 11px;
    color: var(--text);
    font-weight: 500;
    margin-bottom: var(--space-sm);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .error-meta {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    font-size: 11px;
    color: var(--muted);
  }

  .meta-item {
    font-family: var(--mono);
  }

  .meta-separator {
    color: var(--border);
  }

  .error-right {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    flex-shrink: 0;
  }

  .error-time {
    font-size: 12px;
    color: var(--muted);
    font-family: var(--mono);
  }

  .error-severity {
    padding: var(--space-sm) var(--space-lg);
    background: var(--bg);
    border: 1px solid;
    border-radius: var(--radius);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
  }

  .error-details {
    padding: 0 var(--space-3xl) var(--space-3xl) var(--space-3xl);
    border-top: 1px solid var(--border);
  }

  .details-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: var(--space-md);
    padding: var(--space-md) 0;
  }

  .detail-item {
    display: flex;
    gap: var(--space-lg);
  }

  .detail-label {
    font-size: 11px;
    color: var(--muted);
    font-weight: 600;
    text-transform: uppercase;
  }

  .detail-value {
    font-size: 12px;
    color: var(--text);
    font-family: var(--mono);
    word-break: break-all;
  }

  .detail-value.url {
    word-break: break-all;
  }

  .stack-section,
  .metadata-section {
    margin-top: var(--space-2xl);
  }

  .stack-section h4,
  .metadata-section h4 {
    margin: 0 0 var(--space-lg) 0;
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
  }

  .stack-code,
  .metadata-code {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-md);
    font-size: 11px;
    font-family: var(--mono);
    color: var(--text);
    overflow-x: auto;
    margin: 0;
    max-height: 300px;
    overflow-y: auto;
  }

  .pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: var(--space-lg);
    padding: var(--space-lg);
    background: var(--surface);
    border-radius: var(--radius);
    border: 1px solid var(--border);
  }

  .page-info {
    font-size: 11px;
    color: var(--muted);
    font-family: var(--mono);
  }

  /* Charts Section */
  .charts-section {
    margin-bottom: var(--space-lg);
  }

  .charts-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-2xl);
  }

  .chart-container {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1rem;
    border-left: 3px solid var(--accent);
  }

  .chart-container.chart-wide {
    grid-column: 1 / -1;
  }

  .chart-header {
    margin-bottom: 1rem;
  }

  .chart-header h3 {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
    margin: 0;
  }

  .chart-canvas-wrapper {
    position: relative;
    height: 250px;
  }

  @media (max-width: 768px) {
    .charts-grid {
      grid-template-columns: 1fr;
    }

    .chart-container.chart-wide {
      grid-column: 1;
    }
  }
</style>
