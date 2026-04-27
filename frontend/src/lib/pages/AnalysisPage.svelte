<script>
  import { logger } from '../logger.js';
  import { createPageApi } from '../apiClient.js';
  import { formatTimeOnly, formatDateTime } from '../timeFormat.js';
  import { PageLayout, PageHeader } from '../components/layout/index.js';
  import { RefreshButton } from '../components/ui/index.js';
  import { getChartColors } from '../utils/chartUtils.js';
  const { api, abort: abortRequests } = createPageApi();
  /**
   * Analysis Overview Page - Tailwind Version
   * Performance metrics, trends, and developer insights
   */

  import { onMount, onDestroy } from 'svelte';
  import { navigate } from '../utils/router.svelte.js';
  import { Chart, registerables } from 'chart.js';

  Chart.register(...registerables);

  // State
  let performanceMetrics = $state({ cpu: 0, memory: 0 });
  let activeTriggers = $state(0);
  let __totalSessions = $state(0);
  let triggeredEvents = $state([]);
  let loading = $state(false);
  let error = $state(null);
  let lastUpdated = $state(new Date());
  let metricsHistory = $state([]);

  // Chart state
  let cpuChartCanvas = $state(null);
  let cpuChart = $state(null);
  let themeObserver = $state(null);

  // Derived - CPU/Memory Health
  const cpuHealth = $derived(
    performanceMetrics.cpu > 80 ? 'critical' : performanceMetrics.cpu > 60 ? 'warning' : 'good'
  );
  const memHealth = $derived(
    performanceMetrics.memory > 80
      ? 'critical'
      : performanceMetrics.memory > 60
        ? 'warning'
        : 'good'
  );
  const timeSinceUpdate = $derived.by(() =>
    Math.floor((new Date().getTime() - lastUpdated.getTime()) / 1000)
  );

  // Load analysis data
  async function loadAnalysisData() {
    try {
      error = null;

      const [systemMetrics, triggersData, sessionsData, triggeredEventsData] = await Promise.all([
        api.get('/system-metrics?limit=20').catch(() => []),
        api.get('/triggers-config').catch(() => ({ triggers: [] })),
        api.get('/sessions?limit=5').catch(() => ({ sessions: [] })),
        api.get('/triggered-events?limit=10').catch(() => ({ events: [] }))
      ]);

      // System metrics
      const metrics = Array.isArray(systemMetrics) ? systemMetrics : [];
      if (metrics.length > 0) {
        const latest = metrics[0];
        performanceMetrics = {
          cpu: Math.round(latest.cpu_percent || 0),
          memory: Math.round(latest.memory_percent || 0)
        };
      }
      metricsHistory = metrics.slice(0, 10);

      // Triggers
      const triggers = triggersData.rules || triggersData.triggers || [];
      activeTriggers = triggers.length;

      // Sessions
      __totalSessions = (sessionsData.sessions || []).length;

      // Triggered events
      triggeredEvents = triggeredEventsData.events || [];

      lastUpdated = new Date();
      loading = false;
    } catch (err) {
      logger.error('Failed to load analysis data:', err);
      error = err.message;
      loading = false;
    }
  }

  // Chart creation
  function createCpuChart() {
    if (!cpuChartCanvas || metricsHistory.length === 0) return;

    const labels = metricsHistory
      .slice()
      .reverse()
      .map(m => {
        const date = new Date(m.timestamp);
        return formatTimeOnly(date);
      });

    const cpuData = metricsHistory
      .slice()
      .reverse()
      .map(m => m.cpu_percent || 0);
    const memData = metricsHistory
      .slice()
      .reverse()
      .map(m => m.memory_percent || 0);

    // Theme-aware chart colors (canonical helper; flips with dark mode).
    const { text: textColor, muted: mutedColor, primary: accentColor, success: successColor } = getChartColors();

    if (cpuChart) {
      cpuChart.data.labels = labels;
      if (cpuChart.data.datasets.length >= 2) {
        cpuChart.data.datasets[0].data = cpuData;
        cpuChart.data.datasets[1].data = memData;
      }
      cpuChart.update();
    } else {
      cpuChart = new Chart(cpuChartCanvas, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'CPU %',
              data: cpuData,
              borderColor: accentColor,
              backgroundColor: `${accentColor}33`,
              fill: true,
              tension: 0.4
            },
            {
              label: 'Memory %',
              data: memData,
              borderColor: successColor,
              backgroundColor: `${successColor}33`,
              fill: true,
              tension: 0.4
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: 'top',
              labels: {
                color: textColor,
                font: { size: 12, family: 'var(--mono)' }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              max: 100,
              ticks: { color: mutedColor, font: { size: 10, family: 'var(--mono)' } },
              grid: { color: 'rgba(128, 128, 128, 0.15)' }
            },
            x: {
              ticks: { color: mutedColor, font: { size: 10, family: 'var(--mono)' } },
              grid: { color: 'rgba(128, 128, 128, 0.15)' }
            }
          }
        }
      });
    }
  }

  onMount(() => {
    loadAnalysisData().then(() => {
      setTimeout(createCpuChart, 200);
    });

    // Theme observer
    themeObserver = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (mutation.attributeName === 'class') {
          setTimeout(createCpuChart, 100);
        }
      });
    });

    themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });
  });

  onDestroy(() => {
    abortRequests();
    if (themeObserver) {
      themeObserver.disconnect();
    }
    if (cpuChart) {
      cpuChart.destroy();
    }
  });
