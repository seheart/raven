<script>
  import { logger } from '../logger.js';
  /**
   * Analysis Performance Page
   * Performance profiling with 3 tabs: Metrics, Trend Charts, Correlations
   * Svelte 5 + Tailwind CSS implementation
   */

  import { api } from '../apiClient.js';
  import { websocketService } from '../services/websocket.js';

  // Svelte 5 reactive state
  let activeTab = $state('metrics'); // 'metrics', 'charts', 'correlations'
  let systemMetrics = $state([]);
  let processMetrics = $state([]);
  let stats = $state(null);
  let correlations = $state([]);
  let selectedAgent = $state('claude-sonnet-3.5');
  let loading = $state(true);
  let error = $state(null);
  let lastUpdated = $state(null);
  let isManualRefresh = $state(false);
  let chartTimeRange = $state('1h'); // '15m', '1h', '6h', '24h'

  // Chart instances (no Chart.js for now - using CSS-based charts like reference)

  // Performance thresholds
  let thresholds = $state({
    cpu: { warning: 70, critical: 90 },
    memory: { warning: 75, critical: 95 }
  });

  // Derived state - latest metrics
  const latestMetrics = $derived(systemMetrics.length > 0 ? systemMetrics[0] : null);
  const latestProcessMetrics = $derived(processMetrics.length > 0 ? processMetrics[0] : null);

  // Time ago display
  const timeAgo = $derived.by(() => {
    if (!lastUpdated) return 'Just now';
    const seconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
    if (seconds < 10) return 'Just now';
    else if (seconds < 60) return `${seconds}s ago`;
    else if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    else return `${Math.floor(seconds / 3600)}h ago`;
  });

  // Active alerts
  const activeAlerts = $derived.by(() => {
    if (!latestMetrics) return [];
    const alerts = [];

    const cpuLevel = getAlertLevel(latestMetrics.cpu_percent, 'cpu');
    if (cpuLevel !== 'normal') {
      alerts.push({
        type: 'cpu',
        level: cpuLevel,
        message: `CPU usage ${cpuLevel}: ${latestMetrics.cpu_percent.toFixed(1)}%`,
        threshold: cpuLevel === 'critical' ? thresholds.cpu.critical : thresholds.cpu.warning
      });
    }

    const memLevel = getAlertLevel(latestMetrics.memory_percent, 'memory');
    if (memLevel !== 'normal') {
      alerts.push({
        type: 'memory',
        level: memLevel,
        message: `Memory usage ${memLevel}: ${latestMetrics.memory_percent.toFixed(1)}%`,
        threshold: memLevel === 'critical' ? thresholds.memory.critical : thresholds.memory.warning
      });
    }

    return alerts;
  });

  // Load all data
  async function fetchAllData(manual = false) {
    try {
      loading = true;
      isManualRefresh = manual;
      error = null;

      // CRITICAL FIX: api.get returns parsed JSON directly
      const systemData = await api.get('/system-metrics?limit=20');
      systemMetrics = Array.isArray(systemData) ? systemData : systemData.metrics || [];

      // Fetch process metrics for selected agent
      if (selectedAgent) {
        const processData = await api.get(`/process-metrics/${selectedAgent}?limit=20`);
        processMetrics = Array.isArray(processData) ? processData : processData.metrics || [];
      }

      // Fetch stats for last hour
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const statsData = await api.get(
        `/metrics-stats?start_time=${oneHourAgo.toISOString()}&end_time=${now.toISOString()}`
      );
      stats = statsData;

      // Fetch performance correlations
      const correlationsData = await api.get('/performance-correlations?time_window_seconds=10');
      correlations = Array.isArray(correlationsData)
        ? correlationsData
        : correlationsData.correlations || [];

      lastUpdated = new Date();
      loading = false;
      isManualRefresh = false;
    } catch (err) {
      logger.error('Failed to load performance data:', err);
      error = err.message || 'Failed to load performance data';
      loading = false;
      isManualRefresh = false;
    }
  }

  // WebSocket handlers
  function handleSystemMetrics(metrics) {
    systemMetrics = [metrics, ...systemMetrics].slice(0, 20);
  }

  function handleProjectSwitched(_data) {
    fetchAllData();
  }

  // Export functions
  function exportToJSON() {
    const data = {
      systemMetrics,
      processMetrics,
      stats,
      correlations,
      thresholds,
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `raven-performance-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportToCSV() {
    const headers = [
      'timestamp',
      'cpu_percent',
      'memory_percent',
      'memory_used_mb',
      'memory_total_mb'
    ];
    const rows = systemMetrics.map(m => [
      m.timestamp,
      m.cpu_percent,
      m.memory_percent,
      m.memory_used_mb,
      m.memory_total_mb
    ]);

    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `raven-performance-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Helper functions
  function getAlertLevel(value, type) {
    const threshold = thresholds[type];
    if (!threshold) return 'normal';
    if (value >= threshold.critical) return 'critical';
    if (value >= threshold.warning) return 'warning';
    return 'normal';
  }

  function formatTimestamp(ts) {
    return new Date(ts).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function formatBytes(bytes) {
    if (!bytes) return 'N/A';
    const mb = bytes / (1024 * 1024);
    return mb.toFixed(2) + ' MB';
  }

  function formatNumber(num) {
    if (num === null || num === undefined) return 'N/A';
    return num.toLocaleString();
  }

  // Initialization effect
  $effect(() => {
    // Load initial data
    fetchAllData();

    // Connect to WebSocket for real-time updates
    websocketService.connect();
    websocketService.on('system-metrics', handleSystemMetrics);
    websocketService.on('project-switched', handleProjectSwitched);

    // Cleanup
    return () => {
      websocketService.off('system-metrics', handleSystemMetrics);
      websocketService.off('project-switched', handleProjectSwitched);
    };
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-6xl mx-auto">
    <!-- Header -->
    <div class="flex justify-between items-center mb-6 flex-wrap gap-4">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1 font-sans">
          Performance Profiling
        </h1>
        <p class="text-sm text-[var(--muted)] font-mono">
          Updated: {timeAgo}
        </p>
      </div>
      <div class="flex items-center gap-3 flex-wrap">
        <button
          onclick={exportToJSON}
          class="px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors"
        >
          Export JSON
        </button>
        <button
          onclick={exportToCSV}
          class="px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors"
        >
          Export CSV
        </button>
        <button
          onclick={() => fetchAllData(true)}
          disabled={loading}
          class="px-3 py-2 bg-[var(--accent)] text-white rounded text-sm font-sans hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          <span class="inline-block" class:animate-spin={isManualRefresh}>↻</span>Refresh
        </button>
      </div>
    </div>

    <!-- Active Alerts -->
    {#if activeAlerts.length > 0}
      <div class="mb-6 space-y-2">
        {#each activeAlerts as alert (alert.type)}
          {@const isCritical = alert.level === 'critical'}
          {@const isWarning = alert.level === 'warning'}
          <div
            class="border rounded-lg p-4 flex items-center gap-3 {isCritical
              ? 'bg-red-500/10 border-red-500'
              : ''} {isWarning ? 'bg-yellow-500/10 border-yellow-500' : ''}"
          >
            <span class="text-2xl">{isCritical ? '' : ''}</span>
            <div class="flex-1">
              <div class="font-semibold text-[var(--text-heading)] font-sans">
                {alert.type.toUpperCase()} Alert
              </div>
              <div class="text-sm text-[var(--muted)] font-sans">
                {alert.message} (threshold: {alert.threshold}%)
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Tab Navigation -->
    <div class="flex gap-2 border-b border-[var(--border)] mb-6">
      <button
        class="px-6 py-3 text-sm font-sans border-b-2 transition-colors {activeTab === 'metrics'
          ? 'border-[var(--accent)] text-[var(--accent)]'
          : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'}"
        onclick={() => (activeTab = 'metrics')}
      >
        Metrics
      </button>
      <button
        class="px-6 py-3 text-sm font-sans border-b-2 transition-colors {activeTab === 'charts'
          ? 'border-[var(--accent)] text-[var(--accent)]'
          : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'}"
        onclick={() => (activeTab = 'charts')}
      >
        Trend Charts
      </button>
      <button
        class="px-6 py-3 text-sm font-sans border-b-2 transition-colors {activeTab ===
        'correlations'
          ? 'border-[var(--accent)] text-[var(--accent)]'
          : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'}"
        onclick={() => (activeTab = 'correlations')}
      >
        Correlations
      </button>
    </div>

    <!-- Loading State -->
    {#if loading && systemMetrics.length === 0}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {#each Array(6) as _, i (i)}
          <div
            class="h-40 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-pulse"
          ></div>
        {/each}
      </div>

      <!-- Error State -->
    {:else if error}
      <div
        class="bg-red-500/10 border border-red-500 rounded-lg p-6 flex items-center justify-between"
      >
        <div>
          <p class="text-red-500 font-semibold font-sans mb-1">Error loading performance data</p>
          <p class="text-sm text-[var(--muted)] font-sans">{error}</p>
        </div>
        <button
          onclick={() => fetchAllData()}
          class="px-4 py-2 bg-red-500 text-white rounded text-sm font-sans hover:bg-red-600 transition-colors"
        >
          Try Again
        </button>
      </div>

      <!-- Tab Content -->
    {:else if activeTab === 'metrics'}
      <!-- METRICS TAB -->
      {#if latestMetrics}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <!-- System Metrics Card -->
          <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
            <h3
              class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-4 font-sans"
            >
              System Metrics
            </h3>
            <div class="space-y-3">
              <div class="flex justify-between items-center">
                <span class="text-sm text-[var(--muted)] font-sans">CPU Usage:</span>
                <span
                  class="text-lg font-bold font-mono {latestMetrics.cpu_percent > 80
                    ? 'text-red-500'
                    : latestMetrics.cpu_percent > 50
                      ? 'text-yellow-500'
                      : 'text-green-500'}"
                >
                  {latestMetrics.cpu_percent.toFixed(1)}%
                </span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-sm text-[var(--muted)] font-sans">Memory:</span>
                <span
                  class="text-lg font-bold font-mono {latestMetrics.memory_percent > 80
                    ? 'text-red-500'
                    : latestMetrics.memory_percent > 50
                      ? 'text-yellow-500'
                      : 'text-green-500'}"
                >
                  {latestMetrics.memory_percent.toFixed(1)}%
                </span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-sm text-[var(--muted)] font-sans">RAM Used:</span>
                <span class="text-sm font-mono text-[var(--text)]">
                  {formatNumber(latestMetrics.memory_used_mb)} MB / {formatNumber(
                    latestMetrics.memory_total_mb
                  )} MB
                </span>
              </div>
              {#if latestMetrics.network_rx_bytes}
                <div class="flex justify-between items-center">
                  <span class="text-sm text-[var(--muted)] font-sans">Network RX:</span>
                  <span class="text-sm font-mono text-[var(--text)]"
                    >{formatBytes(latestMetrics.network_rx_bytes)}</span
                  >
                </div>
              {/if}
              {#if latestMetrics.network_tx_bytes}
                <div class="flex justify-between items-center">
                  <span class="text-sm text-[var(--muted)] font-sans">Network TX:</span>
                  <span class="text-sm font-mono text-[var(--text)]"
                    >{formatBytes(latestMetrics.network_tx_bytes)}</span
                  >
                </div>
              {/if}
            </div>
            <div class="mt-4 pt-3 border-t border-[var(--border)]">
              <p class="text-xs text-[var(--muted)] font-mono text-right">
                {formatTimestamp(latestMetrics.timestamp)}
              </p>
            </div>
          </div>

          <!-- Process Metrics Card -->
          {#if latestProcessMetrics}
            <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
              <h3
                class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-4 font-sans"
              >
                Process: {latestProcessMetrics.agent_name || selectedAgent}
              </h3>
              <div class="space-y-3">
                <div class="flex justify-between items-center">
                  <span class="text-sm text-[var(--muted)] font-sans">PID:</span>
                  <span class="text-sm font-mono text-[var(--text)]"
                    >{latestProcessMetrics.pid}</span
                  >
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-sm text-[var(--muted)] font-sans">CPU:</span>
                  <span
                    class="text-lg font-bold font-mono {latestProcessMetrics.cpu_usage > 80
                      ? 'text-red-500'
                      : latestProcessMetrics.cpu_usage > 50
                        ? 'text-yellow-500'
                        : 'text-green-500'}"
                  >
                    {latestProcessMetrics.cpu_usage.toFixed(1)}%
                  </span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-sm text-[var(--muted)] font-sans">Memory:</span>
                  <span class="text-sm font-mono text-[var(--text)]"
                    >{formatNumber(latestProcessMetrics.memory_mb)} MB</span
                  >
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-sm text-[var(--muted)] font-sans">Virtual Mem:</span>
                  <span class="text-sm font-mono text-[var(--text)]"
                    >{formatNumber(latestProcessMetrics.virtual_memory_mb)} MB</span
                  >
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-sm text-[var(--muted)] font-sans">Status:</span>
                  <span class="text-sm font-mono text-green-500 capitalize"
                    >{latestProcessMetrics.status}</span
                  >
                </div>
              </div>
              <div class="mt-4 pt-3 border-t border-[var(--border)]">
                <p class="text-xs text-[var(--muted)] font-mono text-right">
                  {formatTimestamp(latestProcessMetrics.timestamp)}
                </p>
              </div>
            </div>
          {:else}
            <div
              class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 text-center"
            >
              <h3
                class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2 font-sans"
              >
                Process Metrics
              </h3>
              <p class="text-sm text-[var(--muted)] font-sans">No process metrics available</p>
            </div>
          {/if}

          <!-- Statistics Card -->
          {#if stats && stats.sample_count > 0}
            <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
              <h3
                class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-4 font-sans"
              >
                Last Hour Stats
              </h3>
              <div class="space-y-3">
                <div class="flex justify-between items-center">
                  <span class="text-sm text-[var(--muted)] font-sans">Avg CPU:</span>
                  <span class="text-lg font-bold font-mono text-[var(--text)]"
                    >{stats.avg_cpu_percent.toFixed(1)}%</span
                  >
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-sm text-[var(--muted)] font-sans">Peak CPU:</span>
                  <span class="text-lg font-bold font-mono text-red-500"
                    >{stats.max_cpu_percent.toFixed(1)}%</span
                  >
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-sm text-[var(--muted)] font-sans">Avg Memory:</span>
                  <span class="text-lg font-bold font-mono text-[var(--text)]"
                    >{stats.avg_memory_percent.toFixed(1)}%</span
                  >
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-sm text-[var(--muted)] font-sans">Peak Memory:</span>
                  <span class="text-lg font-bold font-mono text-red-500"
                    >{stats.max_memory_percent.toFixed(1)}%</span
                  >
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-sm text-[var(--muted)] font-sans">Samples:</span>
                  <span class="text-sm font-mono text-[var(--text)]"
                    >{formatNumber(stats.sample_count)}</span
                  >
                </div>
              </div>
            </div>
          {/if}
        </div>
      {:else}
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center">
          <p class="text-[var(--muted)] font-sans text-sm">No performance data available yet.</p>
          <p class="text-sm text-[var(--muted)] font-sans mt-2">
            Metrics are collected automatically when monitoring is active.
          </p>
        </div>
      {/if}
    {:else if activeTab === 'charts'}
      <!-- TREND CHARTS TAB -->
      {#if systemMetrics && systemMetrics.length > 0}
        <div class="space-y-6">
          <!-- Chart Controls -->
          <div
            class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex justify-between items-center"
          >
            <label class="text-sm font-sans text-[var(--text)]">
              Time Range:
              <select
                bind:value={chartTimeRange}
                class="ml-2 px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition-colors"
              >
                <option value="15m">Last 15 minutes</option>
                <option value="1h">Last 1 hour</option>
                <option value="6h">Last 6 hours</option>
                <option value="24h">Last 24 hours</option>
              </select>
            </label>
            <div class="flex gap-4 text-xs font-mono">
              <span class="flex items-center gap-2">
                <span class="w-3 h-3 rounded-full bg-[var(--accent)]"></span>CPU
              </span>
              <span class="flex items-center gap-2">
                <span class="w-3 h-3 rounded-full bg-[var(--info)]"></span>Memory
              </span>
              <span class="flex items-center gap-2">
                <span class="w-3 h-3 rounded-full bg-yellow-500"></span>Warning
              </span>
              <span class="flex items-center gap-2">
                <span class="w-3 h-3 rounded-full bg-red-500"></span>Critical
              </span>
            </div>
          </div>

          <!-- CPU Chart -->
          <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
            <h3
              class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-4 font-sans"
            >
              CPU Usage Over Time
            </h3>
            <div class="flex gap-3 h-48">
              <!-- Y-axis -->
              <div
                class="flex flex-col justify-between text-xs text-[var(--muted)] font-mono w-10 text-right"
              >
                <span>100%</span>
                <span>75%</span>
                <span>50%</span>
                <span>25%</span>
                <span>0%</span>
              </div>
              <!-- Chart Canvas -->
              <div class="flex-1 relative bg-[var(--bg)] border border-[var(--border)] rounded">
                <!-- Threshold lines -->
                <div
                  class="absolute left-0 right-0 border-t-2 border-dashed border-red-500"
                  style="bottom: {thresholds.cpu.critical}%"
                >
                  <span
                    class="absolute right-1 -top-3 text-xs text-[var(--muted)] bg-[var(--bg)] px-1"
                    >{thresholds.cpu.critical}%</span
                  >
                </div>
                <div
                  class="absolute left-0 right-0 border-t-2 border-dashed border-yellow-500"
                  style="bottom: {thresholds.cpu.warning}%"
                >
                  <span
                    class="absolute right-1 -top-3 text-xs text-[var(--muted)] bg-[var(--bg)] px-1"
                    >{thresholds.cpu.warning}%</span
                  >
                </div>
                <!-- Data points -->
                {#each systemMetrics.slice().reverse() as metric, i (i)}
                  {@const isAboveCritical = metric.cpu_percent >= thresholds.cpu.critical}
                  {@const isAboveWarning =
                    metric.cpu_percent >= thresholds.cpu.warning &&
                    metric.cpu_percent < thresholds.cpu.critical}
                  <div
                    class="absolute w-1.5 h-1.5 rounded-full {isAboveCritical
                      ? 'bg-red-500'
                      : isAboveWarning
                        ? 'bg-yellow-500'
                        : 'bg-[var(--accent)]'} hover:w-2.5 hover:h-2.5 transition-all cursor-pointer"
                    style="left: {(i / (systemMetrics.length - 1)) *
                      100}%; bottom: {metric.cpu_percent}%; transform: translate(-50%, 50%)"
                    title="{formatTimestamp(metric.timestamp)}: {metric.cpu_percent.toFixed(1)}%"
                  ></div>
                {/each}
              </div>
            </div>
          </div>

          <!-- Memory Chart -->
          <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
            <h3
              class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-4 font-sans"
            >
              Memory Usage Over Time
            </h3>
            <div class="flex gap-3 h-48">
              <!-- Y-axis -->
              <div
                class="flex flex-col justify-between text-xs text-[var(--muted)] font-mono w-10 text-right"
              >
                <span>100%</span>
                <span>75%</span>
                <span>50%</span>
                <span>25%</span>
                <span>0%</span>
              </div>
              <!-- Chart Canvas -->
              <div class="flex-1 relative bg-[var(--bg)] border border-[var(--border)] rounded">
                <!-- Threshold lines -->
                <div
                  class="absolute left-0 right-0 border-t-2 border-dashed border-red-500"
                  style="bottom: {thresholds.memory.critical}%"
                >
                  <span
                    class="absolute right-1 -top-3 text-xs text-[var(--muted)] bg-[var(--bg)] px-1"
                    >{thresholds.memory.critical}%</span
                  >
                </div>
                <div
                  class="absolute left-0 right-0 border-t-2 border-dashed border-yellow-500"
                  style="bottom: {thresholds.memory.warning}%"
                >
                  <span
                    class="absolute right-1 -top-3 text-xs text-[var(--muted)] bg-[var(--bg)] px-1"
                    >{thresholds.memory.warning}%</span
                  >
                </div>
                <!-- Data points -->
                {#each systemMetrics.slice().reverse() as metric, i (i)}
                  {@const isAboveCritical = metric.memory_percent >= thresholds.memory.critical}
                  {@const isAboveWarning =
                    metric.memory_percent >= thresholds.memory.warning &&
                    metric.memory_percent < thresholds.memory.critical}
                  <div
                    class="absolute w-1.5 h-1.5 rounded-full {isAboveCritical
                      ? 'bg-red-500'
                      : isAboveWarning
                        ? 'bg-yellow-500'
                        : 'bg-[var(--info)]'} hover:w-2.5 hover:h-2.5 transition-all cursor-pointer"
                    style="left: {(i / (systemMetrics.length - 1)) *
                      100}%; bottom: {metric.memory_percent}%; transform: translate(-50%, 50%)"
                    title="{formatTimestamp(metric.timestamp)}: {metric.memory_percent.toFixed(1)}%"
                  ></div>
                {/each}
              </div>
            </div>
          </div>

          <!-- Threshold Configuration -->
          <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
            <h3
              class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-4 font-sans"
            >
              Alert Thresholds
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label for="cpu-warning" class="text-sm text-[var(--muted)] font-sans block mb-2"
                  >CPU Warning (%):</label
                >
                <input
                  id="cpu-warning"
                  type="number"
                  bind:value={thresholds.cpu.warning}
                  min="0"
                  max="100"
                  class="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                />
              </div>
              <div>
                <label for="cpu-critical" class="text-sm text-[var(--muted)] font-sans block mb-2"
                  >CPU Critical (%):</label
                >
                <input
                  id="cpu-critical"
                  type="number"
                  bind:value={thresholds.cpu.critical}
                  min="0"
                  max="100"
                  class="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                />
              </div>
              <div>
                <label for="memory-warning" class="text-sm text-[var(--muted)] font-sans block mb-2"
                  >Memory Warning (%):</label
                >
                <input
                  id="memory-warning"
                  type="number"
                  bind:value={thresholds.memory.warning}
                  min="0"
                  max="100"
                  class="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                />
              </div>
              <div>
                <label
                  for="memory-critical"
                  class="text-sm text-[var(--muted)] font-sans block mb-2"
                  >Memory Critical (%):</label
                >
                <input
                  id="memory-critical"
                  type="number"
                  bind:value={thresholds.memory.critical}
                  min="0"
                  max="100"
                  class="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                />
              </div>
            </div>
          </div>
        </div>
      {:else}
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center">
          <p class="text-[var(--muted)] font-sans text-sm">No metrics data available for charts.</p>
          <p class="text-sm text-[var(--muted)] font-sans mt-2">
            Charts will appear once performance data is collected.
          </p>
        </div>
      {/if}
    {:else if activeTab === 'correlations'}
      <!-- CORRELATIONS TAB -->
      {#if correlations && correlations.length > 0}
        <div class="space-y-4">
          <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
            <h3
              class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2 font-sans"
            >
              Performance Correlations
            </h3>
            <p class="text-sm text-[var(--muted)] font-sans">
              Events that occurred near CPU/memory spikes (within 10 seconds)
            </p>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {#each correlations as correlation (correlation)}
              <div
                class="bg-[var(--surface)] border-l-4 border-[var(--accent)] border-t border-r border-b border-[var(--border)] rounded-lg p-5"
              >
                <div class="flex justify-between items-start mb-3">
                  <span class="text-sm font-mono text-[var(--text)] truncate flex-1"
                    >{correlation.filepath}</span
                  >
                  <span
                    class="ml-2 px-2 py-1 text-xs font-bold uppercase rounded {correlation.change_type ===
                      'created' || correlation.change_type === 'add'
                      ? 'bg-green-500/20 text-green-500'
                      : correlation.change_type === 'modified' ||
                          correlation.change_type === 'change'
                        ? 'bg-yellow-500/20 text-yellow-500'
                        : correlation.change_type === 'deleted' ||
                            correlation.change_type === 'unlink'
                          ? 'bg-red-500/20 text-red-500'
                          : 'bg-[var(--muted)]/20 text-[var(--muted)]'}"
                  >
                    {correlation.change_type}
                  </span>
                </div>

                <div class="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <span class="text-xs text-[var(--muted)] font-sans block mb-1">CPU Impact:</span
                    >
                    <span
                      class="text-lg font-bold font-mono {(correlation.cpu_percent || 0) > 50
                        ? 'text-red-500'
                        : (correlation.cpu_percent || 0) > 25
                          ? 'text-yellow-500'
                          : 'text-green-500'}"
                    >
                      {correlation.cpu_percent ? correlation.cpu_percent.toFixed(1) : 'N/A'}%
                    </span>
                  </div>
                  <div>
                    <span class="text-xs text-[var(--muted)] font-sans block mb-1"
                      >Memory Impact:</span
                    >
                    <span
                      class="text-lg font-bold font-mono {(correlation.mem_percent || 0) > 50
                        ? 'text-red-500'
                        : (correlation.mem_percent || 0) > 25
                          ? 'text-yellow-500'
                          : 'text-green-500'}"
                    >
                      {correlation.mem_percent ? correlation.mem_percent.toFixed(1) : 'N/A'}%
                    </span>
                  </div>
                </div>

                <div
                  class="flex justify-between items-center pt-3 border-t border-[var(--border)] text-xs"
                >
                  <span class="text-[var(--muted)] font-mono"
                    >{formatTimestamp(correlation.event_timestamp)}</span
                  >
                  {#if correlation.diff_size}
                    <span class="text-[var(--muted)] font-mono"
                      >{formatNumber(correlation.diff_size)} chars changed</span
                    >
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {:else}
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center">
          <p class="text-[var(--muted)] font-sans text-sm">No performance correlations found.</p>
          <p class="text-sm text-[var(--muted)] font-sans mt-2">
            Correlations show which file changes coincide with CPU/memory spikes.
          </p>
          <p class="text-xs text-[var(--muted)] font-sans mt-2">
            Make some file changes while the system is under load to see correlations.
          </p>
        </div>
      {/if}
    {/if}
  </div>
</div>
