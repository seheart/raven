<script>
  import { logger } from './logger.js';
  import { onMount } from 'svelte';
  import { websocketService } from './websocket.js';
  import { notifications } from './notificationService.js';
  import { API_CONFIG } from '../config.js';

  const API_BASE = API_CONFIG.API_BASE;

  let healthStatus = 'pending';
  let healthResults = null;
  let loading = true;
  let expanded = false;

  onMount(async () => {
    await loadHealthChecks();

    // Listen for failed health checks in real-time
    websocketService.connect();
    websocketService.on('health-check-failed', handleHealthCheckFailed);
  });

  async function loadHealthChecks() {
    try {
      const response = await fetch(`${API_BASE}/health-checks`);
      const data = await response.json();

      healthStatus = data.status;
      healthResults = data;
      loading = false;

      // Show notification if any checks failed
      if (data.status === 'unhealthy' && data.summary) {
        const failedChecks = data.summary.failed;
        notifications.error(
          `${failedChecks} startup health check${failedChecks > 1 ? 's' : ''} failed`,
          {
            title: 'Health Check Warning',
            duration: 10000
          }
        );
      }
    } catch (error) {
      logger.error('Failed to load health checks:', error);
      loading = false;
      healthStatus = 'error';
    }
  }

  function handleHealthCheckFailed(data) {
    notifications.error(`Health check failed: ${data.checkName}`, {
      title: 'Component Failure',
      message: data.message,
      duration: 8000
    });
  }

  function getStatusIcon(status) {
    switch (status) {
    case 'healthy': return '✅';
    case 'unhealthy': return '⚠️';
    case 'error': return '❌';
    case 'pending': return '⏳';
    default: return '❓';
    }
  }

  function getStatusColor(status) {
    switch (status) {
    case 'healthy': return 'var(--success)';
    case 'unhealthy': return 'var(--warning)';
    case 'error': return 'var(--error)';
    case 'pending': return 'var(--muted)';
    default: return 'var(--muted)';
    }
  }

  function getCategoryIcon(category) {
    switch (category) {
    case 'database': return '💾';
    case 'data': return '📊';
    case 'websocket': return '🔌';
    case 'system': return '🖥️';
    default: return '📦';
    }
  }
</script>

<div class="health-status" role="region" aria-label="System health status">
  <button class="health-summary" on:click={() => expanded = !expanded} aria-expanded={expanded} aria-controls="health-details">
    <div class="status-badge" style="background: {getStatusColor(healthStatus)}" role="status" aria-live="polite">
      <span class="status-icon" aria-hidden="true">{getStatusIcon(healthStatus)}</span>
      <span class="status-text">
        {#if loading}
          Loading health...
        {:else if healthStatus === 'healthy'}
          All Systems Operational
        {:else if healthStatus === 'unhealthy'}
          {healthResults?.summary?.failed || 0} Check{healthResults?.summary?.failed > 1 ? 's' : ''} Failed
        {:else if healthStatus === 'error'}
          Health Check Error
        {:else}
          Health Check Pending
        {/if}
      </span>
    </div>
    {#if healthResults && healthResults.summary}
      <div class="status-stats">
        <span class="stat" role="status">{healthResults.summary.passed}/{healthResults.summary.total} passed</span>
        {#if !loading}
          <span class="expand-btn" aria-hidden="true">
            {expanded ? '▼' : '▶'}
          </span>
        {/if}
      </div>
    {/if}
  </button>

  {#if expanded && healthResults && healthResults.checks}
    <div class="health-details" id="health-details" role="region" aria-label="Health check details">
      {#each Object.entries(healthResults.summary.byCategory || {}) as [category, stats] (category)}
        <section class="category-section" aria-labelledby="category-{category}">
          <div class="category-header">
            <span class="category-icon" aria-hidden="true">{getCategoryIcon(category)}</span>
            <span class="category-name" id="category-{category}">{category}</span>
            <span class="category-stats" role="status">
              {stats.passed}/{stats.passed + stats.failed}
              {#if stats.failed > 0}
                <span class="failed-count">({stats.failed} failed)</span>
              {/if}
            </span>
          </div>

          <div class="category-checks" role="list" aria-label="{category} health checks">
            {#each healthResults.checks.filter(c => c.category === category) as check (check.name)}
              <div class="check-item" class:failed={!check.passed} role="listitem">
                <span class="check-icon" aria-hidden="true">
                  {check.passed ? '✅' : '❌'}
                </span>
                <div class="check-info">
                  <div class="check-name">{check.name}</div>
                  <div class="check-message" class:error={!check.passed} role={check.passed ? 'status' : 'alert'}>
                    {check.message}
                  </div>
                </div>
                <div class="check-duration">{check.duration}ms</div>
              </div>
            {/each}
          </div>
        </section>
      {/each}
    </div>
  {/if}
</div>

<style>
  .health-status {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
  }

  .health-summary {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    cursor: pointer;
    transition: background 0.2s;
    width: 100%;
    background: transparent;
    border: none;
    text-align: left;
    font-family: inherit;
    color: inherit;
  }

  .health-summary:hover {
    background: var(--surface-2);
  }

  .status-badge {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border-radius: 6px;
    color: white;
    font-family: var(--mono);
    font-size: 12px;
    font-weight: 600;
  }

  .status-icon {
    font-size: 14px;
  }

  .status-stats {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .stat {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--muted);
  }

  .expand-btn {
    background: none;
    border: none;
    color: var(--muted);
    font-size: 10px;
    cursor: pointer;
    padding: 4px;
    transition: color 0.2s;
  }

  .expand-btn:hover {
    color: var(--text);
  }

  .health-details {
    border-top: 1px solid var(--border);
    padding: 16px;
  }

  .category-section {
    margin-bottom: 16px;
  }

  .category-section:last-child {
    margin-bottom: 0;
  }

  .category-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--surface-2);
  }

  .category-icon {
    font-size: 14px;
  }

  .category-name {
    font-family: var(--mono);
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .category-stats {
    margin-left: auto;
    font-family: var(--mono);
    font-size: 11px;
    color: var(--muted);
  }

  .failed-count {
    color: var(--error);
    font-weight: 600;
  }

  .category-checks {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .check-item {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 8px 12px;
    background: var(--bg);
    border-radius: 4px;
    border-left: 3px solid var(--success);
  }

  .check-item.failed {
    border-left-color: var(--error);
    background: color-mix(in srgb, var(--error) 5%, var(--bg));
  }

  .check-icon {
    font-size: 12px;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .check-info {
    flex: 1;
    min-width: 0;
  }

  .check-name {
    font-family: var(--mono);
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
    margin-bottom: 4px;
  }

  .check-message {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--muted);
    line-height: 1.4;
  }

  .check-message.error {
    color: var(--error);
  }

  .check-duration {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--muted);
    flex-shrink: 0;
  }
</style>
