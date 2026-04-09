<script>
  import { logger } from '../logger.js';
  import { createPageApi } from '../apiClient.js';
  const { api, abort: abortRequests } = createPageApi();
  import { onMount, tick } from 'svelte';
  import { websocketService } from '../services/websocket.js';
  import { Chart, registerables } from 'chart.js';
  import { createThemeObserver, getChartColors } from '../utils/chartUtils.js';

  Chart.register(...registerables);

  // State
  let summary = $state({ total_requests: 0, total_input_tokens: 0, total_output_tokens: 0, total_cache_creation_tokens: 0, total_cache_read_tokens: 0, total_cost_usd: 0 });
  let byProject = $state([]);
  let byModel = $state([]);
  let bySessions = $state([]);
  let timeline = $state([]);
  let loading = $state(true);
  let lastUpdated = $state(null);
  let timeRange = $state('today');

  // Charts
  let costChartCanvas = $state(null);
  let modelChartCanvas = $state(null);
  let costChart = null;
  let modelChart = null;
  let themeObserver = null;

  const timeAgo = $derived.by(() => {
    if (!lastUpdated) return 'Just now';
    const seconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
    if (seconds < 10) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    return `${Math.floor(seconds / 60)}m ago`;
  });

  function getTimeRangeParams() {
    const now = new Date();
    let start;
    if (timeRange === 'today') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    } else if (timeRange === '7d') {
      start = new Date(now.getTime() - 7 * 86400000).toISOString();
    } else if (timeRange === '30d') {
      start = new Date(now.getTime() - 30 * 86400000).toISOString();
    } else {
      return '';
    }
    return `start=${encodeURIComponent(start)}`;
  }

  async function loadData() {
    try {
      loading = true;
      const params = getTimeRangeParams();
      const bucket = timeRange === 'today' ? 'hour' : 'day';

      const [summaryData, projectData, modelData, sessionData, timelineData] = await Promise.all([
        api.get(`/costs/summary?${params}`).catch(() => ({})),
        api.get(`/costs/by-project?${params}`).catch(() => []),
        api.get(`/costs/by-model?${params}`).catch(() => []),
        api.get(`/costs/by-session?${params}&limit=20`).catch(() => []),
        api.get(`/costs/timeline?${params}&bucket=${bucket}`).catch(() => [])
      ]);

      summary = summaryData;
      byProject = Array.isArray(projectData) ? projectData : [];
      byModel = Array.isArray(modelData) ? modelData : [];
      bySessions = Array.isArray(sessionData) ? sessionData : [];
      timeline = Array.isArray(timelineData) ? timelineData : [];

      lastUpdated = new Date();
    } catch (err) {
      logger.error('Failed to load cost data:', err);
    } finally {
      loading = false;
      await tick();
      updateCharts();
    }
  }

  function updateCharts() {
    const colors = getChartColors();

    // Cost timeline chart
    if (costChartCanvas && timeline.length > 0) {
      if (costChart) costChart.destroy();
      costChart = new Chart(costChartCanvas, {
        type: 'bar',
        data: {
          labels: timeline.map(t => {
            if (timeRange === 'today') {
              const hour = t.bucket?.split('T')[1];
              return hour ? `${hour}:00` : t.bucket;
            }
            return t.bucket?.split('T')[0] || t.bucket;
          }),
          datasets: [{
            label: 'Cost ($)',
            data: timeline.map(t => t.cost_usd),
            backgroundColor: colors.accent + '80',
            borderColor: colors.accent,
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: ctx => `$${ctx.parsed.y.toFixed(4)}`
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: v => `$${Number(v).toFixed(3)}`,
                color: colors.muted
              },
              grid: { color: colors.border }
            },
            x: {
              ticks: { color: colors.muted },
              grid: { display: false }
            }
          }
        }
      });
    }

    // Model breakdown donut
    if (modelChartCanvas && byModel.length > 0) {
      if (modelChart) modelChart.destroy();
      const palette = ['#FF6B35', '#10A37F', '#4285F4', '#F39C12', '#8B5CF6', '#E11D48'];
      modelChart = new Chart(modelChartCanvas, {
        type: 'doughnut',
        data: {
          labels: byModel.map(m => m.model_family || m.model),
          datasets: [{
            data: byModel.map(m => m.cost_usd),
            backgroundColor: palette.slice(0, byModel.length),
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: colors.text, font: { size: 11 } }
            },
            tooltip: {
              callbacks: {
                label: ctx => `${ctx.label || 'Unknown'}: $${(ctx.parsed || 0).toFixed(4)}`
              }
            }
          }
        }
      });
    }
  }

  function formatCost(usd) {
    if (usd === 0) return '$0.00';
    if (usd < 0.01) return `$${usd.toFixed(4)}`;
    if (usd < 1) return `$${usd.toFixed(3)}`;
    return `$${usd.toFixed(2)}`;
  }

  function formatTokens(n) {
    if (!n) return '0';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
  }

  function setTimeRange(range) {
    timeRange = range;
    loadData();
  }

  onMount(() => {
    websocketService.connect();
    loadData();

    const onTokenUsage = () => loadData();
    websocketService.on('token-usage', onTokenUsage);

    themeObserver = createThemeObserver(() => updateCharts());

    return () => {
      abortRequests();
      websocketService.off('token-usage', onTokenUsage);
      if (costChart) costChart.destroy();
      if (modelChart) modelChart.destroy();
      if (themeObserver) themeObserver.disconnect();
    };
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-6xl mx-auto">
    <!-- Header -->
    <div class="flex justify-between items-start mb-6 flex-wrap gap-4">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">Costs & Token Usage</h1>
        <p class="text-sm text-[var(--muted)] font-sans">
          Claude API token consumption and estimated spend
        </p>
      </div>
      <div class="flex items-center gap-3">
        <div class="flex bg-[var(--surface)] border border-[var(--border)] rounded overflow-hidden">
          {#each [['today', 'Today'], ['7d', '7 Days'], ['30d', '30 Days'], ['all', 'All']] as [value, label]}
            <button
              onclick={() => setTimeRange(value)}
              class="px-3 py-1.5 text-xs font-sans transition-colors border-0 cursor-pointer {timeRange === value ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)] hover:text-[var(--text)]'}"
            >{label}</button>
          {/each}
        </div>
        <span class="text-xs text-[var(--muted)] font-mono">{timeAgo}</span>
        <button
          onclick={loadData}
          disabled={loading}
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors disabled:opacity-50"
        >
          {loading ? '...' : '↻'} Refresh
        </button>
      </div>
    </div>

    {#if loading && !summary.total_requests}
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {#each Array(4) as _, i (i)}
          <div class="h-24 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-pulse"></div>
        {/each}
      </div>
    {:else}
      <!-- Summary Cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
          <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">Total Spend</div>
          <div class="text-2xl font-bold text-[var(--accent)] font-mono">{formatCost(summary.total_cost_usd)}</div>
        </div>
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
          <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">Requests</div>
          <div class="text-2xl font-bold text-[var(--text)] font-mono">{summary.total_requests?.toLocaleString()}</div>
        </div>
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
          <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">Input Tokens</div>
          <div class="text-2xl font-bold text-[var(--text)] font-mono">{formatTokens(summary.total_input_tokens)}</div>
          <div class="text-xs text-[var(--muted)] mt-1">+ {formatTokens(summary.total_cache_read_tokens)} cached</div>
        </div>
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
          <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">Output Tokens</div>
          <div class="text-2xl font-bold text-[var(--text)] font-mono">{formatTokens(summary.total_output_tokens)}</div>
        </div>
      </div>

      <!-- Charts Row -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div class="md:col-span-2 bg-[var(--surface)] border border-[var(--border)] rounded p-4">
          <h3 class="text-sm font-semibold text-[var(--text-heading)] mb-3">Cost Over Time</h3>
          <div class="h-48">
            <canvas bind:this={costChartCanvas}></canvas>
          </div>
        </div>
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
          <h3 class="text-sm font-semibold text-[var(--text-heading)] mb-3">By Model</h3>
          <div class="h-48">
            {#if byModel.length > 0}
              <canvas bind:this={modelChartCanvas}></canvas>
            {:else}
              <div class="flex items-center justify-center h-full text-sm text-[var(--muted)]">No model data</div>
            {/if}
          </div>
        </div>
      </div>

      <!-- Model Breakdown -->
      {#if byModel.length > 0}
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4 mb-6">
          <h3 class="text-sm font-semibold text-[var(--text-heading)] mb-3">Cost by Model</h3>
          <div class="overflow-x-auto">
            <table class="w-full text-sm font-mono">
              <thead>
                <tr class="text-left text-xs text-[var(--muted)] uppercase tracking-wide border-b border-[var(--border)]">
                  <th class="pb-2 pr-4">Model</th>
                  <th class="pb-2 pr-4 text-right">Requests</th>
                  <th class="pb-2 pr-4 text-right">Input</th>
                  <th class="pb-2 pr-4 text-right">Output</th>
                  <th class="pb-2 text-right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {#each byModel as model (model.model)}
                  <tr class="border-b border-[var(--border)] border-opacity-50 hover:bg-[var(--bg)] transition-colors">
                    <td class="py-2 pr-4 text-[var(--text)]">{model.model_family || model.model}</td>
                    <td class="py-2 pr-4 text-right text-[var(--muted)]">{model.requests}</td>
                    <td class="py-2 pr-4 text-right text-[var(--muted)]">{formatTokens(model.input_tokens)}</td>
                    <td class="py-2 pr-4 text-right text-[var(--muted)]">{formatTokens(model.output_tokens)}</td>
                    <td class="py-2 text-right text-[var(--accent)] font-semibold">{formatCost(model.cost_usd)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      {/if}

      <!-- Project Breakdown -->
      {#if byProject.length > 0}
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4 mb-6">
          <h3 class="text-sm font-semibold text-[var(--text-heading)] mb-3">Cost by Project</h3>
          <div class="overflow-x-auto">
            <table class="w-full text-sm font-mono">
              <thead>
                <tr class="text-left text-xs text-[var(--muted)] uppercase tracking-wide border-b border-[var(--border)]">
                  <th class="pb-2 pr-4">Project</th>
                  <th class="pb-2 pr-4 text-right">Requests</th>
                  <th class="pb-2 pr-4 text-right">Input</th>
                  <th class="pb-2 pr-4 text-right">Output</th>
                  <th class="pb-2 text-right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {#each byProject as project (project.project_name)}
                  <tr class="border-b border-[var(--border)] border-opacity-50 hover:bg-[var(--bg)] transition-colors">
                    <td class="py-2 pr-4 text-[var(--text)]">{project.project_name || '(unknown)'}</td>
                    <td class="py-2 pr-4 text-right text-[var(--muted)]">{project.requests}</td>
                    <td class="py-2 pr-4 text-right text-[var(--muted)]">{formatTokens(project.input_tokens)}</td>
                    <td class="py-2 pr-4 text-right text-[var(--muted)]">{formatTokens(project.output_tokens)}</td>
                    <td class="py-2 text-right text-[var(--accent)] font-semibold">{formatCost(project.cost_usd)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      {/if}

      <!-- Recent Sessions -->
      {#if bySessions.length > 0}
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
          <h3 class="text-sm font-semibold text-[var(--text-heading)] mb-3">Recent Sessions</h3>
          <div class="space-y-2">
            {#each bySessions as session (session.session_id)}
              <div class="flex items-center justify-between py-2 px-3 rounded bg-[var(--bg)] text-sm">
                <div>
                  <span class="text-[var(--text)] font-medium">{session.project_name || session.session_id?.slice(0, 8)}</span>
                  <span class="text-[var(--muted)] text-xs ml-2">{session.requests} requests</span>
                </div>
                <div class="flex items-center gap-4">
                  <span class="text-xs text-[var(--muted)]">{formatTokens(session.input_tokens + session.output_tokens)} tokens</span>
                  <span class="text-[var(--accent)] font-mono font-semibold">{formatCost(session.cost_usd)}</span>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      {#if !loading && summary.total_requests === 0}
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-12 text-center">
          <div class="text-4xl mb-4">💰</div>
          <h3 class="text-lg font-semibold text-[var(--text-heading)] mb-2">No token usage recorded yet</h3>
          <p class="text-sm text-[var(--muted)]">
            Token usage will appear here as Claude Code sessions generate API calls.
            Historical data from existing logs will be imported on first startup.
          </p>
        </div>
      {/if}
    {/if}
  </div>
</div>
