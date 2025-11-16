<script>
  import { logger } from '../logger.js';
  /**
   * Activity Live Feed Page - Real-time activity stream
   * WebSocket-based live event monitoring with Chart.js visualizations
   */

  import { websocketService } from '../services/websocket.js';
  import { api } from '../apiClient.js';
  import { isSourceCodeFile, debounce } from '../utils/helpers.js';
  import {
    createChart,
    destroyChart,
    createThemeObserver,
    getChartColors
  } from '../utils/chartUtils.js';

  // State
  let events = $state([]);
  let isPaused = $state(false);
  let autoScroll = $state(true);
  let filter = $state('all');
  let maxEvents = $state(100);

  let error = $state(null);
  let loading = $state(true);
  let showCharts = $state(true);

  // Statistics
  let stats = $state({ total: 0, created: 0, modified: 0, deleted: 0 });

  // Metrics history for sparklines (last 50 data points)
  let metricsHistory = $state({
    eventsPerMinute: [],
    fileSize: []
  });

  // Charts
  let charts = $state({});
  let themeObserver = $state(null);

  // Debounced timeout reference
  let debouncedTimeoutId;

  // Derived
  const filteredEvents = $derived(
    filter === 'all' ? events : events.filter(e => normalizeChangeType(e.change_type) === filter)
  );

  // Debounced reload function
  const debouncedLoadEvents = debounce(async () => {
    if (!isPaused) {
      await loadRecentEvents();
    }
  }, 300);

  // WebSocket event handlers
  const handleFileChanged = data => {
    if (isPaused) return;
    logger.debug('📡 File change detected:', data);
    debouncedLoadEvents();
  };

  const handleAgentEvent = () => {
    if (isPaused) return;
    debouncedLoadEvents();
  };

  const handleProjectSwitched = data => {
    logger.debug('📡 Project switched, reloading data:', data?.project);
    loadAllData();
  };

  // Normalize change type (map various event types to standard ones)
  function normalizeChangeType(changeType) {
    if (!changeType) return 'modified';
    const type = changeType.toLowerCase();
    if (type === 'add' || type === 'create') return 'created';
    if (type === 'change' || type === 'modify' || type === 'edit') return 'modified';
    if (type === 'unlink' || type === 'delete') return 'deleted';
    return 'modified';
  }

  // Load all data
  async function loadAllData() {
    try {
      loading = true;
      error = null;
      await loadRecentEvents();
      await updateMetrics();
      loading = false;
    } catch (error) {
      logger.error('Failed to load data:', error);
      errorMessage = error.message || 'Failed to load data';
      loading = false;
    }
  }

  // Load recent events from API
  async function loadRecentEvents() {
    try {
      const data = await api.get('/all-file-events?limit=100&diff=true');
      const allEvents = Array.isArray(data) ? data : [];

      // Filter to only show real source code (exclude build artifacts)
      const sourceEvents = allEvents.filter(event => isSourceCodeFile(event.filepath));

      // Process and normalize events
      events = sourceEvents.slice(0, maxEvents).map(event => ({
        id: event.id || `${event.filepath}-${event.timestamp}`,
        timestamp: event.timestamp || new Date().toISOString(),
        filepath: event.filepath || event.file,
        change_type: normalizeChangeType(event.change_type || event.event_type),
        agent: event.agent,
        event_size: event.event_size || 0,
        duration_ms: event.duration_ms,
        project: event.project,
        message: event.message
      }));

      // Update statistics
      stats = {
        total: events.length,
        created: events.filter(e => e.change_type === 'created').length,
        modified: events.filter(e => e.change_type === 'modified').length,
        deleted: events.filter(e => e.change_type === 'deleted').length
      };

      // Auto-scroll to top if enabled
      if (autoScroll && !isPaused) {
        setTimeout(() => {
          const feed = document.getElementById('live-feed');
          if (feed) feed.scrollTop = 0;
        }, 10);
      }
    } catch (error) {
      logger.error('Failed to load events:', error);
      throw error;
    }
  }

  // Update metrics for sparklines
  async function updateMetrics() {
    try {
      // Calculate events per minute over last 20 data points
      const now = Date.now();
      const oneMinuteAgo = now - 60000;
      const recentEvents = events.filter(e => new Date(e.timestamp).getTime() > oneMinuteAgo);
      const eventsPerMin = recentEvents.length;

      // Update metrics history (keep last 50 points)
      metricsHistory.eventsPerMinute = [...metricsHistory.eventsPerMinute, eventsPerMin].slice(-50);

      // Calculate average file size
      const avgSize =
        events.length > 0
          ? events.reduce((sum, e) => sum + (e.event_size || 0), 0) / events.length
          : 0;
      metricsHistory.fileSize = [...metricsHistory.fileSize, avgSize].slice(-50);
    } catch (error) {
      logger.error('Failed to update metrics:', error);
    }
  }

  // Generate sparkline SVG path
  function generateSparkline(data, width = 60, height = 24) {
    if (data.length < 2) return '';

    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;

    const points = data
      .map((value, index) => {
        const x = (index / (data.length - 1)) * width;
        const y = height - ((value - min) / range) * height;
        return `${x},${y}`;
      })
      .join(' ');

    return `M ${points.split(' ').join(' L ')}`;
  }

  // Calculate activity level
  function getActivityLevel() {
    const recentEvents = metricsHistory.eventsPerMinute.slice(-10);
    if (recentEvents.length === 0) return { label: 'Low Flow', color: 'var(--muted)' };

    const avgRate = recentEvents.reduce((sum, v) => sum + v, 0) / recentEvents.length;

    if (avgRate > 10) return { label: 'High Flow', color: 'var(--success)' };
    if (avgRate > 5) return { label: 'Medium Flow', color: 'var(--warning)' };
    return { label: 'Low Flow', color: 'var(--muted)' };
  }

  // Chart creation
  function createCharts() {
    if (!showCharts || filteredEvents.length === 0) return;

    logger.debug('[ActivityLiveFeed] Creating charts...');

    // Destroy existing charts
    Object.values(charts).forEach(chart => destroyChart(chart));
    charts = {};

    const colors = getChartColors();

    // Change type distribution pie chart
    const pieCanvas = document.getElementById('chart-change-types');
    if (pieCanvas) {
      charts.changeTypes = createChart('chart-change-types', {
        type: 'doughnut',
        data: {
          labels: ['Created', 'Modified', 'Deleted'],
          datasets: [
            {
              data: [stats.created, stats.modified, stats.deleted],
              backgroundColor: [colors.success, colors.primary, colors.error],
              borderWidth: 2,
              borderColor: colors.bg
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
                padding: 12,
                font: { size: 11 }
              }
            },
            title: {
              display: true,
              text: 'Change Type Distribution',
              color: colors.textHeading,
              font: { size: 12, weight: 'bold' }
            }
          }
        }
      });
    }

    // Activity timeline
    const timelineCanvas = document.getElementById('chart-timeline');
    if (timelineCanvas) {
      const last20 = [...filteredEvents].slice(0, 20).reverse();
      const labels = last20.map((_, i) => i + 1);
      const sizes = last20.map(e => e.event_size || 0);

      charts.timeline = createChart('chart-timeline', {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Event Size (bytes)',
              data: sizes,
              borderColor: colors.primary,
              backgroundColor: `${colors.primary}33`,
              fill: true,
              tension: 0.4,
              pointRadius: 3,
              pointHoverRadius: 5
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            title: {
              display: true,
              text: 'Recent Activity (Last 20 Events)',
              color: colors.textHeading,
              font: { size: 12, weight: 'bold' }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { color: colors.muted, font: { size: 10 } },
              grid: { color: colors.border }
            },
            x: {
              ticks: { color: colors.muted, font: { size: 10 } },
              grid: { color: colors.border }
            }
          }
        }
      });
    }
  }

  function togglePause() {
    isPaused = !isPaused;
  }

  function clearFeed() {
    events = [];
    stats = { total: 0, created: 0, modified: 0, deleted: 0 };
    metricsHistory = { eventsPerMinute: [], fileSize: [] };
  }

  function formatTime(timestamp) {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  }

  function formatDate(timestamp) {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleDateString();
  }

  function getEventIcon(changeType) {
    switch (changeType) {
      case 'created':
        return '➕';
      case 'modified':
        return '✏️';
      case 'deleted':
        return '🗑️';
      default:
        return '📝';
    }
  }

  function getEventColor(changeType) {
    switch (changeType) {
      case 'created':
        return 'var(--success)';
      case 'modified':
        return 'var(--accent)';
      case 'deleted':
        return 'var(--error)';
      default:
        return 'var(--text)';
    }
  }

  // Lifecycle - mount
  $effect(() => {
    // Load initial data
    loadAllData();

    // Connect to WebSocket for real-time updates
    websocketService.connect();

    // Listen for file change events
    websocketService.on('file-changed', handleFileChanged);
    websocketService.on('agent-event', handleAgentEvent);
    websocketService.on('project-switched', handleProjectSwitched);

    // Update metrics periodically
    const metricsInterval = setInterval(updateMetrics, 10000); // Every 10 seconds

    // Create theme observer for chart recreation
    themeObserver = createThemeObserver(() => {
      if (showCharts) {
        logger.debug('[ActivityLiveFeed] Theme changed, recreating charts');
        setTimeout(createCharts, 100);
      }
    });

    // Create charts after initial load
    setTimeout(() => {
      if (showCharts && events.length > 0) {
        createCharts();
      }
    }, 200);

    // Cleanup
    return () => {
      websocketService.off('file-changed', handleFileChanged);
      websocketService.off('agent-event', handleAgentEvent);
      websocketService.off('project-switched', handleProjectSwitched);

      clearInterval(metricsInterval);

      if (debouncedTimeoutId) {
        clearTimeout(debouncedTimeoutId);
      }

      if (themeObserver) {
        themeObserver.disconnect();
      }

      Object.values(charts).forEach(chart => destroyChart(chart));
    };
  });

  // Recreate charts when data changes
  $effect(() => {
    if (showCharts && filteredEvents.length > 0) {
      setTimeout(createCharts, 100);
    }
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-7xl mx-auto">
    <!-- Header -->
    <div class="flex justify-between items-start mb-6">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">Live Activity Feed</h1>
        <p class="text-base text-[var(--muted)] font-sans">
          Real-time stream of code changes • Source code only
        </p>
      </div>
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-2">
          <span class="text-sm text-[var(--muted)] font-sans">Status:</span>
          <span
            class="flex items-center gap-1 text-sm font-sans"
            style="color: {websocketService.isConnected() ? 'var(--success)' : 'var(--error)'}"
          >
            <span
              class="w-2 h-2 rounded-full"
              style="background: {websocketService.isConnected()
                ? 'var(--success)'
                : 'var(--error)'}"
            ></span>
            {websocketService.isConnected() ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        <button
          onclick={togglePause}
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors"
          class:bg-warning={isPaused}
          class:text-white={isPaused}
        >
          {isPaused ? '▶️ Resume' : '⏸️ Pause'}
        </button>
        <button
          onclick={clearFeed}
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--error)] transition-colors"
        >
          🗑️ Clear
        </button>
      </div>
    </div>

    {#if error}
      <div class="bg-[var(--error-subtle)] border border-[var(--error)] rounded-lg p-4 mb-6">
        <span class="text-sm text-[var(--error)] font-sans">⚠️ {error}</span>
      </div>
    {/if}

    {#if isPaused}
      <div
        class="bg-[var(--warning)] bg-opacity-10 border border-[var(--warning)] rounded-lg p-4 mb-6 text-center"
      >
        <span class="text-sm text-[var(--warning)] font-sans font-semibold"
          >⏸️ Feed paused - Click Resume to continue live updates</span
        >
      </div>
    {/if}

    <!-- Stats Bar with Activity Level -->
    <div class="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
        <div class="text-sm text-[var(--muted)] font-sans">Total Events</div>
        <div class="text-2xl font-bold text-[var(--text-heading)]">{stats.total}</div>
      </div>
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
        <div class="text-sm text-[var(--muted)] font-sans">Created</div>
        <div class="text-2xl font-bold text-[var(--success)]">{stats.created}</div>
      </div>
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
        <div class="text-sm text-[var(--muted)] font-sans">Modified</div>
        <div class="text-2xl font-bold text-[var(--accent)]">{stats.modified}</div>
      </div>
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
        <div class="text-sm text-[var(--muted)] font-sans">Deleted</div>
        <div class="text-2xl font-bold text-[var(--error)]">{stats.deleted}</div>
      </div>
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
        <div class="text-sm text-[var(--muted)] font-sans">Activity Level</div>
        <div class="text-lg font-bold" style="color: {getActivityLevel().color}">
          {getActivityLevel().label}
        </div>
      </div>
    </div>

    <!-- Sparklines -->
    {#if metricsHistory.eventsPerMinute.length > 1}
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <div class="flex justify-between items-center mb-2">
            <span class="text-sm text-[var(--muted)] font-sans">Events/Minute</span>
            <span class="text-lg font-bold text-[var(--text-heading)]">
              {metricsHistory.eventsPerMinute[metricsHistory.eventsPerMinute.length - 1]?.toFixed(
                0
              ) || 0}
            </span>
          </div>
          <svg class="w-full h-12" viewBox="0 0 200 48">
            <path
              d={generateSparkline(metricsHistory.eventsPerMinute, 200, 48)}
              fill="none"
              stroke="var(--accent)"
              stroke-width="2"
              vector-effect="non-scaling-stroke"
            />
          </svg>
        </div>
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <div class="flex justify-between items-center mb-2">
            <span class="text-sm text-[var(--muted)] font-sans">Avg File Size (bytes)</span>
            <span class="text-lg font-bold text-[var(--text-heading)]">
              {metricsHistory.fileSize[metricsHistory.fileSize.length - 1]?.toFixed(0) || 0}
            </span>
          </div>
          <svg class="w-full h-12" viewBox="0 0 200 48">
            <path
              d={generateSparkline(metricsHistory.fileSize, 200, 48)}
              fill="none"
              stroke="var(--success)"
              stroke-width="2"
              vector-effect="non-scaling-stroke"
            />
          </svg>
        </div>
      </div>
    {/if}

    <!-- Charts Section -->
    {#if showCharts && !loading && events.length > 0}
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
          <div class="h-64">
            <canvas id="chart-change-types"></canvas>
          </div>
        </div>
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
          <div class="h-64">
            <canvas id="chart-timeline"></canvas>
          </div>
        </div>
      </div>
      <div class="mb-6 text-center">
        <button
          onclick={() => (showCharts = false)}
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors"
        >
          Hide Charts
        </button>
      </div>
    {:else if !showCharts && !loading && events.length > 0}
      <div class="mb-6 text-center">
        <button
          onclick={() => {
            showCharts = true;
            setTimeout(createCharts, 100);
          }}
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors"
        >
          Show Charts
        </button>
      </div>
    {/if}

    <!-- Filters -->
    <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 mb-4">
      <div class="flex flex-wrap gap-4 items-center">
        <span class="text-sm text-[var(--muted)] font-sans">Filter:</span>
        <div class="flex gap-2">
          <button
            onclick={() => (filter = 'all')}
            class="px-3 py-1.5 rounded text-sm font-sans transition-colors"
            class:bg-accent={filter === 'all'}
            class:text-white={filter === 'all'}
            class:bg-bg={filter !== 'all'}
            class:border={filter !== 'all'}
            class:border-border={filter !== 'all'}
          >
            All
          </button>
          <button
            onclick={() => (filter = 'created')}
            class="px-3 py-1.5 rounded text-sm font-sans transition-colors"
            class:bg-success={filter === 'created'}
            class:text-white={filter === 'created'}
            class:bg-bg={filter !== 'created'}
            class:border={filter !== 'created'}
            class:border-border={filter !== 'created'}
          >
            Created
          </button>
          <button
            onclick={() => (filter = 'modified')}
            class="px-3 py-1.5 rounded text-sm font-sans transition-colors"
            class:bg-accent={filter === 'modified'}
            class:text-white={filter === 'modified'}
            class:bg-bg={filter !== 'modified'}
            class:border={filter !== 'modified'}
            class:border-border={filter !== 'modified'}
          >
            Modified
          </button>
          <button
            onclick={() => (filter = 'deleted')}
            class="px-3 py-1.5 rounded text-sm font-sans transition-colors"
            class:bg-error={filter === 'deleted'}
            class:text-white={filter === 'deleted'}
            class:bg-bg={filter !== 'deleted'}
            class:border={filter !== 'deleted'}
            class:border-border={filter !== 'deleted'}
          >
            Deleted
          </button>
        </div>
        <div class="ml-auto flex items-center gap-2">
          <label
            class="flex items-center gap-2 text-sm text-[var(--muted)] font-sans cursor-pointer"
          >
            <input
              type="checkbox"
              bind:checked={autoScroll}
              class="w-4 h-4 accent-[var(--accent)]"
            />
            Auto-scroll
          </label>
        </div>
      </div>
    </div>

    <!-- Live Feed -->
    {#if loading}
      <div class="text-center py-12">
        <div class="text-4xl mb-4">⏳</div>
        <div class="text-[var(--muted)] font-sans">Loading events...</div>
      </div>
    {:else}
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
        {#if filteredEvents.length === 0}
          <div class="p-12 text-center">
            <div class="text-5xl mb-4">📡</div>
            <div class="text-xl font-semibold text-[var(--text-heading)] mb-2">
              {isPaused ? 'Feed Paused' : 'Waiting for events...'}
            </div>
            <div class="text-base text-[var(--muted)] font-sans">
              {isPaused
                ? 'Click Resume to continue receiving events'
                : 'Live events will appear here as they happen'}
            </div>
          </div>
        {:else}
          <div id="live-feed" class="max-h-[600px] overflow-y-auto">
            <div class="divide-y divide-[var(--border)]">
              {#each filteredEvents as event (event.id)}
                <div class="p-4 hover:bg-[var(--bg)] transition-colors">
                  <div class="flex items-start gap-4">
                    <span class="text-2xl flex-shrink-0">{getEventIcon(event.change_type)}</span>
                    <div class="flex-1 min-w-0">
                      <div class="flex items-baseline gap-3 mb-1 flex-wrap">
                        <span
                          class="text-xs px-2 py-1 rounded font-semibold"
                          style="background: {getEventColor(
                            event.change_type
                          )}20; color: {getEventColor(event.change_type)}"
                        >
                          {event.change_type?.toUpperCase() || 'UNKNOWN'}
                        </span>
                        <span class="text-sm text-[var(--muted)] font-sans">
                          {formatTime(event.timestamp)}
                        </span>
                        {#if event.agent}
                          <span class="text-sm text-[var(--muted)] font-mono">
                            {event.agent}
                          </span>
                        {/if}
                        {#if event.project}
                          <span
                            class="text-xs px-2 py-1 rounded bg-[var(--accent)] bg-opacity-20 text-[var(--accent)] font-mono"
                          >
                            {event.project}
                          </span>
                        {/if}
                      </div>
                      <div class="text-base font-medium text-[var(--text)] font-mono mb-1 truncate">
                        {event.filepath || event.message || 'Unknown event'}
                      </div>
                      {#if event.message && event.filepath}
                        <div class="text-sm text-[var(--muted)] font-sans">
                          {event.message}
                        </div>
                      {/if}
                      {#if event.duration_ms || event.event_size}
                        <div class="flex gap-4 mt-2 text-xs text-[var(--muted)] font-mono">
                          {#if event.duration_ms}
                            <span>⏱️ {event.duration_ms}ms</span>
                          {/if}
                          {#if event.event_size}
                            <span>📦 {event.event_size}B</span>
                          {/if}
                        </div>
                      {/if}
                    </div>
                    <div class="text-xs text-[var(--muted)] font-sans text-right flex-shrink-0">
                      {formatDate(event.timestamp)}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      {#if filteredEvents.length > 0}
        <div class="mt-4 text-center text-sm text-[var(--muted)] font-sans">
          Showing {filteredEvents.length} of {events.length} events (max {maxEvents})
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .bg-bg {
    background: var(--bg);
  }
  .border {
    border-width: 1px;
  }
  .border-border {
    border-color: var(--border);
  }
</style>
