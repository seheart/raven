<script>
  import { logger } from '../logger.js';
  import { api } from '../apiClient.js';
  /**
   * Risk Correlation Page
   * Analyze correlations between code changes and potential risks
   */

  // State
  let rollbackStats = $state(null);
  let highRiskFiles = $state([]);
  let recentRollbacks = $state([]);
  let loading = $state(true);
  let error = $state(null);
  let lastUpdated = $state(new Date());

  // Derived values
  const timeSinceUpdate = $derived.by(() => {
    return Math.floor((new Date() - lastUpdated) / 1000);
  });

  const totalRollbacks = $derived(rollbackStats?.total_rollbacks || 0);
  const autoRollbacks = $derived(rollbackStats?.automatic_rollbacks || 0);
  const avgFilesAffected = $derived.by(() => {
    const avg = rollbackStats?.avg_files_affected;
    return avg ? Math.round(avg) : 0;
  });

  // Format date
  function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleString();
  }

  // Load risk data
  async function loadRiskData() {
    try {
      loading = true;
      error = null;

      const [statsData, filesData, rollbacksData] = await Promise.all([
        api.get('/risk/rollback-stats'),
        api.get('/risk/high-risk-files?limit=10'),
        api.get('/risk/recent-rollbacks?limit=10')
      ]);

      rollbackStats = statsData;
      highRiskFiles = filesData.files || [];
      recentRollbacks = rollbacksData.rollbacks || [];

      lastUpdated = new Date();
      loading = false;
    } catch (error) {
      logger.error('Failed to load risk data:', error);
      errorMessage = error.message;
      loading = false;
    }
  }

  // Load on mount
  $effect(() => {
    loadRiskData();
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-7xl mx-auto">
    <!-- Header -->
    <div class="flex justify-between items-start mb-6">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">Risk Correlation</h1>
        <p class="text-base text-[var(--muted)] font-sans">
          Predictive risk scoring • Rollback tracking • Pattern learning
        </p>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-sm text-[var(--muted)] font-sans">Updated {timeSinceUpdate}s ago</span>
        <button
          onclick={loadRiskData}
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
        <span class="text-sm text-[var(--error)] font-sans">Failed to load risk data: {error}</span>
        <button
          onclick={loadRiskData}
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
            <div
              class="h-24 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-pulse"
            ></div>
          {/each}
        </div>
        <div
          class="h-96 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-pulse"
        ></div>
      </div>
    {:else}
      <!-- Stats Overview -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <div class="text-base text-[var(--muted)] font-sans mb-1">Total Rollbacks</div>
          <div class="text-3xl font-bold text-[var(--text-heading)]">{totalRollbacks}</div>
        </div>
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <div class="text-base text-[var(--muted)] font-sans mb-1">Automatic</div>
          <div class="text-3xl font-bold text-[var(--accent)]">{autoRollbacks}</div>
        </div>
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <div class="text-base text-[var(--muted)] font-sans mb-1">Avg Files</div>
          <div class="text-3xl font-bold text-[var(--text-heading)]">{avgFilesAffected}</div>
        </div>
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <div class="text-base text-[var(--muted)] font-sans mb-1">High Risk</div>
          <div class="text-3xl font-bold text-[var(--error)]">{highRiskFiles.length}</div>
        </div>
      </div>

      <!-- High Risk Files -->
      <div class="mb-6">
        <h2 class="text-xl font-semibold text-[var(--text-heading)] mb-4 font-sans">
          High-Risk Files (Most Rollbacks)
        </h2>
        {#if highRiskFiles.length === 0}
          <div
            class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center"
          >
            <div class="text-5xl mb-4">✅</div>
            <div class="text-xl font-semibold text-[var(--text-heading)] mb-2 font-sans">
              No high-risk files detected
            </div>
            <div class="text-base text-[var(--muted)] font-sans">
              System is learning from rollback patterns
            </div>
          </div>
        {:else}
          <div class="space-y-3">
            {#each highRiskFiles as file (file.filepath)}
              <div
                class="bg-[var(--surface)] border border-[var(--border)] border-l-4 border-l-[var(--error)] rounded-lg p-4 hover:translate-x-1 transition-transform"
              >
                <div class="flex items-center gap-4">
                  <div class="text-2xl">🔴</div>
                  <div class="flex-1">
                    <div class="text-base font-mono font-semibold text-[var(--text)] mb-1">
                      {file.filepath}
                    </div>
                    <div class="text-sm text-[var(--muted)] font-sans">
                      Last rollback: {formatDate(file.last_rollback)}
                    </div>
                  </div>
                  <div class="text-center px-4 py-2 bg-[var(--bg)] rounded-lg">
                    <div class="text-2xl font-bold text-[var(--error)] font-mono">
                      {file.rollback_count}
                    </div>
                    <div class="text-xs text-[var(--muted)] uppercase">rollbacks</div>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Recent Rollbacks -->
      <div class="mb-6">
        <h2 class="text-xl font-semibold text-[var(--text-heading)] mb-4 font-sans">
          Recent Rollbacks
        </h2>
        {#if recentRollbacks.length === 0}
          <div
            class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center"
          >
            <div class="text-5xl mb-4">📋</div>
            <div class="text-xl font-semibold text-[var(--text-heading)] mb-2 font-sans">
              No rollbacks recorded yet
            </div>
            <div class="text-base text-[var(--muted)] font-sans">
              The system will learn risk patterns from rollback history
            </div>
          </div>
        {:else}
          <div class="space-y-3">
            {#each recentRollbacks as rollback (rollback.id || rollback.timestamp)}
              <div
                class="bg-[var(--surface)] border border-[var(--border)] border-l-4 border-l-[var(--warning)] rounded-lg p-4 hover:translate-x-1 transition-transform"
              >
                <div class="flex items-center gap-4">
                  <div class="text-2xl">{rollback.automatic ? '🤖' : '👤'}</div>
                  <div class="flex-1">
                    <div class="text-base font-mono font-semibold text-[var(--text)] mb-1">
                      {rollback.filepath}
                    </div>
                    <div class="flex gap-2 flex-wrap text-sm text-[var(--muted)] font-sans">
                      <time datetime={rollback.timestamp}>{formatDate(rollback.timestamp)}</time>
                      {#if rollback.change_type}
                        <span class="px-2 py-0.5 bg-[var(--bg)] rounded font-mono">
                          {rollback.change_type}
                        </span>
                      {/if}
                      {#if rollback.agent}
                        <span class="px-2 py-0.5 bg-[var(--bg)] rounded font-mono">
                          🤖 {rollback.agent}
                        </span>
                      {/if}
                    </div>
                  </div>
                  <div
                    class="px-3 py-1 bg-[var(--bg)] rounded text-sm font-mono text-[var(--muted)]"
                  >
                    {rollback.rollback_type || 'manual'}
                  </div>
                </div>
                {#if rollback.reason}
                  <div
                    class="mt-3 px-3 py-2 bg-[var(--bg)] rounded text-sm text-[var(--text)] font-sans"
                  >
                    Reason: {rollback.reason}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- How It Works -->
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
        <h3 class="text-lg font-semibold text-[var(--text-heading)] mb-4 font-sans">
          How Risk Correlation Works
        </h3>
        <ul class="space-y-2 text-base text-[var(--muted)] font-sans">
          <li class="flex gap-2">
            <span class="text-[var(--text)]">•</span>
            <span
              ><strong class="text-[var(--text)]">Pattern Learning:</strong> Analyzes last 30 days of
              rollback history</span
            >
          </li>
          <li class="flex gap-2">
            <span class="text-[var(--text)]">•</span>
            <span
              ><strong class="text-[var(--text)]">File Risk:</strong> Tracks which files fail most often</span
            >
          </li>
          <li class="flex gap-2">
            <span class="text-[var(--text)]">•</span>
            <span
              ><strong class="text-[var(--text)]">Agent Risk:</strong> Identifies which agents have higher
              failure rates</span
            >
          </li>
          <li class="flex gap-2">
            <span class="text-[var(--text)]">•</span>
            <span
              ><strong class="text-[var(--text)]">Predictive Scoring:</strong> Calculates risk score
              for every change (0-100)</span
            >
          </li>
          <li class="flex gap-2">
            <span class="text-[var(--text)]">•</span>
            <span
              ><strong class="text-[var(--text)]">Real-time Alerts:</strong> Warns you before high-risk
              changes are made</span
            >
          </li>
        </ul>
      </div>
    {/if}
  </div>
</div>
