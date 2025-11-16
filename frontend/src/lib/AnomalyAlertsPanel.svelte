<script>
  import { logger } from './logger.js';
  import { onMount, onDestroy } from 'svelte';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import { exportCSV, exportJSON } from './exportUtils.js';
  import { websocketService } from './websocket.js';
  import { API_CONFIG } from '../config.js';
  import { formatDateTime, getTimeAgo } from './timeFormat.js';
  import { activeProject } from './projectStore.js';

  let anomalies = [];
  let stats = null;
  let loading = true;
  let error = null;
  let limit = 20;
  let lastUpdate = new Date();
  let filterRiskLevel = 'all'; // all, high, medium, low

  const API_BASE = API_CONFIG.API_BASE;

  // Computed stats with filtering
  $: filteredAnomalies =
    filterRiskLevel === 'all' ? anomalies : anomalies.filter(a => a.risk_level === filterRiskLevel);

  $: highCount = stats?.high_risk || 0;
  $: mediumCount = stats?.medium_risk || 0;
  $: lowCount = stats?.low_risk || 0;
  $: totalCount = stats?.total_anomalies || 0;
  $: avgScore = stats?.avg_score || 0;

  // WebSocket event handlers
  const handleAnomalyDetected = async event => {
    logger.info('New anomaly detected:', event);
    await loadAnomalies();
  };

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
    websocketService.on('anomaly-detected', handleAnomalyDetected);
    websocketService.on('file-changed', handleFileChanged);
    websocketService.on('project-switched', handleProjectSwitched);
  });

  onDestroy(() => {
    websocketService.off('anomaly-detected', handleAnomalyDetected);
    websocketService.off('file-changed', handleFileChanged);
    websocketService.off('project-switched', handleProjectSwitched);
  });

  async function loadAnomalies() {
    try {
      loading = true;
      const project = $activeProject || 'raven';

      // Load both stats and recent anomalies
      const [statsRes, anomaliesRes] = await Promise.all([
        fetch(`${API_BASE}/anomalies/stats?project=${project}`),
        fetch(`${API_BASE}/anomalies/recent?project=${project}&limit=${limit}`)
      ]);

      if (!statsRes.ok || !anomaliesRes.ok) {
        throw new Error('Failed to fetch anomalies');
      }

      stats = await statsRes.json();
      const anomaliesData = await anomaliesRes.json();
      anomalies = anomaliesData.anomalies || [];

      lastUpdate = new Date();
      error = null;
    } catch (err) {
      logger.error('Failed to load anomalies:', error);
      errorMessage = error.message;
    } finally {
      loading = false;
    }
  }

  function getRiskIcon(riskLevel) {
    return (
      {
        high: '🔴',
        medium: '⚠️',
        low: '🔵'
      }[riskLevel] || '📊'
    );
  }

  function getRiskClass(riskLevel) {
    return `risk-${riskLevel}`;
  }

  function formatTimestamp(timestamp) {
    return formatDateTime(timestamp);
  }

  $: timeSinceUpdate = getTimeAgo(lastUpdate);

  function handleExportCSV() {
    const data = anomalies.map(a => ({
      Timestamp: a.timestamp,
      File: a.filepath,
      ChangeType: a.change_type,
      Score: a.anomaly_score,
      RiskLevel: a.risk_level,
      Agent: a.agent || 'unknown',
      Confidence: a.anomaly_confidence
    }));
    exportCSV(data, 'anomalies-v2');
  }

  function handleExportJSON() {
    const data = {
      stats,
      anomalies,
      exported_at: new Date().toISOString()
    };
    exportJSON(data, 'anomalies-v2');
  }
</script>

