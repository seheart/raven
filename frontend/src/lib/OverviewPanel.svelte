<script>
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';
  import { formatDateTime } from './timeFormat.js';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import { notifications } from './notificationService.js';
  import ProjectsOverview from './ProjectsOverview.svelte';
  import PageInfo from './PageInfo.svelte';
  import HealthStatus from './HealthStatus.svelte';
  import { API_CONFIG } from '../config.js';

  export let sessionId = 'Loading...';
  export let sessionUptime = '0s';

  const API_BASE = API_CONFIG.BASE_URL + '/api';

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
    deletes: 0,
    unique_files_modified: 0
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
  let lastUpdated = null;
  let isManualRefresh = false;

  // Personalized greeting based on time of day
  function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning! Raven is watching...';
    if (hour < 17) return "Good afternoon! Let's see what you're building...";
    if (hour < 21) return 'Good evening! Still coding strong...';
    return 'Late night session? Raven never sleeps...';
  }

  // Format time ago
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

  // Reactive time update
  let timeAgo = 'Never';
  setInterval(() => {
    timeAgo = getTimeAgo();
  }, 1000);

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
    const durationMinutes = Math.max(1, stats.session_duration_seconds / 60);
    const eventsPerMinute = stats.total_events / durationMinutes;
    if (eventsPerMinute > 5) return { state: 'High', color: 'var(--success)', icon: '🔥' };
    if (eventsPerMinute > 2) return { state: 'Medium', color: 'var(--warning)', icon: '⚡' };
    return { state: 'Low', color: 'var(--info)', icon: '💤' };
  }

  async function loadAllData(manual = false) {
    try {
      loading = true;
      isManualRefresh = manual;

      // Load all data in parallel
      const [statsData, metricsData, activityData, filesData] = await Promise.all([
        fetch(`${API_BASE}/dashboard-stats`).then(r => r.json()),
        fetch(`${API_BASE}/system-metrics?limit=1`).then(r => r.json()),
        fetch(`${API_BASE}/all-file-events?limit=5`).then(r => r.json()),
        fetch(`${API_BASE}/top-modified-files?limit=5`).then(r => r.json())
      ]);

      stats = statsData;
      systemMetrics = metricsData?.[0] || systemMetrics;
      recentActivity = activityData || [];
      topFiles = filesData.files || [];

      loading = false;
      lastUpdated = new Date();

      if (manual) {
        notifications.success('Dashboard refreshed', { title: 'Overview Updated' });
      }
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
    const activityData = await fetch(`${API_BASE}/all-file-events?limit=5`).then(r => r.json());
    recentActivity = activityData || [];
  };

  onMount(async () => {
    await loadAllData();

    // Connect to WebSocket for real-time updates
    websocketService.connect();

    websocketService.on('system-metrics', handleMetricsUpdate);
    websocketService.on('file-changed', handleFileChanged);

    // Auto-refresh every 30 seconds
    const interval = setInterval(loadAllData, 30000);

    return () => {
      clearInterval(interval);
    };
  });

  onDestroy(() => {
    websocketService.off('system-metrics', handleMetricsUpdate);
    websocketService.off('file-changed', handleFileChanged);
  });

  $: flowState = getFlowState();
</script>

<div class="overview-panel">
  <PageInfo
    title="Overview Dashboard"
    description="This is your main control center - think of it like the dashboard in your car that shows speed, fuel, temperature, etc. The Overview page shows real-time information about all your coding projects that Raven is watching, what's happening right now, and how your system is performing."
    keyPoints={[
      '**Raven Session ID** - A unique identifier (like a serial number) for this specific run of Raven. Every time you restart Raven with ./restart.sh, you get a new Session ID. This helps separate different monitoring sessions in the database.',
      '**Server Uptime** - Shows how long Raven has been running continuously without a restart. Example: "2h 15m" means Raven started 2 hours and 15 minutes ago. Resets to 0 when you restart.',
      '**Projects List** - Shows all projects Raven is monitoring (like raven, recall, wrap). A green dot means files were modified recently. Click a project name to filter the dashboard to show only that project.',
      '**Current Session Card** - Duration: How long this monitoring session has been active. Files touched: Total number of unique files that were modified. AI interactions: How many times AI tools (like Claude) made changes. Current flow: Your coding rhythm (🔥 Hot = very active, 🌊 Steady = consistent, ❄️ Cold = quiet).',
      '**System Health Card** - CPU: Shows processor usage as a percentage (0-100%). Green bar = healthy (<50%), Yellow = busy (50-80%), Red = overloaded (>80%). Memory: Shows RAM usage in MB. If the bar is red, your computer is running low on memory.',
      '**Live Activity Stream** - Real-time feed of file changes happening RIGHT NOW across all your projects. Each entry shows: Project badge (like [RAVEN]), the file path that changed, and the type of change (➕ add = new file, ✏️ change = file edited, 🗑️ unlink = file deleted). Updates automatically via WebSocket - no refresh needed!',
      '**Most Active Files** - Top 5 files with the most changes during this session. Higher change counts might indicate files you\'re actively working on, or files that are being modified by AI tools frequently.'
    ]}
    whenToCheck="Check this page when you first open Raven to get oriented, or when you want to see what\'s happening across all your projects at once. It\'s your starting point before diving into specific pages like Agents, Activity, or System."
    warnings={[
      'If you see 0 projects listed, Raven might not be watching any directories. Check that backend/server.js is discovering projects correctly in /Users/seth/projects/',
      'No Recent Activity usually means no files have been modified yet. Try editing a file in one of your watched projects to see it appear here.',
      'CPU above 80% (red bar) or Memory above 85% (red bar) indicates your system is struggling. Close unused applications or restart Raven to free up resources.',
      'If Live Activity Stream shows a "💤 No recent activity" message, it means no file changes have been detected in the last few minutes. This is normal if you\'re not actively coding.',
      'Session Duration not increasing? The backend server might have crashed. Check /tmp/raven-backend.log for errors.'
    ]}
  />

  <!-- Personalized Greeting -->
  <div class="greeting-section">
    <h2 class="greeting-text">{getGreeting()}</h2>
    <div class="session-info">
      <div class="session-detail">
        <span class="session-label">
          Raven Session ID:
        </span>
        <span class="session-value">{sessionId}</span>
      </div>
      <div class="session-detail">
        <span class="session-label">
          Server Uptime:
        </span>
        <span class="session-value">{sessionUptime}</span>
      </div>
    </div>
  </div>

  <!-- Multi-Project Overview -->
  <ProjectsOverview />

  <!-- System Health Status -->
  <HealthStatus />

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
            <span class="stat-value">{stats.unique_files_modified}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Total changes:</span>
            <span class="stat-value">{stats.total_events}</span>
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

  </div>

  <!-- Live Activity Stream -->
  <div class="activity-section">
    <div class="section-header">
      <h3>Live Activity Stream</h3>
      <div class="header-actions">
        <span class="last-updated">Updated: {timeAgo}</span>
        <button class="refresh-btn" on:click={() => loadAllData(true)} disabled={loading} title="Refresh now">
          <span class="refresh-icon" class:spinning={loading}>🔄</span>
          Refresh
        </button>
        <span class="live-indicator" aria-label="Real-time updates active">
          <span class="live-dot"></span>
          Live
        </span>
      </div>
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
              <div class="activity-main">
                {#if event.project}
                  <span class="project-badge">{event.project}</span>
                {/if}
                {event.filepath}
              </div>
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
            <span class="file-changes">{file.edit_count} changes</span>
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
    display: flex;
    flex-direction: column;
    gap: 24px;
    position: relative;
  }

  .greeting-section {
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
    display: flex;
    align-items: center;
    gap: 6px;
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
    gap: 20px;
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

  /* Activity Section */
  .activity-section {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
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

  .header-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .last-updated {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--muted);
  }

  .refresh-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    font-family: var(--mono);
    font-size: 11px;
    background: var(--surface-2);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .refresh-btn:hover:not(:disabled) {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
    transform: translateY(-1px);
  }

  .refresh-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .refresh-icon {
    display: inline-block;
    transition: transform 0.3s ease;
  }

  .refresh-icon.spinning {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
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

  .project-badge {
    display: inline-block;
    padding: 2px 8px;
    margin-right: 8px;
    background: var(--accent);
    color: white;
    border-radius: 4px;
    font-family: var(--mono);
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
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
</style>
