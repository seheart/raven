<script>
  import { logger } from './logger.js';
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';
  import { notifications } from './notificationService.js';
  import { formatTime as formatTimeString } from './timeFormat.js';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import { API_CONFIG } from '../config.js';

  const API_BASE = API_CONFIG.BASE_URL;

  // Dynamic endpoint list loaded from backend
  let apiEndpoints = [];
  let endpointsLoaded = false;

  let healthStatus = {};
  let healthHistory = {}; // Track history for success rate and sparklines
  let loading = true;
  let lastCheck = null;
  let refreshInterval;
  let checkingAll = false;
  let realtimeActive = false;
  let pollingInterval = 30; // seconds (configurable)
  let alertsEnabled = true;
  let lastUpdated = null;
  let isManualRefresh = false;
  let previousPollingInterval = 30; // Track previous value to prevent unnecessary restarts

  // Track timeouts for cleanup
  let realtimeTimeouts = [];

  function handleRealtimeUpdate() {
    // Quick health check when events occur
    realtimeActive = true;
    const timeout = setTimeout(() => { realtimeActive = false; }, 1000);
    realtimeTimeouts.push(timeout);

    // Re-check critical endpoints on events
    const criticalEndpoints = (apiEndpoints || []).filter(e =>
      e?.category === 'Core' || e?.category === 'Dashboard'
    );

    criticalEndpoints.forEach(endpoint => {
      checkEndpoint(endpoint);
    });
  }

  // Load endpoints dynamically from backend
  async function loadEndpoints() {
    try {
      const response = await fetch(`${API_BASE}/api/endpoints`);
      const data = await response.json();

      if (data.endpoints) {
        // Filter to only GET endpoints without path parameters for health checking
        // Skip endpoints with :param, :id, etc. as they need actual values
        apiEndpoints = data.endpoints.filter(e =>
          e.method === 'GET' && !e.path.includes(':')
        );
        endpointsLoaded = true;
      }
    } catch (error) {
      logger.error('[APIHealth] Failed to load endpoints:', error);
      apiEndpoints = [];
      endpointsLoaded = true;
    }
  }

  // WebSocket event handler for project-switched
  const handleProjectSwitched = async () => {
    await checkAllEndpoints();
  };

  // Start/restart polling with configurable interval
  function startPolling() {
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(checkAllEndpoints, pollingInterval * 1000);
  }

  // Watch for changes to polling interval (fix: track previous value to prevent unnecessary restarts)
  $: {
    if (pollingInterval !== previousPollingInterval) {
      previousPollingInterval = pollingInterval;
      if (pollingInterval > 0) {
        startPolling();
      } else if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
      }
    }
  }

  onMount(async () => {
    await loadEndpoints();
    await checkAllEndpoints();

    // Start polling with configurable interval
    startPolling();

    // Listen for real-time events that might affect API health
    websocketService.connect();

    // Re-check on file changes (might affect tracked-files endpoint)
    websocketService.on('file-changed', handleRealtimeUpdate);

    // Re-check on agent events (affects agent endpoints)
    websocketService.on('agent-event', handleRealtimeUpdate);

    // Re-check on project switch (affects all endpoints)
    websocketService.on('project-switched', handleProjectSwitched);

    // Re-check on system metrics (affects metrics endpoints)
    websocketService.on('system-metrics', handleRealtimeUpdate);

    // Re-check on trigger events
    websocketService.on('trigger-fired', handleRealtimeUpdate);
  });

  onDestroy(() => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }

    // Clean up timeouts
    realtimeTimeouts.forEach(timeout => clearTimeout(timeout));

    // Cleanup WebSocket listeners
    websocketService.off('file-changed', handleRealtimeUpdate);
    websocketService.off('agent-event', handleRealtimeUpdate);
    websocketService.off('project-switched', handleProjectSwitched);
    websocketService.off('system-metrics', handleRealtimeUpdate);
    websocketService.off('trigger-fired', handleRealtimeUpdate);
  });

  async function checkAllEndpoints(manual = false) {
    checkingAll = true;
    loading = true;
    isManualRefresh = manual;
    const startTime = Date.now();

    for (const endpoint of apiEndpoints) {
      await checkEndpoint(endpoint);
    }

    lastCheck = new Date();
    lastUpdated = new Date();
    loading = false;
    checkingAll = false;
    isManualRefresh = false;
  }

  async function checkEndpoint(endpoint) {
    const key = endpoint.path;
    const startTime = performance.now();

    // Initialize history if needed
    if (!healthHistory[key]) {
      healthHistory[key] = { checks: [], successCount: 0, totalCount: 0 };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${API_BASE}${endpoint.path}`, {
        method: endpoint.method,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const endTime = performance.now();
      const responseTime = Math.round(endTime - startTime);
      const isSuccess = response.ok;

      // Update history
      healthHistory[key].checks.push({
        timestamp: Date.now(),
        responseTime,
        success: isSuccess
      });
      healthHistory[key].checks = healthHistory[key].checks.slice(-50); // Keep last 50
      healthHistory[key].totalCount++;
      if (isSuccess) healthHistory[key].successCount++;

      // Calculate success rate
      const recentChecks = healthHistory[key].checks.slice(-20);
      const successRate = recentChecks.length > 0
        ? (recentChecks.filter(c => c.success).length / recentChecks.length) * 100
        : 100;

      healthStatus[key] = {
        status: response.ok ? 'healthy' : 'error',
        statusCode: response.status,
        responseTime,
        successRate: successRate.toFixed(1),
        lastCheck: new Date(),
        history: healthHistory[key].checks.slice(-10) // Last 10 for sparkline
      };

      // Alert if endpoint fails
      if (!response.ok && alertsEnabled) {
        notifications.error(`API endpoint ${key} returned ${response.status}`, {
          title: 'API Health Alert'
        });
      }
    } catch (error) {
      // Update history with failure
      healthHistory[key].checks.push({
        timestamp: Date.now(),
        responseTime: null,
        success: false
      });
      healthHistory[key].checks = healthHistory[key].checks.slice(-50);
      healthHistory[key].totalCount++;

      const recentChecks = healthHistory[key].checks.slice(-20);
      const successRate = recentChecks.length > 0
        ? (recentChecks.filter(c => c.success).length / recentChecks.length) * 100
        : 0;

      healthStatus[key] = {
        status: 'error',
        statusCode: 0,
        responseTime: null,
        error: error.message,
        successRate: successRate.toFixed(1),
        lastCheck: new Date(),
        history: healthHistory[key].checks.slice(-10)
      };

      // Alert on error
      if (alertsEnabled) {
        notifications.error(`API endpoint ${key} failed: ${error.message}`, {
          title: 'API Health Alert'
        });
      }
    }

    // Trigger reactivity
    healthStatus = healthStatus;
  }

  function groupedEndpoints() {
    const grouped = {};
    for (const endpoint of apiEndpoints) {
      const cat = endpoint.category || 'Other';
      if (!grouped[cat]) {
        grouped[cat] = [];
      }
      grouped[cat].push(endpoint);
    }
    return grouped;
  }

  function formatTime(date) {
    if (!date) return 'Never';
    return formatTimeString(date);
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

  $: grouped = apiEndpoints.length > 0 ? groupedEndpoints() : {};
</script>

<div class="api-health" role="region" aria-label="API health monitor">
  <div class="header">
    <div>
      <h2 id="api-health-heading"><span aria-hidden="true">🔌</span> API Health Monitor</h2>
      <div class="status-indicators">
        {#if realtimeActive}
          <span class="realtime-badge" role="status" aria-live="polite"><span aria-hidden="true">⚡</span> Checking...</span>
        {/if}
      </div>
    </div>
    <div class="header-controls" role="toolbar" aria-label="API health monitor controls">
      <span class="last-updated" role="status" aria-live="polite">Updated: {timeAgo}</span>
      <label class="control-label">
        <span>Polling:</span>
        <select bind:value={pollingInterval} aria-label="Select polling interval">
          <option value={10}>10s</option>
          <option value={30}>30s</option>
          <option value={60}>1m</option>
          <option value={120}>2m</option>
          <option value={300}>5m</option>
        </select>
      </label>
      <label class="control-label">
        <input type="checkbox" bind:checked={alertsEnabled} aria-label="Enable health alerts" />
        <span>Alerts</span>
      </label>
      <button on:click={() => checkAllEndpoints(true)} disabled={checkingAll} class="btn-refresh" aria-label={checkingAll ? 'Checking all endpoints' : 'Check all endpoints'}>
        <span class="refresh-icon" class:spinning={isManualRefresh} aria-hidden="true">↻</span>
        {checkingAll ? 'Checking...' : 'Check All'}
      </button>
    </div>
  </div>

  {#if !endpointsLoaded || (loading && Object.keys(healthStatus).length === 0)}
    <LoadingSkeleton count={10} height="60px" />
  {:else if apiEndpoints.length === 0}
    <div class="empty-state" role="status">
      <p><span aria-hidden="true">❌</span> No API endpoints found</p>
      <button class="btn-refresh" on:click={() => loadEndpoints()} aria-label="Retry loading endpoints">Retry</button>
    </div>
  {:else}
    <div class="categories" role="list" aria-labelledby="api-health-heading">
      {#each Object.entries(grouped) as [category, endpoints] (category)}
        <section class="category-section" role="listitem" aria-labelledby="category-{category}">
          <h3 class="category-title" id="category-{category}">{category}</h3>
          <div class="endpoints-list" role="list" aria-label="{category} endpoints">
            {#each endpoints || [] as endpoint (endpoint.path)}
              {@const status = healthStatus[endpoint.path]}
              <div class="endpoint-row" class:healthy={status?.status === 'healthy'} class:error={status?.status === 'error'} role="listitem">
                <div class="endpoint-status">
                  {#if status?.status === 'healthy'}
                    <span class="status-icon" aria-label="Healthy" role="img">🟢</span>
                  {:else if status?.status === 'error'}
                    <span class="status-icon" aria-label="Error" role="img">🔴</span>
                  {:else}
                    <span class="status-icon" aria-label="Unknown" role="img">⚪</span>
                  {/if}
                </div>

                <div class="endpoint-method">
                  <span class="method-badge" class:get={endpoint.method === 'GET'} class:post={endpoint.method === 'POST'}>
                    {endpoint.method}
                  </span>
                </div>

                <div class="endpoint-path">
                  <code>{endpoint.path}</code>
                  <span class="endpoint-desc">{endpoint.description}</span>
                </div>

                <div class="endpoint-metrics">
                  {#if status?.successRate}
                    <span class="success-rate" class:excellent={parseFloat(status.successRate) >= 99} class:good={parseFloat(status.successRate) >= 90 && parseFloat(status.successRate) < 99} class:poor={parseFloat(status.successRate) < 90} role="status">
                      {status.successRate}%
                    </span>
                  {/if}
                  {#if status?.responseTime !== null && status?.responseTime !== undefined}
                    <span class="response-time" class:fast={status.responseTime < 50} class:medium={status.responseTime >= 50 && status.responseTime < 200} class:slow={status.responseTime >= 200} role="status">
                      {status.responseTime}ms
                    </span>
                  {/if}
                  {#if status?.history && status.history.length > 0}
                    <div class="sparkline" title="Response time history (last 10 checks)" role="img" aria-label="Response time sparkline showing last 10 checks">
                      {#each status.history as check, i (i)}
                        <div
                          class="spark-bar"
                          class:bar-success={check.success}
                          class:bar-failure={!check.success}
                          style="height: {check.success && check.responseTime ? Math.min((check.responseTime / 500) * 100, 100) : 10}%"
                          aria-hidden="true"
                        ></div>
                      {/each}
                    </div>
                  {/if}
                  {#if status?.statusCode}
                    <span class="status-code" class:success={status.statusCode >= 200 && status.statusCode < 300} class:error-code={status.statusCode >= 400} role="status">
                      {status.statusCode}
                    </span>
                  {/if}
                </div>

                <div class="endpoint-actions">
                  <button on:click={() => checkEndpoint(endpoint)} class="btn-test" aria-label="Test {endpoint.path} endpoint">
                    <span aria-hidden="true">⚡</span>
                  </button>
                </div>
              </div>
            {/each}
          </div>
        </section>
      {/each}
    </div>
  {/if}
</div>

<style>
  .api-health {
    padding: 12px;
    width: 100%;
    margin: 0;
    font-family: var(--mono);
    background-color: var(--bg);
    color: var(--text);
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
    padding: 0 8px;
  }

  h2 {
    margin: 0 0 4px 0;
    font-size: 12px;
    font-weight: 600;
  }

  .status-indicators {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  /* (removed unused .last-check) */

  .realtime-badge {
    padding: 4px 10px;
    background: color-mix(in srgb, var(--success) 15%, transparent);
    border: 1px solid var(--success);
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    color: var(--success);
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  .header-controls {
    display: flex;
    align-items: center;
    gap: 8px;
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
    opacity: 0.6;
    cursor: not-allowed;
  }

  .refresh-icon {
    display: inline-block;
    font-size: 11px;
  }

  .refresh-icon.spinning {
    animation: spin-refresh 1s linear infinite;
  }

  @keyframes spin-refresh {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  /* (removed unused .loading) */

  .empty-state {
    text-align: center;
    padding: 12px 8px;
    color: var(--muted);
    font-size: 11px;
  }

  .categories {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .category-section {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .category-title {
    margin: 0;
    padding: 6px 10px;
    font-size: 11px;
    font-weight: 600;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .endpoints-list {
    display: flex;
    flex-direction: column;
  }

  .endpoint-row {
    display: grid;
    grid-template-columns: 40px 70px 1fr 120px 50px;
    gap: 12px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
    align-items: center;
    transition: all 0.2s;
  }

  .endpoint-row:last-child {
    border-bottom: none;
  }

  .endpoint-row:hover {
    background: color-mix(in srgb, var(--accent) 5%, transparent);
  }

  .endpoint-row.healthy {
    border-left: 3px solid var(--success);
  }

  .endpoint-row.error {
    border-left: 3px solid var(--error);
  }

  .status-icon {
    font-size: 11px;
  }

  .endpoint-method {
    display: flex;
    align-items: center;
  }

  .method-badge {
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .method-badge.get {
    background: color-mix(in srgb, var(--info) 20%, transparent);
    color: var(--info);
  }

  .method-badge.post {
    background: color-mix(in srgb, var(--success) 20%, transparent);
    color: var(--success);
  }

  .endpoint-path {
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow: hidden;
  }

  .endpoint-path code {
    font-size: 11px;
    color: var(--accent);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .endpoint-desc {
    font-size: 11px;
    color: var(--muted);
  }

  .endpoint-metrics {
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: flex-end;
  }

  .response-time {
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
  }

  .response-time.fast {
    background: color-mix(in srgb, var(--success) 20%, transparent);
    color: var(--success);
  }

  .response-time.medium {
    background: color-mix(in srgb, #f59e0b 20%, transparent);
    color: #fbbf24;
  }

  .response-time.slow {
    background: color-mix(in srgb, var(--error) 20%, transparent);
    color: var(--error);
  }

  .status-code {
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
  }

  .status-code.success {
    background: color-mix(in srgb, var(--success) 20%, transparent);
    color: var(--success);
  }

  .status-code.error-code {
    background: color-mix(in srgb, var(--error) 20%, transparent);
    color: var(--error);
  }

  .btn-test {
    padding: 4px 8px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.2s;
  }

  .btn-test:hover {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .btn-refresh:focus,
  .btn-test:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  @media (max-width: 768px) {
    .endpoint-row {
      grid-template-columns: 30px 60px 1fr 80px 40px;
      gap: 8px;
    }

    .endpoint-desc {
      display: none;
    }
  }

  /* Header Controls */
  .header-controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .control-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--text);
  }

  .control-label select {
    padding: 6px 12px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--surface);
    color: var(--text);
    font-family: var(--mono);
    cursor: pointer;
  }

  .control-label input[type="checkbox"] {
    cursor: pointer;
  }

  /* Success Rate */
  .success-rate {
    font-size: 11px;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 4px;
    font-family: var(--mono);
  }

  .success-rate.excellent {
    background: var(--success);
    color: white;
  }

  .success-rate.good {
    background: var(--warning);
    color: white;
  }

  .success-rate.poor {
    background: var(--error);
    color: white;
  }

  /* Sparkline */
  .sparkline {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 24px;
    min-width: 80px;
  }

  .spark-bar {
    flex: 1;
    min-width: 4px;
    max-width: 8px;
    border-radius: 2px 2px 0 0;
    transition: height 0.2s ease;
  }

  .spark-bar.bar-success {
    background: var(--success);
    opacity: 0.8;
  }

  .spark-bar.bar-failure {
    background: var(--error);
    height: 100% !important;
  }
</style>
