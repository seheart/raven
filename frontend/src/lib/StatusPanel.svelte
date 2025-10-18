<script>
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';

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

  let refreshInterval;

  async function checkBackendHealth() {
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

  onMount(async () => {
    // Initial check
    await checkBackendHealth();

    // Connect WebSocket and monitor status
    websocketService.connect();
    websocketStatus.connected = websocketService.isConnected();

    // Check WebSocket status periodically
    const checkWebSocket = () => {
      websocketStatus.connected = websocketService.isConnected();
    };

    // Refresh every 1 second for real-time monitoring
    refreshInterval = setInterval(() => {
      checkBackendHealth();
      checkWebSocket();
    }, 1000);
  });

  onDestroy(() => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }
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
            <span class="value mono">{backendStatus.session_id.slice(0, 8)}...</span>
          </div>
          <div class="info-row">
            <span class="label">Active Agents:</span>
            <span class="value">{backendStatus.active_agents}</span>
          </div>
          <div class="info-row">
            <span class="label">Database:</span>
            <span class="value mono small">{backendStatus.database.split('/').slice(-3).join('/')}</span>
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
    padding: 20px;
    width: 100%;
    margin: 0;
    font-family: 'Inter', sans-serif;
    background: #0f0f0f;
    color: #e5e5e5;
    min-height: calc(100vh - 200px);
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 30px;
    padding-bottom: 20px;
    border-bottom: 2px solid #1f1f1f;
  }

  h2 {
    margin: 0;
    font-size: 28px;
    font-weight: 700;
    color: #e5e5e5;
  }

  .btn-refresh {
    padding: 10px 20px;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    background: #1a1a1a;
    color: #e5e5e5;
    border: 1px solid #2a2a2a;
    transition: all 0.2s;
  }

  .btn-refresh:hover {
    background: #2a2a2a;
    border-color: #3a3a3a;
  }

  .status-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
    gap: 20px;
  }

  .status-card {
    background: #1a1a1a;
    border: 1px solid #2a2a2a;
    border-radius: 12px;
    overflow: hidden;
  }

  .status-card.full-width {
    grid-column: 1 / -1;
  }

  .card-header {
    padding: 20px;
    background: #0f0f0f;
    border-bottom: 1px solid #2a2a2a;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: #e5e5e5;
  }

  .status-indicator {
    padding: 6px 14px;
    border-radius: 20px;
    font-size: 13px;
    font-weight: 600;
  }

  .status-indicator.online {
    background: rgba(16, 185, 129, 0.2);
    color: #10b981;
  }

  .status-indicator.offline {
    background: rgba(239, 68, 68, 0.2);
    color: #ef4444;
  }

  .card-body {
    padding: 20px;
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 0;
    border-bottom: 1px solid #1f1f1f;
  }

  .info-row:last-child {
    border-bottom: none;
  }

  .label {
    color: #9ca3af;
    font-size: 14px;
    font-weight: 500;
  }

  .value {
    color: #e5e5e5;
    font-size: 14px;
    font-weight: 600;
  }

  .value.success {
    color: #10b981;
  }

  .value.mono {
    font-family: 'Courier New', monospace;
    font-size: 12px;
  }

  .value.small {
    font-size: 11px;
  }

  .error-message {
    padding: 20px;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 8px;
    color: #ef4444;
    text-align: center;
  }

  .info-message {
    padding: 20px;
    background: rgba(16, 185, 129, 0.1);
    border: 1px solid rgba(16, 185, 129, 0.3);
    border-radius: 8px;
    color: #10b981;
    text-align: center;
    margin-top: 12px;
  }

  .hint {
    margin-top: 8px;
    font-size: 13px;
    color: #9ca3af;
  }

  .endpoints-grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .endpoint-item {
    display: grid;
    grid-template-columns: 80px 1fr 200px;
    gap: 16px;
    padding: 12px;
    background: #0f0f0f;
    border-radius: 6px;
    border: 1px solid #1f1f1f;
    transition: all 0.2s;
  }

  .endpoint-item:hover {
    background: #1a1a1a;
    border-color: #2a2a2a;
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
    background: rgba(59, 130, 246, 0.2);
    color: #3b82f6;
  }

  .endpoint-item:nth-child(2) .method {
    background: rgba(16, 185, 129, 0.2);
    color: #10b981;
  }

  .endpoint-item:nth-child(7) .method {
    background: rgba(255, 165, 0, 0.2);
    color: #ffa500;
  }

  .path {
    font-family: 'Courier New', monospace;
    font-size: 13px;
    color: #e5e5e5;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .description {
    font-size: 13px;
    color: #9ca3af;
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
