<script>
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';
  import PageInfo from './PageInfo.svelte';
  import { formatTime as formatTimeString } from './timeFormat.js';

  const API_BASE = 'http://localhost:3030';

  let apiEndpoints = [
    // Core
    { category: 'Core', method: 'GET', path: '/health', description: 'Server health' },
    { category: 'Core', method: 'GET', path: '/api/session-id', description: 'Current session ID' },

    // Dashboard
    { category: 'Dashboard', method: 'GET', path: '/api/dashboard-stats', description: 'Dashboard statistics' },
    { category: 'Dashboard', method: 'GET', path: '/api/top-modified-files', description: 'Most modified files' },
    { category: 'Dashboard', method: 'GET', path: '/api/longest-edits', description: 'Longest code edits' },

    // Agents
    { category: 'Agents', method: 'GET', path: '/api/agents-status', description: 'All agent status' },
    { category: 'Agents', method: 'GET', path: '/api/agent-events', description: 'Agent events log' },
    { category: 'Agents', method: 'GET', path: '/api/agent-stats', description: 'Agent statistics' },

    // Metrics
    { category: 'Metrics', method: 'GET', path: '/api/system-metrics', description: 'System performance' },
    { category: 'Metrics', method: 'GET', path: '/api/metrics-stats', description: 'Metrics statistics' },
    { category: 'Metrics', method: 'GET', path: '/api/performance-correlations', description: 'Performance data' },

    // File Tracking
    { category: 'Files', method: 'GET', path: '/api/tracked-files', description: 'Tracked files list' },
    { category: 'Files', method: 'GET', path: '/api/file-events', description: 'File change events' },

    // Triggers
    { category: 'Triggers', method: 'GET', path: '/api/triggers-config', description: 'Trigger configuration' },
    { category: 'Triggers', method: 'GET', path: '/api/triggered-events', description: 'Triggered events log' },
    { category: 'Triggers', method: 'GET', path: '/api/trigger-stats', description: 'Trigger statistics' },

    // Projects
    { category: 'Projects', method: 'GET', path: '/api/projects/list', description: 'Available projects' },

    // Git
    { category: 'Git', method: 'GET', path: '/api/git/status', description: 'Git repository status' },
    { category: 'Git', method: 'GET', path: '/api/git/branches', description: 'Git branches' },
    { category: 'Git', method: 'GET', path: '/api/git/history', description: 'Git commit history' },

    // Control
    { category: 'Control', method: 'GET', path: '/api/control/export-health', description: 'Export health data' },
  ];

  let healthStatus = {};
  let loading = true;
  let lastCheck = null;
  let refreshInterval;
  let checkingAll = false;
  let realtimeActive = false;

  function handleRealtimeUpdate() {
    // Quick health check when events occur
    realtimeActive = true;
    setTimeout(() => { realtimeActive = false; }, 1000);

    // Re-check critical endpoints on events
    const criticalEndpoints = (apiEndpoints || []).filter(e =>
      e?.category === 'Core' || e?.category === 'Dashboard'
    );

    criticalEndpoints.forEach(endpoint => {
      checkEndpoint(endpoint);
    });
  }

  // WebSocket event handler for project-switched
  const handleProjectSwitched = async () => {
    await checkAllEndpoints();
  };

  onMount(async () => {
    await checkAllEndpoints();

    // Reduced polling interval to 10 seconds (more responsive)
    refreshInterval = setInterval(checkAllEndpoints, 10000);

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

    // Cleanup WebSocket listeners
    websocketService.off('file-changed', handleRealtimeUpdate);
    websocketService.off('agent-event', handleRealtimeUpdate);
    websocketService.off('project-switched', handleProjectSwitched);
    websocketService.off('system-metrics', handleRealtimeUpdate);
    websocketService.off('trigger-fired', handleRealtimeUpdate);
  });

  async function checkAllEndpoints() {
    checkingAll = true;
    loading = true;
    const startTime = Date.now();

    for (const endpoint of apiEndpoints) {
      await checkEndpoint(endpoint);
    }

    lastCheck = new Date();
    loading = false;
    checkingAll = false;
  }

  async function checkEndpoint(endpoint) {
    const key = endpoint.path;
    const startTime = performance.now();

    try {
      const response = await fetch(`${API_BASE}${endpoint.path}`, {
        method: endpoint.method,
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });

      const endTime = performance.now();
      const responseTime = Math.round(endTime - startTime);

      healthStatus[key] = {
        status: response.ok ? 'healthy' : 'error',
        statusCode: response.status,
        responseTime,
        lastCheck: new Date()
      };
    } catch (error) {
      healthStatus[key] = {
        status: 'error',
        statusCode: 0,
        responseTime: null,
        error: error.message,
        lastCheck: new Date()
      };
    }

    // Trigger reactivity
    healthStatus = healthStatus;
  }

  function groupedEndpoints() {
    const grouped = {};
    for (const endpoint of apiEndpoints) {
      if (!grouped[endpoint.category]) {
        grouped[endpoint.category] = [];
      }
      grouped[endpoint.category].push(endpoint);
    }
    return grouped;
  }

  function formatTime(date) {
    if (!date) return 'Never';
    return formatTimeString(date);
  }

  $: grouped = groupedEndpoints();
