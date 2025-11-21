<script>
  import { onMount, onDestroy } from 'svelte';
  import { fade, slide } from 'svelte/transition';

  let healthReport = null;
  let loading = true;
  let error = null;
  let autoRefresh = true;
  let refreshInterval = null;

  const STATUS_COLORS = {
    healthy: 'bg-green-500',
    warning: 'bg-yellow-500',
    critical: 'bg-red-500',
    degraded: 'bg-orange-500'
  };

  const STATUS_ICONS = {
    healthy: '✓',
    warning: '⚠',
    critical: '✗'
  };

  async function fetchHealthReport() {
    try {
      const response = await fetch('/api/health/status');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      healthReport = await response.json();
      loading = false;
      error = null;
    } catch (err) {
      error = err.message;
      loading = false;
    }
  }

  function startAutoRefresh() {
    if (refreshInterval) return;
    refreshInterval = setInterval(fetchHealthReport, 30000); // 30 seconds
  }

  function stopAutoRefresh() {
    if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
  }

  function toggleAutoRefresh() {
    autoRefresh = !autoRefresh;
    if (autoRefresh) {
      startAutoRefresh();
      fetchHealthReport();
    } else {
      stopAutoRefresh();
    }
  }

  function groupByCategory(checks) {
    const groups = {};
    for (const check of checks) {
      if (!groups[check.category]) {
        groups[check.category] = [];
      }
      groups[check.category].push(check);
    }
    return groups;
  }

  function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString();
  }

  onMount(() => {
    fetchHealthReport();
    if (autoRefresh) {
      startAutoRefresh();
    }
  });

  onDestroy(() => {
    stopAutoRefresh();
  });

  $: groupedChecks = healthReport ? groupByCategory(healthReport.checks) : {};
  $: criticalCount = healthReport?.summary.critical || 0;
  $: warningCount = healthReport?.summary.warnings || 0;
</script>

