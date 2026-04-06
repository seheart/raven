<script>
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './services/websocket.js';
  import { notifications } from './notificationService.js';
  import { dataService } from './dataService.js';
  import { api } from './apiClient.js';
  import { logger } from './logger.js';

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
    lastCheck: new Date()
  };

  // Startup health check status
  let startupHealthStatus = 'pending';
  let startupHealthResults = null;
  let startupHealthExpanded = false;

  let loading = true;
  let error = null;
  let todayStats = null;
  let ws = null;
  let healthCheckTimeoutId = null; // Track timeout for cleanup

  // Status icons and colors
  const statusConfig = {
    good: {
      icon: '',
      emoji: '',
      color: 'var(--success)',
      message: 'All Systems OK'
    },
    warning: {
      icon: '',
      emoji: '',
      color: 'var(--warning)',
      message: 'Some Issues Detected'
    },
    critical: {
      icon: '',
      emoji: '',
      color: 'var(--error)',
      message: 'Critical Issues Found'
    }
  };

  // Fetch startup health checks with timeout fallback
  async function loadStartupHealthChecks() {
    try {
      // Set timeout of 10 seconds for health checks (prevents indefinite hang)
      const timeoutPromise = new Promise((_, reject) => {
        healthCheckTimeoutId = setTimeout(() => reject(new Error('Health check timeout')), 10000);
      });

      const data = await Promise.race([dataService.fetchHealthChecks(), timeoutPromise]);

      // Clear timeout if fetch completed successfully
      if (healthCheckTimeoutId) {
        clearTimeout(healthCheckTimeoutId);
        healthCheckTimeoutId = null;
      }

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
      // Clear timeout on error as well
      if (healthCheckTimeoutId) {
        clearTimeout(healthCheckTimeoutId);
        healthCheckTimeoutId = null;
      }
      logger.warn('Health check failed or timed out:', error.message);
      startupHealthStatus = 'error';
      startupHealthResults = {
        status: 'error',
        message: 'Health check timed out or failed',
        summary: { total: 0, passed: 0, failed: 0 }
      };
      // Don't show error notification - health checks are non-critical
    }
  }

  // Fetch health data (both project health and startup health checks)
  async function fetchHealth() {
    try {
      loading = true;
      error = null;

      // Fetch startup health checks first (with timeout protection)
      await loadStartupHealthChecks();

      // Fetch recent events to calculate health - uses dataService with caching
      const events = await dataService.fetchFileEvents(100);

      // Calculate health metrics
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let largeDeletions = 0;
      let securityChanges = 0;
      let totalAdded = 0;
      let totalDeleted = 0;
      const todayFiles = new Set();

      events.forEach(event => {
        const eventDate = new Date(event.timestamp);

        if (eventDate >= today) {
          // Check for large deletions
          if (event.lines_deleted && event.lines_deleted > 100) {
            largeDeletions++;
          }

          // Check for security file changes
          const securityPatterns = ['.env', '.git/config', '.pem', '.key', 'credentials'];
          if (
            event.filepath &&
            securityPatterns.some(pattern => event.filepath.includes(pattern))
          ) {
            securityChanges++;
          }

          // Aggregate lines added/deleted for today's stats
          if (typeof event.lines_added === 'number') {
            totalAdded += event.lines_added;
          }
          if (typeof event.lines_deleted === 'number') {
            totalDeleted += event.lines_deleted;
          }
          if (event.filepath) {
            todayFiles.add(event.filepath);
          }
        }
      });

      // Fetch syntax error count
      let syntaxErrorCount = 0;
      try {
        const syntaxData = await api.get('/syntax-errors/count');
        syntaxErrorCount = syntaxData.count || 0;
      } catch (err) {
        logger.error('Failed to fetch syntax errors:', err);
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
      todayStats = { added: totalAdded, deleted: totalDeleted, files: todayFiles.size };
      loading = false;
    } catch (err) {
      logger.error('Failed to fetch health:', err);
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
    // Initial load (fetchHealth already calls loadStartupHealthChecks internally)
    fetchHealth();

    // Setup WebSocket for real-time updates (no polling needed!)
    setupWebSocket();

    // Listen for failed health checks
    websocketService.on('health-check-failed', handleHealthCheckFailed);
  });

  onDestroy(() => {
    // Clean up websocket subscriptions
    if (ws) ws();
    websocketService.off('health-check-failed', handleHealthCheckFailed);

    // Clean up any pending timeouts
    if (healthCheckTimeoutId) {
      clearTimeout(healthCheckTimeoutId);
      healthCheckTimeoutId = null;
    }
  });

  // Get status configuration
  $: config = statusConfig[health.status];

  // Startup health check helpers
  function getStartupStatusIcon(status) {
    switch (status) {
      case 'healthy':
        return '';
      case 'unhealthy':
        return '';
      case 'error':
        return '';
      case 'pending':
        return '';
      default:
        return '';
    }
  }

  function getStartupStatusColor(status) {
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

<div
  class="card-compact health-widget"
  style="--status-color: {config.color}"
  role="region"
  aria-label="Project health status"
>
  {#if loading}
    <div class="health-loading" role="status" aria-live="polite" aria-busy="true">
      <div class="spinner" aria-hidden="true"></div>
      <p>Checking health...</p>
    </div>
  {:else if error}
    <div class="health-error" role="alert">
      <p>{error}</p>
      <button class="btn btn-primary btn-sm" on:click={fetchHealth} aria-label="Retry health check"
        >Try Again</button
      >
    </div>
  {:else}
    <div class="health-compact">
      <div class="health-row">
        <!-- Status Badge -->
        <div class="status-section" role="status" aria-live="polite">
          <div class="health-icon" aria-hidden="true">{config.icon}</div>
          <h3 id="health-title">Project Health</h3>
          <p class="health-status">{config.message}</p>
        </div>

        <!-- Health Checks (horizontal) -->
        <div class="health-checks" role="group" aria-labelledby="health-title">
          <!-- Startup Health Check Badge -->
          <div
            class="check-item startup-check"
            class:clickable={startupHealthResults && startupHealthResults.summary}
            on:click={() => (startupHealthExpanded = !startupHealthExpanded)}
            on:keydown={e => e.key === 'Enter' && (startupHealthExpanded = !startupHealthExpanded)}
            role="button"
            tabindex="0"
            style="color: {getStartupStatusColor(startupHealthStatus)}"
            aria-label="Startup health check: {getStartupStatusText(startupHealthStatus)}"
            aria-expanded={startupHealthExpanded}
            aria-controls="startup-details"
          >
            <span class="check-icon">{getStartupStatusIcon(startupHealthStatus)}</span>
            <span class="check-label">
              {getStartupStatusText(startupHealthStatus)}
              {#if startupHealthResults && startupHealthResults.summary}
                <span class="expand-arrow">{startupHealthExpanded ? '' : ''}</span>
              {/if}
            </span>
          </div>

          <div class="check-divider" aria-hidden="true"></div>

          <div
            class="check-item"
            class:ok={health.checks.syntaxErrors === 0}
            role="status"
            aria-label="Syntax errors: {health.checks.syntaxErrors}"
          >
            <span class="check-icon" aria-hidden="true"
              >{health.checks.syntaxErrors === 0 ? '' : ''}</span
            >
            <span class="check-label">Syntax</span>
          </div>
          <div
            class="check-item"
            class:ok={health.checks.testFailures === 0}
            role="status"
            aria-label="Test failures: {health.checks.testFailures}"
          >
            <span class="check-icon" aria-hidden="true"
              >{health.checks.testFailures === 0 ? '' : ''}</span
            >
            <span class="check-label">Tests</span>
          </div>
          <div
            class="check-item"
            class:warning={health.checks.largeDeletions > 0}
            role="status"
            aria-label="Large deletions: {health.checks.largeDeletions}"
          >
            <span class="check-icon" aria-hidden="true"
              >{health.checks.largeDeletions === 0 ? '' : ''}</span
            >
            <span class="check-label">Deletions ({health.checks.largeDeletions})</span>
          </div>
          <div
            class="check-item"
            class:critical={health.checks.securityChanges > 0}
            role="status"
            aria-label="Security file changes: {health.checks.securityChanges}"
          >
            <span class="check-icon" aria-hidden="true"
              >{health.checks.securityChanges === 0 ? '' : ''}</span
            >
            <span class="check-label">Security ({health.checks.securityChanges})</span>
          </div>
        </div>

        <!-- Refresh Button (far right) -->
        <button
          class="btn btn-primary btn-icon"
          on:click={async () => {
            await loadStartupHealthChecks();
            await fetchHealth();
          }}
          aria-label="Refresh health checks"
        >
          <span aria-hidden="true">↻</span>
        </button>
      </div>

      <!-- Expandable Startup Health Details -->
      {#if startupHealthExpanded && startupHealthResults && startupHealthResults.checks}
        <div
          class="startup-details"
          id="startup-details"
          role="region"
          aria-label="Startup health check details"
        >
          {#each startupHealthResults.checks as check (check.path || check.name)}
            <div
              class="startup-check-item"
              class:failed={!check.passed}
              role="status"
              aria-label="{check.name}: {check.passed ? 'passed' : 'failed'} - {check.message}"
            >
              <span class="check-icon" aria-hidden="true">{check.passed ? '' : ''}</span>
              <span class="check-name">{check.name}</span>
              <span class="check-message" class:error={!check.passed}>{check.message}</span>
              <span class="check-duration" aria-label="Duration: {check.duration} milliseconds"
                >{check.duration}ms</span
              >
            </div>
          {/each}
        </div>
      {/if}
    </div>
    <!-- close health-compact -->
  {/if}
</div>

<!-- close health-widget -->

<style>
  .health-widget {
    /* Using standardized .card-compact class */
    border-left-width: 3px; /* Custom: thicker left border for status indicator */
    border-left-color: var(--status-color);
    padding: var(--space-md) var(--space-lg); /* Custom: asymmetric padding */
  }

  .health-compact {
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
  }

  .health-row {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
    flex-wrap: nowrap;
  }

  .status-section {
    display: flex;
    align-items: center;
    gap: var(--space-xl);
  }

  .health-icon {
    font-size: 11px;
    line-height: 1;
  }

  .status-section h3 {
    margin: 0;
    font-size: 11px;
    font-weight: 600;
    color: var(--text);
    font-family: var(--mono);
    white-space: nowrap;
  }

  .health-status {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--status-color);
    font-family: var(--mono);
    white-space: nowrap;
  }

  .btn.btn-icon {
    margin-left: auto;
    flex-shrink: 0;
  }

  .health-loading,
  .health-error {
    text-align: center;
    padding: var(--space-xl);
  }

  .spinner {
    width: var(--icon-md);
    height: var(--icon-md);
    border: 2px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    margin: 0 auto var(--space-lg);
    animation: spin 1s linear infinite;
  }

  .health-checks {
    display: flex;
    gap: var(--space-lg);
    align-items: center;
    flex: 1;
  }

  .check-item {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    font-size: 12px;
    color: var(--text);
    font-family: var(--mono);
  }

  .check-item.ok {
    color: var(--text);
  }

  .check-item.warning {
    color: var(--warning);
  }

  .check-item.critical {
    color: var(--error);
    font-weight: 600;
  }

  .check-icon {
    font-size: 11px;
    flex-shrink: 0;
  }

  .check-label {
    font-weight: 500;
    white-space: nowrap;
  }

  .check-divider {
    width: 1px;
    height: var(--icon-sm);
    background: var(--border);
    margin: 0 var(--space-sm);
  }

  .startup-check {
    font-weight: 600;
    padding: var(--space-sm) var(--space-lg);
    border-radius: var(--radius);
    transition: background var(--duration-base) var(--ease-smooth);
  }

  .startup-check.clickable {
    cursor: pointer;
  }

  .startup-check.clickable:hover {
    background: var(--surface-2);
  }

  .expand-arrow {
    font-size: 11px;
    margin-left: var(--space-sm);
    opacity: 0.6;
  }

  .startup-details {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    padding: var(--space-xl);
    background: var(--bg); /* Custom: different background */
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
  }

  .startup-check-item {
    display: grid;
    grid-template-columns: 20px 1fr 2fr auto;
    gap: var(--space-xl);
    align-items: center;
    font-size: 11px;
    font-family: var(--mono);
    padding: var(--space-md) var(--space-lg);
    background: var(--surface);
    border-radius: var(--radius);
    border-left: 3px solid var(--success); /* Custom: left border for status */
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

  .health-error button {
    margin-top: var(--space-lg);
  }

  /* Responsive adjustments */
  @media (max-width: 1024px) {
    .health-row {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-xl);
    }

    .health-checks {
      flex-wrap: wrap;
    }
  }
</style>