</script>

<div class="api-health">
  <PageInfo
    title="API Health Monitor"
    description="Real-time monitoring of all Raven REST API endpoints. Track response times, success rates, error counts, and overall API health."
    keyPoints={[
      'All endpoints shown with health status',
      'Response time tracking for performance',
      'Success/failure rates per endpoint',
      'Recent request history',
      'Auto-refreshes health checks',
      'Color-coded status indicators'
    ]}
    whenToCheck="Check this page when API calls are failing, to identify slow endpoints, or to verify overall API health."
    warnings={[
      'Red status indicates endpoint failures - check backend logs',
      'Slow response times (>1000ms) might indicate performance issues',
      'Many failed requests warrant immediate investigation'
    ]}
  />

  <div class="header">
    <div>
      <h2>🔌 API Health Monitor</h2>
      <div class="status-indicators">
        {#if lastCheck}
          <p class="last-check">Last checked: {formatTime(lastCheck)}</p>
        {/if}
        {#if realtimeActive}
          <span class="realtime-badge">🔴 Live Update</span>
        {/if}
      </div>
    </div>
    <button on:click={checkAllEndpoints} disabled={checkingAll} class="btn-refresh">
      {checkingAll ? '⏳ Checking...' : '↻ Check All'}
    </button>
  </div>

  {#if loading && Object.keys(healthStatus).length === 0}
    <div class="loading">Checking API endpoints...</div>
  {:else}
    <div class="categories">
      {#each Object.entries(grouped) as [category, endpoints]}
        <div class="category-section">
          <h3 class="category-title">{category}</h3>
          <div class="endpoints-list">
            {#each endpoints || [] as endpoint}
              {@const status = healthStatus[endpoint.path]}
              <div class="endpoint-row" class:healthy={status?.status === 'healthy'} class:error={status?.status === 'error'}>
                <div class="endpoint-status">
                  {#if status?.status === 'healthy'}
                    <span class="status-icon">🟢</span>
                  {:else if status?.status === 'error'}
                    <span class="status-icon">🔴</span>
                  {:else}
                    <span class="status-icon">⚪</span>
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
                  {#if status?.responseTime !== null && status?.responseTime !== undefined}
                    <span class="response-time" class:fast={status.responseTime < 50} class:medium={status.responseTime >= 50 && status.responseTime < 200} class:slow={status.responseTime >= 200}>
                      {status.responseTime}ms
                    </span>
                  {/if}
                  {#if status?.statusCode}
                    <span class="status-code" class:success={status.statusCode >= 200 && status.statusCode < 300} class:error-code={status.statusCode >= 400}>
                      {status.statusCode}
                    </span>
                  {/if}
                </div>

                <div class="endpoint-actions">
                  <button on:click={() => checkEndpoint(endpoint)} class="btn-test" title="Test endpoint">
                    ⚡️
                  </button>
                </div>
              </div>
            {/each}
          </div>
        </div>
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
    margin-bottom: 16px;
    padding: 0 8px;
  }

  h2 {
    margin: 0 0 4px 0;
    font-size: 18px;
    font-weight: 600;
  }

  .status-indicators {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .last-check {
    margin: 0;
    font-size: 11px;
    color: var(--muted);
  }

  .realtime-badge {
    padding: 4px 10px;
    background: color-mix(in srgb, var(--success) 15%, transparent);
    border: 1px solid var(--success);
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    color: var(--success);
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
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

  .btn-refresh:hover:not(:disabled) {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .btn-refresh:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .loading {
    text-align: center;
    padding: 24px;
    color: var(--muted);
    font-size: 12px;
  }

  .categories {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .category-section {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .category-title {
    margin: 0;
    padding: 10px 16px;
    font-size: 14px;
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
    padding: 12px 16px;
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
    font-size: 14px;
  }

  .endpoint-method {
    display: flex;
    align-items: center;
  }

  .method-badge {
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 10px;
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
    font-size: 10px;
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

  @media (max-width: 768px) {
    .endpoint-row {
      grid-template-columns: 30px 60px 1fr 80px 40px;
      gap: 8px;
    }

    .endpoint-desc {
      display: none;
    }
  }
</style>
