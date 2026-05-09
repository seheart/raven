<script>
  /**
   * DiagnosticPage — one button, one page. Runs everything Raven knows
   * how to check: code health (12 sub-checks: tests, lint, types, build,
   * audit, etc.), system health monitor (DB, memory, data integrity),
   * surfaces unresolved errors, and pattern-warning safety findings.
   *
   * Orchestration is client-side: hits each existing endpoint in order
   * and listens to the existing analysis-progress WebSocket for live
   * code-health updates. Each section deep-links to its full detail
   * page for drill-down.
   */
  import { onMount, onDestroy } from 'svelte';
  import { createPageApi } from '../apiClient.js';
  import { websocketService } from '../services/websocket.js';
  import { navigate } from '../utils/router.svelte.js';
  import { formatShortDateTime } from '../timeFormat.js';
  import { PageLayout, PageHeader } from '../components/layout/index.js';
  import { ToolbarButton } from '../components/ui/index.js';
  const { api, abort: abortRequests } = createPageApi();

  // Section state. Each section tracks its own status independently so
  // a single failed step doesn't block the others from rendering.
  let codeHealth = $state({ data: null, loading: false, running: false });
  let healthMonitor = $state({ data: null, loading: false });
  let errors = $state({ count: 0, loading: false });
  let patterns = $state({ count: 0, loading: false });

  // Live progress for the code-health subrun (the longest-running step).
  let progress = $state(null); // { checkIndex, totalChecks, currentCheck }
  let completedChecks = $state([]);
  let runStartTime = $state(null);
  let runFinishedAt = $state(null);

  // Clipboard feedback for the Copy Report button.
  let copyStatus = $state('');

  // True while any orchestrated step is in flight. Used to disable the
  // Run All button and show the live panel.
  const isRunning = $derived(
    codeHealth.running ||
      codeHealth.loading ||
      healthMonitor.loading ||
      errors.loading ||
      patterns.loading
  );

  // Aggregate verdict across every section. The button needs an honest
  // top-level signal — a single critical anywhere outranks all warnings.
  const overallStatus = $derived.by(() => {
    if (isRunning) return 'running';
    const ch = codeHealth.data;
    const hm = healthMonitor.data;
    if (!ch && !hm) return 'unknown';
    if (ch?.overall_score === 'critical' || hm?.overallStatus === 'critical') return 'critical';
    if (errors.count > 0) return 'critical';
    if (ch?.overall_score === 'warning' || hm?.overallStatus === 'warning' || patterns.count > 0)
      return 'warning';
    if (ch?.overall_score === 'healthy' && hm?.overallStatus === 'healthy') return 'healthy';
    return 'unknown';
  });

  function statusColor(s) {
    if (s === 'healthy') return 'var(--success)';
    if (s === 'warning') return 'var(--warning)';
    if (s === 'critical') return 'var(--error)';
    if (s === 'running') return 'var(--accent)';
    return 'var(--muted)';
  }

  function statusLabel(s) {
    if (s === 'running') return 'Running…';
    if (s === 'healthy') return 'All clear';
    if (s === 'warning') return 'Warnings';
    if (s === 'critical') return 'Issues found';
    return 'Not yet run';
  }

  function formatDuration(ms) {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  }

  // Build a single markdown blob covering every section, formatted to
  // paste into a chat (Claude, Slack, GitHub issue, etc.). Keeps the
  // happy-path noise out — only failures/warnings/counts get reported,
  // since paste-into-chat is fundamentally a "help me debug this" flow.
  // Per-check output is capped at 1500 chars so a single noisy log
  // doesn't dominate the report.
  function buildReport() {
    const lines = [];
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
    lines.push(`# Raven Diagnostic Report`);
    lines.push(`Generated: ${ts} UTC`);
    lines.push(`Overall: **${statusLabel(overallStatus).toUpperCase()}**`);
    lines.push('');

    // Code Health
    const ch = codeHealth.data;
    if (ch) {
      lines.push(`## Code Health — ${ch.overall_score || 'unknown'}`);
      lines.push(
        `${ch.passed_checks}/${ch.total_checks} passed · ${ch.warned_checks} warn · ${ch.failed_checks} fail`
      );
      lines.push(
        `Last run: ${ch.timestamp ? formatShortDateTime(ch.timestamp) : '-'} (${formatDuration(ch.duration_ms)})`
      );
      const issues = (ch.checks || []).filter(c => c.status !== 'pass');
      if (issues.length > 0) {
        lines.push('');
        for (const c of issues) {
          const tag = c.status === 'fail' ? '✗ FAIL' : '⚠ WARN';
          lines.push(`### ${tag}: ${c.name}`);
          if (c.summary) lines.push(`_${c.summary}_`);
          if (c.output) {
            const out = c.output.trim().slice(0, 1500);
            const truncated = c.output.length > 1500 ? '\n... (truncated)' : '';
            lines.push('```');
            lines.push(out + truncated);
            lines.push('```');
          }
          lines.push('');
        }
      }
    } else {
      lines.push(`## Code Health — not run yet`);
    }
    lines.push('');

    // Health Monitor
    const hm = healthMonitor.data;
    if (hm) {
      lines.push(`## Health Monitor — ${hm.overallStatus || 'unknown'}`);
      const summary = hm.summary || {};
      lines.push(
        `${(hm.checks || []).length} checks · ${summary.warnings || 0} warn · ${summary.critical || 0} critical`
      );
      const issues = (hm.checks || []).filter(c => c.status !== 'healthy');
      if (issues.length > 0) {
        lines.push('');
        for (const c of issues) {
          const tag = c.status === 'critical' ? '✗ CRITICAL' : '⚠ WARN';
          lines.push(`- ${tag} [${c.category}] **${c.name}** — ${c.message}`);
        }
      }
    } else {
      lines.push(`## Health Monitor — no report`);
    }
    lines.push('');

    // Errors
    lines.push(`## Errors — ${errors.count} unresolved`);
    lines.push('');

    // Pattern Warnings
    lines.push(`## Safety Patterns — ${patterns.count} unresolved`);
    lines.push('');

    return lines.join('\n');
  }

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(buildReport());
      copyStatus = 'Copied!';
    } catch {
      copyStatus = 'Copy failed';
    }
    setTimeout(() => (copyStatus = ''), 1800);
  }

  // Initial-load reads. These don't trigger any work — just surface the
  // most-recent results so the page is informative the moment you open it.
  async function loadInitial() {
    await Promise.all([
      api
        .get('/analysis/code-health')
        .then(r => {
          codeHealth.data = r.latest;
          codeHealth.running = !!r.is_running;
        })
        .catch(() => {}),
      api
        .get('/health/last-report')
        .then(r => {
          healthMonitor.data = r;
        })
        .catch(() => {}),
      api
        .get('/errors/stats')
        .then(r => {
          errors.count = r?.total ?? 0;
        })
        .catch(() => {}),
      api
        .get('/pattern-warnings')
        .then(r => {
          patterns.count = r?.warnings?.length ?? 0;
        })
        .catch(() => {})
    ]);
  }

  // The single button. Kicks off code-health (the long one) and the
  // health monitor in parallel, then refreshes the lighter counts when
  // both finish. Code-health progress streams via WebSocket.
  async function runAll() {
    runStartTime = Date.now();
    runFinishedAt = null;
    progress = null;
    completedChecks = [];

    // Kick off the long-running code-health job.
    codeHealth.running = true;
    const codeHealthPromise = api
      .post('/analysis/code-health/run')
      .then(() => pollCodeHealthCompletion())
      .catch(() => {
        codeHealth.running = false;
      });

    // Health monitor runs synchronously inside the GET handler, so we
    // just await the response.
    healthMonitor.loading = true;
    const healthPromise = api
      .get('/health/status')
      .then(r => {
        healthMonitor.data = r;
      })
      .catch(() => {})
      .finally(() => {
        healthMonitor.loading = false;
      });

    await Promise.all([codeHealthPromise, healthPromise]);

    // Refresh counts after the heavy work finishes — error/pattern
    // detectors may have surfaced new findings during the run.
    errors.loading = true;
    patterns.loading = true;
    await Promise.all([
      api
        .get('/errors/stats')
        .then(r => {
          errors.count = r?.total ?? 0;
        })
        .catch(() => {})
        .finally(() => {
          errors.loading = false;
        }),
      api
        .get('/pattern-warnings')
        .then(r => {
          patterns.count = r?.warnings?.length ?? 0;
        })
        .catch(() => {})
        .finally(() => {
          patterns.loading = false;
        })
    ]);

    runFinishedAt = Date.now();
  }

  // The code-health endpoint kicks off async work and returns immediately.
  // Poll the read endpoint until the server reports is_running=false.
  async function pollCodeHealthCompletion() {
    return new Promise(resolve => {
      const interval = setInterval(async () => {
        try {
          const result = await api.get('/analysis/code-health');
          codeHealth.data = result.latest;
          if (!result.is_running) {
            clearInterval(interval);
            codeHealth.running = false;
            resolve();
          }
        } catch {
          clearInterval(interval);
          codeHealth.running = false;
          resolve();
        }
      }, 3000);
    });
  }

  let progressHandler = null;
  onMount(() => {
    loadInitial();

    // Forward analysis-progress WebSocket events into the live panel.
    // Same event the dedicated CodeHealthPage uses — no backend change.
    progressHandler = data => {
      progress = data;
      if (data.completedCheck) {
        completedChecks = [...completedChecks, data.completedCheck];
      }
    };
    websocketService.on('analysis-progress', progressHandler);
  });

  onDestroy(() => {
    abortRequests();
    if (progressHandler) websocketService.off('analysis-progress', progressHandler);
  });
