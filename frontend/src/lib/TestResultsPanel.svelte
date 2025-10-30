<script>
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';
  import { notifications } from './notificationService.js';
  import { desktopNotifications } from './services/desktopNotifications.js';
  import { logger } from './logger.js';
  import { formatNumber } from './numberFormat.js';
  import { formatDateTime } from './timeFormat.js';

  let results = [];
  let latestResult = null;
  let frameworks = [];
  let loading = true;
  let running = false;
  let ws = null;
  let wsProgress = null;
  let wsOutput = null;
  let expandedTests = false;
  let allTests = [];
  let testsLoading = false;

  // Progress tracking
  let testProgress = {
    status: null,
    message: '',
    currentFile: '',
    completedSuites: 0,
    totalSuites: 0,
    progress: 0
  };

  // Terminal output
  let terminalOutput = '';

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

  // Clear all test results
  async function clearAllResults() {
    if (!confirm('Are you sure you want to clear all past test results? This cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch('/api/tests/results', {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to clear results');

      const data = await response.json();
      notifications.success(data.message || 'All test results cleared');
      await fetchResults();
    } catch (error) {
      logger.error('Failed to clear test results:', error);
      notifications.error('Failed to clear test results');
    }
  }

  // Run tests
  async function runTests(framework = null) {
    if (running) return;

    // If no framework specified, use the first detected one
    const selectedFramework = framework || (frameworks.length > 0 ? frameworks[0] : null);

    if (!selectedFramework) {
      notifications.error('No test framework detected');
      return;
    }

    try {
      running = true;
      notifications.info('Running tests...', { title: 'Test Runner' });

      const response = await fetch('/api/tests/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ framework: selectedFramework })
      });

      if (!response.ok) throw new Error('Failed to run tests');

      const result = await response.json();
      running = false;

      // Check if all tests passed (failed count is 0)
      const allPassed = result.failed === 0 && result.total > 0;

      if (allPassed) {
        notifications.success(`All ${formatNumber(result.total)} tests passed!`, {
          title: 'Test Runner'
        });
      } else if (result.total === 0) {
        notifications.warning('No tests were found', {
          title: 'Test Runner'
        });
      } else {
        const passRate = Math.round((result.passed / result.total) * 100);
        notifications.error(`${formatNumber(result.failed)} of ${formatNumber(result.total)} tests failed (${passRate}% passed)`, {
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
      running = false;

      // Show desktop notification for failures
      if (!data.passed) {
        desktopNotifications.show({
          title: 'Tests Failed!',
          body: `${formatNumber(data.failedTests)}/${formatNumber(data.totalTests)} tests failed`,
          severity: 'critical',
          requireInteraction: true
        });
      }
    });

    // Subscribe to test progress updates
    wsProgress = websocketService.subscribe('test-progress', (data) => {
      logger.info('Test progress received:', data);
      testProgress = data;

      if (data.status === 'starting' || data.status === 'running') {
        running = true;
        if (data.status === 'starting') {
          terminalOutput = ''; // Clear output for new run
        }
      } else if (data.status === 'completed') {
        running = false;
        // Keep terminal output visible after completion
      }
    });

    // Subscribe to test output stream
    wsOutput = websocketService.subscribe('test-output', (data) => {
      terminalOutput += data.output;
      // Auto-scroll to bottom
      setTimeout(() => {
        const terminal = document.querySelector('.terminal-output');
        if (terminal) {
          terminal.scrollTop = terminal.scrollHeight;
        }
      }, 10);
    });
  }

  onMount(() => {
    fetchFrameworks();
    fetchResults();
    setupWebSocket();
  });

  onDestroy(() => {
    if (ws) ws();
    if (wsProgress) wsProgress();
    if (wsOutput) wsOutput();
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

  // Toggle test details view
  async function toggleTestDetails(timestamp) {
    if (testsLoading) return;

    // If already expanded, collapse it
    if (expandedTests) {
      expandedTests = false;
      allTests = [];
      return;
    }

    try {
      testsLoading = true;
      expandedTests = true;

      const response = await fetch(`/api/tests/details/${encodeURIComponent(timestamp)}`);
      if (!response.ok) throw new Error('Failed to fetch test details');

      const data = await response.json();
      allTests = data.tests;
      testsLoading = false;
    } catch (error) {
      logger.error('Failed to fetch test details:', error);
      notifications.error('Failed to load test details');
      testsLoading = false;
      expandedTests = false;
    }
  }

  // Copy failed tests to clipboard
  async function copyFailedTests(timestamp) {
    try {
      const response = await fetch(`/api/tests/details/${encodeURIComponent(timestamp)}`);
      if (!response.ok) throw new Error('Failed to fetch test details');

      const data = await response.json();
      const failures = data.tests.filter(t => t.status === 'failed');

      // Format for easy pasting to AI
      let text = `# Test Failures (${failures.length} failures)\n\n`;

      let currentFile = '';
      for (const test of failures) {
        if (test.test_file !== currentFile) {
          currentFile = test.test_file;
          text += `\n## ${currentFile}\n\n`;
        }

        text += `### ${test.test_name}\n`;
        if (test.error_message) {
          text += `**Error:** ${test.error_message}\n`;
        }
        text += '\n';
      }

      text += `\n---\nGenerated from Raven test results at ${formatDateTime(timestamp)}`;

      await navigator.clipboard.writeText(text);
      notifications.success(`Copied ${failures.length} failed test${failures.length === 1 ? '' : 's'} to clipboard`, {
        title: 'Copied!'
      });
    } catch (error) {
      logger.error('Failed to copy failures:', error);
      notifications.error('Failed to copy to clipboard');
    }
  }

  // Download CSV export
  function downloadCSV(timestamp) {
    window.open(`/api/tests/export/${encodeURIComponent(timestamp)}`, '_blank');
  }
</script>

<div class="test-results-panel" role="region" aria-label="Test results panel">
  <div class="panel-header">
    <div class="header-top">
      <h2 id="test-results-heading">Self-Diagnosis <span class="self-diagnosis-badge">Raven Internal Tests</span></h2>
      <div class="header-actions" role="toolbar" aria-label="Test actions">
        {#if frameworks.length > 0}
          <button class="run-btn" on:click={() => runTests()} disabled={running} aria-label={running ? 'Running tests' : 'Run tests'}>
            <span aria-hidden="true">{running ? '⏳' : '▶️'}</span> Run Tests
          </button>
        {/if}
        {#if results.length > 0}
          <button class="clear-btn" on:click={clearAllResults} aria-label="Clear all test results" title="Clear All Results">
            <span aria-hidden="true">🗑️</span> Clear All
          </button>
        {/if}
        <button class="refresh-btn" on:click={fetchResults} aria-label="Refresh test results">
          <span aria-hidden="true">↻</span>
        </button>
      </div>
    </div>
    <p class="panel-description">
      These are Raven's own internal tests that verify Raven itself is working correctly. This does NOT test your other projects - those have their own test suites.
    </p>
  </div>

  <!-- Test Terminal Output -->
  {#if running}
    <div class="test-runner-container" role="status" aria-live="polite">
      <div class="progress-text">
        {#if testProgress.completedSuites > 0 && testProgress.totalSuites > 0}
          Tests running... {testProgress.completedSuites}/{testProgress.totalSuites} suites
        {:else}
          Tests running...
        {/if}
      </div>
      <div class="terminal-output">
        <pre>{terminalOutput || 'Waiting for output...'}</pre>
      </div>
    </div>
  {/if}

  <!-- Frameworks Info -->
  {#if frameworks.length > 0}
    <div class="frameworks-section" role="region" aria-labelledby="frameworks-heading">
      <h3 id="frameworks-heading">🔍 What's Being Tested: Raven's Own Codebase</h3>
      <div class="test-info">
        <div class="info-row">
          <span class="label">Target Project:</span>
          <span class="value">Raven itself (backend & services)</span>
        </div>
        <div class="info-row">
          <span class="label">Test Framework:</span>
          <span class="value">{frameworks[0] === 'jest' ? 'Jest (JavaScript testing framework)' : frameworks[0]}</span>
        </div>
        <div class="info-row">
          <span class="label">Test Files:</span>
          <span class="value">Raven's __tests__/ directory</span>
        </div>
        <div class="info-note">
          <span class="note-icon">ℹ️</span>
          <span class="note-text">These tests verify that Raven is functioning properly. Your other monitored projects are not affected.</span>
        </div>
      </div>
    </div>
  {:else if !loading}
    <div class="no-frameworks" role="status">
      <span class="icon" aria-hidden="true">🔍</span>
      <p>No automated tests detected in this project</p>
      <p class="hint">Supported frameworks: Jest, Pytest, Mocha, Vitest, Go Test</p>
      <p class="hint">Add tests to your project to enable automatic testing</p>
    </div>
  {/if}

  <!-- Latest Result Card -->
  {#if latestResult}
    <div class="latest-result" style="--status-color: {getStatusColor(latestResult.passed)}" role="region" aria-labelledby="latest-result-heading">
      <div class="result-header">
        <span class="result-status" aria-hidden="true">{latestResult.passed ? '✅' : '❌'}</span>
        <div class="result-info">
          <h3 id="latest-result-heading">
            {#if latestResult.passed}
              All Tests Passed
            {:else}
              {formatNumber(latestResult.failed_tests)} Test{latestResult.failed_tests === 1 ? '' : 's'} Need Attention
            {/if}
          </h3>
          <p class="result-framework">
            {formatNumber(latestResult.total_tests)} total test{latestResult.total_tests === 1 ? '' : 's'} in {latestResult.framework}
          </p>
        </div>
        <div class="result-stats" role="group" aria-label="Test results breakdown">
          <div class="stat passed" role="status">{formatNumber(latestResult.passed_tests)} passed</div>
          <div class="stat failed" role="status">{formatNumber(latestResult.failed_tests)} failed</div>
          <div class="stat skipped" role="status">{formatNumber(latestResult.skipped_tests)} skipped</div>
        </div>
      </div>
      <div class="result-meta">
        <span class="duration">Completed in {formatDuration(latestResult.duration)}</span>
        <time class="timestamp" datetime="{latestResult.timestamp}">{formatDateTime(latestResult.timestamp)}</time>
      </div>
      <div class="result-actions">
        <button class="action-btn view-details" on:click={() => toggleTestDetails(latestResult.timestamp)}>
          <span aria-hidden="true">{expandedTests ? '▼' : '▶'}</span> {expandedTests ? 'Hide' : 'View'} All {formatNumber(latestResult.total_tests)} Test{latestResult.total_tests === 1 ? '' : 's'}
        </button>
        {#if !latestResult.passed}
          <button class="action-btn copy-failures" on:click={() => copyFailedTests(latestResult.timestamp)}>
            <span aria-hidden="true">📋</span> Copy {formatNumber(latestResult.failed_tests)} Failure{latestResult.failed_tests === 1 ? '' : 's'}
          </button>
        {/if}
        <button class="action-btn download-csv" on:click={() => downloadCSV(latestResult.timestamp)}>
          <span aria-hidden="true">📄</span> Download CSV
        </button>
      </div>

      <!-- Expanded Test Details -->
      {#if expandedTests}
        <div class="test-details-expanded">
          {#if testsLoading}
            <div class="loading-inline">Loading test details...</div>
          {:else if allTests.length === 0}
            <div class="empty-inline">No tests found</div>
          {:else}
            <div class="tests-list">
              {#each allTests as test}
                <div class="test-item" class:failed={test.status === 'failed'} class:passed={test.status === 'passed'} class:skipped={test.status === 'skipped'}>
                  <div class="test-status-icon">
                    {#if test.status === 'passed'}✅
                    {:else if test.status === 'failed'}❌
                    {:else}⊘{/if}
                  </div>
                  <div class="test-content">
                    <div class="test-header-row">
                      <span class="test-file">{test.test_file || 'Unknown'}</span>
                      <span class="test-status-badge {test.status}">{test.status}</span>
                    </div>
                    <div class="test-name">{test.test_name}</div>
                    {#if test.error_message}
                      <div class="test-error">{test.error_message}</div>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Results History -->
  {#if loading}
    <div class="loading" role="status" aria-live="polite">
      <div class="spinner" aria-hidden="true"></div>
      <p>Loading test results...</p>
    </div>
  {:else if results.length === 0 && frameworks.length > 0}
    <div class="empty-state" role="status">
      <div class="empty-icon" aria-hidden="true">🩺</div>
      <h3>No Self-Diagnosis Yet</h3>
      <p>Click "Run Tests" above to execute your automated tests</p>
      <p class="hint">Tests will verify your code is working correctly and catch potential bugs</p>
    </div>
  {:else if results.length > 0}
    <div class="results-history" role="region" aria-labelledby="test-history-heading">
      <h3 id="test-history-heading">Test History</h3>
      <div class="results-list" role="list" aria-label="Past test results">
        {#each results as result (result)}
          <article class="result-item" style="--status-color: {getStatusColor(result.passed)}" role="listitem">
            <div class="result-status-icon" aria-hidden="true">{result.passed ? '✅' : '❌'}</div>
            <div class="result-details">
              <div class="result-row">
                <span class="framework-name">
                  {#if result.passed}
                    All tests passed
                  {:else}
                    {formatNumber(result.failed_tests)} test{result.failed_tests === 1 ? '' : 's'} failed
                  {/if}
                </span>
                <span class="result-count" role="status">
                  {formatNumber(result.passed_tests)}/{formatNumber(result.total_tests)}
                </span>
              </div>
              <div class="result-row meta">
                <time class="timestamp" datetime="{result.timestamp}">{formatDateTime(result.timestamp)}</time>
                <span class="duration">{formatDuration(result.duration)}</span>
              </div>
            </div>
          </article>
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
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .self-diagnosis-badge {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 4px 10px;
    background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
    color: white;
    border-radius: 4px;
    box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2);
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

  .clear-btn {
    padding: 8px 16px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .clear-btn:hover {
    background: #ef4444;
    border-color: #dc2626;
    color: white;
    transform: translateY(-1px);
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

  .test-info {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .info-row {
    display: flex;
    gap: 8px;
    align-items: baseline;
  }

  .info-row .label {
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
    min-width: 120px;
  }

  .info-row .value {
    font-family: var(--mono);
    font-size: 13px;
    color: var(--text);
  }

  .info-note {
    margin-top: 8px;
    padding: 10px 12px;
    background: rgba(59, 130, 246, 0.1);
    border: 1px solid rgba(59, 130, 246, 0.2);
    border-radius: 4px;
    display: flex;
    gap: 8px;
    align-items: flex-start;
  }

  .note-icon {
    font-size: 16px;
    line-height: 1;
  }

  .note-text {
    font-size: 12px;
    color: var(--text);
    line-height: 1.5;
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

  .no-frameworks .hint,
  .empty-state .hint {
    font-size: 12px;
    margin-top: 8px;
    color: var(--muted);
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

  .result-actions {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--border);
    display: flex;
    gap: 8px;
  }

  .action-btn {
    padding: 8px 16px;
    background: var(--surface-3);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
    font-family: var(--mono);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .action-btn:hover {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }

  /* Expanded Test Details */
  .test-details-expanded {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
  }

  .loading-inline,
  .empty-inline {
    padding: 20px;
    text-align: center;
    color: var(--muted);
    font-size: 13px;
  }

  .tests-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 600px;
    overflow-y: auto;
  }

  .test-item {
    display: flex;
    gap: 12px;
    padding: 12px;
    background: var(--surface-3);
    border: 1px solid var(--border);
    border-radius: 4px;
    transition: all 0.2s;
  }

  .test-item.failed {
    border-left: 3px solid #ef4444;
    background: rgba(239, 68, 68, 0.05);
  }

  .test-item.passed {
    border-left: 3px solid #10b981;
  }

  .test-item.skipped {
    border-left: 3px solid #9ca3af;
    opacity: 0.7;
  }

  .test-status-icon {
    font-size: 18px;
    line-height: 1;
  }

  .test-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .test-header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .test-file {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--muted);
    background: var(--surface);
    padding: 2px 6px;
    border-radius: 3px;
  }

  .test-status-badge {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    padding: 2px 6px;
    border-radius: 3px;
    letter-spacing: 0.5px;
  }

  .test-status-badge.passed {
    background: #d1fae5;
    color: #065f46;
  }

  .test-status-badge.failed {
    background: #fee2e2;
    color: #991b1b;
  }

  .test-status-badge.skipped {
    background: #e5e7eb;
    color: #374151;
  }

  .test-name {
    font-weight: 600;
    font-size: 13px;
    color: var(--text);
    line-height: 1.4;
  }

  .test-error {
    font-family: var(--mono);
    font-size: 12px;
    color: #ef4444;
    background: var(--surface);
    padding: 8px;
    border-radius: 4px;
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.5;
  }

  /* Test Runner Container */
  .test-runner-container {
    background: var(--surface-2);
    border: 2px solid #3b82f6;
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 20px;
    animation: pulse-border 2s ease-in-out infinite;
  }

  @keyframes pulse-border {
    0%, 100% { border-color: #3b82f6; }
    50% { border-color: #60a5fa; }
  }

  .terminal-output {
    background: #000000 !important;
    background-color: #000000 !important;
    color: #00ff00;
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    font-size: 13px;
    line-height: 1.4;
    padding: 16px;
    border-radius: 6px;
    max-height: 250px;
    overflow-y: auto;
    margin-top: 12px;
    border: 2px solid #00ff00;
    box-shadow: 0 0 10px rgba(0, 255, 0, 0.2);
  }

  .terminal-output pre {
    margin: 0;
    white-space: pre-wrap;
    word-wrap: break-word;
    font-family: inherit;
    background: transparent;
    color: inherit;
  }

  /* Terminal scrollbar styling */
  .terminal-output::-webkit-scrollbar {
    width: 10px;
  }

  .terminal-output::-webkit-scrollbar-track {
    background: #0a0a0a;
  }

  .terminal-output::-webkit-scrollbar-thumb {
    background: #00ff00;
    border-radius: 5px;
  }

  .terminal-output::-webkit-scrollbar-thumb:hover {
    background: #00cc00;
  }

  .progress-text {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
    margin-bottom: 8px;
    font-family: var(--mono);
  }

</style>
