<script>
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';
  import { notifications } from './notificationService.js';
  import { desktopNotifications } from './services/desktopNotifications.js';
  import { logger } from './logger.js';

  let results = [];
  let latestResult = null;
  let frameworks = [];
  let loading = true;
  let running = false;
  let ws = null;

  // Fetch test frameworks
  async function fetchFrameworks() {
    try {
      const response = await fetch('/api/tests/frameworks');
      if (!response.ok) throw new Error('Failed to fetch frameworks');

      const data = await response.json();
      frameworks = data.frameworks;
    } catch (error) {
      logger.error('Failed to fetch frameworks:', error);
    }
  }

  // Fetch test results
  async function fetchResults() {
    try {
      loading = true;
      const response = await fetch('/api/tests/results?limit=20');
      if (!response.ok) throw new Error('Failed to fetch results');

      const data = await response.json();
      results = data.results;

      // Get latest result
      if (results.length > 0) {
        latestResult = results[0];
      }

      loading = false;
    } catch (error) {
      logger.error('Failed to fetch test results:', error);
      notifications.error('Failed to load test results');
      loading = false;
    }
  }

  // Run tests
  async function runTests(framework = null) {
    if (running) return;

    try {
      running = true;
      notifications.info('Running tests...', { title: 'Test Runner' });

      const response = await fetch('/api/tests/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ framework })
      });

      if (!response.ok) throw new Error('Failed to run tests');

      const result = await response.json();
      running = false;

      if (result.passed) {
        notifications.success(`Tests passed: ${result.passedTests}/${result.totalTests}`, {
          title: 'Test Runner'
        });
      } else {
        notifications.error(`Tests failed: ${result.failedTests}/${result.totalTests} failed`, {
          title: 'Test Runner',
          duration: 10000
        });
      }

      await fetchResults();
    } catch (error) {
      logger.error('Failed to run tests:', error);
      notifications.error('Failed to run tests');
      running = false;
    }
  }

  // Setup WebSocket for real-time updates
  function setupWebSocket() {
    ws = websocketService.subscribe('test-result', (data) => {
      logger.info('Test result received:', data);
      fetchResults();

      // Show desktop notification for failures
      if (!data.passed) {
        desktopNotifications.show({
          title: 'Tests Failed!',
          body: `${data.failedTests}/${data.totalTests} tests failed`,
          severity: 'critical',
          requireInteraction: true
        });
      }
    });
  }

  onMount(() => {
    fetchFrameworks();
    fetchResults();
    setupWebSocket();
  });

  onDestroy(() => {
    if (ws) ws();
  });

  // Format duration
  function formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    const seconds = (ms / 1000).toFixed(2);
    return `${seconds}s`;
  }

  // Get status badge color
  function getStatusColor(passed) {
    return passed ? '#10b981' : '#ef4444';
  }
</script>

