<script>
  import { logger } from '../logger.js';
  import { onMount } from 'svelte';
  import { createPageApi } from '../apiClient.js';
  import { PageLayout, PageHeader, StatusBar } from '../components/layout/index.js';
  import {
    RefreshButton,
    ToolbarButton,
    FilterToggle,
    EmptyState,
    LoadingState
  } from '../components/ui/index.js';
  import FreshnessBadge from '../components/ui/FreshnessBadge.svelte';
  const { api, abort: abortRequests } = createPageApi();
  import { websocketService } from '../services/websocket.js';
  import { formatDateTime } from '../timeFormat.js';
  import { getChartColors, chartFill } from '../utils/chartUtils.js';
  import { Chart, registerables } from 'chart.js';

  Chart.register(...registerables);

  /**
   * Activity Overview Page - Svelte 5
   * Complete activity log with file + agent events, charts, session grouping
   */

  // State - using Svelte 5 runes
  // `allActivities` is the full filtered result of the last fetch; `activities`
  // is the client-side page slice rendered. Load-more grows the page without
  // re-downloading anything.
  let allActivities = $state([]);
  let activities = $state([]);
  let total = $state(0);
  let loading = $state(false);
  let searchQuery = $state('');
  let selectedType = $state('all');
  let expandedActivity = $state(null);
  let lastUpdated = $state(null);

  // Pagination — purely client-side over the already-fetched set.
  let limit = $state(100);
  let visibleCount = $state(100);
  let hasMore = $state(false);

  // Stats
  let stats = $state({
    file: 0,
    agent: 0,
    system: 0
  });

  // Session grouping
  let groupBySession = $state(true);
  let sortBy = $state('time_desc');
  let collapsedSessions = $state(new Set());
  let sessions = $state([]);

  // Charts
  let showCharts = $state(true);
  let charts = $state({});
  let themeObserver = $state(null);

  // Derived values
  const timeAgo = $derived.by(() => {
    if (!lastUpdated) return 'Just now';
    const seconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
    if (seconds < 10) return 'Just now';
    else if (seconds < 60) return `${seconds}s ago`;
    else if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    else return `${Math.floor(seconds / 3600)}h ago`;
  });

  const enhancedStats = $derived({
    totalActivities: activities.length,
    uniqueSessions: sessions.length,
    averageSessionDuration:
      sessions.length > 0
        ? Math.floor(sessions.reduce((sum, s) => sum + s.duration, 0) / sessions.length)
        : 0,
    activitiesPerHour:
      activities.length > 0 && sessions.length > 0
        ? (
            activities.length / Math.max(1, sessions.reduce((sum, s) => sum + s.duration, 0) / 3600)
          ).toFixed(2)
        : 0
  });

  async function loadActivities(_manual = false) {
    try {
      loading = true;

      // Load both file events and agent events from all projects
      const [fileEvents, agentEvents] = await Promise.all([
        api.get('/file-events?limit=1000').catch(() => []),
        api.get('/all-agent-events?limit=1000').catch(() => [])
      ]);

      const fileEventsArray = Array.isArray(fileEvents) ? fileEvents : [];
      const agentEventsArray = Array.isArray(agentEvents) ? agentEvents : [];

      // Combine and convert to activity format
      const combined = [
        ...fileEventsArray.map(e => ({
          id: e.id || `file-${e.timestamp}`,
          timestamp: e.timestamp,
          type: e.change_type || 'file',
          category: 'file',
          description: `${e.change_type || 'modified'} ${e.filepath}`,
          target: e.filepath,
          session_id: e.session_id || null,
          metadata: {
            agent: e.agent_source,
            project_name: e.project_name,
            change_type: e.change_type,
            filepath: e.filepath
          }
        })),
        ...agentEventsArray.map(e => ({
          id: e.id || `agent-${e.timestamp}`,
          timestamp: e.timestamp,
          type: e.event_type || 'agent',
          category: 'agent',
          description: `${e.event_type || 'activity'} by ${e.agent}`,
          target: e.agent,
          session_id: e.session_id || null,
          metadata: {
            agent: e.agent,
            project_name: e.project_name,
            event_type: e.event_type,
            message: e.message
          }
        }))
      ];

      // Sort by timestamp (newest first)
      combined.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      // Apply filters
      let filtered = combined;
      if (selectedType !== 'all') {
        filtered = combined.filter(a => a.category === selectedType);
      }
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(
          a =>
            a.description.toLowerCase().includes(query) ||
            a.type.toLowerCase().includes(query) ||
            (a.target && a.target.toLowerCase().includes(query))
        );
      }

      // Keep the full filtered set; render only the visible page. A reload
      // (refresh / WS / filter change) re-derives the slice from the same
      // visibleCount so the user doesn't lose their scroll position.
      allActivities = filtered;
      total = filtered.length;
      activities = filtered.slice(0, visibleCount);
      hasMore = filtered.length > activities.length;

      // Calculate stats
      calculateStats();

      // Group by session if enabled
      groupActivitiesBySession();

      // Keep charts in sync with the data (was previously only built on the
      // showCharts false→true transition, so live updates left them stale).
      refreshChartsIfShown();

      lastUpdated = new Date();
      loading = false;
    } catch (error) {
      logger.error('Failed to load activity log:', error);
      loading = false;
    }
  }

  function calculateStats() {
    const safeActivities = Array.isArray(activities) ? activities : [];
    stats = {
      file: safeActivities.filter(a => a && a.category === 'file').length,
      agent: safeActivities.filter(a => a && a.category === 'agent').length,
      system: safeActivities.filter(a => a && a.category === 'system').length
    };
  }

  function groupActivitiesBySession() {
    if (!groupBySession) {
      sessions = [];
      return;
    }

    const sessionMap = new Map();

    activities.forEach(activity => {
      const sessionId = activity.session_id || 'no-session';

      if (!sessionMap.has(sessionId)) {
        sessionMap.set(sessionId, {
          id: sessionId,
          activities: [],
          startTime: activity.timestamp,
          endTime: activity.timestamp,
          filesCount: 0,
          agentCount: 0,
          systemCount: 0,
          totalEvents: 0
        });
      }

      const session = sessionMap.get(sessionId);
      session.activities.push(activity);
      session.totalEvents++;

      if (new Date(activity.timestamp) < new Date(session.startTime)) {
        session.startTime = activity.timestamp;
      }
      if (new Date(activity.timestamp) > new Date(session.endTime)) {
        session.endTime = activity.timestamp;
      }

      if (activity.category === 'file') session.filesCount++;
      if (activity.category === 'agent') session.agentCount++;
      if (activity.category === 'system') session.systemCount++;
    });

    let sessionsArray = Array.from(sessionMap.values()).map(session => ({
      ...session,
      duration: Math.floor((new Date(session.endTime) - new Date(session.startTime)) / 1000)
    }));

    sessions = applySorting(sessionsArray);
  }

  function applySorting(sessionsArray) {
    switch (sortBy) {
      case 'time_asc':
        return sessionsArray.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
      case 'time_desc':
        return sessionsArray.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
      case 'duration_desc':
        return sessionsArray.sort((a, b) => b.duration - a.duration);
      case 'events_desc':
        return sessionsArray.sort((a, b) => b.totalEvents - a.totalEvents);
      default:
        return sessionsArray.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    }
  }

  function toggleSession(sessionId) {
    if (collapsedSessions.has(sessionId)) {
      collapsedSessions.delete(sessionId);
    } else {
      collapsedSessions.add(sessionId);
    }
    collapsedSessions = new Set(collapsedSessions);
  }

  function setFilter(type) {
    selectedType = type;
    visibleCount = limit;
    loadActivities();
  }

  function search() {
    visibleCount = limit;
    loadActivities();
  }

  // Grow the visible page over the already-fetched set — no re-download.
  function loadMore() {
    visibleCount += limit;
    activities = allActivities.slice(0, visibleCount);
    hasMore = allActivities.length > activities.length;
    calculateStats();
    groupActivitiesBySession();
    refreshChartsIfShown();
  }

  function toggleActivity(activity) {
    if (expandedActivity?.id === activity.id) {
      expandedActivity = null;
    } else {
      expandedActivity = activity;
    }
  }

  async function exportLog() {
    try {
      const [fileEvents, agentEvents] = await Promise.all([
        api.get('/file-events?limit=10000').catch(() => []),
        api.get('/all-agent-events?limit=10000').catch(() => [])
      ]);

      const exportData = {
        exported_at: new Date().toISOString(),
        total_activities: activities.length,
        sessions: sessions.map(s => ({
          session_id: s.id,
          start_time: s.startTime,
          end_time: s.endTime,
          duration_seconds: s.duration,
          total_events: s.totalEvents,
          files_count: s.filesCount,
          agent_count: s.agentCount,
          system_count: s.systemCount
        })),
        file_events: fileEvents,
        agent_events: agentEvents
      };

      const json = JSON.stringify(exportData, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `raven-activity-log-${Date.now()}.json`;
      a.click();

      URL.revokeObjectURL(url);
    } catch (error) {
      logger.error('Export failed:', error);
    }
  }

  // Utility-class category color for the activity-row marker dot
  // (SystemPage methodTextClass pattern) — keeps semantic colors out of
  // inline styles.
  function getCategoryTextClass(category) {
    switch (category) {
      case 'file':
        return 'text-info';
      case 'agent':
        return 'text-accent';
      case 'system':
        return 'text-warning';
      default:
        return 'text-muted';
    }
  }

  function formatTimestamp(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (seconds < 60) return `${seconds}s ago`;
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return formatDateTime(timestamp);
  }

  function formatDuration(seconds) {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }

  // Rebuild charts if they're currently shown. Deferred a tick so the
  // canvases exist in the DOM (after the data-driven {#if} renders).
  function refreshChartsIfShown() {
    if (showCharts && activities.length > 0) {
      setTimeout(createCharts, 50);
    }
  }

  function createCharts() {
    Object.values(charts).forEach(chart => chart?.destroy());
    charts = {};

    if (!showCharts || activities.length === 0) return;

    // Theme-aware chart colors (shared helper; flips with dark mode).
    const c = getChartColors();
    const textColor = c.text;
    const mutedColor = c.muted;
    const gridColor = 'rgba(128, 128, 128, 0.15)';
    const themeColors = {
      accent: c.primary,
      success: c.success,
      warning: c.warning
    };

    // 1. Activity type breakdown pie chart
    const pieCanvas = document.getElementById('chart-activity-types');
    if (pieCanvas) {
      charts.activityTypes = new Chart(pieCanvas, {
        type: 'pie',
        data: {
          labels: ['File', 'Agent', 'System'],
          datasets: [
            {
              data: [stats.file, stats.agent, stats.system],
              backgroundColor: [themeColors.accent, themeColors.success, themeColors.warning]
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'right',
              labels: {
                color: textColor,
                font: { size: 11, family: 'var(--mono)' },
                padding: 8
              }
            },
            title: {
              display: true,
              text: 'Activity Type Breakdown',
              color: textColor,
              font: { size: 12, weight: 'bold', family: 'var(--mono)' }
            }
          }
        }
      });
    }

    // 2. Activities per session bar chart
    const barCanvas = document.getElementById('chart-activities-per-session');
    if (barCanvas && sessions.length > 0) {
      const topSessions = sessions.slice(0, 10);
      const sessionLabels = topSessions.map(s => s.id.substring(0, 8));
      const sessionData = topSessions.map(s => s.totalEvents);

      charts.activitiesPerSession = new Chart(barCanvas, {
        type: 'bar',
        data: {
          labels: sessionLabels,
          datasets: [
            {
              label: 'Events',
              data: sessionData,
              backgroundColor: chartFill,
              borderRadius: 3
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            title: {
              display: true,
              text: 'Activities Per Session (Top 10)',
              color: textColor,
              font: { size: 12, weight: 'bold', family: 'var(--mono)' }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { color: mutedColor, font: { size: 10, family: 'var(--mono)' } },
              grid: { color: gridColor }
            },
            x: {
              ticks: { color: mutedColor, font: { size: 10, family: 'var(--mono)' } },
              grid: { color: gridColor }
            }
          }
        }
      });
    }

    // 3. Activities by hour heatmap
    const heatmapCanvas = document.getElementById('chart-activities-by-hour');
    if (heatmapCanvas) {
      const hourCounts = new Array(24).fill(0);
      activities.forEach(activity => {
        const hour = new Date(activity.timestamp).getHours();
        hourCounts[hour]++;
      });

      const hourLabels = Array.from({ length: 24 }, (_, i) => `${i}:00`);

      charts.activitiesByHour = new Chart(heatmapCanvas, {
        type: 'bar',
        data: {
          labels: hourLabels,
          datasets: [
            {
              label: 'Activities',
              data: hourCounts,
              backgroundColor: hourCounts.map(count => {
                const max = Math.max(...hourCounts);
                const intensity = max > 0 ? count / max : 0;
                const accentColor = themeColors.accent;
                const r = parseInt(accentColor.slice(1, 3), 16);
                const g = parseInt(accentColor.slice(3, 5), 16);
                const b = parseInt(accentColor.slice(5, 7), 16);
                return `rgba(${r}, ${g}, ${b}, ${0.3 + intensity * 0.7})`;
              })
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            title: {
              display: true,
              text: 'Activities by Hour of Day',
              color: textColor,
              font: { size: 12, weight: 'bold', family: 'var(--mono)' }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { color: mutedColor, font: { size: 10, family: 'var(--mono)' } },
              grid: { color: gridColor }
            },
            x: {
              ticks: {
                color: mutedColor,
                font: { size: 9, family: 'var(--mono)' },
                maxRotation: 90,
                minRotation: 45
              },
              grid: { color: gridColor }
            }
          }
        }
      });
    }

    // 4. Cumulative activities line chart
    const lineCanvas = document.getElementById('chart-cumulative-activities');
    if (lineCanvas) {
      const sortedActivities = [...activities].sort(
        (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
      );

      const cumulativeData = sortedActivities.map((_, index) => index + 1);
      const timeLabels = sortedActivities.map((_, index) => index + 1);

      charts.cumulativeActivities = new Chart(lineCanvas, {
        type: 'line',
        data: {
          labels: timeLabels,
          datasets: [
            {
              label: 'Cumulative Activities',
              data: cumulativeData,
              borderColor: themeColors.success,
              backgroundColor: `${themeColors.success}1a`,
              fill: true,
              tension: 0.4
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            title: {
              display: true,
              text: 'Cumulative Activities Over Time',
              color: textColor,
              font: { size: 12, weight: 'bold', family: 'var(--mono)' }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { color: mutedColor, font: { size: 10, family: 'var(--mono)' } },
              grid: { color: gridColor }
            },
            x: {
              ticks: {
                color: mutedColor,
                font: { size: 10, family: 'var(--mono)' },
                maxTicksLimit: 10
              },
              grid: { color: gridColor }
            }
          }
        }
      });
    }
  }

  const handleFileChanged = () => {
    loadActivities();
  };

  // Effects for Svelte 5
  let prevShowCharts = false;
  $effect(() => {
    if (showCharts && !prevShowCharts) {
      setTimeout(createCharts, 100);
    }
    prevShowCharts = showCharts;
  });

  onMount(async () => {
    await loadActivities();

    if (showCharts && activities.length > 0) {
      setTimeout(createCharts, 200);
    }

    websocketService.connect();
    websocketService.on('file-changed', handleFileChanged);

    themeObserver = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (mutation.attributeName === 'class' && showCharts) {
          setTimeout(createCharts, 100);
        }
      });
    });

    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });

    return () => {
      abortRequests();
      websocketService.off('file-changed', handleFileChanged);
      if (themeObserver) {
        themeObserver.disconnect();
      }
      Object.values(charts).forEach(chart => chart?.destroy());
    };
  });
