<script>
  /**
   * Process Activity Page — Network Activity Monitor
   * Shows real-time agent activity states, network connections, and API latency.
   */
  import { onMount } from 'svelte';
  import { createPageApi } from '../apiClient.js';
  import { PageLayout, PageHeader } from '../components/layout/index.js';
  import { FreshnessBadge } from '../components/ui/index.js';
  const { api, abort: abortRequests } = createPageApi();
  import { websocketService } from '../services/websocket.js';
  import { formatRelativeTime } from '../timeFormat.js';
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

  function activityColor(state) {
    if (state === 'thinking') return 'var(--warning)';
    if (state === 'executing') return 'var(--success)';
    return 'var(--muted)';
  }

  function activityLabel(state) {
    if (state === 'thinking') return 'API Call';
    if (state === 'executing') return 'Executing';
    return 'Idle';
  }

  async function loadData() {
    try {
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
      if (err?.name !== 'AbortError') console.error('ProcessActivityPage loadData failed:', err);
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
    latencyStats = {
      ...latencyStats,
      count: latencyStats.count + 1
    };
    lastUpdated = new Date();
    // Add point to chart
    if (latencyChart) {
      latencyChart.data.labels.push(new Date(data.timestamp).toLocaleTimeString());
      latencyChart.data.datasets[0].data.push(data.latency_ms / 1000);
      if (latencyChart.data.labels.length > 200) {
        latencyChart.data.labels.shift();
        latencyChart.data.datasets[0].data.shift();
      }
      latencyChart.update('none');
    }
  }

  function buildLatencyChart() {
    destroyChart(latencyChart);
    const colors = getChartColors();
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
      destroyChart(latencyChart);
      if (themeObserver) themeObserver.disconnect();
    };
  });
</script>

<PageLayout variant="dashboard">
  <div class="p-4 max-w-[1400px] mx-auto font-mono">
    <PageHeader
      size="compact"
      title="Network Activity"
      description="Real-time agent network connections and API latency"
    >
      {#snippet actions()}
        <div class="flex items-center gap-3">
          <FreshnessBadge mode="live" />
          <button
            onclick={() => loadData()}
            class="px-2 py-1 text-[9px] bg-surface border border-border rounded text-muted hover:text-body transition-colors"
          >
            Refresh
          </button>
        </div>
      {/snippet}
    </PageHeader>

    <!-- Agent Activity Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
      {#each agents as agent (agent.agent_name)}
        <div class="bg-surface border border-border rounded-lg p-3">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <span
                class="w-2 h-2 rounded-full inline-block"
                class:activity-pulse={agent.activity_state === 'thinking'}
                style="background: {activityColor(agent.activity_state)}"
              ></span>
              <span class="text-[11px] font-semibold text-body">{agent.agent_name}</span>
            </div>
            <span
              class="text-[9px] px-1.5 py-0.5 rounded"
              style="color: {activityColor(agent.activity_state)}; background: {activityColor(
                agent.activity_state
              )}15"
            >
              {activityLabel(agent.activity_state)}
            </span>
          </div>

          <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-[9px]">
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
              <span
                style="color: {(agent.api_connections || 0) > 0 ? 'var(--warning)' : 'var(--text)'}"
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
            <span class="text-[8px] text-muted">PID {agent.pid}</span>
          </div>
        </div>
      {:else}
        {#if loading}
          <div class="col-span-full text-center text-[10px] text-muted py-8">Loading agents...</div>
        {:else}
          <div class="col-span-full text-center text-[10px] text-muted py-8">
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
            <button
              onclick={() => {
                chartTimeRange = range;
                loadData();
              }}
              class="px-1.5 py-0.5 text-[8px] rounded transition-colors"
              class:bg-accent={chartTimeRange === range}
              class:text-white={chartTimeRange === range}
              class:bg-canvas={chartTimeRange !== range}
              class:text-muted={chartTimeRange !== range}
            >
              {range}
            </button>
          {/each}
        </div>
      </div>

      <!-- Stats Row -->
      <div class="flex gap-4 mb-3 text-[9px]">
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
          <span class="text-body ml-1 font-semibold">{latencyStats.requests_per_min}/min</span>
        </div>
      </div>

      <!-- Chart -->
      <div class="h-[200px]">
        <canvas id="latency-chart"></canvas>
      </div>
    </div>

    <!-- Recent Latency Table -->
    <div class="bg-surface border border-border rounded-lg p-3">
      <h3 class="text-[11px] font-semibold text-body mb-2">Recent API Calls</h3>
      <div class="overflow-x-auto">
        <table class="w-full text-[9px]">
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
                <td
                  class="py-1 text-right font-semibold"
                  style="color: {entry.latency_ms > 30000
                    ? 'var(--error)'
                    : entry.latency_ms > 10000
                      ? 'var(--warning)'
                      : 'var(--text)'}"
                >
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
