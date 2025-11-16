<script>
  import { logger } from '../logger.js';
  import { api } from '../apiClient.js';
  /**
   * Raven Tests Page
   * Display and manage test results
   */

  // State
  let testResults = $state([]);
  let loading = $state(true);
  let error = $state(null);
  let lastUpdated = $state(new Date());
  let searchQuery = $state('');
  let statusFilter = $state('all');
  let running = $state(false);

  // Derived values
  const filteredTests = $derived.by(() => {
    let filtered = testResults;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((test) =>
        test.name?.toLowerCase().includes(query)
      );
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((test) => test.status === statusFilter);
    }

    return filtered;
  });

  const testStats = $derived.by(() => {
    const total = testResults.length;
    const passed = testResults.filter((t) => t.status === 'passed').length;
    const failed = testResults.filter((t) => t.status === 'failed').length;
    const skipped = testResults.filter((t) => t.status === 'skipped').length;
    const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;

    return { total, passed, failed, skipped, passRate };
  });

  const totalDuration = $derived.by(() => {
    const total = testResults.reduce((sum, test) => sum + (test.duration || 0), 0);
    return (total / 1000).toFixed(2); // Convert to seconds
  });

  // Time since last update
  const timeSinceUpdate = $derived.by(() => {
    return Math.floor((new Date - lastUpdated) / 1000);
  });

  // Format duration
  function formatDuration(ms) {
    if (!ms && ms !== 0) return 'N/A';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }

  // Load test results data
  async function loadTests() {
    try {
      loading = true;
      error = null;

      const data = await api.get('/tests/results');
      testResults = data.results || [];

      lastUpdated = new Date();
      loading = false;
    } catch (err) {
      logger.error('Failed to load test results:', err);
      error = err.message;
      loading = false;
    }
  }

  // Run tests
  async function runTests() {
    if (running) return;

    try {
      running = true;
      error = null;

      const result = await api.post('/tests/run');
      running = false;

      // Reload results after tests complete
      await loadTests();
    } catch (err) {
      logger.error('Failed to run tests:', err);
      error = err.message;
      running = false;
    }
  }

  // Export to CSV
  function exportToCSV() {
    const headers = ['Test Name', 'Status', 'Duration (ms)', 'Error Message'];
    const rows = filteredTests.map((test) => [
      test.name || '',
      test.status || '',
      test.duration || '',
      test.error_message || ''
    ]);

    const csv = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-results-${new Date().toISOString().split('T')[0]}.csv`;
    a.click;
    URL.revokeObjectURL(url);
  }

  // Export to JSON
  function exportToJSON() {
    const json = JSON.stringify(filteredTests, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-results-${new Date().toISOString().split('T')[0]}.json`;
    a.click;
    URL.revokeObjectURL(url);
  }

  // Load on mount
  $effect(() => {
    loadTests();
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-7xl mx-auto">
    <!-- Header -->
    <div class="flex justify-between items-start mb-6">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">Test Results</h1>
        <p class="text-base text-[var(--muted)] font-sans">
          View test suite results and status
        </p>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-sm text-[var(--muted)] font-sans">Updated {timeSinceUpdate}s ago</span>
        <button
          onclick={runTests}
          disabled={running || loading}
          class="px-3 py-1.5 bg-[var(--accent)] text-white rounded text-sm font-sans hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {running ? 'Running...' : 'Run Tests'}
        </button>
        <button
          onclick={loadTests}
          disabled={loading}
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>
    </div>

    {#if error}
      <div
        class="bg-[var(--error-subtle)] border border-[var(--error)] rounded-lg p-4 mb-6 flex justify-between items-center"
      >
        <span class="text-sm text-[var(--error)] font-sans">Failed to load test results: {error}</span>
        <button
          onclick={loadTests}
          class="px-3 py-1.5 bg-[var(--error)] text-white rounded text-sm font-sans"
        >
          Retry
        </button>
      </div>
    {:else if loading}
      <!-- Loading skeleton -->
      <div class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          {#each Array(4) as _, i (i)}
            <div class="h-24 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-pulse"></div>
          {/each}
        </div>
        <div class="h-96 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-pulse"></div>
      </div>
    {:else}
      <!-- Stats Cards -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <div class="text-base text-[var(--muted)] font-sans mb-1">Total Tests</div>
          <div class="text-3xl font-bold text-[var(--text-heading)]">{testStats.total}</div>
        </div>
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <div class="text-base text-[var(--muted)] font-sans mb-1">Passed</div>
          <div class="text-3xl font-bold text-[var(--success)]">{testStats.passed}</div>
        </div>
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <div class="text-base text-[var(--muted)] font-sans mb-1">Failed</div>
          <div class="text-3xl font-bold text-[var(--error)]">{testStats.failed}</div>
        </div>
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <div class="text-base text-[var(--muted)] font-sans mb-1">Pass Rate</div>
          <div
            class="text-3xl font-bold"
            class:text-[var(--success)]={testStats.passRate >= 80}
            class:text-[var(--warning)]={testStats.passRate >= 50 && testStats.passRate < 80}
            class:text-[var(--error)]={testStats.passRate < 50}
          >
            {testStats.passRate}%
          </div>
        </div>
      </div>

      <!-- Summary Card -->
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 mb-6">
        <div class="flex items-center justify-between">
          <div>
            <div class="text-base text-[var(--muted)] font-sans mb-1">Test Suite Summary</div>
            <div class="text-xl font-semibold text-[var(--text-heading)] font-sans">
              {testStats.passed} of {testStats.total} tests passing
              {#if testStats.skipped > 0}
                <span class="text-base text-[var(--muted)]">
                  ({testStats.skipped} skipped)
                </span>
              {/if}
            </div>
          </div>
          <div class="text-right">
            <div class="text-base text-[var(--muted)] font-sans mb-1">Total Duration</div>
            <div class="text-xl font-semibold text-[var(--text-heading)] font-mono">
              {totalDuration}s
            </div>
          </div>
        </div>
      </div>

      <!-- Filters and Actions -->
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 mb-4">
        <div class="flex flex-wrap gap-4 items-center">
          <!-- Search -->
          <div class="flex-1 min-w-[200px]">
            <input
              type="text"
              bind:value={searchQuery}
              placeholder="Search by test name..."
              class="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-base font-sans text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          <!-- Status Filter -->
          <select
            bind:value={statusFilter}
            class="px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-base font-sans text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
          >
            <option value="all">All Tests</option>
            <option value="passed">Passed Only</option>
            <option value="failed">Failed Only</option>
            <option value="skipped">Skipped Only</option>
          </select>

          <!-- Export Buttons -->
          <button
            onclick={exportToCSV}
            disabled={filteredTests.length === 0}
            class="px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors disabled:opacity-50"
          >
            Export CSV
          </button>
          <button
            onclick={exportToJSON}
            disabled={filteredTests.length === 0}
            class="px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors disabled:opacity-50"
          >
            Export JSON
          </button>
        </div>
      </div>

      <!-- Test Results Table -->
      {#if filteredTests.length === 0}
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center">
          <div class="text-5xl mb-4">🧪</div>
          <div class="text-xl font-semibold text-[var(--text-heading)] mb-2 font-sans">
            {searchQuery || statusFilter !== 'all' ? 'No matching tests' : 'No tests available'}
          </div>
          <div class="text-base text-[var(--muted)] font-sans">
            {searchQuery || statusFilter !== 'all'
              ? 'Try adjusting your filters'
              : 'Run your test suite to see results here'}
          </div>
        </div>
      {:else}
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="bg-[var(--surface-2)] border-b border-[var(--border)]">
                <tr>
                  <th class="px-4 py-3 text-left text-sm font-semibold text-[var(--muted)] font-sans"
                    >Status</th
                  >
                  <th class="px-4 py-3 text-left text-sm font-semibold text-[var(--muted)] font-sans"
                    >Test Name</th
                  >
                  <th class="px-4 py-3 text-left text-sm font-semibold text-[var(--muted)] font-sans"
                    >Duration</th
                  >
                  <th class="px-4 py-3 text-left text-sm font-semibold text-[var(--muted)] font-sans"
                    >Error Message</th
                  >
                </tr>
              </thead>
              <tbody class="divide-y divide-[var(--border)]">
                {#each filteredTests as test (test.name)}
                  <tr class="hover:bg-[var(--surface-2)] transition-colors">
                    <td class="px-4 py-3">
                      <span
                        class="text-xs px-2 py-1 rounded font-semibold"
                        class:bg-[var(--success-subtle)]={test.status === 'passed'}
                        class:text-[var(--success)]={test.status === 'passed'}
                        class:bg-[var(--error-subtle)]={test.status === 'failed'}
                        class:text-[var(--error)]={test.status === 'failed'}
                        class:bg-[var(--warning-subtle)]={test.status === 'skipped'}
                        class:text-[var(--warning)]={test.status === 'skipped'}
                      >
                        {test.status?.toUpperCase() || 'UNKNOWN'}
                      </span>
                    </td>
                    <td class="px-4 py-3 text-base font-mono text-[var(--text)] max-w-md">
                      {test.name || 'Unnamed test'}
                    </td>
                    <td class="px-4 py-3 text-base font-mono text-[var(--text)]">
                      {formatDuration(test.duration)}
                    </td>
                    <td class="px-4 py-3 text-base text-[var(--text)] font-sans max-w-md">
                      {#if test.error_message}
                        <div class="text-[var(--error)] font-mono text-xs">
                          {test.error_message}
                        </div>
                      {:else}
                        <span class="text-[var(--muted)]">-</span>
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Results Count -->
        <div class="mt-4 text-base text-[var(--muted)] font-sans text-center">
          Showing {filteredTests.length} of {testResults.length} tests
        </div>
      {/if}
    {/if}
  </div>
</div>
