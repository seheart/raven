<script>
  import { logger } from './logger.js';
  import { onMount, onDestroy } from 'svelte';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import { exportCSV, exportJSON } from './exportUtils.js';
  import { websocketService } from './websocket.js';
  import { API_CONFIG } from '../config.js';

  let metrics = [];
  let loading = true;
  let error = null;
  let timeRange = '1h'; // 1h, 6h, 24h, 7d

  const API_BASE = API_CONFIG.API_BASE;

  // WebSocket event handlers (event-driven, no polling!)
  const handleSystemMetrics = async () => {
    await loadMetrics();
  };

  const handleProjectSwitched = async () => {
    await loadMetrics();
  };

  onMount(async () => {
    await loadMetrics();

    // Connect to WebSocket for real-time updates
    websocketService.connect();
    websocketService.on('system-metrics', handleSystemMetrics);
    websocketService.on('project-switched', handleProjectSwitched);
  });

  onDestroy(() => {
    // Clean up WebSocket listeners
    websocketService.off('system-metrics', handleSystemMetrics);
    websocketService.off('project-switched', handleProjectSwitched);
  });

  async function loadMetrics() {
    try {
      loading = true;
      const response = await fetch(`${API_BASE}/metrics/performance?range=${timeRange}`);
      if (!response.ok) throw new Error('Failed to fetch metrics');

      const data = await response.json();
      metrics = data.metrics || [];
      error = null;
    } catch (err) {
      logger.error('Failed to load performance metrics:', err);
      error = err.message;
    } finally {
      loading = false;
    }
  }

  function getMaxCpu() {
    return Math.max(...metrics.map(m => m.cpu_percent || 0), 100);
  }

  function getMaxMem() {
    return Math.max(...metrics.map(m => m.memory_percent || 0), 100);
  }

  function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  function handleExportCSV() {
    const data = metrics.map(m => ({
      Timestamp: m.timestamp,
      'CPU %': m.cpu_percent,
      'Memory %': m.memory_percent,
      'Memory Used MB': m.memory_used_mb,
      'Memory Total MB': m.memory_total_mb
    }));
    exportCSV(data, 'performance-metrics');
  }

  function handleExportJSON() {
    exportJSON({ metrics, range: timeRange, exported_at: new Date().toISOString() }, 'performance-metrics');
  }

  // Optimized: compute all stats in a single pass through the metrics array
  $: metricsStats = (() => {
    if (metrics.length === 0) {
      return { avgCpu: 0, avgMem: 0, maxCpu: 0, maxMem: 0 };
    }

    let sumCpu = 0;
    let sumMem = 0;
    let maxCpu = 0;
    let maxMem = 0;

    for (const m of metrics) {
      const cpu = m.cpu_percent || 0;
      const mem = m.memory_percent || 0;
      sumCpu += cpu;
      sumMem += mem;
      if (cpu > maxCpu) maxCpu = cpu;
      if (mem > maxMem) maxMem = mem;
    }

    return {
      avgCpu: (sumCpu / metrics.length).toFixed(1),
      avgMem: (sumMem / metrics.length).toFixed(1),
      maxCpu: maxCpu.toFixed(1),
      maxMem: maxMem.toFixed(1)
    };
  })();

  $: avgCpu = metricsStats.avgCpu;
  $: avgMem = metricsStats.avgMem;
  $: maxCpu = metricsStats.maxCpu;
  $: maxMem = metricsStats.maxMem;
</script>

