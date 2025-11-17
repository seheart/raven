<script>
  import { logger } from '../logger.js';
  /**
   * System Errors Page - Complete error log and tracking with charts, filtering, and real-time updates
   * Rebuilt from Svelte 4 to Svelte 5 + Tailwind CSS
   */
  import { onMount, onDestroy, tick } from 'svelte';
  import { api } from '../apiClient.js';
  import { websocketService } from '../services/websocket.js';
  import { formatDateTime, getTimeAgo } from '../timeFormat.js';
  import { debounce } from '../utils/helpers.js';
  import VirtualScroll from '../VirtualScroll.svelte';
  import { Chart, registerables } from 'chart.js';

  Chart.register(...registerables);

  // State
  let errors = $state([]);
  let stats = $state({
    total: 0,
    by_severity: [],
    recent_count: 0
  });
  let loading = $state(true);
  let error = $state(null);
  let searchQuery = $state('');
  let severityFilter = $state('all');
  let selectedError = $state(null);
  let lastUpdated = $state(null);
  let isManualRefresh = $state(false);
  let showCharts = $state(false);
  let virtualScroll = $state(null);

  // Pagination
  let currentPage = $state(0);
  let pageSize = $state(50);
  let totalErrors = $state(0);
  let hasMore = $state(false);

  // Severity stats breakdown
  let severityStats = $state({
    error: 0,
    warning: 0,
    info: 0
  });

  // Charts
  let charts = {};
  let themeObserver;

  // Debounce timeout
  let searchDebounceTimeout;

  onMount(async () => {
    await loadErrors();
    await loadStats();

    // Connect to WebSocket for real-time updates
    websocketService.connect();
    websocketService.on('error-logged', handleErrorLogged);

    // Setup theme observer for charts
    setupThemeObserver();
  });

  onDestroy(() => {
    // Destroy charts
    Object.values(charts).forEach(chart => chart?.destroy());

    // Disconnect theme observer
    themeObserver?.disconnect();

    // Remove WebSocket event listeners
    websocketService.off('error-logged', handleErrorLogged);

    // Clear debounce timeout
    if (searchDebounceTimeout) {
      clearTimeout(searchDebounceTimeout);
    }
  });

  // Debounced stats loader to prevent excessive updates
  const debouncedLoadStats = debounce(() => {
    loadStats();
  }, 300);

  // Handle error-logged WebSocket event
  function handleErrorLogged(errorData) {
    // Prepend new error to the list
    errors = [errorData, ...errors];
    // Debounce stats loading to handle rapid error bursts
    debouncedLoadStats();
  }

  async function loadErrors(manual = false) {
    try {
      loading = true;
      isManualRefresh = manual;
      error = null;

      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: (currentPage * pageSize).toString()
      });

      if (searchQuery) {
        params.append('search', searchQuery);
      }

      if (severityFilter !== 'all') {
        params.append('severity', severityFilter);
      }

      const data = await api.get(`/errors?${params}`);

      // CORRECT: api.get() already returns parsed JSON
      errors = data.errors || data;
      totalErrors = data.total || errors.length;
      hasMore = data.hasMore || false;
      lastUpdated = new Date();
    } catch (err) {
      error = err.message;
      logger.error('Failed to load errors:', err);
    } finally {
      loading = false;
      isManualRefresh = false;
    }
  }

  async function loadStats() {
    try {
      const data = await api.get('/errors/stats');

      // CORRECT: api.get() already returns parsed JSON
      stats = data;

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
    } catch (err) {
      logger.error('Failed to load error stats:', err);
    }
  }

  // Debounced search handler
  function handleSearchInput(event) {
    searchQuery = event.target.value;

    if (searchDebounceTimeout) {
      clearTimeout(searchDebounceTimeout);
    }

    searchDebounceTimeout = setTimeout(async () => {
      currentPage = 0;
      await loadErrors();

      // Reset scroll position when searching
      if (virtualScroll) {
        virtualScroll.scrollToItem(0);
      }
    }, 300);
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
      const result = await api.delete('/errors/clear');
      alert(result.message || 'All errors cleared');
      await loadErrors();
      await loadStats();
    } catch (err) {
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
      const result = await api.delete(`/errors/clear-old?days=${parsedDays}`);
      alert(result.message || `Errors older than ${parsedDays} days cleared`);
      await loadErrors();
      await loadStats();
    } catch (err) {
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
        return '❌';
      case 'warning':
        return '⚠️';
      case 'info':
        return 'ℹ️';
      default:
        return '📝';
    }
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
      await api.post('/errors/test', {
        test: true,
        user_action: 'test_button_click',
        message: 'This is a test error from SystemErrorsPage'
      });

      // Reload after a short delay to let the backend process it
      setTimeout(() => {
        loadErrors();
        loadStats();
      }, 200);
    } catch (err) {
      alert('Failed to log test error: ' + error.message);
    }
  }

  async function exportLog() {
    try {
      const result = await api.get('/errors?limit=10000');
      const errorsToExport = result.errors || result;
      const json = JSON.stringify(errorsToExport, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `raven-error-log-${Date.now()}.json`;
      a.click();

      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Export failed: ' + error.message);
    }
  }

  // Chart Functions
  function getChartThemeColors() {
    const styles = getComputedStyle(document.documentElement);
    return {
      text: styles.getPropertyValue('--text').trim(),
      muted: styles.getPropertyValue('--muted').trim(),
      accent: styles.getPropertyValue('--accent').trim(),
      error: styles.getPropertyValue('--error').trim(),
      warning: styles.getPropertyValue('--warning').trim(),
      info: styles.getPropertyValue('--info').trim(),
      grid: `${styles.getPropertyValue('--border').trim()}80`,
      border: styles.getPropertyValue('--border').trim()
    };
  }

  function setupThemeObserver() {
    // Watch for theme changes and recreate charts
    themeObserver = new MutationObserver(() => {
      if (showCharts) {
        createCharts();
      }
    });

    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class']
    });
  }

  async function createCharts() {
    // Wait for DOM to be ready
    await tick();

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
                font: { size: 11, family: 'monospace' },
                padding: 8
              }
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
                color: colors.grid
              }
            },
            x: {
              ticks: {
                color: colors.muted,
                font: { size: 10, family: 'monospace' }
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
                font: { size: 11, family: 'monospace' },
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
                font: { size: 10, family: 'monospace' }
              },
              grid: {
                color: colors.grid
              }
            },
            x: {
              ticks: {
                color: colors.muted,
                font: { size: 10, family: 'monospace' },
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

  // Reactive time ago
  const timeAgo = $derived(getTimeAgo(lastUpdated));

  // Update charts when showCharts or data changes
  $effect(() => {
    if (showCharts && errors.length > 0) {
      setTimeout(createCharts, 100);
    }
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-7xl mx-auto">
    <!-- Header -->
    <div class="flex justify-between items-start mb-6 pb-6 border-b-2 border-[var(--border)]">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">
          <span aria-hidden="true">⚠️</span> Error Log
        </h1>
        <p class="text-base text-[var(--muted)] font-sans">Application errors and warnings</p>
      </div>
      <div class="flex items-center gap-3 flex-wrap justify-end">
        <span class="text-sm text-[var(--muted)] font-mono" role="status" aria-live="polite">
          Updated: {timeAgo}
        </span>
        <button
          class="px-3 py-2 bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] text-sm font-medium rounded-lg hover:bg-[var(--surface-2)] hover:border-[var(--accent)] transition-all"
          onclick={() => (showCharts = !showCharts)}
          aria-label="Toggle charts visibility"
        >
          <span aria-hidden="true">📊</span>
          {showCharts ? 'Hide' : 'Show'} Charts
        </button>
        <button
          class="px-3 py-2 bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] text-sm font-medium rounded-lg hover:bg-[var(--surface-2)] hover:border-[var(--accent)] transition-all"
          onclick={triggerTestError}
          aria-label="Trigger test error"
        >
          <span aria-hidden="true">🧪</span> Test Error
        </button>
        <button
          class="px-3 py-2 bg-[var(--accent)] text-white text-sm font-medium rounded-lg hover:opacity-90 transition-all"
          onclick={exportLog}
          aria-label="Export error log to JSON file"
        >
          <span aria-hidden="true">💾</span> Export JSON
        </button>
        <button
          class="px-3 py-2 bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] text-sm font-medium rounded-lg hover:bg-[var(--surface-2)] hover:border-[var(--accent)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          onclick={() => {
            currentPage = 0;
            loadErrors(true);
            loadStats();
          }}
          disabled={loading}
          aria-label="Refresh error log"
        >
          <span class:animate-spin={isManualRefresh} aria-hidden="true">🔄</span>
          Refresh
        </button>
      </div>
    </div>

    <!-- Stats Bar -->
    <div class="grid grid-cols-5 gap-4 mb-6" role="region" aria-label="Error statistics">
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
        <div class="text-xs text-[var(--muted)] font-semibold uppercase mb-2">Total</div>
        <div class="text-2xl text-[var(--text)] font-mono font-bold">{stats.total}</div>
      </div>
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
        <div class="text-xs text-[var(--muted)] font-semibold uppercase mb-2">Last Hour</div>
        <div class="text-2xl text-[var(--text)] font-mono font-bold">{stats.recent_count}</div>
      </div>
      <div
        class="bg-[var(--surface)] border border-[var(--border)] border-l-[3px] border-l-[var(--error)] rounded-lg p-4"
      >
        <div class="text-xs text-[var(--muted)] font-semibold uppercase mb-2">Errors</div>
        <div class="text-2xl text-[var(--text)] font-mono font-bold">{severityStats.error}</div>
      </div>
      <div
        class="bg-[var(--surface)] border border-[var(--border)] border-l-[3px] border-l-[var(--warning)] rounded-lg p-4"
      >
        <div class="text-xs text-[var(--muted)] font-semibold uppercase mb-2">Warnings</div>
        <div class="text-2xl text-[var(--text)] font-mono font-bold">{severityStats.warning}</div>
      </div>
      <div
        class="bg-[var(--surface)] border border-[var(--border)] border-l-[3px] border-l-[var(--info)] rounded-lg p-4"
      >
        <div class="text-xs text-[var(--muted)] font-semibold uppercase mb-2">Info</div>
        <div class="text-2xl text-[var(--text)] font-mono font-bold">{severityStats.info}</div>
      </div>
    </div>

    <!-- Charts Section -->
    {#if showCharts && errors.length > 0}
      <div class="mb-6" role="region" aria-label="Error charts">
        <div class="grid grid-cols-2 gap-4">
          <div
            class="col-span-2 bg-[var(--surface)] border border-[var(--border)] border-l-[3px] border-l-[var(--accent)] rounded-lg p-4"
          >
            <h3 class="text-sm font-semibold text-[var(--text)] uppercase tracking-wide mb-4">
              Error Rate Over Time (Last 24 Hours)
            </h3>
            <div class="relative h-64">
              <canvas id="chart-error-rate-time"></canvas>
            </div>
          </div>

          <div
            class="bg-[var(--surface)] border border-[var(--border)] border-l-[3px] border-l-[var(--accent)] rounded-lg p-4"
          >
            <h3 class="text-sm font-semibold text-[var(--text)] uppercase tracking-wide mb-4">
              Errors by Severity
            </h3>
            <div class="relative h-64">
              <canvas id="chart-errors-by-severity"></canvas>
            </div>
          </div>

          <div
            class="bg-[var(--surface)] border border-[var(--border)] border-l-[3px] border-l-[var(--accent)] rounded-lg p-4"
          >
            <h3 class="text-sm font-semibold text-[var(--text)] uppercase tracking-wide mb-4">
              Most Common Error Types
            </h3>
            <div class="relative h-64">
              <canvas id="chart-error-types"></canvas>
            </div>
          </div>
        </div>
      </div>
    {/if}

    <!-- Search and Filters -->
    <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6 mb-6">
      <div class="mb-4">
        <input
          type="text"
          placeholder="Search errors..."
          value={searchQuery}
          oninput={handleSearchInput}
          class="w-full px-4 py-3 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-[var(--text)] text-sm font-mono focus:outline-none focus:border-[var(--accent)]"
        />
      </div>

      <div class="flex gap-3 mb-4 flex-wrap">
        <button
          class="px-4 py-2 text-sm font-medium rounded-lg transition-all {severityFilter === 'all'
            ? 'bg-[var(--accent)] text-white border border-[var(--accent)]'
            : 'bg-[var(--bg)] text-[var(--text)] border border-[var(--border)] hover:bg-[var(--surface-2)] hover:border-[var(--accent)]'}"
          onclick={() => handleSeverityFilter('all')}
        >
          All ({stats.total})
        </button>
        <button
          class="px-4 py-2 text-sm font-medium rounded-lg transition-all {severityFilter === 'error'
            ? 'bg-[var(--accent)] text-white border border-[var(--accent)]'
            : 'bg-[var(--bg)] text-[var(--text)] border border-[var(--border)] hover:bg-[var(--surface-2)] hover:border-[var(--accent)]'}"
          onclick={() => handleSeverityFilter('error')}
        >
          ❌ Errors ({severityStats.error})
        </button>
        <button
          class="px-4 py-2 text-sm font-medium rounded-lg transition-all {severityFilter ===
          'warning'
            ? 'bg-[var(--accent)] text-white border border-[var(--accent)]'
            : 'bg-[var(--bg)] text-[var(--text)] border border-[var(--border)] hover:bg-[var(--surface-2)] hover:border-[var(--accent)]'}"
          onclick={() => handleSeverityFilter('warning')}
        >
          ⚠️ Warnings ({severityStats.warning})
        </button>
        <button
          class="px-4 py-2 text-sm font-medium rounded-lg transition-all {severityFilter === 'info'
            ? 'bg-[var(--accent)] text-white border border-[var(--accent)]'
            : 'bg-[var(--bg)] text-[var(--text)] border border-[var(--border)] hover:bg-[var(--surface-2)] hover:border-[var(--accent)]'}"
          onclick={() => handleSeverityFilter('info')}
        >
          ℹ️ Info ({severityStats.info})
        </button>
      </div>

      <div class="flex gap-3">
        <button
          class="px-4 py-2 bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] text-sm font-medium rounded-lg hover:bg-[var(--surface-2)] hover:border-[var(--accent)] transition-all"
          onclick={handleClearOld}
        >
          🗑️ Clear Old
        </button>
        <button
          class="px-4 py-2 bg-[var(--error)] text-white text-sm font-medium rounded-lg hover:opacity-90 transition-all"
          onclick={handleClearAll}
        >
          🗑️ Clear All
        </button>
      </div>
    </div>

    <!-- Error Timeline -->
    <div>
      {#if loading && errors.length === 0}
        <div class="space-y-4">
          {#each Array(8) as _, i (i)}
            <div
              class="h-24 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-pulse"
            ></div>
          {/each}
        </div>
      {:else if error}
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center">
          <div class="text-4xl mb-4">❌</div>
          <h2 class="text-xl font-bold text-[var(--text)] mb-2">Failed to Load Errors</h2>
          <p class="text-[var(--muted)]">{error}</p>
        </div>
      {:else if errors.length === 0}
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center">
          <div class="text-4xl mb-4">✅</div>
          <h2 class="text-xl font-bold text-[var(--text)] mb-2">No Errors Found</h2>
          <p class="text-[var(--muted)]">Your application is running smoothly!</p>
        </div>
      {:else}
        <VirtualScroll
          bind:this={virtualScroll}
          items={errors}
          itemHeight={100}
          containerHeight={500}
          overscan={3}
          getKey={err => err.id}
          let:item
        >
          <div
            class="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden transition-all hover:border-[var(--accent)] hover:shadow-lg {selectedError?.id ===
            item.id
              ? 'border-[var(--accent)]'
              : ''}"
          >
            <button
              class="w-full text-left p-4 flex justify-between items-center cursor-pointer focus:outline-2 focus:outline-[var(--accent)] focus:outline-offset-2"
              onclick={() => toggleError(item)}
              onkeydown={e => e.key === 'Enter' && toggleError(item)}
              aria-expanded={selectedError?.id === item.id}
              aria-label="Toggle error details for {item.message}"
              tabindex="0"
            >
              <div class="flex items-center gap-3 flex-1 min-w-0">
                <span class="text-sm text-[var(--muted)]"
                  >{selectedError?.id === item.id ? '▼' : '▶'}</span
                >
                <span class="text-lg" style="color: {getSeverityColor(item.severity)}">
                  {getSeverityIcon(item.severity)}
                </span>
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-semibold text-[var(--text)] mb-1 truncate">
                    {item.message}
                  </div>
                  <div class="flex items-center gap-3 text-xs text-[var(--muted)]">
                    <span class="font-mono">{item.error_type || 'Unknown'}</span>
                    <span>•</span>
                    <span class="font-mono">{item.component || 'Unknown'}</span>
                    <span>•</span>
                    <span class="font-mono">{formatRelativeTime(item.timestamp)}</span>
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-3 flex-shrink-0">
                <span class="text-xs text-[var(--muted)] font-mono"
                  >{formatDateTime(item.timestamp)}</span
                >
                <span
                  class="px-3 py-1 bg-[var(--bg)] border text-xs font-bold uppercase rounded"
                  style="border-color: {getSeverityColor(item.severity)}; color: {getSeverityColor(
                    item.severity
                  )}"
                >
                  {item.severity}
                </span>
              </div>
            </button>

            {#if selectedError?.id === item.id}
              <div class="px-4 pb-4 border-t border-[var(--border)]">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
                  <div>
                    <div class="text-xs text-[var(--muted)] font-semibold uppercase mb-1">ID</div>
                    <div class="text-sm text-[var(--text)] font-mono">{item.id}</div>
                  </div>
                  <div>
                    <div class="text-xs text-[var(--muted)] font-semibold uppercase mb-1">Type</div>
                    <div class="text-sm text-[var(--text)] font-mono">{item.error_type}</div>
                  </div>
                  <div>
                    <div class="text-xs text-[var(--muted)] font-semibold uppercase mb-1">
                      Severity
                    </div>
                    <div class="text-sm font-mono" style="color: {getSeverityColor(item.severity)}">
                      {item.severity}
                    </div>
                  </div>
                  <div>
                    <div class="text-xs text-[var(--muted)] font-semibold uppercase mb-1">
                      Component
                    </div>
                    <div class="text-sm text-[var(--text)] font-mono">
                      {item.component || 'Unknown'}
                    </div>
                  </div>
                  <div class="md:col-span-2">
                    <div class="text-xs text-[var(--muted)] font-semibold uppercase mb-1">
                      Timestamp
                    </div>
                    <div class="text-sm text-[var(--text)] font-mono">{item.timestamp}</div>
                  </div>
                  {#if item.url}
                    <div class="md:col-span-2">
                      <div class="text-xs text-[var(--muted)] font-semibold uppercase mb-1">
                        URL
                      </div>
                      <div class="text-sm text-[var(--text)] font-mono break-all">{item.url}</div>
                    </div>
                  {/if}
                </div>

                {#if item.stack}
                  <div class="mt-4">
                    <div class="text-xs text-[var(--muted)] font-semibold uppercase mb-2">
                      Stack Trace
                    </div>
                    <pre
                      class="bg-[var(--bg)] border border-[var(--border)] rounded p-4 text-xs font-mono text-[var(--text)] overflow-x-auto max-h-72 overflow-y-auto">{item.stack}</pre>
                  </div>
                {/if}

                {#if item.metadata}
                  <div class="mt-4">
                    <div class="text-xs text-[var(--muted)] font-semibold uppercase mb-2">
                      Metadata
                    </div>
                    <pre
                      class="bg-[var(--bg)] border border-[var(--border)] rounded p-4 text-xs font-mono text-[var(--text)] overflow-x-auto max-h-72 overflow-y-auto">{JSON.stringify(
                        item.metadata,
                        null,
                        2
                      )}</pre>
                  </div>
                {/if}

                {#if item.user_agent}
                  <div class="mt-4">
                    <div class="text-xs text-[var(--muted)] font-semibold uppercase mb-2">
                      User Agent
                    </div>
                    <pre
                      class="bg-[var(--bg)] border border-[var(--border)] rounded p-4 text-xs font-mono text-[var(--text)] overflow-x-auto">{item.user_agent}</pre>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        </VirtualScroll>

        <!-- Pagination -->
        <div
          class="flex justify-center items-center gap-4 mt-6 p-4 bg-[var(--surface)] border border-[var(--border)] rounded-lg"
        >
          <button
            class="px-4 py-2 bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] text-sm font-medium rounded-lg hover:bg-[var(--surface-2)] hover:border-[var(--accent)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            onclick={prevPage}
            disabled={currentPage === 0}
          >
            ← Previous
          </button>
          <span class="text-sm text-[var(--muted)] font-mono">
            Page {currentPage + 1} • {currentPage * pageSize + 1}-{Math.min(
              (currentPage + 1) * pageSize,
              totalErrors
            )} of {totalErrors}
          </span>
          <button
            class="px-4 py-2 bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] text-sm font-medium rounded-lg hover:bg-[var(--surface-2)] hover:border-[var(--accent)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            onclick={nextPage}
            disabled={!hasMore}
          >
            Next →
          </button>
        </div>
      {/if}
    </div>
  </div>
</div>
