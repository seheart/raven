<script>
  /**
   * Process Activity Page — Network Activity Monitor
   * Shows real-time agent activity states, network connections, and API latency.
   */
  import { onMount } from 'svelte';
  import { createPageApi } from '../apiClient.js';
  import { PageLayout, PageHeader, StatusBar } from '../components/layout/index.js';
  import { FreshnessBadge, FilterToggle, RefreshButton } from '../components/ui/index.js';
  import DataFetchError from '../components/ui/DataFetchError.svelte';
  const { api, abort: abortRequests } = createPageApi();
  import { websocketService } from '../services/websocket.js';
  import { logger } from '../logger.js';
  import {
    createChart,
    destroyChart,
    createThemeObserver,
    getChartColors
  } from '../utils/chartUtils.js';

  let agents = $state([]);
  let latencyData = $state([]);
  let latencyStats = $state({ avg_ms: 0, p50_ms: 0, p95_ms: 0, count: 0, requests_per_min: 0 });
  let loading = $state(true);
  let loadError = $state(null);
  let lastUpdated = $state(new Date());

  // Chart
  let latencyChart = null;
  let themeObserver = null;
  let chartTimeRange = $state('1h');

  const chartLatencyData = $derived.by(() => {
    if (!latencyData.length) return [];
    const now = Date.now();
    const ranges = {
      '15m': 15 * 60000,
      '1h': 60 * 60000,
      '6h': 6 * 60 * 60000,
      '24h': 24 * 60 * 60000
    };
    const cutoff = now - (ranges[chartTimeRange] || ranges['1h']);
    return latencyData.filter(d => new Date(d.timestamp).getTime() >= cutoff);
  });

  // Static state colors → semantic utility classes (rule E). The activity
  // dot color is keyed off the fixed activity_state enum, so a class map is
  // the canonical form rather than an inline var(--…) style.
  function activityDotClass(state) {
    if (state === 'thinking') return 'bg-warning';
    if (state === 'executing') return 'bg-success';
    return 'bg-muted';
  }

  // Semantic text+subtle-bg classes for the activity badge. Replaces the
  // old inline `style="...{color}15"` which appended `15` to a `var(--x)`
  // and produced invalid CSS.
  function activityBadgeClass(state) {
    if (state === 'thinking') return 'text-warning bg-warning-subtle';
    if (state === 'executing') return 'text-success bg-success-subtle';
    return 'text-muted bg-surface-2';
  }

  // Latency threshold → semantic text class (rule E): >30s error, >10s
  // warning, else normal body text.
  function latencyTextClass(ms) {
    if (ms > 30000) return 'text-error';
    if (ms > 10000) return 'text-warning';
    return 'text-body';
  }

  function activityLabel(state) {
    if (state === 'thinking') return 'API Call';
    if (state === 'executing') return 'Executing';
    return 'Idle';
  }

  async function loadData() {
    try {
      loadError = null;
      const minutes =
        chartTimeRange === '24h'
          ? 1440
          : chartTimeRange === '6h'
            ? 360
            : chartTimeRange === '1h'
              ? 60
              : 15;
      const [activityRes, latencyRes] = await Promise.all([
        api.get('/process-activity'),
        api.get(`/api-latency?limit=500&minutes=${minutes}`)
      ]);
      agents = activityRes || [];
      latencyData = (latencyRes?.recent || []).reverse();
      latencyStats = latencyRes?.stats || latencyStats;
      lastUpdated = new Date();
      buildLatencyChart();
    } catch (err) {
      if (err?.name !== 'AbortError') {
        logger.error('ProcessActivityPage loadData failed:', err);
        loadError = err?.message || 'Failed to load process activity';
      }
    } finally {
      loading = false;
    }
  }

  function handleProcessActivity(data) {
    const idx = agents.findIndex(a => a.agent_name === data.agent_name);
    if (idx >= 0) {
      agents[idx] = { ...agents[idx], ...data };
    } else {
      agents = [...agents, data];
    }
    lastUpdated = new Date();
  }

  function handleApiLatency(data) {
    latencyData = [...latencyData, data].slice(-500);
    // requests_per_min is a server-computed rate; bumping `count` alone would
    // leave the displayed rate stale. Derive a live rate from the points that
    // actually fall inside the current chart window instead.
    latencyStats = {
      ...latencyStats,
      count: latencyStats.count + 1,
      requests_per_min: computeRequestsPerMin()
    };
    lastUpdated = new Date();
    // Rebuild from the windowed source so out-of-window points don't
    // accumulate on the chart until the next full reload.
    rebuildLatencyChart();
  }

  // Requests per minute over the active chart window, from the windowed data.
  function computeRequestsPerMin() {
    const points = chartLatencyData;
    if (points.length < 2) return latencyStats.requests_per_min || 0;
    const first = new Date(points[0].timestamp).getTime();
    const last = new Date(points[points.length - 1].timestamp).getTime();
    const minutes = Math.max((last - first) / 60000, 1 / 60);
    return Math.round(points.length / minutes);
  }

  // Debounce chart rebuilds so a burst of WS latency events (or rapid range
  // toggles) collapses into a single repaint instead of thrashing Chart.js.
  let rebuildTimer = null;
  function rebuildLatencyChart() {
    if (rebuildTimer) clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => {
      rebuildTimer = null;
      buildLatencyChart();
    }, 150);
  }

  function buildLatencyChart() {
    const colors = getChartColors();
    // Single windowed source of truth: the derived chartLatencyData is the
    // same window the table and stats read from, so the chart can't drift
    // from a separately-fetched window. createChart() destroys the prior
    // chart on this canvas, so no manual destroy dance here.
    const filtered = chartLatencyData;
    latencyChart = createChart('latency-chart', {
      type: 'line',
      data: {
        labels: filtered.map(d => new Date(d.timestamp).toLocaleTimeString()),
        datasets: [
          {
            label: 'Latency (s)',
            data: filtered.map(d => d.latency_ms / 1000),
            borderColor: colors.primary,
            backgroundColor: colors.primary + '20',
            fill: true,
            tension: 0.3,
            pointRadius: 2,
            pointHoverRadius: 4,
            borderWidth: 1.5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => `${ctx.parsed.y.toFixed(2)}s`
            }
          }
        },
        scales: {
          x: {
            display: true,
            ticks: { maxTicksLimit: 8, font: { size: 9 } },
            grid: { display: false }
          },
          y: {
            display: true,
            beginAtZero: true,
            title: { display: true, text: 'seconds', font: { size: 9 } },
            ticks: { font: { size: 9 } }
          }
        }
      }
    });
  }

  onMount(() => {
    loadData();

    websocketService.on('process-activity', handleProcessActivity);
    websocketService.on('api-latency', handleApiLatency);

    themeObserver = createThemeObserver(() => buildLatencyChart());

    return () => {
      abortRequests();
      websocketService.off('process-activity', handleProcessActivity);
      websocketService.off('api-latency', handleApiLatency);
      if (rebuildTimer) clearTimeout(rebuildTimer);
      destroyChart(latencyChart);
      if (themeObserver) themeObserver.disconnect();
    };
  });
