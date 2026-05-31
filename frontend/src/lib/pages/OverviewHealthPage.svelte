<script>
  import { onMount, onDestroy } from 'svelte';
  import { logger } from '../logger.js';
  import { projectFilter } from '../projectFilterStore.js';
  import { PageLayout, PageHeader, StatusBar } from '../components/layout/index.js';
  import { RefreshButton, LoadingState, DataFetchError } from '../components/ui/index.js';
  import FreshnessBadge from '../components/ui/FreshnessBadge.svelte';
  /**
   * Project Health Details Page
   * Comprehensive health analysis for a single project
   */
  import { createPageApi } from '../apiClient.js';
  const { api, abort: abortRequests } = createPageApi();

  let loaded = $state(false);
  let projectsData = $state([]);
  let loading = $state(false);
  let error = $state(null);
  let lastUpdated = $state(null);
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

  // Returns a CSS var — used only for the dynamic health-bar fill where the
  // color is set via inline style (Tailwind can't express a runtime width
  // + color pair).
  function getScoreColor(score) {
    if (score >= 90) return 'var(--success)';
    if (score >= 75) return 'var(--info)';
    if (score >= 60) return 'var(--warning)';
    return 'var(--error)';
  }

  // Utility-class variants for static text/dots — keeps semantic colors out
  // of inline styles (matches SystemPage's methodTextClass pattern).
  function getScoreTextClass(score) {
    if (score >= 90) return 'text-success';
    if (score >= 75) return 'text-info';
    if (score >= 60) return 'text-warning';
    return 'text-error';
  }

  function getStatusDotClass(status) {
    switch (status) {
      case 'active':
        return 'bg-success';
      case 'recent':
        return 'bg-info';
      default:
        return 'bg-warning';
    }
  }

  async function loadHealthSummary() {
    try {
      loading = true;
      error = null;

      const response = await api.get(
        `/health/projects?project=${selectedProject}&days=${selectedDays}`
      );

      // Normalize field names. Backend now returns BOTH a lifetime
      // `total_events` and a windowed `recent_events`, so we keep them
      // distinct rather than collapsing them and rendering identical tiles.
      projectsData = (response.projects || []).map(p => ({
        ...p,
        project_name: p.project_name || p.name,
        total_events: p.total_events ?? 0,
        recent_events: p.recent_events ?? 0
      }));
      loaded = true;
      lastUpdated = new Date();
    } catch (err) {
      logger.error('Failed to load health summary:', err);
      error = err.message;
    } finally {
      loading = false;
    }
  }

  // Load on mount; reload when project or time range changes. Also poll
  // every 30 s so the page doesn't show data older than the user expects
  // — this is a "right now" view, not a snapshot.
  let pollHandle = null;
  onMount(() => {
    loadHealthSummary();
    pollHandle = setInterval(loadHealthSummary, 30_000);
  });

  // Reload when the global project filter changes. Guarded so the initial
  // run (which fires on mount alongside onMount's call) doesn't double-fetch:
  // the first effect run records the current project without fetching.
  let lastLoadedProject = $state(null);
  $effect(() => {
    const project = selectedProject;
    if (lastLoadedProject === null) {
      lastLoadedProject = project;
      return;
    }
    if (project !== lastLoadedProject) {
      lastLoadedProject = project;
      loadHealthSummary();
    }
  });

  onDestroy(() => {
    abortRequests();
    if (pollHandle) clearInterval(pollHandle);
  });
</script>

<PageLayout>
  <StatusBar prompt="RAVEN.ACTIVITY" label="Health" />
  <PageHeader
    title="Are your projects busy and healthy?"
    description="How active each project is and whether errors are piling up. The score combines recent activity with a syntax-error penalty — busy and clean is a 90+, quiet or buggy drags it down."
  >
    {#snippet actions()}
      <div class="flex items-center gap-3">
        <FreshnessBadge mode="polled" since={lastUpdated} intervalSeconds={30} />
        <select
          bind:value={selectedDays}
          onchange={loadHealthSummary}
          class="px-3 py-1.5 bg-canvas border border-border rounded text-sm font-mono text-body cursor-pointer"
        >
          <option value={1}>Last 24 hours</option>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
        </select>
        <RefreshButton onClick={loadHealthSummary} {loading} />
      </div>
    {/snippet}
  </PageHeader>

  {#if loading && !loaded}
    <LoadingState message="Calculating health score..." />
  {:else if error}
    <DataFetchError
      endpoint="/api/health/projects"
      message="Failed to load health summary."
      hint={error}
      onRetry={loadHealthSummary}
    />
  {:else if loaded}
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
          <div class="text-2xl font-bold font-mono {getScoreTextClass(overallScore)}">
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
    <div class="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
      <div
        class="bg-surface border border-border rounded p-4"
        title="Activity in the selected window — file edits + AI tool calls combined."
      >
        <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
          Activity in last {selectedDays} day{selectedDays === 1 ? '' : 's'}
        </div>
        <div class="text-sm font-mono text-body">{recentEvents.toLocaleString()}</div>
      </div>
      <div
        class="bg-surface border border-border rounded p-4"
        title="Lifetime total — every file edit and AI tool call Raven has seen across these projects."
      >
        <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
          Lifetime activity
        </div>
        <div class="text-sm font-mono text-body">{totalEvents.toLocaleString()}</div>
      </div>
      <div
        class="bg-surface border border-border rounded p-4"
        title="Syntax errors found — drops the health score by 5 points each, up to 50."
      >
        <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
          Syntax errors
        </div>
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full {totalErrors > 0 ? 'bg-error' : 'bg-success'}"></span>
          <span class="text-sm font-mono text-body">{totalErrors.toLocaleString()}</span>
        </div>
      </div>
      <div
        class="bg-surface border border-border rounded p-4"
        title="Projects Raven has seen activity in."
      >
        <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Projects</div>
        <div class="text-sm font-mono text-body">{projectsData.length}</div>
      </div>
    </div>

    <!-- Per-Project Health -->
    {#if projectsData.length > 0}
      <div class="bg-surface border border-border rounded-lg p-6">
        <h3 class="text-xs font-semibold text-muted uppercase tracking-wide mb-4">
          Per-Project Health
        </h3>

        <!-- Bounded so a long list of projects doesn't push everything else
             off-screen. Rows wrap-flex below sm so the bar always has room. -->
        <div class="space-y-3 pr-1">
          {#each projectsData as project (project.project_name)}
            <div
              class="flex flex-wrap items-center gap-3 sm:gap-4 p-3 bg-canvas border border-border rounded"
            >
              <div
                class="text-sm font-mono text-body w-full sm:w-32 truncate"
                title={project.project_name}
              >
                {project.project_name}
              </div>

              <div class="flex-1 min-w-[160px] flex items-center gap-3">
                <div class="flex-1 h-2 bg-surface rounded overflow-hidden">
                  <div
                    class="h-full transition-all"
                    style="width: {project.health_score || 0}%; background: {getScoreColor(
                      project.health_score || 0
                    )}"
                  ></div>
                </div>
                <span
                  class="text-sm font-mono w-8 text-right {getScoreTextClass(
                    project.health_score || 0
                  )}"
                >
                  {project.health_score || 0}
                </span>
              </div>

              <div class="text-xs font-mono text-muted text-right whitespace-nowrap">
                {project.error_count || 0} errors
              </div>

              <span class="flex items-center gap-1.5 text-xs font-mono whitespace-nowrap">
                <span class="w-2 h-2 rounded-full {getStatusDotClass(project.status)}"></span>
                <span class="text-body">{project.status}</span>
              </span>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</PageLayout>
