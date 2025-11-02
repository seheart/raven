<script>
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';
  import { dataService } from './dataService.js';
  import { logger } from './logger.js';
  import { router } from './router.js';

  // Safety metrics
  let syntaxErrorCount = 0;
  let patternWarningCount = 0;
  let testResults = { total: 0, passed: 0, failed: 0 };
  let recentSessions = [];
  let criticalWarnings = [];

  let loading = true;
  let error = null;
  let lastUpdated = new Date();

  // Store full warnings data
  let warningsData = { warnings: [] };

  // Count errors vs warnings from ALL warnings, not just top 5
  $: errorCount = (warningsData?.warnings || []).filter(w => w.severity === 'error').length;
  $: warningOnlyCount = (warningsData?.warnings || []).filter(w => w.severity === 'warning').length;

  // Calculate health score (more lenient formula)
  $: healthScore = Math.max(0, 100 - (syntaxErrorCount * 10) - Math.min(patternWarningCount, 30) - (testResults.failed * 5));
  $: healthStatus = healthScore >= 90 ? 'Excellent' : healthScore >= 70 ? 'Good' : healthScore >= 50 ? 'Fair' : 'Poor';
  $: healthColor = healthScore >= 90 ? 'var(--success)' : healthScore >= 70 ? 'var(--info)' : healthScore >= 50 ? 'var(--warning)' : 'var(--error)';

  // Fetch all safety data
  async function loadSafetyData() {
    try {
      loading = true;
      error = null;

      // Parallel data fetching
      const [syntaxData, fetchedWarningsData, sessionsData] = await Promise.all([
        fetch('/api/syntax-errors/count').then(r => r.json()).catch(() => ({ count: 0 })),
        fetch('/api/pattern-warnings').then(r => r.json()).catch(() => ({ warnings: [] })),
        fetch('/api/sessions?limit=5').then(r => r.json()).catch(() => ({ sessions: [] }))
      ]);

      syntaxErrorCount = syntaxData.count || 0;

      // Store full warnings data
      warningsData = fetchedWarningsData;
      const warnings = warningsData.warnings || [];
      patternWarningCount = warnings.length;
      criticalWarnings = warnings
        .filter(w => w.severity === 'error' || w.severity === 'warning')
        .slice(0, 5);

      recentSessions = sessionsData.sessions || [];

      // Try to fetch test results (may not exist yet)
      try {
        const testData = await fetch('/api/tests/results').then(r => r.json());
        if (testData.results) {
          testResults.total = testData.results.length;
          testResults.passed = testData.results.filter(t => t.status === 'passed').length;
          testResults.failed = testData.results.filter(t => t.status === 'failed').length;
        }
      } catch (err) {
        // Tests not available yet
      }

      lastUpdated = new Date();
      loading = false;
    } catch (err) {
      logger.error('Failed to load safety data:', err);
      error = err.message;
      loading = false;
    }
  }

  // WebSocket listeners for real-time updates
  let unsubscribers = [];

  onMount(() => {
    console.log('✅ SafetyOverview OPTIMIZED SPACING loaded');
    loadSafetyData();

    // Subscribe to relevant events
    unsubscribers.push(
      websocketService.subscribe('syntax-error', loadSafetyData),
      websocketService.subscribe('pattern-warning', loadSafetyData),
      websocketService.subscribe('test-result', loadSafetyData)
    );
  });

  onDestroy(() => {
    unsubscribers.forEach(unsub => unsub());
  });
</script>

