<script>
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';
  import { formatShortDateTime } from './timeFormat.js';
  import PageInfo from './PageInfo.svelte';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import { projectFilter, availableProjects } from './projectFilterStore.js';
  import { API_CONFIG } from '../config.js';

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

  let refreshInterval;
  let isMounted = false;
  let lastUpdated = null;
  let isManualRefresh = false;
  let loading = true;

  async function checkBackendHealth(manual = false) {
    if (!isMounted) return;
    isManualRefresh = manual;
    loading = true;

    try {
      const response = await fetch(`${API_BASE}/health`, { timeout: 5000 });
      const data = await response.json();

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
      console.error('Backend health check failed:', error);
      backendStatus.connected = false;
      loading = false;
      isManualRefresh = false;
    }
  }

  async function checkGitStatus() {
    if (!isMounted) return;
    try {
      // Add timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

      const [statusRes, branchesRes, historyRes] = await Promise.all([
        fetch(`${API_BASE}/api/git/status`, { signal: controller.signal }),
        fetch(`${API_BASE}/api/git/branches`, { signal: controller.signal }),
        fetch(`${API_BASE}/api/git/history?limit=5`, { signal: controller.signal })
      ]).finally(() => clearTimeout(timeoutId));

      const statusData = await statusRes.json();
      const branchesData = await branchesRes.json();
      const historyData = await historyRes.json();

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

  // Format "time ago" for last updated timestamp
  function getTimeAgo() {
    if (!lastUpdated) return 'Never';
    const seconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
    if (seconds < 10) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  }

  // Live timestamp updates
  let timeAgo = 'Never';
  setInterval(() => {
    timeAgo = getTimeAgo();
  }, 1000);

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

    restartingBridge = true;
    try {
      const response = await fetch(`${API_BASE}/api/control/restart-bridge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const result = await response.json();

      if (result.success) {
        // Refresh health status after a moment to reflect new state
        setTimeout(() => checkBackendHealth(), 1000);
      } else {
        console.error('Bridge restart failed:', result.error);
        alert(`Failed to restart bridge: ${result.error}`);
      }
    } catch (error) {
      console.error('Error restarting bridge:', error);
      alert(`Error restarting bridge: ${error.message}`);
    } finally {
      restartingBridge = false;
    }
  }

  // WebSocket event handler for project switches
  const handleProjectSwitched = async (data) => {
    await checkBackendHealth();
    await checkGitStatus();
  };

  onMount(async () => {
    isMounted = true;

    // Initial check
    await checkBackendHealth();
    await checkGitStatus();

    // Connect WebSocket and monitor status
    websocketService.connect();
    websocketStatus.connected = websocketService.isConnected();

    // Check WebSocket status periodically
    const checkWebSocket = () => {
      if (!isMounted) return;
      websocketStatus.connected = websocketService.isConnected();
    };

    // Listen for project switch events
    websocketService.on('project-switched', handleProjectSwitched);

    // Refresh every 20 seconds (reduced from 5s to lower load)
    refreshInterval = setInterval(() => {
      if (!isMounted) return;
      checkBackendHealth();
      checkGitStatus();
      checkWebSocket();
    }, 20000);
  });

  onDestroy(() => {
    isMounted = false;
    if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }

    // Clean up WebSocket listeners
    websocketService.off('project-switched', handleProjectSwitched);
  });
</script>

<div class="status-panel">
  <PageInfo
    title="System Status"
    description="This is your Raven health dashboard - like checking the vital signs of a patient, but for your monitoring system. The Status page shows whether all parts of Raven (backend server, database, WebSocket, file watchers, git monitoring) are working correctly. Think of it as a diagnostics panel that tells you **why** something might not be working when you notice problems elsewhere in Raven."
    keyPoints={[
      '**Backend Server Card (🟢 Online / 🔴 Offline)** - Shows if the Node.js backend is running on port 3030. Displays: Status (healthy/unhealthy), Uptime (how long since restart like "2h 15m 30s"), Session ID (unique ID for this run, first 8 chars shown), Active Agents (number of AI tools currently connected), Database path (where SQLite file is stored). If 🔴 Offline, Raven cannot monitor anything.',
      '**WebSocket Connection Card (🟢 Connected / 🔴 Disconnected)** - Shows if the real-time Socket.io connection between frontend and backend is working. When 🟢 Connected, you get live updates without refreshing. When 🔴 Disconnected, the UI falls back to HTTP polling (slower, uses more bandwidth). Connection drops are usually temporary.',
      '**Monitored Projects Card** - Lists ALL projects Raven is watching with green dots next to each. Shows total count like "🟢 3 Active". Click a project name to filter the dashboard to that project only (the selected one gets a "viewing" badge). Says "Global multi-project monitoring active" when all are visible.',
      '**Git Repository Card (🟢 Available / ⚫ Not a Git Repo)** - Only shown if Raven is monitoring a git repository. Shows: Current branch name, Number of modified/new/deleted files, List of all branches (current branch marked with ● dot), Recent 5 commits with hash, author, date, and message. If ⚫ Not a Git Repo, git integration is disabled.',
      '**Available Endpoints Card** - Technical reference showing all API endpoints Raven exposes: GET = blue (read data), POST = green (write data), WS = orange (WebSocket). Shows path and description for each. Useful for debugging API calls.',
      '**Session ID** - Example: "a3b7f12d..." - This is a UUID generated when backend starts. Changes every time you restart Raven. Helps correlate events to specific Raven runs in the database.',
      '**Uptime Format** - Shown as hours/minutes/seconds: "2h 15m 30s" means backend has been running for 2 hours, 15 minutes, 30 seconds without restart. Resets to "0s" when you run `./restart.sh`.'
    ]}
    whenToCheck="Check this page **when Raven stops updating** (to see if backend crashed), **when real-time updates lag** (to verify WebSocket connected), **before reporting bugs** (to gather system status), or **after restarting Raven** (to confirm everything came back online)."
    warnings={[
      '**Backend 🔴 Offline** - CRITICAL! Raven backend is not running. Nothing works when this happens. Fix: Run `./start.sh` or `./restart.sh` from terminal in the Raven directory. Check `/tmp/raven-backend.log` for crash errors.',
      '**WebSocket 🔴 Disconnected** - Real-time updates broken. Frontend will show stale data until refreshed. Usually auto-reconnects within 5-10 seconds. If stuck disconnected >30 seconds, refresh browser or restart backend.',
      '**Uptime shows "5s" but you haven\'t restarted** - Backend crashed and auto-restarted (if using a process manager), or someone else restarted it. Check logs to see why it crashed. Loss of session data possible.',
      '**"0 Active" projects / Empty project list** - Raven is not auto-discovering projects. Check that `/Users/seth/projects/` exists and contains subdirectories. See SETUP.md for project discovery requirements.',
      '**Git shows "Not a Git Repo"** - Either: (1) The current project is not using git, (2) Git monitoring is disabled, (3) .git folder is missing. This is OK if you do not use git - Raven still works.',
      '**Modified files count stuck at same number** - Git status is not refreshing (cached). Click the ↻ Refresh button to force update. Auto-refreshes every 5 seconds normally.',
      '**All endpoints show but API calls fail** - Backend is running but endpoints are crashing. Check backend logs with `tail -f /tmp/raven-backend.log`. Likely a database or permission error.'
    ]}
  />

  <div class="header">
    <h2>🏥 System Status</h2>
    <div class="header-actions">
      <span class="last-updated">Updated: {timeAgo}</span>
      <button on:click={() => checkBackendHealth(true)} class="btn-refresh" disabled={loading}>
        <span class="refresh-icon" class:spinning={isManualRefresh}>↻</span>
        Refresh
      </button>
    </div>
  </div>

  <div class="status-grid">
    <!-- Backend Status Card -->
    <div class="status-card">
      <div class="card-header">
        <h3>⚙️ Backend Server</h3>
        <div class="status-indicator" class:online={backendStatus.connected} class:offline={!backendStatus.connected}>
          {backendStatus.connected ? '🟢 Online' : '🔴 Offline'}
        </div>
      </div>
      <div class="card-body">
        {#if backendStatus.connected}
          <div class="info-row">
            <span class="label">Status:</span>
            <span class="value success">{backendStatus.status}</span>
          </div>
          <div class="info-row">
            <span class="label">Version:</span>
            <span class="value mono">v{backendStatus.version}</span>
          </div>
          <div class="info-row">
            <span class="label">Uptime:</span>
            <span class="value">{formatUptime(backendStatus.uptime)}</span>
          </div>
          <div class="uptime-visualization">
            <div class="uptime-bar">
              <div
                class="uptime-fill"
                style="width: {Math.min((backendStatus.uptime / 86400) * 100, 100)}%"
                title="{((backendStatus.uptime / 86400) * 100).toFixed(1)}% of 24 hours"
              ></div>
            </div>
            <span class="uptime-label">{((backendStatus.uptime / 86400) * 100).toFixed(1)}% of 24h</span>
          </div>
          <div class="info-row">
            <span class="label">Session ID:</span>
            <span class="value mono">{backendStatus?.session_id?.slice(0, 8) || 'N/A'}...</span>
          </div>
          <div class="info-row">
            <span class="label">Active Agents:</span>
            <span class="value">{backendStatus?.active_agents || 0}</span>
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
          <div class="error-message">
            ❌ Cannot connect to backend server
            <p class="hint">Make sure the backend is running on port 3030</p>
          </div>
        {/if}
      </div>
    </div>

    <!-- WebSocket Status Card -->
    <div class="status-card">
      <div class="card-header">
        <h3>🔌 WebSocket Connection</h3>
        <div class="status-indicator" class:online={websocketStatus.connected} class:offline={!websocketStatus.connected}>
          {websocketStatus.connected ? '🟢 Connected' : '🔴 Disconnected'}
        </div>
      </div>
      <div class="card-body">
        {#if websocketStatus.connected}
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
          <div class="error-message">
            ⚠️ WebSocket disconnected
            <p class="hint">Falling back to HTTP polling</p>
          </div>
        {/if}
      </div>
    </div>

    <!-- Telemetry Bridge Status Card -->
    <div class="status-card">
      <div class="card-header">
        <h3>🔗 Telemetry Bridge</h3>
        <div class="status-indicator" class:online={backendStatus.telemetry_bridge.healthy} class:offline={!backendStatus.telemetry_bridge.healthy}>
          {backendStatus.telemetry_bridge.healthy ? '🟢 Running' : '🔴 Stopped'}
        </div>
      </div>
      <div class="card-body">
        {#if backendStatus.connected}
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
            <button on:click={restartBridge} class="btn-restart" disabled={restartingBridge}>
              <span class="refresh-icon" class:spinning={restartingBridge}>↻</span>
              {restartingBridge ? 'Restarting...' : 'Restart Bridge'}
            </button>
          {:else}
            <div class="error-message">
              ⚠️ Telemetry bridge is not running
              <p class="hint">Claude Code operations will not be tracked</p>
            </div>
            <button on:click={restartBridge} class="btn-restart btn-start" disabled={restartingBridge}>
              <span class="refresh-icon" class:spinning={restartingBridge}>↻</span>
              {restartingBridge ? 'Starting...' : 'Start Bridge'}
            </button>
          {/if}
        {:else}
          <div class="error-message">
            ❌ Cannot check bridge status
            <p class="hint">Backend must be online first</p>
          </div>
        {/if}
      </div>
    </div>

    <!-- Monitored Projects Card -->
    <div class="status-card full-width">
      <div class="card-header">
        <h3>👁️ Monitored Projects</h3>
        <div class="status-indicator online">
          🟢 {$availableProjects.length} Active
        </div>
      </div>
      <div class="card-body">
        <div class="projects-list">
          {#each $availableProjects as project}
            <button
              class="project-item"
              class:selected={$projectFilter === project}
              on:click={() => projectFilter.set(project)}
            >
              <div class="project-status-dot"></div>
              <span class="project-name">{project}</span>
              {#if $projectFilter === project}
                <span class="project-badge">viewing</span>
              {/if}
            </button>
          {/each}
        </div>
        <div class="info-message">
          ✅ Global multi-project monitoring active
        </div>
      </div>
    </div>

    <!-- Git Repository Status Card -->
    <div class="status-card full-width">
      <div class="card-header">
        <h3>🌳 Git Repository</h3>
        <div class="status-indicator" class:online={gitStatus.available} class:offline={!gitStatus.available}>
          {gitStatus.available ? '🟢 Available' : '⚫ Not a Git Repo'}
        </div>
      </div>
      <div class="card-body">
        {#if gitStatus.available}
          <!-- Current Branch & Status -->
          <div class="git-section">
            <h4 class="section-title">📍 Current Branch</h4>
            <div class="info-row">
              <span class="label">Active Branch:</span>
              <span class="value mono">{gitStatus.branch}</span>
            </div>
            <div class="info-row">
              <span class="label">Modified Files:</span>
              <span class="value">{gitStatus.modified.length}</span>
            </div>
            <div class="info-row">
              <span class="label">New Files:</span>
              <span class="value">{gitStatus.created.length}</span>
            </div>
            <div class="info-row">
              <span class="label">Deleted Files:</span>
              <span class="value">{gitStatus.deleted.length}</span>
            </div>
          </div>

          <!-- All Branches -->
          {#if gitStatus?.branches?.length > 0}
            <div class="git-section">
              <h4 class="section-title">🌿 All Branches ({gitStatus?.branches?.length || 0})</h4>
              <div class="branches-list">
                {#each gitStatus?.branches || [] as branch}
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
                {#each gitStatus?.commits || [] as commit}
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
    </div>

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
    padding: 24px;
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
    margin-bottom: 10px;
    padding: 0 8px;
  }

  h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 16px;
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
    border-radius: 6px;
    color: var(--text);
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
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
    opacity: 0.5;
    cursor: not-allowed;
  }

  .refresh-icon {
    display: inline-block;
    font-size: 14px;
  }

  .refresh-icon.spinning {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .btn-restart {
    width: 100%;
    padding: 10px 16px;
    margin-top: 12px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .btn-restart:hover:not(:disabled) {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--bg);
  }

  .btn-restart.btn-start {
    background: var(--success);
    border-color: var(--success);
    color: var(--bg);
  }

  .btn-restart.btn-start:hover:not(:disabled) {
    background: var(--success-hover, var(--success));
    opacity: 0.9;
  }

  .btn-restart:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .status-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
    gap: 12px;
  }

  .status-card {
    background: var(--surface);
    border: 1px solid var(--surface-2);
    border-radius: 12px;
    overflow: hidden;
  }

  .status-card.full-width {
    grid-column: 1 / -1;
  }

  .card-header {
    padding: 12px;
    background: var(--bg);
    border-bottom: 1px solid var(--surface-2);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--text);
  }

  .status-indicator {
    padding: 6px 14px;
    border-radius: 20px;
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
    padding: 12px;
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 0;
    border-bottom: 1px solid var(--border);
  }

  .info-row:last-child {
    border-bottom: none;
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
    font-family: 'Courier New', monospace;
    font-size: 12px;
  }

  .value.small {
    font-size: 11px;
  }

  .error-message {
    padding: 12px;
    background: color-mix(in srgb, var(--error) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--error) 30%, transparent);
    border-radius: 8px;
    color: var(--error);
    text-align: center;
  }

  .info-message {
    padding: 12px;
    background: color-mix(in srgb, var(--success) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--success) 30%, transparent);
    border-radius: 8px;
    color: var(--success);
    text-align: center;
    margin-top: 12px;
  }

  .hint {
    margin-top: 8px;
    font-size: 13px;
    color: var(--muted);
  }

  .endpoints-grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .endpoint-item {
    display: grid;
    grid-template-columns: 80px 1fr 200px;
    gap: 12px;
    padding: 12px;
    background: var(--bg);
    border-radius: 6px;
    border: 1px solid var(--border);
    transition: all 0.2s;
  }

  .endpoint-item:hover {
    background: var(--surface);
    border-color: var(--surface-2);
  }

  .method {
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
    text-align: center;
    font-family: 'Courier New', monospace;
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
    font-family: 'Courier New', monospace;
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
    margin-bottom: 10px;
  }

  .git-section:last-child {
    margin-bottom: 0;
  }

  .section-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
    margin: 0 0 12px 0;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border);
  }

  .branches-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 8px 0;
  }

  .branch-tag {
    padding: 6px 12px;
    background: var(--bg);
    border: 1px solid var(--surface-2);
    border-radius: 6px;
    font-size: 12px;
    font-family: 'Courier New', monospace;
    color: var(--muted);
    transition: all 0.2s;
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
    gap: 12px;
  }

  .commit-item {
    padding: 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    border-left: 3px solid var(--info);
    transition: all 0.2s;
  }

  .commit-item:hover {
    background: var(--surface);
    border-color: var(--surface-2);
  }

  .commit-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }

  .commit-hash {
    font-family: 'Courier New', monospace;
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
    margin-bottom: 4px;
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
    gap: 8px;
    margin-bottom: 12px;
  }

  .project-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: var(--mono);
    font-size: 12px;
    color: var(--text);
    text-align: left;
  }

  .project-item:hover {
    background: var(--surface);
    border-color: var(--accent);
    transform: translateY(-1px);
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
    padding: 2px 8px;
    background: var(--accent);
    border-radius: 10px;
    font-size: 10px;
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
      gap: 8px;
    }
  }

  /* Uptime Visualization */
  .uptime-visualization {
    margin-top: 8px;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .uptime-bar {
    flex: 1;
    height: 8px;
    background: var(--surface-2);
    border-radius: 4px;
    overflow: hidden;
    position: relative;
  }

  .uptime-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--success) 0%, var(--accent) 100%);
    border-radius: 4px;
    transition: width 1s ease;
  }

  .uptime-label {
    font-size: 11px;
    color: var(--muted);
    font-family: var(--mono);
    white-space: nowrap;
  }

  /* Database Health */
  .db-error-hint {
    font-size: 10px;
    color: var(--error);
    margin-left: 4px;
  }

  .value.error {
    color: var(--error);
  }

  .value.success {
    color: var(--success);
  }
</style>
