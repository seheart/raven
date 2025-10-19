<script>
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';

  const API_BASE = 'http://localhost:3030/api';

  let activeTab = 'metrics'; // 'metrics' or 'correlations'
  let systemMetrics = [];
  let processMetrics = [];
  let stats = null;
  let correlations = [];
  let selectedAgent = 'claude-sonnet-3.5';
  let refreshInterval = null;
  let loading = true;
  let error = null;

  // WebSocket event handlers
  const handleSystemMetrics = (metrics) => {
    // Add new metrics to the beginning of the array
    systemMetrics = [metrics, ...systemMetrics].slice(0, 20);
  };

  const handleProjectSwitched = async (data) => {
    console.log('📡 Project switched, reloading performance data:', data.project);
    await fetchAllData();
  };

  onMount(() => {
    fetchAllData();

    // Connect to WebSocket for real-time system metrics
    websocketService.connect();

    // Listen for real-time system metrics
    websocketService.on('system-metrics', handleSystemMetrics);

    // Listen for project switch events
    websocketService.on('project-switched', handleProjectSwitched);

    // Fallback: refresh every 30 seconds (WebSocket should handle real-time)
    refreshInterval = setInterval(fetchAllData, 30000);
  });

  onDestroy(() => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }

    // Clean up WebSocket listeners
    websocketService.off('system-metrics', handleSystemMetrics);
    websocketService.off('project-switched', handleProjectSwitched);
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

      // Fetch performance correlations
      await fetchCorrelations();

      loading = false;
    } catch (err) {
      error = err.toString();
      loading = false;
      console.error('Error fetching performance data:', err);
    }
  }

  async function fetchCorrelations() {
    try {
      const correlationsResponse = await fetch(`${API_BASE}/performance-correlations?time_window_seconds=10`);
      correlations = await correlationsResponse.json();
    } catch (err) {
      console.error('Error fetching correlations:', err);
      correlations = [];
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
  <div class="header">
    <h2>⚡ Performance Profiling</h2>
    <button on:click={fetchAllData} class="btn-refresh">
      ↻ Refresh
    </button>
  </div>

  <!-- Tab Navigation -->
  <div class="tab-nav">
    <button
      class="tab-btn"
      class:active={activeTab === 'metrics'}
      on:click={() => activeTab = 'metrics'}
    >
      📊 Metrics
    </button>
    <button
      class="tab-btn"
      class:active={activeTab === 'correlations'}
      on:click={() => activeTab = 'correlations'}
    >
      🔗 Correlations
    </button>
  </div>

  {#if loading && systemMetrics.length === 0}
    <div class="loading">Loading performance data...</div>
  {/if}

  {#if error}
    <div class="error">Error: {error}</div>
  {/if}

  {#if activeTab === 'metrics'}
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
  {:else if activeTab === 'correlations'}
    <!-- Performance Correlations View -->
    {#if correlations && correlations.length > 0}
      <div class="correlations-section">
        <div class="section-header">
          <h3>🔗 Performance Correlations</h3>
          <p class="description">Events that occurred near CPU/memory spikes (within 10 seconds)</p>
        </div>

        <div class="correlations-grid">
          {#each correlations as correlation}
            <div class="correlation-card">
              <div class="correlation-header">
                <span class="file-name">{correlation.filepath}</span>
                <span class="event-type type-{correlation.change_type}">{correlation.change_type}</span>
              </div>

              <div class="metrics-row">
                <div class="metric-item">
                  <span class="metric-label">CPU Impact:</span>
                  <span class="metric-value cpu-{(correlation.cpu_percent || 0) > 50 ? 'high' : (correlation.cpu_percent || 0) > 25 ? 'medium' : 'low'}">
                    {correlation.cpu_percent ? correlation.cpu_percent.toFixed(1) : 'N/A'}%
                  </span>
                </div>
                <div class="metric-item">
                  <span class="metric-label">Memory Impact:</span>
                  <span class="metric-value mem-{(correlation.mem_percent || 0) > 50 ? 'high' : (correlation.mem_percent || 0) > 25 ? 'medium' : 'low'}">
                    {correlation.mem_percent ? correlation.mem_percent.toFixed(1) : 'N/A'}%
                  </span>
                </div>
              </div>

              <div class="correlation-footer">
                <span class="timestamp">{formatTimestamp(correlation.event_timestamp)}</span>
                {#if correlation.diff_size}
                  <span class="diff-size">{correlation.diff_size} chars changed</span>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {:else if !loading}
      <div class="empty-state">
        <p>No performance correlations found.</p>
        <p>Correlations show which file changes coincide with CPU/memory spikes.</p>
        <p class="hint">Make some file changes while the system is under load to see correlations.</p>
      </div>
    {/if}
  {/if}
</div>

<style>
  .performance-panel {
    padding: 12px;
    background: var(--bg);
    color: var(--text);
    min-height: 400px;
    width: 100%;
    position: relative;
    font-family: var(--mono);
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }

  h2 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
  }

  .btn-refresh {
    padding: 8px 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    cursor: pointer;
    font-size: 12px;
    transition: all 0.2s;
  }

  .btn-refresh:hover {
    background: var(--surface-2);
    border-color: var(--border);
  }

  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr));
    gap: 12px;
    margin-bottom: 10px;
  }

  .metric-card {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px;
  }

  .metric-card h3 {
    margin: 0 0 15px 0;
    font-size: 12px;
    color: var(--warning);
    border-bottom: 1px solid var(--border);
    padding-bottom: 10px;
  }

  .metric-row {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px solid var(--border);
  }

  .metric-row:last-of-type {
    border-bottom: none;
  }

  .label {
    color: var(--muted);
    font-size: 12px;
  }

  .value {
    font-weight: bold;
    font-size: 12px;
    color: var(--text);
  }

  .cpu-high, .mem-high {
    color: var(--error);
  }

  .cpu-medium, .mem-medium {
    color: var(--warning);
  }

  .cpu-low, .mem-low {
    color: var(--success);
  }

  .status-running {
    color: var(--success);
    text-transform: capitalize;
  }

  .timestamp {
    margin-top: 10px;
    font-size: 12px;
    color: var(--muted);
    text-align: right;
  }

  .empty {
    text-align: center;
    color: var(--muted);
  }

  .hint {
    font-size: 12px;
    color: var(--muted);
    margin-top: 5px;
  }

  .loading, .error, .empty-state {
    text-align: center;
    padding: 16px;
    color: var(--muted);
  }

  .error {
    color: var(--error);
  }

  .empty-state p {
    margin: 10px 0;
  }

  /* Tab Navigation */
  .tab-nav {
    display: flex;
    gap: 10px;
    margin-bottom: 10px;
    border-bottom: 2px solid var(--border);
    padding-bottom: 0;
  }

  .tab-btn {
    background: transparent;
    color: var(--muted);
    border: none;
    padding: 12px 24px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    border-bottom: 3px solid transparent;
    transition: all 0.2s;
    margin-bottom: -2px;
  }

  .tab-btn:hover {
    color: var(--warning);
    background: color-mix(in srgb, var(--warning) 5%, transparent);
  }

  .tab-btn.active {
    color: var(--warning);
    border-bottom-color: var(--warning);
  }

  /* Correlations Styles */
  .correlations-section {
    width: 100%;
  }

  .section-header {
    margin-bottom: 10px;
  }

  .section-header h3 {
    margin: 0 0 8px 0;
    font-size: 12px;
    color: var(--warning);
  }

  .description {
    margin: 0;
    font-size: 12px;
    color: var(--muted);
  }

  .correlations-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
    gap: 12px;
  }

  .correlation-card {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
    border-left: 4px solid var(--warning);
    transition: all 0.2s;
  }

  .correlation-card:hover {
    background: var(--surface-2);
    border-left-color: var(--warning);
  }

  .correlation-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    gap: 10px;
  }

  .file-name {
    font-size: 13px;
    font-family: 'Courier New', monospace;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .event-type {
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: bold;
    text-transform: uppercase;
  }

  .type-add {
    background: color-mix(in srgb, var(--success) 20%, transparent);
    color: var(--success);
  }

  .type-change {
    background: color-mix(in srgb, var(--warning) 20%, transparent);
    color: var(--warning);
  }

  .type-unlink {
    background: color-mix(in srgb, var(--error) 20%, transparent);
    color: var(--error);
  }

  .metrics-row {
    display: flex;
    gap: 12px;
    margin-bottom: 12px;
  }

  .metric-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .metric-label {
    font-size: 12px;
    color: var(--muted);
  }

  .metric-value {
    font-size: 12px;
    font-weight: bold;
  }

  .correlation-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 12px;
    border-top: 1px solid var(--border);
    font-size: 12px;
    color: var(--muted);
  }

  .diff-size {
    color: var(--muted);
  }
</style>
