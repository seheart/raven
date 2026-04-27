<script>
  import { onMount, onDestroy } from 'svelte';
  import { logger } from '../logger.js';
  import { projectFilter } from '../projectFilterStore.js';
  import { PageLayout, PageHeader } from '../components/layout/index.js';
  import { RefreshButton, ToolbarButton, EmptyState, LoadingState } from '../components/ui/index.js';
  /**
   * Project Health Details Page
   * Comprehensive health analysis for a single project
   */
  import { createPageApi } from '../apiClient.js';
  const { api, abort: abortRequests } = createPageApi();

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

  function getSeverityColor(severity) {
    const colors = {
      critical: 'var(--error)',
      high: 'var(--warning)',
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

      // Normalize field names
      projectsData = (response.projects || []).map(p => ({
        ...p,
        project_name: p.project_name || p.name,
        total_events: p.total_events || p.recent_events || 0
      }));
      healthData = { overall_score: overallScore, status: overallStatus };
    } catch (err) {
      logger.error('Failed to load health summary:', err);
      error = err.message;
    } finally {
      loading = false;
    }
  }

  // Load on mount; reload when project or time range changes
  onMount(() => {
    loadHealthSummary();
  });

  onDestroy(() => abortRequests());
</script>

<PageLayout>
  <PageHeader
    title="Project Health"
    description="Health analysis for {selectedProject === 'all' ? 'all projects' : selectedProject}"
  >
    {#snippet actions()}
      <div class="flex items-center gap-3">
        <select
          bind:value={selectedDays}
          onchange={loadHealthSummary}
          class="px-3 py-1.5 bg-canvas border border-border rounded text-sm font-mono text-body cursor-pointer"
        >
          <option value={1}>Last 24 hours</option>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
        </select>
        <RefreshButton onClick={loadHealthSummary} loading={loading} />
      </div>
    {/snippet}
  </PageHeader>

    {#if loading && !healthData}
      <LoadingState message="Calculating health score..." />
    {:else if error}
      <EmptyState title={error}>
        {#snippet actions()}
          <ToolbarButton onClick={loadHealthSummary}>Try Again</ToolbarButton>
        {/snippet}
      </EmptyState>
    {:else if healthData}
      <!-- Overall Health Score -->
      <div class="bg-surface border border-border rounded-lg p-5 mb-6">
        <div class="flex items-center justify-between mb-3">
          <div>
            <h3 class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
              Overall Health Score
            </h3>
            <p class="text-sm text-muted">
              <span class="capitalize">{overallStatus}</span> — {projectsData.length} project{projectsData.length !==
              1
                ? 's'
                : ''}
            </p>
          </div>
          <div class="flex items-center gap-3">
            <div class="text-2xl font-bold font-mono" style="color: {scoreColor}">
              {overallScore}
            </div>
            <div class="text-xs text-muted">/ 100</div>
          </div>
        </div>
        <div class="h-2 bg-canvas rounded overflow-hidden">
          <div
            class="h-full transition-all duration-500"
            style="width: {overallScore}%; background: {scoreColor}"
          ></div>
        </div>
      </div>

      <!-- Summary Stats Grid -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-surface border border-border rounded p-4">
          <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
            Total Events
          </div>
          <div class="text-sm font-mono text-body">{totalEvents.toLocaleString()}</div>
        </div>
        <div class="bg-surface border border-border rounded p-4">
          <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
            Recent Events
          </div>
          <div class="text-sm font-mono text-body">{recentEvents.toLocaleString()}</div>
        </div>
        <div class="bg-surface border border-border rounded p-4">
          <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
            Total Errors
          </div>
          <div class="flex items-center gap-2">
            <span
              class="w-2 h-2 rounded-full {totalErrors > 0
                ? 'bg-error'
                : 'bg-success'}"
            ></span>
            <span class="text-sm font-mono text-body">{totalErrors.toLocaleString()}</span>
          </div>
        </div>
        <div class="bg-surface border border-border rounded p-4">
          <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
            Projects
          </div>
          <div class="text-sm font-mono text-body">{projectsData.length}</div>
        </div>
      </div>

      <!-- Per-Project Health -->
      {#if projectsData.length > 0}
        <div class="bg-surface border border-border rounded-lg p-6">
          <h3 class="text-xs font-semibold text-muted uppercase tracking-wide mb-4">
            Per-Project Health
          </h3>

          <div class="space-y-3">
            {#each projectsData as project (project.project_name)}
              <div
                class="flex items-center gap-4 p-3 bg-canvas border border-border rounded"
              >
                <div
                  class="text-sm font-mono text-body w-32 truncate"
                  title={project.project_name}
                >
                  {project.project_name}
                </div>

                <div class="flex-1 flex items-center gap-3">
                  <div class="flex-1 h-2 bg-surface rounded overflow-hidden">
                    <div
                      class="h-full transition-all"
                      style="width: {project.health_score || 0}%; background: {getScoreColor(
                        project.health_score || 0
                      )}"
                    ></div>
                  </div>
                  <span
                    class="text-sm font-mono w-8 text-right"
                    style="color: {getScoreColor(project.health_score || 0)}"
                  >
                    {project.health_score || 0}
                  </span>
                </div>

                <div class="text-xs font-mono text-muted w-20 text-right">
                  {project.error_count || 0} errors
                </div>

                <span class="flex items-center gap-1.5 text-xs font-mono">
                  <span
                    class="w-2 h-2 rounded-full"
                    style="background: {getSeverityColor(
                      project.status === 'active'
                        ? 'success'
                        : project.status === 'recent'
                          ? 'low'
                          : 'medium'
                    )}"
                  ></span>
                  <span class="text-body">{project.status}</span>
                </span>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    {/if}
</PageLayout>
