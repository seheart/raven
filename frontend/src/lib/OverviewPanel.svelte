<script>
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';
  import { formatDateTime } from './timeFormat.js';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import { notifications } from './notificationService.js';
  import ProjectsOverview from './ProjectsOverview.svelte';

  export let sessionId = 'Loading...';
  export let sessionUptime = '0s';

  const API_BASE = 'http://localhost:3030/api';

  // Combined state from Dashboard, Metrics, and Git
  let stats = {
    total_events: 0,
    total_files: 0,
    total_agents: 0,
    session_duration_seconds: 0,
    active_files_today: 0,
    total_changes: 0,
    creates: 0,
    edits: 0,
    deletes: 0
  };

  let gitStatus = {
    branch: 'unknown',
    uncommitted: [],
    ahead: 0,
    behind: 0
  };

  let systemMetrics = {
    cpu_percent: 0,
    memory_percent: 0,
    memory_used_mb: 0,
    memory_total_mb: 0
  };

  let recentActivity = [];
  let topFiles = [];
  let loading = true;
  let metricsLoading = false;

  // Personalized greeting based on time of day
  function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning! Raven is watching...";
    if (hour < 17) return "Good afternoon! Let's see what you're building...";
    if (hour < 21) return "Good evening! Still coding strong...";
    return "Late night session? Raven never sleeps...";
  }

  // Calculate session duration in human-readable format
  function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  // Determine flow state based on activity
  function getFlowState() {
    const eventsPerMinute = stats.total_events / (stats.session_duration_seconds / 60);
    if (eventsPerMinute > 5) return { state: 'High', color: 'var(--success)', icon: '🔥' };
    if (eventsPerMinute > 2) return { state: 'Medium', color: 'var(--warning)', icon: '⚡' };
    return { state: 'Low', color: 'var(--info)', icon: '💤' };
  }

  async function loadAllData() {
    try {
      loading = true;

      // Load all data in parallel
      const [statsData, gitData, metricsData, activityData, filesData] = await Promise.all([
        fetch(`${API_BASE}/dashboard-stats`).then(r => r.json()),
        fetch(`${API_BASE}/git/status`).then(r => r.json()),
        fetch(`${API_BASE}/system-metrics?limit=1`).then(r => r.json()),
        fetch(`${API_BASE}/file-events?limit=5`).then(r => r.json()),
        fetch(`${API_BASE}/top-modified-files?limit=5`).then(r => r.json())
      ]);

      stats = statsData;
      gitStatus = gitData;
      systemMetrics = metricsData.metrics?.[0] || systemMetrics;
      recentActivity = activityData.events || [];
      topFiles = filesData.files || [];

      loading = false;
      notifications.success('Dashboard refreshed', {
        title: 'Overview Updated'
      });
    } catch (error) {
      console.error('Failed to load overview data:', error);
      notifications.error('Failed to load dashboard data', {
        title: 'Dashboard Error'
      });
      loading = false;
    }
  }

  // WebSocket handlers for real-time updates
  const handleMetricsUpdate = (data) => {
    systemMetrics = data;
    metricsLoading = false;
  };

  const handleFileChanged = async () => {
    // Reload activity on file changes
    const activityData = await fetch(`${API_BASE}/file-events?limit=5`).then(r => r.json());
    recentActivity = activityData.events || [];
  };

  const handleGitStatus = (data) => {
    gitStatus = data;
  };

  onMount(async () => {
    await loadAllData();

    // Connect to WebSocket for real-time updates
    websocketService.connect();

    websocketService.on('system-metrics', handleMetricsUpdate);
    websocketService.on('file-changed', handleFileChanged);
    websocketService.on('git-status', handleGitStatus);

    // Auto-refresh every 30 seconds
    const interval = setInterval(loadAllData, 30000);

    return () => {
      clearInterval(interval);
    };
  });

  onDestroy(() => {
    websocketService.off('system-metrics', handleMetricsUpdate);
    websocketService.off('file-changed', handleFileChanged);
    websocketService.off('git-status', handleGitStatus);
  });

  $: flowState = getFlowState();
</script>

