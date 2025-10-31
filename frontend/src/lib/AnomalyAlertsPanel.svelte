<script>
  import { logger } from './logger.js';
  import { onMount, onDestroy } from 'svelte';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import { exportCSV, exportJSON } from './exportUtils.js';
  import { websocketService } from './websocket.js';
  import { API_CONFIG } from '../config.js';
  import { formatDateTime } from './timeFormat.js';

  let anomalies = [];
  let baseline = {};
  let loading = true;
  let error = null;
  let lookbackHours = 24;
  let threshold = 2.0;
  let lastUpdate = new Date();
  let filterSeverity = 'all'; // all, critical, warning, info

  const API_BASE = API_CONFIG.API_BASE;

  // Optimized: compute filtered anomalies and counts in a single pass
  $: anomalyStats = (() => {
    let criticalCount = 0;
    let warningCount = 0;
    let infoCount = 0;
    const filtered = [];

    for (const a of anomalies) {
      // Count by severity
      if (a.severity === 'critical') criticalCount++;
      else if (a.severity === 'warning') warningCount++;
      else if (a.severity === 'info') infoCount++;

      // Filter for display
      if (filterSeverity === 'all' || a.severity === filterSeverity) {
        filtered.push(a);
      }
    }

    return { filtered, criticalCount, warningCount, infoCount };
  })();

  $: filteredAnomalies = anomalyStats.filtered;
  $: criticalCount = anomalyStats.criticalCount;
  $: warningCount = anomalyStats.warningCount;
  $: infoCount = anomalyStats.infoCount;

  // WebSocket event handlers (event-driven, no polling!)
  const handleFileChanged = async () => {
    await loadAnomalies();
  };

  const handleProjectSwitched = async () => {
    await loadAnomalies();
  };

  onMount(async () => {
    await loadAnomalies();

    // Connect to WebSocket for real-time updates
    websocketService.connect();
    websocketService.on('file-changed', handleFileChanged);
    websocketService.on('project-switched', handleProjectSwitched);
  });

  onDestroy(() => {
    // Clean up WebSocket listeners
    websocketService.off('file-changed', handleFileChanged);
    websocketService.off('project-switched', handleProjectSwitched);
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
      logger.error('Failed to load anomalies:', err);
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
    return formatDateTime(timestamp);
  }

  function getTimeSinceUpdate() {
    const seconds = Math.floor((new Date() - lastUpdate) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  }

  // Reactive "time since update" - updates when lastUpdate changes (no polling!)
  $: timeSinceUpdate = getTimeSinceUpdate();

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
</script>

<div class="anomaly-alerts-panel" role="region" aria-label="Anomaly detection alerts">
  <div class="panel-header">
    <div class="header-left">
      <h2 id="anomaly-heading"><span aria-hidden="true">🚨</span> Anomaly Detection</h2>
      <p class="subtitle">Smart alerts for unusual patterns</p>
    </div>
    <div class="header-right" role="toolbar" aria-label="Anomaly panel actions">
      <span class="last-update" role="status" aria-live="polite">Updated: {timeSinceUpdate}</span>
      <button class="btn-secondary" on:click={handleExportCSV} aria-label="Export anomalies as CSV">Export CSV</button>
      <button class="btn-secondary" on:click={handleExportJSON} aria-label="Export anomalies as JSON">Export JSON</button>
      <button class="btn-primary" on:click={loadAnomalies} aria-label="Refresh anomaly detection"><span aria-hidden="true">↻</span> Refresh</button>
    </div>
  </div>

  <div class="controls" role="group" aria-labelledby="anomaly-heading">
    <div class="control-group">
      <label for="hours-select">Lookback:</label>
      <select id="hours-select" bind:value={lookbackHours} on:change={loadAnomalies} aria-label="Select lookback period">
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

  <div class="stats-row" role="group" aria-label="Anomaly statistics">
    <div class="stat-badge critical" role="status">
      <span class="badge-icon" aria-hidden="true">🔴</span>
      <span class="badge-count">{criticalCount}</span>
      <span class="badge-label">Critical</span>
    </div>
    <div class="stat-badge warning" role="status">
      <span class="badge-icon" aria-hidden="true">⚠️</span>
      <span class="badge-count">{warningCount}</span>
      <span class="badge-label">Warnings</span>
    </div>
    <div class="stat-badge info" role="status">
      <span class="badge-icon" aria-hidden="true">🔵</span>
      <span class="badge-count">{infoCount}</span>
      <span class="badge-label">Info</span>
    </div>
    <div class="stat-badge baseline" role="status">
      <span class="badge-icon" aria-hidden="true">📊</span>
      <span class="badge-count">{baseline.avg_per_hour || 0}</span>
      <span class="badge-label">Avg/Hour</span>
    </div>
  </div>

  {#if loading}
    <div role="status" aria-live="polite" aria-busy="true"><LoadingSkeleton /></div>
  {:else if error}
    <div class="error-state" role="alert">
      <p>❌ Error loading anomalies: {error}</p>
      <button on:click={loadAnomalies} aria-label="Retry loading anomalies">Try Again</button>
    </div>
  {:else if filteredAnomalies.length === 0}
    <div class="empty-state" role="status">
      <p>✅ No anomalies detected</p>
      <p class="hint">All activity patterns look normal for the selected period</p>
    </div>
  {:else}
    <div class="anomalies-list" role="feed" aria-label="Anomaly alerts">
      {#each filteredAnomalies as anomaly (anomaly.message)}
        <article class="anomaly-card {getSeverityClass(anomaly.severity)}" role="article">
          <div class="anomaly-header">
            <span class="anomaly-icon" aria-hidden="true">{getSeverityIcon(anomaly.severity)}</span>
            <time class="anomaly-timestamp" datetime="{anomaly.timestamp}">{formatTimestamp(anomaly.timestamp)}</time>
            <span class="anomaly-type">{anomaly.type.replace(/_/g, ' ')}</span>
          </div>
          <div class="anomaly-message">{anomaly.message}</div>
          {#if anomaly.details}
            <div class="anomaly-details">
              {#each Object.entries(anomaly.details) as [key, value] (key)}
                <span class="detail-item">
                  <strong>{key.replace(/_/g, ' ')}:</strong> {value}
                </span>
              {/each}
            </div>
          {/if}
        </article>
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

  .btn-primary:focus,
  .btn-secondary:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
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
