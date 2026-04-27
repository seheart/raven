<script>
  import { createPageApi } from '../apiClient.js';
  import { onMount } from 'svelte';
  import { formatShortDateTime } from '../timeFormat.js';
  import { websocketService } from '../services/websocket.js';
  import { PageLayout, PageHeader } from '../components/layout/index.js';
  import { RefreshButton } from '../components/ui/index.js';
  const { api, abort: abortRequests } = createPageApi();

  let data = $state({ latest: null, history: [], is_running: false });
  let loading = $state(true);
  let triggering = $state(false);
  let expandedCheck = $state(null);
  let selectedRun = $state(null);
  let copyStatus = $state('');

  // Live progress tracking
  let progress = $state(null); // { checkIndex, totalChecks, currentCheck }
  let completedChecks = $state([]); // live terminal log of completed checks
  let analysisStartTime = $state(null);
  let elapsedTick = $state(0); // increments every second to force reactivity

  // Estimate remaining time based on previous run's durations
  const timeEstimate = $derived.by(() => {
    if (!progress || !analysisStartTime) return null;
    const elapsed = Date.now() - analysisStartTime;

    // Use previous run's total duration as baseline estimate
    const prevDuration = data.latest?.duration_ms;
    if (!prevDuration) {
      // No previous run — show elapsed only
      return { elapsed, remaining: null, total: null };
    }

    // Calculate progress-weighted estimate: use actual elapsed for completed portion,
    // scale remaining portion from previous run's per-check times
    const pct = progress.checkIndex / progress.totalChecks;
    const estimatedTotal = pct > 0.1 ? elapsed / pct : prevDuration;
    const remaining = Math.max(0, estimatedTotal - elapsed);

    return { elapsed, remaining: Math.round(remaining), total: Math.round(estimatedTotal) };
  });

  // The run to display — either selected from history or latest
  const displayRun = $derived(selectedRun || data.latest);

  const overallColor = $derived.by(() => {
    if (!displayRun) return 'var(--muted)';
    if (displayRun.overall_score === 'healthy') return 'var(--success)';
    if (displayRun.overall_score === 'warning') return 'var(--warning)';
    return 'var(--error)';
  });

  const overallLabel = $derived.by(() => {
    if (!displayRun) return 'No Data';
    if (displayRun.status === 'running') return 'Running...';
    if (displayRun.overall_score === 'healthy') return 'Healthy';
    if (displayRun.overall_score === 'warning') return 'Warnings';
    return 'Issues Found';
  });

  const categories = $derived.by(() => {
    if (!displayRun?.checks) return [];
    const cats = {};
    for (const check of displayRun.checks) {
      if (!cats[check.category]) cats[check.category] = [];
      cats[check.category].push(check);
    }
    return Object.entries(cats);
  });

  async function loadData() {
    try {
      loading = true;
      const result = await api.get('/analysis/code-health');
      data = result;
      // Sync triggering state with server — if server says not running, stop showing progress
      if (!result.is_running && triggering) {
        triggering = false;
        progress = null;
        completedChecks = [];
        analysisStartTime = null;
        clearInterval(elapsedInterval);
      }
    } catch (_err) {
      // Silent — page shows empty state
    } finally {
      loading = false;
    }
  }

  async function loadRun(id) {
    try {
      const run = await api.get(`/analysis/code-health/${id}`);
      selectedRun = run;
    } catch {
      // Silent
    }
  }

  let elapsedInterval = null;

  function startElapsedTimer() {
    clearInterval(elapsedInterval);
    elapsedInterval = setInterval(() => { elapsedTick++; }, 1000);
  }

  async function triggerAnalysis() {
    try {
      triggering = true;
      progress = null;
      completedChecks = [];
      analysisStartTime = Date.now();
      startElapsedTimer();
      await api.post('/analysis/code-health/run');
      // Poll for completion
      pollForCompletion();
    } catch {
      triggering = false;
    }
  }

  function pollForCompletion() {
    const interval = setInterval(async () => {
      try {
        const result = await api.get('/analysis/code-health');
        data = result;
        if (!result.is_running) {
          clearInterval(interval);
          triggering = false;
          progress = null;
          completedChecks = [];
          analysisStartTime = null;
          clearInterval(elapsedInterval);
          selectedRun = null;
        }
      } catch {
        clearInterval(interval);
        triggering = false;
      }
    }, 5000);
  }

  function formatDuration(ms) {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  }

  function formatTimestamp(ts) {
    if (!ts) return '-';
    return formatShortDateTime(ts);
  }

  function relativeTime(ts) {
    if (!ts) return '';
    const diff = Date.now() - new Date(ts).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return 'less than an hour ago';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  function statusIcon(status) {
    if (status === 'pass') return '\u2713';
    if (status === 'warn') return '!';
    return '\u2717';
  }

  function statusColor(status) {
    if (status === 'pass') return 'var(--success)';
    if (status === 'warn') return 'var(--warning)';
    return 'var(--error)';
  }

  function categoryLabel(cat) {
    const labels = {
      tests: 'Tests',
      lint: 'Linting',
      types: 'Type Checking',
      format: 'Formatting',
      security: 'Security',
      build: 'Build',
      contract: 'API Contract',
      'dead-code': 'Dead Code'
    };
    return labels[cat] || cat;
  }

  function toggleCheck(checkId) {
    expandedCheck = expandedCheck === checkId ? null : checkId;
  }

  const issueCount = $derived(
    (displayRun?.failed_checks || 0) + (displayRun?.warned_checks || 0)
  );

  function buildIssuesText() {
    if (!displayRun?.checks) return '';
    const issues = displayRun.checks.filter((c) => c.status !== 'pass');
    if (!issues.length) return '';
    const header = [
      `Raven Code Health — ${formatTimestamp(displayRun.timestamp)}`,
      `Overall: ${displayRun.overall_score} (${displayRun.passed_checks}/${displayRun.total_checks} passed, ${displayRun.warned_checks} warn, ${displayRun.failed_checks} fail)`,
      ''
    ].join('\n');
    const body = issues
      .map((c) => {
        const tag = c.status === 'fail' ? 'FAIL' : 'WARN';
        const out = (c.output || '').trim();
        return `[${tag}] ${c.name}: ${c.summary || ''}\n${out}`;
      })
      .join('\n\n');
    return header + body;
  }

  async function copyIssues() {
    const text = buildIssuesText();
    if (!text) {
      copyStatus = 'No issues';
      setTimeout(() => (copyStatus = ''), 1500);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      copyStatus = 'Copied!';
    } catch {
      copyStatus = 'Copy failed';
    }
    setTimeout(() => (copyStatus = ''), 1500);
  }

  onMount(() => {
    loadData();

    // If already running, start polling and timer
    if (data.is_running) {
      triggering = true;
      analysisStartTime = Date.now();
      startElapsedTimer();
      pollForCompletion();
    }

    // Listen for live progress updates
    const handleProgress = (data) => {
      progress = data;
      if (data.completedCheck) {
        completedChecks = [...completedChecks, data.completedCheck];
      }
    };
    websocketService.on('analysis-progress', handleProgress);

    return () => {
      abortRequests();
      websocketService.off('analysis-progress', handleProgress);
      clearInterval(elapsedInterval);
    };
  });
</script>

<PageLayout>
  <PageHeader title="Code Health" description="On-demand analysis — click Run Now to check">
    {#snippet actions()}
      <div class="flex items-center gap-3">
        {#if displayRun && issueCount > 0}
          <button
            onclick={copyIssues}
            title="Copy issues to clipboard"
            class="px-3 py-1.5 bg-surface border border-border rounded text-sm font-sans hover:border-accent transition-colors"
          >
            {copyStatus || `Copy Issues (${issueCount})`}
          </button>
        {/if}
        <RefreshButton onClick={loadData} loading={loading} />
        <button
          onclick={triggerAnalysis}
          disabled={triggering || data.is_running}
          class="px-3 py-1.5 bg-accent text-white rounded text-sm font-sans hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {triggering || data.is_running ? 'Analyzing...' : 'Run Now'}
        </button>
      </div>
    {/snippet}
  </PageHeader>

    <!-- Last Run Info Bar -->
    {#if displayRun}
      <div class="bg-surface border border-border rounded-lg px-4 py-2.5 mb-4 flex items-center gap-4 flex-wrap">
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full" style="background: {overallColor}"></span>
          <span class="text-xs font-semibold text-muted uppercase tracking-wide">Last Run</span>
        </div>
        <span class="text-xs font-mono text-body">{formatTimestamp(displayRun.timestamp)}</span>
        <span class="text-xs text-muted">({relativeTime(displayRun.timestamp)})</span>
        {#if displayRun.duration_ms}
          <span class="text-border">|</span>
          <span class="text-xs font-mono text-muted">Duration: <span class="text-body">{formatDuration(displayRun.duration_ms)}</span></span>
        {/if}
        <span class="text-border">|</span>
        <span class="text-xs font-mono text-muted">
          <span style="color: var(--success)">{displayRun.passed_checks} passed</span>
          {#if displayRun.warned_checks > 0}
            <span class="mx-1" style="color: var(--warning)">{displayRun.warned_checks} warned</span>
          {/if}
          {#if displayRun.failed_checks > 0}
            <span class="mx-1" style="color: var(--error)">{displayRun.failed_checks} failed</span>
          {/if}
        </span>
        {#if selectedRun}
          <div class="flex-1"></div>
          <button
            onclick={() => { selectedRun = null; }}
            class="text-xs text-accent font-sans hover:underline bg-transparent border-0 cursor-pointer p-0"
          >Back to latest</button>
        {/if}
      </div>
    {/if}

    {#if loading && !displayRun}
      <!-- Loading skeleton -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
        {#each Array(4) as _, i (i)}
          <div class="h-24 bg-surface border border-border rounded-lg animate-pulse"></div>
        {/each}
      </div>
    {:else if !displayRun}
      <!-- No data state -->
      <div class="bg-surface border border-border rounded-lg p-12 text-center">
        <div class="text-4xl mb-4 opacity-30">&#x1F50D;</div>
        <h3 class="text-lg font-bold text-heading mb-2">No Analysis Yet</h3>
        <p class="text-sm text-muted font-sans mb-6">
          The first automated analysis will run shortly, or you can trigger one now.
        </p>
        <button
          onclick={triggerAnalysis}
          disabled={triggering}
          class="px-4 py-2 bg-accent text-white rounded text-sm font-sans hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {triggering ? 'Starting...' : 'Run Analysis'}
        </button>
      </div>
    {:else}
      <!-- Summary Cards -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
        <div class="bg-surface border border-border rounded p-4">
          <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Overall</div>
          <div class="flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full" style="background: {overallColor}"></span>
            <span class="text-sm font-mono text-body">{overallLabel}</span>
          </div>
        </div>

        <div class="bg-surface border border-border rounded p-4">
          <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Passed</div>
          <div class="flex items-center gap-2">
            <span class="text-lg font-mono font-bold" style="color: var(--success)">{displayRun.passed_checks}</span>
            <span class="text-xs text-muted">/ {displayRun.total_checks}</span>
          </div>
        </div>

        <div class="bg-surface border border-border rounded p-4">
          <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Warnings</div>
          <div class="flex items-center gap-2">
            <span class="text-lg font-mono font-bold" style="color: {displayRun.warned_checks > 0 ? 'var(--warning)' : 'var(--muted)'}">{displayRun.warned_checks}</span>
          </div>
        </div>

        <div class="bg-surface border border-border rounded p-4">
          <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Failed</div>
          <div class="flex items-center gap-2">
            <span class="text-lg font-mono font-bold" style="color: {displayRun.failed_checks > 0 ? 'var(--error)' : 'var(--muted)'}">{displayRun.failed_checks}</span>
          </div>
        </div>
      </div>

      <!-- Running indicator with progress bar and live terminal -->
      {#if displayRun.status === 'running' || triggering}
        <div class="bg-surface border border-accent rounded-lg mb-6 overflow-hidden">
          <!-- Progress header -->
          <div class="px-4 py-3 flex items-center gap-3 border-b border-border">
            <div class="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin flex-shrink-0"></div>
            <span class="text-sm text-body font-sans flex-1">
              {#if progress}
                Running: <span class="font-mono text-accent">{progress.currentCheck}</span>
                <span class="text-muted">({progress.checkIndex}/{progress.totalChecks})</span>
              {:else}
                Starting analysis...
              {/if}
            </span>
            {#if timeEstimate && elapsedTick >= 0}
              <span class="text-xs font-mono text-muted flex-shrink-0">
                {formatDuration(Date.now() - analysisStartTime)}
                {#if timeEstimate.remaining !== null}
                  <span class="text-border mx-1">/</span>
                  <span class="text-body">~{formatDuration(timeEstimate.total)}</span>
                  <span class="ml-1 text-muted">({formatDuration(timeEstimate.remaining)} left)</span>
                {/if}
              </span>
            {/if}
          </div>

          <!-- Progress bar -->
          {#if progress}
            <div class="h-1.5 bg-canvas">
              <div
                class="h-full bg-accent transition-all duration-500"
                style="width: {(progress.checkIndex / progress.totalChecks) * 100}%"
              ></div>
            </div>
          {/if}

          <!-- Live terminal output -->
          {#if completedChecks.length > 0}
            <div class="px-4 py-3 max-h-64 overflow-y-auto font-mono text-xs" style="background: var(--bg)">
              {#each completedChecks as check, i (i)}
                <div class="flex items-start gap-2 py-1 {i < completedChecks.length - 1 ? 'border-b border-border' : ''}">
                  <span class="flex-shrink-0 w-4 text-center font-bold" style="color: {statusColor(check.status)}">{statusIcon(check.status)}</span>
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

      <!-- Check Results by Category -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {#each categories as [category, checks] (category)}
          <div class="bg-surface border border-border rounded-lg p-5">
            <h3 class="text-xs font-semibold text-muted uppercase tracking-wide mb-4">
              {categoryLabel(category)}
            </h3>
            <div class="space-y-2">
              {#each checks as check (check.id || check.name)}
                <button
                  onclick={() => toggleCheck(check.id || check.name)}
                  class="w-full text-left"
                >
                  <div class="flex items-center gap-3 px-3 py-2 bg-canvas rounded border border-border hover:border-accent transition-colors">
                    <span
                      class="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style="background: {statusColor(check.status)}20; color: {statusColor(check.status)}"
                    >
                      {statusIcon(check.status)}
                    </span>
                    <span class="text-sm font-mono text-body flex-1">{check.name}</span>
                    <span class="text-xs text-muted font-mono">{formatDuration(check.duration_ms)}</span>
                    <span class="text-xs px-2 py-0.5 rounded font-mono"
                      style="background: {statusColor(check.status)}15; color: {statusColor(check.status)}"
                    >
                      {check.summary}
                    </span>
                  </div>
                </button>

                {#if expandedCheck === (check.id || check.name)}
                  <div class="ml-8 bg-canvas border border-border rounded p-3 overflow-hidden">
                    <pre class="text-xs font-mono text-muted whitespace-pre-wrap max-h-80 overflow-y-auto leading-relaxed">{check.output || 'No output captured'}</pre>
                  </div>
                {/if}
              {/each}
            </div>
          </div>
        {/each}
      </div>

      <!-- Run info bar -->
      <div class="bg-surface border border-border rounded-lg p-4 mb-6">
        <div class="flex flex-wrap gap-6 text-sm">
          <div>
            <span class="text-muted">Run ID</span>
            <span class="font-mono text-body ml-2">#{displayRun.id}</span>
          </div>
          <div>
            <span class="text-muted">Timestamp</span>
            <span class="font-mono text-body ml-2">{formatTimestamp(displayRun.timestamp)}</span>
          </div>
          <div>
            <span class="text-muted">Duration</span>
            <span class="font-mono text-body ml-2">{formatDuration(displayRun.duration_ms)}</span>
          </div>
        </div>
      </div>

      <!-- History -->
      {#if data.history.length > 1}
        <div class="bg-surface border border-border rounded-lg p-5">
          <h3 class="text-xs font-semibold text-muted uppercase tracking-wide mb-4">
            Run History
          </h3>
          <div class="space-y-2 max-h-80 overflow-y-auto">
            {#each data.history as run (run.id)}
              <button
                onclick={() => { selectedRun = null; loadRun(run.id); }}
                class="w-full flex items-center gap-3 px-3 py-2 bg-canvas rounded border transition-colors text-left {displayRun?.id === run.id ? 'border-accent' : 'border-border hover:border-accent'}"
              >
                <span
                  class="w-2 h-2 rounded-full flex-shrink-0"
                  style="background: {run.overall_score === 'healthy' ? 'var(--success)' : run.overall_score === 'warning' ? 'var(--warning)' : 'var(--error)'}"
                ></span>
                <span class="text-xs font-mono text-muted">#{run.id}</span>
                <span class="text-xs font-mono text-body flex-1">{formatTimestamp(run.timestamp)}</span>
                <span class="text-xs text-muted">
                  {run.passed_checks}/{run.total_checks} passed
                </span>
                <span class="text-xs font-mono text-muted">{formatDuration(run.duration_ms)}</span>
              </button>
            {/each}
          </div>
        </div>
      {/if}
    {/if}
</PageLayout>
