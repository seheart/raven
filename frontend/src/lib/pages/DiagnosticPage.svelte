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
  import { PageLayout, PageHeader, StatusBar } from '../components/layout/index.js';
  import { ToolbarButton, DataFetchError } from '../components/ui/index.js';
  const { api, abort: abortRequests } = createPageApi();

  // Section state. Each section tracks its own status independently so
  // a single failed step doesn't block the others from rendering.
  let codeHealth = $state({ data: null, loading: false, running: false });
  let healthMonitor = $state({ data: null, loading: false });
  // `error` distinguishes "loaded and genuinely zero" from "fetch failed" —
  // without it a 500 on /errors/stats would render as a green "0 unresolved",
  // the exact silent failure this page exists to catch.
  let errors = $state({ count: 0, loading: false, /** @type {string|null} */ error: null });
  let patterns = $state({ count: 0, loading: false, /** @type {string|null} */ error: null });
  // Endpoint coverage: every /system page's primary GET endpoint. Hits
  // /api/health/comprehensive which runs HealthChecker.runAll(). The
  // anti-silent-failure backstop — a regression in any /system page's data
  // fetch shows up here, even when nobody's clicked the page.
  let endpointSweep = $state({
    data: null,
    loading: false,
    /** @type {string|null} */ error: null
  });

  // Live progress for the code-health subrun (the longest-running step).
  let progress = $state(null); // { checkIndex, totalChecks, currentCheck }
  let completedChecks = $state([]);
  let runStartTime = $state(null);
  let runFinishedAt = $state(null);

  // Ticks once a second while a run is in flight so the elapsed timer in
  // the live panel actually advances — reading Date.now() directly in
  // markup only re-evaluates when some other reactive dep changes.
  let nowTick = $state(Date.now());
  /** @type {ReturnType<typeof setInterval>|null} */
  let elapsedTimer = null;
  // Tracks the code-health completion poller so onDestroy can clear it —
  // otherwise it keeps hitting /analysis/code-health every 3s after unmount.
  /** @type {ReturnType<typeof setInterval>|null} */
  let codeHealthPoll = null;

  // Clipboard feedback for the Copy Report button.
  let copyStatus = $state('');

  // True while any orchestrated step is in flight. Used to disable the
  // Run All button and show the live panel.
  const isRunning = $derived(
    codeHealth.running ||
      codeHealth.loading ||
      healthMonitor.loading ||
      errors.loading ||
      patterns.loading ||
      endpointSweep.loading
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
    // Any failed endpoint check is a critical signal — these are the
    // /system page data fetches, and a 500/wrong-shape response means a
    // page is silently broken.
    if (endpointSweep.data?.criticalFailed > 0) return 'critical';
    if (endpointSweep.data?.failed > 0) return 'warning';
    // A section that FAILED TO LOAD must not read as "All clear". The sweep is
    // the anti-silent-failure backstop, so its own death is at least a warning;
    // a broken errors/patterns fetch likewise can't be silently treated as 0.
    if (endpointSweep.error || errors.error || patterns.error) return 'warning';
    if (ch?.overall_score === 'warning' || hm?.overallStatus === 'warning' || patterns.count > 0)
      return 'warning';
    if (ch?.overall_score === 'healthy' && hm?.overallStatus === 'healthy') return 'healthy';
    return 'unknown';
  });

  // Map an aggregate status to its semantic dot background utility. Keeping
  // the state→class mapping in JS (rather than inline `style="background:
  // var(--x)"`) matches SystemPage's TIER_DOT_CLASS pattern.
  function statusDotClass(s) {
    if (s === 'healthy') return 'bg-success';
    if (s === 'warning') return 'bg-warning';
    if (s === 'critical') return 'bg-error';
    if (s === 'running') return 'bg-accent';
    return 'bg-muted';
  }

  function statusLabel(s) {
    if (s === 'running') return 'Running…';
    if (s === 'healthy') return 'All clear';
    if (s === 'warning') return 'Warnings';
    if (s === 'critical') return 'Issues found';
    return 'Not yet run';
  }

  // Drive the elapsed-time ticker off isRunning: spin up a 1s interval
  // while anything is running, tear it down the moment it all settles.
  $effect(() => {
    if (isRunning) {
      if (!elapsedTimer) {
        nowTick = Date.now();
        elapsedTimer = setInterval(() => {
          nowTick = Date.now();
        }, 1000);
      }
    } else if (elapsedTimer) {
      clearInterval(elapsedTimer);
      elapsedTimer = null;
    }
  });

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

    // Errors — report a load failure honestly rather than "0 unresolved".
    lines.push(
      errors.error
        ? `## Errors — could not load (${errors.error})`
        : `## Errors — ${errors.count} unresolved`
    );
    lines.push('');

    // Pattern Warnings
    lines.push(
      patterns.error
        ? `## Safety Patterns — could not load (${patterns.error})`
        : `## Safety Patterns — ${patterns.count} unresolved`
    );
    lines.push('');

    // Endpoint coverage — only the failures matter in a debug report. A failed
    // sweep is itself a finding (the backstop is down), so surface it rather
    // than silently omitting the section.
    if (endpointSweep.data) {
      const failed = endpointSweep.data.results.filter(r => r.status === 'failed');
      lines.push(
        `## Endpoint Coverage — ${endpointSweep.data.passed}/${endpointSweep.data.total} passing` +
          (failed.length ? ` · ${failed.length} failed` : '')
      );
      for (const r of failed) {
        const tag = r.critical ? '✗ CRITICAL' : '✗ FAIL';
        lines.push(`- ${tag} **${r.name}** — ${r.error || 'failed'}`);
      }
      lines.push('');
    } else if (endpointSweep.error) {
      lines.push(`## Endpoint Coverage — sweep failed: ${endpointSweep.error}`);
      lines.push('');
    }

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
          errors.error = null;
        })
        .catch(err => {
          errors.error = err?.message || String(err);
        }),
      api
        .get('/pattern-warnings')
        .then(r => {
          patterns.count = r?.warnings?.length ?? 0;
          patterns.error = null;
        })
        .catch(err => {
          patterns.error = err?.message || String(err);
        }),
      runEndpointSweep().catch(() => {})
    ]);
  }

  // Hits /api/health/comprehensive — runs HealthChecker.runAll() server-side.
  // Each row corresponds to one /system page's data endpoint, so failures
  // map cleanly back to "this page is broken." Also called from runAll().
  async function runEndpointSweep() {
    endpointSweep.loading = true;
    endpointSweep.error = null;
    try {
      const data = await api.get('/health/comprehensive', { timeout: 60_000 });
      endpointSweep.data = data;
    } catch (err) {
      endpointSweep.error = err?.message || String(err);
      endpointSweep.data = null;
    } finally {
      endpointSweep.loading = false;
    }
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

    // Sweep endpoint coverage in parallel with the heavy code-health run.
    const sweepPromise = runEndpointSweep().catch(() => {});

    await Promise.all([codeHealthPromise, healthPromise, sweepPromise]);

    // Refresh counts after the heavy work finishes — error/pattern
    // detectors may have surfaced new findings during the run.
    errors.loading = true;
    patterns.loading = true;
    await Promise.all([
      api
        .get('/errors/stats')
        .then(r => {
          errors.count = r?.total ?? 0;
          errors.error = null;
        })
        .catch(err => {
          errors.error = err?.message || String(err);
        })
        .finally(() => {
          errors.loading = false;
        }),
      api
        .get('/pattern-warnings')
        .then(r => {
          patterns.count = r?.warnings?.length ?? 0;
          patterns.error = null;
        })
        .catch(err => {
          patterns.error = err?.message || String(err);
        })
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
      const stop = () => {
        if (codeHealthPoll) {
          clearInterval(codeHealthPoll);
          codeHealthPoll = null;
        }
        codeHealth.running = false;
        resolve();
      };
      // During a self-analysis run the backend is intentionally CPU-bound and
      // routine GETs can transiently 503/time out (apiClient even suppresses
      // those). A single failed poll must NOT be read as "run finished" — that
      // would end the run early and leave the card showing the PREVIOUS run.
      // Tolerate a few consecutive failures before giving up.
      const MAX_CONSECUTIVE_FAILURES = 5;
      let consecutiveFailures = 0;
      codeHealthPoll = setInterval(async () => {
        try {
          const result = await api.get('/analysis/code-health');
          consecutiveFailures = 0;
          codeHealth.data = result.latest;
          if (!result.is_running) stop();
        } catch {
          consecutiveFailures += 1;
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) stop();
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
    if (codeHealthPoll) {
      clearInterval(codeHealthPoll);
      codeHealthPoll = null;
    }
    if (elapsedTimer) {
      clearInterval(elapsedTimer);
      elapsedTimer = null;
    }
  });
</script>

<PageLayout>
  <div class="mb-6">
    <StatusBar label="Diagnostic · Health · Errors" />
  </div>

  <PageHeader
    title="Diagnostic"
    description="One button. Runs every check Raven knows — tests, lint, types, build, system health, errors, safety patterns."
  />

  <!-- Hero: the single button -->
  <div class="bg-surface border border-border rounded-lg p-6 mb-6 flex items-center gap-6">
    <div class="flex items-center gap-3">
      <span
        class="w-3 h-3 rounded-full {statusDotClass(overallStatus)}"
        class:animate-pulse={isRunning}
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
        <span class="w-1.5 h-1.5 rounded-full bg-accent animate-pulse flex-shrink-0"></span>
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
            {formatDuration(nowTick - runStartTime)}
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
        <div class="px-4 py-3 max-h-48 overflow-y-auto font-mono text-xs bg-canvas">
          {#each completedChecks as check, i (i)}
            <div class="flex items-start gap-2 py-1">
              <span
                class="flex-shrink-0 w-4 text-center font-bold {check.status === 'pass'
                  ? 'text-success'
                  : check.status === 'warn'
                    ? 'text-warning'
                    : 'text-error'}"
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
            class="w-2 h-2 rounded-full {statusDotClass(
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
          <span class="w-2 h-2 rounded-full {statusDotClass(healthMonitor.data.overallStatus)}"
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
          class="w-2 h-2 rounded-full {errors.error
            ? 'bg-warning'
            : errors.count > 0
              ? 'bg-error'
              : 'bg-success'}"
        ></span>
        <span
          class="text-sm font-mono {errors.error
            ? 'text-warning'
            : errors.count > 0
              ? 'text-error'
              : 'text-body'}"
        >
          {#if errors.error}
            Could not load
          {:else}
            {errors.count}
            {errors.count === 1 ? 'unresolved error' : 'unresolved errors'}
          {/if}
        </span>
      </div>
      <div class="text-xs text-muted">
        {errors.error
          ? errors.error
          : errors.count > 0
            ? 'Click through to inspect or clear.'
            : 'Nothing currently flagged.'}
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
          class="w-2 h-2 rounded-full {patterns.error || patterns.count > 0
            ? 'bg-warning'
            : 'bg-success'}"
        ></span>
        <span
          class="text-sm font-mono {patterns.error || patterns.count > 0
            ? 'text-warning'
            : 'text-body'}"
        >
          {#if patterns.error}
            Could not load
          {:else}
            {patterns.count}
            {patterns.count === 1 ? 'unresolved warning' : 'unresolved warnings'}
          {/if}
        </span>
      </div>
      <div class="text-xs text-muted">
        {patterns.error
          ? patterns.error
          : patterns.count > 0
            ? 'Credential leaks, debug statements, etc.'
            : 'No flagged patterns.'}
      </div>
    </button>
  </div>

  <!-- Endpoint coverage. Every /system page's primary GET, exercised
       through HealthChecker.runAll() server-side. The "no silent failures"
       backstop — if a page goes empty because its endpoint is broken,
       this section calls it out by name with the actual error. -->
  <div class="bg-surface border border-border rounded-lg p-5 mt-6">
    <div class="flex items-center justify-between mb-4 gap-3 flex-wrap">
      <div>
        <h3 class="text-xs font-semibold text-muted uppercase tracking-wide">Endpoint coverage</h3>
        <p class="text-xs text-muted mt-1">
          Hits every /system page's primary GET. A failure here means a page is silently broken.
        </p>
      </div>
      <div class="flex items-center gap-3">
        {#if endpointSweep.data}
          <span class="text-xs font-mono text-muted">
            <span class={endpointSweep.data.failed === 0 ? 'text-success' : 'text-error'}>
              {endpointSweep.data.passed}/{endpointSweep.data.total}
            </span>
            passed
            {#if endpointSweep.data.failed > 0}
              · <span class="text-error">{endpointSweep.data.failed} failed</span>
            {/if}
          </span>
        {/if}
        <ToolbarButton onClick={runEndpointSweep} disabled={endpointSweep.loading}>
          {endpointSweep.loading ? 'Running…' : 'Run check'}
        </ToolbarButton>
      </div>
    </div>

    {#if endpointSweep.error}
      <DataFetchError
        endpoint="/health/comprehensive"
        message="Sweep failed: {endpointSweep.error}"
        onRetry={runEndpointSweep}
      />
    {/if}

    {#if endpointSweep.data}
      {@const failures = endpointSweep.data.results.filter(r => r.status === 'failed')}
      {@const passes = endpointSweep.data.results.filter(r => r.status === 'passed')}
      {#if failures.length > 0}
        <div class="space-y-1.5 mb-3">
          {#each failures as r (r.name)}
            <div
              class="bg-error-subtle border border-error rounded px-3 py-2 text-xs font-mono flex items-baseline gap-3"
            >
              <span class="w-2 h-2 rounded-full bg-error flex-shrink-0 mt-1"></span>
              <span class="font-semibold text-error w-44 flex-shrink-0">{r.name}</span>
              <span class="text-error/80 flex-1 break-all">
                {r.error || 'failed'}
                {#if r.critical}
                  <span
                    class="ml-2 text-[10px] uppercase tracking-wide bg-error text-canvas rounded px-1.5 py-0.5"
                    >critical</span
                  >
                {/if}
              </span>
              <span class="text-muted/60 flex-shrink-0">{r.duration}ms</span>
            </div>
          {/each}
        </div>
      {/if}
      <details class="text-xs">
        <summary
          class="cursor-pointer text-muted hover:text-body transition-colors mb-2 select-none"
        >
          {passes.length} passing checks
        </summary>
        <div class="grid sm:grid-cols-2 xl:grid-cols-3 gap-x-4 gap-y-1 font-mono text-muted">
          {#each passes as r (r.name)}
            <div class="flex items-baseline gap-2">
              <span class="text-success">✓</span>
              <span class="text-body truncate flex-1" title={r.name}>{r.name}</span>
              <span class="text-muted/60 text-[10px]">{r.duration}ms</span>
            </div>
          {/each}
        </div>
      </details>
    {:else if !endpointSweep.loading}
      <div class="text-xs text-muted italic">
        Click Run check to test every /system page endpoint.
      </div>
    {/if}
  </div>
</PageLayout>
