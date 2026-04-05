<script>
  import { onMount } from 'svelte';
  import { logger } from '../logger.js';
  import { api } from '../apiClient.js';
  /**
   * Historical Trends Page
   * Time-series analysis of activity patterns
   */

  import { websocketService } from '../services/websocket.js';
  import {
    createChart,
    destroyChart,
    createThemeObserver,
    getChartColors
  } from '../utils/chartUtils.js';

  // State
  let trends = $state([]);
  let loading = $state(true);
  let error = $state(null);
  let period = $state('daily'); // hourly, daily, weekly
  let days = $state(7);
  let lastUpdate = $state(new Date());
  let showCharts = $state(true);

  // Chart instances
  let charts = $state({});

  // Derived calculations

  const totalEvents = $derived(trends.reduce((sum, t) => sum + (t.event_count || 0), 0));
  const totalModifications = $derived(trends.reduce((sum, t) => sum + (t.modifications || 0), 0));
  const totalCreations = $derived(trends.reduce((sum, t) => sum + (t.creations || 0), 0));
  const totalDeletions = $derived(trends.reduce((sum, t) => sum + (t.deletions || 0), 0));
  const totalUniqueFiles = $derived(Math.max(...trends.map(t => t.unique_files || 0), 0));

  const timeSinceUpdate = $derived.by(() => {
    const seconds = Math.floor((new Date().getTime() - lastUpdate.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  });

  // Accessibility labels for charts
  const trendsOverTimeAriaLabel = $derived.by(() => {
    if (trends.length === 0) return 'Trends over time chart: No data available';
    return `Trends over time chart showing ${totalEvents} total events across ${trends.length} ${period} periods`;
  });

  const periodComparisonAriaLabel = $derived.by(() => {
    if (trends.length === 0) return 'Period comparison chart: No data available';
    return `Period comparison chart showing event breakdown (created, modified, deleted) for ${trends.length} periods`;
  });

  async function loadTrends() {
    try {
      if (trends.length === 0) loading = true;
      error = null;
      const data = await api.get(`/trends/historical?period=${period}&days=${days}`);
      trends = data.trends || [];
      lastUpdate = new Date();
    } catch (err) {
      logger.error('Failed to load trends:', err);
      error = err.message;
    } finally {
      loading = false;
    }
  }

  function handlePeriodChange(event) {
    period = event.target.value;
    loadTrends();
  }

  function handleDaysChange(event) {
    days = parseInt(event.target.value, 10);
    loadTrends();
  }

  function formatPeriod(periodStr) {
    if (period === 'hourly' || period === 'daily') {
      // Parse and format date
      const date = new Date(periodStr);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    // Weekly format
    return periodStr;
  }

  function exportToCSV() {
    const headers = [
      'Period',
      'Total Events',
      'Modifications',
      'Creations',
      'Deletions',
      'Unique Files'
    ];
    const rows = trends.map(t => [
      t.period,
      t.event_count || 0,
      t.modifications || 0,
      t.creations || 0,
      t.deletions || 0,
      t.unique_files || 0
    ]);

    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `historical-trends-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportToJSON() {
    const data = {
      period,
      days,
      trends,
      exported_at: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `historical-trends-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Create Chart.js visualizations
  function createCharts() {
    // Destroy existing charts
    Object.values(charts).forEach(chart => destroyChart(chart));
    charts = {};

    if (!showCharts || trends.length === 0) return;

    // Get theme-aware colors
    const colors = getChartColors();
    const gridColor = 'rgba(128, 128, 128, 0.15)';

    // 1. Line Chart: Trends over time (total events)
    const labels = trends.map(t => formatPeriod(t.period));
    const eventCounts = trends.map(t => t.event_count || 0);

    charts.trendsOverTime = createChart('chart-trends-over-time', {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Total Events',
            data: eventCounts,
            borderColor: colors.primary,
            backgroundColor: `${colors.primary}1A`, // Add transparency
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointHoverRadius: 6
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
          title: {
            display: true,
            text: 'Trends Over Time',
            color: colors.text,
            font: { size: 12, weight: 'bold', family: 'monospace' }
          },
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            titleColor: colors.text,
            bodyColor: colors.text,
            borderColor: gridColor,
            borderWidth: 1
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              color: colors.muted,
              font: { size: 10, family: 'monospace' }
            },
            grid: {
              color: gridColor
            }
          },
          x: {
            ticks: {
              color: colors.muted,
              font: { size: 9, family: 'monospace' },
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

    // 2. Stacked Bar Chart: Period-over-period comparison
    const createdData = trends.map(t => t.creations || 0);
    const modifiedData = trends.map(t => t.modifications || 0);
    const deletedData = trends.map(t => t.deletions || 0);

    charts.periodComparison = createChart('chart-period-comparison', {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Created',
            data: createdData,
            backgroundColor: colors.success,
            borderColor: colors.success,
            borderWidth: 1
          },
          {
            label: 'Modified',
            data: modifiedData,
            backgroundColor: colors.primary,
            borderColor: colors.primary,
            borderWidth: 1
          },
          {
            label: 'Deleted',
            data: deletedData,
            backgroundColor: colors.error,
            borderColor: colors.error,
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
              color: colors.text,
              font: { size: 11, family: 'monospace' },
              padding: 8
            }
          },
          title: {
            display: true,
            text: 'Period-over-Period Comparison',
            color: colors.text,
            font: { size: 12, weight: 'bold', family: 'monospace' }
          },
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            titleColor: colors.text,
            bodyColor: colors.text,
            borderColor: gridColor,
            borderWidth: 1
          }
        },
        scales: {
          x: {
            stacked: true,
            ticks: {
              color: colors.muted,
              font: { size: 9, family: 'monospace' },
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
              color: colors.muted,
              font: { size: 10, family: 'monospace' }
            },
            grid: {
              color: gridColor
            }
          }
        }
      }
    });
  }

  // Initialize on mount - WebSocket and theme observer
  onMount(() => {
    // Load initial data
    loadTrends();

    // WebSocket event handlers
    const handleProjectSwitched = async () => {
      await loadTrends();
    };

    // Connect to WebSocket
    websocketService.connect();
    websocketService.on('project-switched', handleProjectSwitched);

    // Create theme observer
    const themeObserver = createThemeObserver(() => {
      logger.debug('[HistoricalTrends] Theme changed, recreating charts');
      setTimeout(createCharts, 100);
    });

    // Cleanup function
    return () => {
      // Clean up WebSocket listeners
      websocketService.off('project-switched', handleProjectSwitched);

      // Disconnect theme observer
      if (themeObserver) {
        themeObserver.disconnect();
      }

      // Destroy all charts
      Object.values(charts).forEach(chart => destroyChart(chart));
    };
  });

  // Reload trends when period or days changes (skip initial mount - onMount handles that)
  let mounted = false;
  $effect(() => {
    const currentPeriod = period;
    const currentDays = days;
    if (mounted) {
      loadTrends();
    }
    mounted = true;
  });

  // Recreate charts when trends data or showCharts toggle changes
  $effect(() => {
    const shouldShowCharts = showCharts;
    const trendsLength = trends.length;
    if (shouldShowCharts && trendsLength > 0) {
      setTimeout(createCharts, 100);
    }
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-6xl mx-auto">
    <!-- Header -->
    <div class="flex justify-between items-start mb-6 flex-wrap gap-4">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">Historical Trends</h1>
        <p class="text-sm text-[var(--muted)] font-sans">Activity patterns over time</p>
      </div>
      <div class="flex items-center gap-3 flex-wrap">
        <span class="text-xs text-[var(--muted)] font-mono">{timeSinceUpdate}</span>
        <button
          onclick={exportToCSV}
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors"
        >
          Export CSV
        </button>
        <button
          onclick={exportToJSON}
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors"
        >
          Export JSON
        </button>
        <button
          onclick={loadTrends}
          disabled={loading}
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors disabled:opacity-50"
        >
          {loading ? '' : '↻'} Refresh
        </button>
      </div>
    </div>

    <!-- Filters -->
    <div
      class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 mb-6 flex gap-6 flex-wrap"
    >
      <div class="flex items-center gap-3">
        <label for="period-select" class="text-sm text-[var(--muted)]">Period</label>
        <select
          id="period-select"
          value={period}
          onchange={handlePeriodChange}
          class="px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-mono text-[var(--text)] hover:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
        >
          <option value="hourly">Hourly</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </select>
      </div>
      <div class="flex items-center gap-3">
        <label for="days-select" class="text-sm text-[var(--muted)]">Last</label>
        <select
          id="days-select"
          value={days}
          onchange={handleDaysChange}
          class="px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-mono text-[var(--text)] hover:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
        >
          <option value="1">24 hours</option>
          <option value="7">7 days</option>
          <option value="14">14 days</option>
          <option value="30">30 days</option>
          <option value="90">90 days</option>
        </select>
      </div>
    </div>

    {#if loading}
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {#each Array(4) as _, i (i)}
          <div
            class="h-24 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-pulse"
          ></div>
        {/each}
      </div>
    {:else if error}
      <div
        class="bg-[var(--error-subtle)] border border-[var(--error)] rounded-lg p-4 flex justify-between items-center"
      >
        <span class="text-sm text-[var(--error)] font-sans">Error loading trends: {error}</span>
        <button
          onclick={loadTrends}
          class="px-3 py-1.5 bg-[var(--error)] text-white rounded text-sm font-sans"
        >
          Try Again
        </button>
      </div>
    {:else if trends.length === 0}
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-8 text-center">
        <p class="text-sm text-[var(--muted)] font-sans mb-2">
          No activity data for the selected period
        </p>
        <p class="text-sm text-[var(--muted)] font-sans">Try selecting a longer time range</p>
      </div>
    {:else}
      <!-- Summary Stats -->
      <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
          <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
            Total Events
          </div>
          <div class="text-sm font-mono text-[var(--text)]">
            {totalEvents.toLocaleString()}
          </div>
        </div>
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
          <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
            Modifications
          </div>
          <div class="text-sm font-mono text-[var(--text)]">
            {totalModifications.toLocaleString()}
          </div>
        </div>
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
          <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
            Creations
          </div>
          <div class="text-sm font-mono text-[var(--text)]">
            {totalCreations.toLocaleString()}
          </div>
        </div>
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
          <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
            Deletions
          </div>
          <div class="text-sm font-mono text-[var(--text)]">
            {totalDeletions.toLocaleString()}
          </div>
        </div>
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
          <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
            Unique Files
          </div>
          <div class="text-sm font-mono text-[var(--text)]">
            {totalUniqueFiles.toLocaleString()}
          </div>
        </div>
      </div>

      <!-- Visualizations Section -->
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 mb-6">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">
            Analytics Visualizations
          </h2>
          <button
            onclick={() => (showCharts = !showCharts)}
            class="px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors"
          >
            {showCharts ? 'Hide Charts' : 'Show Charts'}
          </button>
        </div>

        {#if showCharts}
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- Trends Over Time Chart -->
            <div class="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-4">
              <div role="img" aria-label={trendsOverTimeAriaLabel} style="height: 250px;">
                <canvas id="chart-trends-over-time"></canvas>
              </div>
            </div>

            <!-- Period Comparison Chart -->
            <div class="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-4">
              <div role="img" aria-label={periodComparisonAriaLabel} style="height: 250px;">
                <canvas id="chart-period-comparison"></canvas>
              </div>
            </div>
          </div>
        {/if}
      </div>

      <!-- Data Table -->
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
        <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-4">
          Period Breakdown
        </h3>
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="bg-[var(--bg)] border-b border-[var(--border)]">
              <tr class="text-left">
                <th
                  class="px-3 py-2 text-xs font-semibold text-[var(--muted)] uppercase tracking-wide"
                  >Period</th
                >
                <th
                  class="px-3 py-2 text-xs font-semibold text-[var(--muted)] uppercase tracking-wide text-right"
                  >Events</th
                >
                <th
                  class="px-3 py-2 text-xs font-semibold text-[var(--muted)] uppercase tracking-wide text-right"
                  >Modified</th
                >
                <th
                  class="px-3 py-2 text-xs font-semibold text-[var(--muted)] uppercase tracking-wide text-right"
                  >Created</th
                >
                <th
                  class="px-3 py-2 text-xs font-semibold text-[var(--muted)] uppercase tracking-wide text-right"
                  >Deleted</th
                >
                <th
                  class="px-3 py-2 text-xs font-semibold text-[var(--muted)] uppercase tracking-wide text-right"
                  >Files</th
                >
              </tr>
            </thead>
            <tbody>
              {#each trends as t (t.period)}
                <tr class="border-b border-[var(--border)] hover:bg-[var(--bg)] transition-colors">
                  <td class="px-3 py-2 text-sm font-mono text-[var(--text)]"
                    >{formatPeriod(t.period)}</td
                  >
                  <td class="px-3 py-2 text-sm font-mono text-[var(--text)] text-right"
                    >{(t.event_count || 0).toLocaleString()}</td
                  >
                  <td class="px-3 py-2 text-sm font-mono text-[var(--text)] text-right"
                    >{(t.modifications || 0).toLocaleString()}</td
                  >
                  <td class="px-3 py-2 text-sm font-mono text-[var(--text)] text-right"
                    >{(t.creations || 0).toLocaleString()}</td
                  >
                  <td class="px-3 py-2 text-sm font-mono text-[var(--text)] text-right"
                    >{(t.deletions || 0).toLocaleString()}</td
                  >
                  <td class="px-3 py-2 text-sm font-mono text-[var(--text)] text-right"
                    >{(t.unique_files || 0).toLocaleString()}</td
                  >
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/if}
  </div>
</div>
