<script>
  import { onMount, onDestroy } from 'svelte';
  import { createPageApi } from '../apiClient.js';
  import { formatShortDateTime as formatTimestamp } from '../timeFormat.js';
  import { PageLayout, PageHeader } from '../components/layout/index.js';
  import { RefreshButton } from '../components/ui/index.js';
  const { api, abort: abortRequests } = createPageApi();

  let healthReport = $state(null);
  let loading = $state(true);
  let error = $state(null);
  let autoRefresh = $state(true);
  let refreshInterval = null;

  async function fetchHealthReport() {
    try {
      loading = true;
      const response = await api.get('/health/status');
      healthReport = response;
      error = null;
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  function toggleAutoRefresh() {
    autoRefresh = !autoRefresh;
    if (autoRefresh) {
      refreshInterval = setInterval(fetchHealthReport, 30000);
      fetchHealthReport();
    } else if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
  }

  function groupByCategory(checks) {
    const groups = {};
    for (const check of checks || []) {
      if (!groups[check.category]) groups[check.category] = [];
      groups[check.category].push(check);
    }
    return groups;
  }

  const groupedChecks = $derived(healthReport ? groupByCategory(healthReport.checks) : {});
  const criticalCount = $derived(healthReport?.summary?.critical || 0);
  const warningCount = $derived(healthReport?.summary?.warnings || 0);

  onMount(() => {
    fetchHealthReport();
    if (autoRefresh) refreshInterval = setInterval(fetchHealthReport, 30000);
  });

  onDestroy(() => {
    abortRequests();
    if (refreshInterval) clearInterval(refreshInterval);
  });
</script>

<PageLayout>
  <PageHeader title="Health Monitor" description="Real-time system health and data integrity">
    {#snippet actions()}
      <div class="flex items-center gap-2">
        <RefreshButton onClick={fetchHealthReport} loading={loading} />
        <button
          onclick={toggleAutoRefresh}
          class="px-3 py-1.5 border rounded text-sm font-sans transition-colors {autoRefresh
            ? 'bg-accent-subtle border-accent text-accent'
            : 'bg-surface border-border text-muted'}"
        >
          {autoRefresh ? 'Auto-refresh on' : 'Auto-refresh off'}
        </button>
      </div>
    {/snippet}
  </PageHeader>

    {#if loading && !healthReport}
      <div class="flex flex-col items-center justify-center py-16 text-muted">
        <div
          class="w-6 h-6 border-2 border-border border-t-accent rounded-full spinning mb-3"
        ></div>
        <p class="text-sm">Running health checks...</p>
      </div>
    {:else if error}
      <div class="bg-error-subtle border border-error rounded-lg p-4 text-center">
        <p class="text-sm text-error mb-2">Health check failed: {error}</p>
        <button
          onclick={fetchHealthReport}
          class="px-3 py-1.5 bg-error text-white rounded text-sm">Retry</button
        >
      </div>
    {:else if healthReport}
      <!-- Overall Status -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <div class="bg-surface border border-border rounded p-4">
          <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
            Status
          </div>
          <div class="flex items-center gap-2">
            <span
              class="w-2 h-2 rounded-full {healthReport.overallStatus === 'healthy'
                ? 'bg-success'
                : healthReport.overallStatus === 'critical'
                  ? 'bg-error'
                  : 'bg-warning'}"
            ></span>
            <span class="text-sm font-mono font-semibold text-body"
              >{(healthReport.overallStatus || 'unknown').toUpperCase()}</span
            >
          </div>
        </div>
        <div class="bg-surface border border-border rounded p-4">
          <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
            Warnings
          </div>
          <span
            class="text-sm font-mono font-bold {warningCount > 0
              ? 'text-warning'
              : 'text-body'}">{warningCount}</span
          >
        </div>
        <div class="bg-surface border border-border rounded p-4">
          <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
            Critical
          </div>
          <span
            class="text-sm font-mono font-bold {criticalCount > 0
              ? 'text-error'
              : 'text-body'}">{criticalCount}</span
          >
        </div>
      </div>

      <!-- Issues (front and center) -->
      {#if criticalCount > 0 || warningCount > 0}
        <div class="bg-surface border border-border rounded-lg mb-6">
          <div class="px-5 py-3 border-b border-border">
            <h3 class="text-xs font-semibold text-muted uppercase tracking-wide">
              {criticalCount > 0 ? 'Critical Issues' : 'Warnings'} ({criticalCount + warningCount})
            </h3>
          </div>
          <div class="divide-y divide-[var(--border)]">
            {#each (healthReport.checks || []).filter(c => c.status !== 'healthy') as check (check.name + check.category)}
              <div class="px-5 py-3 flex items-start gap-3">
                <span
                  class="w-2 h-2 rounded-full flex-shrink-0 mt-1.5 {check.status === 'critical'
                    ? 'bg-error'
                    : 'bg-warning'}"
                ></span>
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-mono text-body">{check.name}</div>
                  <div class="text-xs text-muted mt-0.5">{check.message}</div>
                </div>
                <span class="text-xs text-muted font-mono flex-shrink-0"
                  >{check.category}</span
                >
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Checks by Category -->
      {#each Object.entries(groupedChecks) as [category, checks] (category)}
        <div class="bg-surface border border-border rounded-lg mb-4">
          <div class="px-5 py-3 border-b border-border">
            <h3 class="text-xs font-semibold text-muted uppercase tracking-wide">
              {category}
            </h3>
          </div>
          <div class="divide-y divide-[var(--border)]">
            {#each checks as check (check.name + check.category)}
              <div class="px-5 py-3 flex items-start gap-3">
                <span
                  class="w-2 h-2 rounded-full flex-shrink-0 mt-1.5 {check.status === 'healthy'
                    ? 'bg-success'
                    : check.status === 'warning'
                      ? 'bg-warning'
                      : 'bg-error'}"
                ></span>
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-mono text-body">{check.name}</div>
                  <div class="text-xs text-muted mt-0.5">{check.message}</div>
                  {#if check.details}
                    <details class="mt-2">
                      <summary class="text-xs text-accent cursor-pointer hover:underline"
                        >Details</summary
                      >
                      <pre
                        class="mt-1 text-xs font-mono bg-canvas border border-border rounded p-2 overflow-x-auto">{JSON.stringify(
                          check.details,
                          null,
                          2
                        )}</pre>
                    </details>
                  {/if}
                </div>
                <span class="text-xs text-muted font-mono flex-shrink-0"
                  >{formatTimestamp(check.timestamp)}</span
                >
              </div>
            {/each}
          </div>
        </div>
      {/each}

      <div class="text-xs text-muted text-center mt-4">
        Last checked: {formatTimestamp(healthReport.timestamp)} · Auto-refresh: {autoRefresh
          ? '30s'
          : 'off'}
      </div>
    {/if}
</PageLayout>
