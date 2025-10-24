<script>
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';
  import PageInfo from './PageInfo.svelte';
  import { formatTime } from './timeFormat.js';

  const API_BASE = 'http://localhost:3030/api';

  let activeTab = 'metrics'; // 'metrics', 'charts', or 'correlations'
  let systemMetrics = [];
  let processMetrics = [];
  let stats = null;
  let correlations = [];
  let selectedAgent = 'claude-sonnet-3.5';
  let refreshInterval = null;
  let loading = true;
  let error = null;

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

<div class="performance-panel">
  <PageInfo
    title="Performance Analysis"
    description="This is your Raven performance profiler - think of it like Task Manager / Activity Monitor, but specifically tracking **Raven's resource usage and system impact**. The Performance page shows CPU, memory, and disk metrics over time, helping you diagnose slowdowns, identify resource hogs, and optimize Raven's efficiency. It also correlates performance spikes with AI agent activity to see which agents are resource-intensive."
    keyPoints={[
      '**Metrics Tab - System Metrics Table** - Real-time stats sampled every 10 seconds showing: CPU Usage (percentage like "23%"), Memory Usage (MB like "512 MB"), Load Average (Unix load like "1.5, 1.2, 0.9" for 1/5/15 min averages), Disk I/O (reads/writes per second), Timestamp (when sampled). Newest entries at top. Shows last 20 data points.',
      '**Metrics Tab - Stats Summary** - Aggregated statistics for the last hour: Average CPU (mean percentage), Peak CPU (highest spike), Average Memory (typical RAM usage), Peak Memory (max RAM used). Example: "Avg CPU: 15%, Peak: 87%, Avg Memory: 450MB, Peak: 1.2GB". Helps identify if high usage is sustained or just spikes.',
      '**Correlations Tab** - Matches performance spikes with AI agent events happening at the same time. Shows: Timestamp, Agent name (Claude/GPT/etc.), Event (what the agent did), CPU at that moment, Memory at that moment. Example: "2:45 PM - Claude-Sonnet - edit file - CPU 92%, Memory 1.5GB". Helps answer "Why did CPU spike?" - because Claude was working.',
      '**Real-Time Updates** - Metrics update automatically every 10 seconds via WebSocket. You\'ll see new rows appear at the top of the table as data comes in. Watch in real-time as CPU/memory change while AI agents work.',
      '**Agent Performance Comparison** - (If implemented) Charts comparing different AI agents: Which agent uses the most CPU on average, Which agent consumes the most memory, Which agent has longest response times. Useful for choosing efficient agents.',
      '**Performance Trends** - Line graphs (if implemented) showing CPU/memory over time. Spot patterns like: CPU spikes every 5 minutes (might be a cron job or auto-refresh), Memory steadily increasing (memory leak), Performance degradation over time (needs restart).',
      '**Understanding Load Average** - Unix-specific metric. Shows CPU queue length averaged over 1/5/15 minutes. Rule of thumb: Load < CPU core count = good. Load = CPU cores = saturated. Load > CPU cores = overloaded. Example: On 4-core machine, load "2.0, 1.5, 1.0" is fine. Load "6.0, 5.5, 5.0" means system is struggling.'
    ]}
    whenToCheck="Check Performance **when Raven feels slow or laggy** (to see if CPU/memory is maxed), **when fans spin up loudly** (indicates high CPU), **after adding new triggers or watchers** (to measure impact), **before/after restarting Raven** (compare performance), or **to optimize AI agent usage** (see which agents are resource-hungry)."
    warnings={[
      '**Consistently high CPU (>80% sustained for >5 minutes)** - Raven or an AI agent is CPU-bound. Possible causes: File watcher scanning too many files (reduce watched directories), AI agent stuck in loop (check Agents page), Trigger running expensive computation repeatedly, Background task not terminating. Check Agents and Triggers pages. Consider restarting Raven.',
      '**Memory steadily increasing (memory leak)** - If memory grows from 200MB to 2GB over hours without dropping, there\'s a leak. Memory leaks cause crashes when RAM runs out. Workaround: Restart Raven daily with `./restart.sh`. Long-term: Report as bug with backend logs showing increasing memory.',
      '**Sudden performance drops (CPU/memory normal but UI laggy)** - Frontend rendering issue, not backend. Possible causes: Very large lists in UI (reduce "max events" in Settings), Browser running low on memory (close other tabs), React/Svelte re-rendering too much. Check browser DevTools performance profiler.',
      '**Load average >2x CPU core count** - System is overloaded. Raven might be doing too much. Solutions: Reduce number of monitored projects, Increase file watcher ignore patterns, Disable expensive triggers, Check if other processes are competing for CPU.',
      '**Disk I/O very high (>1000 ops/sec)** - Excessive file watching or database writes. Can slow down the whole system. Check: Are you watching node_modules or other large directories?, Is database being written to constantly?, Is file watcher in a loop?. Exclude large directories in backend ignore patterns.',
      '**No data showing / "Loading..." stuck** - Backend `/api/system-metrics` endpoint not responding. Check Status page to verify backend is online. Metrics collection might be disabled in Settings → Performance. Enable "Collect metrics" and restart Raven.',
      '**Correlations show no AI events** - Either: (1) No AI agents have been active, (2) Time window too narrow (correlations look within 10 seconds), (3) Agents not sending telemetry. Check Agents page to see if agents are reporting.'
    ]}
  />

  <div class="header">
    <h2><span class="lightning-icon">⚡️</span> Performance Profiling</h2>
    <div class="header-actions">
      <button on:click={exportToJSON} class="btn-export" title="Export as JSON">
        📥 JSON
      </button>
      <button on:click={exportToCSV} class="btn-export" title="Export as CSV">
        📥 CSV
      </button>
      <button on:click={fetchAllData} class="btn-refresh">
        ↻ Refresh
      </button>
    </div>
  </div>

  <!-- Alerts Banner -->
  {#if activeAlerts.length > 0 && showAlerts}
    <div class="alerts-banner">
      <div class="banner-header">
        <strong>⚠️ Active Performance Alerts</strong>
        <button class="btn-dismiss" on:click={() => showAlerts = false}>✕</button>
      </div>
      <div class="alerts-list">
        {#each activeAlerts as alert}
          <div class="alert-item alert-{alert.level}">
            <span class="alert-icon">{alert.level === 'critical' ? '🔴' : '🟡'}</span>
            <span class="alert-message">{alert.message}</span>
            <span class="alert-threshold">(threshold: {alert.threshold}%)</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}

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
      class:active={activeTab === 'charts'}
      on:click={() => activeTab = 'charts'}
    >
      📈 Trend Charts
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

  {#if activeTab === 'charts'}
    <!-- Trend Charts View -->
    {#if systemMetrics && systemMetrics.length > 0}
      <div class="charts-section">
        <div class="chart-controls">
          <label>
            Time Range:
            <select bind:value={chartTimeRange} class="time-range-select">
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
        <div class="chart-container">
          <h3>🔥 CPU Usage Over Time</h3>
          <div class="chart">
            <div class="chart-y-axis">
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
              {#each systemMetrics.slice().reverse() as metric, i}
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
        <div class="chart-container">
          <h3>💾 Memory Usage Over Time</h3>
          <div class="chart">
            <div class="chart-y-axis">
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
              {#each systemMetrics.slice().reverse() as metric, i}
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
        <div class="threshold-config">
          <h3>⚙️ Alert Thresholds</h3>
          <div class="threshold-controls">
            <div class="threshold-group">
              <label>CPU Warning (%):</label>
              <input type="number" bind:value={thresholds.cpu.warning} min="0" max="100" class="threshold-input" />
            </div>
            <div class="threshold-group">
              <label>CPU Critical (%):</label>
              <input type="number" bind:value={thresholds.cpu.critical} min="0" max="100" class="threshold-input" />
            </div>
            <div class="threshold-group">
              <label>Memory Warning (%):</label>
              <input type="number" bind:value={thresholds.memory.warning} min="0" max="100" class="threshold-input" />
            </div>
            <div class="threshold-group">
              <label>Memory Critical (%):</label>
              <input type="number" bind:value={thresholds.memory.critical} min="0" max="100" class="threshold-input" />
            </div>
          </div>
        </div>
      </div>
    {:else if !loading}
      <div class="empty-state">
        <p>No metrics data available for charts.</p>
        <p>Charts will appear once performance data is collected.</p>
      </div>
    {/if}
  {:else if activeTab === 'metrics'}
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
    padding: 24px;
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
    font-size: 18px;
    font-weight: 600;
  }

  .lightning-icon {
    font-size: 20px;
    line-height: 1;
    display: inline-block;
    vertical-align: middle;
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
    font-size: 15px;
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
    font-size: 15px;
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
    border-radius: 6px;
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

  /* Alerts Banner */
  .alerts-banner {
    background: color-mix(in srgb, var(--warning) 10%, var(--surface));
    border: 1px solid var(--warning);
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 12px;
  }

  .banner-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
    color: var(--warning);
    font-size: 13px;
  }

  .btn-dismiss {
    background: transparent;
    border: none;
    color: var(--muted);
    cursor: pointer;
    font-size: 14px;
    padding: 4px;
    transition: color 0.2s;
  }

  .btn-dismiss:hover {
    color: var(--error);
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
    padding: 8px 12px;
    background: var(--surface);
    border-radius: 6px;
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
    padding: 16px;
  }

  .chart-controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    padding: 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
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

  .chart-legend {
    display: flex;
    gap: 16px;
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
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 20px;
  }

  .chart-container h3 {
    margin: 0 0 16px 0;
    font-size: 14px;
    color: var(--text);
  }

  .chart {
    display: flex;
    gap: 12px;
    height: 200px;
  }

  .chart-y-axis {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    font-size: 10px;
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
    font-size: 9px;
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
    border-radius: 8px;
    padding: 16px;
    margin-top: 20px;
  }

  .threshold-config h3 {
    margin: 0 0 16px 0;
    font-size: 14px;
    color: var(--text);
  }

  .threshold-controls {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
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
    padding: 8px 12px;
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
