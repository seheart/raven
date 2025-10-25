<script>
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';

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

  // Fetch health data
  async function fetchHealth() {
    try {
      loading = true;
      error = null;

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

  onMount(() => {
    // Initial load
    fetchHealth();

    // Setup WebSocket for real-time updates (no polling needed!)
    setupWebSocket();

    return () => {
      if (ws) ws();
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
</script>

<div class="health-widget" style="--status-color: {config.color}">
  <div class="health-header">
    <div class="health-icon">{config.icon}</div>
    <div class="health-title">
      <h3>Project Health</h3>
      <p class="health-status">{config.message}</p>
    </div>
    {#if !loading}
      <button class="refresh-btn" on:click={fetchHealth} title="Refresh health check">
        ↻
      </button>
    {/if}
  </div>

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
    <div class="health-body">
      <!-- Health checks -->
      <div class="health-checks">
        <div class="check-item" class:ok={health.checks.syntaxErrors === 0}>
          <span class="check-icon">{health.checks.syntaxErrors === 0 ? '✅' : '❌'}</span>
          <span class="check-label">No syntax errors</span>
        </div>
        <div class="check-item" class:ok={health.checks.testFailures === 0}>
          <span class="check-icon">{health.checks.testFailures === 0 ? '✅' : '❌'}</span>
          <span class="check-label">Tests passing</span>
        </div>
        <div class="check-item" class:warning={health.checks.largeDeletions > 0}>
          <span class="check-icon">{health.checks.largeDeletions === 0 ? '✅' : '⚠️'}</span>
          <span class="check-label">
            {health.checks.largeDeletions} large deletion{health.checks.largeDeletions !== 1 ? 's' : ''}
          </span>
        </div>
        <div class="check-item" class:critical={health.checks.securityChanges > 0}>
          <span class="check-icon">{health.checks.securityChanges === 0 ? '✅' : '🚨'}</span>
          <span class="check-label">
            {health.checks.securityChanges} security file change{health.checks.securityChanges !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <!-- Today's stats -->
      <div class="stats-divider"></div>
      <div class="today-stats">
        <div class="stat">
          <span class="stat-value">{health.todayStats.filesChanged}</span>
          <span class="stat-label">files changed</span>
        </div>
        <div class="stat">
          <span class="stat-value">+{health.todayStats.linesAdded}</span>
          <span class="stat-label">lines added</span>
        </div>
        <div class="stat">
          <span class="stat-value">-{health.todayStats.linesDeleted}</span>
          <span class="stat-label">lines deleted</span>
        </div>
      </div>

      <p class="last-check">Last checked: {timeAgo(health.lastCheck)}</p>
    </div>
  {/if}
</div>

<style>
  .health-widget {
    background: var(--surface);
    border: 2px solid var(--status-color);
    border-radius: var(--radius);
    padding: 20px;
    margin-bottom: 24px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .health-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 20px;
  }

  .health-icon {
    font-size: 32px;
    line-height: 1;
  }

  .health-title {
    flex: 1;
  }

  .health-title h3 {
    margin: 0 0 4px 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--text);
  }

  .health-status {
    margin: 0;
    font-size: 14px;
    font-weight: 500;
    color: var(--status-color);
  }

  .refresh-btn {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 6px;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 18px;
    transition: all 0.2s;
  }

  .refresh-btn:hover {
    background: var(--accent);
    color: white;
    transform: rotate(180deg);
  }

  .health-loading, .health-error {
    text-align: center;
    padding: 20px;
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    margin: 0 auto 12px;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .health-checks {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .check-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    color: var(--text);
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
    font-size: 16px;
    width: 20px;
    flex-shrink: 0;
  }

  .check-label {
    font-weight: 500;
  }

  .stats-divider {
    height: 1px;
    background: var(--border);
    margin: 16px 0;
  }

  .today-stats {
    display: flex;
    gap: 24px;
  }

  .stat {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .stat-value {
    font-size: 24px;
    font-weight: 700;
    color: var(--text);
    font-family: var(--mono);
  }

  .stat-label {
    font-size: 12px;
    color: var(--muted);
    font-weight: 500;
  }

  .last-check {
    margin: 12px 0 0 0;
    font-size: 12px;
    color: var(--muted);
    text-align: right;
  }

  .health-error button {
    margin-top: 12px;
    padding: 8px 16px;
    background: var(--accent);
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }
</style>
