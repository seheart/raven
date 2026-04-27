<script>
  import { logger } from '../logger.js';
  import { onMount } from 'svelte';
  import { createPageApi } from '../apiClient.js';
  import { PageLayout, PageHeader } from '../components/layout/index.js';
  import { RefreshButton, ToolbarButton, EmptyState } from '../components/ui/index.js';
  const { api, abort: abortRequests } = createPageApi();
  import { websocketService } from '../services/websocket.js';
  import { formatDateTime } from '../timeFormat.js';
  import { getChartColors } from '../utils/chartUtils.js';
  import { Chart, registerables } from 'chart.js';

  Chart.register(...registerables);

  /**
   * Activity Overview Page - Svelte 5
   * Complete activity log with file + agent events, charts, session grouping
   */

  // State - using Svelte 5 runes
  let activities = $state([]);
  let total = $state(0);
  let loading = $state(false);
  let searchQuery = $state('');
  let selectedType = $state('all');
  let expandedActivity = $state(null);
  let lastUpdated = $state(null);
  let _isManualRefresh = $state(false);
  let __recentActivity = $state([]);

  // Pagination
  let limit = $state(100);
  let offset = $state(0);
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

  // Tracking state
  let isPaused = $state(false);

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

  async function loadActivities(manual = false) {
    try {
      loading = true;
      _isManualRefresh = manual;

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
          session_id: e.session_id,
          metadata: {
            agent: e.agent,
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
          session_id: e.session_id,
          metadata: {
            agent: e.agent,
            project_name: e.project_name,
            event_type: e.event_type,
            details: e.details
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

      // Apply pagination
      if (offset === 0) {
        activities = filtered.slice(0, limit);
      } else {
        activities = [...activities, ...filtered.slice(offset, offset + limit)];
      }

      total = filtered.length;
      hasMore = filtered.length > offset + limit;

      // Calculate stats
      calculateStats();

      // Group by session if enabled
      groupActivitiesBySession();

      // Load recent activity for sidebar
      await loadRecentActivity();

      lastUpdated = new Date();
      loading = false;
      _isManualRefresh = false;
    } catch (error) {
      logger.error('Failed to load activity log:', error);
      loading = false;
      _isManualRefresh = false;
    }
  }

  async function loadRecentActivity() {
    try {
      const [fileEvents, agentEvents] = await Promise.all([
        api.get('/file-events?limit=20').catch(() => []),
        api.get('/all-agent-events?limit=20').catch(() => [])
      ]);

      const fileEventsArray = Array.isArray(fileEvents) ? fileEvents : [];
      const agentEventsArray = Array.isArray(agentEvents) ? agentEvents : [];

      const combined = [
        ...fileEventsArray.map(e => ({ ...e, type: 'file' })),
        ...agentEventsArray.map(e => ({ ...e, type: 'agent' }))
      ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      _recentActivity = combined.slice(0, 30);
    } catch (error) {
      logger.error('Failed to load recent activity:', error);
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
    offset = 0;
    loadActivities();
  }

  function search() {
    offset = 0;
    loadActivities();
  }

  function loadMore() {
    offset += limit;
    loadActivities();
  }

  function toggleActivity(activity) {
    if (expandedActivity?.id === activity.id) {
      expandedActivity = null;
    } else {
      expandedActivity = activity;
    }
  }

  async function _togglePause() {
    try {
      const endpoint = isPaused ? '/resume' : '/pause';
      await api.post(endpoint);
      isPaused = !isPaused;
    } catch (error) {
      logger.error('Failed to toggle tracking:', error);
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

  async function _exportToCSV() {
    try {
      const headers = ['Timestamp', 'Type', 'Category', 'Description', 'Target', 'Session ID'];
      const rows = activities.map(activity => [
        activity.timestamp || '',
        activity.type || '',
        activity.category || '',
        activity.description || '',
        activity.target || '',
        activity.session_id || ''
      ]);

      const csv = [
        headers.join(','),
        ...rows.map(row =>
          row
            .map(cell => {
              const escaped = String(cell).replace(/"/g, '""');
              return escaped.includes(',') || escaped.includes('\n') || escaped.includes('"')
                ? `"${escaped}"`
                : escaped;
            })
            .join(',')
        )
      ].join('\n');

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `raven-activity-log-${Date.now()}.csv`;
      a.click();

      URL.revokeObjectURL(url);
    } catch (error) {
      logger.error('CSV export failed:', error);
    }
  }

  function _getChangeTypeIcon(changeType) {
    switch (changeType) {
    case 'add':
    case 'create':
    case 'created':
      return '';
    case 'change':
    case 'edit':
    case 'modified':
      return '';
    case 'unlink':
    case 'delete':
    case 'deleted':
      return '';
    default:
      return '';
    }
  }

  function _getChangeTypeColor(changeType) {
    switch (changeType) {
    case 'add':
    case 'create':
    case 'created':
      return 'var(--success)';
    case 'change':
    case 'edit':
    case 'modified':
      return 'var(--warning)';
    case 'unlink':
    case 'delete':
    case 'deleted':
      return 'var(--error)';
    default:
      return 'var(--info)';
    }
  }

  function getCategoryIcon(category) {
    switch (category) {
    case 'file':
      return '';
    case 'agent':
      return '';
    case 'system':
      return '';
    default:
      return '';
    }
  }

  function getCategoryColor(category) {
    switch (category) {
    case 'file':
      return 'var(--info)';
    case 'agent':
      return 'var(--accent)';
    case 'system':
      return 'var(--warning)';
    default:
      return 'var(--muted)';
    }
  }

  function _truncatePath(path) {
    if (!path) return '';
    const parts = path.split('/');
    if (parts.length <= 2) return path;
    return '.../' + parts.slice(-2).join('/');
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

  function createCharts() {
    Object.values(charts).forEach(chart => chart?.destroy());
    charts = {};

    if (!showCharts || activities.length === 0) return;

    // Theme-aware chart colors (shared helper; flips with dark mode).
    const c = getChartColors();
    const textColor = c.text;
    const mutedColor = c.muted;
    const gridColor = 'rgba(128, 128, 128, 0.15)';
    const themeColors = { accent: c.primary, success: c.success, error: c.error, warning: c.warning };

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
              backgroundColor: themeColors.accent
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

  function handleKeydown(event) {
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
      return;
    }

    switch (event.key) {
    case '1':
      setFilter('all');
      break;
    case '2':
      setFilter('file');
      break;
    case '3':
      setFilter('agent');
      break;
    case '4':
      setFilter('system');
      break;
    case 'r':
    case 'R':
      loadActivities(true);
      break;
    }
  }

  const handleFileChanged = () => {
    if (offset === 0) {
      loadActivities();
    }
  };

  const handleProjectSwitched = async () => {
    offset = 0;
    await loadActivities();
  };

  // Effects for Svelte 5
  $effect(() => {
    if (sortBy) {
      groupActivitiesBySession();
    }
  });

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
    websocketService.on('project-switched', handleProjectSwitched);

    window.addEventListener('keydown', handleKeydown);

    themeObserver = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (mutation.attributeName === 'class' && showCharts) {
          setTimeout(createCharts, 100);
        }
      });
    });

    themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });

    return () => {
      abortRequests();
      websocketService.off('file-changed', handleFileChanged);
      websocketService.off('project-switched', handleProjectSwitched);
      window.removeEventListener('keydown', handleKeydown);
      if (themeObserver) {
        themeObserver.disconnect();
      }
      Object.values(charts).forEach(chart => chart?.destroy());
    };
  });