</script>

<PageLayout>
  <StatusBar prompt="RAVEN.ACTIVITY" label="Activity" />
  <PageHeader
    title="What just happened"
    description="Every file change and every AI tool call, newest first. File events come from the filesystem; agent events are tool calls and messages from your AI coder."
  >
    {#snippet actions()}
      <div class="flex items-center gap-3">
        <FreshnessBadge mode="live" since={lastUpdated} />
        <ToolbarButton onClick={exportLog}>Export</ToolbarButton>
        <RefreshButton onClick={() => loadActivities(true)} {loading} />
      </div>
    {/snippet}
  </PageHeader>

  <!-- Search and Filters -->
  <div class="bg-surface border border-border rounded-lg p-5 mb-6">
    <div class="flex flex-wrap gap-4 mb-4">
      <div class="flex-1 flex gap-3 min-w-[16rem]">
        <input
          type="text"
          placeholder="Search activities..."
          bind:value={searchQuery}
          onkeydown={e => e.key === 'Enter' && search()}
          class="flex-1 min-w-0 px-4 py-2 bg-canvas border border-border rounded text-sm font-mono text-body focus:outline-none focus:border-accent"
        />
        <ToolbarButton variant="primary" onClick={search}>Search</ToolbarButton>
      </div>

      <div class="flex flex-wrap gap-3 items-center">
        <FilterToggle
          active={groupBySession}
          onClick={() => {
            groupBySession = !groupBySession;
            groupActivitiesBySession();
          }}
        >
          Session View
        </FilterToggle>

        <select
          bind:value={sortBy}
          onchange={() => groupActivitiesBySession()}
          class="px-4 py-2 bg-canvas border border-border rounded text-sm font-mono text-body focus:outline-none focus:border-accent min-w-[160px]"
        >
          <option value="time_desc">↓ Newest First</option>
          <option value="time_asc">↑ Oldest First</option>
          <option value="duration_desc">Longest Duration</option>
          <option value="events_desc">Most Events</option>
        </select>
      </div>
    </div>

    <div class="flex flex-wrap gap-3">
      <FilterToggle active={selectedType === 'all'} onClick={() => setFilter('all')}>
        All ({total})
      </FilterToggle>
      <FilterToggle active={selectedType === 'file'} onClick={() => setFilter('file')}>
        Files ({stats.file})
      </FilterToggle>
      <FilterToggle active={selectedType === 'agent'} onClick={() => setFilter('agent')}>
        Agents ({stats.agent})
      </FilterToggle>
      <FilterToggle active={selectedType === 'system'} onClick={() => setFilter('system')}>
        System ({stats.system})
      </FilterToggle>
    </div>
  </div>

  <!-- Statistics Dashboard -->
  {#if !loading && activities.length > 0}
    <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
      <div class="bg-surface border border-border rounded p-4">
        <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
          Total Activities
        </div>
        <div class="text-lg font-mono text-body">
          {enhancedStats.totalActivities}
        </div>
      </div>
      <div class="bg-surface border border-border rounded p-4">
        <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
          Unique Sessions
        </div>
        <div class="text-lg font-mono text-body">
          {enhancedStats.uniqueSessions}
        </div>
      </div>
      <div class="bg-surface border border-border rounded p-4">
        <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
          Avg Session Duration
        </div>
        <div class="text-lg font-mono text-body">
          {formatDuration(enhancedStats.averageSessionDuration)}
        </div>
      </div>
      <div class="bg-surface border border-border rounded p-4">
        <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
          Activities Per Hour
        </div>
        <div class="text-lg font-mono text-body">
          {enhancedStats.activitiesPerHour}
        </div>
      </div>
    </div>

    <!-- Charts Section -->
    {#if showCharts}
      <div class="bg-surface border border-border rounded-lg p-6 mb-6">
        <div class="flex justify-between items-center mb-6">
          <h3 class="text-xs font-semibold text-muted uppercase tracking-wide">
            Analytics Visualizations
          </h3>
          <ToolbarButton onClick={() => (showCharts = false)}>Hide Charts</ToolbarButton>
        </div>
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div
            class="bg-canvas border border-border rounded p-4"
            style="height: 250px; min-height: 250px;"
          >
            <canvas id="chart-activity-types"></canvas>
          </div>
          <div
            class="bg-canvas border border-border rounded p-4"
            style="height: 250px; min-height: 250px;"
          >
            <canvas id="chart-activities-per-session"></canvas>
          </div>
          <div
            class="bg-canvas border border-border rounded p-4 xl:col-span-2"
            style="height: 320px; min-height: 320px;"
          >
            <canvas id="chart-activities-by-hour"></canvas>
          </div>
          <div
            class="bg-canvas border border-border rounded p-4 xl:col-span-2"
            style="height: 280px; min-height: 280px;"
          >
            <canvas id="chart-cumulative-activities"></canvas>
          </div>
        </div>
      </div>
    {:else}
      <div class="bg-surface border border-border rounded-lg p-4 mb-6 text-center">
        <ToolbarButton
          onClick={() => {
            showCharts = true;
            setTimeout(createCharts, 100);
          }}>Show Charts</ToolbarButton
        >
      </div>
    {/if}
  {/if}

  <!-- Activity Timeline -->
  <div class="space-y-4">
    {#if loading && activities.length === 0}
      <LoadingState message="Loading activities..." />
    {:else if activities.length === 0}
      <EmptyState
        title="No Activities Found"
        description={selectedType !== 'all'
          ? `No ${selectedType} activities found. Try changing filters or search query.`
          : searchQuery
            ? `No activities match "${searchQuery}". Try a different search term.`
            : 'No activity has been logged yet. Start coding and Raven will track all changes!'}
      >
        {#snippet actions()}
          <ToolbarButton
            variant="primary"
            onClick={() => {
              selectedType = 'all';
              searchQuery = '';
              loadActivities();
            }}>Clear Filters</ToolbarButton
          >
        {/snippet}
      </EmptyState>
    {:else if groupBySession && sessions.length > 0}
      <!-- Session Grouped View — bounded so a busy day doesn't push every
           other card off the screen. The user scrolls within the feed. -->
      <div class="max-h-[640px] space-y-4 pr-1">
        {#each sessions as session (session.id)}
          <div class="bg-canvas border border-border rounded-lg overflow-hidden">
            <button
              onclick={() => toggleSession(session.id)}
              class="w-full flex justify-between items-center p-5 bg-surface hover:bg-surface-2 transition-colors {collapsedSessions.has(
                session.id
              )
                ? ''
                : 'border-b border-border'}"
            >
              <div class="flex items-center gap-4 flex-1">
                <span class="text-muted">{collapsedSessions.has(session.id) ? '' : ''}</span>
                <div class="flex-1 text-left">
                  <div class="flex items-center gap-3 mb-2">
                    <span class="text-sm font-semibold text-body font-mono"
                      >Session: {session.id.substring(0, 12)}</span
                    >
                  </div>
                  <div class="flex items-center gap-3 text-xs text-muted font-mono">
                    <span> {formatDuration(session.duration)}</span>
                    <span class="text-border">•</span>
                    <span> {session.totalEvents} events</span>
                    <span class="text-border">•</span>
                    <span> {session.filesCount} files</span>
                    <span class="text-border">•</span>
                    <span> {session.agentCount} agent</span>
                    <span class="text-border">•</span>
                    <span> {session.systemCount} system</span>
                  </div>
                </div>
              </div>
              <time class="text-sm text-muted font-mono">{formatTimestamp(session.startTime)}</time>
            </button>

            {#if !collapsedSessions.has(session.id)}
              <div class="border-t border-border font-mono text-sm overflow-x-auto">
                <table class="w-full">
                  <tbody>
                    {@render activityRows(session.activities)}
                  </tbody>
                </table>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {:else}
      <!-- Flat List View — flat dense table, bounded scroller. -->
      <div class="border-t border-b border-border font-mono text-sm overflow-x-auto">
        <table class="w-full">
          <tbody>
            {@render activityRows(activities)}
          </tbody>
        </table>
      </div>
      {#if hasMore}
        <div class="text-center pt-6">
          <ToolbarButton onClick={loadMore} disabled={loading}>
            {loading ? 'Loading...' : `Load More (${total - activities.length} remaining)`}
          </ToolbarButton>
        </div>
      {/if}
    {/if}
  </div>
</PageLayout>

<!-- Shared flat-row renderer for both the session-grouped and flat-list
     views — keeps the dense-table markup in one place. -->
{#snippet activityRows(items)}
  {#each items as activity (activity.id + activity.category)}
    {@const isExpanded = expandedActivity?.id === activity.id}
    <tr
      class="hover:bg-surface/40 cursor-pointer align-top {isExpanded ? 'bg-surface/40' : ''}"
      onclick={() => toggleActivity(activity)}
    >
      <td class="px-3 py-0.5 w-6 text-center {getCategoryTextClass(activity.category)}">●</td>
      <td class="px-3 py-0.5 text-body">
        <span class="truncate" title={activity.description}>{activity.description}</span>
      </td>
      <td class="px-3 py-0.5 text-muted hidden md:table-cell w-24">{activity.type}</td>
      <td class="px-3 py-0.5 hidden lg:table-cell w-24">
        {#if activity.session_id}
          <span class="text-accent font-semibold">{activity.session_id.substring(0, 8)}</span>
        {/if}
      </td>
      <td class="px-3 py-0.5 text-muted text-right whitespace-nowrap w-28">
        {formatTimestamp(activity.timestamp)}
      </td>
      <td class="px-3 py-0.5 text-right w-24">
        <span class="text-[11px] font-bold uppercase {getCategoryTextClass(activity.category)}"
          >{activity.category}</span
        >
      </td>
    </tr>
    {#if isExpanded}
      <tr class="bg-canvas">
        <td colspan="6" class="px-4 py-4 border-t border-border font-sans">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div class="flex gap-3">
              <span class="text-xs text-muted font-semibold uppercase">ID:</span>
              <span class="text-sm text-body font-mono">{activity.id}</span>
            </div>
            <div class="flex gap-3">
              <span class="text-xs text-muted font-semibold uppercase">Type:</span>
              <span class="text-sm text-body font-mono">{activity.type}</span>
            </div>
            <div class="flex gap-3">
              <span class="text-xs text-muted font-semibold uppercase">Category:</span>
              <span class="text-sm text-body font-mono">{activity.category}</span>
            </div>
            <div class="flex gap-3">
              <span class="text-xs text-muted font-semibold uppercase">Timestamp:</span>
              <span class="text-sm text-body font-mono">{activity.timestamp}</span>
            </div>
            {#if activity.target}
              <div class="flex gap-3 md:col-span-2">
                <span class="text-xs text-muted font-semibold uppercase">Target:</span>
                <span class="text-sm text-body font-mono">{activity.target}</span>
              </div>
            {/if}
          </div>

          {#if activity.metadata && Object.keys(activity.metadata).length > 0}
            <div class="mt-4">
              <h4 class="text-xs text-muted uppercase font-semibold mb-2">Metadata</h4>
              <pre
                class="bg-canvas border border-border rounded p-3 text-xs font-mono text-body overflow-x-auto max-h-[300px] overflow-y-auto">{JSON.stringify(
                  activity.metadata,
                  null,
                  2
                )}</pre>
            </div>
          {/if}
        </td>
      </tr>
    {/if}
  {/each}
{/snippet}