<div class="test-results-panel">
  <div class="panel-header">
    <div class="header-top">
      <h2>Test Results</h2>
      <div class="header-actions">
        {#if frameworks.length > 0}
          <button class="run-btn" on:click={() => runTests()} disabled={running} title="Run tests">
            {running ? '⏳' : '▶️'} Run Tests
          </button>
        {/if}
        <button class="refresh-btn" on:click={fetchResults} title="Refresh">↻</button>
      </div>
    </div>
    <p class="panel-description">
      Automatic test running and results tracking
    </p>
  </div>

  <!-- Frameworks Info -->
  {#if frameworks.length > 0}
    <div class="frameworks-section">
      <h3>Detected Frameworks</h3>
      <div class="frameworks-list">
        {#each frameworks as framework}
          <div class="framework-badge">
            🧪 {framework.name}
          </div>
        {/each}
      </div>
    </div>
  {:else if !loading}
    <div class="no-frameworks">
      <span class="icon">🔍</span>
      <p>No test frameworks detected in this project</p>
      <p class="hint">Supported: Jest, Pytest, Mocha, Vitest, Go Test</p>
    </div>
  {/if}

  <!-- Latest Result Card -->
  {#if latestResult}
    <div class="latest-result" style="--status-color: {getStatusColor(latestResult.passed)}">
      <div class="result-header">
        <span class="result-status">{latestResult.passed ? '✅' : '❌'}</span>
        <div class="result-info">
          <h3>{latestResult.passed ? 'Tests Passed' : 'Tests Failed'}</h3>
          <p class="result-framework">{latestResult.framework}</p>
        </div>
        <div class="result-stats">
          <div class="stat passed">{latestResult.passed_tests} passed</div>
          <div class="stat failed">{latestResult.failed_tests} failed</div>
          <div class="stat skipped">{latestResult.skipped_tests} skipped</div>
        </div>
      </div>
      <div class="result-meta">
        <span class="duration">{formatDuration(latestResult.duration)}</span>
        <span class="timestamp">{new Date(latestResult.timestamp).toLocaleString()}</span>
      </div>
    </div>
  {/if}

  <!-- Results History -->
  {#if loading}
    <div class="loading">
      <div class="spinner"></div>
      <p>Loading test results...</p>
    </div>
  {:else if results.length === 0 && frameworks.length > 0}
    <div class="empty-state">
      <div class="empty-icon">🧪</div>
      <h3>No Test Results Yet</h3>
      <p>Run tests to see results here</p>
    </div>
  {:else if results.length > 0}
    <div class="results-history">
      <h3>Test History</h3>
      <div class="results-list">
        {#each results as result}
          <div class="result-item" style="--status-color: {getStatusColor(result.passed)}">
            <div class="result-status-icon">{result.passed ? '✅' : '❌'}</div>
            <div class="result-details">
              <div class="result-row">
                <span class="framework-name">{result.framework}</span>
                <span class="result-count">
                  {result.passed_tests}/{result.total_tests} passed
                </span>
              </div>
              <div class="result-row meta">
                <span class="timestamp">{new Date(result.timestamp).toLocaleString()}</span>
                <span class="duration">{formatDuration(result.duration)}</span>
              </div>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .test-results-panel {
    background: var(--surface);
    border-radius: var(--radius);
    padding: 20px;
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .panel-header {
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border);
  }

  .header-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .panel-header h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    color: var(--text);
  }

  .header-actions {
    display: flex;
    gap: 8px;
  }

  .run-btn {
    padding: 8px 16px;
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    border: 1px solid #047857;
    border-radius: 6px;
    color: white;
    font-family: var(--mono);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .run-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
  }

  .run-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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

  .panel-description {
    margin: 0;
    font-size: 13px;
    color: var(--muted);
    line-height: 1.5;
  }

  .frameworks-section h3,
  .results-history h3 {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
    margin: 0 0 12px 0;
  }

  .frameworks-list {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .framework-badge {
    padding: 6px 12px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }

  .no-frameworks {
    text-align: center;
    padding: 40px 20px;
    color: var(--muted);
  }

  .no-frameworks .icon {
    font-size: 48px;
    display: block;
    margin-bottom: 12px;
  }

  .no-frameworks .hint {
    font-size: 12px;
    margin-top: 8px;
  }

  .latest-result {
    padding: 20px;
    background: var(--surface-2);
    border: 2px solid var(--status-color);
    border-radius: 8px;
  }

  .result-header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 12px;
  }

  .result-status {
    font-size: 32px;
  }

  .result-info h3 {
    margin: 0 0 4px 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--text);
  }

  .result-framework {
    margin: 0;
    font-size: 12px;
    color: var(--muted);
  }

  .result-stats {
    display: flex;
    gap: 12px;
    margin-left: auto;
  }

  .stat {
    padding: 4px 12px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
  }

  .stat.passed {
    background: #d1fae5;
    color: #065f46;
  }

  .stat.failed {
    background: #fee2e2;
    color: #991b1b;
  }

  .stat.skipped {
    background: #e5e7eb;
    color: #374151;
  }

  .result-meta {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: var(--muted);
  }

  .loading, .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    gap: 16px;
    text-align: center;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .empty-icon {
    font-size: 64px;
  }

  .empty-state h3 {
    margin: 0 0 8px 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--text);
  }

  .empty-state p {
    margin: 0;
    font-size: 14px;
    color: var(--muted);
  }

  .results-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .result-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: var(--surface-2);
    border-left: 3px solid var(--status-color);
    border-radius: 4px;
  }

  .result-status-icon {
    font-size: 20px;
  }

  .result-details {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .result-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .framework-name {
    font-weight: 600;
    color: var(--text);
    font-size: 13px;
  }

  .result-count {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--text);
  }

  .result-row.meta {
    font-size: 11px;
    color: var(--muted);
  }

  .duration {
    font-family: var(--mono);
  }
</style>