</script>

<PageLayout>
  <PageHeader title="Analysis Overview" description="Performance metrics, trends, and insights">
    {#snippet actions()}
      <div class="flex items-center gap-3">
        <span class="text-xs text-muted font-mono">Updated {timeSinceUpdate}s ago</span>
        <RefreshButton onClick={() => loadAnalysisData()} loading={loading} />
      </div>
    {/snippet}
  </PageHeader>

    {#if error}
      <div
        class="bg-error-subtle border border-error rounded-lg p-4 mb-6 flex justify-between items-center"
      >
        <span class="text-sm text-error font-sans"
          >Failed to load analysis data: {error}</span
        >
        <button
          onclick={() => loadAnalysisData()}
          class="px-3 py-1.5 bg-error text-white rounded text-sm font-sans"
        >
          Retry
        </button>
      </div>
    {:else if loading}
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {#each Array(4) as _, i (i)}
          <div
            class="h-24 bg-surface border border-border rounded-lg animate-pulse"
          ></div>
        {/each}
      </div>
    {:else}
      <!-- Performance Metrics Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <!-- CPU Usage -->
        <div class="bg-surface border border-border rounded-lg p-5">
          <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
            CPU Usage
          </div>
          <div class="flex items-center gap-2 mb-3">
            <span
              class="w-2 h-2 rounded-full {cpuHealth === 'critical'
                ? 'bg-error'
                : cpuHealth === 'warning'
                  ? 'bg-warning'
                  : 'bg-success'}"
            ></span>
            <span class="text-sm font-mono text-body">{performanceMetrics.cpu}%</span>
          </div>
          <div class="h-2 bg-canvas rounded overflow-hidden mb-2">
            <div
              class="h-full transition-all duration-500"
              style="width: {performanceMetrics.cpu}%; background: {cpuHealth === 'critical'
                ? 'var(--error)'
                : cpuHealth === 'warning'
                  ? 'var(--warning)'
                  : 'var(--success)'}"
            ></div>
          </div>
          <div class="text-xs text-muted">
            {cpuHealth === 'good' ? 'Normal' : cpuHealth === 'warning' ? 'Elevated' : 'High'}
          </div>
        </div>

        <!-- Memory Usage -->
        <div class="bg-surface border border-border rounded-lg p-5">
          <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
            Memory Usage
          </div>
          <div class="flex items-center gap-2 mb-3">
            <span
              class="w-2 h-2 rounded-full {memHealth === 'critical'
                ? 'bg-error'
                : memHealth === 'warning'
                  ? 'bg-warning'
                  : 'bg-success'}"
            ></span>
            <span class="text-sm font-mono text-body">{performanceMetrics.memory}%</span>
          </div>
          <div class="h-2 bg-canvas rounded overflow-hidden mb-2">
            <div
              class="h-full transition-all duration-500"
              style="width: {performanceMetrics.memory}%; background: {memHealth === 'critical'
                ? 'var(--error)'
                : memHealth === 'warning'
                  ? 'var(--warning)'
                  : 'var(--success)'}"
            ></div>
          </div>
          <div class="text-xs text-muted">
            {memHealth === 'good' ? 'Normal' : memHealth === 'warning' ? 'Elevated' : 'High'}
          </div>
        </div>
      </div>

      <!-- CPU/Memory Chart -->
      {#if metricsHistory.length > 0}
        <div class="bg-surface border border-border rounded-lg p-5 mb-6">
          <h3 class="text-xs font-semibold text-muted uppercase tracking-wide mb-4">
            Performance Trends
          </h3>
          <div style="height: 300px;">
            <canvas bind:this={cpuChartCanvas}></canvas>
          </div>
        </div>
      {/if}

      <!-- Quick Stats Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <button
          onclick={() => navigate('/analysis/triggers')}
          class="bg-surface border border-border rounded p-4 text-left hover:border-accent transition-colors"
        >
          <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
            Active Triggers
          </div>
          <div class="text-sm font-mono text-body">{activeTriggers}</div>
        </button>
      </div>

      <!-- Recent Triggered Events -->
      {#if triggeredEvents.length > 0}
        <div class="bg-surface border border-border rounded-lg p-5 mb-6">
          <h3 class="text-xs font-semibold text-muted uppercase tracking-wide mb-4">
            Recent Triggered Events
          </h3>
          <div class="space-y-3 text-sm">
            {#each triggeredEvents.slice(0, 5) as event, i (event.id || `${event.timestamp}-${i}`)}
              <div class="flex justify-between border-b border-border pb-2">
                <span class="text-muted">
                  {event.trigger_name || 'Trigger Fired'}
                </span>
                <span class="font-mono text-body text-xs">
                  {event.message || event.event_type} · {formatDateTime(
                    event.timestamp || Date.now()
                  )}
                </span>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    {/if}
</PageLayout>
