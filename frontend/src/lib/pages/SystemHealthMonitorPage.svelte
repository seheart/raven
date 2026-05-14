<script>
  import { onMount, onDestroy } from 'svelte';
  import { createPageApi } from '../apiClient.js';
  import { formatShortDateTime as formatTimestamp } from '../timeFormat.js';
  import { PageLayout, PageHeader } from '../components/layout/index.js';
  import { RefreshButton, FilterToggle, ToolbarButton } from '../components/ui/index.js';
  import FreshnessBadge from '../components/ui/FreshnessBadge.svelte';
  const { api, abort: abortRequests } = createPageApi();

  let healthReport = $state(null);
  let loading = $state(true);
  let error = $state(null);
  let autoRefresh = $state(true);
  let refreshInterval = null;

  // Internal metrics — Raven monitoring Raven. Polled separately from the
  // health-status payload because the cadence is faster (5s vs 30s) and the
  // snapshot is cheap (in-memory counters, no DB hits).
  /** @type {any} */
  let internalMetrics = $state(null);
  /** @type {Date | null} */
  let internalMetricsUpdatedAt = $state(null);
  /** @type {string | null} */
  let internalMetricsError = $state(null);
  /** @type {ReturnType<typeof setInterval> | null} */
  let internalMetricsInterval = null;

  async function fetchInternalMetrics() {
    try {
      internalMetrics = await api.get('/system/internal-metrics');
      internalMetricsUpdatedAt = new Date();
      internalMetricsError = null;
    } catch (err) {
      internalMetricsError = err instanceof Error ? err.message : String(err);
    }
  }

  // Lag → human-readable + color. Anything under 5s is "fresh"; 5–30s is
  // expected idle drift; longer is suspect.
  /** @param {number | null} ms */
  function lagLabel(ms) {
    if (ms == null) return 'no data';
    if (ms < 1_000) return `${ms} ms`;
    if (ms < 60_000) return `${Math.round(ms / 1000)} s`;
    if (ms < 3_600_000) return `${Math.round(ms / 60_000)} m`;
    return `${Math.round(ms / 3_600_000)} h`;
  }
  /** @param {number | null} ms */
  function lagColorClass(ms) {
    if (ms == null) return 'text-muted';
    if (ms < 5_000) return 'text-success';
    if (ms < 60_000) return 'text-body';
    if (ms < 300_000) return 'text-warning';
    return 'text-error';
  }
  /** @param {string} state */
  function breakerColorClass(state) {
    if (state === 'closed') return 'text-success';
    if (state === 'half-open') return 'text-warning';
    return 'text-error'; // open
  }
  /** @param {number | null} pct */
  function writeRateColor(pct) {
    if (pct == null) return 'text-muted';
    if (pct >= 99.5) return 'text-success';
    if (pct >= 95) return 'text-warning';
    return 'text-error';
  }

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
    // Internal metrics — independent 5s cadence regardless of the health
    // auto-refresh toggle. These are diagnostic so we always want them live.
    fetchInternalMetrics();
    internalMetricsInterval = setInterval(fetchInternalMetrics, 5000);
  });

  onDestroy(() => {
    abortRequests();
    if (refreshInterval) clearInterval(refreshInterval);
    if (internalMetricsInterval) clearInterval(internalMetricsInterval);
  });
</script>