<div class="anomaly-alerts-panel" role="region" aria-label="Anomaly detection v2">
  <div class="panel-header">
    <div class="header-left">
      <h2 id="anomaly-heading"><span aria-hidden="true">🚨</span> Anomaly Detection</h2>
      <p class="subtitle">Statistical analysis • Pattern recognition • Risk scoring</p>
    </div>
    <div class="header-right" role="toolbar" aria-label="Anomaly panel actions">
      <span class="last-update" role="status" aria-live="polite">Updated: {timeSinceUpdate}</span>
      <button class="btn-secondary" on:click={handleExportCSV} aria-label="Export as CSV"
        >CSV</button
      >
      <button class="btn-secondary" on:click={handleExportJSON} aria-label="Export as JSON"
        >JSON</button
      >
      <button class="btn-primary" on:click={loadAnomalies} aria-label="Refresh"
        ><span aria-hidden="true">↻</span> Refresh</button
      >
    </div>
  </div>

  <div class="controls">
    <div class="control-group">
      <label for="limit-select">Show:</label>
      <select id="limit-select" bind:value={limit} on:change={loadAnomalies}>
        <option value="10">10 anomalies</option>
        <option value="20">20 anomalies</option>
        <option value="50">50 anomalies</option>
        <option value="100">100 anomalies</option>
      </select>
    </div>
    <div class="control-group">
      <label for="risk-filter">Filter by risk:</label>
      <select id="risk-filter" bind:value={filterRiskLevel}>
        <option value="all">All Levels</option>
        <option value="high">High Risk Only</option>
        <option value="medium">Medium Risk Only</option>
        <option value="low">Low Risk Only</option>
      </select>
    </div>
  </div>

  <div class="stats-row">
    <div class="stat-badge total">
      <span class="badge-icon">📊</span>
      <span class="badge-count">{totalCount}</span>
      <span class="badge-label">Total</span>
    </div>
    <div class="stat-badge high">
      <span class="badge-icon">🔴</span>
      <span class="badge-count">{highCount}</span>
      <span class="badge-label">High Risk</span>
    </div>
    <div class="stat-badge medium">
      <span class="badge-icon">⚠️</span>
      <span class="badge-count">{mediumCount}</span>
      <span class="badge-label">Medium</span>
    </div>
    <div class="stat-badge low">
      <span class="badge-icon">🔵</span>
      <span class="badge-count">{lowCount}</span>
      <span class="badge-label">Low</span>
    </div>
    <div class="stat-badge score">
      <span class="badge-icon">⭐</span>
      <span class="badge-count">{avgScore}</span>
      <span class="badge-label">Avg Score</span>
    </div>
  </div>

  {#if loading}
    <LoadingSkeleton />
  {:else if error}
    <div class="error-state" role="alert">
      <p>❌ Error: {error}</p>
      <button on:click={loadAnomalies}>Retry</button>
    </div>
  {:else if filteredAnomalies.length === 0}
    <div class="empty-state">
      <p>✅ No anomalies detected</p>
      <p class="hint">All patterns look normal</p>
    </div>
  {:else}
    <div class="anomalies-list">
      {#each filteredAnomalies as anomaly (anomaly.id)}
        <article class="anomaly-card {getRiskClass(anomaly.risk_level)}">
          <div class="anomaly-header">
            <span class="risk-icon">{getRiskIcon(anomaly.risk_level)}</span>
            <div class="header-info">
              <div class="file-path">{anomaly.filepath}</div>
              <div class="meta">
                <time datetime={anomaly.timestamp}>{formatTimestamp(anomaly.timestamp)}</time>
                <span class="change-type">{anomaly.change_type}</span>
                {#if anomaly.agent}
                  <span class="agent">🤖 {anomaly.agent}</span>
                {/if}
              </div>
            </div>
            <div class="score-badge">
              <div class="score-value">{anomaly.anomaly_score}</div>
              <div class="score-label">score</div>
            </div>
          </div>

          {#if anomaly.anomaly_reasons && anomaly.anomaly_reasons.length > 0}
            <div class="reasons">
              <div class="reasons-title">Detection Reasons:</div>
              {#each anomaly.anomaly_reasons as reason (reason.type + reason.message)}
                <div class="reason-item">
                  <span class="reason-type">{reason.type.replace(/_/g, ' ')}</span>
                  <span class="reason-message">{reason.message}</span>
                  {#if reason.zScore}
                    <span class="reason-detail">{reason.zScore}σ</span>
                  {/if}
                  {#if reason.rarity}
                    <span class="reason-detail">{reason.rarity}% rare</span>
                  {/if}
                  {#if reason.score}
                    <span class="reason-detail">+{reason.score}</span>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}

          <div class="anomaly-footer">
            <span class="confidence">Confidence: {anomaly.anomaly_confidence}%</span>
            <span class="risk-level">Risk: {anomaly.risk_level}</span>
            {#if anomaly.event_size}
              <span class="event-size">{(anomaly.event_size / 1024).toFixed(1)} KB</span>
            {/if}
          </div>
        </article>
      {/each}
    </div>
  {/if}
</div>

<style>
  .anomaly-alerts-panel {
    padding: var(--space-lg);
    max-width: 1400px;
    margin: 0 auto;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: var(--space-lg);
  }

  .header-left h2 {
    margin: 0 0 var(--space-sm) 0;
    font-size: 24px;
    color: var(--text);
  }

  .subtitle {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
  }

  .header-right {
    display: flex;
    gap: var(--space-md);
    align-items: center;
  }

  .last-update {
    font-size: 12px;
    color: var(--muted);
    font-family: var(--mono);
  }

  .controls {
    display: flex;
    gap: var(--space-lg);
    margin-bottom: var(--space-lg);
    padding: var(--space-md);
    background: var(--surface);
    border-radius: var(--radius);
    border: 1px solid var(--border);
  }

  .control-group {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .control-group label {
    font-size: 13px;
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
  }

  .stats-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: var(--space-md);
    margin-bottom: var(--space-lg);
  }

  .stat-badge {
    padding: var(--space-md);
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: var(--radius);
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .stat-badge.high {
    border-color: #ef4444;
  }
  .stat-badge.medium {
    border-color: #f59e0b;
  }
  .stat-badge.low {
    border-color: #3b82f6;
  }
  .stat-badge.total {
    border-color: var(--accent);
  }

  .badge-icon {
    font-size: 20px;
  }

  .badge-count {
    font-size: 24px;
    font-weight: 700;
    font-family: var(--mono);
    color: var(--text);
  }

  .badge-label {
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
    margin-left: auto;
  }

  .anomalies-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .anomaly-card {
    padding: var(--space-md);
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

  .anomaly-card.risk-high {
    border-left-color: #ef4444;
  }
  .anomaly-card.risk-medium {
    border-left-color: #f59e0b;
  }
  .anomaly-card.risk-low {
    border-left-color: #3b82f6;
  }

  .anomaly-header {
    display: flex;
    align-items: flex-start;
    gap: var(--space-md);
    margin-bottom: var(--space-sm);
  }

  .risk-icon {
    font-size: 20px;
    margin-top: 2px;
  }

  .header-info {
    flex: 1;
  }

  .file-path {
    font-size: 14px;
    font-family: var(--mono);
    color: var(--text);
    font-weight: 600;
    margin-bottom: 4px;
  }

  .meta {
    display: flex;
    gap: var(--space-sm);
    font-size: 12px;
    color: var(--muted);
    flex-wrap: wrap;
  }

  .change-type,
  .agent {
    background: var(--bg);
    padding: 2px 8px;
    border-radius: 4px;
    font-family: var(--mono);
  }

  .score-badge {
    text-align: center;
    padding: 4px 12px;
    background: var(--bg);
    border-radius: var(--radius);
  }

  .score-value {
    font-size: 20px;
    font-weight: 700;
    font-family: var(--mono);
    color: var(--text);
  }

  .score-label {
    font-size: 10px;
    color: var(--muted);
    text-transform: uppercase;
  }

  .reasons {
    margin-top: var(--space-sm);
    padding: var(--space-sm);
    background: var(--bg);
    border-radius: var(--radius);
  }

  .reasons-title {
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
    margin-bottom: var(--space-xs);
    font-weight: 600;
  }

  .reason-item {
    display: flex;
    gap: var(--space-sm);
    align-items: center;
    padding: 4px 0;
    font-size: 12px;
  }

  .reason-type {
    color: var(--accent);
    text-transform: capitalize;
    font-weight: 500;
  }

  .reason-message {
    color: var(--text);
    flex: 1;
  }

  .reason-detail {
    color: var(--muted);
    font-family: var(--mono);
    background: var(--surface);
    padding: 2px 6px;
    border-radius: 4px;
  }

  .anomaly-footer {
    display: flex;
    gap: var(--space-md);
    margin-top: var(--space-sm);
    padding-top: var(--space-sm);
    border-top: 1px solid var(--border);
    font-size: 11px;
    color: var(--muted);
  }

  .btn-primary,
  .btn-secondary {
    padding: 8px 16px;
    border-radius: var(--radius);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid var(--border);
    transition: all 0.2s;
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
    background: var(--bg);
    border-color: var(--accent);
  }

  .empty-state,
  .error-state {
    text-align: center;
    padding: var(--space-xl);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .empty-state p,
  .error-state p {
    margin: var(--space-sm) 0;
    color: var(--text);
  }

  .hint {
    font-size: 13px;
    color: var(--muted);
  }
</style>
