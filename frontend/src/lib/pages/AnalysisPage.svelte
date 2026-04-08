<script>
  import { logger } from '../logger.js';
  import { api } from '../apiClient.js';
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
      _totalSessions = (sessionsData.sessions || []).length;

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
        return date.toLocaleTimeString();
      });

    const cpuData = metricsHistory
      .slice()
      .reverse()
      .map(m => m.cpu_percent || 0);
    const memData = metricsHistory
      .slice()
      .reverse()
      .map(m => m.memory_percent || 0);

    // Get theme-aware colors
    const getColor = (varName, fallback) => {
      const value = getComputedStyle(document.body).getPropertyValue(varName).trim();
      return value && (value.startsWith('#') || value.startsWith('rgb')) ? value : fallback;
    };

    const textColor = getColor('--text', '#c0caf5');
    const mutedColor = getColor('--muted', '#565f89');
    const accentColor = getColor('--accent', '#7aa2f7');
    const successColor = getColor('--success', '#9ece6a');

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
    if (themeObserver) {
      themeObserver.disconnect();
    }
    if (cpuChart) {
      cpuChart.destroy();
    }
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-6xl mx-auto">
    <!-- Header -->
    <div class="flex justify-between items-start mb-6 flex-wrap gap-4">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">Analysis Overview</h1>
        <p class="text-sm text-[var(--muted)] font-sans">
          Performance metrics, trends, and insights
        </p>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-xs text-[var(--muted)] font-mono">Updated {timeSinceUpdate}s ago</span>
        <button
          onclick={() => loadAnalysisData()}
          disabled={loading}
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors disabled:opacity-50"
        >
          {loading ? '...' : '&#8635;'} Refresh
        </button>
      </div>
    </div>

    {#if error}
      <div
        class="bg-[var(--error-subtle)] border border-[var(--error)] rounded-lg p-4 mb-6 flex justify-between items-center"
      >
        <span class="text-sm text-[var(--error)] font-sans"
          >Failed to load analysis data: {error}</span
        >
        <button
          onclick={() => loadAnalysisData()}
          class="px-3 py-1.5 bg-[var(--error)] text-white rounded text-sm font-sans"
        >
          Retry
        </button>
      </div>
    {:else if loading}
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {#each Array(4) as _, i (i)}
          <div
            class="h-24 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-pulse"
          ></div>
        {/each}
      </div>
    {:else}
      <!-- Performance Metrics Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <!-- CPU Usage -->
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
          <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
            CPU Usage
          </div>
          <div class="flex items-center gap-2 mb-3">
            <span
              class="w-2 h-2 rounded-full {cpuHealth === 'critical'
                ? 'bg-[var(--error)]'
                : cpuHealth === 'warning'
                  ? 'bg-[var(--warning)]'
                  : 'bg-[var(--success)]'}"
            ></span>
            <span class="text-sm font-mono text-[var(--text)]">{performanceMetrics.cpu}%</span>
          </div>
          <div class="h-2 bg-[var(--bg)] rounded overflow-hidden mb-2">
            <div
              class="h-full transition-all duration-500"
              style="width: {performanceMetrics.cpu}%; background: {cpuHealth === 'critical'
                ? 'var(--error)'
                : cpuHealth === 'warning'
                  ? 'var(--warning)'
                  : 'var(--success)'}"
            ></div>
          </div>
          <div class="text-xs text-[var(--muted)]">
            {cpuHealth === 'good' ? 'Normal' : cpuHealth === 'warning' ? 'Elevated' : 'High'}
          </div>
        </div>

        <!-- Memory Usage -->
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
          <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
            Memory Usage
          </div>
          <div class="flex items-center gap-2 mb-3">
            <span
              class="w-2 h-2 rounded-full {memHealth === 'critical'
                ? 'bg-[var(--error)]'
                : memHealth === 'warning'
                  ? 'bg-[var(--warning)]'
                  : 'bg-[var(--success)]'}"
            ></span>
            <span class="text-sm font-mono text-[var(--text)]">{performanceMetrics.memory}%</span>
          </div>
          <div class="h-2 bg-[var(--bg)] rounded overflow-hidden mb-2">
            <div
              class="h-full transition-all duration-500"
              style="width: {performanceMetrics.memory}%; background: {memHealth === 'critical'
                ? 'var(--error)'
                : memHealth === 'warning'
                  ? 'var(--warning)'
                  : 'var(--success)'}"
            ></div>
          </div>
          <div class="text-xs text-[var(--muted)]">
            {memHealth === 'good' ? 'Normal' : memHealth === 'warning' ? 'Elevated' : 'High'}
          </div>
        </div>
      </div>

      <!-- CPU/Memory Chart -->
      {#if metricsHistory.length > 0}
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 mb-6">
          <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-4">
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
          class="bg-[var(--surface)] border border-[var(--border)] rounded p-4 text-left hover:border-[var(--accent)] transition-colors"
        >
          <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
            Active Triggers
          </div>
          <div class="text-sm font-mono text-[var(--text)]">{activeTriggers}</div>
        </button>
      </div>

      <!-- Recent Triggered Events -->
      {#if triggeredEvents.length > 0}
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 mb-6">
          <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-4">
            Recent Triggered Events
          </h3>
          <div class="space-y-3 text-sm">
            {#each triggeredEvents.slice(0, 5) as event, i (event.id || `${event.timestamp}-${i}`)}
              <div class="flex justify-between border-b border-[var(--border)] pb-2">
                <span class="text-[var(--muted)]">
                  {event.trigger_name || 'Trigger Fired'}
                </span>
                <span class="font-mono text-[var(--text)] text-xs">
                  {event.message || event.event_type} · {new Date(
                    event.timestamp || Date.now()
                  ).toLocaleString()}
                </span>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    {/if}
  </div>
</div>