</script>

<PageLayout variant="dashboard">
  <div class="p-4 max-w-[1400px] mx-auto font-mono">
    <!-- Match the rest of the Agents tab: every sibling page wears the
         RAVEN.AGENTS :: <label> status strip. -->
    <StatusBar prompt="RAVEN.AGENTS" label="Network" />
    <PageHeader
      size="compact"
      title="Network Activity"
      description="Real-time agent network connections and API latency"
    >
      {#snippet actions()}
        <div class="flex items-center gap-3">
          <FreshnessBadge mode="live" since={lastUpdated} />
          <RefreshButton onClick={() => loadData()} {loading} />
        </div>
      {/snippet}
    </PageHeader>

    {#if loadError}
      <DataFetchError message={loadError} onRetry={() => loadData()} />
    {/if}

    <!-- Agent Activity Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mb-4">
      {#each agents as agent (agent.agent_name)}
        <div class="bg-surface border border-border rounded-lg p-3">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <span
                class="w-2 h-2 rounded-full inline-block {activityDotClass(agent.activity_state)}"
                class:activity-pulse={agent.activity_state === 'thinking'}
              ></span>
              <span class="text-[11px] font-semibold text-body">{agent.agent_name}</span>
            </div>
            <span
              class="text-[11px] px-1.5 py-0.5 rounded {activityBadgeClass(agent.activity_state)}"
            >
              {activityLabel(agent.activity_state)}
            </span>
          </div>

          <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
            <div class="flex justify-between">
              <span class="text-muted">CPU</span>
              <span class="text-body">{(agent.cpu_usage || 0).toFixed(1)}%</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted">RAM</span>
              <span class="text-body">{agent.memory_mb || 0} MB</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted">Connections</span>
              <span class="text-body">{agent.network_connections || 0}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted">API Calls</span>
              <span class={(agent.api_connections || 0) > 0 ? 'text-warning' : 'text-body'}
                >{agent.api_connections || 0}</span
              >
            </div>
            <div class="flex justify-between">
              <span class="text-muted">Threads</span>
              <span class="text-body">{agent.thread_count || 0}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted">File Desc</span>
              <span class="text-body">{agent.fd_count || 0}</span>
            </div>
          </div>

          <div class="mt-2 pt-2 border-t border-border">
            <span class="text-[11px] text-muted">PID {agent.pid}</span>
          </div>
        </div>
      {:else}
        {#if loading}
          <div class="col-span-full text-center text-[11px] text-muted py-8">Loading agents...</div>
        {:else}
          <div class="col-span-full text-center text-[11px] text-muted py-8">
            No agent processes detected
          </div>
        {/if}
      {/each}
    </div>

    <!-- API Latency Section -->
    <div class="bg-surface border border-border rounded-lg p-3 mb-4">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-[11px] font-semibold text-body">API Latency</h3>
        <div class="flex gap-1">
          {#each ['15m', '1h', '6h', '24h'] as range (range)}
            <FilterToggle
              active={chartTimeRange === range}
              onClick={() => {
                chartTimeRange = range;
                loadData();
              }}
            >
              {range}
            </FilterToggle>
          {/each}
        </div>
      </div>

      <!-- Stats Row -->
      <div class="flex gap-4 mb-3 text-[11px]">
        <div>
          <span class="text-muted">Avg</span>
          <span class="text-body ml-1 font-semibold"
            >{(latencyStats.avg_ms / 1000).toFixed(2)}s</span
          >
        </div>
        <div>
          <span class="text-muted">p50</span>
          <span class="text-body ml-1 font-semibold"
            >{(latencyStats.p50_ms / 1000).toFixed(2)}s</span
          >
        </div>
        <div>
          <span class="text-muted">p95</span>
          <span class="text-body ml-1 font-semibold"
            >{(latencyStats.p95_ms / 1000).toFixed(2)}s</span
          >
        </div>
        <div>
          <span class="text-muted">Requests</span>
          <span class="text-body ml-1 font-semibold">{latencyStats.count}</span>
        </div>
        <div>
          <span class="text-muted">Rate</span>
          <span class="text-body ml-1 font-semibold">
            {#if latencyStats.requests_per_min > 0}
              {latencyStats.requests_per_min}/min
            {:else if latencyStats.count > 0}
              &lt;1/min
            {:else}
              —
            {/if}
          </span>
        </div>
      </div>

      <!-- Chart -->
      <div class="min-h-[200px] h-[200px]">
        <canvas id="latency-chart"></canvas>
      </div>
    </div>

    <!-- Recent Latency Table -->
    <div class="bg-surface border border-border rounded-lg p-3">
      <h3 class="text-[11px] font-semibold text-body mb-2">Recent API Calls</h3>
      <div class="overflow-x-auto">
        <table class="w-full text-[11px]">
          <thead>
            <tr class="text-muted border-b border-border">
              <th class="text-left py-1 pr-4">Time</th>
              <th class="text-left py-1 pr-4">Model</th>
              <th class="text-left py-1 pr-4">Project</th>
              <th class="text-right py-1">Latency</th>
            </tr>
          </thead>
          <tbody>
            {#each latencyData.slice(-20).reverse() as entry, i (entry.timestamp + ':' + i)}
              <tr class="border-b border-border border-opacity-30 hover:bg-canvas">
                <td class="py-1 pr-4 text-muted"
                  >{new Date(entry.timestamp).toLocaleTimeString()}</td
                >
                <td class="py-1 pr-4 text-body">{entry.model || 'unknown'}</td>
                <td class="py-1 pr-4 text-muted">{entry.project_name || '-'}</td>
                <td class="py-1 text-right font-semibold {latencyTextClass(entry.latency_ms)}">
                  {(entry.latency_ms / 1000).toFixed(2)}s
                </td>
              </tr>
            {:else}
              <tr>
                <td colspan="4" class="py-4 text-center text-muted"
                  >No API latency data yet — data appears as Claude processes requests</td
                >
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </div>
</PageLayout>