<div class="performance-metrics-panel" role="region" aria-label="Performance metrics panel">
  <div class="panel-header">
    <div class="header-left">
      <h2 id="perf-metrics-heading"><span aria-hidden="true">📊</span> Performance Metrics</h2>
      <p class="subtitle">CPU and memory usage over time</p>
    </div>
    <div class="header-right" role="toolbar" aria-label="Performance metrics actions" aria-labelledby="perf-metrics-heading">
      <select id="time-range" bind:value={timeRange} on:change={loadMetrics} aria-label="Select time range">
        <option value="1h">Last Hour</option>
        <option value="6h">Last 6 Hours</option>
        <option value="24h">Last 24 Hours</option>
        <option value="7d">Last 7 Days</option>
      </select>
      <button class="btn-secondary" on:click={handleExportCSV} aria-label="Export metrics as CSV">Export CSV</button>
      <button class="btn-secondary" on:click={handleExportJSON} aria-label="Export metrics as JSON">Export JSON</button>
      <button class="btn-primary" on:click={loadMetrics} aria-label="Refresh metrics"><span aria-hidden="true">↻</span> Refresh</button>
    </div>
  </div>

  <!-- Stats Summary -->
  <div class="stats-row" role="list" aria-label="Performance statistics summary">
    <div class="stat-card" role="listitem">
      <div class="stat-value" role="status">{avgCpu}%</div>
      <div class="stat-label">Avg CPU</div>
    </div>
    <div class="stat-card" role="listitem">
      <div class="stat-value" role="status">{maxCpu}%</div>
      <div class="stat-label">Peak CPU</div>
    </div>
    <div class="stat-card" role="listitem">
      <div class="stat-value" role="status">{avgMem}%</div>
      <div class="stat-label">Avg Memory</div>
    </div>
    <div class="stat-card" role="listitem">
      <div class="stat-value" role="status">{maxMem}%</div>
      <div class="stat-label">Peak Memory</div>
    </div>
  </div>

  {#if loading}
    <div role="status" aria-live="polite" aria-label="Loading performance metrics">
      <LoadingSkeleton />
    </div>
  {:else if error}
    <div class="error-state" role="alert">
      <p><span aria-hidden="true">❌</span> Error: {error}</p>
      <button on:click={loadMetrics} aria-label="Try loading metrics again">Try Again</button>
    </div>
  {:else if metrics.length === 0}
    <div class="empty-state" role="status">
      <p><span aria-hidden="true">📭</span> No metrics data available</p>
      <p class="hint">Metrics are collected every few seconds</p>
    </div>
  {:else}
    <!-- CPU Chart -->
    <div class="chart-container" role="region" aria-labelledby="cpu-chart-heading">
      <h3 id="cpu-chart-heading">CPU Usage</h3>
      <svg class="chart" viewBox="0 0 800 200" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs>
          <linearGradient id="cpu-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:#7aa2f7;stop-opacity:0.8" />
            <stop offset="100%" style="stop-color:#7aa2f7;stop-opacity:0.1" />
          </linearGradient>
        </defs>

        <!-- Grid lines -->
        <line x1="0" y1="50" x2="800" y2="50" stroke="var(--border)" stroke-width="1" opacity="0.3" />
        <line x1="0" y1="100" x2="800" y2="100" stroke="var(--border)" stroke-width="1" opacity="0.3" />
        <line x1="0" y1="150" x2="800" y2="150" stroke="var(--border)" stroke-width="1" opacity="0.3" />

        <!-- CPU line -->
        {#if metrics.length > 1}
          {@const maxValue = getMaxCpu()}
          {@const points = metrics.map((m, i) => {
            const x = (i / (metrics.length - 1)) * 800;
            const y = 200 - ((m.cpu_percent / maxValue) * 180);
            return `${x},${y}`;
          }).join(' ')}
          <polyline
            points={points}
            fill="none"
            stroke="#7aa2f7"
            stroke-width="2"
            stroke-linejoin="round"
          />
          <polygon
            points={`0,200 ${points} 800,200`}
            fill="url(#cpu-gradient)"
          />
        {/if}
      </svg>
      <div class="chart-labels">
        <span>{formatTime(metrics[0]?.timestamp)}</span>
        <span>{formatTime(metrics[metrics.length - 1]?.timestamp)}</span>
      </div>
    </div>

    <!-- Memory Chart -->
    <div class="chart-container" role="region" aria-labelledby="memory-chart-heading">
      <h3 id="memory-chart-heading">Memory Usage</h3>
      <svg class="chart" viewBox="0 0 800 200" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs>
          <linearGradient id="mem-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:#10b981;stop-opacity:0.8" />
            <stop offset="100%" style="stop-color:#10b981;stop-opacity:0.1" />
          </linearGradient>
        </defs>

        <!-- Grid lines -->
        <line x1="0" y1="50" x2="800" y2="50" stroke="var(--border)" stroke-width="1" opacity="0.3" />
        <line x1="0" y1="100" x2="800" y2="100" stroke="var(--border)" stroke-width="1" opacity="0.3" />
        <line x1="0" y1="150" x2="800" y2="150" stroke="var(--border)" stroke-width="1" opacity="0.3" />

        <!-- Memory line -->
        {#if metrics.length > 1}
          {@const maxValue = getMaxMem()}
          {@const points = metrics.map((m, i) => {
            const x = (i / (metrics.length - 1)) * 800;
            const y = 200 - ((m.memory_percent / maxValue) * 180);
            return `${x},${y}`;
          }).join(' ')}
          <polyline
            points={points}
            fill="none"
            stroke="#10b981"
            stroke-width="2"
            stroke-linejoin="round"
          />
          <polygon
            points={`0,200 ${points} 800,200`}
            fill="url(#mem-gradient)"
          />
        {/if}
      </svg>
      <div class="chart-labels">
        <span>{formatTime(metrics[0]?.timestamp)}</span>
        <span>{formatTime(metrics[metrics.length - 1]?.timestamp)}</span>
      </div>
    </div>
  {/if}
</div>

<style>
  .performance-metrics-panel {
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

  select {
    padding: 8px 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--text);
    font-size: 13px;
    font-family: var(--mono);
  }

  select:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .stats-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 8px;
    margin-bottom: 8px;
  }

  .stat-card {
    padding: 8px;
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: var(--radius);
    text-align: center;
  }

  .stat-value {
    font-size: 11px;
    font-weight: 700;
    font-family: var(--mono);
    color: var(--accent);
    margin-bottom: 8px;
  }

  .stat-label {
    font-size: 12px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .chart-container {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 8px;
    margin-bottom: 8px;
  }

  .chart-container h3 {
    margin: 0 0 8px 0;
    font-size: 11px;
    color: var(--text);
  }

  .chart {
    width: 100%;
    height: auto;
  }

  .chart-labels {
    display: flex;
    justify-content: space-between;
    margin-top: 8px;
    font-size: 12px;
    color: var(--muted);
    font-family: var(--mono);
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

  .btn-secondary {
    background: var(--surface);
    color: var(--text);
  }

  .btn-secondary:hover {
    background: var(--surface-2);
    border-color: var(--accent);
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
    color: var(--text);
  }

  .hint {
    font-size: 13px;
    color: var(--muted);
  }
</style>
