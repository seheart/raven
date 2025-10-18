<script>
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';

  const API_BASE = 'http://localhost:3030/api';

  let systemMetrics = [];
  let processMetrics = [];
  let stats = null;
  let selectedAgent = 'claude-sonnet-3.5';
  let refreshInterval = null;
  let loading = true;
  let error = null;

  onMount(() => {
    fetchAllData();

    // Connect to WebSocket for real-time system metrics
    websocketService.connect();

    // Listen for real-time system metrics
    websocketService.on('system-metrics', (metrics) => {
      // Add new metrics to the beginning of the array
      systemMetrics = [metrics, ...systemMetrics].slice(0, 20);
    });

    // Fallback: refresh every 30 seconds (WebSocket should handle real-time)
    refreshInterval = setInterval(fetchAllData, 30000);
  });

  onDestroy(() => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }

    // Clean up WebSocket listeners
    websocketService.off('system-metrics');
  });

  async function fetchAllData() {
    try {
      loading = true;
      error = null;

      // Fetch system metrics
      const systemResponse = await fetch(`${API_BASE}/system-metrics?limit=20`);
      systemMetrics = await systemResponse.json();

      // Fetch process metrics for selected agent
      if (selectedAgent) {
        const processResponse = await fetch(`${API_BASE}/process-metrics/${selectedAgent}?limit=20`);
        processMetrics = await processResponse.json();
      }

      // Fetch stats for last hour
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const statsResponse = await fetch(`${API_BASE}/metrics-stats?start_time=${oneHourAgo.toISOString()}&end_time=${now.toISOString()}`);
      stats = await statsResponse.json();

      loading = false;
    } catch (err) {
      error = err.toString();
      loading = false;
      console.error('Error fetching performance data:', err);
    }
  }

  function formatTimestamp(ts) {
    const date = new Date(ts);
    return date.toLocaleTimeString();
  }

  function formatBytes(bytes) {
    if (!bytes) return 'N/A';
    const mb = bytes / (1024 * 1024);
    return mb.toFixed(2) + ' MB';
  }

  // Get most recent system metrics
  $: latestMetrics = systemMetrics.length > 0 ? systemMetrics[0] : null;

  // Get most recent process metrics
  $: latestProcessMetrics = processMetrics.length > 0 ? processMetrics[0] : null;
</script>

