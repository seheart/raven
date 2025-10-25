<script>
  import { onMount, onDestroy } from 'svelte';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import { exportCSV, exportJSON } from './exportUtils.js';

  let metrics = [];
  let loading = true;
  let error = null;
  let timeRange = '1h'; // 1h, 6h, 24h, 7d
  let refreshInterval;

  const API_BASE = 'http://localhost:3030/api';

  onMount(async () => {
    await loadMetrics();
    refreshInterval = setInterval(loadMetrics, 10000); // Refresh every 10s
  });

  onDestroy(() => {
    if (refreshInterval) clearInterval(refreshInterval);
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
      console.error('Failed to load performance metrics:', err);
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

  $: avgCpu = metrics.length > 0 ? (metrics.reduce((sum, m) => sum + (m.cpu_percent || 0), 0) / metrics.length).toFixed(1) : 0;
  $: avgMem = metrics.length > 0 ? (metrics.reduce((sum, m) => sum + (m.memory_percent || 0), 0) / metrics.length).toFixed(1) : 0;
  $: maxCpu = metrics.length > 0 ? Math.max(...metrics.map(m => m.cpu_percent || 0)).toFixed(1) : 0;
  $: maxMem = metrics.length > 0 ? Math.max(...metrics.map(m => m.memory_percent || 0)).toFixed(1) : 0;
</script>

<div class="performance-metrics-panel">
  <div class="panel-header">
    <div class="header-left">
      <h2>📊 Performance Metrics</h2>
      <p class="subtitle">CPU and memory usage over time</p>
    </div>
    <div class="header-right">
      <select bind:value={timeRange} on:change={loadMetrics}>
        <option value="1h">Last Hour</option>
        <option value="6h">Last 6 Hours</option>
        <option value="24h">Last 24 Hours</option>
        <option value="7d">Last 7 Days</option>
      </select>
      <button class="btn-secondary" on:click={handleExportCSV}>Export CSV</button>
      <button class="btn-secondary" on:click={handleExportJSON}>Export JSON</button>
      <button class="btn-primary" on:click={loadMetrics}>↻ Refresh</button>
    </div>
  </div>

  <!-- Stats Summary -->
  <div class="stats-row">
    <div class="stat-card">
      <div class="stat-value">{avgCpu}%</div>
      <div class="stat-label">Avg CPU</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">{maxCpu}%</div>
      <div class="stat-label">Peak CPU</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">{avgMem}%</div>
      <div class="stat-label">Avg Memory</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">{maxMem}%</div>
      <div class="stat-label">Peak Memory</div>
    </div>
  </div>

  {#if loading}
    <LoadingSkeleton />
  {:else if error}
    <div class="error-state">
      <p>❌ Error: {error}</p>
      <button on:click={loadMetrics}>Try Again</button>
    </div>
  {:else if metrics.length === 0}
    <div class="empty-state">
      <p>📭 No metrics data available</p>
      <p class="hint">Metrics are collected every few seconds</p>
    </div>
  {:else}
    <!-- CPU Chart -->
    <div class="chart-container">
      <h3>CPU Usage</h3>
      <svg class="chart" viewBox="0 0 800 200" preserveAspectRatio="xMidYMid meet">
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
    <div class="chart-container">
      <h3>Memory Usage</h3>
      <svg class="chart" viewBox="0 0 800 200" preserveAspectRatio="xMidYMid meet">
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
    padding: 24px;
    max-width: 1400px;
    margin: 0 auto;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 24px;
  }

  .header-left h2 {
    margin: 0 0 4px 0;
    font-size: 24px;
    color: var(--text);
  }

  .subtitle {
    margin: 0;
    color: var(--muted);
    font-size: 14px;
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
    border-radius: 6px;
    color: var(--text);
    font-size: 13px;
    font-family: var(--mono);
  }

  .stats-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
  }

  .stat-card {
    padding: 20px;
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: var(--radius);
    text-align: center;
  }

  .stat-value {
    font-size: 32px;
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
    padding: 20px;
    margin-bottom: 20px;
  }

  .chart-container h3 {
    margin: 0 0 16px 0;
    font-size: 16px;
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
    padding: 60px 20px;
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
