<script>
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';
  import { formatShortDateTime } from './timeFormat.js';

  const API_BASE = 'http://localhost:3030';

  let backendStatus = {
    connected: false,
    status: 'unknown',
    session_id: '',
    uptime: 0,
    active_agents: 0,
    database: ''
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

  async function checkBackendHealth() {
    if (!isMounted) return;
    try {
      const response = await fetch(`${API_BASE}/health`, { timeout: 5000 });
      const data = await response.json();

      backendStatus = {
        connected: true,
        status: data.status,
        session_id: data.session_id,
        uptime: data.uptime,
        active_agents: data.active_agents,
        database: data.database
      };
    } catch (error) {
      console.error('Backend health check failed:', error);
      backendStatus.connected = false;
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

  // WebSocket event handler for project switches
  const handleProjectSwitched = async (data) => {
    console.log('📡 Project switched, reloading status panel:', data.project);
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

    // Refresh every 5 seconds (1s is too frequent for git)
    refreshInterval = setInterval(() => {
      if (!isMounted) return;
      checkBackendHealth();
      checkGitStatus();
      checkWebSocket();
    }, 5000);
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
  <div class="header">
    <h2>🏥 System Status</h2>
    <button on:click={checkBackendHealth} class="btn-refresh">
      ↻ Refresh
    </button>
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
            <span class="label">Uptime:</span>
            <span class="value">{formatUptime(backendStatus.uptime)}</span>
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
    padding: 12px;
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

  .btn-refresh:hover {
    background: var(--surface-2);
    border-color: var(--border);
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

  @media (max-width: 768px) {
    .status-grid {
      grid-template-columns: 1fr;
    }

    .endpoint-item {
      grid-template-columns: 1fr;
      gap: 8px;
    }
  }
</style>