<div class="performance-panel">
  <div class="panel-header">
    <h2>⚡ Performance Profiling</h2>
    <div class="header-controls">
      <button on:click={fetchAllData} class="refresh-btn">
        🔄 Refresh
      </button>
    </div>
  </div>

  {#if loading && systemMetrics.length === 0}
    <div class="loading">Loading performance data...</div>
  {/if}

  {#if error}
    <div class="error">Error: {error}</div>
  {/if}

  {#if latestMetrics}
    <div class="metrics-grid">
      <!-- System Metrics Card -->
      <div class="metric-card">
        <h3>🖥️ System Metrics</h3>
        <div class="metric-row">
          <span class="label">CPU Usage:</span>
          <span class="value cpu-{latestMetrics.cpu_percent > 80 ? 'high' : latestMetrics.cpu_percent > 50 ? 'medium' : 'low'}">
            {latestMetrics.cpu_percent.toFixed(1)}%
          </span>
        </div>
        <div class="metric-row">
          <span class="label">Memory:</span>
          <span class="value mem-{latestMetrics.memory_percent > 80 ? 'high' : latestMetrics.memory_percent > 50 ? 'medium' : 'low'}">
            {latestMetrics.memory_percent.toFixed(1)}%
          </span>
        </div>
        <div class="metric-row">
          <span class="label">RAM Used:</span>
          <span class="value">{latestMetrics.memory_used_mb} MB / {latestMetrics.memory_total_mb} MB</span>
        </div>
        {#if latestMetrics.network_rx_bytes}
          <div class="metric-row">
            <span class="label">Network RX:</span>
            <span class="value">{formatBytes(latestMetrics.network_rx_bytes)}</span>
          </div>
        {/if}
        {#if latestMetrics.network_tx_bytes}
          <div class="metric-row">
            <span class="label">Network TX:</span>
            <span class="value">{formatBytes(latestMetrics.network_tx_bytes)}</span>
          </div>
        {/if}
        <div class="timestamp">{formatTimestamp(latestMetrics.timestamp)}</div>
      </div>

      <!-- Process Metrics Card -->
      {#if latestProcessMetrics}
        <div class="metric-card">
          <h3>📊 Process: {latestProcessMetrics.agent_name}</h3>
          <div class="metric-row">
            <span class="label">PID:</span>
            <span class="value">{latestProcessMetrics.pid}</span>
          </div>
          <div class="metric-row">
            <span class="label">CPU:</span>
            <span class="value cpu-{latestProcessMetrics.cpu_usage > 80 ? 'high' : latestProcessMetrics.cpu_usage > 50 ? 'medium' : 'low'}">
              {latestProcessMetrics.cpu_usage.toFixed(1)}%
            </span>
          </div>
          <div class="metric-row">
            <span class="label">Memory:</span>
            <span class="value">{latestProcessMetrics.memory_mb} MB</span>
          </div>
          <div class="metric-row">
            <span class="label">Virtual Mem:</span>
            <span class="value">{latestProcessMetrics.virtual_memory_mb} MB</span>
          </div>
          {#if latestProcessMetrics.disk_read_bytes}
            <div class="metric-row">
              <span class="label">Disk Read:</span>
              <span class="value">{formatBytes(latestProcessMetrics.disk_read_bytes)}</span>
            </div>
          {/if}
          {#if latestProcessMetrics.disk_write_bytes}
            <div class="metric-row">
              <span class="label">Disk Write:</span>
              <span class="value">{formatBytes(latestProcessMetrics.disk_write_bytes)}</span>
            </div>
          {/if}
          <div class="metric-row">
            <span class="label">Status:</span>
            <span class="value status-{latestProcessMetrics.status.toLowerCase()}">{latestProcessMetrics.status}</span>
          </div>
          <div class="timestamp">{formatTimestamp(latestProcessMetrics.timestamp)}</div>
        </div>
      {:else}
        <div class="metric-card empty">
          <h3>📊 Process Metrics</h3>
          <p>No process metrics available</p>
          <p class="hint">Start monitoring to collect data</p>
        </div>
      {/if}

      <!-- Statistics Card -->
      {#if stats && stats.sample_count > 0}
        <div class="metric-card">
          <h3>📈 Last Hour Stats</h3>
          <div class="metric-row">
            <span class="label">Avg CPU:</span>
            <span class="value">{stats.avg_cpu_percent.toFixed(1)}%</span>
          </div>
          <div class="metric-row">
            <span class="label">Peak CPU:</span>
            <span class="value cpu-high">{stats.max_cpu_percent.toFixed(1)}%</span>
          </div>
          <div class="metric-row">
            <span class="label">Avg Memory:</span>
            <span class="value">{stats.avg_memory_percent.toFixed(1)}%</span>
          </div>
          <div class="metric-row">
            <span class="label">Peak Memory:</span>
            <span class="value mem-high">{stats.max_memory_percent.toFixed(1)}%</span>
          </div>
          <div class="metric-row">
            <span class="label">Samples:</span>
            <span class="value">{stats.sample_count}</span>
          </div>
        </div>
      {/if}
    </div>
  {:else if !loading}
    <div class="empty-state">
      <p>No performance data available yet.</p>
      <p>Metrics are collected automatically when monitoring is active.</p>
    </div>
  {/if}
</div>

<style>
  .performance-panel {
    padding: 20px;
    background: #0f0f0f;
    color: #e0e0e0;
    min-height: 400px;
    width: 100%;
    position: relative;
    font-family: 'Inter', sans-serif;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    padding-bottom: 15px;
    border-bottom: 2px solid #333;
  }

  .panel-header h2 {
    margin: 0;
    font-size: 24px;
    color: #ffa500;
  }

  .header-controls {
    display: flex;
    gap: 10px;
  }

  .refresh-btn {
    background: #ffa500;
    color: #000;
    border: none;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
    font-size: 14px;
  }

  .refresh-btn:hover {
    background: #ff8c00;
  }

  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr));
    gap: 20px;
    margin-bottom: 20px;
  }

  .metric-card {
    background: #2a2a2a;
    border: 1px solid #444;
    border-radius: 8px;
    padding: 20px;
  }

  .metric-card h3 {
    margin: 0 0 15px 0;
    font-size: 18px;
    color: #ffa500;
    border-bottom: 1px solid #444;
    padding-bottom: 10px;
  }

  .metric-row {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px solid #333;
  }

  .metric-row:last-of-type {
    border-bottom: none;
  }

  .label {
    color: #999;
    font-size: 14px;
  }

  .value {
    font-weight: bold;
    font-size: 14px;
    color: #e0e0e0;
  }

  .cpu-high, .mem-high {
    color: #ff4444;
  }

  .cpu-medium, .mem-medium {
    color: #ffa500;
  }

  .cpu-low, .mem-low {
    color: #44ff44;
  }

  .status-running {
    color: #44ff44;
    text-transform: capitalize;
  }

  .timestamp {
    margin-top: 10px;
    font-size: 12px;
    color: #666;
    text-align: right;
  }

  .empty {
    text-align: center;
    color: #666;
  }

  .hint {
    font-size: 12px;
    color: #999;
    margin-top: 5px;
  }

  .loading, .error, .empty-state {
    text-align: center;
    padding: 40px;
    color: #999;
  }

  .error {
    color: #ff4444;
  }

  .empty-state p {
    margin: 10px 0;
  }
</style>
