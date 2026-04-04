<script>
  import { logger } from '../logger.js';
  import { projectFilter } from '../projectFilterStore.js';
  /**
   * Project Health Details Page
   * Comprehensive health analysis for a single project
   */
  import { api } from '../apiClient.js';

  let healthData = $state(null);
  let trendsData = $state([]);
  let loading = $state(true);
  let error = $state(null);
  let selectedProject = $derived($projectFilter.currentProject || 'all');
  let selectedDays = $state(7);

  // Derived calculations
  const overallStatus = $derived(healthData?.status || 'unknown');
  const scoreColor = $derived(getScoreColor(healthData?.overall_score || 0));

  function getScoreColor(score) {
    if (score >= 90) return 'var(--success)';
    if (score >= 75) return 'var(--info)';
    if (score >= 60) return 'var(--warning)';
    return 'var(--error)';
  }

  function getStatusEmoji(status) {
    const map = {
      excellent: '',
      good: '',
      fair: '',
      poor: '',
      critical: ''
    };
    return map[status] || '';
  }

  function getSeverityColor(severity) {
    const colors = {
      critical: 'var(--error)',
      high: '#f59e0b',
      medium: 'var(--warning)',
      low: 'var(--info)',
      success: 'var(--success)'
    };
    return colors[severity] || 'var(--muted)';
  }

  async function loadHealthSummary() {
    try {
      loading = true;
      error = null;

      // Load comprehensive health summary
      const summary = await api.get(
        `/health/summary?project=${selectedProject}&days=${selectedDays}`
      );

      healthData = summary.current;
      trendsData = summary.trend?.history || [];
    } catch (err) {
      logger.error('Failed to load health summary:', err);
      error = err.message;
    } finally {
      loading = false;
    }
  }

  async function recalculateHealth() {
    try {
      loading = true;
      await api.post('/health/calculate', { project: selectedProject });
      await loadHealthSummary();
    } catch (err) {
      logger.error('Failed to recalculate health:', err);
      error = err.message;
      loading = false;
    }
  }

  // Load health summary when project or time range changes
  $effect(() => {
    // Track dependencies: selectedProject and selectedDays
    const project = selectedProject;
    const days = selectedDays;
    loadHealthSummary();
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-7xl mx-auto">
    <!-- Header -->
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-xl font-bold text-[var(--text)] mb-2">Project Health</h1>
        <p class="text-base text-[var(--muted)] font-sans">
          Comprehensive health analysis for {selectedProject === 'all'
            ? 'all projects'
            : selectedProject}
        </p>
      </div>

      <div class="flex items-center gap-3">
        <select
          bind:value={selectedDays}
          onchange={loadHealthSummary}
          class="px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded text-sm text-[var(--text)] font-mono cursor-pointer"
        >
          <option value={1}>Last 24 hours</option>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
        </select>

        <button
          class="px-4 py-2 bg-[var(--accent)] text-white rounded text-sm font-semibold hover:opacity-90 transition-opacity"
          onclick={recalculateHealth}
          disabled={loading}
        >
          {loading ? ' Loading...' : ' Refresh'}
        </button>
      </div>
    </div>

    {#if loading && !healthData}
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center">
        <div
          class="w-12 h-12 border-4 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin mx-auto mb-4"
        ></div>
        <p class="text-base text-[var(--muted)] font-sans">Calculating health score...</p>
      </div>
    {:else if error}
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center">
        <p class="text-base text-red-500 mb-2">{error}</p>
        <button
          class="px-4 py-2 bg-[var(--accent)] text-white rounded text-sm font-semibold hover:opacity-90 transition-opacity mt-4"
          onclick={loadHealthSummary}
        >
          Try Again
        </button>
      </div>
    {:else if healthData}
      <!-- Overall Health Score -->
      <div class="bg-[var(--surface)] border-2 border-[var(--border)] rounded-lg p-6 mb-6">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h2 class="text-lg font-semibold text-[var(--text)] mb-1">Overall Health Score</h2>
            <p class="text-sm text-[var(--muted)]">
              {getStatusEmoji(overallStatus)}
              <span class="capitalize">{overallStatus}</span> -{healthData.timestamp
                ? new Date(healthData.timestamp).toLocaleString()
                : 'Unknown time'}
            </p>
          </div>

          <div class="text-right">
            <div class="text-5xl font-bold font-mono mb-2" style="color: {scoreColor}">
              {healthData.overall_score}
            </div>
            <div class="text-sm text-[var(--muted)]">out of 100</div>
          </div>
        </div>

        <!-- Health Bar -->
        <div class="h-3 bg-[var(--bg)] rounded-full overflow-hidden">
          <div
            class="h-full transition-all duration-500"
            style="width: {healthData.overall_score}%; background: {scoreColor}"
          ></div>
        </div>
      </div>

      <!-- Sub-Scores Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <div class="text-sm text-[var(--muted)] mb-2 uppercase tracking-wide">Error Score</div>
          <div class="flex items-baseline gap-2">
            <span class="text-3xl font-bold font-mono text-[var(--text)]">
              {healthData.scores.error_score}
            </span>
            <span class="text-sm text-[var(--muted)]">/100</span>
          </div>
          <div class="h-2 bg-[var(--bg)] rounded-full overflow-hidden mt-3">
            <div
              class="h-full transition-all"
              style="width: {healthData.scores.error_score}%; background: {getScoreColor(
                healthData.scores.error_score
              )}"
            ></div>
          </div>
        </div>

        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <div class="text-sm text-[var(--muted)] mb-2 uppercase tracking-wide">Activity Score</div>
          <div class="flex items-baseline gap-2">
            <span class="text-3xl font-bold font-mono text-[var(--text)]">
              {healthData.scores.activity_score}
            </span>
            <span class="text-sm text-[var(--muted)]">/100</span>
          </div>
          <div class="h-2 bg-[var(--bg)] rounded-full overflow-hidden mt-3">
            <div
              class="h-full transition-all"
              style="width: {healthData.scores.activity_score}%; background: {getScoreColor(
                healthData.scores.activity_score
              )}"
            ></div>
          </div>
        </div>

        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <div class="text-sm text-[var(--muted)] mb-2 uppercase tracking-wide">
            Stability Score
          </div>
          <div class="flex items-baseline gap-2">
            <span class="text-3xl font-bold font-mono text-[var(--text)]">
              {healthData.scores.stability_score}
            </span>
            <span class="text-sm text-[var(--muted)]">/100</span>
          </div>
          <div class="h-2 bg-[var(--bg)] rounded-full overflow-hidden mt-3">
            <div
              class="h-full transition-all"
              style="width: {healthData.scores.stability_score}%; background: {getScoreColor(
                healthData.scores.stability_score
              )}"
            ></div>
          </div>
        </div>

        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <div class="text-sm text-[var(--muted)] mb-2 uppercase tracking-wide">
            Performance Score
          </div>
          <div class="flex items-baseline gap-2">
            <span class="text-3xl font-bold font-mono text-[var(--text)]">
              {healthData.scores.performance_score}
            </span>
            <span class="text-sm text-[var(--muted)]">/100</span>
          </div>
          <div class="h-2 bg-[var(--bg)] rounded-full overflow-hidden mt-3">
            <div
              class="h-full transition-all"
              style="width: {healthData.scores.performance_score}%; background: {getScoreColor(
                healthData.scores.performance_score
              )}"
            ></div>
          </div>
        </div>
      </div>

      <!-- Recommendations -->
      {#if healthData.recommendations && healthData.recommendations.length > 0}
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6 mb-6">
          <h2 class="text-lg font-semibold text-[var(--text)] mb-4">Recommendations</h2>

          <div class="space-y-3">
            {#each healthData.recommendations as rec (rec.title)}
              <div
                class="border-l-4 p-4 rounded bg-[var(--bg)]"
                style="border-color: {getSeverityColor(rec.severity)}"
              >
                <div class="flex items-start justify-between mb-2">
                  <div class="flex-1">
                    <h3 class="font-semibold text-[var(--text)] mb-1">{rec.title}</h3>
                    <p class="text-sm text-[var(--muted)]">{rec.description}</p>
                  </div>
                  <span
                    class="px-2 py-1 rounded text-xs font-semibold uppercase tracking-wide ml-4"
                    style="background: {getSeverityColor(rec.severity)}22; color: {getSeverityColor(
                      rec.severity
                    )}"
                  >
                    {rec.severity}
                  </span>
                </div>
                {#if rec.action}
                  <div class="mt-2 text-sm font-mono text-[var(--accent)]">→ {rec.action}</div>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Health Trends -->
      {#if trendsData.length > 0}
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6 mb-6">
          <h2 class="text-lg font-semibold text-[var(--text)] mb-4">Health Trends</h2>

          <div class="space-y-3">
            {#each trendsData as trend (trend.date)}
              <div class="flex items-center gap-4">
                <div class="text-sm font-mono text-[var(--muted)] w-24">{trend.date}</div>

                <div class="flex-1 flex items-center gap-2">
                  <div class="flex-1 h-8 bg-[var(--bg)] rounded-lg overflow-hidden flex">
                    <div
                      class="h-full flex items-center justify-center text-xs font-semibold text-white"
                      style="width: {trend.error_score}%; background: var(--error)"
                      title="Error Score: {trend.error_score}"
                    >
                      {trend.error_score > 15 ? `E: ${trend.error_score}` : ''}
                    </div>
                    <div
                      class="h-full flex items-center justify-center text-xs font-semibold text-white"
                      style="width: {trend.activity_score}%; background: var(--info)"
                      title="Activity Score: {trend.activity_score}"
                    >
                      {trend.activity_score > 15 ? `A: ${trend.activity_score}` : ''}
                    </div>
                    <div
                      class="h-full flex items-center justify-center text-xs font-semibold text-white"
                      style="width: {trend.stability_score}%; background: var(--warning)"
                      title="Stability Score: {trend.stability_score}"
                    >
                      {trend.stability_score > 15 ? `S: ${trend.stability_score}` : ''}
                    </div>
                    <div
                      class="h-full flex items-center justify-center text-xs font-semibold text-white"
                      style="width: {trend.performance_score}%; background: var(--success)"
                      title="Performance Score: {trend.performance_score}"
                    >
                      {trend.performance_score > 15 ? `P: ${trend.performance_score}` : ''}
                    </div>
                  </div>

                  <div
                    class="text-lg font-bold font-mono w-16 text-right"
                    style="color: {getScoreColor(trend.overall_score)}"
                  >
                    {trend.overall_score}
                  </div>
                </div>
              </div>
            {/each}
          </div>

          <div class="mt-4 pt-4 border-t border-[var(--border)] flex items-center gap-4 text-xs">
            <span class="flex items-center gap-2">
              <span class="w-3 h-3 rounded" style="background: var(--error)"></span>
              Error
            </span>
            <span class="flex items-center gap-2">
              <span class="w-3 h-3 rounded" style="background: var(--info)"></span>
              Activity
            </span>
            <span class="flex items-center gap-2">
              <span class="w-3 h-3 rounded" style="background: var(--warning)"></span>
              Stability
            </span>
            <span class="flex items-center gap-2">
              <span class="w-3 h-3 rounded" style="background: var(--success)"></span>
              Performance
            </span>
          </div>
        </div>
      {/if}

      <!-- Detailed Metrics -->
      {#if healthData.metrics}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- Errors Breakdown -->
          {#if healthData.metrics.errors_by_severity}
            <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
              <h3 class="text-base font-semibold text-[var(--text)] mb-4">Errors by Severity</h3>
              <div class="space-y-2">
                {#each healthData.metrics.errors_by_severity as err (err.severity)}
                  <div class="flex items-center justify-between">
                    <span class="text-sm capitalize text-[var(--muted)]">{err.severity}</span>
                    <span class="text-base font-mono font-semibold text-[var(--text)]">
                      {err.count}
                    </span>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          <!-- File Activity -->
          {#if healthData.metrics.file_activity}
            <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
              <h3 class="text-base font-semibold text-[var(--text)] mb-4">File Activity</h3>
              <div class="space-y-2">
                {#each healthData.metrics.file_activity as activity (activity.change_type)}
                  <div class="flex items-center justify-between">
                    <span class="text-sm capitalize text-[var(--muted)]"
                      >{activity.change_type}</span
                    >
                    <span class="text-base font-mono font-semibold text-[var(--text)]">
                      {activity.count}
                    </span>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          <!-- Agent Interactions -->
          {#if healthData.metrics.agent_interactions}
            <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
              <h3 class="text-base font-semibold text-[var(--text)] mb-4">Agent Interactions</h3>
              <div class="space-y-3">
                <div class="flex items-center justify-between">
                  <span class="text-sm text-[var(--muted)]">Total</span>
                  <span class="text-base font-mono font-semibold text-[var(--text)]">
                    {healthData.metrics.agent_interactions.total || 0}
                  </span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-sm text-[var(--muted)]">Successful</span>
                  <span class="text-base font-mono font-semibold text-green-500">
                    {healthData.metrics.agent_interactions.successful || 0}
                  </span>
                </div>
              </div>
            </div>
          {/if}

          <!-- Syntax Errors -->
          <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
            <h3 class="text-base font-semibold text-[var(--text)] mb-4">Active Syntax Errors</h3>
            <div class="text-center">
              <div
                class="text-4xl font-bold font-mono"
                class:text-red-500={healthData.metrics.active_syntax_errors > 0}
                class:text-green-500={healthData.metrics.active_syntax_errors === 0}
              >
                {healthData.metrics.active_syntax_errors || 0}
              </div>
              <div class="text-sm text-[var(--muted)] mt-2">
                {healthData.metrics.active_syntax_errors === 0
                  ? 'No issues detected'
                  : 'Needs attention'}
              </div>
            </div>
          </div>
        </div>
      {/if}
    {/if}
  </div>
</div>
