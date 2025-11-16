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
  let totalSessions = $state(0);
  let triggeredEvents = $state([]);
  let loading = $state(true);
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
      loading = true;
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
      const triggers = triggersData.triggers || [];
      activeTriggers = triggers.filter(t => t.enabled).length;

      // Sessions
      totalSessions = (sessionsData.sessions || []).length;

      // Triggered events
      triggeredEvents = triggeredEventsData.events || [];

      lastUpdated = new Date();
      loading = false;
    } catch (error) {
      logger.error('Failed to load analysis data:', error);
      errorMessage = error.message;
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
      cpuChart.data.datasets[0].data = cpuData;
      cpuChart.data.datasets[1].data = memData;
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
  <div class="max-w-7xl mx-auto">
    <!-- Header -->
    <div class="flex justify-between items-start mb-6 flex-wrap gap-4">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">📊 Analysis Overview</h1>
        <p class="text-base text-[var(--muted)] font-sans">
          Performance metrics, trends, and insights
        </p>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-sm text-[var(--muted)] font-mono">Updated {timeSinceUpdate}s ago</span>
        <button
          onclick={() => loadAnalysisData()}
          disabled={loading}
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors disabled:opacity-50"
        >
          {loading ? '⏳ Loading' : '🔄 Refresh'}
        </button>
      </div>
    </div>

    {#if error}
      <div
        class="bg-[var(--error-subtle)] border border-[var(--error)] rounded-lg p-4 mb-6 flex justify-between items-center"
      >
        <span class="text-sm text-[var(--error)] font-sans"
          >⚠️ Failed to load analysis data: {error}</span
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
            class="h-32 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-pulse"
          ></div>
        {/each}
      </div>
    {:else}
      <!-- Performance Metrics Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <!-- CPU Usage -->
        <div
          class="bg-[var(--surface)] border-2 rounded-lg p-5 transition-all"
          style="border-color: {cpuHealth === 'critical'
            ? 'var(--error)'
            : cpuHealth === 'warning'
              ? 'var(--warning)'
              : 'var(--border)'}"
        >
          <div class="flex items-center gap-3 mb-3">
            <span class="text-2xl">🖥️</span>
            <span class="font-semibold text-[var(--text-heading)] font-sans">CPU Usage</span>
          </div>
          <div class="text-4xl font-bold text-[var(--text-heading)] mb-3">
            {performanceMetrics.cpu}%
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
          <div class="text-sm text-[var(--muted)] font-sans">
            {cpuHealth === 'good'
              ? '✓ Normal'
              : cpuHealth === 'warning'
                ? '⚠ Elevated'
                : '🔴 High'}
          </div>
        </div>

        <!-- Memory Usage -->
        <div
          class="bg-[var(--surface)] border-2 rounded-lg p-5 transition-all"
          style="border-color: {memHealth === 'critical'
            ? 'var(--error)'
            : memHealth === 'warning'
              ? 'var(--warning)'
              : 'var(--border)'}"
        >
          <div class="flex items-center gap-3 mb-3">
            <span class="text-2xl">💾</span>
            <span class="font-semibold text-[var(--text-heading)] font-sans">Memory Usage</span>
          </div>
          <div class="text-4xl font-bold text-[var(--text-heading)] mb-3">
            {performanceMetrics.memory}%
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
          <div class="text-sm text-[var(--muted)] font-sans">
            {memHealth === 'good'
              ? '✓ Normal'
              : memHealth === 'warning'
                ? '⚠ Elevated'
                : '🔴 High'}
          </div>
        </div>
      </div>

      <!-- CPU/Memory Chart -->
      {#if metricsHistory.length > 0}
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 mb-6">
          <h2 class="text-xl font-semibold text-[var(--text-heading)] mb-4 font-sans">
            📈 Performance Trends
          </h2>
          <div style="height: 300px;">
            <canvas bind:this={cpuChartCanvas}></canvas>
          </div>
        </div>
      {/if}

      <!-- Quick Stats Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <button
          onclick={() => navigate('/analysis/triggers')}
          class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 text-left hover:border-[var(--accent)] hover:-translate-y-0.5 transition-all"
        >
          <div class="flex items-center gap-3 mb-2">
            <span class="text-xl">⚡</span>
            <span class="text-sm text-[var(--muted)] font-sans">Active Triggers</span>
          </div>
          <div class="text-3xl font-bold text-[var(--text-heading)]">{activeTriggers}</div>
          <div class="text-xs text-[var(--muted)] font-sans mt-1">Automated rules</div>
        </button>

        <button
          onclick={() => navigate('/analysis/session-replay')}
          class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 text-left hover:border-[var(--accent)] hover:-translate-y-0.5 transition-all"
        >
          <div class="flex items-center gap-3 mb-2">
            <span class="text-xl">🎬</span>
            <span class="text-sm text-[var(--muted)] font-sans">Recent Sessions</span>
          </div>
          <div class="text-3xl font-bold text-[var(--text-heading)]">{totalSessions}</div>
          <div class="text-xs text-[var(--muted)] font-sans mt-1">Available for replay</div>
        </button>

        <button
          onclick={() => navigate('/analysis/developer-insights')}
          class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 text-left hover:border-[var(--accent)] hover:-translate-y-0.5 transition-all"
        >
          <div class="flex items-center gap-3 mb-2">
            <span class="text-xl">👨‍💻</span>
            <span class="text-sm text-[var(--muted)] font-sans">Insights</span>
          </div>
          <div class="text-3xl font-bold text-[var(--accent)]">Live</div>
          <div class="text-xs text-[var(--muted)] font-sans mt-1">Productivity metrics</div>
        </button>

        <button
          onclick={() => navigate('/analysis/trends')}
          class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 text-left hover:border-[var(--accent)] hover:-translate-y-0.5 transition-all"
        >
          <div class="flex items-center gap-3 mb-2">
            <span class="text-xl">📉</span>
            <span class="text-sm text-[var(--muted)] font-sans">Historical Data</span>
          </div>
          <div class="text-3xl font-bold text-[var(--accent)]">Trends</div>
          <div class="text-xs text-[var(--muted)] font-sans mt-1">Analyze patterns</div>
        </button>
      </div>

      <!-- Recent Triggered Events -->
      {#if triggeredEvents.length > 0}
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 mb-6">
          <h2 class="text-xl font-semibold text-[var(--text-heading)] mb-4 font-sans">
            🔔 Recent Triggered Events
          </h2>
          <div class="space-y-2">
            {#each triggeredEvents.slice(0, 5) as event, i (event.id || `${event.timestamp}-${i}`)}
              <div
                class="bg-[var(--bg)] border border-[var(--border)] rounded p-3 flex items-start gap-3 hover:border-[var(--accent)] transition-colors"
              >
                <span class="text-xl flex-shrink-0">⚡</span>
                <div class="flex-1">
                  <div class="font-medium text-[var(--text-heading)] font-sans">
                    {event.trigger_name || 'Trigger Fired'}
                  </div>
                  <div class="text-sm text-[var(--muted)] font-sans mt-0.5">
                    {event.message || event.event_type} · {new Date(
                      event.timestamp || Date.now()
                    ).toLocaleString()}
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Quick Actions Grid -->
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
        <h2 class="text-xl font-semibold text-[var(--text-heading)] mb-4 font-sans">
          🚀 Quick Actions
        </h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <button
            onclick={() => navigate('/analysis/performance')}
            class="bg-[var(--bg)] border border-[var(--border)] rounded p-4 flex items-center gap-3 hover:border-[var(--accent)] transition-all hover:-translate-y-0.5 text-left"
          >
            <span class="text-2xl">📊</span>
            <div>
              <div class="font-semibold text-[var(--text-heading)] font-sans text-sm">
                Performance Metrics
              </div>
              <div class="text-xs text-[var(--muted)] font-sans">CPU, memory, correlations</div>
            </div>
          </button>

          <button
            onclick={() => navigate('/analysis/custom-metrics')}
            class="bg-[var(--bg)] border border-[var(--border)] rounded p-4 flex items-center gap-3 hover:border-[var(--accent)] transition-all hover:-translate-y-0.5 text-left"
          >
            <span class="text-2xl">📈</span>
            <div>
              <div class="font-semibold text-[var(--text-heading)] font-sans text-sm">
                Custom Metrics
              </div>
              <div class="text-xs text-[var(--muted)] font-sans">User-defined dashboards</div>
            </div>
          </button>

          <button
            onclick={() => navigate('/analysis/trends')}
            class="bg-[var(--bg)] border border-[var(--border)] rounded p-4 flex items-center gap-3 hover:border-[var(--accent)] transition-all hover:-translate-y-0.5 text-left"
          >
            <span class="text-2xl">📉</span>
            <div>
              <div class="font-semibold text-[var(--text-heading)] font-sans text-sm">
                Historical Trends
              </div>
              <div class="text-xs text-[var(--muted)] font-sans">Time-series analysis</div>
            </div>
          </button>

          <button
            onclick={() => navigate('/analysis/triggers')}
            class="bg-[var(--bg)] border border-[var(--border)] rounded p-4 flex items-center gap-3 hover:border-[var(--accent)] transition-all hover:-translate-y-0.5 text-left"
          >
            <span class="text-2xl">⚡</span>
            <div>
              <div class="font-semibold text-[var(--text-heading)] font-sans text-sm">
                Configure Triggers
              </div>
              <div class="text-xs text-[var(--muted)] font-sans">Automated monitoring</div>
            </div>
          </button>

          <button
            onclick={() => navigate('/analysis/session-replay')}
            class="bg-[var(--bg)] border border-[var(--border)] rounded p-4 flex items-center gap-3 hover:border-[var(--accent)] transition-all hover:-translate-y-0.5 text-left"
          >
            <span class="text-2xl">🎬</span>
            <div>
              <div class="font-semibold text-[var(--text-heading)] font-sans text-sm">
                Session Replay
              </div>
              <div class="text-xs text-[var(--muted)] font-sans">Review coding sessions</div>
            </div>
          </button>

          <button
            onclick={() => navigate('/analysis/developer-insights')}
            class="bg-[var(--bg)] border border-[var(--border)] rounded p-4 flex items-center gap-3 hover:border-[var(--accent)] transition-all hover:-translate-y-0.5 text-left"
          >
            <span class="text-2xl">👨‍💻</span>
            <div>
              <div class="font-semibold text-[var(--text-heading)] font-sans text-sm">
                Developer Insights
              </div>
              <div class="text-xs text-[var(--muted)] font-sans">Productivity analytics</div>
            </div>
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>
