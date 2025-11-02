<script>
  import { onMount, onDestroy } from 'svelte';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import { exportCSV, exportJSON } from './exportUtils.js';
  import { websocketService } from './websocket.js';
  import { API_CONFIG } from '../config.js';
  import { logger } from './logger.js';
  import { formatDateOnly } from './timeFormat.js';
  import Chart from 'chart.js/auto';

  let trends = [];
  let loading = true;
  let error = null;
  let period = 'hourly'; // hourly, daily, weekly
  let days = 7;
  let lastUpdate = new Date();

  const API_BASE = API_CONFIG.API_BASE;

  $: maxEventCount = Math.max(...trends.map(t => t.event_count || 0), 1);

  // Chart.js visualizations
  let showCharts = true;
  let charts = {};
  let themeObserver;

  // WebSocket event handlers (event-driven, no polling!)
  const handleFileChanged = async () => {
    await loadTrends();
  };

  const handleProjectSwitched = async () => {
    await loadTrends();
  };

  onMount(async () => {
    await loadTrends();

    // Create charts after data loads and DOM is ready
    if (showCharts && trends.length > 0) {
      setTimeout(createCharts, 200);
    }

    // Connect to WebSocket for real-time updates
    websocketService.connect();
    websocketService.on('file-changed', handleFileChanged);
    websocketService.on('project-switched', handleProjectSwitched);

    // Watch for theme changes on body element
    themeObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class' && showCharts) {
          logger.info('[HistoricalTrends] Theme changed, recreating charts');
          setTimeout(createCharts, 100);
        }
      });
    });

    themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });
  });

  onDestroy(() => {
    // Clean up WebSocket listeners
    websocketService.off('file-changed', handleFileChanged);
    websocketService.off('project-switched', handleProjectSwitched);

    // Disconnect theme observer
    if (themeObserver) {
      themeObserver.disconnect();
    }

    // Destroy all charts
    Object.values(charts).forEach(chart => chart?.destroy());
  });

  async function loadTrends() {
    try {
      loading = true;
      const response = await fetch(`${API_BASE}/trends/historical?period=${period}&days=${days}`);
      if (!response.ok) throw new Error('Failed to fetch trends');

      const data = await response.json();
      trends = data.trends || [];
      lastUpdate = new Date();
      error = null;
    } catch (err) {
      logger.error('Failed to load trends:', err);
      error = err.message;
    } finally {
      loading = false;
    }
  }

  function handlePeriodChange(newPeriod) {
    period = newPeriod;
    loadTrends();
  }

  function handleDaysChange(newDays) {
    const parsedDays = parseInt(newDays, 10);
    if (!isNaN(parsedDays)) {
      days = parsedDays;
      loadTrends();
    }
  }

  // Get the height of a bar segment as a percentage of that period's total
  function getSegmentHeight(value, total) {
    if (total === 0) return 0;
    return (value / total) * 100;
  }

  // Get the overall bar height for a period (in pixels)
  function getPeriodBarHeight(eventCount) {
    const maxHeight = 280; // Max height in pixels (chart is 300px, leave some padding)
    return (eventCount / maxEventCount) * maxHeight;
  }

  function formatPeriod(periodStr) {
    if (period === 'hourly' || period === 'daily') {
      // Show just date (no time)
      return formatDateOnly(periodStr);
    } else {
      // Weekly format stays as-is (e.g., "2025-W42")
      return periodStr;
    }
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

  // Reactive aria-labels for chart accessibility
  $: trendsOverTimeAriaLabel = (() => {
    if (trends.length === 0) return 'Trends over time chart: No data available';
    const totalEvents = trends.reduce((sum, t) => sum + t.event_count, 0);
    return `Trends over time chart showing ${totalEvents} total events across ${trends.length} ${period} periods`;
  })();

  $: periodComparisonAriaLabel = (() => {
    if (trends.length === 0) return 'Period comparison chart: No data available';
    return `Period comparison chart showing event breakdown (created, modified, deleted) for ${trends.length} periods`;
  })();

  // Chart creation function
  function createCharts() {
    // Destroy existing charts
    Object.values(charts).forEach(chart => chart?.destroy());
    charts = {};

    if (!showCharts || trends.length === 0) return;

    // Helper function to safely extract color with fallback
    const getColor = (varName, fallback) => {
      const computedStyle = getComputedStyle(document.body);
      const value = computedStyle.getPropertyValue(varName).trim();
      return (value && (value.startsWith('#') || value.startsWith('rgb'))) ? value : fallback;
    };

    // Get theme-aware colors from body element
    const textColor = getColor('--text', '#c0caf5');
    const mutedColor = getColor('--muted', '#565f89');
    const gridColor = 'rgba(128, 128, 128, 0.15)';

    // 1. Line Chart: Trends over time (total events)
    const lineCanvas = document.getElementById('chart-trends-over-time');
    if (lineCanvas) {
      const labels = trends.map(t => formatPeriod(t.period));
      const eventCounts = trends.map(t => t.event_count);

      charts.trendsOverTime = new Chart(lineCanvas, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'Total Events',
            data: eventCounts,
            borderColor: '#7aa2f7',
            backgroundColor: 'rgba(122, 162, 247, 0.1)',
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointHoverRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            },
            title: {
              display: true,
              text: 'Trends Over Time',
              color: textColor,
              font: { size: 12, weight: 'bold', family: 'var(--mono)' }
            },
            tooltip: {
              backgroundColor: 'rgba(0, 0, 0, 0.8)',
              titleColor: textColor,
              bodyColor: textColor,
              borderColor: gridColor,
              borderWidth: 1
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                color: mutedColor,
                font: { size: 10, family: 'var(--mono)' }
              },
              grid: {
                color: gridColor
              }
            },
            x: {
              ticks: {
                color: mutedColor,
                font: { size: 9, family: 'var(--mono)' },
                maxRotation: 45,
                minRotation: 45
              },
              grid: {
                color: gridColor
              }
            }
          }
        }
      });
    }

    // 2. Stacked Bar Chart: Period-over-period comparison (created/modified/deleted)
    const barCanvas = document.getElementById('chart-period-comparison');
    if (barCanvas) {
      const labels = trends.map(t => formatPeriod(t.period));
      const createdData = trends.map(t => t.creations || 0);
      const modifiedData = trends.map(t => t.modifications || 0);
      const deletedData = trends.map(t => t.deletions || 0);

      charts.periodComparison = new Chart(barCanvas, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [
            {
              label: 'Created',
              data: createdData,
              backgroundColor: '#10b981',
              borderColor: '#10b981',
              borderWidth: 1
            },
            {
              label: 'Modified',
              data: modifiedData,
              backgroundColor: '#7aa2f7',
              borderColor: '#7aa2f7',
              borderWidth: 1
            },
            {
              label: 'Deleted',
              data: deletedData,
              backgroundColor: '#f7768e',
              borderColor: '#f7768e',
              borderWidth: 1
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'top',
              labels: {
                color: textColor,
                font: { size: 11, family: 'var(--mono)' },
                padding: 8
              }
            },
            title: {
              display: true,
              text: 'Period-over-Period Comparison',
              color: textColor,
              font: { size: 12, weight: 'bold', family: 'var(--mono)' }
            },
            tooltip: {
              backgroundColor: 'rgba(0, 0, 0, 0.8)',
              titleColor: textColor,
              bodyColor: textColor,
              borderColor: gridColor,
              borderWidth: 1
            }
          },
          scales: {
            x: {
              stacked: true,
              ticks: {
                color: mutedColor,
                font: { size: 9, family: 'var(--mono)' },
                maxRotation: 45,
                minRotation: 45
              },
              grid: {
                color: gridColor
              }
            },
            y: {
              stacked: true,
              beginAtZero: true,
              ticks: {
                color: mutedColor,
                font: { size: 10, family: 'var(--mono)' }
              },
              grid: {
                color: gridColor
              }
            }
          }
        }
      });
    }
  }

  // Recreate charts when trends data changes
  $: if (showCharts && trends.length > 0) {
    setTimeout(createCharts, 100);
  }

  function handleExportCSV() {
    const data = trends.map(t => ({
      Period: t.period,
      'Total Events': t.event_count,
      Modifications: t.modifications,
      Creations: t.creations,
      Deletions: t.deletions,
      'Unique Files': t.unique_files
    }));
    exportCSV(data, 'historical-trends');
  }

  function handleExportJSON() {
    const data = {
      period,
      days,
      trends,
      exported_at: new Date().toISOString()
    };
    exportJSON(data, 'historical-trends');
  }