</script>

<PageLayout>
  <PageHeader title="Activity Log" description="Complete audit trail of file and agent activity">
    {#snippet actions()}
      <div class="flex items-center gap-3">
        <span class="text-xs text-muted font-mono">{timeAgo}</span>
        <button
          onclick={exportLog}
          class="px-3 py-1.5 bg-surface border border-border rounded text-sm font-sans hover:border-accent transition-colors"
        >
          Export
        </button>
        <RefreshButton onClick={() => loadActivities(true)} loading={loading} />
      </div>
    {/snippet}
  </PageHeader>

    <!-- Search and Filters -->
    <div class="bg-surface border border-border rounded-lg p-5 mb-6">
      <div class="flex gap-4 mb-4">
        <div class="flex-1 flex gap-3">
          <input
            type="text"
            placeholder="Search activities..."
            bind:value={searchQuery}
            onkeydown={e => e.key === 'Enter' && search()}
            class="flex-1 px-4 py-2 bg-canvas border border-border rounded text-sm font-mono text-body focus:outline-none focus:border-accent"
          />
          <button
            onclick={search}
            class="px-4 py-2 bg-accent text-white rounded text-sm font-semibold hover:opacity-90"
          >
            Search
          </button>
        </div>

        <div class="flex gap-3 items-center">
          <button
            onclick={() => {
              groupBySession = !groupBySession;
              groupActivitiesBySession();
            }}
            class="px-4 py-2 text-sm font-semibold rounded transition-all border {groupBySession
              ? 'bg-accent text-white border-accent'
              : 'bg-canvas text-body border-border hover:border-accent'}"
          >
            Session View
          </button>

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

      <div class="flex gap-3">
        <button
          onclick={() => setFilter('all')}
          class="px-3 py-1.5 text-sm font-sans rounded transition-colors border {selectedType ===
          'all'
            ? 'bg-accent text-white border-accent'
            : 'bg-canvas text-body border-border hover:border-accent'}"
        >
          All ({total})
        </button>
        <button
          onclick={() => setFilter('file')}
          class="px-3 py-1.5 text-sm font-sans rounded transition-colors border {selectedType ===
          'file'
            ? 'bg-accent text-white border-accent'
            : 'bg-canvas text-body border-border hover:border-accent'}"
        >
          Files ({stats.file})
        </button>
        <button
          onclick={() => setFilter('agent')}
          class="px-3 py-1.5 text-sm font-sans rounded transition-colors border {selectedType ===
          'agent'
            ? 'bg-accent text-white border-accent'
            : 'bg-canvas text-body border-border hover:border-accent'}"
        >
          Agents ({stats.agent})
        </button>
        <button
          onclick={() => setFilter('system')}
          class="px-3 py-1.5 text-sm font-sans rounded transition-colors border {selectedType ===
          'system'
            ? 'bg-accent text-white border-accent'
            : 'bg-canvas text-body border-border hover:border-accent'}"
        >
          System ({stats.system})
        </button>
      </div>
    </div>

    <!-- Statistics Dashboard -->
    {#if !loading && activities.length > 0}
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-surface border border-border rounded p-4">
          <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
            Total Activities
          </div>
          <div class="text-sm font-mono text-body">
            {enhancedStats.totalActivities}
          </div>
        </div>
        <div class="bg-surface border border-border rounded p-4">
          <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
            Unique Sessions
          </div>
          <div class="text-sm font-mono text-body">
            {enhancedStats.uniqueSessions}
          </div>
        </div>
        <div class="bg-surface border border-border rounded p-4">
          <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
            Avg Session Duration
          </div>
          <div class="text-sm font-mono text-body">
            {formatDuration(enhancedStats.averageSessionDuration)}
          </div>
        </div>
        <div class="bg-surface border border-border rounded p-4">
          <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
            Activities Per Hour
          </div>
          <div class="text-sm font-mono text-body">
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
            <button
              onclick={() => (showCharts = false)}
              class="px-3 py-2 text-sm bg-canvas border border-border rounded hover:border-accent"
            >
              Hide Charts
            </button>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div
              class="bg-canvas border border-border rounded p-4"
              style="height: 250px;"
            >
              <canvas id="chart-activity-types"></canvas>
            </div>
            <div
              class="bg-canvas border border-border rounded p-4"
              style="height: 250px;"
            >
              <canvas id="chart-activities-per-session"></canvas>
            </div>
            <div
              class="bg-canvas border border-border rounded p-4 md:col-span-2"
              style="height: 320px;"
            >
              <canvas id="chart-activities-by-hour"></canvas>
            </div>
            <div
              class="bg-canvas border border-border rounded p-4 md:col-span-2"
              style="height: 280px;"
            >
              <canvas id="chart-cumulative-activities"></canvas>
            </div>
          </div>
        </div>
      {:else}
        <div
          class="bg-surface border border-border rounded-lg p-4 mb-6 text-center"
        >
          <button
            onclick={() => {
              showCharts = true;
              setTimeout(createCharts, 100);
            }}
            class="px-4 py-2 text-sm bg-canvas border border-border rounded hover:border-accent"
          >
            Show Charts
          </button>
        </div>
      {/if}
    {/if}

    <!-- Activity Timeline -->
    <div class="space-y-4">
      {#if loading && activities.length === 0}
        <div class="bg-surface border border-border rounded-lg p-6 text-center">
          <div class="text-muted">Loading activities...</div>
        </div>
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
              onClick={() => { selectedType = 'all'; searchQuery = ''; loadActivities(); }}
            >Clear Filters</ToolbarButton>
          {/snippet}
        </EmptyState>
      {:else if groupBySession && sessions.length > 0}
        <!-- Session Grouped View -->
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
                <span class="text-muted"
                  >{collapsedSessions.has(session.id) ? '' : ''}</span
                >
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
              <time class="text-sm text-muted font-mono"
                >{formatTimestamp(session.startTime)}</time
              >
            </button>

            {#if !collapsedSessions.has(session.id)}
              <div class="p-6 bg-canvas space-y-3">
                {#each session.activities as activity (activity.id + activity.category)}
                  {@const isExpanded = expandedActivity?.id === activity.id}
                  <div
                    class="bg-surface border border-border rounded overflow-hidden hover:border-accent transition-colors {isExpanded
                      ? 'border-accent'
                      : ''}"
                  >
                    <button
                      onclick={() => toggleActivity(activity)}
                      class="w-full flex justify-between items-center p-4"
                    >
                      <div class="flex items-center gap-4 flex-1 min-w-0">
                        <span class="text-xs text-muted">{isExpanded ? '' : ''}</span>
                        <span class="text-sm" style="color: {getCategoryColor(activity.category)}">
                          {getCategoryIcon(activity.category)}
                        </span>
                        <div class="flex-1 min-w-0 text-left">
                          <div class="text-sm font-medium text-body truncate">
                            {activity.description}
                          </div>
                          <div
                            class="flex items-center gap-2 text-xs text-muted font-mono mt-1"
                          >
                            <span>{activity.type}</span>
                            <span>•</span>
                            <span>{formatTimestamp(activity.timestamp)}</span>
                          </div>
                        </div>
                      </div>
                      <div class="flex items-center gap-3">
                        <span class="text-sm text-muted font-mono"
                          >{formatTimestamp(activity.timestamp)}</span
                        >
                        <span
                          class="px-2 py-1 bg-canvas border border-border rounded text-xs font-bold uppercase text-muted"
                        >
                          {activity.category}
                        </span>
                      </div>
                    </button>

                    {#if isExpanded}
                      <div class="p-4 border-t border-border">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                          <div class="flex gap-3">
                            <span class="text-xs text-muted font-semibold uppercase"
                              >ID:</span
                            >
                            <span class="text-sm text-body font-mono">{activity.id}</span>
                          </div>
                          <div class="flex gap-3">
                            <span class="text-xs text-muted font-semibold uppercase"
                              >Type:</span
                            >
                            <span class="text-sm text-body font-mono">{activity.type}</span
                            >
                          </div>
                          <div class="flex gap-3">
                            <span class="text-xs text-muted font-semibold uppercase"
                              >Category:</span
                            >
                            <span class="text-sm text-body font-mono"
                              >{activity.category}</span
                            >
                          </div>
                          <div class="flex gap-3">
                            <span class="text-xs text-muted font-semibold uppercase"
                              >Timestamp:</span
                            >
                            <span class="text-sm text-body font-mono"
                              >{activity.timestamp}</span
                            >
                          </div>
                          {#if activity.target}
                            <div class="flex gap-3 md:col-span-2">
                              <span class="text-xs text-muted font-semibold uppercase"
                                >Target:</span
                              >
                              <span class="text-sm text-body font-mono"
                                >{activity.target}</span
                              >
                            </div>
                          {/if}
                        </div>

                        {#if activity.metadata && Object.keys(activity.metadata).length > 0}
                          <div class="mt-4">
                            <h4 class="text-xs text-muted uppercase font-semibold mb-2">
                              Metadata
                            </h4>
                            <pre
                              class="bg-canvas border border-border rounded p-3 text-xs font-mono text-body overflow-x-auto max-h-[300px] overflow-y-auto">{JSON.stringify(
                                activity.metadata,
                                null,
                                2
                              )}</pre>
                          </div>
                        {/if}
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      {:else}
        <!-- Flat List View -->
        {#each activities as activity (activity.id + activity.category)}
          {@const isExpanded = expandedActivity?.id === activity.id}
          <div
            class="bg-surface border border-border rounded overflow-hidden hover:border-accent transition-colors {isExpanded
              ? 'border-accent'
              : ''}"
          >
            <button
              onclick={() => toggleActivity(activity)}
              class="w-full flex justify-between items-center p-4"
            >
              <div class="flex items-center gap-4 flex-1 min-w-0">
                <span class="text-xs text-muted">{isExpanded ? '' : ''}</span>
                <span class="text-sm" style="color: {getCategoryColor(activity.category)}">
                  {getCategoryIcon(activity.category)}
                </span>
                <div class="flex-1 min-w-0 text-left">
                  <div class="text-sm font-medium text-body truncate">
                    {activity.description}
                  </div>
                  <div class="flex items-center gap-2 text-xs text-muted font-mono mt-1">
                    <span>{activity.type}</span>
                    <span>•</span>
                    <span>{formatTimestamp(activity.timestamp)}</span>
                    {#if activity.session_id}
                      <span>•</span>
                      <span class="text-accent font-semibold"
                        >{activity.session_id.substring(0, 8)}</span
                      >
                    {/if}
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <span class="text-sm text-muted font-mono"
                  >{formatTimestamp(activity.timestamp)}</span
                >
                <span
                  class="px-2 py-1 bg-canvas border border-border rounded text-xs font-bold uppercase text-muted"
                >
                  {activity.category}
                </span>
              </div>
            </button>

            {#if isExpanded}
              <div class="p-4 border-t border-border">
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
                    <span class="text-xs text-muted font-semibold uppercase"
                      >Category:</span
                    >
                    <span class="text-sm text-body font-mono">{activity.category}</span>
                  </div>
                  <div class="flex gap-3">
                    <span class="text-xs text-muted font-semibold uppercase"
                      >Timestamp:</span
                    >
                    <span class="text-sm text-body font-mono">{activity.timestamp}</span>
                  </div>
                  {#if activity.target}
                    <div class="flex gap-3 md:col-span-2">
                      <span class="text-xs text-muted font-semibold uppercase"
                        >Target:</span
                      >
                      <span class="text-sm text-body font-mono">{activity.target}</span>
                    </div>
                  {/if}
                </div>

                {#if activity.metadata && Object.keys(activity.metadata).length > 0}
                  <div class="mt-4">
                    <h4 class="text-xs text-muted uppercase font-semibold mb-2">
                      Metadata
                    </h4>
                    <pre
                      class="bg-canvas border border-border rounded p-3 text-xs font-mono text-body overflow-x-auto max-h-[300px] overflow-y-auto">{JSON.stringify(
                        activity.metadata,
                        null,
                        2
                      )}</pre>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/each}

        {#if hasMore}
          <div class="text-center pt-6">
            <button
              onclick={loadMore}
              disabled={loading}
              class="px-6 py-3 bg-surface border border-border rounded text-sm font-semibold text-body hover:border-accent disabled:opacity-50"
            >
              {loading ? 'Loading...' : `Load More (${total - activities.length} remaining)`}
            </button>
          </div>
        {/if}
      {/if}
    </div>
</PageLayout>

