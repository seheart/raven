<script>
  import { onMount } from 'svelte';
  import { logger } from '../logger.js';
  import { projectFilter } from '../projectFilterStore.js';
  /**
   * Project Health Details Page
   * Comprehensive health analysis for a single project
   */
  import { api } from '../apiClient.js';

  let healthData = $state(null);
  let projectsData = $state([]);
  let loading = $state(false);
  let error = $state(null);
  let selectedProject = $derived($projectFilter.currentProject || 'all');
  let selectedDays = $state(7);

  // Derived: aggregate from projects data
  const overallScore = $derived.by(() => {
    if (!projectsData.length) return 0;
    const avg =
      projectsData.reduce((sum, p) => sum + (p.health_score || 0), 0) / projectsData.length;
    return Math.round(avg);
  });
  const totalErrors = $derived(projectsData.reduce((sum, p) => sum + (p.error_count || 0), 0));
  const totalEvents = $derived(projectsData.reduce((sum, p) => sum + (p.total_events || 0), 0));
  const recentEvents = $derived(projectsData.reduce((sum, p) => sum + (p.recent_events || 0), 0));
  const overallStatus = $derived.by(() => {
    if (overallScore >= 90) return 'excellent';
    if (overallScore >= 75) return 'good';
    if (overallScore >= 60) return 'fair';
    if (overallScore >= 40) return 'poor';
    return 'critical';
  });
  const scoreColor = $derived(getScoreColor(overallScore));

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

      const response = await api.get(
        `/health/projects?project=${selectedProject}&days=${selectedDays}`
      );

      projectsData = response.projects || [];
      // Build a healthData shape from the projects for the template
      healthData = {
        overall_score: overallScore,
        status: overallStatus
      };
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

  // Load on mount; reload when project or time range changes
  onMount(() => {
    loadHealthSummary();
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-6xl mx-auto">
    <!-- Header -->
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">Project Health</h1>
        <p class="text-sm text-[var(--muted)] font-sans">
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
        <p class="text-sm text-[var(--muted)] font-sans">Calculating health score...</p>
      </div>
    {:else if error}
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center">
        <p class="text-sm text-[var(--error)] mb-2">{error}</p>
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
            <h2 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-1">
              Overall Health Score
            </h2>
            <p class="text-sm text-[var(--muted)]">
              {getStatusEmoji(overallStatus)}
              <span class="capitalize">{overallStatus}</span> - {projectsData.length} project{projectsData.length !==
              1
                ? 's'
                : ''}
            </p>
          </div>

          <div class="text-right">
            <div class="text-5xl font-bold font-mono mb-2" style="color: {scoreColor}">
              {overallScore}
            </div>
            <div class="text-sm text-[var(--muted)]">out of 100</div>
          </div>
        </div>

        <!-- Health Bar -->
        <div class="h-3 bg-[var(--bg)] rounded-full overflow-hidden">
          <div
            class="h-full transition-all duration-500"
            style="width: {overallScore}%; background: {scoreColor}"
          ></div>
        </div>
      </div>

      <!-- Summary Stats Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <div class="text-sm text-[var(--muted)] mb-2 uppercase tracking-wide">Total Events</div>
          <div class="flex items-baseline gap-2">
            <span class="text-3xl font-bold font-mono text-[var(--text)]">
              {totalEvents.toLocaleString()}
            </span>
          </div>
        </div>

        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <div class="text-sm text-[var(--muted)] mb-2 uppercase tracking-wide">Recent Events</div>
          <div class="flex items-baseline gap-2">
            <span class="text-3xl font-bold font-mono text-[var(--text)]">
              {recentEvents.toLocaleString()}
            </span>
          </div>
        </div>

        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <div class="text-sm text-[var(--muted)] mb-2 uppercase tracking-wide">Total Errors</div>
          <div class="flex items-baseline gap-2">
            <span
              class="text-3xl font-bold font-mono"
              style="color: {totalErrors > 0 ? 'var(--error)' : 'var(--success)'}"
            >
              {totalErrors.toLocaleString()}
            </span>
          </div>
        </div>

        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <div class="text-sm text-[var(--muted)] mb-2 uppercase tracking-wide">Projects</div>
          <div class="flex items-baseline gap-2">
            <span class="text-3xl font-bold font-mono text-[var(--text)]">
              {projectsData.length}
            </span>
          </div>
        </div>
      </div>

      <!-- Per-Project Health -->
      {#if projectsData.length > 0}
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
          <h2 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-4">
            Project Health
          </h2>

          <div class="space-y-3">
            {#each projectsData as project (project.project_name)}
              <div class="flex items-center gap-4">
                <div
                  class="text-sm font-mono text-[var(--accent)] w-40 truncate"
                  title={project.project_name}
                >
                  {project.project_name}
                </div>

                <div class="flex-1 flex items-center gap-2">
                  <div class="flex-1 h-6 bg-[var(--bg)] rounded-full overflow-hidden">
                    <div
                      class="h-full transition-all rounded-full"
                      style="width: {project.health_score || 0}%; background: {getScoreColor(
                        project.health_score || 0
                      )}"
                    ></div>
                  </div>

                  <div
                    class="text-lg font-bold font-mono w-12 text-right"
                    style="color: {getScoreColor(project.health_score || 0)}"
                  >
                    {project.health_score || 0}
                  </div>
                </div>

                <div class="text-xs font-mono text-[var(--muted)] w-20 text-right">
                  {project.error_count || 0} errors
                </div>

                <span
                  class="px-2 py-1 rounded text-xs font-semibold uppercase tracking-wide"
                  style="background: {getSeverityColor(
                    project.status === 'healthy'
                      ? 'success'
                      : project.status === 'warning'
                        ? 'medium'
                        : 'critical'
                  )}22; color: {getSeverityColor(
                    project.status === 'healthy'
                      ? 'success'
                      : project.status === 'warning'
                        ? 'medium'
                        : 'critical'
                  )}"
                >
                  {project.status}
                </span>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    {/if}
  </div>
</div>
