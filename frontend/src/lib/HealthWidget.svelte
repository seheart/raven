<script>
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';
  import { notifications } from './notificationService.js';

  const API_BASE = 'http://localhost:3030/api';

  // Health status
  let health = {
    status: 'good', // 'good', 'warning', 'critical'
    message: 'All Systems OK',
    checks: {
      syntaxErrors: 0,
      testFailures: 0,
      largeDeletions: 0,
      securityChanges: 0
    },
    todayStats: {
      filesChanged: 0,
      linesAdded: 0,
      linesDeleted: 0
    },
    lastCheck: new Date()
  };

  // Startup health check status
  let startupHealthStatus = 'pending';
  let startupHealthResults = null;
  let startupHealthExpanded = false;

  let loading = true;
  let error = null;
  let ws = null;

  // Status icons and colors
  const statusConfig = {
    good: {
      icon: '✅',
      emoji: '🟢',
      color: '#10b981',
      message: 'All Systems OK'
    },
    warning: {
      icon: '⚠️',
      emoji: '🟡',
      color: '#f59e0b',
      message: 'Some Issues Detected'
    },
    critical: {
      icon: '🚨',
      emoji: '🔴',
      color: '#ef4444',
      message: 'Critical Issues Found'
    }
  };

  // Fetch startup health checks
  async function loadStartupHealthChecks() {
    try {
      const response = await fetch(`${API_BASE}/health-checks`);
      const data = await response.json();

      startupHealthStatus = data.status;
      startupHealthResults = data;

      // Show notification if any checks failed
      if (data.status === 'unhealthy' && data.summary) {
        const failedChecks = data.summary.failed;
        notifications.error(
          `${failedChecks} startup health check${failedChecks > 1 ? 's' : ''} failed`,
          {
            title: 'Health Check Warning',
            duration: 10000
          }
        );
      }
    } catch (error) {
      console.error('Failed to load startup health checks:', error);
      startupHealthStatus = 'error';
    }
  }


  // Fetch health data (both project health and startup health checks)
  async function fetchHealth() {
    try {
      loading = true;
      error = null;

      // Fetch startup health checks first
      await loadStartupHealthChecks();

      // Fetch recent events to calculate health
      const response = await fetch('/api/all-file-events?limit=100');
      if (!response.ok) throw new Error('Failed to fetch events');

      const events = await response.json();

      // Calculate health metrics
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let filesChanged = new Set();
      let linesAdded = 0;
      let linesDeleted = 0;
      let largeDeletions = 0;
      let securityChanges = 0;

      events.forEach(event => {
        const eventDate = new Date(event.timestamp);

        if (eventDate >= today) {
          // Use filepath (not file_path) - this is the correct field name
          if (event.filepath) {
            filesChanged.add(event.filepath);
          }

          if (event.lines_added) linesAdded += event.lines_added;
          if (event.lines_deleted) linesDeleted += event.lines_deleted;

          // Check for large deletions
          if (event.lines_deleted && event.lines_deleted > 100) {
            largeDeletions++;
          }

          // Check for security file changes
          const securityPatterns = ['.env', '.git/config', '.pem', '.key', 'credentials'];
          if (event.filepath && securityPatterns.some(pattern => event.filepath.includes(pattern))) {
            securityChanges++;
          }
        }
      });

      health.todayStats = {
        filesChanged: filesChanged.size,
        linesAdded,
        linesDeleted
      };

      // Fetch syntax error count
      let syntaxErrorCount = 0;
      try {
        const syntaxResponse = await fetch('/api/syntax-errors/count');
        if (syntaxResponse.ok) {
          const syntaxData = await syntaxResponse.json();
          syntaxErrorCount = syntaxData.count || 0;
        }
      } catch (err) {
        console.error('Failed to fetch syntax errors:', err);
      }

      health.checks = {
        syntaxErrors: syntaxErrorCount,
        testFailures: 0, // Will be populated when test integration is added
        largeDeletions,
        securityChanges
      };

      // Determine overall health status
      if (securityChanges > 0 || largeDeletions > 3 || syntaxErrorCount > 0) {
        health.status = 'critical';
      } else if (largeDeletions > 0) {
        health.status = 'warning';
      } else {
        health.status = 'good';
      }

      health.lastCheck = new Date();
      loading = false;
    } catch (err) {
      console.error('Failed to fetch health:', err);
      error = err.message;
      loading = false;
    }
  }

  // Subscribe to WebSocket for real-time updates
  function setupWebSocket() {
    const unsubscribers = [];

    // Subscribe to file changes
    unsubscribers.push(
      websocketService.subscribe('file-changed', () => {
        fetchHealth();
      })
    );

    // Subscribe to syntax errors
    unsubscribers.push(
      websocketService.subscribe('syntax-error', () => {
        fetchHealth();
      })
    );

    // Subscribe to test results
    unsubscribers.push(
      websocketService.subscribe('test-result', () => {
        fetchHealth();
      })
    );

    // Return a function that unsubscribes from all events
    ws = () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }

  // Handle health check failed events
  function handleHealthCheckFailed(data) {
    notifications.error(`Health check failed: ${data.checkName}`, {
      title: 'Component Failure',
      message: data.message,
      duration: 8000
    });
  }

  onMount(() => {
    // Initial load
    fetchHealth();
    loadStartupHealthChecks();

    // Setup WebSocket for real-time updates (no polling needed!)
    setupWebSocket();

    // Listen for failed health checks
    websocketService.on('health-check-failed', handleHealthCheckFailed);

    return () => {
      if (ws) ws();
      websocketService.off('health-check-failed', handleHealthCheckFailed);
    };
  });

  onDestroy(() => {
    if (ws) ws();
  });

  // Get status configuration
  $: config = statusConfig[health.status];

  // Format timestamp
  function timeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);

    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  // Startup health check helpers
  function getStartupStatusIcon(status) {
    switch (status) {
      case 'healthy': return '✅';
      case 'unhealthy': return '⚠️';
      case 'error': return '❌';
      case 'pending': return '⏳';
      default: return '❓';
    }
  }

  function getStartupStatusColor(status) {
    switch (status) {
      case 'healthy': return 'var(--success)';
      case 'unhealthy': return 'var(--warning)';
      case 'error': return 'var(--error)';
      case 'pending': return 'var(--muted)';
      default: return 'var(--muted)';
    }
  }

  function getStartupStatusText(status) {
    if (loading && status === 'pending') return 'Checking...';
    if (status === 'healthy') return 'All Systems Operational';
    if (status === 'unhealthy' && startupHealthResults?.summary) {
      const failed = startupHealthResults.summary.failed;
      return `${failed} Check${failed > 1 ? 's' : ''} Failed`;
    }
    if (status === 'error') return 'Check Error';
    return 'Health Check Pending';
  }
