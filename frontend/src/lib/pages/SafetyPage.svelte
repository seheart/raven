<script>
  import { logger } from '../logger.js';
  import { api } from '../apiClient.js';
  /**
   * Safety Overview Page
   * Modern dashboard for code health, validation, and quality metrics
   */

  import { navigate } from '../utils/router.svelte.js';

  // State
  let syntaxErrorCount = $state(0);
  let patternWarningCount = $state(0);
  let testResults = $state({ total: 0, passed: 0, failed: 0 });
  let recentSessions = $state([]);
  let criticalWarnings = $state([]);
  let warningsData = $state({ warnings: [] });
  let loading = $state(true);
  let error = $state(null);
  let lastUpdated = $state(new Date());

  // Derived values
  const errorCount = $derived(
    (warningsData?.warnings || []).filter(w => w.severity === 'error').length
  );
  const warningOnlyCount = $derived(
    (warningsData?.warnings || []).filter(w => w.severity === 'warning').length
  );

  // Health score calculation (more lenient formula)
  const healthScore = $derived(
    Math.max(
      0,
      100 - syntaxErrorCount * 10 - Math.min(patternWarningCount, 30) - testResults.failed * 5
    )
  );
  const healthStatus = $derived(
    healthScore >= 90
      ? 'Excellent'
      : healthScore >= 70
        ? 'Good'
        : healthScore >= 50
          ? 'Fair'
          : 'Poor'
  );
  const healthColor = $derived(
    healthScore >= 90
      ? 'var(--success)'
      : healthScore >= 70
        ? 'var(--info)'
        : healthScore >= 50
          ? 'var(--warning)'
          : 'var(--error)'
  );
  const healthIcon = $derived(
    healthScore >= 90 ? '✅' : healthScore >= 70 ? '👍' : healthScore >= 50 ? '⚠️' : '🚨'
  );

  // Time since last update
  const timeSinceUpdate = $derived.by(() => {
    return Math.floor((new Date() - lastUpdated) / 1000);
  });

  // Load all safety data
  async function loadSafetyData() {
    try {
      loading = true;
      error = null;

      // Parallel data fetching
      const [syntaxData, fetchedWarningsData, sessionsData] = await Promise.all([
        api.get('/syntax-errors/count').catch(() => ({ count: 0 })),
        api.get('/pattern-warnings').catch(() => ({ warnings: [] })),
        api.get('/sessions?limit=5').catch(() => ({ sessions: [] }))
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
        const testData = await api.get('/tests/results');
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

  // Load on mount
  $effect(() => {
    loadSafetyData();
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-7xl mx-auto">
    <!-- Header -->
    <div class="flex justify-between items-start mb-6">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">🛡️ Safety Overview</h1>
        <p class="text-base text-[var(--muted)] font-sans">
          Code health, validation, and quality metrics
        </p>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-sm text-[var(--muted)] font-sans">Updated {timeSinceUpdate}s ago</span>
        <button
          onclick={loadSafetyData}
          disabled={loading}
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors disabled:opacity-50"
        >
          {loading ? '⏳' : '🔄'} Refresh
        </button>
      </div>
    </div>

    {#if error}
      <div
        class="bg-[var(--error-subtle)] border border-[var(--error)] rounded-lg p-4 mb-6 flex justify-between items-center"
      >
        <span class="text-base text-[var(--error)] font-sans"
          >⚠️ Failed to load safety data: {error}</span
        >
        <button
          onclick={loadSafetyData}
          class="px-3 py-1.5 bg-[var(--error)] text-white rounded text-sm font-sans"
        >
          Retry
        </button>
      </div>
    {:else if loading}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {#each Array(4) as _, i (i)}
          <div
            class="h-32 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-pulse"
          ></div>
        {/each}
      </div>
    {:else}
      <!-- Health Score Card -->
      <div
        class="bg-gradient-to-br from-[var(--surface)] to-[var(--surface-2)] border-2 rounded-lg p-5 mb-6 flex items-center gap-5"
        style="border-color: {healthColor}"
      >
        <div class="text-5xl flex-shrink-0">{healthIcon}</div>
        <div class="flex-1 flex items-center gap-6 flex-wrap">
          <div>
            <div class="text-4xl font-bold leading-none mb-1" style="color: {healthColor}">
              {healthScore}
            </div>
            <div class="text-base font-semibold" style="color: {healthColor}">{healthStatus}</div>
          </div>
          <div class="flex gap-6 flex-wrap">
            <div class="flex items-baseline gap-2">
              <span class="text-sm text-[var(--muted)] font-sans">Syntax Errors:</span>
              <span
                class="text-xl font-bold"
                class:text-[var(--error)]={syntaxErrorCount > 0}
                class:text-[var(--text)]={syntaxErrorCount === 0}
              >
                {syntaxErrorCount}
              </span>
            </div>
            <div class="flex items-baseline gap-2">
              <span class="text-sm text-[var(--muted)] font-sans">Warnings:</span>
              <span
                class="text-xl font-bold"
                class:text-[var(--warning)]={patternWarningCount > 5}
                class:text-[var(--text)]={patternWarningCount <= 5}
              >
                {patternWarningCount}
              </span>
            </div>
            <div class="flex items-baseline gap-2">
              <span class="text-sm text-[var(--muted)] font-sans">Test Failures:</span>
              <span
                class="text-xl font-bold"
                class:text-[var(--error)]={testResults.failed > 0}
                class:text-[var(--text)]={testResults.failed === 0}
              >
                {testResults.failed}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Stats Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <button
          onclick={() => navigate('/safety/syntax')}
          class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex items-center gap-4 hover:border-[var(--accent)] transition-all hover:-translate-y-0.5 text-left"
        >
          <div class="text-3xl flex-shrink-0">❌</div>
          <div class="flex-1">
            <div class="text-2xl font-bold text-[var(--text-heading)] leading-none mb-1">
              {syntaxErrorCount}
            </div>
            <div class="text-sm text-[var(--muted)] font-sans mb-2">Syntax Errors</div>
            <div
              class="text-xs px-2 py-0.5 rounded font-semibold inline-block"
              class:bg-[var(--success-subtle)]={syntaxErrorCount === 0}
              class:text-[var(--success)]={syntaxErrorCount === 0}
              class:bg-[var(--error-subtle)]={syntaxErrorCount > 0}
              class:text-[var(--error)]={syntaxErrorCount > 0}
            >
              {syntaxErrorCount === 0 ? 'ALL CLEAR' : 'NEEDS ATTENTION'}
            </div>
          </div>
        </button>

        <button
          onclick={() => navigate('/safety/patterns')}
          class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex items-center gap-4 hover:border-[var(--accent)] transition-all hover:-translate-y-0.5 text-left"
        >
          <div class="text-3xl flex-shrink-0">⚠️</div>
          <div class="flex-1">
            <div class="text-2xl font-bold text-[var(--text-heading)] leading-none mb-1">
              {patternWarningCount}
            </div>
            <div class="text-sm text-[var(--muted)] font-sans mb-1">Pattern Warnings</div>
            <div class="text-xs text-[var(--muted)] font-sans">
              {errorCount} errors · {warningOnlyCount} warnings
            </div>
          </div>
        </button>

        <button
          onclick={() => navigate('/safety/rollback')}
          class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex items-center gap-4 hover:border-[var(--accent)] transition-all hover:-translate-y-0.5 text-left"
        >
          <div class="text-3xl flex-shrink-0">⏮️</div>
          <div class="flex-1">
            <div class="text-2xl font-bold text-[var(--text-heading)] leading-none mb-1">
              {recentSessions.length}
            </div>
            <div class="text-sm text-[var(--muted)] font-sans mb-1">Recent Sessions</div>
            <div class="text-xs text-[var(--muted)] font-sans">Available for rollback</div>
          </div>
        </button>

        <button
          onclick={() => navigate('/safety/tests')}
          class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex items-center gap-4 hover:border-[var(--accent)] transition-all hover:-translate-y-0.5 text-left"
        >
          <div class="text-3xl flex-shrink-0">🧪</div>
          <div class="flex-1">
            <div class="text-2xl font-bold text-[var(--text-heading)] leading-none mb-1">
              {testResults.total > 0 ? `${testResults.passed}/${testResults.total}` : 'N/A'}
            </div>
            <div class="text-sm text-[var(--muted)] font-sans mb-1">Tests Passing</div>
            <div class="text-xs text-[var(--muted)] font-sans">
              {testResults.failed > 0 ? `${testResults.failed} failing` : 'All passing'}
            </div>
          </div>
        </button>
      </div>

      <!-- Critical Issues -->
      {#if criticalWarnings.length > 0}
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 mb-6">
          <h2 class="text-xl font-semibold text-[var(--text-heading)] mb-4 font-sans">
            ⚡ Critical Issues
          </h2>
          <div class="space-y-3">
            {#each criticalWarnings as warning (warning.id || warning.message)}
              <div
                class="flex items-start gap-3 p-3 bg-[var(--bg)] rounded border"
                class:border-l-4={warning.severity === 'error'}
                class:border-[var(--error)]={warning.severity === 'error'}
                class:border-[var(--border)]={warning.severity !== 'error'}
              >
                <span class="text-xl flex-shrink-0"
                  >{warning.severity === 'error' ? '🔴' : '🟡'}</span
                >
                <div class="flex-1">
                  <div class="text-base font-medium text-[var(--text)] mb-1 font-sans">
                    {warning.message}
                  </div>
                  <div class="text-sm text-[var(--muted)] font-mono">
                    {warning.filepath} · Line {warning.line_number || 'N/A'}
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Quick Actions -->
      <div>
        <h2 class="text-xl font-semibold text-[var(--text-heading)] mb-4 font-sans">
          🚀 Quick Actions
        </h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            onclick={() => navigate('/safety/syntax')}
            class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 flex items-center gap-3 hover:border-[var(--accent)] transition-all hover:-translate-y-0.5 text-left"
          >
            <div class="text-2xl flex-shrink-0">❌</div>
            <div>
              <div class="text-base font-semibold text-[var(--text-heading)] font-sans">
                Syntax Errors
              </div>
              <div class="text-sm text-[var(--muted)] font-sans">View and fix syntax issues</div>
            </div>
          </button>

          <button
            onclick={() => navigate('/safety/patterns')}
            class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 flex items-center gap-3 hover:border-[var(--accent)] transition-all hover:-translate-y-0.5 text-left"
          >
            <div class="text-2xl flex-shrink-0">⚠️</div>
            <div>
              <div class="text-base font-semibold text-[var(--text-heading)] font-sans">
                Pattern Warnings
              </div>
              <div class="text-sm text-[var(--muted)] font-sans">Code quality checks</div>
            </div>
          </button>

          <button
            onclick={() => navigate('/safety/rollback')}
            class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 flex items-center gap-3 hover:border-[var(--accent)] transition-all hover:-translate-y-0.5 text-left"
          >
            <div class="text-2xl flex-shrink-0">⏮️</div>
            <div>
              <div class="text-base font-semibold text-[var(--text-heading)] font-sans">
                Session Rollback
              </div>
              <div class="text-sm text-[var(--muted)] font-sans">Restore previous states</div>
            </div>
          </button>

          <button
            onclick={() => navigate('/safety/tests')}
            class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 flex items-center gap-3 hover:border-[var(--accent)] transition-all hover:-translate-y-0.5 text-left"
          >
            <div class="text-2xl flex-shrink-0">🧪</div>
            <div>
              <div class="text-base font-semibold text-[var(--text-heading)] font-sans">
                Test Results
              </div>
              <div class="text-sm text-[var(--muted)] font-sans">View test suite status</div>
            </div>
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>
