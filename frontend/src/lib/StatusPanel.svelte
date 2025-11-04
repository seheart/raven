<script>
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';
  import { formatShortDateTime } from './timeFormat.js';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import { projectFilter, availableProjects } from './projectFilterStore.js';
  import { API_CONFIG } from '../config.js';
  import { logger } from './logger.js';
  import { formatNumber } from './numberFormat.js';
  import { dataService } from './dataService.js';
  import { api } from './apiClient.js';
  import { notifications } from './notificationService.js';

  const API_BASE = API_CONFIG.BASE_URL;

  let backendStatus = {
    connected: false,
    status: 'unknown',
    version: 'unknown',
    session_id: '',
    uptime: 0,
    active_agents: 0,
    database: '',
    database_health: { status: 'unknown', accessible: false },
    telemetry_bridge: { running: false, pid: null, healthy: false }
  };

  let websocketStatus = {
    connected: false,
    reconnecting: false
  };

  let gitStatus = {
    available: false,
    branch: 'unknown',
    modified: [],
    created: [],
    deleted: [],
    branches: [],
    commits: []
  };

  let isMounted = false;
  let lastUpdated = null;
  let isManualRefresh = false;
  let loading = true;

  // Track timeouts for cleanup
  let healthCheckTimeouts = [];

  async function checkBackendHealth(manual = false) {
    if (!isMounted) return;
    isManualRefresh = manual;

    // Only show loading on initial load or manual refresh
    if (manual || loading) {
      loading = true;
    }

    try {
      // Use dataService for cached data (eliminates red-to-green flash)
      const data = await dataService.fetchHealth(manual);

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
      isManualRefresh = false;
    } catch (error) {
      logger.error('Backend health check failed:', error);
      backendStatus.connected = false;
      loading = false;
      isManualRefresh = false;
    }
  }

  async function checkGitStatus() {
    if (!isMounted) return;
    try {
      // Use dataService for cached data (preloaded during initial load)
      const [statusData, branchesData, historyData] = await Promise.all([
        dataService.fetchGitStatus(),
        dataService.fetchGitBranches(),
        dataService.fetchGitHistory(5)
      ]);

      gitStatus = {
        available: true,
        branch: statusData.branch || 'unknown',
        modified: statusData.modified || [],
        created: statusData.created || [],
        deleted: statusData.deleted || [],
        branches: branchesData.branches || [],
        commits: historyData.commits || []
      };
    } catch (error) {
      // Silently fail for git - it's optional
      gitStatus.available = false;
    }
  }

  // Format "time ago" for last updated timestamp (reactive, no interval)

  // Compute reactively when lastUpdated changes
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

  function formatUptime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }

  function formatCommitDate(date) {
    return formatShortDateTime(date);
  }

  // Restart telemetry bridge
  let restartingBridge = false;
  async function restartBridge() {
    if (restartingBridge) return;

    // Add confirmation
    if (!confirm('Are you sure you want to restart the telemetry bridge? Claude Code tracking will be interrupted briefly.')) {
      return;
    }

    restartingBridge = true;
    try {
      // Use apiClient for proper error handling, auth, and timeouts
      const result = await api.post('/control/restart-bridge');

      if (result.success) {
        notifications.success('Telemetry bridge restarted successfully');
        // Refresh health status after a moment to reflect new state
        const timeout = setTimeout(() => checkBackendHealth(), 1000);
        healthCheckTimeouts.push(timeout);
      } else {
        logger.error('Bridge restart failed:', result.error);
        notifications.error(`Failed to restart bridge: ${result.error}`);
      }
    } catch (error) {
      logger.error('Error restarting bridge:', error);
      notifications.error(`Error restarting bridge: ${error.message}`);
    } finally {
      restartingBridge = false;
    }
  }

  // WebSocket event handlers
  const handleProjectSwitched = async (data) => {
    await checkBackendHealth();
    await checkGitStatus();
  };

  const handleGitStatusUpdated = (data) => {
    // Update git status from WebSocket event
    if (data && data.project === $projectFilter) {
      gitStatus = {
        available: true,
        branch: data.branch || 'unknown',
        modified: data.modified || [],
        created: data.created || [],
        deleted: data.deleted || [],
        branches: gitStatus.branches, // Keep existing branches
        commits: gitStatus.commits // Keep existing commits
      };
      lastUpdated = new Date();
    }
  };

  const handleFileChanged = () => {
    // Update WebSocket connection status when events fire
    websocketStatus.connected = websocketService.isConnected();
  };

  onMount(async () => {
    isMounted = true;

    // Initial check
    await checkBackendHealth();
    await checkGitStatus();

    // Connect WebSocket and monitor status
    websocketService.connect();
    websocketStatus.connected = websocketService.isConnected();

    // Listen for events (no polling!)
    websocketService.on('project-switched', handleProjectSwitched);
    websocketService.on('git-status-updated', handleGitStatusUpdated);
    websocketService.on('file-changed', handleFileChanged);
  });

  onDestroy(() => {
    isMounted = false;

    // Clean up timeouts
    healthCheckTimeouts.forEach(timeout => clearTimeout(timeout));

    // Clean up WebSocket listeners
    websocketService.off('project-switched', handleProjectSwitched);
    websocketService.off('git-status-updated', handleGitStatusUpdated);
    websocketService.off('file-changed', handleFileChanged);
  });