</script>

<div class="historical-trends-panel" role="region" aria-label="Historical trends panel">
  <div class="panel-header">
    <div class="header-left">
      <h2 id="trends-heading"><span aria-hidden="true">📊</span> Historical Trends</h2>
      <p class="subtitle">Activity patterns over time</p>
    </div>
    <div class="header-right" role="toolbar" aria-label="Historical trends actions">
      <span class="last-update" role="status" aria-live="polite">Updated: {timeSinceUpdate}</span>
      <button class="btn-secondary" on:click={handleExportCSV} aria-label="Export trends data as CSV">Export CSV</button>
      <button class="btn-secondary" on:click={handleExportJSON} aria-label="Export trends data as JSON">Export JSON</button>
      <button class="btn-primary" on:click={loadTrends} aria-label="Refresh trends data"><span aria-hidden="true">↻</span> Refresh</button>
    </div>
  </div>

  <div class="controls">
    <div class="control-group">
      <label for="period-select">Period:</label>
      <select id="period-select" bind:value={period} on:change={() => handlePeriodChange(period)} aria-label="Select time period granularity">
        <option value="hourly">Hourly</option>
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
      </select>
    </div>
    <div class="control-group">
      <label for="days-select">Last:</label>
      <select id="days-select" bind:value={days} on:change={() => handleDaysChange(days)} aria-label="Select time range">
        <option value="1">24 hours</option>
        <option value="7">7 days</option>
        <option value="14">14 days</option>
        <option value="30">30 days</option>
        <option value="90">90 days</option>
      </select>
    </div>
  </div>

  {#if loading}
    <LoadingSkeleton />
  {:else if error}
    <div class="error-state" role="alert">
      <p><span aria-hidden="true">❌</span> Error loading trends: {error}</p>
      <button on:click={loadTrends} aria-label="Retry loading trends">Try Again</button>
    </div>
  {:else if trends.length === 0}
    <div class="empty-state" role="status">
      <p><span aria-hidden="true">📭</span> No activity data for the selected period</p>
      <p class="hint">Try selecting a longer time range</p>
    </div>
  {:else}
    <!-- Charts Section -->
    <div class="charts-section">
      <div class="charts-header">
        <h3>Analytics Visualizations</h3>
        <button
          class="toggle-charts"
          on:click={() => showCharts = !showCharts}
          aria-label="{showCharts ? 'Hide' : 'Show'} charts"
          aria-expanded={showCharts}
        >
          {showCharts ? 'Hide Charts' : 'Show Charts'}
        </button>
      </div>

      {#if showCharts}
        <div class="charts-grid">
          <div class="chart-wrapper">
            <div role="img" aria-label={trendsOverTimeAriaLabel} style="height: 250px;">
              <canvas id="chart-trends-over-time"></canvas>
            </div>
          </div>
          <div class="chart-wrapper">
            <div role="img" aria-label={periodComparisonAriaLabel} style="height: 250px;">
              <canvas id="chart-period-comparison"></canvas>
            </div>
          </div>
        </div>
      {/if}
    </div>

    <div class="stats-grid" role="list" aria-label="Trends summary statistics">
      <article class="stat-card" role="listitem">
        <div class="stat-value" role="status">{trends.reduce((sum, t) => sum + t.event_count, 0).toLocaleString()}</div>
        <div class="stat-label">Total Events</div>
      </article>
      <article class="stat-card" role="listitem">
        <div class="stat-value" role="status">{trends.reduce((sum, t) => sum + t.modifications, 0).toLocaleString()}</div>
        <div class="stat-label">Modifications</div>
      </article>
      <article class="stat-card" role="listitem">
        <div class="stat-value" role="status">{trends.reduce((sum, t) => sum + t.creations, 0).toLocaleString()}</div>
        <div class="stat-label">Creations</div>
      </article>
      <article class="stat-card" role="listitem">
        <div class="stat-value" role="status">{trends.reduce((sum, t) => sum + t.deletions, 0).toLocaleString()}</div>
        <div class="stat-label">Deletions</div>
      </article>
    </div>

    <div class="legend" aria-hidden="true">
      <div class="legend-item">
        <div class="legend-color bar-created"></div>
        <span>Created</span>
      </div>
      <div class="legend-item">
        <div class="legend-color bar-modified"></div>
        <span>Modified</span>
      </div>
      <div class="legend-item">
        <div class="legend-color bar-deleted"></div>
        <span>Deleted</span>
      </div>
    </div>
  {/if}
</div>

<style>
  .historical-trends-panel {
    padding: 8px;
    max-width: 1400px;
    margin: 0 auto;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 8px;
  }

  .header-left h2 {
    margin: 0 0 4px 0;
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
    gap: 12px;
    align-items: center;
  }

  .last-update {
    font-size: 12px;
    color: var(--muted);
  }

  .controls {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
    padding: 16px;
    background: var(--surface);
    border-radius: var(--radius);
    border: 1px solid var(--border);
  }

  .control-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .control-group label {
    font-size: 11px;
    color: var(--muted);
    font-weight: 500;
  }

  .control-group select {
    padding: 6px 12px;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font-family: var(--mono);
    font-size: 13px;
    cursor: pointer;
  }

  .control-group select:hover {
    border-color: var(--accent);
  }

  .control-group select:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  /* Charts Section */
  .charts-section {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px;
    margin-bottom: 8px;
  }

  .charts-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .charts-header h3 {
    margin: 0;
    font-size: 11px;
    color: var(--text);
    font-weight: 700;
  }

  .toggle-charts {
    padding: 6px 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text);
    font-size: 11px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .toggle-charts:hover {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .toggle-charts:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .charts-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }

  .chart-wrapper {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 8px;
    margin-bottom: 8px;
  }

  .stat-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 8px;
    text-align: center;
  }

  .stat-value {
    font-size: 11px;
    font-weight: 700;
    color: var(--accent);
    font-family: var(--mono);
    margin-bottom: 8px;
  }

  .stat-label {
    font-size: 13px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .legend {
    display: flex;
    justify-content: center;
    gap: 8px;
    padding: 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--text);
  }

  .legend-color {
    width: 16px;
    height: 16px;
    border-radius: 3px;
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
    transform: translateY(-1px);
  }

  .btn-secondary {
    background: var(--surface);
    color: var(--text);
  }

  .btn-secondary:hover {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .btn-primary:focus,
  .btn-secondary:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .empty-state, .error-state {
    text-align: center;
    padding: 8px 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .empty-state p, .error-state p {
    margin: 8px 0;
    color: var(--muted);
  }

  .hint {
    font-size: 13px;
    color: var(--muted-2);
  }

  @media (max-width: 768px) {
    .panel-header {
      flex-direction: column;
      gap: 8px;
    }

    .header-right {
      flex-wrap: wrap;
    }

    .controls {
      flex-direction: column;
    }

    .charts-grid {
      grid-template-columns: 1fr;
    }

    .chart-wrapper {
      padding: 8px;
    }

    .stats-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
