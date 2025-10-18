<script>
  import { onMount, onDestroy } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';

  let systemMetrics = [];
  let processMetrics = [];
  let correlations = [];
  let stats = null;
  let selectedAgent = 'claude';
  let refreshInterval = null;
  let loading = true;
  let error = null;

  // Auto-refresh every 5 seconds
  onMount(() => {
    fetchAllData();
    refreshInterval = setInterval(fetchAllData, 5000);
  });

  onDestroy(() => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }
  });

  async function fetchAllData() {
    try {
      loading = true;
      error = null;

      // Fetch system metrics
      systemMetrics = await invoke('get_system_metrics', { limit: 20 });

      // Fetch process metrics for selected agent
      if (selectedAgent) {
        processMetrics = await invoke('get_process_metrics', {
          agentName: selectedAgent,
          limit: 20
        });
      }

      // Fetch performance correlations
      correlations = await invoke('get_performance_correlations', {
        timeWindowSeconds: 5
      });

      // Fetch stats for last hour
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      stats = await invoke('get_metrics_stats', {
        startTime: oneHourAgo.toISOString(),
        endTime: now.toISOString()
      });

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

  // Agents with correlations
  $: availableAgents = [...new Set(correlations.map(c => c.agent))];
</script>

<div class="performance-panel">
  <div class="panel-header">
    <h2>⚡ Performance Profiling</h2>
    <div class="header-controls">
      <select bind:value={selectedAgent} on:change={fetchAllData}>
        <option value="">All Agents</option>
        {#each availableAgents as agent}
          <option value={agent}>{agent}</option>
        {/each}
      </select>
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
          <p>No process metrics available for "{selectedAgent}"</p>
          <p class="hint">Make sure the process is running and tracked</p>
        </div>
      {/if}

      <!-- Statistics Card -->
      {#if stats && stats.sample_count > 0}
        <div class="metric-card">
          <h3>📈 Hourly Statistics</h3>
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

    <!-- Performance Correlations -->
    {#if correlations.length > 0}
      <div class="correlations-section">
        <h3>🔗 Performance Correlations</h3>
        <div class="correlation-list">
          {#each correlations.slice(0, 10) as corr}
            <div class="correlation-item">
              <div class="correlation-header">
                <span class="agent-badge">{corr.agent}</span>
                <span class="event-type">{corr.event_type}</span>
                {#if corr.duration_ms}
                  <span class="duration">{corr.duration_ms}ms</span>
                {/if}
              </div>
              <div class="correlation-metrics">
                {#if corr.system_cpu_percent !== null}
                  <span class="mini-metric">CPU: {corr.system_cpu_percent.toFixed(1)}%</span>
                {/if}
                {#if corr.system_memory_percent !== null}
                  <span class="mini-metric">Mem: {corr.system_memory_percent.toFixed(1)}%</span>
                {/if}
                {#if corr.process_cpu_percent !== null}
                  <span class="mini-metric">Process CPU: {corr.process_cpu_percent.toFixed(1)}%</span>
                {/if}
                {#if corr.process_memory_mb !== null}
                  <span class="mini-metric">Process Mem: {corr.process_memory_mb}MB</span>
                {/if}
              </div>
              <div class="correlation-timestamp">{formatTimestamp(corr.event_timestamp)}</div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {:else if !loading}
    <div class="empty-state">
      <p>No performance data available yet.</p>
      <p>Metrics are collected every 5 seconds automatically.</p>
    </div>
  {/if}
</div>

<style>
  .performance-panel {
    padding: 20px;
    background: #1a1a1a;
    color: #e0e0e0;
    border-radius: 8px;
    min-height: 400px;
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

  select {
    background: #2a2a2a;
    color: #e0e0e0;
    border: 1px solid #444;
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 14px;
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
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
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

  .correlations-section {
    margin-top: 30px;
  }

  .correlations-section h3 {
    color: #ffa500;
    margin-bottom: 15px;
  }

  .correlation-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .correlation-item {
    background: #2a2a2a;
    border: 1px solid #444;
    border-radius: 6px;
    padding: 15px;
  }

  .correlation-header {
    display: flex;
    gap: 10px;
    align-items: center;
    margin-bottom: 8px;
  }

  .agent-badge {
    background: #ffa500;
    color: #000;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: bold;
  }

  .event-type {
    color: #999;
    font-size: 14px;
  }

  .duration {
    margin-left: auto;
    color: #44ff44;
    font-weight: bold;
    font-size: 14px;
  }

  .correlation-metrics {
    display: flex;
    gap: 15px;
    flex-wrap: wrap;
    margin-bottom: 5px;
  }

  .mini-metric {
    font-size: 12px;
    color: #ccc;
    background: #333;
    padding: 4px 8px;
    border-radius: 4px;
  }

  .correlation-timestamp {
    font-size: 11px;
    color: #666;
    text-align: right;
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
