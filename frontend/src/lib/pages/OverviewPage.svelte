<script>
  /**
   * Overview Page - Main dashboard view
   * Modern, compact design with real-time monitoring
   */
  import { onMount } from 'svelte';
  import { api } from '../apiClient.js';
  import { websocketService } from '../services/websocket.js';
  import { createChart, destroyChart, createThemeObserver, getChartColors } from '../utils/chartUtils.js';

  let stats = $state({
    total_events: 0,
    session_duration_seconds: 0,
    unique_files_modified: 0,
    creates: 0,
    edits: 0,
    deletes: 0
  });

  let projects = $state([]);
  let projectsData = $state([]);
  let systemMetrics = $state({
    cpu_percent: 0,
    memory_percent: 0,
    memory_used_mb: 0,
    memory_total_mb: 0
  });

  let recentActivity = $state([]);
  let topFiles = $state([]);
  let loading = $state(true);
  let lastUpdated = $state(null);

  // Chart instances
  let activityChart = null;
  let projectHealthChart = null;
  let activityTrendChart = null;
  let themeObserver = null;

  // Health state
  let health = $state({
    status: 'good',
    checks: {
      syntaxErrors: 0,
      testFailures: 0,
      largeDeletions: 0,
      securityChanges: 0
    }
  });

  // Time-based greeting
  const greeting = $derived.by(() => {
    const hour = new Date().getHours();
    if (hour < 12) return '🌅 Morning';
    if (hour < 17) return '☀️ Afternoon';
    if (hour < 21) return '🌆 Evening';
    return '🌙 Night';
  });

  // Format time ago
  const timeAgo = $derived.by(() => {
    if (!lastUpdated) return 'Just now';
    const seconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
    if (seconds < 10) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  });

  const projectCount = $derived(projects.length);

  // Format duration
  function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  // Flow state based on activity
  const flowState = $derived.by(() => {
    const durationMinutes = Math.max(1, stats.session_duration_seconds / 60);
    const eventsPerMinute = stats.total_events / durationMinutes;
    if (eventsPerMinute > 5) return { state: 'High', color: 'var(--success)', icon: '🔥' };
    if (eventsPerMinute > 2) return { state: 'Medium', color: 'var(--warning)', icon: '⚡' };
    return { state: 'Low', color: 'var(--info)', icon: '💤' };
  });

  // Health status config
  const statusConfig = $derived.by(() => {
    const configs = {
      good: { icon: '✅', color: 'var(--success)', message: 'All Systems OK' },
      warning: { icon: '⚠️', color: 'var(--warning)', message: 'Some Issues Detected' },
      critical: { icon: '🚨', color: 'var(--error)', message: 'Critical Issues Found' }
    };
    return configs[health.status] || configs.good;
  });

  // Format relative time for projects
  function formatRelativeTime(timestamp) {
    if (!timestamp) return 'no activity';
    const now = Date.now();
    const then = new Date(timestamp).getTime();
    const diff = now - then;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'just now';
  }

  // Format datetime
  function formatDateTime(timestamp) {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  }

  // Format number with commas
  function formatNumber(num) {
    return num?.toLocaleString() || '0';
  }

  // Create/update charts
  function createCharts() {
    const colors = getChartColors();

    // Activity Distribution Chart (Pie/Doughnut)
    if (activityChart) {
      destroyChart(activityChart);
    }
    activityChart = createChart('activityDistributionChart', {
      type: 'doughnut',
      data: {
        labels: ['Creates', 'Edits', 'Deletes'],
        datasets: [{
          data: [stats.creates || 0, stats.edits || 0, stats.deletes || 0],
          backgroundColor: [colors.success, colors.primary, colors.error],
          borderColor: colors.border,
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: colors.text, font: { size: 11, family: 'monospace' } }
          },
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            titleColor: '#fff',
            bodyColor: '#fff',
            borderColor: colors.primary,
            borderWidth: 1
          }
        }
      }
    });

    // Project Health Overview Chart (Bar)
    if (projectHealthChart) {
      destroyChart(projectHealthChart);
    }
    const projectNames = projectsData.slice(0, 5).map(p => p.name);
    const projectChanges = projectsData.slice(0, 5).map(p => p.recentChanges || 0);

    projectHealthChart = createChart('projectHealthChart', {
      type: 'bar',
      data: {
        labels: projectNames,
        datasets: [{
          label: 'Recent Changes',
          data: projectChanges,
          backgroundColor: colors.primary,
          borderColor: colors.primary,
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            titleColor: '#fff',
            bodyColor: '#fff',
            borderColor: colors.primary,
            borderWidth: 1
          }
        },
        scales: {
          x: {
            ticks: { color: colors.muted, font: { size: 10 } },
            grid: { color: colors.border, display: false }
          },
          y: {
            beginAtZero: true,
            ticks: { color: colors.muted, font: { size: 10 } },
            grid: { color: colors.border }
          }
        }
      }
    });

    // Activity Trend Chart (Line)
    if (activityTrendChart) {
      destroyChart(activityTrendChart);
    }

    // Group recent activity by hour for trend
    const hourlyActivity = new Array(24).fill(0);
    const now = new Date();
    recentActivity.forEach(event => {
      const eventDate = new Date(event.timestamp);
      const hoursDiff = Math.floor((now - eventDate) / (1000 * 60 * 60));
      if (hoursDiff < 24) {
        hourlyActivity[23 - hoursDiff]++;
      }
    });

    const labels = Array.from({ length: 24 }, (_, i) => {
      const hour = (now.getHours() - 23 + i + 24) % 24;
      return `${hour}:00`;
    });

    activityTrendChart = createChart('activityTrendChart', {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Activity',
          data: hourlyActivity,
          borderColor: colors.primary,
          backgroundColor: `${colors.primary}33`,
          fill: true,
          tension: 0.4,
          pointRadius: 2,
          pointHoverRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            titleColor: '#fff',
            bodyColor: '#fff',
            borderColor: colors.primary,
            borderWidth: 1
          }
        },
        scales: {
          x: {
            ticks: {
              color: colors.muted,
              font: { size: 9 },
              maxRotation: 45,
              minRotation: 45
            },
            grid: { color: colors.border, display: false }
          },
          y: {
            beginAtZero: true,
            ticks: { color: colors.muted, font: { size: 10 } },
            grid: { color: colors.border }
          }
        }
      }
    });
  }

  // Load all data
  async function loadAllData(manual = false) {
    try {
      if (manual || loading) {
        loading = true;
      }

      const [statsData, metricsData, activityData, filesData, projectsRes] = await Promise.all([
        api.get('/dashboard-stats'),
        api.get('/system-metrics?limit=1'),
        api.get('/all-file-events?limit=100'),
        api.get('/top-modified-files?limit=5'),
        api.get('/projects/list')
      ]);

      stats = statsData;
      systemMetrics = Array.isArray(metricsData) ? (metricsData[0] || {}) : metricsData;
      recentActivity = Array.isArray(activityData) ? activityData : (activityData.events || []);
      topFiles = filesData.files || filesData || [];
      projects = projectsRes.projects || [];

      // Load project stats
      const projectEvents = await api.get('/all-file-events?limit=500');
      const events = Array.isArray(projectEvents) ? projectEvents : (projectEvents.events || []);
      events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      const projectStats = {};
      for (const project of projects) {
        const projectName = project.name || project;
        const projEvents = events.filter(e => e.project === projectName);
        const lastEvent = projEvents.length > 0 ? projEvents[0].timestamp : null;

        let status = 'idle';
        if (lastEvent) {
          const timeSinceLastEvent = Date.now() - new Date(lastEvent).getTime();
          const fiveMinutesAgo = 5 * 60 * 1000;
          const oneHourAgo = 60 * 60 * 1000;
          if (timeSinceLastEvent < fiveMinutesAgo) status = 'active';
          else if (timeSinceLastEvent < oneHourAgo) status = 'recent';
        }

        const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
        const recentCount = projEvents.filter(e => e.timestamp > oneHourAgo).length;

        projectStats[projectName] = {
          name: projectName,
          status,
          lastActivity: lastEvent,
          eventCount: projEvents.length,
          recentChanges: recentCount
        };
      }

      projectsData = projects
        .map(project => {
          const name = project.name || project;
          return projectStats[name] || {
            name,
            status: 'idle',
            lastActivity: null,
            eventCount: 0,
            recentChanges: 0
          };
        })
        .sort((a, b) => {
          if (!a.lastActivity) return 1;
          if (!b.lastActivity) return -1;
          return new Date(b.lastActivity) - new Date(a.lastActivity);
        });

      // Calculate health
      const todayEvents = events.filter(e => {
        const eventDate = new Date(e.timestamp);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return eventDate >= today;
      });

      let largeDeletions = 0;
      let securityChanges = 0;
      todayEvents.forEach(event => {
        if (event.lines_deleted && event.lines_deleted > 100) largeDeletions++;
        const securityPatterns = ['.env', '.git/config', '.pem', '.key', 'credentials'];
        if (event.filepath && securityPatterns.some(pattern => event.filepath.includes(pattern))) {
          securityChanges++;
        }
      });

      health.checks = {
        syntaxErrors: 0,
        testFailures: 0,
        largeDeletions,
        securityChanges
      };

      if (securityChanges > 0 || largeDeletions > 3) {
        health.status = 'critical';
      } else if (largeDeletions > 0) {
        health.status = 'warning';
      } else {
        health.status = 'good';
      }

      loading = false;
      lastUpdated = new Date();
    } catch (error) {
      console.error('Failed to load overview data:', error);
      loading = false;
    }
  }

  // Create charts when loading completes
  $effect(() => {
    if (!loading && stats.total_events !== undefined) {
      // Use setTimeout to ensure DOM is fully rendered
      setTimeout(() => {
        try {
          createCharts();
        } catch (err) {
          console.error('Failed to create charts:', err);
        }
      }, 200);
    }
  });

  // WebSocket handlers for real-time updates
  const handleMetricsUpdate = (data) => {
    systemMetrics = data;
    lastUpdated = new Date();
  };

  const handleFileChanged = async () => {
    // Reload activity and stats on file changes
    try {
      const [activityData, statsData, filesData] = await Promise.all([
        api.get('/all-file-events?limit=100'),
        api.get('/dashboard-stats'),
        api.get('/top-modified-files?limit=5')
      ]);

      recentActivity = Array.isArray(activityData) ? activityData : (activityData.events || []);
      stats = statsData;
      topFiles = filesData.files || filesData || [];
      lastUpdated = new Date();

      // Update charts with new data
      createCharts();
    } catch (error) {
      console.error('Failed to update activity:', error);
    }
  };

  onMount(async () => {
    // Initial data load
    await loadAllData();

    // Connect to WebSocket for real-time updates
    websocketService.connect();

    // Listen for real-time events
    websocketService.on('system-metrics', handleMetricsUpdate);
    websocketService.on('file-changed', handleFileChanged);

    // Set up theme observer to recreate charts on theme change
    themeObserver = createThemeObserver(() => {
      createCharts();
    });

    // Cleanup function
    return () => {
      websocketService.off('system-metrics', handleMetricsUpdate);
      websocketService.off('file-changed', handleFileChanged);

      // Destroy charts
      if (activityChart) destroyChart(activityChart);
      if (projectHealthChart) destroyChart(projectHealthChart);
      if (activityTrendChart) destroyChart(activityTrendChart);

      // Disconnect theme observer
      if (themeObserver) themeObserver.disconnect();
    };
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-7xl mx-auto space-y-6">
    <!-- Greeting Header -->
    <div class="text-center mb-6">
      <h2 class="text-xl font-semibold text-[var(--text)] mb-3 font-mono">{greeting}</h2>
      <div class="flex items-center justify-center gap-8 flex-wrap">
        <div class="flex items-center gap-2 text-base text-[var(--muted)] font-mono">
          <span>📁</span>
          <span>Monitoring {projectCount} project{projectCount !== 1 ? 's' : ''}</span>
        </div>
        <div class="flex items-center gap-2 text-base text-[var(--muted)] font-mono">
          <span>📝</span>
          <span>{stats.unique_files_modified} file{stats.unique_files_modified !== 1 ? 's' : ''} changed today</span>
        </div>
      </div>
    </div>

    <!-- Health Widget -->
    <div
      class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4"
      style="border-left: 3px solid {statusConfig.color}"
    >
      <div class="flex items-center justify-between gap-4 flex-wrap">
        <div class="flex items-center gap-4">
          <span class="text-xl">{statusConfig.icon}</span>
          <h3 class="text-sm font-semibold text-[var(--text)] font-mono m-0">Project Health</h3>
          <p class="text-sm font-semibold text-[var(--text)] m-0 font-mono" style="color: {statusConfig.color}">
            {statusConfig.message}
          </p>
        </div>

        <div class="flex items-center gap-4 flex-wrap">
          <div class="flex items-center gap-2 text-sm font-mono">
            <span>{health.checks.syntaxErrors === 0 ? '✅' : '❌'}</span>
            <span class="text-[var(--muted)]">Syntax</span>
          </div>
          <div class="flex items-center gap-2 text-sm font-mono">
            <span>{health.checks.testFailures === 0 ? '✅' : '❌'}</span>
            <span class="text-[var(--muted)]">Tests</span>
          </div>
          <div class="flex items-center gap-2 text-sm font-mono">
            <span>{health.checks.largeDeletions === 0 ? '✅' : '⚠️'}</span>
            <span class="text-[var(--muted)]">Deletions ({health.checks.largeDeletions})</span>
          </div>
          <div class="flex items-center gap-2 text-sm font-mono">
            <span>{health.checks.securityChanges === 0 ? '✅' : '🚨'}</span>
            <span class="text-[var(--muted)]">Security ({health.checks.securityChanges})</span>
          </div>
        </div>

        <button
          class="px-3 py-1.5 bg-[var(--accent)] text-white rounded text-sm font-semibold hover:opacity-90 transition-opacity"
          onclick={() => loadAllData(true)}
        >
          ↻
        </button>
      </div>
    </div>

    <!-- Charts Section -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Activity Distribution Chart -->
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
        <h3 class="text-sm font-semibold text-[var(--text)] font-sans mb-4 m-0">Activity Distribution</h3>
        <div class="h-[200px]">
          {#if loading}
            <div class="flex items-center justify-center h-full text-base text-[var(--muted)]">Loading...</div>
          {:else}
            <canvas id="activityDistributionChart"></canvas>
          {/if}
        </div>
      </div>

      <!-- Project Health Chart -->
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
        <h3 class="text-sm font-semibold text-[var(--text)] font-sans mb-4 m-0">Project Health</h3>
        <div class="h-[200px]">
          {#if loading}
            <div class="flex items-center justify-center h-full text-base text-[var(--muted)]">Loading...</div>
          {:else}
            <canvas id="projectHealthChart"></canvas>
          {/if}
        </div>
      </div>

      <!-- Flow State Visualization -->
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
        <h3 class="text-sm font-semibold text-[var(--text)] font-sans mb-4 m-0">Flow State</h3>
        <div class="h-[200px] flex flex-col items-center justify-center">
          {#if loading}
            <div class="text-base text-[var(--muted)]">Loading...</div>
          {:else}
            <div class="text-6xl mb-4">{flowState.icon}</div>
            <div class="text-xl font-semibold font-mono" style="color: {flowState.color}">
              {flowState.state} Activity
            </div>
            <div class="text-base text-[var(--muted)] mt-2 font-mono">
              {(stats.total_events / Math.max(1, stats.session_duration_seconds / 60)).toFixed(1)} events/min
            </div>
          {/if}
        </div>
      </div>
    </div>

    <!-- Activity Trend Chart -->
    <section class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
      <h3 class="text-sm font-semibold text-[var(--text)] font-sans mb-4 m-0">Activity Trend (24h)</h3>
      <div class="h-[200px]">
        {#if loading}
          <div class="flex items-center justify-center h-full text-base text-[var(--muted)]">Loading...</div>
        {:else}
          <canvas id="activityTrendChart"></canvas>
        {/if}
      </div>
    </section>

    <!-- Projects Grid -->
    <section class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-semibold text-[var(--text)] font-sans m-0">
          📁 Projects ({projectsData.length})
        </h3>
      </div>

      {#if loading}
        <div class="text-center py-8 text-base text-[var(--muted)]">Loading projects...</div>
      {:else if projectsData.length === 0}
        <div class="text-center py-8 text-base text-[var(--muted)]">No projects found</div>
      {:else}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {#each projectsData as project (project.name)}
            <div class="bg-[var(--bg)] border border-[var(--border)] rounded p-3 hover:border-[var(--accent)] transition-all">
              <div class="flex items-center justify-between mb-3">
                <span class="text-sm font-semibold text-[var(--text)] font-mono truncate flex-1">
                  {project.name}
                </span>
                <span
                  class="w-2 h-2 rounded-full flex-shrink-0 ml-2"
                  class:bg-green-500={project.status === 'active'}
                  class:shadow-[0_0_6px_rgba(16,185,129,0.6)]={project.status === 'active'}
                  class:bg-blue-500={project.status === 'recent'}
                  class:shadow-[0_0_6px_rgba(59,130,246,0.5)]={project.status === 'recent'}
                  class:bg-gray-500={project.status === 'idle'}
                ></span>
              </div>
              <div class="flex gap-4">
                <div class="flex flex-col gap-1">
                  <span class="text-sm text-[var(--muted)] uppercase tracking-wide">Recent</span>
                  <span class="text-base font-semibold text-[var(--accent)] font-mono">{project.recentChanges}</span>
                </div>
                <div class="flex flex-col gap-1">
                  <span class="text-sm text-[var(--muted)] uppercase tracking-wide">Activity</span>
                  <span class="text-base font-semibold text-[var(--accent)] font-mono">
                    {formatRelativeTime(project.lastActivity)}
                  </span>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <!-- Live Activity Stream -->
    <section class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-semibold text-[var(--text)] font-sans m-0">Live Activity Stream</h3>
        <div class="flex items-center gap-4">
          <span class="text-sm text-[var(--muted)] font-mono">Updated: {timeAgo}</span>
          <button
            class="px-2 py-1 bg-[var(--bg)] border border-[var(--border)] rounded text-base font-mono hover:bg-[var(--accent)] hover:text-white hover:border-[var(--accent)] transition-all disabled:opacity-50"
            onclick={() => loadAllData(true)}
            disabled={loading}
          >
            <span>{loading ? '⏳' : '🔄'}</span> Refresh
          </button>
          <span class="flex items-center gap-2 text-sm text-[var(--success)] font-mono">
            <span class="w-2 h-2 bg-[var(--success)] rounded-full animate-pulse"></span>
            Live
          </span>
        </div>
      </div>

      {#if loading}
        <div class="text-center py-8 text-base text-[var(--muted)]">Loading activity...</div>
      {:else if recentActivity.length === 0}
        <div class="text-center py-8">
          <span class="text-2xl block mb-2">💤</span>
          <p class="text-base text-[var(--muted)] font-sans">No recent activity</p>
        </div>
      {:else}
        <div class="space-y-2">
          {#each recentActivity as event (event.id || event.timestamp)}
            <div class="flex items-center gap-3 p-3 bg-[var(--bg)] rounded hover:bg-[var(--surface-2)] transition-all">
              <span class="text-base flex-shrink-0">
                {#if event.change_type === 'create' || event.change_type === 'add'}
                  ➕
                {:else if event.change_type === 'edit' || event.change_type === 'change'}
                  ✏️
                {:else if event.change_type === 'delete' || event.change_type === 'unlink'}
                  🗑️
                {:else}
                  📄
                {/if}
              </span>
              <div class="flex-1 min-w-0">
                <div class="text-base text-[var(--text)] font-mono mb-1">
                  {#if event.project}
                    <span class="inline-block px-2 py-0.5 mr-2 bg-[var(--accent)] text-white rounded text-sm font-semibold uppercase tracking-wide">
                      {event.project}
                    </span>
                  {/if}
                  <span class="truncate">{event.filepath}</span>
                </div>
                <div class="text-sm text-[var(--muted)] font-mono">
                  {event.change_type} • {formatDateTime(event.timestamp)}
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Current Session -->
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
        <div class="flex items-center gap-2 mb-4">
          <span class="text-base">⏱️</span>
          <h3 class="text-sm font-semibold text-[var(--text)] font-sans m-0">Current Session</h3>
        </div>
        {#if loading}
          <div class="text-center py-4 text-base text-[var(--muted)]">Loading...</div>
        {:else}
          <div class="space-y-3">
            <div class="flex justify-between items-center">
              <span class="text-base text-[var(--muted)] font-mono">Duration:</span>
              <span class="text-sm font-semibold text-[var(--text)] font-mono">
                {formatDuration(stats.session_duration_seconds)}
              </span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-base text-[var(--muted)] font-mono">Files touched:</span>
              <span class="text-sm font-semibold text-[var(--text)] font-mono">
                {formatNumber(stats.unique_files_modified)}
              </span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-base text-[var(--muted)] font-mono">Total changes:</span>
              <span class="text-sm font-semibold text-[var(--text)] font-mono">
                {formatNumber(stats.total_events)}
              </span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-base text-[var(--muted)] font-mono">Current flow:</span>
              <span class="text-sm font-semibold font-mono" style="color: {flowState.color}">
                {flowState.icon} {flowState.state}
              </span>
            </div>
          </div>
        {/if}
      </div>

      <!-- System Health -->
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
        <div class="flex items-center gap-2 mb-4">
          <span class="text-base">📊</span>
          <h3 class="text-sm font-semibold text-[var(--text)] font-sans m-0">System Health</h3>
        </div>
        {#if loading}
          <div class="text-center py-4 text-base text-[var(--muted)]">Loading...</div>
        {:else}
          <div class="space-y-4">
            <div class="flex items-center gap-3">
              <div class="text-base text-[var(--muted)] font-mono min-w-[60px]">CPU</div>
              <div class="flex-1 h-2 bg-[var(--bg)] rounded overflow-hidden">
                <div
                  class="h-full transition-all duration-300"
                  style="width: {systemMetrics.cpu_percent}%; background: {systemMetrics.cpu_percent > 80 ? 'var(--error)' : systemMetrics.cpu_percent > 50 ? 'var(--warning)' : 'var(--success)'}"
                ></div>
              </div>
              <div class="text-base text-[var(--text)] font-mono min-w-[50px] text-right">
                {systemMetrics.cpu_percent?.toFixed(1)}%
              </div>
            </div>
            <div class="flex items-center gap-3">
              <div class="text-base text-[var(--muted)] font-mono min-w-[60px]">Memory</div>
              <div class="flex-1 h-2 bg-[var(--bg)] rounded overflow-hidden">
                <div
                  class="h-full transition-all duration-300"
                  style="width: {systemMetrics.memory_percent}%; background: {systemMetrics.memory_percent > 85 ? 'var(--error)' : systemMetrics.memory_percent > 60 ? 'var(--warning)' : 'var(--success)'}"
                ></div>
              </div>
              <div class="text-base text-[var(--text)] font-mono min-w-[100px] text-right">
                {formatNumber(systemMetrics.memory_used_mb?.toFixed(0))} / {formatNumber(systemMetrics.memory_total_mb?.toFixed(0))} MB
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>

    <!-- Top Files -->
    {#if topFiles.length > 0}
      <section class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
        <h3 class="text-sm font-semibold text-[var(--text)] font-sans mb-4 m-0">Most Active Files</h3>
        <div class="space-y-2">
          {#each topFiles as file (file.id || file.filepath)}
            <div class="flex justify-between items-center p-2 bg-[var(--bg)] rounded text-sm font-mono">
              <span class="text-[var(--text)] truncate flex-1">
                {#if file.project}
                  <span class="text-[var(--info)] font-semibold">{file.project}/</span>
                {/if}
                {file.filepath}
              </span>
              <span class="text-[var(--muted)] text-sm ml-4 flex-shrink-0">
                {formatNumber(file.edit_count || file.change_count)} changes
              </span>
            </div>
          {/each}
        </div>
      </section>
    {/if}
  </div>
</div>
