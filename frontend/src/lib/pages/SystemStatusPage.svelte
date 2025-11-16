<script>
  import { logger } from '../logger.js';
  import { api } from '../apiClient.js';
  /**
   * System Status Page
   * Backend connectivity, WebSocket, telemetry bridge, Git status, monitored projects, endpoints, and health checks
   */

  import { onMount } from 'svelte';
  import { projectFilter, availableProjects } from '../projectFilterStore.js';
  import { websocketService } from '../services/websocket.js';

  // State
  let backendStatus = $state({
    connected: false,
    status: 'unknown',
    version: 'unknown',
    session_id: '',
    uptime: 0,
    active_agents: 0,
    database: '',
    database_health: { status: 'unknown', accessible: false },
    telemetry_bridge: { running: false, pid: null, healthy: false }
  });

  let websocketStatus = $state({ connected: false, reconnecting: false });
  let gitStatus = $state({
    available: false,
    branch: 'unknown',
    modified: [],
    created: [],
    deleted: [],
    branches: [],
    commits: []
  });

  let healthChecks = $state({
    status: 'pending',
    summary: { total: 0, passed: 0, failed: 0, byCategory: {} },
    checks: []
  });

  let loading = $state(true);
  let lastUpdated = $state(null);
  let restartingBridge = $state(false);
  let healthExpanded = $state(false);

  // Derived
  const timeAgo = $derived.by(() => {
    if (!lastUpdated) return 'Just now';
    const seconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
    if (seconds < 10) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  });

  async function checkBackendHealth() {
    try {
      loading = true;
      const data = await api.get('/health');

      backendStatus = {
        connected: true,
        status: data.status,
        version: data.version || 'unknown',
        session_id: data.session_id,
        uptime: data.uptime,
        active_agents: data.active_agents,
        database: data.database,
        database_health: data.database_health || { status: 'unknown', accessible: false },
        telemetry_bridge: data.telemetry_bridge || { running: false, pid: null, healthy: false }
      };

      lastUpdated = new Date();
      loading = false;
    } catch (error) {
      logger.error('Backend health check failed:', error);
      backendStatus.connected = false;
      loading = false;
    }
  }

  async function checkGitStatus() {
    try {
      const [statusData, branchesData, historyData] = await Promise.all([
        api.get('/git/status').catch(() => null),
        api.get('/git/branches').catch(() => null),
        api.get('/git/history?limit=5').catch(() => null)
      ]);

      if (statusData) {
        gitStatus = {
          available: true,
          branch: statusData.branch || 'unknown',
          modified: statusData.modified || [],
          created: statusData.created || [],
          deleted: statusData.deleted || [],
          branches: branchesData?.branches || [],
          commits: historyData?.commits || []
        };
      }
    } catch (error) {
      gitStatus.available = false;
    }
  }

  async function loadHealthChecks() {
    try {
      const data = await api.get('/health-checks');
      healthChecks = {
        status: data.status || 'pending',
        summary: data.summary || { total: 0, passed: 0, failed: 0, byCategory: {} },
        checks: data.checks || []
      };
    } catch (error) {
      logger.error('Failed to load health checks:', error);
      healthChecks.status = 'error';
    }
  }

  function formatUptime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
  }

  function formatCommitDate(date) {
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  async function restartBridge() {
    if (restartingBridge) return;
    if (
      !confirm(
        'Are you sure you want to restart the telemetry bridge? Claude Code tracking will be interrupted briefly.'
      )
    ) {
      return;
    }

    restartingBridge = true;
    try {
      const result = await api.post('/control/restart-bridge', {});
      if (result.success) {
        setTimeout(() => checkBackendHealth(), 1000);
      }
    } catch (error) {
      logger.error('Error restarting bridge:', error);
    } finally {
      restartingBridge = false;
    }
  }

  function getStatusIcon(status) {
    switch (status) {
      case 'healthy':
        return '✅';
      case 'unhealthy':
        return '⚠️';
      case 'error':
        return '❌';
      case 'pending':
        return '⏳';
      default:
        return '❓';
    }
  }

  function getStatusColor(status) {
    switch (status) {
      case 'healthy':
        return 'var(--success)';
      case 'unhealthy':
        return 'var(--warning)';
      case 'error':
        return 'var(--error)';
      case 'pending':
        return 'var(--muted)';
      default:
        return 'var(--muted)';
    }
  }

  function getCategoryIcon(category) {
    switch (category) {
      case 'database':
        return '💾';
      case 'data':
        return '📊';
      case 'websocket':
        return '🔌';
      case 'system':
        return '🖥️';
      default:
        return '📦';
    }
  }

  onMount(async () => {
    await checkBackendHealth();
    await checkGitStatus();
    await loadHealthChecks();

    // Connect to WebSocket
    websocketService.connect();

    // Check WebSocket status (might take a moment to connect)
    setTimeout(() => {
      websocketStatus.connected = websocketService.isConnected();
    }, 500);

    // Listen for WebSocket connection changes
    websocketService.socket?.on('connect', () => {
      websocketStatus.connected = true;
    });

    websocketService.socket?.on('disconnect', () => {
      websocketStatus.connected = false;
    });
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-7xl mx-auto">
    <!-- Header -->
    <div class="flex justify-between items-start mb-6 flex-wrap gap-4">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">🏥 System Status</h1>
        <p class="text-base text-[var(--muted)] font-sans">
          Backend connectivity and health monitoring
        </p>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-sm text-[var(--muted)] font-mono">Updated: {timeAgo}</span>
        <button
          onclick={() => {
            checkBackendHealth();
            checkGitStatus();
            loadHealthChecks();
          }}
          disabled={loading}
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors disabled:opacity-50"
        >
          <span class:animate-spin={loading}>↻</span> Refresh
        </button>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <!-- Backend Status -->
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
        <div
          class="bg-[var(--bg)] border-b border-[var(--border)] p-4 flex justify-between items-center"
        >
          <h3 class="text-base font-semibold text-[var(--text)] font-sans">⚙️ Backend Server</h3>
          {#if loading}
            <span
              class="px-3 py-1 bg-[var(--surface)] rounded text-xs font-mono text-[var(--muted)]"
              >⏳ Loading...</span
            >
          {:else}
            <span
              class="px-3 py-1 rounded text-xs font-mono"
              class:bg-[var(--success-subtle)]={backendStatus.connected}
              class:text-[var(--success)]={backendStatus.connected}
              class:bg-[var(--error-subtle)]={!backendStatus.connected}
              class:text-[var(--error)]={!backendStatus.connected}
            >
              {backendStatus.connected ? '🟢 Online' : '🔴 Offline'}
            </span>
          {/if}
        </div>
        <div class="p-4">
          {#if loading}
            <div class="space-y-3">
              {#each Array(5) as _, i (i)}
                <div class="h-6 bg-[var(--bg)] rounded animate-pulse"></div>
              {/each}
            </div>
          {:else if backendStatus.connected}
            <div class="space-y-3 text-sm">
              <div class="flex justify-between items-center py-2 border-b border-[var(--border)]">
                <span class="text-[var(--muted)] font-sans">Status:</span>
                <span class="text-[var(--success)] font-mono font-semibold"
                  >{backendStatus.status}</span
                >
              </div>
              <div class="flex justify-between items-center py-2 border-b border-[var(--border)]">
                <span class="text-[var(--muted)] font-sans">Version:</span>
                <span class="text-[var(--text)] font-mono">v{backendStatus.version}</span>
              </div>
              <div class="flex justify-between items-center py-2 border-b border-[var(--border)]">
                <span class="text-[var(--muted)] font-sans">Session ID:</span>
                <div class="flex items-center gap-2">
                  <span
                    class="text-[var(--text)] font-mono text-xs"
                    title={backendStatus.session_id || 'N/A'}
                  >
                    {backendStatus.session_id
                      ? backendStatus.session_id.slice(0, 8) + '...'
                      : 'N/A'}
                  </span>
                  {#if backendStatus.session_id}
                    <button
                      onclick={() => navigator.clipboard.writeText(backendStatus.session_id)}
                      class="px-2 py-1 bg-[var(--bg)] hover:bg-[var(--surface)] rounded text-xs"
                      title="Copy to clipboard"
                    >
                      📋
                    </button>
                  {/if}
                </div>
              </div>
              <div class="flex justify-between items-center py-2 border-b border-[var(--border)]">
                <span class="text-[var(--muted)] font-sans">Uptime:</span>
                <span class="text-[var(--text)] font-mono"
                  >{formatUptime(backendStatus.uptime)}</span
                >
              </div>
              <div class="bg-[var(--bg)] rounded p-2">
                <div class="h-2 bg-[var(--border)] rounded overflow-hidden">
                  <div
                    class="h-full bg-gradient-to-r from-[var(--success)] to-[var(--accent)] rounded"
                    style="width: {Math.min((backendStatus.uptime / 86400) * 100, 100)}%"
                  ></div>
                </div>
                <span class="text-xs text-[var(--muted)] font-mono mt-1 block">
                  {((backendStatus.uptime / 86400) * 100).toFixed(1)}% of 24h
                </span>
              </div>
              <div class="flex justify-between items-center py-2 border-b border-[var(--border)]">
                <span class="text-[var(--muted)] font-sans">Active Agents:</span>
                <span class="text-[var(--text)] font-mono">{backendStatus.active_agents}</span>
              </div>
              <div class="flex justify-between items-center py-2 border-b border-[var(--border)]">
                <span class="text-[var(--muted)] font-sans">Database:</span>
                <span class="text-[var(--text)] font-mono text-xs">
                  {backendStatus.database && typeof backendStatus.database === 'string'
                    ? backendStatus.database.split('/').slice(-2).join('/')
                    : 'N/A'}
                </span>
              </div>
              <div class="flex justify-between items-center py-2">
                <span class="text-[var(--muted)] font-sans">DB Health:</span>
                <span
                  class="font-mono"
                  class:text-[var(--success)]={backendStatus.database_health.status === 'healthy'}
                  class:text-[var(--error)]={backendStatus.database_health.status === 'error'}
                >
                  {backendStatus.database_health.status === 'healthy' ? '✓ Healthy' : '✗ Error'}
                </span>
              </div>
            </div>
          {:else}
            <div class="text-center py-8">
              <div class="text-4xl mb-2">❌</div>
              <p class="text-[var(--error)] font-sans">Cannot connect to backend server</p>
              <p class="text-xs text-[var(--muted)] font-sans mt-1">
                Make sure the backend is running on port 3030
              </p>
            </div>
          {/if}
        </div>
      </div>

      <!-- WebSocket Status -->
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
        <div
          class="bg-[var(--bg)] border-b border-[var(--border)] p-4 flex justify-between items-center"
        >
          <h3 class="text-base font-semibold text-[var(--text)] font-sans">
            🔌 WebSocket Connection
          </h3>
          {#if loading}
            <span
              class="px-3 py-1 bg-[var(--surface)] rounded text-xs font-mono text-[var(--muted)]"
              >⏳ Loading...</span
            >
          {:else}
            <span
              class="px-3 py-1 rounded text-xs font-mono"
              class:bg-[var(--success-subtle)]={websocketStatus.connected}
              class:text-[var(--success)]={websocketStatus.connected}
              class:bg-[var(--error-subtle)]={!websocketStatus.connected}
              class:text-[var(--error)]={!websocketStatus.connected}
            >
              {websocketStatus.connected ? '🟢 Connected' : '🔴 Disconnected'}
            </span>
          {/if}
        </div>
        <div class="p-4">
          {#if loading}
            <div class="space-y-3">
              {#each Array(3) as _, i (i)}
                <div class="h-6 bg-[var(--bg)] rounded animate-pulse"></div>
              {/each}
            </div>
          {:else if websocketStatus.connected}
            <div class="space-y-3 text-sm">
              <div class="flex justify-between items-center py-2 border-b border-[var(--border)]">
                <span class="text-[var(--muted)] font-sans">Status:</span>
                <span class="text-[var(--success)] font-mono">Connected</span>
              </div>
              <div class="flex justify-between items-center py-2 border-b border-[var(--border)]">
                <span class="text-[var(--muted)] font-sans">Transport:</span>
                <span class="text-[var(--text)] font-mono">Socket.io</span>
              </div>
              <div class="flex justify-between items-center py-2">
                <span class="text-[var(--muted)] font-sans">Real-time Updates:</span>
                <span class="text-[var(--success)] font-mono">Enabled ✓</span>
              </div>
              <div
                class="bg-[var(--success-subtle)] border border-[var(--success)] rounded p-3 mt-4 text-center text-[var(--success)]"
              >
                ✅ Receiving real-time events from backend
              </div>
            </div>
          {:else}
            <div class="text-center py-8">
              <div class="text-4xl mb-2">⚠️</div>
              <p class="text-[var(--warning)] font-sans">WebSocket disconnected</p>
              <p class="text-xs text-[var(--muted)] font-sans mt-1">Falling back to HTTP polling</p>
            </div>
          {/if}
        </div>
      </div>

      <!-- Telemetry Bridge Status -->
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
        <div
          class="bg-[var(--bg)] border-b border-[var(--border)] p-4 flex justify-between items-center"
        >
          <h3 class="text-base font-semibold text-[var(--text)] font-sans">🔗 Telemetry Bridge</h3>
          {#if loading}
            <span
              class="px-3 py-1 bg-[var(--surface)] rounded text-xs font-mono text-[var(--muted)]"
              >⏳ Loading...</span
            >
          {:else}
            <span
              class="px-3 py-1 rounded text-xs font-mono"
              class:bg-[var(--success-subtle)]={backendStatus.telemetry_bridge.healthy}
              class:text-[var(--success)]={backendStatus.telemetry_bridge.healthy}
              class:bg-[var(--error-subtle)]={!backendStatus.telemetry_bridge.healthy}
              class:text-[var(--error)]={!backendStatus.telemetry_bridge.healthy}
            >
              {backendStatus.telemetry_bridge.healthy ? '🟢 Running' : '🔴 Stopped'}
            </span>
          {/if}
        </div>
        <div class="p-4">
          {#if loading}
            <div class="space-y-3">
              {#each Array(3) as _, i (i)}
                <div class="h-6 bg-[var(--bg)] rounded animate-pulse"></div>
              {/each}
            </div>
          {:else if backendStatus.connected}
            {#if backendStatus.telemetry_bridge.running}
              <div class="space-y-3 text-sm">
                <div class="flex justify-between items-center py-2 border-b border-[var(--border)]">
                  <span class="text-[var(--muted)] font-sans">Status:</span>
                  <span class="text-[var(--success)] font-mono">Active</span>
                </div>
                <div class="flex justify-between items-center py-2 border-b border-[var(--border)]">
                  <span class="text-[var(--muted)] font-sans">Process ID:</span>
                  <span class="text-[var(--text)] font-mono"
                    >{backendStatus.telemetry_bridge.pid}</span
                  >
                </div>
                <div class="flex justify-between items-center py-2">
                  <span class="text-[var(--muted)] font-sans">Health:</span>
                  <span class="text-[var(--success)] font-mono">✓ Healthy</span>
                </div>
                <div
                  class="bg-[var(--success-subtle)] border border-[var(--success)] rounded p-3 mt-4 text-center text-[var(--success)]"
                >
                  ✅ Claude Code operations are being tracked
                </div>
                <button
                  onclick={restartBridge}
                  disabled={restartingBridge}
                  class="w-full px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors disabled:opacity-50 mt-3"
                >
                  <span class:animate-spin={restartingBridge}>↻</span>
                  {restartingBridge ? 'Restarting...' : 'Restart Bridge'}
                </button>
              </div>
            {:else}
              <div class="text-center py-6">
                <div class="text-4xl mb-2">⚠️</div>
                <p class="text-[var(--warning)] font-sans">Telemetry bridge is not running</p>
                <p class="text-xs text-[var(--muted)] font-sans mt-1">
                  Claude Code operations will not be tracked
                </p>
                <button
                  onclick={restartBridge}
                  disabled={restartingBridge}
                  class="w-full px-3 py-2 bg-[var(--accent)] text-white rounded text-sm font-sans hover:opacity-90 transition-opacity disabled:opacity-50 mt-4"
                >
                  <span class:animate-spin={restartingBridge}>↻</span>
                  {restartingBridge ? 'Starting...' : 'Start Bridge'}
                </button>
              </div>
            {/if}
          {:else}
            <div class="text-center py-8">
              <div class="text-4xl mb-2">❌</div>
              <p class="text-[var(--error)] font-sans">Cannot check bridge status</p>
              <p class="text-xs text-[var(--muted)] font-sans mt-1">Backend must be online first</p>
            </div>
          {/if}
        </div>
      </div>

      <!-- Health Checks -->
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
        <div
          class="bg-[var(--bg)] border-b border-[var(--border)] p-4 flex justify-between items-center cursor-pointer hover:bg-[var(--surface)] transition-colors"
          role="button"
          tabindex="0"
          onclick={() => (healthExpanded = !healthExpanded)}
          onkeydown={e => e.key === 'Enter' && (healthExpanded = !healthExpanded)}
        >
          <h3 class="text-base font-semibold text-[var(--text)] font-sans">
            {getStatusIcon(healthChecks.status)} Health Checks
          </h3>
          <div class="flex items-center gap-3">
            {#if !loading && healthChecks.summary.total > 0}
              <span class="text-xs text-[var(--muted)] font-mono">
                {healthChecks.summary.passed}/{healthChecks.summary.total} passed
              </span>
            {/if}
            <span class="text-xs text-[var(--muted)]">{healthExpanded ? '▼' : '▶'}</span>
          </div>
        </div>
        <div class="p-4">
          {#if loading}
            <div class="space-y-3">
              {#each Array(3) as _, i (i)}
                <div class="h-6 bg-[var(--bg)] rounded animate-pulse"></div>
              {/each}
            </div>
          {:else}
            <div
              class="px-3 py-2 rounded text-sm font-mono text-center"
              style="background-color: {getStatusColor(
                healthChecks.status
              )}20; color: {getStatusColor(healthChecks.status)}"
            >
              {#if healthChecks.status === 'healthy'}
                All Systems Operational
              {:else if healthChecks.status === 'unhealthy'}
                {healthChecks.summary.failed} Check{healthChecks.summary.failed > 1 ? 's' : ''} Failed
              {:else if healthChecks.status === 'error'}
                Health Check Error
              {:else}
                Health Check Pending
              {/if}
            </div>

            {#if healthExpanded && healthChecks.checks.length > 0}
              <div class="mt-4 space-y-4">
                {#each Object.entries(healthChecks.summary.byCategory || {}) as [category, stats] (category)}
                  {@const categoryChecks = healthChecks.checks.filter(c => c.category === category)}
                  <div class="border border-[var(--border)] rounded-lg overflow-hidden">
                    <div
                      class="bg-[var(--bg)] border-b border-[var(--border)] px-3 py-2 flex items-center justify-between"
                    >
                      <div class="flex items-center gap-2">
                        <span class="text-sm">{getCategoryIcon(category)}</span>
                        <span class="text-xs font-mono font-semibold text-[var(--text)] uppercase"
                          >{category}</span
                        >
                      </div>
                      <span class="text-xs font-mono text-[var(--muted)]">
                        {stats.passed}/{stats.passed + stats.failed}
                        {#if stats.failed > 0}
                          <span class="text-[var(--error)] font-semibold">
                            ({stats.failed} failed)
                          </span>
                        {/if}
                      </span>
                    </div>
                    <div class="p-3 space-y-2">
                      {#each categoryChecks as check (check.name)}
                        {@const checkPassed = check.passed}
                        {@const borderColorClass = checkPassed
                          ? 'border-l-[var(--success)]'
                          : 'border-l-[var(--error)]'}
                        {@const bgColorClass = checkPassed
                          ? 'bg-[var(--bg)]'
                          : 'bg-[var(--error-subtle)]'}
                        <div
                          class="flex items-start gap-3 px-3 py-2 rounded border-l-4 {borderColorClass} {bgColorClass}"
                        >
                          <span class="text-sm flex-shrink-0 mt-0.5">
                            {checkPassed ? '✅' : '❌'}
                          </span>
                          <div class="flex-1 min-w-0">
                            <div class="text-xs font-mono font-semibold text-[var(--text)] mb-1">
                              {check.name}
                            </div>
                            <div
                              class="text-xs font-mono leading-relaxed"
                              class:text-[var(--muted)]={checkPassed}
                              class:text-[var(--error)]={!checkPassed}
                            >
                              {check.message}
                            </div>
                          </div>
                          <div class="text-xs font-mono text-[var(--muted)] flex-shrink-0">
                            {check.duration}ms
                          </div>
                        </div>
                      {/each}
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          {/if}
        </div>
      </div>

      <!-- Monitored Projects Card -->
      <div
        class="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden lg:col-span-2"
      >
        <div
          class="bg-[var(--bg)] border-b border-[var(--border)] p-4 flex justify-between items-center"
        >
          <h3 class="text-base font-semibold text-[var(--text)] font-sans">
            👁️ Monitored Projects
          </h3>
          {#if loading}
            <span
              class="px-3 py-1 bg-[var(--surface)] rounded text-xs font-mono text-[var(--muted)]"
              >⏳ Loading...</span
            >
          {:else}
            <span
              class="px-3 py-1 rounded text-xs font-mono bg-[var(--success-subtle)] text-[var(--success)]"
            >
              🟢 {$availableProjects.length} Active
            </span>
          {/if}
        </div>
        <div class="p-4">
          {#if loading}
            <div class="space-y-3">
              {#each Array(3) as _, i (i)}
                <div class="h-12 bg-[var(--bg)] rounded animate-pulse"></div>
              {/each}
            </div>
          {:else}
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
              {#each $availableProjects as project (project.name || project)}
                {@const projectName = project.name || project}
                {@const isSelected = $projectFilter === projectName}
                {@const buttonClasses = isSelected
                  ? 'bg-[var(--accent-subtle)] border-[var(--accent)] shadow-[0_0_0_2px_var(--accent-subtle)]'
                  : 'bg-[var(--bg)] border-[var(--border)] hover:border-[var(--accent)]'}
                <button
                  class="flex items-center gap-2 px-3 py-2 border rounded text-left transition-all {buttonClasses}"
                  onclick={() => projectFilter.set(projectName)}
                >
                  <div class="w-2 h-2 rounded-full bg-[var(--success)] flex-shrink-0"></div>
                  <span
                    class="flex-1 text-sm font-semibold font-sans truncate"
                    class:text-[var(--accent)]={isSelected}
                    class:text-[var(--text)]={!isSelected}
                  >
                    {projectName}
                  </span>
                  {#if isSelected}
                    <span
                      class="px-2 py-0.5 bg-[var(--accent)] text-white rounded text-xs font-bold uppercase tracking-wide"
                    >
                      viewing
                    </span>
                  {/if}
                </button>
              {/each}
            </div>
            <div
              class="bg-[var(--success-subtle)] border border-[var(--success)] rounded p-3 text-center text-[var(--success)] text-sm"
            >
              ✅ Global multi-project monitoring active
            </div>
          {/if}
        </div>
      </div>

      <!-- Git Repository Status -->
      <div
        class="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden lg:col-span-2"
      >
        <div
          class="bg-[var(--bg)] border-b border-[var(--border)] p-4 flex justify-between items-center"
        >
          <h3 class="text-base font-semibold text-[var(--text)] font-sans">🌳 Git Repository</h3>
          {#if loading}
            <span
              class="px-3 py-1 bg-[var(--surface)] rounded text-xs font-mono text-[var(--muted)]"
              >⏳ Loading...</span
            >
          {:else}
            <span
              class="px-3 py-1 rounded text-xs font-mono"
              class:bg-[var(--success-subtle)]={gitStatus.available}
              class:text-[var(--success)]={gitStatus.available}
              class:bg-[var(--muted-subtle)]={!gitStatus.available}
              class:text-[var(--muted)]={!gitStatus.available}
            >
              {gitStatus.available ? '🟢 Available' : '⚫ Not a Git Repo'}
            </span>
          {/if}
        </div>
        <div class="p-4">
          {#if loading}
            <div class="space-y-3">
              {#each Array(4) as _, i (i)}
                <div class="h-6 bg-[var(--bg)] rounded animate-pulse"></div>
              {/each}
            </div>
          {:else if gitStatus.available}
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <!-- Current Branch -->
              <div>
                <h4
                  class="text-sm font-semibold text-[var(--text-heading)] font-sans mb-3 pb-2 border-b border-[var(--border)]"
                >
                  📍 Current Branch
                </h4>
                <div class="space-y-2 text-sm">
                  <div class="flex justify-between items-center">
                    <span class="text-[var(--muted)] font-sans">Active Branch:</span>
                    <span class="text-[var(--text)] font-mono">{gitStatus.branch}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-[var(--muted)] font-sans">Modified Files:</span>
                    <span class="text-[var(--text)] font-mono">{gitStatus.modified.length}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-[var(--muted)] font-sans">New Files:</span>
                    <span class="text-[var(--text)] font-mono">{gitStatus.created.length}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-[var(--muted)] font-sans">Deleted Files:</span>
                    <span class="text-[var(--text)] font-mono">{gitStatus.deleted.length}</span>
                  </div>
                </div>

                <!-- All Branches -->
                {#if gitStatus.branches.length > 0}
                  <h4
                    class="text-sm font-semibold text-[var(--text-heading)] font-sans mb-3 pb-2 border-b border-[var(--border)] mt-6"
                  >
                    🌿 All Branches ({gitStatus.branches.length})
                  </h4>
                  <div class="flex flex-wrap gap-2">
                    {#each gitStatus.branches as branch (branch)}
                      {@const isActive = branch === gitStatus.branch}
                      {@const tagClasses = isActive
                        ? 'bg-[var(--info-subtle)] text-[var(--info)] border-[var(--info)]'
                        : 'bg-[var(--bg)] text-[var(--muted)] border-[var(--border)]'}
                      <span class="px-2 py-1 rounded text-xs font-mono border {tagClasses}">
                        {isActive ? '● ' : ''}{branch}
                      </span>
                    {/each}
                  </div>
                {/if}
              </div>

              <!-- Recent Commits -->
              {#if gitStatus.commits.length > 0}
                <div>
                  <h4
                    class="text-sm font-semibold text-[var(--text-heading)] font-sans mb-3 pb-2 border-b border-[var(--border)]"
                  >
                    📜 Recent Commits
                  </h4>
                  <div class="space-y-3">
                    {#each gitStatus.commits as commit (commit.hash)}
                      <div
                        class="bg-[var(--bg)] border border-[var(--border)] rounded p-3 border-l-4 border-l-[var(--info)]"
                      >
                        <div class="flex justify-between items-center mb-1">
                          <span class="text-xs font-mono text-[var(--info)] font-semibold"
                            >{commit.hash?.slice(0, 7) || 'unknown'}</span
                          >
                          <span class="text-xs text-[var(--muted)] font-sans"
                            >{formatCommitDate(commit.date)}</span
                          >
                        </div>
                        <div class="text-sm text-[var(--text)] font-sans mb-1">
                          {commit.message || 'No message'}
                        </div>
                        <div class="text-xs text-[var(--muted)] font-sans italic">
                          {commit.author_name || 'Unknown'}
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          {:else}
            <div class="text-center py-8">
              <div class="text-4xl mb-2">ℹ️</div>
              <p class="text-[var(--muted)] font-sans">
                Not a Git repository or Git monitoring is disabled
              </p>
            </div>
          {/if}
        </div>
      </div>

      <!-- Available Endpoints Card -->
      <div
        class="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden lg:col-span-2"
      >
        <div
          class="bg-[var(--bg)] border-b border-[var(--border)] p-4 flex justify-between items-center"
        >
          <h3 class="text-base font-semibold text-[var(--text)] font-sans">
            🌐 Available Endpoints
          </h3>
        </div>
        <div class="p-4">
          <div class="space-y-2">
            {#each [{ method: 'GET', path: '/health', description: 'Health check', color: 'info' }, { method: 'POST', path: '/telemetry', description: 'Agent telemetry', color: 'success' }, { method: 'GET', path: '/api/dashboard-stats', description: 'Dashboard statistics', color: 'info' }, { method: 'GET', path: '/api/agent-events', description: 'Agent events', color: 'info' }, { method: 'GET', path: '/api/agents-status', description: 'Agents status', color: 'info' }, { method: 'GET', path: '/api/triggers-config', description: 'Trigger rules', color: 'info' }, { method: 'WS', path: 'WebSocket', description: 'Real-time events', color: 'warning' }] as endpoint (endpoint.path)}
              {@const methodBgClass =
                endpoint.color === 'info'
                  ? 'bg-[var(--info-subtle)] text-[var(--info)]'
                  : endpoint.color === 'success'
                    ? 'bg-[var(--success-subtle)] text-[var(--success)]'
                    : 'bg-[var(--warning-subtle)] text-[var(--warning)]'}
              <div
                class="grid grid-cols-[80px_1fr_200px] gap-4 items-center px-4 py-3 bg-[var(--bg)] border border-[var(--border)] rounded hover:bg-[var(--surface)] hover:border-[var(--border)] transition-all"
              >
                <span
                  class="px-2 py-1 rounded text-xs font-bold font-mono text-center {methodBgClass}"
                >
                  {endpoint.method}
                </span>
                <span class="text-sm font-mono text-[var(--text)] truncate">{endpoint.path}</span>
                <span class="text-sm text-[var(--muted)] font-sans">{endpoint.description}</span>
              </div>
            {/each}
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
