<script>
  import { logger } from './logger.js';
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import { formatTime } from './timeFormat.js';
  import { API_CONFIG } from '../config.js';
  import { formatNumber } from './numberFormat.js';

  const API_BASE = API_CONFIG.API_BASE;

  let activeTab = 'metrics'; // 'metrics', 'charts', or 'correlations'
  let systemMetrics = [];
  let processMetrics = [];
  let stats = null;
  let correlations = [];
  let selectedAgent = 'claude-sonnet-3.5';
  let loading = true;
  let error = null;
  let lastUpdated = null;
  let isManualRefresh = false;

  // Performance thresholds
  let thresholds = {
    cpu: { warning: 70, critical: 90 },
    memory: { warning: 75, critical: 95 }
  };

  // Chart settings
  let chartTimeRange = '1h'; // '15m', '1h', '6h', '24h'
  let showAlerts = true;

  // WebSocket event handlers
  const handleSystemMetrics = (metrics) => {
    // Add new metrics to the beginning of the array
    systemMetrics = [metrics, ...systemMetrics].slice(0, 20);
  };

  const handleProjectSwitched = async (data) => {
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
  });

  onDestroy(() => {
    // Clean up WebSocket listeners
    websocketService.off('system-metrics', handleSystemMetrics);
    websocketService.off('project-switched', handleProjectSwitched);
  });

  async function fetchAllData(manual = false) {
    try {
      loading = true;
      isManualRefresh = manual;
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

      lastUpdated = new Date();
      loading = false;
      isManualRefresh = false;
    } catch (err) {
      error = err.toString();
      loading = false;
      isManualRefresh = false;
      logger.error('Error fetching performance data:', err);
    }
  }

  async function fetchCorrelations() {
    try {
      const correlationsResponse = await fetch(`${API_BASE}/performance-correlations?time_window_seconds=10`);
      correlations = await correlationsResponse.json();
    } catch (err) {
      logger.error('Error fetching correlations:', err);
      correlations = [];
    }
  }

  // Format "time ago" for last updated timestamp

  // Reactive "time ago" - updates when lastUpdated changes (no polling!)
  let timeAgo = 'Just now';
  // Update time ago when lastUpdated changes (prevents infinite loop)
  $: if (lastUpdated) {
    if (!lastUpdated) timeAgo = 'Just now';
    else {
      const seconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
      if (seconds < 10) timeAgo = 'Just now';
      else if (seconds < 60) timeAgo = `${seconds}s ago`;
      else if (seconds < 3600) timeAgo = `${Math.floor(seconds / 60)}m ago`;
      else timeAgo = `${Math.floor(seconds / 3600)}h ago`;
    }
  }

  function formatTimestamp(ts) {
    return formatTime(ts);
  }

  function formatBytes(bytes) {
    if (!bytes) return 'N/A';
    const mb = bytes / (1024 * 1024);
    return mb.toFixed(2) + ' MB';
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
    const headers = ['timestamp', 'cpu_percent', 'memory_percent', 'memory_used_mb', 'memory_total_mb'];
    const rows = systemMetrics.map(m => [
      m.timestamp,
      m.cpu_percent,
      m.memory_percent,
      m.memory_used_mb,
      m.memory_total_mb
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `raven-performance-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Check for threshold alerts
  function getAlertLevel(value, type) {
    const threshold = thresholds[type];
    if (!threshold) return 'normal';
    if (value >= threshold.critical) return 'critical';
    if (value >= threshold.warning) return 'warning';
    return 'normal';
  }

  // Get most recent system metrics
  $: latestMetrics = systemMetrics.length > 0 ? systemMetrics[0] : null;

  // Get most recent process metrics
  $: latestProcessMetrics = processMetrics.length > 0 ? processMetrics[0] : null;

  // Active alerts
  $: activeAlerts = (() => {
    if (!latestMetrics || !showAlerts) return [];
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
  })();
</script>

<div class="performance-panel" role="region" aria-label="Performance profiling panel">
  <div class="header">
    <h2 id="performance-heading"><span class="lightning-icon" aria-hidden="true">⚡</span> Performance Profiling</h2>
    <div class="header-actions" role="toolbar" aria-label="Performance panel actions">
      <span class="last-updated" role="status" aria-live="polite">Updated: {timeAgo}</span>
      <button on:click={exportToJSON} class="btn-export" aria-label="Export performance data as JSON">
        <span aria-hidden="true">📥</span> JSON
      </button>
      <button on:click={exportToCSV} class="btn-export" aria-label="Export performance data as CSV">
        <span aria-hidden="true">📥</span> CSV
      </button>
      <button on:click={() => fetchAllData(true)} class="btn-refresh" disabled={loading} aria-label="Refresh performance data">
        <span class="refresh-icon" class:spinning={isManualRefresh} aria-hidden="true">↻</span>
        Refresh
      </button>
    </div>
  </div>

  <!-- Alerts Banner -->
  {#if activeAlerts.length > 0 && showAlerts}
    <div class="alerts-banner" role="alert" aria-live="assertive">
      <div class="banner-header">
        <strong><span aria-hidden="true">⚠️</span> Active Performance Alerts</strong>
        <button class="btn-dismiss" on:click={() => showAlerts = false} aria-label="Dismiss performance alerts">✕</button>
      </div>
      <div class="alerts-list" role="list" aria-label="Active performance alerts">
        {#each activeAlerts as alert (alert)}
          <div class="alert-item alert-{alert.level}" role="listitem">
            <span class="alert-icon" aria-hidden="true">{alert.level === 'critical' ? '🔴' : '🟡'}</span>
            <span class="alert-message">{alert.message}</span>
            <span class="alert-threshold">(threshold: {alert.threshold}%)</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Tab Navigation -->
  <div class="tab-nav" role="tablist" aria-label="Performance panel views">
    <button
      class="tab-btn"
      class:active={activeTab === 'metrics'}
      on:click={() => activeTab = 'metrics'}
      role="tab"
      aria-selected={activeTab === 'metrics'}
      aria-controls="tabpanel-metrics"
      id="tab-metrics"
    >
      <span aria-hidden="true">📊</span> Metrics
    </button>
    <button
      class="tab-btn"
      class:active={activeTab === 'charts'}
      on:click={() => activeTab = 'charts'}
      role="tab"
      aria-selected={activeTab === 'charts'}
      aria-controls="tabpanel-charts"
      id="tab-charts"
    >
      <span aria-hidden="true">📈</span> Trend Charts
    </button>
    <button
      class="tab-btn"
      class:active={activeTab === 'correlations'}
      on:click={() => activeTab = 'correlations'}
      role="tab"
      aria-selected={activeTab === 'correlations'}
      aria-controls="tabpanel-correlations"
      id="tab-correlations"
    >
      <span aria-hidden="true">🔗</span> Correlations
    </button>
  </div>

  {#if loading && systemMetrics.length === 0}
    <LoadingSkeleton count={5} height="80px" />
  {/if}

  {#if error}
    <div class="error">Error: {error}</div>
  {/if}

  {#if activeTab === 'charts'}
    <!-- Trend Charts View -->
    {#if systemMetrics && systemMetrics.length > 0}
      <div class="charts-section" role="tabpanel" id="tabpanel-charts" aria-labelledby="tab-charts">
        <div class="chart-controls" role="region" aria-label="Chart controls">
          <label for="time-range-select">
            Time Range:
            <select id="time-range-select" bind:value={chartTimeRange} class="time-range-select" aria-label="Select time range for charts">
              <option value="15m">Last 15 minutes</option>
              <option value="1h">Last 1 hour</option>
              <option value="6h">Last 6 hours</option>
              <option value="24h">Last 24 hours</option>
            </select>
          </label>
          <div class="chart-legend">
            <span class="legend-item"><span class="legend-color cpu"></span> CPU</span>
            <span class="legend-item"><span class="legend-color mem"></span> Memory</span>
            <span class="legend-item"><span class="legend-color warn"></span> Warning Threshold</span>
            <span class="legend-item"><span class="legend-color crit"></span> Critical Threshold</span>
          </div>
        </div>

        <!-- CPU Chart -->
        <div class="chart-container" role="article" aria-labelledby="cpu-chart-heading">
          <h3 id="cpu-chart-heading"><span aria-hidden="true">🔥</span> CPU Usage Over Time</h3>
          <div class="chart" role="img" aria-label="CPU usage chart showing trend over time">
            <div class="chart-y-axis" aria-hidden="true">
              <span>100%</span>
              <span>75%</span>
              <span>50%</span>
              <span>25%</span>
              <span>0%</span>
            </div>
            <div class="chart-canvas">
              <div class="threshold-line critical" style="bottom: {thresholds.cpu.critical}%">
                <span class="threshold-label">{thresholds.cpu.critical}%</span>
              </div>
              <div class="threshold-line warning" style="bottom: {thresholds.cpu.warning}%">
                <span class="threshold-label">{thresholds.cpu.warning}%</span>
              </div>
              {#each systemMetrics.slice().reverse() as metric, i (i)}
                <div
                  class="data-point cpu-point"
                  class:above-critical={metric.cpu_percent >= thresholds.cpu.critical}
                  class:above-warning={metric.cpu_percent >= thresholds.cpu.warning && metric.cpu_percent < thresholds.cpu.critical}
                  style="left: {(i / (systemMetrics.length - 1)) * 100}%; bottom: {metric.cpu_percent}%"
                  title="{formatTimestamp(metric.timestamp)}: {metric.cpu_percent.toFixed(1)}%"
                ></div>
              {/each}
            </div>
          </div>
        </div>

        <!-- Memory Chart -->
        <div class="chart-container" role="article" aria-labelledby="memory-chart-heading">
          <h3 id="memory-chart-heading"><span aria-hidden="true">💾</span> Memory Usage Over Time</h3>
          <div class="chart" role="img" aria-label="Memory usage chart showing trend over time">
            <div class="chart-y-axis" aria-hidden="true">
              <span>100%</span>
              <span>75%</span>
              <span>50%</span>
              <span>25%</span>
              <span>0%</span>
            </div>
            <div class="chart-canvas">
              <div class="threshold-line critical" style="bottom: {thresholds.memory.critical}%">
                <span class="threshold-label">{thresholds.memory.critical}%</span>
              </div>
              <div class="threshold-line warning" style="bottom: {thresholds.memory.warning}%">
                <span class="threshold-label">{thresholds.memory.warning}%</span>
              </div>
              {#each systemMetrics.slice().reverse() as metric, i (i)}
                <div
                  class="data-point mem-point"
                  class:above-critical={metric.memory_percent >= thresholds.memory.critical}
                  class:above-warning={metric.memory_percent >= thresholds.memory.warning && metric.memory_percent < thresholds.memory.critical}
                  style="left: {(i / (systemMetrics.length - 1)) * 100}%; bottom: {metric.memory_percent}%"
                  title="{formatTimestamp(metric.timestamp)}: {metric.memory_percent.toFixed(1)}%"
                ></div>
              {/each}
            </div>
          </div>
        </div>

        <!-- Threshold Configuration -->
        <div class="threshold-config" role="region" aria-labelledby="threshold-heading">
          <h3 id="threshold-heading"><span aria-hidden="true">⚙️</span> Alert Thresholds</h3>
          <div class="threshold-controls">
            <div class="threshold-group">
              <label for="cpu-warning">CPU Warning (%):</label>
              <input id="cpu-warning" type="number" bind:value={thresholds.cpu.warning} min="0" max="100" class="threshold-input" aria-label="CPU warning threshold percentage" />
            </div>
            <div class="threshold-group">
              <label for="cpu-critical">CPU Critical (%):</label>
              <input id="cpu-critical" type="number" bind:value={thresholds.cpu.critical} min="0" max="100" class="threshold-input" aria-label="CPU critical threshold percentage" />
            </div>
            <div class="threshold-group">
              <label for="memory-warning">Memory Warning (%):</label>
              <input id="memory-warning" type="number" bind:value={thresholds.memory.warning} min="0" max="100" class="threshold-input" aria-label="Memory warning threshold percentage" />
            </div>
            <div class="threshold-group">
              <label for="memory-critical">Memory Critical (%):</label>
              <input id="memory-critical" type="number" bind:value={thresholds.memory.critical} min="0" max="100" class="threshold-input" aria-label="Memory critical threshold percentage" />
            </div>
          </div>
        </div>
      </div>
    {:else if !loading}
      <div class="empty-state" role="status">
        <p>No metrics data available for charts.</p>
        <p>Charts will appear once performance data is collected.</p>
      </div>
    {/if}
  {:else if activeTab === 'metrics'}
    {#if latestMetrics}
    <div class="metrics-grid" role="tabpanel" id="tabpanel-metrics" aria-labelledby="tab-metrics">
      <!-- System Metrics Card -->
      <article class="metric-card" aria-labelledby="system-metrics-heading">
        <h3 id="system-metrics-heading"><span aria-hidden="true">🖥️</span> System Metrics</h3>
        <div class="metric-row">
          <span class="label">CPU Usage:</span>
          <span class="value cpu-{latestMetrics.cpu_percent > 80 ? 'high' : latestMetrics.cpu_percent > 50 ? 'medium' : 'low'}" role="status">
            {latestMetrics.cpu_percent.toFixed(1)}%
          </span>
        </div>
        <div class="metric-row">
          <span class="label">Memory:</span>
          <span class="value mem-{latestMetrics.memory_percent > 80 ? 'high' : latestMetrics.memory_percent > 50 ? 'medium' : 'low'}" role="status">
            {latestMetrics.memory_percent.toFixed(1)}%
          </span>
        </div>
        <div class="metric-row">
          <span class="label">RAM Used:</span>
          <span class="value">{formatNumber(latestMetrics.memory_used_mb)} MB / {formatNumber(latestMetrics.memory_total_mb)} MB</span>
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
        <div class="timestamp"><time datetime={latestMetrics.timestamp}>{formatTimestamp(latestMetrics.timestamp)}</time></div>
      </article>

      <!-- Process Metrics Card -->
      {#if latestProcessMetrics}
        <article class="metric-card" aria-labelledby="process-metrics-heading">
          <h3 id="process-metrics-heading"><span aria-hidden="true">📊</span> Process: {latestProcessMetrics.agent_name}</h3>
          <div class="metric-row">
            <span class="label">PID:</span>
            <span class="value">{latestProcessMetrics.pid}</span>
          </div>
          <div class="metric-row">
            <span class="label">CPU:</span>
            <span class="value cpu-{latestProcessMetrics.cpu_usage > 80 ? 'high' : latestProcessMetrics.cpu_usage > 50 ? 'medium' : 'low'}" role="status">
              {latestProcessMetrics.cpu_usage.toFixed(1)}%
            </span>
          </div>
          <div class="metric-row">
            <span class="label">Memory:</span>
            <span class="value">{formatNumber(latestProcessMetrics.memory_mb)} MB</span>
          </div>
          <div class="metric-row">
            <span class="label">Virtual Mem:</span>
            <span class="value">{formatNumber(latestProcessMetrics.virtual_memory_mb)} MB</span>
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
            <span class="value status-{latestProcessMetrics.status.toLowerCase()}" role="status">{latestProcessMetrics.status}</span>
          </div>
          <div class="timestamp"><time datetime={latestProcessMetrics.timestamp}>{formatTimestamp(latestProcessMetrics.timestamp)}</time></div>
        </article>
      {:else}
        <article class="metric-card empty" role="status">
          <h3><span aria-hidden="true">📊</span> Process Metrics</h3>
          <p>No process metrics available</p>
          <p class="hint">Start monitoring to collect data</p>
        </article>
      {/if}

      <!-- Statistics Card -->
      {#if stats && stats.sample_count > 0}
        <article class="metric-card" aria-labelledby="stats-heading">
          <h3 id="stats-heading"><span aria-hidden="true">📈</span> Last Hour Stats</h3>
          <div class="metric-row">
            <span class="label">Avg CPU:</span>
            <span class="value">{stats.avg_cpu_percent.toFixed(1)}%</span>
          </div>
          <div class="metric-row">
            <span class="label">Peak CPU:</span>
            <span class="value cpu-high" role="status">{stats.max_cpu_percent.toFixed(1)}%</span>
          </div>
          <div class="metric-row">
            <span class="label">Avg Memory:</span>
            <span class="value" role="status">{stats.avg_memory_percent.toFixed(1)}%</span>
          </div>
          <div class="metric-row">
            <span class="label">Peak Memory:</span>
            <span class="value mem-high" role="status">{stats.max_memory_percent.toFixed(1)}%</span>
          </div>
          <div class="metric-row">
            <span class="label">Samples:</span>
            <span class="value" role="status">{formatNumber(stats.sample_count)}</span>
          </div>
        </article>
      {/if}
    </div>
    {:else if !loading}
      <div class="empty-state" role="status">
        <p>No performance data available yet.</p>
        <p>Metrics are collected automatically when monitoring is active.</p>
      </div>
    {/if}
  {:else if activeTab === 'correlations'}
    <!-- Performance Correlations View -->
    {#if correlations && correlations.length > 0}
      <div class="correlations-section" role="tabpanel" id="tabpanel-correlations" aria-labelledby="tab-correlations">
        <div class="section-header">
          <h3 id="correlations-heading"><span aria-hidden="true">🔗</span> Performance Correlations</h3>
          <p class="description">Events that occurred near CPU/memory spikes (within 10 seconds)</p>
        </div>

        <div class="correlations-grid" role="list" aria-label="Performance correlations">
          {#each correlations as correlation (correlation)}
            <article class="correlation-card" role="listitem">
              <div class="correlation-header">
                <span class="file-name">{correlation.filepath}</span>
                <span class="event-type type-{correlation.change_type}" role="status">{correlation.change_type}</span>
              </div>

              <div class="metrics-row">
                <div class="metric-item">
                  <span class="metric-label">CPU Impact:</span>
                  <span class="metric-value cpu-{(correlation.cpu_percent || 0) > 50 ? 'high' : (correlation.cpu_percent || 0) > 25 ? 'medium' : 'low'}" role="status">
                    {correlation.cpu_percent ? correlation.cpu_percent.toFixed(1) : 'N/A'}%
                  </span>
                </div>
                <div class="metric-item">
                  <span class="metric-label">Memory Impact:</span>
                  <span class="metric-value mem-{(correlation.mem_percent || 0) > 50 ? 'high' : (correlation.mem_percent || 0) > 25 ? 'medium' : 'low'}" role="status">
                    {correlation.mem_percent ? correlation.mem_percent.toFixed(1) : 'N/A'}%
                  </span>
                </div>
              </div>

              <div class="correlation-footer">
                <span class="timestamp"><time datetime={correlation.event_timestamp}>{formatTimestamp(correlation.event_timestamp)}</time></span>
                {#if correlation.diff_size}
                  <span class="diff-size" role="status">{formatNumber(correlation.diff_size)} chars changed</span>
                {/if}
              </div>
            </article>
          {/each}
        </div>
      </div>
    {:else if !loading}
      <div class="empty-state" role="status">
        <p>No performance correlations found.</p>
        <p>Correlations show which file changes coincide with CPU/memory spikes.</p>
        <p class="hint">Make some file changes while the system is under load to see correlations.</p>
      </div>
    {/if}
  {/if}
</div>

<style>
  .performance-panel {
    padding: 8px;
    background: var(--bg);
    color: var(--text);
    min-height: 400px;
    position: relative;
    width: 100%;
    font-family: var(--mono);
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
    padding: 0 8px;
  }

  h2 {
    margin: 0;
    font-size: 11px;
    font-weight: 600;
  }

  .lightning-icon {
    font-size: 12px;
    line-height: 1;
    display: inline-block;
    vertical-align: middle;
  }

  .last-updated {
    font-size: 12px;
    color: var(--muted);
    font-family: var(--mono);
  }

  .btn-refresh {
    padding: 8px 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--text);
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .btn-refresh:hover:not(:disabled) {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .btn-refresh:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-refresh:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .refresh-icon {
    display: inline-block;
    font-size: 11px;
  }

  .refresh-icon.spinning {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr));
    gap: 6px;
    margin-bottom: 10px;
  }

  .metric-card {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 6px;
  }

  .metric-card h3 {
    margin: 0 0 15px 0;
    font-size: 11px;
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
    padding: 6px;
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
    padding: 6px 24px;
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

  .tab-btn:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
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
    font-size: 11px;
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
    gap: 6px;
  }

  .correlation-card {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 6px;
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
    margin-bottom: 6px;
    gap: 10px;
  }

  .file-name {
    font-size: 11px;
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

  .type-add, .type-create, .type-created {
    background: color-mix(in srgb, var(--success) 20%, transparent);
    color: var(--success);
  }

  .type-change, .type-edit, .type-modified {
    background: color-mix(in srgb, var(--warning) 20%, transparent);
    color: var(--warning);
  }

  .type-unlink, .type-delete, .type-deleted {
    background: color-mix(in srgb, var(--error) 20%, transparent);
    color: var(--error);
  }

  .metrics-row {
    display: flex;
    gap: 6px;
    margin-bottom: 6px;
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

  /* Header Actions */
  .header-actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .btn-export {
    padding: 8px 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--text);
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    transition: all 0.2s;
  }

  .btn-export:hover {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }

  .btn-export:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  /* Alerts Banner */
  .alerts-banner {
    background: color-mix(in srgb, var(--warning) 10%, var(--surface));
    border: 1px solid var(--warning);
    border-radius: 4px;
    padding: 6px;
    margin-bottom: 6px;
  }

  .banner-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
    color: var(--warning);
    font-size: 11px;
  }

  .btn-dismiss {
    background: transparent;
    border: none;
    color: var(--muted);
    cursor: pointer;
    font-size: 11px;
    padding: 4px;
    transition: color 0.2s;
  }

  .btn-dismiss:hover {
    color: var(--error);
  }

  .btn-dismiss:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .alerts-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .alert-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 8px;
    background: var(--surface);
    border-radius: 3px;
    border-left: 4px solid;
    font-size: 12px;
  }

  .alert-item.alert-warning {
    border-left-color: var(--warning);
  }

  .alert-item.alert-critical {
    border-left-color: var(--error);
  }

  .alert-message {
    flex: 1;
    color: var(--text);
    font-weight: 600;
  }

  .alert-threshold {
    color: var(--muted);
    font-size: 11px;
  }

  /* Charts Section */
  .charts-section {
    padding: 6px;
  }

  .chart-controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    padding: 6px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 3px;
  }

  .time-range-select {
    margin-left: 8px;
    padding: 6px 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
    font-size: 12px;
    cursor: pointer;
  }

  .time-range-select:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .chart-legend {
    display: flex;
    gap: 8px;
    font-size: 12px;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .legend-color {
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }

  .legend-color.cpu {
    background: var(--accent);
  }

  .legend-color.mem {
    background: var(--info);
  }

  .legend-color.warn {
    background: var(--warning);
  }

  .legend-color.crit {
    background: var(--error);
  }

  .chart-container {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 6px;
    margin-bottom: 8px;
  }

  .chart-container h3 {
    margin: 0 0 8px 0;
    font-size: 11px;
    color: var(--text);
  }

  .chart {
    display: flex;
    gap: 6px;
    height: 200px;
  }

  .chart-y-axis {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    font-size: 11px;
    color: var(--muted);
    padding-right: 8px;
    width: 40px;
    text-align: right;
  }

  .chart-canvas {
    position: relative;
    flex: 1;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
  }

  .threshold-line {
    position: absolute;
    left: 0;
    right: 0;
    height: 1px;
    border-top: 2px dashed;
  }

  .threshold-line.warning {
    border-color: var(--warning);
  }

  .threshold-line.critical {
    border-color: var(--error);
  }

  .threshold-label {
    position: absolute;
    right: 4px;
    top: -10px;
    font-size: 11px;
    color: var(--muted);
    background: var(--bg);
    padding: 0 4px;
  }

  .data-point {
    position: absolute;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    transform: translate(-50%, 50%);
    cursor: pointer;
    transition: all 0.2s;
  }

  .data-point:hover {
    width: 10px;
    height: 10px;
  }

  .cpu-point {
    background: var(--accent);
    box-shadow: 0 0 4px var(--accent);
  }

  .mem-point {
    background: var(--info);
    box-shadow: 0 0 4px var(--info);
  }

  .data-point.above-warning {
    background: var(--warning);
    box-shadow: 0 0 6px var(--warning);
  }

  .data-point.above-critical {
    background: var(--error);
    box-shadow: 0 0 8px var(--error);
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  /* Threshold Configuration */
  .threshold-config {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 6px;
    margin-top: 8px;
  }

  .threshold-config h3 {
    margin: 0 0 8px 0;
    font-size: 11px;
    color: var(--text);
  }

  .threshold-controls {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 8px;
  }

  .threshold-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .threshold-group label {
    font-size: 12px;
    color: var(--muted);
    font-weight: 500;
  }

  .threshold-input {
    padding: 4px 8px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
    font-size: 12px;
    font-family: var(--mono);
  }

  .threshold-input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 10%, transparent);
  }
</style>