</script>

<div class="health-widget" style="--status-color: {config.color}">
  {#if loading}
    <div class="health-loading">
      <div class="spinner"></div>
      <p>Checking health...</p>
    </div>
  {:else if error}
    <div class="health-error">
      <p>❌ {error}</p>
      <button on:click={fetchHealth}>Try Again</button>
    </div>
  {:else}
    <div class="health-compact">
      <div class="health-row">
        <!-- Status Badge -->
        <div class="status-section">
          <div class="health-icon">{config.icon}</div>
          <div class="health-title">
            <h3>Project Health</h3>
            <p class="health-status">{config.message}</p>
          </div>
          <button class="refresh-btn" on:click={fetchHealth} title="Refresh health check">
            ↻
          </button>
        </div>

        <!-- Health Checks (horizontal) -->
        <div class="health-checks">
        <!-- Startup Health Check Badge -->
        <div
          class="check-item startup-check"
          class:clickable={startupHealthResults && startupHealthResults.summary}
          on:click={() => startupHealthExpanded = !startupHealthExpanded}
          on:keydown={(e) => e.key === 'Enter' && (startupHealthExpanded = !startupHealthExpanded)}
          role="button"
          tabindex="0"
          style="color: {getStartupStatusColor(startupHealthStatus)}"
          title="Click to view startup health check details"
        >
          <span class="check-icon">{getStartupStatusIcon(startupHealthStatus)}</span>
          <span class="check-label">
            {getStartupStatusText(startupHealthStatus)}
            {#if startupHealthResults && startupHealthResults.summary}
              <span class="expand-arrow">{startupHealthExpanded ? '▼' : '▶'}</span>
            {/if}
          </span>
        </div>

        <div class="check-divider"></div>

        <div class="check-item" class:ok={health.checks.syntaxErrors === 0}>
          <span class="check-icon">{health.checks.syntaxErrors === 0 ? '✅' : '❌'}</span>
          <span class="check-label">Syntax</span>
        </div>
        <div class="check-item" class:ok={health.checks.testFailures === 0}>
          <span class="check-icon">{health.checks.testFailures === 0 ? '✅' : '❌'}</span>
          <span class="check-label">Tests</span>
        </div>
        <div class="check-item" class:warning={health.checks.largeDeletions > 0}>
          <span class="check-icon">{health.checks.largeDeletions === 0 ? '✅' : '⚠️'}</span>
          <span class="check-label">Deletions ({health.checks.largeDeletions})</span>
        </div>
        <div class="check-item" class:critical={health.checks.securityChanges > 0}>
          <span class="check-icon">{health.checks.securityChanges === 0 ? '✅' : '🚨'}</span>
          <span class="check-label">Security ({health.checks.securityChanges})</span>
        </div>
        </div>

        <!-- Today's Stats (horizontal) -->
        <div class="today-stats">
          <div class="stat">
            <span class="stat-value">{health.todayStats.filesChanged}</span>
            <span class="stat-label">files</span>
          </div>
          <div class="stat">
            <span class="stat-value">+{health.todayStats.linesAdded}</span>
            <span class="stat-label">added</span>
          </div>
          <div class="stat">
            <span class="stat-value">-{health.todayStats.linesDeleted}</span>
            <span class="stat-label">deleted</span>
          </div>
          <div class="last-check">Updated {timeAgo(health.lastCheck)}</div>
        </div>
      </div>

      <!-- Expandable Startup Health Details -->
      {#if startupHealthExpanded && startupHealthResults && startupHealthResults.checks}
        <div class="startup-details">
          {#each startupHealthResults.checks as check}
            <div class="startup-check-item" class:failed={!check.passed}>
              <span class="check-icon">{check.passed ? '✅' : '❌'}</span>
              <span class="check-name">{check.name}</span>
              <span class="check-message" class:error={!check.passed}>{check.message}</span>
              <span class="check-duration">{check.duration}ms</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .health-widget {
    background: var(--surface);
    border-left: 3px solid var(--status-color);
    border: 1px solid var(--border);
    border-left: 3px solid var(--status-color);
    border-radius: 8px;
    padding: 12px 16px;
  }

  .health-compact {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .health-row {
    display: flex;
    align-items: center;
    gap: 24px;
    flex-wrap: wrap;
  }

  .status-section {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .health-icon {
    font-size: 24px;
    line-height: 1;
  }

  .health-title {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .health-title h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
    font-family: var(--mono);
  }

  .health-status {
    margin: 0;
    font-size: 11px;
    font-weight: 500;
    color: var(--status-color);
    font-family: var(--mono);
  }

  .refresh-btn {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 6px;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 16px;
    transition: all 0.2s;
  }

  .refresh-btn:hover {
    background: var(--accent);
    color: white;
    transform: rotate(180deg);
  }

  .health-loading, .health-error {
    text-align: center;
    padding: 12px;
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    margin: 0 auto 8px;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .health-checks {
    display: flex;
    gap: 16px;
    align-items: center;
  }

  .check-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text);
    font-family: var(--mono);
  }

  .check-item.ok {
    color: var(--text);
  }

  .check-item.warning {
    color: #f59e0b;
  }

  .check-item.critical {
    color: #ef4444;
    font-weight: 600;
  }

  .check-icon {
    font-size: 14px;
    flex-shrink: 0;
  }

  .check-label {
    font-weight: 500;
    white-space: nowrap;
  }

  .check-divider {
    width: 1px;
    height: 20px;
    background: var(--border);
    margin: 0 4px;
  }

  .startup-check {
    font-weight: 600;
    padding: 4px 8px;
    border-radius: 4px;
    transition: background 0.2s;
  }

  .startup-check.clickable {
    cursor: pointer;
  }

  .startup-check.clickable:hover {
    background: var(--surface-2);
  }

  .expand-arrow {
    font-size: 10px;
    margin-left: 4px;
    opacity: 0.6;
  }

  .startup-details {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    background: var(--bg);
    border-radius: 6px;
    border: 1px solid var(--border);
  }

  .startup-check-item {
    display: grid;
    grid-template-columns: 20px 1fr 2fr auto;
    gap: 12px;
    align-items: center;
    font-size: 11px;
    font-family: var(--mono);
    padding: 6px 8px;
    background: var(--surface);
    border-radius: 4px;
    border-left: 3px solid var(--success);
  }

  .startup-check-item.failed {
    border-left-color: var(--error);
    background: color-mix(in srgb, var(--error) 5%, var(--surface));
  }

  .check-name {
    font-weight: 600;
    color: var(--text);
  }

  .check-message {
    color: var(--muted);
  }

  .check-message.error {
    color: var(--error);
    font-weight: 500;
  }

  .check-duration {
    color: var(--muted);
    text-align: right;
  }

  .today-stats {
    display: flex;
    gap: 20px;
    align-items: center;
    margin-left: auto;
  }

  .stat {
    display: flex;
    align-items: baseline;
    gap: 4px;
  }

  .stat-value {
    font-size: 16px;
    font-weight: 700;
    color: var(--text);
    font-family: var(--mono);
  }

  .stat-label {
    font-size: 11px;
    color: var(--muted);
    font-weight: 500;
    font-family: var(--mono);
  }

  .last-check {
    font-size: 11px;
    color: var(--muted);
    font-family: var(--mono);
    white-space: nowrap;
  }

  .health-error button {
    margin-top: 8px;
    padding: 6px 12px;
    background: var(--accent);
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
  }

  /* Responsive adjustments */
  @media (max-width: 1024px) {
    .health-row {
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
    }

    .today-stats {
      margin-left: 0;
    }

    .health-checks {
      flex-wrap: wrap;
    }
  }
</style>