</script>

<PageLayout>
  <PageHeader
    title="Diagnostic"
    description="One button. Runs every check Raven knows — tests, lint, types, build, system health, errors, safety patterns."
  />

  <!-- Hero: the single button -->
  <div class="bg-surface border border-border rounded-lg p-6 mb-6 flex items-center gap-6">
    <div class="flex items-center gap-3">
      <span
        class="w-3 h-3 rounded-full"
        class:animate-pulse={isRunning}
        style="background: {statusColor(overallStatus)}"
      ></span>
      <div>
        <div class="text-xs uppercase tracking-wide text-muted font-mono mb-0.5">Overall</div>
        <div class="text-lg font-mono text-body">{statusLabel(overallStatus)}</div>
      </div>
    </div>

    <div class="flex-1"></div>

    {#if runFinishedAt && !isRunning}
      <span class="text-xs text-muted font-mono">
        Last run took {formatDuration(runFinishedAt - runStartTime)}
      </span>
    {/if}

    <ToolbarButton
      onClick={copyReport}
      disabled={isRunning}
      title="Copy a markdown summary of every section to your clipboard. Paste into chat to get help debugging."
    >
      {copyStatus || 'Copy Report'}
    </ToolbarButton>

    <ToolbarButton variant="primary" onClick={runAll} disabled={isRunning}>
      {isRunning ? 'Running…' : 'Run All Diagnostics'}
    </ToolbarButton>
  </div>

  <!-- Live progress (only during a run) -->
  {#if isRunning}
    <div class="bg-surface border border-accent rounded-lg mb-6 overflow-hidden">
      <div class="px-4 py-3 flex items-center gap-3 border-b border-border">
        <div
          class="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin flex-shrink-0"
        ></div>
        <span class="text-sm text-body flex-1">
          {#if progress}
            Code Health: <span class="font-mono text-accent">{progress.currentCheck}</span>
            <span class="text-muted">({progress.checkIndex}/{progress.totalChecks})</span>
          {:else if codeHealth.running}
            Starting code health checks…
          {:else}
            Running checks…
          {/if}
        </span>
        {#if runStartTime}
          <span class="text-xs font-mono text-muted">
            {formatDuration(Date.now() - runStartTime)}
          </span>
        {/if}
      </div>
      {#if progress}
        <div class="h-1.5 bg-canvas">
          <div
            class="h-full bg-accent transition-all duration-500"
            style="width: {(progress.checkIndex / progress.totalChecks) * 100}%"
          ></div>
        </div>
      {/if}
      {#if completedChecks.length > 0}
        <div
          class="px-4 py-3 max-h-48 overflow-y-auto font-mono text-xs"
          style="background: var(--bg)"
        >
          {#each completedChecks as check, i (i)}
            <div class="flex items-start gap-2 py-1">
              <span
                class="flex-shrink-0 w-4 text-center font-bold"
                style="color: {check.status === 'pass'
                  ? 'var(--success)'
                  : check.status === 'warn'
                    ? 'var(--warning)'
                    : 'var(--error)'}"
                >{check.status === 'pass' ? '✓' : check.status === 'warn' ? '!' : '✗'}</span
              >
              <span class="text-body">{check.name}</span>
              <span class="text-muted">{formatDuration(check.duration_ms)}</span>
              <span class="flex-1"></span>
              <span class="text-muted truncate max-w-[50%]">{check.summary}</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Section cards. Each shows a one-line summary + drill-down to the
       existing detail page. The Diagnostic page is the front door; the
       sub-pages are the workshop. -->
  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    <!-- Code Health -->
    <button
      onclick={() => navigate('/system/code-health')}
      class="bg-surface border border-border rounded-lg p-5 text-left cursor-pointer hover:border-accent transition-colors"
      title="View full code-health report"
    >
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-xs font-semibold text-muted uppercase tracking-wide">Code Health</h3>
        <span class="text-[10px] text-muted">→ details</span>
      </div>
      {#if codeHealth.data}
        <div class="flex items-center gap-2 mb-2">
          <span
            class="w-2 h-2 rounded-full"
            style="background: {statusColor(
              codeHealth.data.overall_score === 'healthy'
                ? 'healthy'
                : codeHealth.data.overall_score
            )}"
          ></span>
          <span class="text-sm font-mono text-body">
            {codeHealth.data.passed_checks}/{codeHealth.data.total_checks} passed
          </span>
          {#if codeHealth.data.warned_checks > 0}
            <span class="text-xs text-warning">· {codeHealth.data.warned_checks} warn</span>
          {/if}
          {#if codeHealth.data.failed_checks > 0}
            <span class="text-xs text-error">· {codeHealth.data.failed_checks} fail</span>
          {/if}
        </div>
        <div class="text-xs text-muted">
          Last run {formatShortDateTime(codeHealth.data.timestamp)}
          {#if codeHealth.data.duration_ms}
            · {formatDuration(codeHealth.data.duration_ms)}
          {/if}
        </div>
      {:else}
        <div class="text-sm text-muted">No runs yet — click Run All to start.</div>
      {/if}
    </button>

    <!-- Health Monitor -->
    <button
      onclick={() => navigate('/system/health-monitor')}
      class="bg-surface border border-border rounded-lg p-5 text-left cursor-pointer hover:border-accent transition-colors"
      title="View full health-monitor report"
    >
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-xs font-semibold text-muted uppercase tracking-wide">Health Monitor</h3>
        <span class="text-[10px] text-muted">→ details</span>
      </div>
      {#if healthMonitor.data}
        <div class="flex items-center gap-2 mb-2">
          <span
            class="w-2 h-2 rounded-full"
            style="background: {statusColor(healthMonitor.data.overallStatus)}"
          ></span>
          <span class="text-sm font-mono text-body">
            {(healthMonitor.data.overallStatus || 'unknown').toUpperCase()}
          </span>
          {#if healthMonitor.data.summary?.warnings > 0}
            <span class="text-xs text-warning">· {healthMonitor.data.summary.warnings} warn</span>
          {/if}
          {#if healthMonitor.data.summary?.critical > 0}
            <span class="text-xs text-error">· {healthMonitor.data.summary.critical} critical</span>
          {/if}
        </div>
        <div class="text-xs text-muted">
          {(healthMonitor.data.checks || []).length} checks · last {formatShortDateTime(
            healthMonitor.data.timestamp
          )}
        </div>
      {:else}
        <div class="text-sm text-muted">No report yet.</div>
      {/if}
    </button>

    <!-- Errors -->
    <button
      onclick={() => navigate('/system/errors')}
      class="bg-surface border border-border rounded-lg p-5 text-left cursor-pointer hover:border-accent transition-colors"
      title="View error log"
    >
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-xs font-semibold text-muted uppercase tracking-wide">Errors</h3>
        <span class="text-[10px] text-muted">→ details</span>
      </div>
      <div class="flex items-center gap-2 mb-2">
        <span
          class="w-2 h-2 rounded-full"
          style="background: {errors.count > 0 ? 'var(--error)' : 'var(--success)'}"
        ></span>
        <span
          class="text-sm font-mono"
          style="color: {errors.count > 0 ? 'var(--error)' : 'var(--body)'}"
        >
          {errors.count}
          {errors.count === 1 ? 'unresolved error' : 'unresolved errors'}
        </span>
      </div>
      <div class="text-xs text-muted">
        {errors.count > 0 ? 'Click through to inspect or clear.' : 'Nothing currently flagged.'}
      </div>
    </button>

    <!-- Pattern Warnings (Safety) -->
    <button
      onclick={() => navigate('/system/safety')}
      class="bg-surface border border-border rounded-lg p-5 text-left cursor-pointer hover:border-accent transition-colors"
      title="View safety pattern warnings"
    >
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-xs font-semibold text-muted uppercase tracking-wide">Safety Patterns</h3>
        <span class="text-[10px] text-muted">→ details</span>
      </div>
      <div class="flex items-center gap-2 mb-2">
        <span
          class="w-2 h-2 rounded-full"
          style="background: {patterns.count > 0 ? 'var(--warning)' : 'var(--success)'}"
        ></span>
        <span
          class="text-sm font-mono"
          style="color: {patterns.count > 0 ? 'var(--warning)' : 'var(--body)'}"
        >
          {patterns.count}
          {patterns.count === 1 ? 'unresolved warning' : 'unresolved warnings'}
        </span>
      </div>
      <div class="text-xs text-muted">
        {patterns.count > 0 ? 'Credential leaks, debug statements, etc.' : 'No flagged patterns.'}
      </div>
    </button>
  </div>
</PageLayout>
