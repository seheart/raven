<script>
  import { logger } from '../logger.js';
  /**
   * System API Health Page - Complete endpoint monitoring with sparklines and real-time updates
   * Rebuilt from Svelte 4 to Svelte 5 + Tailwind CSS
   */
  import { onMount, onDestroy } from 'svelte';
  import { api } from '../apiClient.js';
  import { websocketService } from '../services/websocket.js';
  import { getTimeAgo } from '../timeFormat.js';
  import { TimeoutManager } from '../utils/TimeoutManager.js';

  // State using Svelte 5 runes
  let apiEndpoints = $state([]);
  let endpointsLoaded = $state(false);
  let healthStatus = $state({});
  let healthHistory = $state({});
  let loading = $state(true);
  let lastCheck = $state(null);
  let lastUpdated = $state(null);
  let checkingAll = $state(false);
  let realtimeActive = $state(false);
  let pollingInterval = $state(30); // seconds
  let alertsEnabled = $state(true);
  let isManualRefresh = $state(false);
  let previousPollingInterval = $state(30);

  // Timeout and interval management
  const timeouts = new TimeoutManager();
  let refreshInterval;

  // Constants
  const BATCH_SIZE = 20;

  // Derived values
  const timeAgo = $derived(getTimeAgo(lastUpdated));
  const grouped = $derived(apiEndpoints.length > 0 ? groupedEndpoints() : {});

  // Load endpoints dynamically from backend
  async function loadEndpoints() {
    try {
      const data = await api.get('/endpoints');

      if (data.endpoints) {
        // Filter to only GET endpoints without path parameters for health checking
        const filtered = data.endpoints.filter(e =>
          e.method === 'GET' && !e.path.includes(':')
        );

        // Deduplicate by path (keep first occurrence)
        const seen = new Set();
        apiEndpoints = filtered.filter(e => {
          if (seen.has(e.path)) return false;
          seen.add(e.path);
          return true;
        });

        endpointsLoaded = true;
      }
    } catch (error) {
      logger.error('[APIHealth] Failed to load endpoints:', error);
      apiEndpoints = [];
      endpointsLoaded = true;
    }
  }

  // Group endpoints by category
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

  // Check individual endpoint health
  async function checkEndpoint(endpoint) {
    const key = endpoint.path;
    const startTime = performance.now();

    // Initialize history if needed
    if (!healthHistory[key]) {
      healthHistory[key] = { checks: [], successCount: 0, totalCount: 0 };
    }

    try {
      const controller = new AbortController();
      // Use longer timeout for known-slow endpoints
      const timeout = endpoint.path.includes('comprehensive') || endpoint.path.includes('snapshots')
        ? 25000 // 25 seconds for slow endpoints
        : 5000;  // 5 seconds for normal endpoints
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3030'}${endpoint.path}`, {
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

      // Calculate success rate from last 20 checks
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
    }

    // Trigger reactivity
    healthStatus = healthStatus;
  }

  // Check all endpoints in batches
  async function checkAllEndpoints(manual = false) {
    checkingAll = true;
    loading = true;
    isManualRefresh = manual;

    // Check endpoints in batches with progressive rendering
    for (let i = 0; i < apiEndpoints.length; i += BATCH_SIZE) {
      const batch = apiEndpoints.slice(i, i + BATCH_SIZE);
      // Start all checks in parallel and update UI as each completes
      const promises = batch.map(endpoint => checkEndpoint(endpoint));
      await Promise.all(promises);
      // Force UI update after each batch
      healthStatus = { ...healthStatus };
    }

    lastCheck = new Date();
    lastUpdated = new Date();
    loading = false;
    checkingAll = false;
    isManualRefresh = false;
  }

  // Handle real-time update events
  function handleRealtimeUpdate() {
    // Quick health check when events occur
    realtimeActive = true;
    timeouts.add(() => { realtimeActive = false; }, 1000);

    // Re-check critical endpoints on events
    const criticalEndpoints = (apiEndpoints || []).filter(e =>
      e?.category === 'Core' || e?.category === 'Dashboard'
    );

    criticalEndpoints.forEach(endpoint => {
      checkEndpoint(endpoint);
    });
  }

  // Handle project-switched event
  const handleProjectSwitched = async () => {
    await checkAllEndpoints();
  };

  // Start/restart polling with configurable interval
  function startPolling() {
    if (refreshInterval) clearInterval(refreshInterval);
    if (pollingInterval > 0) {
      refreshInterval = setInterval(checkAllEndpoints, pollingInterval * 1000);
    }
  }

  // Clear history and reset success rates
  function clearHistory() {
    healthHistory = {};
    healthStatus = {};
    checkAllEndpoints(true);
  }

  // Watch for changes to polling interval
  $effect(() => {
    if (pollingInterval !== previousPollingInterval) {
      previousPollingInterval = pollingInterval;
      startPolling();
    }
  });

  onMount(async () => {
    await loadEndpoints();

    // Clear any stale history on mount
    healthHistory = {};

    await checkAllEndpoints();

    // Start polling
    startPolling();

    // Listen for real-time events
    websocketService.connect();

    // Re-check on file changes (might affect tracked-files endpoint)
    websocketService.on('file-changed', handleRealtimeUpdate);

    // Re-check on agent events
    websocketService.on('agent-event', handleRealtimeUpdate);

    // Re-check on project switch
    websocketService.on('project-switched', handleProjectSwitched);

    // Re-check on system metrics
    websocketService.on('system-metrics', handleRealtimeUpdate);

    // Re-check on trigger events
    websocketService.on('trigger-fired', handleRealtimeUpdate);
  });

  onDestroy(() => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }

    // Clean up timeouts
    timeouts.cleanup();

    // Cleanup WebSocket listeners
    websocketService.off('file-changed', handleRealtimeUpdate);
    websocketService.off('agent-event', handleRealtimeUpdate);
    websocketService.off('project-switched', handleProjectSwitched);
    websocketService.off('system-metrics', handleRealtimeUpdate);
    websocketService.off('trigger-fired', handleRealtimeUpdate);
  });

  // Get severity color for success rate
  function getSuccessRateClass(rate) {
    const rateNum = parseFloat(rate);
    if (rateNum >= 99) return 'excellent';
    if (rateNum >= 90) return 'good';
    return 'poor';
  }

  // Get response time class
  function getResponseTimeClass(time) {
    if (time < 50) return 'fast';
    if (time < 200) return 'medium';
    return 'slow';
  }
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-7xl mx-auto">
    <!-- Header -->
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">
          <span aria-hidden="true">🔌</span> API Health Monitor
        </h1>
        <div class="flex items-center gap-4">
          {#if realtimeActive}
            <span
              class="px-3 py-1 text-xs font-semibold rounded bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[var(--success)] text-[var(--success)]"
              style="animation: pulse 1.5s ease-in-out infinite"
              role="status"
              aria-live="polite"
            >
              <span aria-hidden="true">⚡</span> Checking...
            </span>
          {/if}
        </div>
      </div>

      <div class="flex items-center gap-3 flex-wrap">
        <span class="text-sm text-[var(--muted)] font-mono" role="status" aria-live="polite">
          Updated: {timeAgo}
        </span>

        <label class="flex items-center gap-2 text-sm text-[var(--text)] font-sans">
          <span>Polling:</span>
          <select
            bind:value={pollingInterval}
            class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-mono focus:outline-none focus:border-[var(--accent)]"
            aria-label="Select polling interval"
          >
            <option value={10}>10s</option>
            <option value={30}>30s</option>
            <option value={60}>1m</option>
            <option value={120}>2m</option>
            <option value={300}>5m</option>
          </select>
        </label>

        <label class="flex items-center gap-2 text-sm text-[var(--text)] font-sans cursor-pointer">
          <input type="checkbox" bind:checked={alertsEnabled} aria-label="Enable health alerts" class="w-4 h-4" />
          <span>Alerts</span>
        </label>

        <button
          onclick={clearHistory}
          disabled={checkingAll}
          class="px-3 py-1.5 bg-[var(--error)] text-white text-sm font-medium rounded hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Clear history and reset success rates"
          title="Clear history to reset success rates"
        >
          Clear History
        </button>

        <button
          onclick={() => checkAllEndpoints(true)}
          disabled={checkingAll}
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] text-sm font-medium rounded hover:bg-[var(--surface-2)] hover:border-[var(--accent)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label={checkingAll ? 'Checking all endpoints' : 'Check all endpoints'}
        >
          <span class:animate-spin={isManualRefresh} aria-hidden="true">↻</span>
          {checkingAll ? 'Checking...' : 'Check All'}
        </button>
      </div>
    </div>

    <!-- Content -->
    {#if !endpointsLoaded || (loading && Object.keys(healthStatus).length === 0)}
      <!-- Loading skeleton -->
      <div class="space-y-4">
        {#each Array(10) as _, i (i)}
          <div class="h-16 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-pulse"></div>
        {/each}
      </div>
    {:else if apiEndpoints.length === 0}
      <!-- Empty state -->
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center">
        <div class="text-4xl mb-4" aria-hidden="true">❌</div>
        <h2 class="text-xl font-bold text-[var(--text)] mb-2">No API endpoints found</h2>
        <button
          class="mt-4 px-4 py-2 bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] rounded hover:border-[var(--accent)] transition-colors"
          onclick={() => loadEndpoints()}
          aria-label="Retry loading endpoints"
        >
          Retry
        </button>
      </div>
    {:else}
      <!-- Categories -->
      <div class="flex flex-col gap-6" role="list" aria-label="API endpoints by category">
        {#each Object.entries(grouped) as [category, endpoints] (category)}
          <section class="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden" role="listitem">
            <h2 class="px-6 py-4 text-xs font-semibold uppercase tracking-wide text-[var(--text)] bg-[var(--bg)] border-b border-[var(--border)]">
              {category} ({endpoints.length})
            </h2>

            <div class="divide-y divide-[var(--border)]" role="list" aria-label="{category} endpoints">
              {#each endpoints || [] as endpoint (endpoint.path)}
                {@const status = healthStatus[endpoint.path]}
                {@const isHealthy = status?.status === 'healthy'}
                {@const isError = status?.status === 'error'}
                {@const successRateClass = status?.successRate ? getSuccessRateClass(status.successRate) : ''}
                {@const responseTimeClass = status?.responseTime !== null && status?.responseTime !== undefined ? getResponseTimeClass(status.responseTime) : ''}

                <div
                  class="grid grid-cols-[40px_80px_1fr_auto_60px] gap-4 px-6 py-4 items-center transition-all hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)]"
                  class:border-l-[3px]={isHealthy || isError}
                  class:border-l-[var(--success)]={isHealthy}
                  class:border-l-[var(--error)]={isError}
                  role="listitem"
                >
                  <!-- Status Icon -->
                  <div class="flex items-center justify-center">
                    {#if isHealthy}
                      <span class="text-lg" aria-label="Healthy" role="img">🟢</span>
                    {:else if isError}
                      <span class="text-lg" aria-label="Error" role="img">🔴</span>
                    {:else}
                      <span class="text-lg" aria-label="Unknown" role="img">⚪</span>
                    {/if}
                  </div>

                  <!-- Method Badge -->
                  <div>
                    <span
                      class="inline-block px-3 py-1 rounded text-xs font-bold uppercase tracking-wide"
                      class:bg-[color-mix(in_srgb,var(--info)_20%,transparent)]={endpoint.method === 'GET'}
                      class:text-[var(--info)]={endpoint.method === 'GET'}
                      class:bg-[color-mix(in_srgb,var(--success)_20%,transparent)]={endpoint.method === 'POST'}
                      class:text-[var(--success)]={endpoint.method === 'POST'}
                    >
                      {endpoint.method}
                    </span>
                  </div>

                  <!-- Endpoint Path & Description -->
                  <div class="flex flex-col gap-1 min-w-0">
                    <code class="text-xs text-[var(--accent)] font-medium truncate">{endpoint.path}</code>
                    <span class="text-xs text-[var(--muted)]">{endpoint.description}</span>
                  </div>

                  <!-- Metrics -->
                  <div class="flex items-center gap-3">
                    <!-- Success Rate -->
                    {#if status?.successRate}
                      <span
                        class="px-3 py-1 rounded text-xs font-semibold font-mono text-white"
                        class:bg-[var(--success)]={successRateClass === 'excellent'}
                        class:bg-[var(--warning)]={successRateClass === 'good'}
                        class:bg-[var(--error)]={successRateClass === 'poor'}
                        role="status"
                      >
                        {status.successRate}%
                      </span>
                    {/if}

                    <!-- Response Time -->
                    {#if status?.responseTime !== null && status?.responseTime !== undefined}
                      <span
                        class="px-3 py-1 rounded text-xs font-semibold font-mono"
                        class:bg-[color-mix(in_srgb,var(--success)_20%,transparent)]={responseTimeClass === 'fast'}
                        class:text-[var(--success)]={responseTimeClass === 'fast'}
                        class:bg-[color-mix(in_srgb,var(--warning)_20%,transparent)]={responseTimeClass === 'medium'}
                        class:text-[var(--warning)]={responseTimeClass === 'medium'}
                        class:bg-[color-mix(in_srgb,var(--error)_20%,transparent)]={responseTimeClass === 'slow'}
                        class:text-[var(--error)]={responseTimeClass === 'slow'}
                        role="status"
                      >
                        {status.responseTime}ms
                      </span>
                    {/if}

                    <!-- Sparkline -->
                    {#if status?.history && status.history.length > 0}
                      <div
                        class="flex items-end gap-1 h-8 min-w-[110px] bg-[rgba(0,0,0,0.2)] rounded px-2 py-1 border border-[var(--border)]"
                        title="Response time history (last 10 checks)"
                        role="img"
                        aria-label="Response time sparkline showing last 10 checks"
                      >
                        {#each status.history as check, i (i)}
                          {@const barHeight = check.success && check.responseTime ? Math.min((check.responseTime / 500) * 100, 100) : 10}
                          {@const isFast = check.success && check.responseTime < 50}
                          {@const isMedium = check.success && check.responseTime >= 50 && check.responseTime < 200}
                          {@const isSlow = check.success && check.responseTime >= 200}
                          {@const isFailure = !check.success}

                          <div
                            class="flex-1 min-w-[5px] max-w-[10px] rounded-t transition-all hover:scale-y-110 hover:brightness-125"
                            style="
                              height: {barHeight}%;
                              background: {isFailure ? `linear-gradient(to top, var(--accent), color-mix(in srgb, var(--accent) 80%, white))` : isFast ? `linear-gradient(to top, var(--success), color-mix(in srgb, var(--success) 80%, white))` : isMedium ? `linear-gradient(to top, var(--warning), color-mix(in srgb, var(--warning) 80%, white))` : `linear-gradient(to top, var(--error), color-mix(in srgb, var(--error) 80%, white))`};
                              box-shadow: 0 0 6px {isFailure ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : isFast ? 'color-mix(in srgb, var(--success) 40%, transparent)' : isMedium ? 'color-mix(in srgb, var(--warning) 40%, transparent)' : 'color-mix(in srgb, var(--error) 40%, transparent)'};
                            "
                            title="{check.responseTime || 'failed'}ms"
                            aria-hidden="true"
                          ></div>
                        {/each}
                      </div>
                    {/if}

                    <!-- Status Code -->
                    {#if status?.statusCode}
                      <span
                        class="px-3 py-1 rounded text-xs font-semibold font-mono"
                        class:bg-[color-mix(in_srgb,var(--success)_20%,transparent)]={status.statusCode >= 200 && status.statusCode < 300}
                        class:text-[var(--success)]={status.statusCode >= 200 && status.statusCode < 300}
                        class:bg-[color-mix(in_srgb,var(--error)_20%,transparent)]={status.statusCode >= 400}
                        class:text-[var(--error)]={status.statusCode >= 400}
                        role="status"
                      >
                        {status.statusCode}
                      </span>
                    {/if}
                  </div>

                  <!-- Test Button -->
                  <div>
                    <button
                      onclick={() => checkEndpoint(endpoint)}
                      class="px-2 py-1 bg-transparent border border-[var(--border)] rounded hover:border-[var(--accent)] hover:bg-[var(--surface-2)] transition-colors"
                      aria-label="Test {endpoint.path} endpoint"
                      title="Test endpoint"
                    >
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
</div>

<style>
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }
</style>
