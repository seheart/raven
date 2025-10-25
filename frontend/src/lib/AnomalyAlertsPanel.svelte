<script>
  import { onMount, onDestroy } from 'svelte';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import { exportCSV, exportJSON } from './exportUtils.js';

  let anomalies = [];
  let baseline = {};
  let loading = true;
  let error = null;
  let lookbackHours = 24;
  let threshold = 2.0;
  let lastUpdate = new Date();
  let refreshInterval;
  let filterSeverity = 'all'; // all, critical, warning, info

  const API_BASE = 'http://localhost:3030/api';

  $: filteredAnomalies = anomalies.filter(a => {
    if (filterSeverity === 'all') return true;
    return a.severity === filterSeverity;
  });

  $: criticalCount = anomalies.filter(a => a.severity === 'critical').length;
  $: warningCount = anomalies.filter(a => a.severity === 'warning').length;
  $: infoCount = anomalies.filter(a => a.severity === 'info').length;

  onMount(async () => {
    await loadAnomalies();
    // Auto-refresh every 60 seconds
    refreshInterval = setInterval(async () => {
      await loadAnomalies();
    }, 60000);
  });

  onDestroy(() => {
    if (refreshInterval) clearInterval(refreshInterval);
  });

  async function loadAnomalies() {
    try {
      loading = true;
      const response = await fetch(`${API_BASE}/anomalies/detect?hours=${lookbackHours}&threshold=${threshold}`);
      if (!response.ok) throw new Error('Failed to fetch anomalies');

      const data = await response.json();
      anomalies = data.anomalies || [];
      baseline = data.baseline || {};
      lastUpdate = new Date();
      error = null;
    } catch (err) {
      console.error('Failed to load anomalies:', err);
      error = err.message;
    } finally {
      loading = false;
    }
  }

  function getSeverityIcon(severity) {
    return {
      critical: '🔴',
      warning: '⚠️',
      info: '🔵'
    }[severity] || '📊';
  }

  function getSeverityClass(severity) {
    return `severity-${severity}`;
  }

  function formatTimestamp(timestamp) {
    return new Date(timestamp).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  function getTimeSinceUpdate() {
    const seconds = Math.floor((new Date() - lastUpdate) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  }

  function handleExportCSV() {
    const data = anomalies.map(a => ({
      Timestamp: a.timestamp,
      Type: a.type,
      Severity: a.severity,
      Message: a.message
    }));
    exportCSV(data, 'anomaly-alerts');
  }

  function handleExportJSON() {
    const data = {
      lookback_hours: lookbackHours,
      threshold,
      baseline,
      anomalies,
      exported_at: new Date().toISOString()
    };
    exportJSON(data, 'anomaly-alerts');
  }

  // Update time display every second
  let timeInterval;
  onMount(() => {
    timeInterval = setInterval(() => {
      lastUpdate = lastUpdate; // Trigger reactivity
    }, 1000);
  });
  onDestroy(() => {
    if (timeInterval) clearInterval(timeInterval);
  });
</script>

<div class="anomaly-alerts-panel">
  <div class="panel-header">
    <div class="header-left">
      <h2>🚨 Anomaly Detection</h2>
      <p class="subtitle">Smart alerts for unusual patterns</p>
    </div>
    <div class="header-right">
      <span class="last-update">Updated: {getTimeSinceUpdate()}</span>
      <button class="btn-secondary" on:click={handleExportCSV}>Export CSV</button>
      <button class="btn-secondary" on:click={handleExportJSON}>Export JSON</button>
      <button class="btn-primary" on:click={loadAnomalies}>↻ Refresh</button>
    </div>
  </div>

  <div class="controls">
    <div class="control-group">
      <label for="hours-select">Lookback:</label>
      <select id="hours-select" bind:value={lookbackHours} on:change={loadAnomalies}>
        <option value="6">6 hours</option>
        <option value="12">12 hours</option>
        <option value="24">24 hours</option>
        <option value="48">48 hours</option>
        <option value="168">7 days</option>
      </select>
    </div>
    <div class="control-group">
      <label for="threshold-select">Sensitivity:</label>
      <select id="threshold-select" bind:value={threshold} on:change={loadAnomalies}>
        <option value="1.0">High (1σ)</option>
        <option value="2.0">Medium (2σ)</option>
        <option value="3.0">Low (3σ)</option>
      </select>
    </div>
    <div class="control-group">
      <label for="severity-filter">Filter:</label>
      <select id="severity-filter" bind:value={filterSeverity}>
        <option value="all">All Severities</option>
        <option value="critical">Critical Only</option>
        <option value="warning">Warnings Only</option>
        <option value="info">Info Only</option>
      </select>
    </div>
  </div>

  <div class="stats-row">
    <div class="stat-badge critical">
      <span class="badge-icon">🔴</span>
      <span class="badge-count">{criticalCount}</span>
      <span class="badge-label">Critical</span>
    </div>
    <div class="stat-badge warning">
      <span class="badge-icon">⚠️</span>
      <span class="badge-count">{warningCount}</span>
      <span class="badge-label">Warnings</span>
    </div>
    <div class="stat-badge info">
      <span class="badge-icon">🔵</span>
      <span class="badge-count">{infoCount}</span>
      <span class="badge-label">Info</span>
    </div>
    <div class="stat-badge baseline">
      <span class="badge-icon">📊</span>
      <span class="badge-count">{baseline.avg_per_hour || 0}</span>
      <span class="badge-label">Avg/Hour</span>
    </div>
  </div>

  {#if loading}
    <LoadingSkeleton />
  {:else if error}
    <div class="error-state">
      <p>❌ Error loading anomalies: {error}</p>
      <button on:click={loadAnomalies}>Try Again</button>
    </div>
  {:else if filteredAnomalies.length === 0}
    <div class="empty-state">
      <p>✅ No anomalies detected</p>
      <p class="hint">All activity patterns look normal for the selected period</p>
    </div>
  {:else}
    <div class="anomalies-list">
      {#each filteredAnomalies as anomaly (anomaly.timestamp + anomaly.type)}
        <div class="anomaly-card {getSeverityClass(anomaly.severity)}">
          <div class="anomaly-header">
            <span class="anomaly-icon">{getSeverityIcon(anomaly.severity)}</span>
            <span class="anomaly-timestamp">{formatTimestamp(anomaly.timestamp)}</span>
            <span class="anomaly-type">{anomaly.type.replace(/_/g, ' ')}</span>
          </div>
          <div class="anomaly-message">{anomaly.message}</div>
          {#if anomaly.details}
            <div class="anomaly-details">
              {#each Object.entries(anomaly.details) as [key, value]}
                <span class="detail-item">
                  <strong>{key.replace(/_/g, ' ')}:</strong> {value}
                </span>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .anomaly-alerts-panel {
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

  .last-update {
    font-size: 12px;
    color: var(--muted);
  }

  .controls {
    display: flex;
    gap: 24px;
    margin-bottom: 24px;
    padding: 16px;
    background: var(--surface);
    border-radius: var(--radius);
    border: 1px solid var(--border);
  }

  .control-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .control-group label {
    font-size: 14px;
    color: var(--muted);
    font-weight: 500;
  }

  .control-group select {
    padding: 6px 12px;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font-family: var(--mono);
    font-size: 13px;
    cursor: pointer;
  }

  .stats-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
  }

  .stat-badge {
    padding: 16px;
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: var(--radius);
    display: flex;
    align-items: center;
    gap: 12px;
    transition: all 0.2s;
  }

  .stat-badge.critical {
    border-color: var(--error, #f7768e);
  }

  .stat-badge.warning {
    border-color: var(--warning, #e0af68);
  }

  .stat-badge.info {
    border-color: var(--accent, #7aa2f7);
  }

  .badge-icon {
    font-size: 24px;
  }

  .badge-count {
    font-size: 28px;
    font-weight: 700;
    font-family: var(--mono);
    color: var(--text);
  }

  .badge-label {
    font-size: 12px;
    color: var(--muted);
    text-transform: uppercase;
  }

  .anomalies-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .anomaly-card {
    padding: 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-left: 4px solid;
    border-radius: var(--radius);
    transition: all 0.2s;
  }

  .anomaly-card:hover {
    transform: translateX(4px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .anomaly-card.severity-critical {
    border-left-color: var(--error, #f7768e);
  }

  .anomaly-card.severity-warning {
    border-left-color: var(--warning, #e0af68);
  }

  .anomaly-card.severity-info {
    border-left-color: var(--accent, #7aa2f7);
  }

  .anomaly-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
  }

  .anomaly-icon {
    font-size: 20px;
  }

  .anomaly-timestamp {
    font-size: 12px;
    color: var(--muted);
    font-family: var(--mono);
  }

  .anomaly-type {
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    background: var(--bg);
    padding: 2px 8px;
    border-radius: 3px;
  }

  .anomaly-message {
    font-size: 14px;
    color: var(--text);
    margin-bottom: 8px;
    line-height: 1.5;
  }

  .anomaly-details {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    padding-top: 8px;
    border-top: 1px solid var(--border);
  }

  .detail-item {
    font-size: 12px;
    color: var(--muted);
    font-family: var(--mono);
  }

  .detail-item strong {
    color: var(--text);
    text-transform: capitalize;
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

  .btn-primary:hover {
    opacity: 0.9;
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

  @media (max-width: 768px) {
    .panel-header {
      flex-direction: column;
      gap: 16px;
    }

    .header-right {
      flex-wrap: wrap;
    }

    .controls {
      flex-direction: column;
    }

    .stats-row {
      grid-template-columns: 1fr 1fr;
    }
  }
</style>