<div class="safety-overview">
  <div class="header">
    <div class="header-content">
      <h1>🛡️ Safety Overview</h1>
      <p class="subtitle">Code health, validation, and quality metrics</p>
    </div>
    <div class="header-actions">
      <span class="last-updated">Updated {Math.floor((new Date() - lastUpdated) / 1000)}s ago</span>
      <button class="refresh-btn" on:click={loadSafetyData} disabled={loading}>
        {loading ? '⏳' : '🔄'} Refresh
      </button>
    </div>
  </div>

  {#if error}
    <div class="error-banner">
      <span>⚠️ Failed to load safety data: {error}</span>
      <button on:click={loadSafetyData}>Retry</button>
    </div>
  {:else if loading}
    <div class="loading-skeleton">
      <div class="skeleton-card"></div>
      <div class="skeleton-card"></div>
      <div class="skeleton-card"></div>
      <div class="skeleton-card"></div>
    </div>
  {:else}
    <!-- Health Score Card -->
    <div class="health-card" style="--health-color: {healthColor}">
      <div class="health-icon">
        {healthScore >= 90 ? '✅' : healthScore >= 70 ? '👍' : healthScore >= 50 ? '⚠️' : '🚨'}
      </div>
      <div class="health-content">
        <div class="health-score">{healthScore}</div>
        <div class="health-status">{healthStatus}</div>
        <div class="health-breakdown">
          <div class="breakdown-item">
            <span class="breakdown-label">Syntax Errors:</span>
            <span class="breakdown-value" class:critical={syntaxErrorCount > 0}>{syntaxErrorCount}</span>
          </div>
          <div class="breakdown-item">
            <span class="breakdown-label">Warnings:</span>
            <span class="breakdown-value" class:warning={patternWarningCount > 5}>{patternWarningCount}</span>
          </div>
          <div class="breakdown-item">
            <span class="breakdown-label">Test Failures:</span>
            <span class="breakdown-value" class:critical={testResults.failed > 0}>{testResults.failed}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Stats Grid -->
    <div class="stats-grid">
      <a href="#safety-syntax" class="stat-card">
        <div class="stat-icon">❌</div>
        <div class="stat-content">
          <div class="stat-value">{syntaxErrorCount}</div>
          <div class="stat-label">Syntax Errors</div>
          <div class="stat-status" class:ok={syntaxErrorCount === 0} class:critical={syntaxErrorCount > 0}>
            {syntaxErrorCount === 0 ? 'All clear' : 'Needs attention'}
          </div>
        </div>
      </a>

      <a href="#safety-patterns" class="stat-card">
        <div class="stat-icon">⚠️</div>
        <div class="stat-content">
          <div class="stat-value">{patternWarningCount}</div>
          <div class="stat-label">Pattern Warnings</div>
          <div class="stat-detail">{errorCount} errors · {warningOnlyCount} warnings</div>
        </div>
      </a>

      <a href="#safety-rollback" class="stat-card">
        <div class="stat-icon">⏮️</div>
        <div class="stat-content">
          <div class="stat-value">{recentSessions.length}</div>
          <div class="stat-label">Recent Sessions</div>
          <div class="stat-detail">Available for rollback</div>
        </div>
      </a>

      <a href="#safety-tests" class="stat-card">
        <div class="stat-icon">🧪</div>
        <div class="stat-content">
          <div class="stat-value">{testResults.total > 0 ? `${testResults.passed}/${testResults.total}` : 'N/A'}</div>
          <div class="stat-label">Tests Passing</div>
          <div class="stat-detail">{testResults.failed > 0 ? `${testResults.failed} failing` : 'All passing'}</div>
        </div>
      </a>
    </div>

    <!-- Critical Issues -->
    {#if criticalWarnings.length > 0}
      <div class="section-card">
        <h2>⚡ Critical Issues</h2>
        <div class="issues-list">
          {#each criticalWarnings as warning}
            <div class="issue-item" class:error={warning.severity === 'error'}>
              <span class="issue-icon">{warning.severity === 'error' ? '🔴' : '🟡'}</span>
              <div class="issue-content">
                <div class="issue-message">{warning.message}</div>
                <div class="issue-meta">{warning.filepath} · Line {warning.line_number || 'N/A'}</div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Quick Actions -->
    <div class="quick-actions">
      <h2>🚀 Quick Actions</h2>
      <div class="actions-grid">
        <a href="#safety-syntax" class="action-card">
          <div class="action-icon">❌</div>
          <div>
            <div class="action-title">Syntax Errors</div>
            <div class="action-description">View and fix syntax issues</div>
          </div>
        </a>

        <a href="#safety-patterns" class="action-card">
          <div class="action-icon">⚠️</div>
          <div>
            <div class="action-title">Pattern Warnings</div>
            <div class="action-description">Code quality checks</div>
          </div>
        </a>

        <a href="#safety-rollback" class="action-card">
          <div class="action-icon">⏮️</div>
          <div>
            <div class="action-title">Session Rollback</div>
            <div class="action-description">Restore previous states</div>
          </div>
        </a>

        <a href="#safety-tests" class="action-card">
          <div class="action-icon">🧪</div>
          <div>
            <div class="action-title">Test Results</div>
            <div class="action-description">View test suite status</div>
          </div>
        </a>
      </div>
    </div>
  {/if}
</div>

<style>
  .safety-overview {
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
    gap: 0.75rem;
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

  /* Health Card - OPTIMIZED */
  .health-card {
    background: linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-tertiary) 100%);
    border: 2px solid var(--health-color);
    border-radius: 8px;
    padding: 0.75rem 1rem;
    margin-bottom: 1rem;
    display: flex;
    gap: 1rem;
    align-items: center;
  }

  .health-icon {
    font-size: 2.5rem;
    flex-shrink: 0;
  }

  .health-content {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 1.5rem;
    flex-wrap: wrap;
  }

  .health-content h2 {
    margin: 0;
    font-size: 0.9rem;
    color: var(--text-secondary);
    font-weight: 500;
  }

  .health-score {
    font-size: 2.5rem;
    font-weight: 700;
    color: var(--health-color);
    line-height: 1;
    margin: 0;
  }

  .health-status {
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--health-color);
    margin: 0;
  }

  .health-breakdown {
    display: flex;
    gap: 1.5rem;
    flex-wrap: wrap;
  }

  .breakdown-item {
    display: inline-flex;
    align-items: baseline;
    gap: 0.4rem;
  }

  .breakdown-label {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .breakdown-value {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .breakdown-value.critical {
    color: var(--error);
  }

  .breakdown-value.warning {
    color: var(--warning);
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
    border-radius: 8px;
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

  .stat-icon {
    font-size: 1.65rem;
    flex-shrink: 0;
    line-height: 1;
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

  .stat-status.critical {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
  }

  /* Section Card */
  .section-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 1.25rem;
    margin-bottom: 1.5rem;
  }

  .section-card h2 {
    margin: 0 0 0.75rem 0;
    font-size: 1.1rem;
    color: var(--text-primary);
  }

  /* Issues List */
  .issues-list {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .issue-item {
    display: flex;
    gap: 0.75rem;
    padding: 0.75rem;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
  }

  .issue-item.error {
    border-left: 3px solid #ef4444;
  }

  .issue-icon {
    font-size: 1.25rem;
    flex-shrink: 0;
  }

  .issue-content {
    flex: 1;
  }

  .issue-message {
    font-weight: 500;
    color: var(--text-primary);
    margin-bottom: 0.2rem;
    font-size: 0.9rem;
  }

  .issue-meta {
    font-size: 0.8rem;
    color: var(--text-secondary);
  }

  /* Quick Actions */
  .quick-actions h2 {
    margin: 0 0 0.75rem 0;
    font-size: 1rem;
    color: var(--text-primary);
  }

  .actions-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
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
    .safety-overview {
      padding: 1rem;
    }

    .header {
      flex-direction: column;
    }

    .health-card {
      flex-direction: column;
      text-align: center;
    }

    .stats-grid,
    .actions-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