<div class="overview-panel">
  <!-- Personalized Greeting -->
  <div class="greeting-section">
    <h2 class="greeting-text">{getGreeting()}</h2>
    <div class="session-info">
      <div class="session-detail">
        <span class="session-label">Session ID:</span>
        <span class="session-value">{sessionId}</span>
      </div>
      <div class="session-detail">
        <span class="session-label">Uptime:</span>
        <span class="session-value">{sessionUptime}</span>
      </div>
    </div>
  </div>

  <!-- Multi-Project Overview -->
  <ProjectsOverview />

  <!-- Main Stats Grid -->
  <div class="stats-grid">
    <!-- Current Session Card -->
    <div class="stat-card session-card" aria-label="Current session statistics">
      <div class="card-header">
        <span class="card-icon">⏱️</span>
        <h3>Current Session</h3>
      </div>
      {#if loading}
        <LoadingSkeleton type="text" count={4} />
      {:else}
        <div class="stat-rows">
          <div class="stat-row">
            <span class="stat-label">Duration:</span>
            <span class="stat-value">{formatDuration(stats.session_duration_seconds)}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Files touched:</span>
            <span class="stat-value">{stats.total_files}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">AI interactions:</span>
            <span class="stat-value">{stats.total_agents}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Current flow:</span>
            <span class="stat-value" style="color: {flowState.color}">
              {flowState.icon} {flowState.state}
            </span>
          </div>
        </div>
      {/if}
    </div>

    <!-- System Metrics Card -->
    <div class="stat-card metrics-card" aria-label="System metrics">
      <div class="card-header">
        <span class="card-icon">📊</span>
        <h3>System Health</h3>
      </div>
      {#if loading}
        <LoadingSkeleton type="chart" height="100px" />
      {:else}
        <div class="metrics-display">
          <div class="metric-item">
            <div class="metric-label">CPU</div>
            <div class="metric-bar">
              <div
                class="metric-fill"
                style="width: {systemMetrics.cpu_percent}%; background: {systemMetrics.cpu_percent > 80 ? 'var(--error)' : systemMetrics.cpu_percent > 50 ? 'var(--warning)' : 'var(--success)'};"
              ></div>
            </div>
            <div class="metric-value">{systemMetrics.cpu_percent?.toFixed(1)}%</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">Memory</div>
            <div class="metric-bar">
              <div
                class="metric-fill"
                style="width: {systemMetrics.memory_percent}%; background: {systemMetrics.memory_percent > 85 ? 'var(--error)' : systemMetrics.memory_percent > 60 ? 'var(--warning)' : 'var(--success)'};"
              ></div>
            </div>
            <div class="metric-value">
              {systemMetrics.memory_used_mb?.toFixed(0)} / {systemMetrics.memory_total_mb?.toFixed(0)} MB
            </div>
          </div>
        </div>
      {/if}
    </div>

    <!-- Git Status Card -->
    <div class="stat-card git-card" aria-label="Git repository status">
      <div class="card-header">
        <span class="card-icon">🔀</span>
        <h3>Git Status</h3>
      </div>
      {#if loading}
        <LoadingSkeleton type="text" count={3} />
      {:else}
        <div class="git-info">
          <div class="git-branch">
            <span class="branch-icon">🌿</span>
            <span class="branch-name">{gitStatus.branch}</span>
          </div>
          {#if gitStatus.uncommitted?.length > 0}
            <div class="git-warning">
              <span class="warning-icon">⚠️</span>
              <span>{gitStatus.uncommitted.length} uncommitted file{gitStatus.uncommitted.length !== 1 ? 's' : ''}</span>
            </div>
          {:else}
            <div class="git-clean">
              <span class="clean-icon">✅</span>
              <span>Working tree clean</span>
            </div>
          {/if}
          {#if gitStatus.ahead > 0 || gitStatus.behind > 0}
            <div class="git-sync">
              {#if gitStatus.ahead > 0}
                <span>↑ {gitStatus.ahead} ahead</span>
              {/if}
              {#if gitStatus.behind > 0}
                <span>↓ {gitStatus.behind} behind</span>
              {/if}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>

  <!-- Live Activity Stream -->
  <div class="activity-section">
    <div class="section-header">
      <h3>Live Activity Stream</h3>
      <span class="live-indicator" aria-label="Real-time updates active">
        <span class="live-dot"></span>
        Live
      </span>
    </div>

    {#if loading}
      <LoadingSkeleton type="list" count={3} />
    {:else if recentActivity.length > 0}
      <div class="activity-list">
        {#each recentActivity as event}
          <div class="activity-item" role="listitem">
            <span class="activity-icon">
              {#if event.change_type === 'add'}
                ➕
              {:else if event.change_type === 'change'}
                ✏️
              {:else if event.change_type === 'unlink'}
                🗑️
              {:else}
                📄
              {/if}
            </span>
            <div class="activity-content">
              <div class="activity-main">{event.filepath}</div>
              <div class="activity-meta">
                {event.change_type} • {formatDateTime(event.timestamp)}
              </div>
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <div class="empty-state">
        <span class="empty-icon">💤</span>
        <p>No recent activity</p>
      </div>
    {/if}
  </div>

  <!-- Top Files Section -->
  {#if topFiles.length > 0}
    <div class="files-section">
      <h3>Most Active Files</h3>
      <div class="files-list">
        {#each topFiles as file}
          <div class="file-item">
            <span class="file-name">{file.filepath}</span>
            <span class="file-changes">{file.change_count} changes</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .overview-panel {
    padding: 24px;
    max-width: 1400px;
    margin: 0 auto;
  }

  .greeting-section {
    margin-bottom: 32px;
    text-align: center;
  }

  .greeting-text {
    font-family: var(--mono);
    font-size: 20px;
    font-weight: 600;
    color: var(--text);
    margin: 0 0 12px 0;
  }

  .session-info {
    display: flex;
    gap: 32px;
    align-items: center;
    justify-content: center;
  }

  .session-detail {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .session-label {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--muted);
    font-weight: 500;
  }

  .session-value {
    font-family: 'Courier New', monospace;
    font-size: 13px;
    color: var(--text);
    font-weight: 600;
    background: var(--surface);
    padding: 4px 12px;
    border-radius: 6px;
    border: 1px solid var(--border);
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 16px;
    margin-bottom: 32px;
  }

  .stat-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
    transition: all 0.2s ease;
  }

  .stat-card:hover {
    border-color: var(--accent);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 16px;
  }

  .card-header h3 {
    font-family: var(--mono);
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
    margin: 0;
  }

  .card-icon {
    font-size: 18px;
  }

  .stat-rows {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .stat-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .stat-label {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--muted);
  }

  .stat-value {
    font-family: var(--mono);
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }

  /* Metrics Display */
  .metrics-display {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .metric-item {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .metric-label {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--muted);
    min-width: 50px;
  }

  .metric-bar {
    flex: 1;
    height: 8px;
    background: var(--surface-2);
    border-radius: 4px;
    overflow: hidden;
  }

  .metric-fill {
    height: 100%;
    transition: all 0.3s ease;
  }

  .metric-value {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--text);
    min-width: 80px;
    text-align: right;
  }

  /* Git Status */
  .git-info {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .git-branch {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--mono);
    font-size: 13px;
    color: var(--text);
  }

  .git-warning, .git-clean {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--mono);
    font-size: 12px;
  }

  .git-warning {
    color: var(--warning);
  }

  .git-clean {
    color: var(--success);
  }

  .git-sync {
    display: flex;
    gap: 12px;
    font-family: var(--mono);
    font-size: 11px;
    color: var(--muted);
  }

  /* Activity Section */
  .activity-section {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 24px;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }

  .section-header h3 {
    font-family: var(--mono);
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
    margin: 0;
  }

  .live-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: var(--mono);
    font-size: 11px;
    color: var(--success);
  }

  .live-dot {
    width: 8px;
    height: 8px;
    background: var(--success);
    border-radius: 50%;
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .activity-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .activity-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: var(--bg);
    border-radius: 6px;
    transition: all 0.2s ease;
  }

  .activity-item:hover {
    background: var(--surface-2);
  }

  .activity-icon {
    font-size: 16px;
  }

  .activity-content {
    flex: 1;
  }

  .activity-main {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--text);
    margin-bottom: 4px;
  }

  .activity-meta {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--muted);
  }

  /* Files Section */
  .files-section {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
  }

  .files-section h3 {
    font-family: var(--mono);
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
    margin: 0 0 12px 0;
  }

  .files-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .file-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    background: var(--bg);
    border-radius: 4px;
    font-family: var(--mono);
    font-size: 12px;
  }

  .file-name {
    color: var(--text);
  }

  .file-changes {
    color: var(--muted);
    font-size: 11px;
  }

  /* Empty State */
  .empty-state {
    text-align: center;
    padding: 32px;
    color: var(--muted);
  }

  .empty-icon {
    font-size: 32px;
    display: block;
    margin-bottom: 8px;
  }

  .empty-state p {
    font-family: var(--mono);
    font-size: 12px;
    margin: 0;
  }

  /* Focus indicators */
  .stat-card:focus-within {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  /* Alive feeling - subtle animations */
  @keyframes gentleFloat {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-2px); }
  }

  .session-card {
    animation: gentleFloat 4s ease-in-out infinite;
  }

  .metrics-card {
    animation: gentleFloat 4s ease-in-out infinite;
    animation-delay: 1s;
  }

  .git-card {
    animation: gentleFloat 4s ease-in-out infinite;
    animation-delay: 2s;
  }
</style>