<div class="health-monitor-page">
  <header class="page-header">
    <div class="header-content">
      <h1>System Health Monitor</h1>
      <p class="subtitle">Real-time system health and data integrity validation</p>
    </div>
    <div class="header-actions">
      <button on:click={fetchHealthReport} class="btn-refresh" disabled={loading}>
        {loading ? 'Checking...' : 'Refresh Now'}
      </button>
      <button on:click={toggleAutoRefresh} class="btn-toggle" class:active={autoRefresh}>
        {autoRefresh ? '⏸ Pause' : '▶ Auto-refresh'}
      </button>
    </div>
  </header>

  {#if loading && !healthReport}
    <div class="loading-state" transition:fade>
      <div class="spinner"></div>
      <p>Running health checks...</p>
    </div>
  {:else if error}
    <div class="error-state" transition:fade>
      <div class="error-icon">⚠</div>
      <h2>Health Check Failed</h2>
      <p>{error}</p>
      <button on:click={fetchHealthReport} class="btn-retry">Retry</button>
    </div>
  {:else if healthReport}
    <div class="health-dashboard" transition:fade>
      <!-- Overall Status Card -->
      <div class="status-card overall-status {healthReport.overallStatus}">
        <div class="status-indicator">
          <div class="status-badge {STATUS_COLORS[healthReport.overallStatus]}">
            {healthReport.overallStatus.toUpperCase()}
          </div>
        </div>
        <div class="status-details">
          <h2>Overall System Status</h2>
          <p class="timestamp">Last checked: {formatTimestamp(healthReport.timestamp)}</p>
          <div class="summary-stats">
            <div class="stat">
              <span class="stat-label">Total Checks</span>
              <span class="stat-value">{healthReport.summary.total}</span>
            </div>
            <div class="stat healthy">
              <span class="stat-label">Healthy</span>
              <span class="stat-value">{healthReport.summary.healthy}</span>
            </div>
            <div class="stat warning">
              <span class="stat-label">Warnings</span>
              <span class="stat-value">{healthReport.summary.warnings}</span>
            </div>
            <div class="stat critical">
              <span class="stat-label">Critical</span>
              <span class="stat-value">{healthReport.summary.critical}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Critical Alerts (if any) -->
      {#if criticalCount > 0}
        <div class="alert-banner critical" transition:slide>
          <div class="alert-icon">🚨</div>
          <div class="alert-content">
            <h3>Critical Issues Detected</h3>
            <p>
              {criticalCount} critical {criticalCount === 1 ? 'issue' : 'issues'} requiring immediate
              attention
            </p>
          </div>
        </div>
      {/if}

      <!-- Warning Alerts (if any) -->
      {#if warningCount > 0 && criticalCount === 0}
        <div class="alert-banner warning" transition:slide>
          <div class="alert-icon">⚠️</div>
          <div class="alert-content">
            <h3>Warnings Detected</h3>
            <p>{warningCount} {warningCount === 1 ? 'warning' : 'warnings'} should be reviewed</p>
          </div>
        </div>
      {/if}

      <!-- Health Checks by Category -->
      <div class="checks-container">
        {#each Object.entries(groupedChecks) as [category, checks] (category)}
          <div class="category-section" transition:slide>
            <h3 class="category-header">{category}</h3>
            <div class="checks-list">
              {#each checks as check (check.name + check.category)}
                <div class="check-item {check.status}" transition:slide>
                  <div class="check-status-icon">
                    <span class="status-dot {STATUS_COLORS[check.status]}"></span>
                    <span class="status-symbol">{STATUS_ICONS[check.status]}</span>
                  </div>
                  <div class="check-content">
                    <h4>{check.name}</h4>
                    <p class="check-message">{check.message}</p>
                    {#if check.details}
                      <details class="check-details">
                        <summary>View Details</summary>
                        <pre>{JSON.stringify(check.details, null, 2)}</pre>
                      </details>
                    {/if}
                  </div>
                  <div class="check-timestamp">
                    {formatTimestamp(check.timestamp)}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>

      <!-- Information Panel -->
      <div class="info-panel">
        <h3>About Health Monitoring</h3>
        <p>This dashboard validates critical system components including:</p>
        <ul>
          <li><strong>Database Schema:</strong> Ensures all required columns exist in tables</li>
          <li><strong>Data Integrity:</strong> Checks for orphaned records and invalid data</li>
          <li><strong>System Resources:</strong> Monitors CPU and memory usage</li>
          <li><strong>Connectivity:</strong> Validates database accessibility</li>
        </ul>
        <p class="info-note">
          💡 This monitoring system was created after the functional audit to prevent silent
          failures like the missing <code>project_name</code> column that broke agent detection.
        </p>
      </div>
    </div>
  {/if}
</div>

<style>
  .health-monitor-page {
    padding: 2rem;
    max-width: 1400px;
    margin: 0 auto;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 2rem;
    padding-bottom: 1.5rem;
    border-bottom: 2px solid #e5e7eb;
  }

  .page-header h1 {
    font-size: 2rem;
    font-weight: 700;
    color: #1f2937;
    margin: 0 0 0.5rem 0;
  }

  .subtitle {
    color: #6b7280;
    font-size: 0.95rem;
    margin: 0;
  }

  .header-actions {
    display: flex;
    gap: 0.75rem;
  }

  .btn-refresh,
  .btn-toggle,
  .btn-retry {
    padding: 0.625rem 1.25rem;
    border-radius: 6px;
    border: 1px solid #d1d5db;
    background: white;
    color: #374151;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-refresh:hover,
  .btn-toggle:hover,
  .btn-retry:hover {
    background: #f9fafb;
    border-color: #9ca3af;
  }

  .btn-refresh:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-toggle.active {
    background: #3b82f6;
    color: white;
    border-color: #3b82f6;
  }

  .loading-state,
  .error-state {
    text-align: center;
    padding: 4rem 2rem;
  }

  .spinner {
    width: 48px;
    height: 48px;
    border: 4px solid #e5e7eb;
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin: 0 auto 1rem;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .error-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
  }

  .status-card {
    background: white;
    border-radius: 12px;
    padding: 2rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    margin-bottom: 2rem;
    display: flex;
    gap: 2rem;
  }

  .status-card.critical {
    border-left: 4px solid #ef4444;
  }

  .status-card.degraded {
    border-left: 4px solid #f59e0b;
  }

  .status-card.healthy {
    border-left: 4px solid #10b981;
  }

  .status-badge {
    display: inline-block;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    color: white;
    font-weight: 700;
    font-size: 0.875rem;
    letter-spacing: 0.05em;
  }

  .status-details h2 {
    margin: 0 0 0.5rem 0;
    font-size: 1.5rem;
    color: #1f2937;
  }

  .timestamp {
    color: #6b7280;
    font-size: 0.875rem;
    margin-bottom: 1.5rem;
  }

  .summary-stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1.5rem;
  }

  .stat {
    text-align: center;
  }

  .stat-label {
    display: block;
    font-size: 0.75rem;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.5rem;
  }

  .stat-value {
    display: block;
    font-size: 2rem;
    font-weight: 700;
    color: #1f2937;
  }

  .stat.healthy .stat-value {
    color: #10b981;
  }

  .stat.warning .stat-value {
    color: #f59e0b;
  }

  .stat.critical .stat-value {
    color: #ef4444;
  }

  .alert-banner {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1.25rem 1.5rem;
    border-radius: 8px;
    margin-bottom: 2rem;
  }

  .alert-banner.critical {
    background: #fef2f2;
    border: 1px solid #fecaca;
  }

  .alert-banner.warning {
    background: #fffbeb;
    border: 1px solid #fed7aa;
  }

  .alert-icon {
    font-size: 2rem;
  }

  .alert-content h3 {
    margin: 0 0 0.25rem 0;
    font-size: 1.125rem;
    color: #1f2937;
  }

  .alert-content p {
    margin: 0;
    color: #6b7280;
    font-size: 0.875rem;
  }

  .checks-container {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .category-section {
    background: white;
    border-radius: 12px;
    padding: 1.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .category-header {
    font-size: 1.25rem;
    font-weight: 600;
    color: #1f2937;
    margin: 0 0 1rem 0;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid #e5e7eb;
  }

  .checks-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .check-item {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    padding: 1rem;
    background: #f9fafb;
    border-radius: 8px;
    border-left: 3px solid transparent;
  }

  .check-item.healthy {
    border-left-color: #10b981;
  }

  .check-item.warning {
    border-left-color: #f59e0b;
    background: #fffbeb;
  }

  .check-item.critical {
    border-left-color: #ef4444;
    background: #fef2f2;
  }

  .check-status-icon {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    min-width: 2rem;
  }

  .status-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }

  .status-symbol {
    font-size: 1.25rem;
    font-weight: 700;
  }

  .check-content {
    flex: 1;
  }

  .check-content h4 {
    margin: 0 0 0.5rem 0;
    font-size: 1rem;
    font-weight: 600;
    color: #1f2937;
  }

  .check-message {
    margin: 0;
    color: #4b5563;
    font-size: 0.875rem;
  }

  .check-details {
    margin-top: 0.75rem;
  }

  .check-details summary {
    cursor: pointer;
    color: #3b82f6;
    font-size: 0.875rem;
    font-weight: 500;
  }

  .check-details pre {
    margin-top: 0.5rem;
    padding: 0.75rem;
    background: white;
    border-radius: 6px;
    font-size: 0.8125rem;
    overflow-x: auto;
  }

  .check-timestamp {
    font-size: 0.75rem;
    color: #9ca3af;
    min-width: 160px;
    text-align: right;
  }

  .info-panel {
    background: #f0f9ff;
    border: 1px solid #bae6fd;
    border-radius: 8px;
    padding: 1.5rem;
    margin-top: 2rem;
  }

  .info-panel h3 {
    margin: 0 0 1rem 0;
    color: #0369a1;
    font-size: 1.125rem;
  }

  .info-panel p {
    margin: 0 0 0.75rem 0;
    color: #0c4a6e;
    line-height: 1.6;
  }

  .info-panel ul {
    margin: 0.75rem 0;
    padding-left: 1.5rem;
    color: #0c4a6e;
  }

  .info-panel li {
    margin-bottom: 0.5rem;
    line-height: 1.6;
  }

  .info-note {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid #bae6fd;
    font-size: 0.875rem;
  }

  .info-note code {
    background: white;
    padding: 0.125rem 0.375rem;
    border-radius: 3px;
    font-family: 'Monaco', 'Courier New', monospace;
    font-size: 0.8125rem;
    color: #0369a1;
  }

  .bg-green-500 {
    background-color: #10b981;
  }

  .bg-yellow-500 {
    background-color: #f59e0b;
  }

  .bg-red-500 {
    background-color: #ef4444;
  }

  .bg-orange-500 {
    background-color: #f97316;
  }
</style>
