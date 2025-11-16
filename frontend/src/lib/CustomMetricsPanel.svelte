<script>
  import { onMount, onDestroy } from 'svelte';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import { websocketService } from './websocket.js';
  import { API_CONFIG } from '../config.js';
  import { logger } from './logger.js';

  let metrics = {};
  let loading = true;
  let error = null;
  let lastUpdate = new Date();

  const API_BASE = API_CONFIG.API_BASE;

  // WebSocket event handlers
  const handleFileChanged = async () => {
    await loadMetrics();
  };

  const handleProjectSwitched = async () => {
    await loadMetrics();
  };

  onMount(async () => {
    await loadMetrics();

    // Connect to WebSocket for real-time updates (event-driven, no polling!)
    websocketService.connect();
    websocketService.on('file-changed', handleFileChanged);
    websocketService.on('project-switched', handleProjectSwitched);
  });

  onDestroy(() => {
    // Clean up WebSocket listeners
    websocketService.off('file-changed', handleFileChanged);
    websocketService.off('project-switched', handleProjectSwitched);
  });

  async function loadMetrics() {
    try {
      loading = true;
      const response = await fetch(`${API_BASE}/metrics/dashboard`);

      const data = await response.json();
      metrics = data.metrics || {};
      lastUpdate = new Date();
      error = null;
    } catch (err) {
      logger.error('Failed to load metrics:', error);
      errorMessage = error.message;
    } finally {
      loading = false;
    }
  }

  function getTimeSinceUpdate() {
    const seconds = Math.floor((new Date() - lastUpdate) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  }

  function formatHour(hour) {
    if (hour === 0) return '12 AM';
    if (hour < 12) return `${hour} AM`;
    if (hour === 12) return '12 PM';
    return `${hour - 12} PM`;
  }

  // Reactive time display (updates when lastUpdate changes, no polling!)
  $: timeSinceUpdate = getTimeSinceUpdate();
</script>

<div class="custom-metrics-panel" role="region" aria-label="Custom metrics dashboard">
  <div class="panel-header">
    <div class="header-left">
      <h2 id="metrics-heading"><span aria-hidden="true">📊</span> Custom Metrics Dashboard</h2>
      <p class="subtitle">Key performance indicators at a glance</p>
    </div>
    <div class="header-right" role="toolbar" aria-label="Dashboard actions">
      <span class="last-update" role="status" aria-live="polite">Updated: {timeSinceUpdate}</span>
      <button class="btn-primary" on:click={loadMetrics} aria-label="Refresh metrics"
        ><span aria-hidden="true">↻</span> Refresh</button
      >
    </div>
  </div>

  {#if loading}
    <LoadingSkeleton />
  {:else if error}
    <div class="error-state" role="alert">
      <p><span aria-hidden="true">❌</span> Error loading metrics: {error}</p>
      <button on:click={loadMetrics} aria-label="Try loading metrics again">Try Again</button>
    </div>
  {:else}
    <div class="metrics-grid" role="list" aria-labelledby="metrics-heading">
      <!-- Total Events -->
      <article class="metric-card primary" role="listitem">
        <div class="metric-icon" aria-hidden="true">📈</div>
        <div class="metric-value" role="status">{(metrics.total_events || 0).toLocaleString()}</div>
        <div class="metric-label">Total Events</div>
        <div class="metric-sublabel">All-time</div>
      </article>

      <!-- Events 24h -->
      <article class="metric-card success" role="listitem">
        <div class="metric-icon" aria-hidden="true">⚡</div>
        <div class="metric-value" role="status">{(metrics.events_24h || 0).toLocaleString()}</div>
        <div class="metric-label">Events (24h)</div>
        <div class="metric-sublabel">Recent activity</div>
      </article>

      <!-- Active Projects -->
      <article class="metric-card accent" role="listitem">
        <div class="metric-icon" aria-hidden="true">📁</div>
        <div class="metric-value" role="status">{metrics.active_projects || 0}</div>
        <div class="metric-label">Active Projects</div>
        <div class="metric-sublabel">Last 7 days</div>
      </article>

      <!-- Total Files -->
      <article class="metric-card warning" role="listitem">
        <div class="metric-icon" aria-hidden="true">📄</div>
        <div class="metric-value" role="status">{(metrics.total_files || 0).toLocaleString()}</div>
        <div class="metric-label">Files Tracked</div>
        <div class="metric-sublabel">Unique files</div>
      </article>

      <!-- Error Count -->
      <article class="metric-card error" role="listitem">
        <div class="metric-icon" aria-hidden="true">❌</div>
        <div class="metric-value" role="status">{metrics.error_count || 0}</div>
        <div class="metric-label">Total Errors</div>
        <div class="metric-sublabel">All-time</div>
      </article>

      <!-- Conversations -->
      <article class="metric-card info" role="listitem">
        <div class="metric-icon" aria-hidden="true">💬</div>
        <div class="metric-value" role="status">
          {(metrics.conversation_count || 0).toLocaleString()}
        </div>
        <div class="metric-label">Conversations</div>
        <div class="metric-sublabel">Total logged</div>
      </article>

      <!-- Avg Events Per Day -->
      <article class="metric-card primary" role="listitem">
        <div class="metric-icon" aria-hidden="true">📊</div>
        <div class="metric-value" role="status">{metrics.avg_events_per_day || 0}</div>
        <div class="metric-label">Avg Events/Day</div>
        <div class="metric-sublabel">Last 7 days</div>
      </article>

      <!-- Busiest Hour -->
      {#if metrics.busiest_hour}
        <article class="metric-card accent" role="listitem">
          <div class="metric-icon" aria-hidden="true">🕒</div>
          <div class="metric-value" role="status">{formatHour(metrics.busiest_hour.hour)}</div>
          <div class="metric-label">Busiest Hour</div>
          <div class="metric-sublabel">{metrics.busiest_hour.count} events</div>
        </article>
      {/if}

      <!-- Events by Type -->
      {#if metrics.events_by_type}
        <article
          class="metric-card wide breakdown"
          role="listitem"
          aria-labelledby="events-by-type-heading"
        >
          <div class="breakdown-header">
            <span class="breakdown-icon" aria-hidden="true">📋</span>
            <span class="breakdown-title" id="events-by-type-heading">Events by Type</span>
          </div>
          <div class="breakdown-grid" role="list" aria-label="Event types">
            {#each Object.entries(metrics.events_by_type) as [type, count] (type)}
              <div class="breakdown-item" role="listitem">
                <div class="breakdown-type">{type}</div>
                <div class="breakdown-count" role="status">{count.toLocaleString()}</div>
              </div>
            {/each}
          </div>
        </article>
      {/if}

      <!-- Most Active File -->
      {#if metrics.most_active_file}
        <article class="metric-card wide highlight" role="listitem">
          <div class="highlight-header">
            <span class="highlight-icon" aria-hidden="true">🔥</span>
            <span class="highlight-title">Most Active File (7d)</span>
          </div>
          <div class="highlight-content">
            <div class="highlight-file">{metrics.most_active_file.file}</div>
            <div class="highlight-changes" role="status">
              {metrics.most_active_file.changes} changes
            </div>
          </div>
        </article>
      {/if}
    </div>
  {/if}
</div>

<style>
  .custom-metrics-panel {
    padding: var(--space-lg);
    max-width: 1600px;
    margin: 0 auto;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: var(--space-4xl);
  }

  .header-left h2 {
    margin: 0 0 var(--space-sm) 0;
    font-size: 11px;
    color: var(--text);
  }

  .subtitle {
    margin: 0;
    color: var(--muted);
    font-size: 11px;
  }

  .header-right {
    display: flex;
    gap: var(--space-xl);
    align-items: center;
  }

  .last-update {
    font-size: 12px;
    color: var(--muted);
  }

  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: var(--space-lg);
  }

  .metric-card {
    padding: var(--space-lg);
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: var(--radius);
    text-align: center;
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .metric-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .metric-card.wide {
    grid-column: span 2;
  }

  .metric-card.primary {
    border-color: var(--accent, var(--info));
  }

  .metric-card.success {
    border-color: var(--success, var(--success));
  }

  .metric-card.warning {
    border-color: var(--warning, var(--warning));
  }

  .metric-card.error {
    border-color: var(--error, var(--error));
  }

  .metric-card.accent {
    border-color: var(--accent, var(--info));
  }

  .metric-card.info {
    border-color: var(--info, #73daca);
  }

  .metric-icon {
    font-size: 11px;
    margin-bottom: var(--space-md);
  }

  .metric-value {
    font-size: 11px;
    font-weight: 700;
    font-family: var(--mono);
    color: var(--text);
    margin-bottom: var(--space-lg);
    line-height: 1;
  }

  .metric-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--text);
    margin-bottom: var(--space-sm);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .metric-sublabel {
    font-size: 12px;
    color: var(--muted);
  }

  .breakdown {
    text-align: left;
  }

  .breakdown-header {
    display: flex;
    align-items: center;
    gap: var(--space-xl);
    margin-bottom: var(--space-md);
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border);
  }

  .breakdown-icon {
    font-size: 11px;
  }

  .breakdown-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--text);
  }

  .breakdown-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: var(--space-xl);
  }

  .breakdown-item {
    padding: var(--space-xl);
    background: var(--bg);
    border-radius: var(--radius);
    text-align: center;
  }

  .breakdown-type {
    font-size: 11px;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: var(--space-sm);
    letter-spacing: 0.5px;
  }

  .breakdown-count {
    font-size: 11px;
    font-weight: 700;
    font-family: var(--mono);
    color: var(--text);
  }

  .highlight {
    text-align: left;
  }

  .highlight-header {
    display: flex;
    align-items: center;
    gap: var(--space-xl);
    margin-bottom: var(--space-md);
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border);
  }

  .highlight-icon {
    font-size: 11px;
  }

  .highlight-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--text);
  }

  .highlight-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-2xl);
    background: var(--bg);
    border-radius: var(--radius);
  }

  .highlight-file {
    font-size: 11px;
    font-family: var(--mono);
    color: var(--text);
    font-weight: 600;
    word-break: break-all;
  }

  .highlight-changes {
    font-size: 11px;
    font-weight: 700;
    font-family: var(--mono);
    color: var(--accent);
    white-space: nowrap;
    margin-left: var(--space-2xl);
  }

  .btn-primary {
    padding: var(--space-lg) var(--space-2xl);
    background: var(--accent);
    color: white;
    border: 1px solid var(--accent);
    border-radius: var(--radius);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .btn-primary:hover {
    opacity: 0.9;
  }

  .btn-primary:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .error-state {
    text-align: center;
    padding: var(--space-lg) var(--space-xl);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .error-state p {
    margin: var(--space-lg) 0;
    color: var(--error, var(--error));
  }

  .error-state button {
    margin-top: var(--space-2xl);
    padding: var(--space-lg) var(--space-2xl);
    background: var(--accent);
    color: white;
    border: none;
    border-radius: var(--radius);
    cursor: pointer;
  }

  .error-state button:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  @media (max-width: 1200px) {
    .metrics-grid {
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    }

    .metric-card.wide {
      grid-column: span 1;
    }
  }

  @media (max-width: 768px) {
    .panel-header {
      flex-direction: column;
      gap: var(--space-lg);
    }

    .metrics-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
