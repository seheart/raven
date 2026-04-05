<script>
  import { logger } from '../logger.js';
  import { onMount } from 'svelte';
  import { api } from '../apiClient.js';
  import { websocketService } from '../services/websocket.js';
  import {
    createChart,
    destroyChart,
    createThemeObserver,
    getChartColors
  } from '../utils/chartUtils.js';

  // State
  let stats = $state({
    total_events: 0,
    total_files: 0,
    creates: 0,
    edits: 0,
    deletes: 0,
    total_agents: 0
  });
  let systemMetrics = $state({
    cpu_percent: 0,
    memory_percent: 0,
    memory_used_mb: 0,
    memory_total_mb: 0
  });
  let agentStatus = $state(null);
  let recentFiles = $state([]);
  let liveEvents = $state([]);
  let topFiles = $state([]);
  let loading = $state(false);
  let lastUpdated = $state(new Date());

  // Charts
  let activityChart = null;
  let trendChart = null;
  let themeObserver = null;

  // Derived
  const cpuColor = $derived(
    systemMetrics.cpu_percent > 80
      ? 'var(--error)'
      : systemMetrics.cpu_percent > 50
        ? 'var(--warning)'
        : 'var(--success)'
  );
  const memColor = $derived(
    systemMetrics.memory_percent > 85
      ? 'var(--error)'
      : systemMetrics.memory_percent > 60
        ? 'var(--warning)'
        : 'var(--success)'
  );
  const eventsPerMin = $derived.by(() => {
    if (recentFiles.length < 2) return '0';
    const newest = new Date(recentFiles[0]?.timestamp);
    const oldest = new Date(recentFiles[recentFiles.length - 1]?.timestamp);
    const minutes = Math.max(1, (newest - oldest) / 60000);
    return (recentFiles.length / minutes).toFixed(1);
  });

  function formatTime(timestamp) {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString();
  }

  function formatNumber(n) {
    return n?.toLocaleString() || '0';
  }

  function getChangeColor(type) {
    if (type === 'add' || type === 'create') return 'var(--success)';
    if (type === 'unlink' || type === 'delete') return 'var(--error)';
    return 'var(--accent)';
  }

  function createCharts() {
    const colors = getChartColors();

    // Activity distribution
    if (activityChart) destroyChart(activityChart);
    activityChart = createChart('chart-activity', {
      type: 'doughnut',
      data: {
        labels: ['Modified', 'Created', 'Deleted'],
        datasets: [
          {
            data: [stats.edits || 0, stats.creates || 0, stats.deletes || 0],
            backgroundColor: [colors.primary, colors.success, colors.error],
            borderWidth: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: colors.text, font: { size: 10, family: 'monospace' }, padding: 8 }
          }
        }
      }
    });

    // Activity trend (24h)
    if (trendChart) destroyChart(trendChart);
    const hourlyData = new Array(24).fill(0);
    const now = new Date();
    recentFiles.forEach(e => {
      const diff = Math.floor((now - new Date(e.timestamp)) / 3600000);
      if (diff < 24) hourlyData[23 - diff]++;
    });
    const labels = Array.from({ length: 24 }, (_, i) => {
      const h = (now.getHours() - 23 + i + 24) % 24;
      return `${h}:00`;
    });

    trendChart = createChart('chart-trend', {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            data: hourlyData,
            borderColor: colors.primary,
            backgroundColor: `${colors.primary}20`,
            fill: true,
            tension: 0.4,
            pointRadius: 1,
            pointHoverRadius: 4,
            borderWidth: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            ticks: {
              color: colors.muted,
              font: { size: 9, family: 'monospace' },
              maxRotation: 0,
              autoSkipPadding: 20
            },
            grid: { display: false }
          },
          y: {
            beginAtZero: true,
            ticks: { color: colors.muted, font: { size: 10, family: 'monospace' }, precision: 0 },
            grid: { color: `${colors.border}` }
          }
        }
      }
    });
  }

  async function loadData() {
    try {
      const [statsData, metricsData, fileEvents, filesData, agentData] = await Promise.all([
        api.get('/dashboard-stats').catch(() => stats),
        api.get('/system-metrics?limit=1').catch(() => []),
        api.get('/file-events?limit=100').catch(() => []),
        api.get('/top-modified-files?limit=8').catch(() => []),
        api.get('/agents-status').catch(() => [])
      ]);

      stats = statsData;
      systemMetrics = Array.isArray(metricsData) && metricsData[0] ? metricsData[0] : systemMetrics;
      recentFiles = Array.isArray(fileEvents) ? fileEvents : [];
      topFiles = Array.isArray(filesData) ? filesData : filesData.files || [];
      agentStatus = Array.isArray(agentData) && agentData[0] ? agentData[0] : null;

      lastUpdated = new Date();
      loading = false;
      setTimeout(createCharts, 100);
    } catch (err) {
      logger.error('Dashboard load failed:', err);
      loading = false;
    }
  }

  // WebSocket: live updates
  const handleMetrics = data => {
    systemMetrics = data;
  };
  const handleFileChanged = () => {
    loadData();
  };
  const handleAgentEvent = event => {
    liveEvents = [{ ...event, _ts: Date.now() }, ...liveEvents].slice(0, 20);
  };

  onMount(async () => {
    await loadData();

    websocketService.connect();
    websocketService.on('system-metrics', handleMetrics);
    websocketService.on('file-changed', handleFileChanged);
    websocketService.on('agent-event', handleAgentEvent);

    themeObserver = createThemeObserver(() => createCharts());

    // Auto-refresh every 30s
    const interval = setInterval(loadData, 30000);

    return () => {
      websocketService.off('system-metrics', handleMetrics);
      websocketService.off('file-changed', handleFileChanged);
      websocketService.off('agent-event', handleAgentEvent);
      if (themeObserver) themeObserver.disconnect();
      if (activityChart) destroyChart(activityChart);
      if (trendChart) destroyChart(trendChart);
      clearInterval(interval);
    };
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-6xl mx-auto">
    <!-- Header -->
    <div class="flex justify-between items-start mb-6 flex-wrap gap-4">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">Dashboard</h1>
        <p class="text-sm text-[var(--muted)] font-sans">Real-time monitoring overview</p>
      </div>
      <div class="flex items-center gap-3">
        {#if agentStatus}
          <span class="flex items-center gap-2 text-sm font-mono">
            <span
              class="w-2 h-2 rounded-full {agentStatus.is_running
                ? 'bg-[var(--success)] animate-pulse'
                : 'bg-[var(--muted)]'}"
            ></span>
            <span class="text-[var(--text)]">{agentStatus.agent_name}</span>
          </span>
        {/if}
        <span class="text-xs text-[var(--muted)] font-mono">{formatTime(lastUpdated)}</span>
        <button
          onclick={loadData}
          disabled={loading}
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors disabled:opacity-50"
        >
          {loading ? '...' : '↻'} Refresh
        </button>
      </div>
    </div>

    <!-- Top Stats Row -->
    <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
        <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
          Events
        </div>
        <div class="text-sm font-mono text-[var(--text)]">{formatNumber(stats.total_events)}</div>
      </div>
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
        <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
          Files
        </div>
        <div class="text-sm font-mono text-[var(--text)]">{formatNumber(stats.total_files)}</div>
      </div>
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
        <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
          Modified
        </div>
        <div class="text-sm font-mono text-[var(--text)]">{formatNumber(stats.edits)}</div>
      </div>
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
        <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
          Created
        </div>
        <div class="text-sm font-mono text-[var(--text)]">{formatNumber(stats.creates)}</div>
      </div>
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
        <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
          Deleted
        </div>
        <div class="text-sm font-mono text-[var(--text)]">{formatNumber(stats.deletes)}</div>
      </div>
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
        <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
          Rate
        </div>
        <div class="text-sm font-mono text-[var(--text)]">{eventsPerMin}/min</div>
      </div>
    </div>

    <!-- System + Charts Row -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
      <!-- System Resources -->
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
        <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-4">
          System Resources
        </h3>
        <div class="space-y-4">
          <div>
            <div class="flex justify-between text-sm mb-1">
              <span class="text-[var(--muted)]">CPU</span>
              <span class="font-mono text-[var(--text)]"
                >{systemMetrics.cpu_percent?.toFixed(1) || 0}%</span
              >
            </div>
            <div class="h-2 bg-[var(--bg)] rounded overflow-hidden">
              <div
                class="h-full transition-all duration-500"
                style="width: {systemMetrics.cpu_percent || 0}%; background: {cpuColor}"
              ></div>
            </div>
          </div>
          <div>
            <div class="flex justify-between text-sm mb-1">
              <span class="text-[var(--muted)]">Memory</span>
              <span class="font-mono text-[var(--text)]"
                >{systemMetrics.memory_percent?.toFixed(1) || 0}%</span
              >
            </div>
            <div class="h-2 bg-[var(--bg)] rounded overflow-hidden">
              <div
                class="h-full transition-all duration-500"
                style="width: {systemMetrics.memory_percent || 0}%; background: {memColor}"
              ></div>
            </div>
            <div class="text-xs text-[var(--muted)] font-mono mt-1">
              {formatNumber(Math.round(systemMetrics.memory_used_mb || 0))} / {formatNumber(
                Math.round(systemMetrics.memory_total_mb || 0)
              )} MB
            </div>
          </div>
        </div>
      </div>

      <!-- Activity Distribution -->
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
        <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-4">
          Activity Breakdown
        </h3>
        <div class="h-[180px]">
          <canvas id="chart-activity"></canvas>
        </div>
      </div>

      <!-- Activity Trend -->
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
        <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-4">
          Activity (24h)
        </h3>
        <div class="h-[180px]">
          <canvas id="chart-trend"></canvas>
        </div>
      </div>
    </div>

    <!-- Live Feed + Top Files Row -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
      <!-- Live File Activity -->
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">
            Recent File Changes
          </h3>
          <span class="flex items-center gap-2 text-xs text-[var(--success)] font-mono">
            <span class="w-2 h-2 bg-[var(--success)] rounded-full animate-pulse"></span>
            Live
          </span>
        </div>
        <div class="space-y-1 max-h-[320px] overflow-y-auto">
          {#if recentFiles.length === 0}
            <div class="text-center py-8 text-sm text-[var(--muted)]">No recent file changes</div>
          {:else}
            {#each recentFiles.slice(0, 15) as event (event.id || event.timestamp)}
              <div
                class="flex items-center gap-3 p-2 rounded hover:bg-[var(--bg)] transition-colors"
                style="border-left: 2px solid {getChangeColor(event.change_type)}"
              >
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-mono text-[var(--text)] truncate">{event.filepath}</div>
                </div>
                <span class="text-xs text-[var(--muted)] font-mono flex-shrink-0"
                  >{formatTime(event.timestamp)}</span
                >
              </div>
            {/each}
          {/if}
        </div>
      </div>

      <!-- Most Active Files -->
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
        <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-4">
          Most Active Files
        </h3>
        {#if topFiles.length === 0}
          <div class="text-center py-8 text-sm text-[var(--muted)]">No data yet</div>
        {:else}
          <div class="space-y-2">
            {#each topFiles as file (file.filepath)}
              {@const maxCount = topFiles[0]?.edit_count || 1}
              <div class="flex items-center gap-3">
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-mono text-[var(--text)] truncate">{file.filepath}</div>
                </div>
                <div class="w-24 h-2 bg-[var(--bg)] rounded overflow-hidden flex-shrink-0">
                  <div
                    class="h-full bg-[var(--accent)]"
                    style="width: {(file.edit_count / maxCount) * 100}%"
                  ></div>
                </div>
                <span class="text-xs font-mono text-[var(--muted)] w-8 text-right flex-shrink-0"
                  >{file.edit_count}</span
                >
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <!-- Live Agent Activity -->
    {#if liveEvents.length > 0}
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">
            Live Agent Activity
          </h3>
          <span class="text-xs text-[var(--muted)] font-mono">{liveEvents.length} events</span>
        </div>
        <div class="space-y-1 max-h-[200px] overflow-y-auto">
          {#each liveEvents as event (event._ts)}
            <div
              class="flex items-center gap-3 p-2 rounded hover:bg-[var(--bg)] transition-colors text-sm"
            >
              <span
                class="text-xs px-2 py-0.5 rounded font-mono font-semibold"
                style="background: var(--accent); color: white; opacity: 0.8"
              >
                {event.event_type || event.type}
              </span>
              <span class="font-mono text-[var(--text)] truncate flex-1"
                >{event.file || event.description || event.agent_name || ''}</span
              >
              <span class="text-xs text-[var(--muted)] font-mono flex-shrink-0"
                >{formatTime(event.timestamp)}</span
              >
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>
