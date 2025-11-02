<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { websocketService } from './websocket.js';
  import { logger } from './logger.js';
  import Chart from 'chart.js/auto';

  // Analysis metrics
  let performanceMetrics = { cpu: 0, memory: 0 };
  let activeTriggers = 0;
  let totalSessions = 0;
  let triggeredEvents = [];

  let loading = true;
  let error = null;
  let lastUpdated = new Date();

  // Chart
  let cpuChartCanvas;
  let cpuChart = null;
  let metricsData = [];

  // Fetch analysis data
  async function loadAnalysisData() {
    try {
      loading = true;
      error = null;

      // Parallel data fetching
      const [systemMetrics, triggersData, sessionsData, triggeredEventsData] = await Promise.all([
        fetch('/api/system-metrics?limit=20').then(r => r.json()).catch(() => []),
        fetch('/api/triggers-config').then(r => r.json()).catch(() => ({ triggers: [] })),
        fetch('/api/sessions?limit=5').then(r => r.json()).catch(() => ({ sessions: [] })),
        fetch('/api/triggered-events?limit=10').then(r => r.json()).catch(() => ({ events: [] }))
      ]);

      // System metrics - API returns array directly
      const metrics = Array.isArray(systemMetrics) ? systemMetrics : [];
      if (metrics.length > 0) {
        const latest = metrics[0];
        performanceMetrics = {
          cpu: Math.round(latest.cpu_percent || 0),
          memory: Math.round(latest.memory_percent || 0)
        };
      }

      // Triggers
      const triggers = triggersData.triggers || [];
      activeTriggers = triggers.filter(t => t.enabled).length;

      // Sessions
      totalSessions = (sessionsData.sessions || []).length;

      // Triggered events
      triggeredEvents = triggeredEventsData.events || [];

      // Store metrics for chart update after DOM renders
      metricsData = metrics;

      lastUpdated = new Date();
      loading = false;

      // Wait for DOM to update, then create chart
      await tick();
      updateCpuChart(metricsData);
    } catch (err) {
      logger.error('Failed to load analysis data:', err);
      error = err.message;
      loading = false;
    }
  }

  function updateCpuChart(metrics) {
    if (!cpuChartCanvas || metrics.length === 0) return;

    const labels = metrics.reverse().map(m => {
      const date = new Date(m.timestamp);
      return date.toLocaleTimeString();
    });

    const cpuData = metrics.map(m => m.cpu_percent || 0);
    const memData = metrics.map(m => m.memory_percent || 0);

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
              borderColor: '#6366f1',
              backgroundColor: 'rgba(99, 102, 241, 0.1)',
              fill: true,
              tension: 0.4
            },
            {
              label: 'Memory %',
              data: memData,
              borderColor: '#10b981',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              fill: true,
              tension: 0.4
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true, position: 'top' }
          },
          scales: {
            y: { beginAtZero: true, max: 100 }
          }
        }
      });
    }
  }

  // WebSocket listeners
  let unsubscribers = [];

  onMount(() => {
    loadAnalysisData();

    unsubscribers.push(
      websocketService.subscribe('system-metric', loadAnalysisData),
      websocketService.subscribe('trigger-fired', (data) => {
        triggeredEvents = [data, ...triggeredEvents].slice(0, 10);
      })
    );
  });

  onDestroy(() => {
    unsubscribers.forEach(unsub => unsub());
    if (cpuChart) {
      cpuChart.destroy();
    }
  });

  // Calculate health status
  $: cpuHealth = performanceMetrics.cpu > 80 ? 'critical' : performanceMetrics.cpu > 60 ? 'warning' : 'good';
  $: memHealth = performanceMetrics.memory > 80 ? 'critical' : performanceMetrics.memory > 60 ? 'warning' : 'good';
</script>

