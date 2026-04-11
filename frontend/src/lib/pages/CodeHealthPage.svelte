<script>
  import { createPageApi } from '../apiClient.js';
  import { onMount } from 'svelte';
  const { api, abort: abortRequests } = createPageApi();

  let data = $state({ latest: null, history: [], is_running: false });
  let loading = $state(true);
  let triggering = $state(false);
  let lastUpdated = $state(null);
  let expandedCheck = $state(null);
  let selectedRun = $state(null);

  const timeAgo = $derived.by(() => {
    if (!lastUpdated) return 'Just now';
    const seconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
    if (seconds < 10) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
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
      lastUpdated = new Date();
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

  async function triggerAnalysis() {
    try {
      triggering = true;
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
          selectedRun = null;
          lastUpdated = new Date();
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
    return new Date(ts).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
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
      build: 'Build'
    };
    return labels[cat] || cat;
  }

  function toggleCheck(checkId) {
    expandedCheck = expandedCheck === checkId ? null : checkId;
  }

  onMount(() => {
    loadData();

    // If already running, start polling
    if (data.is_running) {
      triggering = true;
      pollForCompletion();
    }

    return () => abortRequests();
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-6xl mx-auto">
    <!-- Header -->
    <div class="flex justify-between items-start mb-6 flex-wrap gap-4">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">Code Health</h1>
        <p class="text-sm text-[var(--muted)] font-sans">
          Automated analysis runs every 24 hours
          {#if displayRun}
            &middot; Last run: {relativeTime(displayRun.timestamp)}
          {/if}
        </p>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-xs text-[var(--muted)] font-mono">{timeAgo}</span>
        <button
          onclick={loadData}
          disabled={loading}
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors disabled:opacity-50"
        >
          {loading ? '...' : '\u21BB'} Refresh
        </button>
        <button
          onclick={triggerAnalysis}
          disabled={triggering || data.is_running}
          class="px-3 py-1.5 bg-[var(--accent)] text-white rounded text-sm font-sans hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {triggering || data.is_running ? 'Analyzing...' : 'Run Now'}
        </button>
      </div>
    </div>

    {#if loading && !displayRun}
      <!-- Loading skeleton -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
        {#each Array(4) as _, i (i)}
          <div class="h-24 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-pulse"></div>
        {/each}
      </div>
    {:else if !displayRun}
      <!-- No data state -->
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center">
        <div class="text-4xl mb-4 opacity-30">&#x1F50D;</div>
        <h2 class="text-lg font-bold text-[var(--text-heading)] mb-2">No Analysis Yet</h2>
        <p class="text-sm text-[var(--muted)] font-sans mb-6">
          The first automated analysis will run shortly, or you can trigger one now.
        </p>
        <button
          onclick={triggerAnalysis}
          disabled={triggering}
          class="px-4 py-2 bg-[var(--accent)] text-white rounded text-sm font-sans hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {triggering ? 'Starting...' : 'Run Analysis'}
        </button>
      </div>
    {:else}
      <!-- Summary Cards -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
          <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">Overall</div>
          <div class="flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full" style="background: {overallColor}"></span>
            <span class="text-sm font-mono text-[var(--text)]">{overallLabel}</span>
          </div>
        </div>

        <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
          <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">Passed</div>
          <div class="flex items-center gap-2">
            <span class="text-lg font-mono font-bold" style="color: var(--success)">{displayRun.passed_checks}</span>
            <span class="text-xs text-[var(--muted)]">/ {displayRun.total_checks}</span>
          </div>
        </div>

        <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
          <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">Warnings</div>
          <div class="flex items-center gap-2">
            <span class="text-lg font-mono font-bold" style="color: {displayRun.warned_checks > 0 ? 'var(--warning)' : 'var(--muted)'}">{displayRun.warned_checks}</span>
          </div>
        </div>

        <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
          <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">Failed</div>
          <div class="flex items-center gap-2">
            <span class="text-lg font-mono font-bold" style="color: {displayRun.failed_checks > 0 ? 'var(--error)' : 'var(--muted)'}">{displayRun.failed_checks}</span>
          </div>
        </div>
      </div>

      <!-- Running indicator -->
      {#if displayRun.status === 'running'}
        <div class="bg-[var(--surface)] border border-[var(--accent)] rounded-lg p-4 mb-6 flex items-center gap-3">
          <div class="w-4 h-4 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin"></div>
          <span class="text-sm text-[var(--text)] font-sans">Analysis in progress... This may take a few minutes.</span>
        </div>
      {/if}

      <!-- Check Results by Category -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {#each categories as [category, checks] (category)}
          <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
            <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-4">
              {categoryLabel(category)}
            </h3>
            <div class="space-y-2">
              {#each checks as check (check.id || check.name)}
                <button
                  onclick={() => toggleCheck(check.id || check.name)}
                  class="w-full text-left"
                >
                  <div class="flex items-center gap-3 px-3 py-2 bg-[var(--bg)] rounded border border-[var(--border)] hover:border-[var(--accent)] transition-colors">
                    <span
                      class="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style="background: {statusColor(check.status)}20; color: {statusColor(check.status)}"
                    >
                      {statusIcon(check.status)}
                    </span>
                    <span class="text-sm font-mono text-[var(--text)] flex-1">{check.name}</span>
                    <span class="text-xs text-[var(--muted)] font-mono">{formatDuration(check.duration_ms)}</span>
                    <span class="text-xs px-2 py-0.5 rounded font-mono"
                      style="background: {statusColor(check.status)}15; color: {statusColor(check.status)}"
                    >
                      {check.summary}
                    </span>
                  </div>
                </button>

                {#if expandedCheck === (check.id || check.name)}
                  <div class="ml-8 bg-[var(--bg)] border border-[var(--border)] rounded p-3 overflow-hidden">
                    <pre class="text-xs font-mono text-[var(--muted)] whitespace-pre-wrap max-h-80 overflow-y-auto leading-relaxed">{check.output || 'No output captured'}</pre>
                  </div>
                {/if}
              {/each}
            </div>
          </div>
        {/each}
      </div>

      <!-- Run info bar -->
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 mb-6">
        <div class="flex flex-wrap gap-6 text-sm">
          <div>
            <span class="text-[var(--muted)]">Run ID</span>
            <span class="font-mono text-[var(--text)] ml-2">#{displayRun.id}</span>
          </div>
          <div>
            <span class="text-[var(--muted)]">Timestamp</span>
            <span class="font-mono text-[var(--text)] ml-2">{formatTimestamp(displayRun.timestamp)}</span>
          </div>
          <div>
            <span class="text-[var(--muted)]">Duration</span>
            <span class="font-mono text-[var(--text)] ml-2">{formatDuration(displayRun.duration_ms)}</span>
          </div>
        </div>
      </div>

      <!-- History -->
      {#if data.history.length > 1}
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
          <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-4">
            Run History
          </h3>
          <div class="space-y-2 max-h-80 overflow-y-auto">
            {#each data.history as run (run.id)}
              <button
                onclick={() => { selectedRun = null; loadRun(run.id); }}
                class="w-full flex items-center gap-3 px-3 py-2 bg-[var(--bg)] rounded border transition-colors text-left {displayRun?.id === run.id ? 'border-[var(--accent)]' : 'border-[var(--border)] hover:border-[var(--accent)]'}"
              >
                <span
                  class="w-2 h-2 rounded-full flex-shrink-0"
                  style="background: {run.overall_score === 'healthy' ? 'var(--success)' : run.overall_score === 'warning' ? 'var(--warning)' : 'var(--error)'}"
                ></span>
                <span class="text-xs font-mono text-[var(--muted)]">#{run.id}</span>
                <span class="text-xs font-mono text-[var(--text)] flex-1">{formatTimestamp(run.timestamp)}</span>
                <span class="text-xs text-[var(--muted)]">
                  {run.passed_checks}/{run.total_checks} passed
                </span>
                <span class="text-xs font-mono text-[var(--muted)]">{formatDuration(run.duration_ms)}</span>
              </button>
            {/each}
          </div>
        </div>
      {/if}
    {/if}
  </div>
</div>
