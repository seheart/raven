<script>
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';
  import { logger } from './logger.js';

  // System metrics
  let backendHealth = { status: 'unknown', version: '0.0.0', uptime: 0 };
  let projectHealth = [];
  let databaseStats = { size: 0, events: 0 };
  let errorCount = 0;
  let notifications = 0;
  let wsConnected = false;
  let apiHealth = null;

  let loading = true;
  let error = null;
  let lastUpdated = new Date();

  // Fetch system data
  async function loadSystemData() {
    try {
      loading = true;
      error = null;

      // Parallel data fetching
      const [healthData, projectsData, dbStats, errorsData, notifData, apiHealthData] = await Promise.all([
        fetch('/api/health').then(r => r.json()).catch(() => ({})),
        fetch('/api/health/projects').then(r => r.json()).catch(() => ({ projects: [] })),
        fetch('/api/database/stats').then(r => r.json()).catch(() => ({ size: 0, events: 0 })),
        fetch('/api/errors/stats').then(r => r.json()).catch(() => ({ total: 0 })),
        fetch('/api/notifications/stats').then(r => r.json()).catch(() => ({ unread: 0 })),
        fetch('/api/health-checks').then(r => r.json()).catch(() => null)
      ]);

      backendHealth = {
        status: healthData.status || 'unknown',
        version: healthData.version || '0.0.0',
        uptime: healthData.uptime || 0,
        sessionId: healthData.session_id,
        activeAgents: healthData.active_agents || 0
      };

      projectHealth = projectsData.projects || [];
      databaseStats = {
        size: dbStats.total_size || dbStats.size || 0,
        events: dbStats.total_events || dbStats.events || 0
      };

      errorCount = errorsData.total || 0;
      notifications = notifData.unread || 0;
      apiHealth = apiHealthData;
      wsConnected = websocketService.isConnected();

      lastUpdated = new Date();
      loading = false;
    } catch (err) {
      logger.error('Failed to load system data:', err);
      error = err.message;
      loading = false;
    }
  }

  // Format bytes
  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  // Format uptime
  function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  // WebSocket listeners
  let unsubscribers = [];

  onMount(() => {
    loadSystemData();

    unsubscribers.push(
      websocketService.subscribe('health-check-failed', loadSystemData)
    );

    // Check WebSocket status every few seconds
    const wsCheckInterval = setInterval(() => {
      wsConnected = websocketService.isConnected();
    }, 3000);

    return () => clearInterval(wsCheckInterval);
  });

  onDestroy(() => {
    unsubscribers.forEach(unsub => unsub());
  });

  $: healthyProjects = projectHealth.filter(p => p.status === 'healthy').length;
  $: totalProjects = projectHealth.length;
  $: systemStatus = backendHealth.status === 'healthy' && healthyProjects === totalProjects ? 'healthy' : 'degraded';
  $: statusColor = systemStatus === 'healthy' ? '#10b981' : '#f59e0b';
</script>