<div class="analysis-overview">
  <div class="header">
    <div class="header-content">
      <h1>📊 Analysis Overview</h1>
      <p class="subtitle">Performance metrics, trends, and insights</p>
    </div>
    <div class="header-actions">
      <span class="last-updated">Updated {Math.floor((new Date() - lastUpdated) / 1000)}s ago</span>
      <button class="refresh-btn" on:click={loadAnalysisData} disabled={loading}>
        {loading ? '⏳' : '🔄'} Refresh
      </button>
    </div>
  </div>

  {#if error}
    <div class="error-banner">
      <span>⚠️ Failed to load analysis data: {error}</span>
      <button on:click={loadAnalysisData}>Retry</button>
    </div>
  {:else if loading}
    <div class="loading-skeleton">
      <div class="skeleton-card"></div>
      <div class="skeleton-card"></div>
      <div class="skeleton-card"></div>
      <div class="skeleton-card"></div>
    </div>
  {:else}
    <!-- Performance Cards -->
    <div class="performance-grid">
      <div class="perf-card" class:warning={cpuHealth === 'warning'} class:critical={cpuHealth === 'critical'}>
        <div class="perf-header">
          <span class="perf-icon">🖥️</span>
          <span class="perf-label">CPU Usage</span>
        </div>
        <div class="perf-value">{performanceMetrics.cpu}%</div>
        <div class="perf-bar">
          <div class="perf-fill" style="width: {performanceMetrics.cpu}%; background: {cpuHealth === 'critical' ? '#ef4444' : cpuHealth === 'warning' ? '#f59e0b' : '#10b981'}"></div>
        </div>
        <div class="perf-status">{cpuHealth === 'good' ? 'Normal' : cpuHealth === 'warning' ? 'Elevated' : 'High'}</div>
      </div>

      <div class="perf-card" class:warning={memHealth === 'warning'} class:critical={memHealth === 'critical'}>
        <div class="perf-header">
          <span class="perf-icon">💾</span>
          <span class="perf-label">Memory Usage</span>
        </div>
        <div class="perf-value">{performanceMetrics.memory}%</div>
        <div class="perf-bar">
          <div class="perf-fill" style="width: {performanceMetrics.memory}%; background: {memHealth === 'critical' ? '#ef4444' : memHealth === 'warning' ? '#f59e0b' : '#10b981'}"></div>
        </div>
        <div class="perf-status">{memHealth === 'good' ? 'Normal' : memHealth === 'warning' ? 'Elevated' : 'High'}</div>
      </div>
    </div>

    <!-- Chart -->
    <div class="chart-card">
      <h2>📈 System Performance (Last 20 Data Points)</h2>
      <div class="chart-container">
        <canvas bind:this={cpuChartCanvas}></canvas>
      </div>
    </div>

    <!-- Quick Stats -->
    <div class="stats-grid">
      <a href="#analysis-triggers" class="stat-card">
        <div class="stat-icon">⚡</div>
        <div class="stat-content">
          <div class="stat-value">{activeTriggers}</div>
          <div class="stat-label">Active Triggers</div>
          <div class="stat-detail">Automated monitoring rules</div>
        </div>
      </a>

      <a href="#analysis-session-replay" class="stat-card">
        <div class="stat-icon">🎬</div>
        <div class="stat-content">
          <div class="stat-value">{totalSessions}</div>
          <div class="stat-label">Recent Sessions</div>
          <div class="stat-detail">Available for replay</div>
        </div>
      </a>

      <a href="#analysis-developer-insights" class="stat-card">
        <div class="stat-icon">👨‍💻</div>
        <div class="stat-content">
          <div class="stat-value">Live</div>
          <div class="stat-label">Developer Insights</div>
          <div class="stat-detail">Productivity metrics</div>
        </div>
      </a>

      <a href="#analysis-trends" class="stat-card">
        <div class="stat-icon">📉</div>
        <div class="stat-content">
          <div class="stat-value">Trends</div>
          <div class="stat-label">Historical Data</div>
          <div class="stat-detail">Analyze patterns</div>
        </div>
      </a>
    </div>

    <!-- Recent Triggered Events -->
    {#if triggeredEvents.length > 0}
      <div class="section-card">
        <h2>🔔 Recent Triggered Events</h2>
        <div class="events-list">
          {#each triggeredEvents.slice(0, 5) as event (event.id || event.timestamp)}
            <div class="trigger-event">
              <div class="trigger-icon">⚡</div>
              <div class="trigger-content">
                <div class="trigger-title">{event.trigger_name || 'Trigger Fired'}</div>
                <div class="trigger-meta">
                  {event.message || event.event_type} · {new Date(event.timestamp || Date.now()).toLocaleString()}
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Quick Actions -->
    <div class="quick-actions">
      <h2>🚀 Quick Actions</h2>
      <div class="actions-grid">
        <a href="#analysis-performance" class="action-card">
          <div class="action-icon">📊</div>
          <div>
            <div class="action-title">Performance Metrics</div>
            <div class="action-description">CPU, memory, and correlations</div>
          </div>
        </a>

        <a href="#analysis-custom-metrics" class="action-card">
          <div class="action-icon">📈</div>
          <div>
            <div class="action-title">Custom Metrics</div>
            <div class="action-description">User-defined dashboards</div>
          </div>
        </a>

        <a href="#analysis-trends" class="action-card">
          <div class="action-icon">📉</div>
          <div>
            <div class="action-title">Historical Trends</div>
            <div class="action-description">Time-series analysis</div>
          </div>
        </a>

        <a href="#analysis-triggers" class="action-card">
          <div class="action-icon">⚡</div>
          <div>
            <div class="action-title">Configure Triggers</div>
            <div class="action-description">Automated monitoring rules</div>
          </div>
        </a>

        <a href="#analysis-session-replay" class="action-card">
          <div class="action-icon">🎬</div>
          <div>
            <div class="action-title">Session Replay</div>
            <div class="action-description">Review coding sessions</div>
          </div>
        </a>

        <a href="#analysis-developer-insights" class="action-card">
          <div class="action-icon">👨‍💻</div>
          <div>
            <div class="action-title">Developer Insights</div>
            <div class="action-description">Productivity analytics</div>
          </div>
        </a>
      </div>
    </div>
  {/if}
</div>

<style>
  .analysis-overview {
    padding: 1rem;
    max-width: 1400px;
    margin: 0 auto;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1rem;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .header-content h1 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .subtitle {
    margin: 0.25rem 0 0 0;
    color: var(--text-secondary);
    font-size: 0.85rem;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .last-updated {
    color: var(--text-secondary);
    font-size: 0.85rem;
  }

  .refresh-btn {
    padding: 0.5rem 1rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.9rem;
    transition: all 0.2s;
  }

  .refresh-btn:hover:not(:disabled) {
    background: var(--bg-tertiary);
    border-color: var(--primary);
  }

  .refresh-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Performance Grid */
  .performance-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 1.5rem;
    margin-bottom: 1rem;
  }

  .perf-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 1.5rem;
  }

  .perf-card.warning {
    border-color: #f59e0b;
    background: linear-gradient(135deg, var(--bg-secondary) 0%, rgba(245, 158, 11, 0.05) 100%);
  }

  .perf-card.critical {
    border-color: #ef4444;
    background: linear-gradient(135deg, var(--bg-secondary) 0%, rgba(239, 68, 68, 0.05) 100%);
  }

  .perf-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .perf-icon {
    font-size: 1.5rem;
  }

  .perf-label {
    font-weight: 600;
    color: var(--text-primary);
  }

  .perf-value {
    font-size: 2.5rem;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 1rem;
  }

  .perf-bar {
    height: 8px;
    background: var(--bg-tertiary);
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 0.5rem;
  }

  .perf-fill {
    height: 100%;
    transition: width 0.5s ease;
  }

  .perf-status {
    font-size: 0.85rem;
    color: var(--text-secondary);
  }

  /* Chart Card */
  .chart-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 1rem;
    margin-bottom: 1rem;
  }

  .chart-card h2 {
    margin: 0 0 0.75rem 0;
    font-size: 1rem;
    color: var(--text-primary);
  }

  .chart-container {
    height: 250px;
  }

  /* Stats Grid */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .stat-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 0.65rem 0.85rem;
    display: flex;
    gap: 0.85rem;
    align-items: center;
    text-decoration: none;
    transition: all 0.2s;
  }

  .stat-card:hover {
    border-color: var(--primary);
    transform: translateY(-2px);
  }

  .stat-icon {
    font-size: 1.65rem;
    line-height: 1;
    flex-shrink: 0;
  }

  .stat-content {
    flex: 1;
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    flex-wrap: wrap;
  }

  .stat-value {
    font-size: 1.65rem;
    font-weight: 700;
    color: var(--text-primary);
    line-height: 1;
    margin: 0;
  }

  .stat-label {
    color: var(--text-secondary);
    font-size: 0.82rem;
    margin: 0;
    line-height: 1.1;
    font-weight: 500;
  }

  .stat-detail {
    font-size: 0.72rem;
    color: var(--text-tertiary);
    line-height: 1.2;
    margin: 0;
    flex-basis: 100%;
  }

  /* Section Card */
  .section-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 1rem;
    margin-bottom: 1rem;
  }

  .section-card h2 {
    margin: 0 0 0.75rem 0;
    font-size: 1rem;
    color: var(--text-primary);
  }

  /* Events List */
  .events-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .trigger-event {
    display: flex;
    gap: 0.75rem;
    padding: 0.65rem 0.85rem;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
  }

  .trigger-icon {
    font-size: 1.25rem;
    flex-shrink: 0;
  }

  .trigger-content {
    flex: 1;
  }

  .trigger-title {
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 0.25rem;
  }

  .trigger-meta {
    font-size: 0.85rem;
    color: var(--text-secondary);
  }

  /* Quick Actions */
  .quick-actions h2 {
    margin: 0 0 0.75rem 0;
    font-size: 1rem;
    color: var(--text-primary);
  }

  .actions-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 0.75rem;
  }

  .action-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 0.65rem 0.85rem;
    text-decoration: none;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 0.85rem;
  }

  .action-card:hover {
    border-color: var(--primary);
    transform: translateY(-2px);
  }

  .action-icon {
    font-size: 1.65rem;
    line-height: 1;
    flex-shrink: 0;
  }

  .action-title {
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 0.15rem 0;
    font-size: 0.85rem;
    line-height: 1.2;
  }

  .action-description {
    font-size: 0.72rem;
    color: var(--text-secondary);
    line-height: 1.2;
    margin: 0;
  }

  /* Loading & Error States */
  .loading-skeleton {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1.5rem;
  }

  .skeleton-card {
    height: 150px;
    background: linear-gradient(90deg, var(--bg-secondary) 25%, var(--bg-tertiary) 50%, var(--bg-secondary) 75%);
    background-size: 200% 100%;
    animation: loading 1.5s infinite;
    border-radius: 12px;
  }

  @keyframes loading {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  .error-banner {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid #ef4444;
    border-radius: 8px;
    padding: 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
  }

  .error-banner button {
    padding: 0.5rem 1rem;
    background: #ef4444;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .analysis-overview {
      padding: 1rem;
    }

    .header {
      flex-direction: column;
    }

    .performance-grid,
    .stats-grid,
    .actions-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