</script>

<div class="status-panel" role="region" aria-label="System status monitoring">
  <div class="header">
    <h2 id="status-heading"><span aria-hidden="true">🏥</span> System Status</h2>
    <div class="header-actions" role="toolbar" aria-label="Status panel actions">
      <span class="last-updated" role="status" aria-live="polite">Updated: {timeAgo}</span>
      <button on:click={() => checkBackendHealth(true)} class="btn btn-secondary" disabled={loading} aria-label="Refresh system status">
        <span class="refresh-icon" class:spinning={isManualRefresh} aria-hidden="true">↻</span>
        <span>Refresh</span>
      </button>
    </div>
  </div>

  <div class="status-grid" role="group" aria-labelledby="status-heading">
    <!-- Backend Status Card -->
    <article class="status-card" aria-labelledby="backend-heading">
      <div class="card-header">
        <h3 id="backend-heading"><span aria-hidden="true">⚙️</span> Backend Server</h3>
        {#if loading}
          <div class="status-indicator loading" role="status" aria-live="polite">
            <span aria-hidden="true">⏳</span> Loading...
          </div>
        {:else}
          <div class="status-indicator" class:online={backendStatus.connected} class:offline={!backendStatus.connected} role="status" aria-live="polite">
            <span aria-hidden="true">{backendStatus.connected ? '🟢' : '🔴'}</span> {backendStatus.connected ? 'Online' : 'Offline'}
          </div>
        {/if}
      </div>
      <div class="card-body">
        {#if loading}
          <LoadingSkeleton height="200px" />
        {:else if backendStatus.connected}
          <div class="info-row">
            <span class="label">Status:</span>
            <span class="value success">{backendStatus.status}</span>
          </div>
          <div class="info-row">
            <span class="label">Version:</span>
            <span class="value mono">v{backendStatus.version}</span>
          </div>
          <div class="info-row session-row">
            <span class="label">Session ID:</span>
            <div class="session-id-container">
              <span class="value mono session-id-value" title="{backendStatus.session_id}">{backendStatus.session_id}</span>
              <button
                class="btn btn-sm btn-icon"
                on:click={() => {
                  navigator.clipboard.writeText(backendStatus.session_id);
                  notifications.success('Session ID copied to clipboard!');
                }}
                aria-label="Copy session ID to clipboard"
                title="Copy to clipboard"
              >
                📋
              </button>
            </div>
          </div>
          <div class="info-row">
            <span class="label">Uptime:</span>
            <span class="value">{formatUptime(backendStatus.uptime)}</span>
          </div>
          <div class="uptime-visualization">
            <div
              class="uptime-bar"
              role="progressbar"
              aria-valuenow="{(backendStatus.uptime / 86400) * 100}"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-label="Server uptime: {((backendStatus.uptime / 86400) * 100).toFixed(1)}% of 24 hours"
            >
              <div
                class="uptime-fill"
                style="width: {Math.min((backendStatus.uptime / 86400) * 100, 100)}%"
                aria-hidden="true"
              ></div>
            </div>
            <span class="uptime-label" aria-hidden="true">{((backendStatus.uptime / 86400) * 100).toFixed(1)}% of 24h</span>
          </div>
          <div class="info-row">
            <span class="label">Session ID:</span>
            <span class="value mono">{backendStatus?.session_id?.slice(0, 8) || 'N/A'}...</span>
          </div>
          <div class="info-row">
            <span class="label">Active Agents:</span>
            <span class="value">{formatNumber(backendStatus?.active_agents || 0)}</span>
          </div>
          <div class="info-row">
            <span class="label">Database:</span>
            <span class="value mono small">{backendStatus?.database?.split('/')?.slice(-3)?.join('/') || 'N/A'}</span>
          </div>
          <div class="info-row">
            <span class="label">DB Health:</span>
            <span class="value" class:success={backendStatus.database_health.status === 'healthy'} class:error={backendStatus.database_health.status === 'error'}>
              {backendStatus.database_health.status === 'healthy' ? '✓ Healthy' : '✗ Error'}
              {#if !backendStatus.database_health.accessible}
                <span class="db-error-hint" title="{backendStatus.database_health.lastError}">
                  (Inaccessible)
                </span>
              {/if}
            </span>
          </div>
        {:else}
          <div class="error-message" role="alert">
            ❌ Cannot connect to backend server
            <p class="hint">Make sure the backend is running on port 3030</p>
          </div>
        {/if}
      </div>
    </article>

    <!-- WebSocket Status Card -->
    <article class="status-card" aria-labelledby="websocket-heading">
      <div class="card-header">
        <h3 id="websocket-heading"><span aria-hidden="true">🔌</span> WebSocket Connection</h3>
        {#if loading}
          <div class="status-indicator loading" role="status" aria-live="polite">
            <span aria-hidden="true">⏳</span> Loading...
          </div>
        {:else}
          <div class="status-indicator" class:online={websocketStatus.connected} class:offline={!websocketStatus.connected} role="status" aria-live="polite">
            <span aria-hidden="true">{websocketStatus.connected ? '🟢' : '🔴'}</span> {websocketStatus.connected ? 'Connected' : 'Disconnected'}
          </div>
        {/if}
      </div>
      <div class="card-body">
        {#if loading}
          <LoadingSkeleton height="120px" />
        {:else if websocketStatus.connected}
          <div class="info-row">
            <span class="label">Status:</span>
            <span class="value success">Connected</span>
          </div>
          <div class="info-row">
            <span class="label">Transport:</span>
            <span class="value">Socket.io</span>
          </div>
          <div class="info-row">
            <span class="label">Real-time Updates:</span>
            <span class="value success">Enabled ✓</span>
          </div>
          <div class="info-message">
            ✅ Receiving real-time events from backend
          </div>
        {:else}
          <div class="error-message" role="alert">
            ⚠️ WebSocket disconnected
            <p class="hint">Falling back to HTTP polling</p>
          </div>
        {/if}
      </div>
    </article>

    <!-- Telemetry Bridge Status Card -->
    <article class="status-card" aria-labelledby="telemetry-heading">
      <div class="card-header">
        <h3 id="telemetry-heading"><span aria-hidden="true">🔗</span> Telemetry Bridge</h3>
        {#if loading}
          <div class="status-indicator loading" role="status" aria-live="polite">
            <span aria-hidden="true">⏳</span> Loading...
          </div>
        {:else}
          <div class="status-indicator" class:online={backendStatus.telemetry_bridge.healthy} class:offline={!backendStatus.telemetry_bridge.healthy} role="status" aria-live="polite">
            <span aria-hidden="true">{backendStatus.telemetry_bridge.healthy ? '🟢' : '🔴'}</span> {backendStatus.telemetry_bridge.healthy ? 'Running' : 'Stopped'}
          </div>
        {/if}
      </div>
      <div class="card-body">
        {#if loading}
          <LoadingSkeleton height="150px" />
        {:else if backendStatus.connected}
          {#if backendStatus.telemetry_bridge.running}
            <div class="info-row">
              <span class="label">Status:</span>
              <span class="value success">Active</span>
            </div>
            <div class="info-row">
              <span class="label">Process ID:</span>
              <span class="value mono">{backendStatus.telemetry_bridge.pid}</span>
            </div>
            <div class="info-row">
              <span class="label">Health:</span>
              <span class="value success">✓ Healthy</span>
            </div>
            <div class="info-message">
              ✅ Claude Code operations are being tracked
            </div>
            <button on:click={restartBridge} class="btn btn-secondary" disabled={restartingBridge} aria-label="Restart telemetry bridge">
              <span class="refresh-icon" class:spinning={restartingBridge} aria-hidden="true">↻</span>
              {restartingBridge ? 'Restarting...' : 'Restart Bridge'}
            </button>
          {:else}
            <div class="error-message" role="alert">
              ⚠️ Telemetry bridge is not running
              <p class="hint">Claude Code operations will not be tracked</p>
            </div>
            <button on:click={restartBridge} class="btn btn-primary" disabled={restartingBridge} aria-label="Start telemetry bridge">
              <span class="refresh-icon" class:spinning={restartingBridge} aria-hidden="true">↻</span>
              {restartingBridge ? 'Starting...' : 'Start Bridge'}
            </button>
          {/if}
        {:else}
          <div class="error-message" role="alert">
            ❌ Cannot check bridge status
            <p class="hint">Backend must be online first</p>
          </div>
        {/if}
      </div>
    </article>

    <!-- Monitored Projects Card -->
    <article class="status-card full-width" aria-labelledby="projects-heading">
      <div class="card-header">
        <h3 id="projects-heading"><span aria-hidden="true">👁️</span> Monitored Projects</h3>
        {#if loading}
          <div class="status-indicator loading" role="status">
            <span aria-hidden="true">⏳</span> Loading...
          </div>
        {:else}
          <div class="status-indicator online" role="status">
            <span aria-hidden="true">🟢</span> {formatNumber($availableProjects.length)} Active
          </div>
        {/if}
      </div>
      <div class="card-body">
        {#if loading}
          <LoadingSkeleton height="100px" />
        {:else}
          <div class="projects-list" role="list" aria-label="Monitored projects">
          {#each $availableProjects as project (project.name || project)}
            {@const projectName = project.name || project}
            <button
              class="btn btn-ghost project-item"
              class:selected={$projectFilter === projectName}
              on:click={() => projectFilter.set(projectName)}
              aria-label="Switch to project {projectName}"
              aria-pressed={$projectFilter === projectName}
            >
              <div class="project-status-dot" aria-hidden="true"></div>
              <span class="project-name">{projectName}</span>
              {#if $projectFilter === projectName}
                <span class="project-badge" aria-label="Currently viewing">viewing</span>
              {/if}
            </button>
          {/each}
          </div>
          <div class="info-message" role="status">
            ✅ Global multi-project monitoring active
          </div>
        {/if}
      </div>
    </article>

    <!-- Git Repository Status Card -->
    <article class="status-card full-width" aria-labelledby="git-heading">
      <div class="card-header">
        <h3 id="git-heading"><span aria-hidden="true">🌳</span> Git Repository</h3>
        {#if loading}
          <div class="status-indicator loading" role="status">
            <span aria-hidden="true">⏳</span> Loading...
          </div>
        {:else}
          <div class="status-indicator" class:online={gitStatus.available} class:offline={!gitStatus.available} role="status">
            <span aria-hidden="true">{gitStatus.available ? '🟢' : '⚫'}</span> {gitStatus.available ? 'Available' : 'Not a Git Repo'}
          </div>
        {/if}
      </div>
      <div class="card-body">
        {#if loading}
          <LoadingSkeleton height="150px" />
        {:else if gitStatus.available}
          <!-- Current Branch & Status -->
          <div class="git-section">
            <h4 class="section-title">📍 Current Branch</h4>
            <div class="info-row">
              <span class="label">Active Branch:</span>
              <span class="value mono">{gitStatus.branch}</span>
            </div>
            <div class="info-row">
              <span class="label">Modified Files:</span>
              <span class="value">{formatNumber(gitStatus.modified.length)}</span>
            </div>
            <div class="info-row">
              <span class="label">New Files:</span>
              <span class="value">{formatNumber(gitStatus.created.length)}</span>
            </div>
            <div class="info-row">
              <span class="label">Deleted Files:</span>
              <span class="value">{formatNumber(gitStatus.deleted.length)}</span>
            </div>
          </div>

          <!-- All Branches -->
          {#if gitStatus?.branches?.length > 0}
            <div class="git-section">
              <h4 class="section-title">🌿 All Branches ({formatNumber(gitStatus?.branches?.length || 0)})</h4>
              <div class="branches-list">
                {#each gitStatus?.branches || [] as branch (branch)}
                  <span class="branch-tag" class:active={branch === gitStatus?.branch}>
                    {branch === gitStatus?.branch ? '● ' : ''}{branch}
                  </span>
                {/each}
              </div>
            </div>
          {/if}

          <!-- Recent Commits -->
          {#if gitStatus?.commits?.length > 0}
            <div class="git-section">
              <h4 class="section-title">📜 Recent Commits</h4>
              <div class="commits-list">
                {#each gitStatus?.commits || [] as commit (commit.hash)}
                  <div class="commit-item">
                    <div class="commit-header">
                      <span class="commit-hash">{commit?.hash?.slice(0, 7) || 'unknown'}</span>
                      <span class="commit-date">{formatCommitDate(commit?.date)}</span>
                    </div>
                    <div class="commit-message">{commit?.message || 'No message'}</div>
                    <div class="commit-author">{commit?.author_name || 'Unknown'}</div>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        {:else}
          <div class="info-message" style="background: color-mix(in srgb, var(--muted) 10%, transparent); border-color: color-mix(in srgb, var(--muted) 30%, transparent); color: var(--muted);">
            ℹ️ Not a Git repository or Git monitoring is disabled
          </div>
        {/if}
      </div>
    </article>

    <!-- Endpoints Card -->
    <div class="status-card full-width">
      <div class="card-header">
        <h3>🌐 Available Endpoints</h3>
      </div>
      <div class="card-body">
        <div class="endpoints-grid">
          <div class="endpoint-item">
            <span class="method">GET</span>
            <span class="path">/health</span>
            <span class="description">Health check</span>
          </div>
          <div class="endpoint-item">
            <span class="method">POST</span>
            <span class="path">/telemetry</span>
            <span class="description">Agent telemetry</span>
          </div>
          <div class="endpoint-item">
            <span class="method">GET</span>
            <span class="path">/api/dashboard-stats</span>
            <span class="description">Dashboard statistics</span>
          </div>
          <div class="endpoint-item">
            <span class="method">GET</span>
            <span class="path">/api/agent-events</span>
            <span class="description">Agent events</span>
          </div>
          <div class="endpoint-item">
            <span class="method">GET</span>
            <span class="path">/api/agents-status</span>
            <span class="description">Agents status</span>
          </div>
          <div class="endpoint-item">
            <span class="method">GET</span>
            <span class="path">/api/triggers-config</span>
            <span class="description">Trigger rules</span>
          </div>
          <div class="endpoint-item">
            <span class="method">WS</span>
            <span class="path">WebSocket</span>
            <span class="description">Real-time events</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .status-panel {
    padding: var(--space-lg);
    position: relative;
    width: 100%;
    margin: 0;
    font-family: var(--mono);
    background: var(--bg);
    color: var(--text);
    min-height: calc(100vh - 200px);
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-lg);
    padding: 0 var(--space-lg);
  }

  h2 {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
  }

  .last-updated {
    font-size: 12px;
    color: var(--muted);
    font-family: var(--mono);
  }

  .refresh-icon {
    display: inline-block;
    font-size: 11px;
  }

  .refresh-icon.spinning {
    animation: spin 1s linear infinite;
  }

  .status-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
    gap: var(--space-xl);
  }

  .status-card {
    background: var(--surface);
    border: 1px solid var(--surface-2);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .status-card.full-width {
    grid-column: 1 / -1;
  }

  .card-header {
    padding: var(--space-xl);
    background: var(--bg);
    border-bottom: 1px solid var(--surface-2);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  h3 {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
  }

  .status-indicator {
    padding: var(--space-md) var(--space-xl);
    border-radius: var(--radius-sm);
    font-size: 13px;
    font-weight: 600;
  }

  .status-indicator.online {
    background: color-mix(in srgb, var(--success) 20%, transparent);
    color: var(--success);
  }

  .status-indicator.offline {
    background: color-mix(in srgb, var(--error) 20%, transparent);
    color: var(--error);
  }

  .card-body {
    padding: var(--space-xl);
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-xl) 0;
    border-bottom: 1px solid var(--border);
  }

  .info-row:last-child {
    border-bottom: none;
  }

  .session-row {
    background: var(--bg);
    padding: var(--space-2xl) var(--space-xl);
    margin: 0 calc(-1 * var(--space-xl));
    border-left: 3px solid var(--accent);
  }

  .session-id-container {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
    max-width: 60%;
  }

  .session-id-value {
    word-break: break-all;
    font-size: 11px;
  }


  .label {
    color: var(--muted);
    font-size: 12px;
    font-weight: 500;
  }

  .value {
    color: var(--text);
    font-size: 12px;
    font-weight: 600;
  }

  .value.success {
    color: var(--success);
  }

  .value.mono {
    font-family: var(--mono);
    font-size: 12px;
  }

  .value.small {
    font-size: 11px;
  }

  .error-message {
    padding: var(--space-xl);
    background: color-mix(in srgb, var(--error) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--error) 30%, transparent);
    border-radius: var(--radius);
    color: var(--error);
    text-align: center;
  }

  .info-message {
    padding: var(--space-xl);
    background: color-mix(in srgb, var(--success) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--success) 30%, transparent);
    border-radius: var(--radius);
    color: var(--success);
    text-align: center;
    margin-top: var(--space-xl);
  }

  .hint {
    margin-top: var(--space-lg);
    font-size: 13px;
    color: var(--muted);
  }

  .endpoints-grid {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .endpoint-item {
    display: grid;
    grid-template-columns: 80px 1fr 200px;
    gap: var(--space-xl);
    padding: var(--space-xl);
    background: var(--bg);
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .endpoint-item:hover {
    background: var(--surface);
    border-color: var(--surface-2);
  }

  .method {
    padding: var(--space-sm) var(--space-lg);
    border-radius: var(--radius);
    font-size: 11px;
    font-weight: 700;
    text-align: center;
    font-family: var(--mono);
  }

  .endpoint-item:nth-child(1) .method,
  .endpoint-item:nth-child(3) .method,
  .endpoint-item:nth-child(4) .method,
  .endpoint-item:nth-child(5) .method,
  .endpoint-item:nth-child(6) .method {
    background: color-mix(in srgb, var(--info) 20%, transparent);
    color: var(--info);
  }

  .endpoint-item:nth-child(2) .method {
    background: color-mix(in srgb, var(--success) 20%, transparent);
    color: var(--success);
  }

  .endpoint-item:nth-child(7) .method {
    background: color-mix(in srgb, var(--warning) 20%, transparent);
    color: var(--warning);
  }

  .path {
    font-family: var(--mono);
    font-size: 13px;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .description {
    font-size: 13px;
    color: var(--muted);
  }

  /* Git Section Styles */
  .git-section {
    margin-bottom: var(--space-lg);
  }

  .git-section:last-child {
    margin-bottom: 0;
  }

  .section-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--text);
    margin: 0 0 var(--space-md) 0;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border);
  }

  .branches-list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-lg);
    padding: var(--space-lg) 0;
  }

  .branch-tag {
    padding: var(--space-md) var(--space-xl);
    background: var(--bg);
    border: 1px solid var(--surface-2);
    border-radius: var(--radius-sm);
    font-size: 12px;
    font-family: var(--mono);
    color: var(--muted);
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .branch-tag.active {
    background: color-mix(in srgb, var(--info) 20%, transparent);
    border-color: var(--info);
    color: var(--info);
    font-weight: 600;
  }

  .commits-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
  }

  .commit-item {
    padding: var(--space-xl);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    border-left: 3px solid var(--info);
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .commit-item:hover {
    background: var(--surface);
    border-color: var(--surface-2);
  }

  .commit-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-md);
  }

  .commit-hash {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--info);
    font-weight: 600;
  }

  .commit-date {
    font-size: 11px;
    color: var(--muted);
  }

  .commit-message {
    font-size: 13px;
    color: var(--text);
    margin-bottom: var(--space-sm);
    line-height: 1.4;
  }

  .commit-author {
    font-size: 11px;
    color: var(--muted);
    font-style: italic;
  }

  /* Projects List Styles */
  .projects-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: var(--space-lg);
    margin-bottom: var(--space-xl);
  }

  .project-item {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
  }

  .project-item.selected {
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    border-color: var(--accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent);
  }

  .project-status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--success);
    box-shadow: 0 0 4px var(--success);
    flex-shrink: 0;
  }

  .project-name {
    flex: 1;
    font-weight: 600;
    color: var(--text);
  }

  .project-item.selected .project-name {
    color: var(--accent);
  }

  .project-badge {
    padding: var(--space-xs) var(--space-lg);
    background: var(--accent);
    border-radius: var(--radius);
    font-size: 11px;
    font-weight: 700;
    color: white;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  @media (max-width: 768px) {
    .status-grid {
      grid-template-columns: 1fr;
    }

    .endpoint-item {
      grid-template-columns: 1fr;
      gap: var(--space-lg);
    }
  }

  /* Uptime Visualization */
  .uptime-visualization {
    margin-top: var(--space-lg);
    display: flex;
    align-items: center;
    gap: var(--space-xl);
  }

  .uptime-bar {
    flex: 1;
    height: 8px;
    background: var(--surface-2);
    border-radius: var(--radius);
    overflow: hidden;
    position: relative;
  }

  .uptime-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--success) 0%, var(--accent) 100%);
    border-radius: var(--radius);
    transition: width var(--duration-slower) var(--ease-smooth);
  }

  .uptime-label {
    font-size: 11px;
    color: var(--muted);
    font-family: var(--mono);
    white-space: nowrap;
  }

  /* Database Health */
  .db-error-hint {
    font-size: 11px;
    color: var(--error);
    margin-left: var(--space-sm);
  }

  .value.error {
    color: var(--error);
  }

  .value.success {
    color: var(--success);
  }
</style>
