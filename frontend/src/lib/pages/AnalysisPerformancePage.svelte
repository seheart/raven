<script>
  import { logger } from '../logger.js';
  import { formatShortDateTime as formatTimestamp } from '../timeFormat.js';
  import { PageLayout, PageHeader, PageSection, StatusBar } from '../components/layout/index.js';
  import {
    RefreshButton,
    ToolbarButton,
    EmptyState,
    DataFetchError,
    FreshnessBadge,
    TabButton
  } from '../components/ui/index.js';
  /**
   * Analysis Performance Page
   * Performance profiling with 3 tabs: Metrics, Trend Charts, Correlations
   * Svelte 5 + Tailwind CSS implementation
   */

  import { onMount } from 'svelte';
  import { createPageApi } from '../apiClient.js';
  const { api, abort: abortRequests } = createPageApi();
  import { websocketService } from '../services/websocket.js';
  import {
    createChart,
    destroyChart,
    createThemeObserver,
    getChartColors
  } from '../utils/chartUtils.js';

  // Svelte 5 reactive state
  let activeTab = $state('metrics'); // 'metrics', 'charts', 'correlations'
  // Cap on the in-memory chart series. Initial fetch pulls 500 samples so the
  // 6h/24h ranges have something to draw; the WebSocket stream prepends new
  // samples and trims to this cap. Earlier this trimmed to 20 — first WS tick
  // silently truncated the series to 4% of its loaded size.
  const SYSTEM_METRICS_CAP = 1000;
  let systemMetrics = $state([]);
  let processMetrics = $state([]);
  let stats = $state(null);
  let correlations = $state([]);
  let selectedAgent = $state('claude-code');
  let availableAgents = $state(['claude-code']);
  let loading = $state(true);
  let error = $state(null);
  let lastUpdated = $state(null);
  let chartTimeRange = $state('1h'); // '15m', '1h', '6h', '24h'

  // Chart data filtered by time range
  const chartMetrics = $derived.by(() => {
    if (!systemMetrics.length) return [];
    const now = Date.now();
    const ranges = {
      '15m': 15 * 60000,
      '1h': 60 * 60000,
      '6h': 6 * 60 * 60000,
      '24h': 24 * 60 * 60000
    };
    const cutoff = now - (ranges[chartTimeRange] || ranges['1h']);
    return systemMetrics.filter(m => new Date(m.timestamp).getTime() >= cutoff);
  });

  // Performance thresholds
  let thresholds = $state({
    cpu: { warning: 70, critical: 90 },
    memory: { warning: 75, critical: 95 }
  });

  // Derived state - latest metrics
  const latestMetrics = $derived(systemMetrics.length > 0 ? systemMetrics[0] : null);
  const latestProcessMetrics = $derived(processMetrics.length > 0 ? processMetrics[0] : null);

  // Sorted correlations with anomaly detection
  const sortedCorrelations = $derived.by(() => {
    if (!correlations.length) return [];
    return [...correlations].sort((a, b) => (b.cpu_percent || 0) - (a.cpu_percent || 0));
  });

  const correlationStats = $derived.by(() => {
    if (!sortedCorrelations.length) return { elevated: 0, avgCpu: 0, avgMem: 0 };
    const avgCpu =
      sortedCorrelations.reduce((s, c) => s + (c.cpu_percent || 0), 0) / sortedCorrelations.length;
    const avgMem =
      sortedCorrelations.reduce((s, c) => s + (c.mem_percent || 0), 0) / sortedCorrelations.length;
    const elevated = sortedCorrelations.filter(
      c =>
        (c.cpu_percent || 0) >= thresholds.cpu.warning ||
        (c.mem_percent || 0) >= thresholds.memory.warning
    ).length;
    return { elevated, avgCpu, avgMem };
  });

  function isElevated(correlation) {
    return (
      (correlation.cpu_percent || 0) >= thresholds.cpu.warning ||
      (correlation.mem_percent || 0) >= thresholds.memory.warning
    );
  }

  function isAboveAvg(correlation) {
    if (!correlationStats.avgCpu) return false;
    return (
      (correlation.cpu_percent || 0) > correlationStats.avgCpu * 1.5 ||
      (correlation.mem_percent || 0) > correlationStats.avgMem * 1.5
    );
  }

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

  // Load all data. `force` marks a user-initiated refresh (vs. an
  // agent-select change or background reload); it currently only affects
  // logging/intent but is accepted so callers can pass it without error.
  async function fetchAllData(force = false) {
    try {
      loading = true;
      error = null;
      if (force) logger.debug('Manual performance refresh');

      const systemData = await api.get('/system-metrics?limit=500');
      systemMetrics = Array.isArray(systemData) ? systemData : systemData.metrics || [];

      // Discover the agent list from /agents-status so the picker shows real
      // running agents instead of being hardcoded to claude-code.
      try {
        const agentsList = await api.get('/agents-status');
        const names = Array.isArray(agentsList)
          ? agentsList.map(a => a.agent_name).filter(Boolean)
          : [];
        // Only adopt a discovered list when it's non-empty. A transient empty
        // response previously snapped availableAgents/selectedAgent back to
        // names[0], clobbering the user's pick mid-session (the <select>'s
        // onchange re-runs this). Keep the current selection if it's still
        // valid; only fall back to names[0] when it genuinely vanished.
        if (names.length) {
          availableAgents = names;
          if (!names.includes(selectedAgent)) selectedAgent = names[0];
        }
      } catch {
        /* keep the previous selection if discovery fails */
      }

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
    } catch (err) {
      logger.error('Failed to load performance data:', err);
      error = err.message || 'Failed to load performance data';
      loading = false;
    }
  }

  // === Trend charts (real Chart.js line charts) ===
  // Previously CPU/Memory were hand-rolled absolutely-positioned dots — up to
  // ~2000 DOM nodes per system-metrics tick. These are now canvas line charts
  // via chartUtils, which is far cheaper to render and matches sibling pages.
  let cpuChart = null;
  let memChart = null;
  let perfThemeObserver = null;
  let chartRebuildTimer = null;

  // Tiny plugin: draw the warning/critical reference lines on the 0–100 y-axis.
  function thresholdLinesPlugin(type) {
    return {
      id: `thresholds-${type}`,
      afterDraw(chart) {
        const { ctx, chartArea, scales } = chart;
        if (!chartArea || !scales?.y) return;
        const colors = getChartColors();
        const draw = (value, color) => {
          if (!Number.isFinite(value)) return;
          const y = scales.y.getPixelForValue(value);
          if (y < chartArea.top || y > chartArea.bottom) return;
          ctx.save();
          ctx.beginPath();
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = color;
          ctx.lineWidth = 1;
          ctx.moveTo(chartArea.left, y);
          ctx.lineTo(chartArea.right, y);
          ctx.stroke();
          ctx.restore();
        };
        draw(thresholds[type].warning, colors.warning);
        draw(thresholds[type].critical, colors.error);
      }
    };
  }

  function buildTrendCharts() {
    if (activeTab !== 'charts') return;
    const colors = getChartColors();
    const points = chartMetrics.slice().reverse(); // oldest → newest, left → right
    const labels = points.map(m => formatTimestamp(m.timestamp));

    const baseOptions = {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: { legend: { display: false } },
      scales: {
        x: {
          display: true,
          ticks: { maxTicksLimit: 8, font: { size: 11 } },
          grid: { display: false }
        },
        y: { display: true, min: 0, max: 100, ticks: { font: { size: 11 } } }
      }
    };

    // Color each point by its threshold level so the spike colors carry over.
    const pointColor = type => ctx => {
      const v = ctx.parsed?.y ?? 0;
      const level = getAlertLevel(v, type);
      return level === 'critical'
        ? colors.error
        : level === 'warning'
          ? colors.warning
          : type === 'cpu'
            ? colors.primary
            : colors.info;
    };

    cpuChart = createChart('perf-cpu-chart', {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'CPU %',
            data: points.map(m => m.cpu_percent ?? 0),
            borderColor: colors.primary,
            backgroundColor: colors.primary + '20',
            fill: true,
            tension: 0.3,
            borderWidth: 1.5,
            pointRadius: 2,
            pointHoverRadius: 4,
            pointBackgroundColor: pointColor('cpu')
          }
        ]
      },
      options: baseOptions,
      plugins: [thresholdLinesPlugin('cpu')]
    });

    memChart = createChart('perf-mem-chart', {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Memory %',
            data: points.map(m => m.memory_percent ?? 0),
            borderColor: colors.info,
            backgroundColor: colors.info + '20',
            fill: true,
            tension: 0.3,
            borderWidth: 1.5,
            pointRadius: 2,
            pointHoverRadius: 4,
            pointBackgroundColor: pointColor('memory')
          }
        ]
      },
      options: baseOptions,
      plugins: [thresholdLinesPlugin('memory')]
    });
  }

  // Debounce rebuilds so the WS metrics stream (and threshold edits) collapse
  // into a single repaint instead of rebuilding on every tick.
  function scheduleTrendCharts() {
    if (chartRebuildTimer) clearTimeout(chartRebuildTimer);
    chartRebuildTimer = setTimeout(() => {
      chartRebuildTimer = null;
      buildTrendCharts();
    }, 150);
  }

  // Rebuild when the charts tab is active and its inputs change.
  $effect(() => {
    // Track the dependencies that should drive a rebuild.
    void activeTab;
    void chartMetrics;
    void thresholds.cpu.warning;
    void thresholds.cpu.critical;
    void thresholds.memory.warning;
    void thresholds.memory.critical;
    if (activeTab === 'charts') scheduleTrendCharts();
  });

  // WebSocket handlers
  function handleSystemMetrics(metrics) {
    systemMetrics = [metrics, ...systemMetrics].slice(0, SYSTEM_METRICS_CAP);
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

  // Clamp a threshold field to a valid 0–100 number. Clearing a number input
  // sets its bound value to NaN/empty, which made getAlertLevel compare
  // against NaN (every comparison false → silently "normal"). Snap back to a
  // safe number on input instead.
  function clampThreshold(type, field) {
    const v = thresholds[type][field];
    if (typeof v !== 'number' || Number.isNaN(v)) {
      // Fall back to a sane default rather than leaving NaN in place.
      thresholds[type][field] = field === 'critical' ? 90 : 70;
      return;
    }
    thresholds[type][field] = Math.min(100, Math.max(0, v));
  }

  // Helper functions
  function getAlertLevel(value, type) {
    const threshold = thresholds[type];
    if (!threshold) return 'normal';
    const warn = Number.isFinite(threshold.warning) ? threshold.warning : Infinity;
    const crit = Number.isFinite(threshold.critical) ? threshold.critical : Infinity;
    if (value >= crit) return 'critical';
    if (value >= warn) return 'warning';
    return 'normal';
  }

  function formatBytes(bytes) {
    if (!bytes) return 'N/A';
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return gb.toFixed(2) + ' GB';
    const mb = bytes / (1024 * 1024);
    return mb.toFixed(2) + ' MB';
  }

  function formatNumber(num) {
    if (num === null || num === undefined) return 'N/A';
    return num.toLocaleString();
  }

  onMount(() => {
    fetchAllData();

    websocketService.connect();
    websocketService.on('system-metrics', handleSystemMetrics);

    perfThemeObserver = createThemeObserver(() => {
      if (activeTab === 'charts') scheduleTrendCharts();
    });

    return () => {
      abortRequests();
      websocketService.off('system-metrics', handleSystemMetrics);
      if (chartRebuildTimer) clearTimeout(chartRebuildTimer);
      destroyChart(cpuChart);
      destroyChart(memChart);
      if (perfThemeObserver) perfThemeObserver.disconnect();
    };
  });
</script>

<PageLayout>
  <StatusBar prompt="RAVEN.AGENTS" label="Performance" />

  <PageHeader
    title="Performance Profiling"
    description="How hard your machine is working while AI tools run. The metrics tab shows CPU and memory over time; the correlations tab pairs file changes with system load so you can see whether a heavy task lined up with a spike."
  >
    {#snippet actions()}
      <div class="flex items-center gap-3 flex-wrap">
        <FreshnessBadge mode="polled" since={lastUpdated} />
        <ToolbarButton onClick={exportToJSON}>Export JSON</ToolbarButton>
        <ToolbarButton onClick={exportToCSV}>Export CSV</ToolbarButton>
        <RefreshButton onClick={() => fetchAllData(true)} {loading} />
      </div>
    {/snippet}
  </PageHeader>

  <!-- Active Alerts -->
  {#if activeAlerts.length > 0}
    <div class="mb-6 space-y-2">
      {#each activeAlerts as alert (alert.type)}
        {@const isCritical = alert.level === 'critical'}
        {@const isWarning = alert.level === 'warning'}
        <div
          class="border rounded-lg p-4 flex items-center gap-3 {isCritical
            ? 'bg-error-subtle border-error'
            : ''} {isWarning ? 'bg-warning-subtle border-warning' : ''}"
        >
          <div class="flex-1">
            <div class="font-semibold text-heading">
              {alert.type.toUpperCase()} Alert
            </div>
            <div class="text-sm text-muted">
              {alert.message} (threshold: {alert.threshold}%)
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Tab Navigation -->
  <div class="flex bg-surface border border-border rounded overflow-hidden mb-6 w-fit">
    <TabButton active={activeTab === 'metrics'} onClick={() => (activeTab = 'metrics')}>
      Metrics
    </TabButton>
    <TabButton active={activeTab === 'charts'} onClick={() => (activeTab = 'charts')}>
      Trend Charts
    </TabButton>
    <TabButton active={activeTab === 'correlations'} onClick={() => (activeTab = 'correlations')}>
      Correlations
    </TabButton>
  </div>

  <!-- Loading State -->
  {#if loading && systemMetrics.length === 0}
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {#each Array(3) as _, i (i)}
        <div class="h-24 bg-surface border border-border rounded-lg animate-pulse"></div>
      {/each}
    </div>

    <!-- Error State -->
  {:else if error}
    <DataFetchError
      endpoint="/api/system-metrics"
      message="Error loading performance data"
      hint={error}
      onRetry={() => fetchAllData()}
    />

    <!-- Tab Content -->
  {:else if activeTab === 'metrics'}
    <!-- METRICS TAB -->
    {#if latestMetrics}
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <!-- System Metrics Card -->
        <div class="bg-surface border border-border rounded-lg p-5">
          <h3 class="text-xs font-semibold text-muted uppercase tracking-wide mb-4">
            System Metrics
          </h3>
          <div class="space-y-3">
            <div class="flex justify-between items-center">
              <span class="text-sm text-muted">CPU Usage</span>
              <span class="text-sm font-mono text-body">
                {(latestMetrics.cpu_percent ?? 0).toFixed(1)}%
              </span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm text-muted">Memory</span>
              <span class="text-sm font-mono text-body">
                {(latestMetrics.memory_percent ?? 0).toFixed(1)}%
              </span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm text-muted">RAM Used</span>
              <span class="text-sm font-mono text-body">
                {formatNumber(latestMetrics.memory_used_mb)} MB / {formatNumber(
                  latestMetrics.memory_total_mb
                )} MB
              </span>
            </div>
            {#if latestMetrics.network_rx_bytes}
              <div class="flex justify-between items-center">
                <span class="text-sm text-muted">Network RX</span>
                <span class="text-sm font-mono text-body"
                  >{formatBytes(latestMetrics.network_rx_bytes)}</span
                >
              </div>
            {/if}
            {#if latestMetrics.network_tx_bytes}
              <div class="flex justify-between items-center">
                <span class="text-sm text-muted">Network TX</span>
                <span class="text-sm font-mono text-body"
                  >{formatBytes(latestMetrics.network_tx_bytes)}</span
                >
              </div>
            {/if}
          </div>
          <div class="mt-4 pt-3 border-t border-border">
            <p class="text-xs text-muted font-mono text-right">
              {formatTimestamp(latestMetrics.timestamp)}
            </p>
          </div>
        </div>

        <!-- Process Metrics Card -->
        {#if latestProcessMetrics}
          <div class="bg-surface border border-border rounded-lg p-5">
            <h3 class="text-xs font-semibold text-muted uppercase tracking-wide mb-4">
              Process: {latestProcessMetrics.agent_name || selectedAgent}
            </h3>
            <div class="space-y-3">
              <div class="flex justify-between items-center">
                <span class="text-sm text-muted">PID</span>
                <span class="text-sm font-mono text-body">{latestProcessMetrics.pid}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-sm text-muted">CPU</span>
                <span class="text-sm font-mono text-body">
                  {(latestProcessMetrics.cpu_usage ?? 0).toFixed(1)}%
                </span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-sm text-muted">Memory</span>
                <span class="text-sm font-mono text-body"
                  >{formatNumber(latestProcessMetrics.memory_mb)} MB</span
                >
              </div>
              <div class="flex justify-between items-center">
                <span class="text-sm text-muted">Virtual Mem</span>
                <span class="text-sm font-mono text-body"
                  >{formatNumber(latestProcessMetrics.virtual_memory_mb)} MB</span
                >
              </div>
              <div class="flex justify-between items-center">
                <span class="text-sm text-muted">Status</span>
                <span class="text-sm font-mono text-body capitalize"
                  >{latestProcessMetrics.status}</span
                >
              </div>
            </div>
            <div class="mt-4 pt-3 border-t border-border">
              <p class="text-xs text-muted font-mono text-right">
                {formatTimestamp(latestProcessMetrics.timestamp)}
              </p>
            </div>
          </div>
        {:else}
          <div class="bg-surface border border-border rounded-lg p-5 text-center">
            <h3 class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
              Process Metrics
            </h3>
            <p class="text-sm text-muted">No process metrics available</p>
          </div>
        {/if}

        <!-- Statistics Card -->
        {#if stats && stats.sample_count > 0}
          <div class="bg-surface border border-border rounded-lg p-5">
            <h3 class="text-xs font-semibold text-muted uppercase tracking-wide mb-4">
              Last Hour Stats
            </h3>
            <div class="space-y-3">
              <div class="flex justify-between items-center">
                <span class="text-sm text-muted">Avg CPU</span>
                <span class="text-sm font-mono text-body">{stats.avg_cpu_percent.toFixed(1)}%</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-sm text-muted">Peak CPU</span>
                <span class="text-sm font-mono text-body">{stats.max_cpu_percent.toFixed(1)}%</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-sm text-muted">Avg Memory</span>
                <span class="text-sm font-mono text-body"
                  >{stats.avg_memory_percent.toFixed(1)}%</span
                >
              </div>
              <div class="flex justify-between items-center">
                <span class="text-sm text-muted">Peak Memory</span>
                <span class="text-sm font-mono text-body"
                  >{stats.max_memory_percent.toFixed(1)}%</span
                >
              </div>
              <div class="flex justify-between items-center">
                <span class="text-sm text-muted">Samples</span>
                <span class="text-sm font-mono text-body">{formatNumber(stats.sample_count)}</span>
              </div>
            </div>
          </div>
        {/if}
      </div>
    {:else}
      <EmptyState
        title="No performance data available yet"
        description="Metrics are collected automatically when monitoring is active."
      />
    {/if}
  {:else if activeTab === 'charts'}
    <!-- TREND CHARTS TAB -->
    {#if chartMetrics && chartMetrics.length > 0}
      <div>
        <!-- Chart Controls -->
        <div
          class="bg-surface border border-border rounded-lg p-4 mb-6 flex justify-between items-center flex-wrap gap-3"
        >
          <div class="flex items-center gap-3 flex-wrap">
            <span class="text-sm text-muted">Time Range</span>
            <select
              bind:value={chartTimeRange}
              class="px-3 py-1.5 bg-canvas border border-border rounded text-sm font-mono text-body focus:outline-none focus:border-accent transition-colors"
            >
              <option value="15m">Last 15 minutes</option>
              <option value="1h">Last 1 hour</option>
              <option value="6h">Last 6 hours</option>
              <option value="24h">Last 24 hours</option>
            </select>
            {#if availableAgents.length > 1}
              <span class="text-sm text-muted">Agent</span>
              <select
                bind:value={selectedAgent}
                onchange={() => fetchAllData()}
                class="px-3 py-1.5 bg-canvas border border-border rounded text-sm font-mono text-body focus:outline-none focus:border-accent transition-colors"
              >
                {#each availableAgents as agent (agent)}
                  <option value={agent}>{agent}</option>
                {/each}
              </select>
            {/if}
          </div>
          <div class="flex gap-4 text-xs font-mono flex-wrap">
            <span class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-accent"></span>CPU
            </span>
            <span class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-info"></span>Memory
            </span>
            <span class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-warning"></span>Warning
            </span>
            <span class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-error"></span>Critical
            </span>
          </div>
        </div>

        <!-- CPU Chart -->
        <div class="bg-surface border border-border rounded-lg p-5 mb-6">
          <h3 class="text-xs font-semibold text-muted uppercase tracking-wide mb-4">
            CPU Usage Over Time
          </h3>
          <div class="min-h-[200px] h-48 bg-canvas border border-border rounded p-3">
            <canvas id="perf-cpu-chart"></canvas>
          </div>
        </div>

        <!-- Memory Chart -->
        <div class="bg-surface border border-border rounded-lg p-5 mb-6">
          <h3 class="text-xs font-semibold text-muted uppercase tracking-wide mb-4">
            Memory Usage Over Time
          </h3>
          <div class="min-h-[200px] h-48 bg-canvas border border-border rounded p-3">
            <canvas id="perf-mem-chart"></canvas>
          </div>
        </div>

        <!-- Threshold Configuration -->
        <div class="bg-surface border border-border rounded-lg p-5">
          <h3 class="text-xs font-semibold text-muted uppercase tracking-wide mb-4">
            Alert Thresholds
          </h3>
          <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div>
              <label for="cpu-warning" class="text-xs text-muted block mb-2">CPU Warning (%)</label>
              <input
                id="cpu-warning"
                type="number"
                bind:value={thresholds.cpu.warning}
                onchange={() => clampThreshold('cpu', 'warning')}
                min="0"
                max="100"
                class="w-full px-3 py-1.5 bg-canvas border border-border rounded text-sm font-mono text-body focus:outline-none focus:border-accent transition-colors"
              />
            </div>
            <div>
              <label for="cpu-critical" class="text-xs text-muted block mb-2"
                >CPU Critical (%)</label
              >
              <input
                id="cpu-critical"
                type="number"
                bind:value={thresholds.cpu.critical}
                onchange={() => clampThreshold('cpu', 'critical')}
                min="0"
                max="100"
                class="w-full px-3 py-1.5 bg-canvas border border-border rounded text-sm font-mono text-body focus:outline-none focus:border-accent transition-colors"
              />
            </div>
            <div>
              <label for="memory-warning" class="text-xs text-muted block mb-2"
                >Memory Warning (%)</label
              >
              <input
                id="memory-warning"
                type="number"
                bind:value={thresholds.memory.warning}
                onchange={() => clampThreshold('memory', 'warning')}
                min="0"
                max="100"
                class="w-full px-3 py-1.5 bg-canvas border border-border rounded text-sm font-mono text-body focus:outline-none focus:border-accent transition-colors"
              />
            </div>
            <div>
              <label for="memory-critical" class="text-xs text-muted block mb-2"
                >Memory Critical (%)</label
              >
              <input
                id="memory-critical"
                type="number"
                bind:value={thresholds.memory.critical}
                onchange={() => clampThreshold('memory', 'critical')}
                min="0"
                max="100"
                class="w-full px-3 py-1.5 bg-canvas border border-border rounded text-sm font-mono text-body focus:outline-none focus:border-accent transition-colors"
              />
            </div>
          </div>
        </div>
      </div>
    {:else}
      <EmptyState
        title="No metrics data available for charts"
        description="Charts will appear once performance data is collected."
      />
    {/if}
  {:else if activeTab === 'correlations'}
    <!-- CORRELATIONS TAB -->
    {#if sortedCorrelations.length > 0}
      <div>
        <!-- Summary -->
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
          <div class="bg-surface border border-border rounded p-4">
            <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
              Events Analyzed
            </div>
            <div class="text-sm font-mono text-body">{sortedCorrelations.length}</div>
          </div>
          <div
            class="bg-surface border border-border rounded p-4"
            class:border-warning={correlationStats.elevated > 0}
          >
            <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
              During Elevated Usage
            </div>
            <div class="flex items-center gap-2">
              {#if correlationStats.elevated > 0}
                <span class="w-2 h-2 rounded-full bg-warning"></span>
              {/if}
              <span class="text-sm font-mono text-body">{correlationStats.elevated}</span>
            </div>
          </div>
          <div class="bg-surface border border-border rounded p-4">
            <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
              Avg Nearby CPU / Memory
            </div>
            <div class="text-sm font-mono text-body">
              {correlationStats.avgCpu.toFixed(1)}% / {correlationStats.avgMem.toFixed(1)}%
            </div>
          </div>
        </div>

        <!-- Table -->
        <PageSection title="01 // File Changes by Resource Usage">
          <div class="border-t border-b border-border font-mono text-sm overflow-x-auto">
            <table class="w-full">
              <thead class="bg-canvas">
                <tr class="text-[11px] text-muted uppercase tracking-wide">
                  <th class="text-left font-semibold px-3 py-1">File</th>
                  <th class="text-left font-semibold px-3 py-1">Type</th>
                  <th class="text-right font-semibold px-3 py-1">CPU</th>
                  <th class="text-right font-semibold px-3 py-1">Memory</th>
                  <th class="text-right font-semibold px-3 py-1">Size</th>
                  <th class="text-right font-semibold px-3 py-1">Time</th>
                </tr>
              </thead>
              <tbody>
                {#each sortedCorrelations as c (c.event_id)}
                  {@const elevated = isElevated(c)}
                  {@const aboveAvg = isAboveAvg(c)}
                  <tr class="hover:bg-surface/40" class:bg-warning-subtle={elevated}>
                    <td class="px-3 py-0.5 text-body max-w-[20rem] truncate">
                      {c.filepath?.split('/').slice(-2).join('/') || c.filepath}
                    </td>
                    <td class="px-3 py-0.5">
                      <span
                        class="font-bold uppercase {c.change_type === 'add' ||
                        c.change_type === 'created'
                          ? 'text-success'
                          : c.change_type === 'change' || c.change_type === 'modified'
                            ? 'text-accent'
                            : c.change_type === 'unlink' || c.change_type === 'deleted'
                              ? 'text-error'
                              : 'text-muted'}">{c.change_type}</span
                      >
                    </td>
                    <td
                      class="px-3 py-0.5 text-right"
                      class:text-warning={aboveAvg}
                      class:font-bold={elevated}
                      class:text-body={!aboveAvg}
                      >{c.cpu_percent ? c.cpu_percent.toFixed(1) : '-'}%</td
                    >
                    <td
                      class="px-3 py-0.5 text-right"
                      class:text-warning={aboveAvg}
                      class:font-bold={elevated}
                      class:text-body={!aboveAvg}
                      >{c.mem_percent ? c.mem_percent.toFixed(1) : '-'}%</td
                    >
                    <td class="px-3 py-0.5 text-muted text-right">
                      {c.diff_size ? formatNumber(c.diff_size) : '-'}
                    </td>
                    <td class="px-3 py-0.5 text-muted text-right">
                      {formatTimestamp(c.event_timestamp)}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </PageSection>
      </div>
    {:else}
      <EmptyState
        title="No performance correlations found"
        description="Correlations show which file changes coincide with CPU/memory spikes. Make some file changes while the system is under load to see correlations."
      />
    {/if}
  {/if}
</PageLayout>
