<script>
  import { onMount, onDestroy } from 'svelte';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import { exportCSV, exportJSON } from './exportUtils.js';
  import { websocketService } from './websocket.js';
  import { API_CONFIG } from '../config.js';
  import { logger } from './logger.js';

  let trends = [];
  let loading = true;
  let error = null;
  let period = 'hourly'; // hourly, daily, weekly
  let days = 7;
  let lastUpdate = new Date();

  const API_BASE = API_CONFIG.API_BASE;

  $: maxEventCount = Math.max(...trends.map(t => t.event_count || 0), 1);

  // WebSocket event handlers (event-driven, no polling!)
  const handleFileChanged = async () => {
    await loadTrends();
  };

  const handleProjectSwitched = async () => {
    await loadTrends();
  };

  onMount(async () => {
    await loadTrends();

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

  async function loadTrends() {
    try {
      loading = true;
      const response = await fetch(`${API_BASE}/trends/historical?period=${period}&days=${days}`);
      if (!response.ok) throw new Error('Failed to fetch trends');

      const data = await response.json();
      trends = data.trends || [];
      lastUpdate = new Date();
      error = null;
    } catch (err) {
      logger.error('Failed to load trends:', err);
      error = err.message;
    } finally {
      loading = false;
    }
  }

  function handlePeriodChange(newPeriod) {
    period = newPeriod;
    loadTrends();
  }

  function handleDaysChange(newDays) {
    days = parseInt(newDays);
    loadTrends();
  }

  function getBarHeight(value) {
    return (value / maxEventCount) * 100;
  }

  function formatPeriod(periodStr) {
    if (period === 'hourly') {
      return new Date(periodStr).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric'
      });
    } else if (period === 'daily') {
      return new Date(periodStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
    } else {
      return periodStr;
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

  // Reactive "time since update" - updates when lastUpdate changes (no polling!)
  $: timeSinceUpdate = getTimeSinceUpdate();

  function handleExportCSV() {
    const data = trends.map(t => ({
      Period: t.period,
      'Total Events': t.event_count,
      Modifications: t.modifications,
      Creations: t.creations,
      Deletions: t.deletions,
      'Unique Files': t.unique_files
    }));
    exportCSV(data, 'historical-trends');
  }

  function handleExportJSON() {
    const data = {
      period,
      days,
      trends,
      exported_at: new Date().toISOString()
    };
    exportJSON(data, 'historical-trends');
  }
</script>

<div class="historical-trends-panel" role="region" aria-label="Historical trends panel">
  <div class="panel-header">
    <div class="header-left">
      <h2 id="trends-heading"><span aria-hidden="true">📊</span> Historical Trends</h2>
      <p class="subtitle">Activity patterns over time</p>
    </div>
    <div class="header-right" role="toolbar" aria-label="Historical trends actions">
      <span class="last-update" role="status" aria-live="polite">Updated: {timeSinceUpdate}</span>
      <button class="btn-secondary" on:click={handleExportCSV} aria-label="Export trends data as CSV">Export CSV</button>
      <button class="btn-secondary" on:click={handleExportJSON} aria-label="Export trends data as JSON">Export JSON</button>
      <button class="btn-primary" on:click={loadTrends} aria-label="Refresh trends data"><span aria-hidden="true">↻</span> Refresh</button>
    </div>
  </div>

  <div class="controls">
    <div class="control-group">
      <label for="period-select">Period:</label>
      <select id="period-select" bind:value={period} on:change={() => handlePeriodChange(period)} aria-label="Select time period granularity">
        <option value="hourly">Hourly</option>
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
      </select>
    </div>
    <div class="control-group">
      <label for="days-select">Last:</label>
      <select id="days-select" bind:value={days} on:change={() => handleDaysChange(days)} aria-label="Select time range">
        <option value="1">24 hours</option>
        <option value="7">7 days</option>
        <option value="14">14 days</option>
        <option value="30">30 days</option>
        <option value="90">90 days</option>
      </select>
    </div>
  </div>

  {#if loading}
    <LoadingSkeleton />
  {:else if error}
    <div class="error-state" role="alert">
      <p><span aria-hidden="true">❌</span> Error loading trends: {error}</p>
      <button on:click={loadTrends} aria-label="Retry loading trends">Try Again</button>
    </div>
  {:else if trends.length === 0}
    <div class="empty-state" role="status">
      <p><span aria-hidden="true">📭</span> No activity data for the selected period</p>
      <p class="hint">Try selecting a longer time range</p>
    </div>
  {:else}
    <div class="chart-container">
      <div class="chart" role="img" aria-label="Historical trends chart showing activity over {period} periods">
        {#each trends as trend (trend.period)}
          <div class="bar-group" aria-hidden="true">
            <div class="bar-stack">
              <div
                class="bar bar-created"
                style="height: {getBarHeight(trend.creations)}%"
                title="{trend.creations} created"
              ></div>
              <div
                class="bar bar-modified"
                style="height: {getBarHeight(trend.modifications)}%"
                title="{trend.modifications} modified"
              ></div>
              <div
                class="bar bar-deleted"
                style="height: {getBarHeight(trend.deletions)}%"
                title="{trend.deletions} deleted"
              ></div>
            </div>
            <div class="bar-label">{formatPeriod(trend.period)}</div>
            <div class="bar-count">{trend.event_count}</div>
          </div>
        {/each}
      </div>
    </div>

    <div class="stats-grid" role="list" aria-label="Trends summary statistics">
      <article class="stat-card" role="listitem">
        <div class="stat-value" role="status">{trends.reduce((sum, t) => sum + t.event_count, 0).toLocaleString()}</div>
        <div class="stat-label">Total Events</div>
      </article>
      <article class="stat-card" role="listitem">
        <div class="stat-value" role="status">{trends.reduce((sum, t) => sum + t.modifications, 0).toLocaleString()}</div>
        <div class="stat-label">Modifications</div>
      </article>
      <article class="stat-card" role="listitem">
        <div class="stat-value" role="status">{trends.reduce((sum, t) => sum + t.creations, 0).toLocaleString()}</div>
        <div class="stat-label">Creations</div>
      </article>
      <article class="stat-card" role="listitem">
        <div class="stat-value" role="status">{trends.reduce((sum, t) => sum + t.deletions, 0).toLocaleString()}</div>
        <div class="stat-label">Deletions</div>
      </article>
    </div>

    <div class="legend" aria-hidden="true">
      <div class="legend-item">
        <div class="legend-color bar-created"></div>
        <span>Created</span>
      </div>
      <div class="legend-item">
        <div class="legend-color bar-modified"></div>
        <span>Modified</span>
      </div>
      <div class="legend-item">
        <div class="legend-color bar-deleted"></div>
        <span>Deleted</span>
      </div>
    </div>
  {/if}
</div>

<style>
  .historical-trends-panel {
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

  .control-group select:hover {
    border-color: var(--accent);
  }

  .chart-container {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 32px 24px 24px;
    margin-bottom: 24px;
    min-height: 400px;
  }

  .chart {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 6px;
    height: 300px;
    padding: 0 8px;
  }

  .bar-group {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 0;
  }

  .bar-stack {
    width: 100%;
    flex: 1;
    display: flex;
    flex-direction: column-reverse;
    justify-content: flex-start;
    gap: 1px;
    min-height: 0;
  }

  .bar {
    width: 100%;
    min-height: 3px;
    border-radius: 2px 2px 0 0;
    transition: all 0.3s ease;
    cursor: pointer;
    flex-shrink: 0;
  }

  .bar:hover {
    opacity: 0.8;
    transform: scaleY(1.05);
  }

  .bar-created {
    background: var(--success, #10b981);
  }

  .bar-modified {
    background: var(--accent, #7aa2f7);
  }

  .bar-deleted {
    background: var(--error, #f7768e);
  }

  .bar-label {
    font-size: 9px;
    color: var(--muted);
    text-align: center;
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    max-height: 60px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-top: 4px;
  }

  .bar-count {
    font-size: 10px;
    font-weight: 600;
    color: var(--text);
    font-family: var(--mono);
    margin-top: 2px;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
  }

  .stat-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 20px;
    text-align: center;
  }

  .stat-value {
    font-size: 32px;
    font-weight: 700;
    color: var(--accent);
    font-family: var(--mono);
    margin-bottom: 8px;
  }

  .stat-label {
    font-size: 13px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .legend {
    display: flex;
    justify-content: center;
    gap: 24px;
    padding: 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--text);
  }

  .legend-color {
    width: 16px;
    height: 16px;
    border-radius: 3px;
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
    transform: translateY(-1px);
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
    color: var(--muted);
  }

  .hint {
    font-size: 13px;
    color: var(--muted-2);
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

    .chart {
      gap: 3px;
      height: 250px;
    }

    .chart-container {
      min-height: 350px;
    }

    .bar-label {
      font-size: 8px;
      max-height: 50px;
    }
  }
</style>