<PageLayout>
  <PageHeader title="Health Monitor" description="Real-time system health and data integrity">
    {#snippet actions()}
      <div class="flex items-center gap-2">
        <RefreshButton onClick={fetchHealthReport} {loading} />
        <FilterToggle active={autoRefresh} onClick={toggleAutoRefresh}>
          {autoRefresh ? 'Auto-refresh on' : 'Auto-refresh off'}
        </FilterToggle>
      </div>
    {/snippet}
  </PageHeader>

  {#if loading && !healthReport}
    <div class="flex flex-col items-center justify-center py-16 text-muted">
      <div class="w-6 h-6 border-2 border-border border-t-accent rounded-full spinning mb-3"></div>
      <p class="text-sm">Running health checks...</p>
    </div>
  {:else if error}
    <div class="bg-error-subtle border border-error rounded-lg p-4 text-center">
      <p class="text-sm text-error mb-2">Health check failed: {error}</p>
      <ToolbarButton variant="danger" onClick={fetchHealthReport}>Retry</ToolbarButton>
    </div>
  {:else if healthReport}
    <!-- Internal metrics — Raven monitoring Raven. Polled every 5s. -->
    <div class="bg-surface border border-border rounded-lg mb-6">
      <div class="px-5 py-3 border-b border-border flex items-center justify-between gap-3">
        <h3 class="text-xs font-semibold text-muted uppercase tracking-wide">
          Internal metrics <span class="text-muted/60">— Raven monitoring Raven</span>
        </h3>
        <FreshnessBadge mode="polled" since={internalMetricsUpdatedAt} />
      </div>
      {#if internalMetricsError && !internalMetrics}
        <div class="px-5 py-3 text-xs text-error font-mono">
          Could not load internal metrics: {internalMetricsError}
        </div>
      {:else if !internalMetrics}
        <div class="px-5 py-3 text-xs text-muted font-mono">Loading…</div>
      {:else}
        <!-- Top row: the big-number tiles. -->
        <div class="grid grid-cols-2 xl:grid-cols-4 gap-px bg-border">
          <div class="bg-surface px-5 py-4">
            <div class="text-[11px] font-mono uppercase tracking-wide text-muted mb-1">
              Ingest rate
            </div>
            <div class="font-mono text-2xl text-body">
              {internalMetrics.ingest_events_per_second.toFixed(2)}
              <span class="text-xs text-muted">ev/s</span>
            </div>
            <div class="text-[11px] font-mono text-muted mt-1">
              {internalMetrics.ingest_events_total.toLocaleString()} total
            </div>
          </div>
          <div class="bg-surface px-5 py-4">
            <div class="text-[11px] font-mono uppercase tracking-wide text-muted mb-1">
              WS clients
            </div>
            <div class="font-mono text-2xl text-body">
              {internalMetrics.ws_clients_connected}
            </div>
            <div class="text-[11px] font-mono text-muted mt-1">
              queue depth {internalMetrics.ws_broadcast_queue_depth}
            </div>
          </div>
          <div class="bg-surface px-5 py-4">
            <div class="text-[11px] font-mono uppercase tracking-wide text-muted mb-1">
              Trigger p95
            </div>
            <div class="font-mono text-2xl text-body">
              {internalMetrics.trigger_processing_p95_ms.toFixed(1)}
              <span class="text-xs text-muted">ms</span>
            </div>
            <div class="text-[11px] font-mono text-muted mt-1">
              p50 {internalMetrics.trigger_processing_p50_ms.toFixed(1)}ms ·
              {internalMetrics.trigger_processing_samples} samples
            </div>
          </div>
          <div class="bg-surface px-5 py-4">
            <div class="text-[11px] font-mono uppercase tracking-wide text-muted mb-1">
              DB write success
            </div>
            <div
              class="font-mono text-2xl {writeRateColor(internalMetrics.db_write_success_rate_pct)}"
            >
              {internalMetrics.db_write_success_rate_pct.toFixed(2)}<span class="text-xs">%</span>
            </div>
            <div class="text-[11px] font-mono text-muted mt-1">
              {internalMetrics.db_write_retry_count.toLocaleString()} retries ·
              {internalMetrics.db_write_samples} samples
            </div>
          </div>
        </div>

        <!-- Watcher lag + disk-full state. -->
        <div class="px-5 py-3 border-t border-border">
          <div class="grid grid-cols-1 xl:grid-cols-3 gap-4 text-sm font-mono">
            <div class="flex items-baseline justify-between gap-3">
              <span class="text-muted text-xs uppercase tracking-wide">Claude log lag</span>
              <span class={lagColorClass(internalMetrics.claude_log_watcher_lag_ms)}>
                {lagLabel(internalMetrics.claude_log_watcher_lag_ms)}
              </span>
            </div>
            <div class="flex items-baseline justify-between gap-3">
              <span class="text-muted text-xs uppercase tracking-wide">Codex log lag</span>
              <span class={lagColorClass(internalMetrics.codex_log_watcher_lag_ms)}>
                {lagLabel(internalMetrics.codex_log_watcher_lag_ms)}
              </span>
            </div>
            <div class="flex items-baseline justify-between gap-3">
              <span class="text-muted text-xs uppercase tracking-wide">Disk full</span>
              <span class={internalMetrics.disk_full_state ? 'text-error' : 'text-success'}>
                {internalMetrics.disk_full_state ? 'YES — writes blocked' : 'no'}
              </span>
            </div>
          </div>
        </div>

        <!-- Circuit breakers (one row per breaker). Hidden when none registered. -->
        {#if internalMetrics.circuit_breaker_states.length > 0}
          <div class="border-t border-border">
            <div class="px-5 py-2 text-[11px] font-mono uppercase tracking-wide text-muted">
              Circuit breakers
            </div>
            <div class="border-t border-border font-mono text-sm">
              <table class="w-full">
                <thead class="bg-canvas">
                  <tr class="text-[11px] text-muted uppercase tracking-wide">
                    <th class="text-left font-semibold px-5 py-1">Name</th>
                    <th class="text-left font-semibold px-3 py-1 w-32">State</th>
                    <th class="text-left font-semibold px-3 py-1 w-32">Failures</th>
                  </tr>
                </thead>
                <tbody>
                  {#each internalMetrics.circuit_breaker_states as b (b.name)}
                    <tr class="hover:bg-surface/40">
                      <td class="px-5 py-0.5 text-body">{b.name}</td>
                      <td class="px-3 py-0.5 font-bold uppercase {breakerColorClass(b.state)}"
                        >{b.state}</td
                      >
                      <td class="px-3 py-0.5 text-muted">{b.failure_count}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
        {/if}

        <div class="px-5 py-2 border-t border-border text-[11px] font-mono text-muted">
          Uptime {Math.floor(internalMetrics.uptime_seconds / 60)}m
          {internalMetrics.uptime_seconds % 60}s · counters reset on restart
        </div>
      {/if}
    </div>

    <!-- Overall Status -->
    <div class="grid grid-cols-3 gap-3 mb-6">
      <div class="bg-surface border border-border rounded p-4">
        <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Status</div>
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
        <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Warnings</div>
        <span class="text-sm font-mono font-bold {warningCount > 0 ? 'text-warning' : 'text-body'}"
          >{warningCount}</span
        >
      </div>
      <div class="bg-surface border border-border rounded p-4">
        <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Critical</div>
        <span class="text-sm font-mono font-bold {criticalCount > 0 ? 'text-error' : 'text-body'}"
          >{criticalCount}</span
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
              <span class="text-xs text-muted font-mono flex-shrink-0">{check.category}</span>
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