<div class="system-overview">
  <div class="header">
    <div class="header-content">
      <h1>⚙️ System Overview</h1>
      <p class="subtitle">Backend status, infrastructure, and monitoring</p>
    </div>
    <div class="header-actions">
      <span class="last-updated">Updated {Math.floor((new Date() - lastUpdated) / 1000)}s ago</span>
      <button class="refresh-btn" on:click={loadSystemData} disabled={loading}>
        {loading ? '⏳' : '🔄'} Refresh
      </button>
    </div>
  </div>

  {#if error}
    <div class="error-banner">
      <span>⚠️ Failed to load system data: {error}</span>
      <button on:click={loadSystemData}>Retry</button>
    </div>
  {:else if loading}
    <div class="loading-skeleton">
      <div class="skeleton-card"></div>
      <div class="skeleton-card"></div>
      <div class="skeleton-card"></div>
      <div class="skeleton-card"></div>
    </div>
  {:else}
    <!-- System Status Card -->
    <div class="status-card" style="--status-color: {statusColor}">
      <div class="status-icon">{systemStatus === 'healthy' ? '✅' : '⚠️'}</div>
      <div class="status-content">
        <h2>System Status: <span class="status-label">{systemStatus.toUpperCase()}</span></h2>
        <p>Raven v{backendHealth.version} · Uptime: {formatUptime(backendHealth.uptime)}</p>
        <div class="status-details">
          <div class="detail-item">
            <span class="detail-icon">{backendHealth.status === 'healthy' ? '🟢' : '🔴'}</span>
            <span>Backend: {backendHealth.status}</span>
          </div>
          <div class="detail-item">
            <span class="detail-icon">{wsConnected ? '🟢' : '🔴'}</span>
            <span>WebSocket: {wsConnected ? 'Connected' : 'Disconnected'}</span>
          </div>
          <div class="detail-item">
            <span class="detail-icon">📁</span>
            <span>Projects: {healthyProjects}/{totalProjects} healthy</span>
          </div>
          <div class="detail-item">
            <span class="detail-icon">🤖</span>
            <span>Active Agents: {backendHealth.activeAgents}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Quick Stats -->
    <div class="stats-grid">
      <a href="#system-projects" class="stat-card">
        <div class="stat-icon">📂</div>
        <div class="stat-content">
          <div class="stat-value">{totalProjects}</div>
          <div class="stat-label">Projects Monitored</div>
          <div class="stat-status" class:ok={healthyProjects === totalProjects} class:warning={healthyProjects < totalProjects}>
            {healthyProjects} healthy
          </div>
        </div>
      </a>

      <a href="#system-storage" class="stat-card">
        <div class="stat-icon">💾</div>
        <div class="stat-content">
          <div class="stat-value">{formatBytes(databaseStats.size)}</div>
          <div class="stat-label">Database Size</div>
          <div class="stat-detail">{databaseStats.events.toLocaleString()} events</div>
        </div>
      </a>

      <a href="#system-errors" class="stat-card" class:alert={errorCount > 0}>
        <div class="stat-icon">🚨</div>
        <div class="stat-content">
          <div class="stat-value">{errorCount}</div>
          <div class="stat-label">System Errors</div>
          <div class="stat-status" class:ok={errorCount === 0} class:critical={errorCount > 0}>
            {errorCount === 0 ? 'All clear' : 'Needs attention'}
          </div>
        </div>
      </a>

      <a href="#system-notifications" class="stat-card" class:alert={notifications > 0}>
        <div class="stat-icon">🔔</div>
        <div class="stat-content">
          <div class="stat-value">{notifications}</div>
          <div class="stat-label">Notifications</div>
          <div class="stat-detail">Unread messages</div>
        </div>
      </a>
    </div>

    <!-- Project Health -->
    {#if projectHealth.length > 0}
      <div class="section-card">
        <h2>📊 Project Health Status</h2>
        <div class="projects-grid">
          {#each projectHealth.slice(0, 6) as project}
            <div class="project-item" class:healthy={project.status === 'healthy'}>
              <div class="project-status">{project.status === 'healthy' ? '✅' : '⚠️'}</div>
              <div class="project-info">
                <div class="project-name">{project.name}</div>
                <div class="project-meta">
                  {project.events || 0} events · {project.files || 0} files
                </div>
              </div>
            </div>
          {/each}
        </div>
        {#if projectHealth.length > 6}
          <div class="view-all">
            <a href="#system-projects">View all {projectHealth.length} projects →</a>
          </div>
        {/if}
      </div>
    {/if}

    <!-- API Health Checks -->
    {#if apiHealth && apiHealth.summary}
      <div class="section-card">
        <h2>🏥 API Health Checks</h2>
        <div class="health-summary">
          <div class="health-stat">
            <span class="health-value">{apiHealth.summary.total}</span>
            <span class="health-label">Total Checks</span>
          </div>
          <div class="health-stat success">
            <span class="health-value">{apiHealth.summary.passed}</span>
            <span class="health-label">Passed</span>
          </div>
          <div class="health-stat error">
            <span class="health-value">{apiHealth.summary.failed}</span>
            <span class="health-label">Failed</span>
          </div>
        </div>
        <a href="#system-api-health" class="view-details">View detailed health checks →</a>
      </div>
    {/if}

    <!-- Quick Actions -->
    <div class="quick-actions">
      <h2>🚀 Quick Actions</h2>
      <div class="actions-grid">
        <a href="#system-status" class="action-card">
          <div class="action-icon">📊</div>
          <div>
            <div class="action-title">System Status</div>
            <div class="action-description">Backend connectivity and health</div>
          </div>
        </a>

        <a href="#system-anomaly-alerts" class="action-card">
          <div class="action-icon">🚨</div>
          <div>
            <div class="action-title">Anomaly Alerts</div>
            <div class="action-description">Detect unusual patterns</div>
          </div>
        </a>

        <a href="#system-storage" class="action-card">
          <div class="action-icon">💾</div>
          <div>
            <div class="action-title">Storage Management</div>
            <div class="action-description">Database and retention</div>
          </div>
        </a>

        <a href="#system-projects" class="action-card">
          <div class="action-icon">📂</div>
          <div>
            <div class="action-title">Projects Config</div>
            <div class="action-description">Manage monitored projects</div>
          </div>
        </a>

        <a href="#system-notifications" class="action-card">
          <div class="action-icon">🔔</div>
          <div>
            <div class="action-title">Notifications</div>
            <div class="action-description">System alerts history</div>
          </div>
        </a>

        <a href="#system-errors" class="action-card">
          <div class="action-icon">🐛</div>
          <div>
            <div class="action-title">Error Log</div>
            <div class="action-description">System error tracking</div>
          </div>
        </a>

        <a href="#system-api-health" class="action-card">
          <div class="action-icon">🏥</div>
          <div>
            <div class="action-title">API Health</div>
            <div class="action-description">Endpoint monitoring</div>
          </div>
        </a>

        <a href="#system-sync" class="action-card">
          <div class="action-icon">🔄</div>
          <div>
            <div class="action-title">Server Sync</div>
            <div class="action-description">Remote synchronization</div>
          </div>
        </a>
      </div>
    </div>
  {/if}
</div>

<style>
  .system-overview {
    padding: 1rem;
    max-width: 1400px;
    margin: 0 auto;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1rem;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .header-content h1 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .subtitle {
    margin: 0.25rem 0 0 0;
    color: var(--text-secondary);
    font-size: 0.85rem;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .last-updated {
    color: var(--text-secondary);
    font-size: 0.85rem;
  }

  .refresh-btn {
    padding: 0.5rem 1rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.9rem;
    transition: all 0.2s;
  }

  .refresh-btn:hover:not(:disabled) {
    background: var(--bg-tertiary);
    border-color: var(--primary);
  }

  .refresh-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Status Card */
  .status-card {
    background: linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-tertiary) 100%);
    border: 2px solid var(--status-color);
    border-radius: 12px;
    padding: 1rem;
    margin-bottom: 1rem;
    display: flex;
    gap: 1.5rem;
    align-items: flex-start;
  }

  .status-icon {
    font-size: 3rem;
    flex-shrink: 0;
  }

  .status-content {
    flex: 1;
  }

  .status-content h2 {
    margin: 0 0 0.5rem 0;
    font-size: 1.5rem;
    color: var(--text-primary);
  }

  .status-label {
    color: var(--status-color);
  }

  .status-content p {
    margin: 0 0 1rem 0;
    color: var(--text-secondary);
  }

  .status-details {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
  }

  .detail-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--text-primary);
    font-size: 0.95rem;
  }

  .detail-icon {
    font-size: 1.2rem;
  }

  /* Stats Grid */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .stat-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 0.65rem 0.85rem;
    display: flex;
    gap: 0.85rem;
    align-items: center;
    text-decoration: none;
    transition: all 0.2s;
  }

  .stat-card:hover {
    border-color: var(--primary);
    transform: translateY(-2px);
  }

  .stat-card.alert {
    border-color: #ef4444;
    background: linear-gradient(135deg, var(--bg-secondary) 0%, rgba(239, 68, 68, 0.05) 100%);
  }

  .stat-icon {
    font-size: 1.65rem;
    line-height: 1;
    flex-shrink: 0;
  }

  .stat-content {
    flex: 1;
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    flex-wrap: wrap;
  }

  .stat-value {
    font-size: 1.65rem;
    font-weight: 700;
    color: var(--text-primary);
    line-height: 1;
    margin: 0;
  }

  .stat-label {
    color: var(--text-secondary);
    font-size: 0.82rem;
    margin: 0;
    line-height: 1.1;
    font-weight: 500;
  }

  .stat-detail {
    font-size: 0.72rem;
    color: var(--text-tertiary);
    line-height: 1.2;
    margin: 0;
    flex-basis: 100%;
  }

  .stat-status {
    font-size: 0.85rem;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    display: inline-block;
    margin-top: 0.5rem;
  }

  .stat-status.ok {
    background: rgba(16, 185, 129, 0.1);
    color: #10b981;
  }

  .stat-status.warning {
    background: rgba(245, 158, 11, 0.1);
    color: #f59e0b;
  }

  .stat-status.critical {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
  }

  /* Section Card */
  .section-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 1rem;
    margin-bottom: 1rem;
  }

  .section-card h2 {
    margin: 0 0 0.75rem 0;
    font-size: 1rem;
    color: var(--text-primary);
  }

  /* Projects Grid */
  .projects-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 1rem;
  }

  .project-item {
    display: flex;
    gap: 0.75rem;
    padding: 0.65rem 0.85rem;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
  }

  .project-item.healthy {
    border-left: 3px solid #10b981;
  }

  .project-status {
    font-size: 1.25rem;
    flex-shrink: 0;
  }

  .project-info {
    flex: 1;
  }

  .project-name {
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 0.25rem;
  }

  .project-meta {
    font-size: 0.85rem;
    color: var(--text-secondary);
  }

  .view-all {
    margin-top: 1rem;
    text-align: center;
  }

  .view-all a {
    color: var(--primary);
    text-decoration: none;
    font-weight: 500;
  }

  .view-all a:hover {
    text-decoration: underline;
  }

  /* Health Summary */
  .health-summary {
    display: flex;
    gap: 2rem;
    margin-bottom: 1rem;
  }

  .health-stat {
    text-align: center;
  }

  .health-value {
    display: block;
    font-size: 2rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .health-stat.success .health-value {
    color: #10b981;
  }

  .health-stat.error .health-value {
    color: #ef4444;
  }

  .health-label {
    display: block;
    font-size: 0.85rem;
    color: var(--text-secondary);
    margin-top: 0.25rem;
  }

  .view-details {
    color: var(--primary);
    text-decoration: none;
    font-weight: 500;
  }

  .view-details:hover {
    text-decoration: underline;
  }

  /* Quick Actions */
  .quick-actions h2 {
    margin: 0 0 0.75rem 0;
    font-size: 1rem;
    color: var(--text-primary);
  }

  .actions-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 0.75rem;
  }

  .action-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 0.65rem 0.85rem;
    text-decoration: none;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 0.85rem;
  }

  .action-card:hover {
    border-color: var(--primary);
    transform: translateY(-2px);
  }

  .action-icon {
    font-size: 1.65rem;
    line-height: 1;
    flex-shrink: 0;
  }

  .action-title {
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 0.15rem 0;
    font-size: 0.85rem;
    line-height: 1.2;
  }

  .action-description {
    font-size: 0.72rem;
    color: var(--text-secondary);
    line-height: 1.2;
    margin: 0;
  }

  /* Loading & Error States */
  .loading-skeleton {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1.5rem;
  }

  .skeleton-card {
    height: 150px;
    background: linear-gradient(90deg, var(--bg-secondary) 25%, var(--bg-tertiary) 50%, var(--bg-secondary) 75%);
    background-size: 200% 100%;
    animation: loading 1.5s infinite;
    border-radius: 12px;
  }

  @keyframes loading {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  .error-banner {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid #ef4444;
    border-radius: 8px;
    padding: 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
  }

  .error-banner button {
    padding: 0.5rem 1rem;
    background: #ef4444;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .system-overview {
      padding: 1rem;
    }

    .header {
      flex-direction: column;
    }

    .status-card {
      flex-direction: column;
    }

    .status-details {
      grid-template-columns: 1fr;
    }

    .stats-grid,
    .projects-grid,
    .actions-grid {
      grid-template-columns: 1fr;
    }

    .health-summary {
      flex-direction: column;
      gap: 1rem;
    }
  }
</style>
