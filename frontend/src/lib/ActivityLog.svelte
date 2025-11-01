<script>
  import { logger } from './logger.js';
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';
  import { formatDateTime } from './timeFormat.js';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import ProjectBadge from './ProjectBadge.svelte';
  import { api } from './apiClient.js';
  import { API_CONFIG } from '../config.js';
  import { Chart, registerables } from 'chart.js';

  Chart.register(...registerables);

  const API_BASE = API_CONFIG.API_BASE;

  let activities = [];
  let total = 0;
  let loading = true;
  let searchQuery = '';
  let selectedType = 'all';
  let expandedActivity = null;
  let lastUpdated = null;
  let isManualRefresh = false;
  let recentActivity = []; // Recent activity for sidebar

  // Pagination
  let limit = 100;
  let offset = 0;
  let hasMore = false;

  // Stats
  let stats = {
    file: 0,
    agent: 0,
    system: 0
  };

  // Session grouping
  let groupBySession = true; // Toggle between grouped and flat view
  let groupByTime = 'none'; // 'none', 'hour', 'day'
  let collapsedSessions = new Set(); // Track which sessions are collapsed
  let sessions = []; // Grouped session data
  let selectedSession = 'all'; // Filter by specific session

  // Enhanced sorting
  let sortBy = 'time_desc'; // 'time_desc', 'time_asc', 'duration_desc', 'events_desc'

  // Chart.js visualizations
  let showCharts = true;
  let charts = {};
  let themeObserver;

  async function loadActivities(manual = false) {
    try {
      loading = true;
      isManualRefresh = manual;

      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
        type: selectedType,
        search: searchQuery
      });

      const res = await fetch(`${API_BASE}/activity-log?${params}`);
      const data = await res.json();

      if (offset === 0) {
        activities = data.activities;
      } else {
        activities = [...activities, ...data.activities];
      }

      total = data.total;
      hasMore = data.hasMore;

      // Calculate stats
      calculateStats();

      // Group by session if enabled
      groupActivitiesBySession();

      // Load recent activity for sidebar
      await loadRecentActivity();

      lastUpdated = new Date();
      loading = false;
      isManualRefresh = false;
    } catch (error) {
      logger.error('Failed to load activity log:', error);
      loading = false;
      isManualRefresh = false;
    }
  }

  async function loadRecentActivity() {
    try {
      // Get both file events and agent events from ALL projects
      const [fileEvents, agentEvents] = await Promise.all([
        api.get('/all-file-events?limit=20'),
        api.get('/all-agent-events?limit=20')
      ]);

      const fileEventsArray = Array.isArray(fileEvents) ? fileEvents : [];
      const agentEventsArray = Array.isArray(agentEvents) ? agentEvents : [];

      // Combine and sort by timestamp
      const combined = [
        ...fileEventsArray.map(e => ({ ...e, type: 'file' })),
        ...agentEventsArray.map(e => ({ ...e, type: 'agent' }))
      ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      recentActivity = combined.slice(0, 30);
    } catch (error) {
      logger.error('Failed to load recent activity:', error);
    }
  }

  function getChangeTypeIcon(changeType) {
    switch (changeType) {
    case 'add':
    case 'create':
    case 'created': return '➕';
    case 'change':
    case 'edit':
    case 'modified': return '✏️';
    case 'unlink':
    case 'delete':
    case 'deleted': return '🗑️';
    default: return '📝';
    }
  }

  function getChangeTypeColor(changeType) {
    switch (changeType) {
    case 'add':
    case 'create':
    case 'created': return 'var(--success)';
    case 'change':
    case 'edit':
    case 'modified': return 'var(--warning)';
    case 'unlink':
    case 'delete':
    case 'deleted': return 'var(--error)';
    default: return 'var(--info)';
    }
  }

  function truncatePath(path) {
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

  function calculateStats() {
    // Ensure activities is an array before filtering
    const safeActivities = Array.isArray(activities) ? activities : [];

    stats = {
      file: safeActivities.filter(a => a && a.category === 'file').length,
      agent: safeActivities.filter(a => a && a.category === 'agent').length,
      system: safeActivities.filter(a => a && a.category === 'system').length
    };
  }

  // Format "time ago" for last updated timestamp (reactive, no interval)

  // Compute reactively when lastUpdated changes
  let timeAgo = 'Just now';
  // Update time ago when lastUpdated changes (prevents infinite loop)
  $: if (lastUpdated) {
    if (!lastUpdated) timeAgo = 'Just now';
    else {
      const seconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
      if (seconds < 10) timeAgo = 'Just now';
      else if (seconds < 60) timeAgo = `${seconds}s ago`;
      else if (seconds < 3600) timeAgo = `${Math.floor(seconds / 60)}m ago`;
      else timeAgo = `${Math.floor(seconds / 3600)}h ago`;
    }
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

      // Update time range
      if (new Date(activity.timestamp) < new Date(session.startTime)) {
        session.startTime = activity.timestamp;
      }
      if (new Date(activity.timestamp) > new Date(session.endTime)) {
        session.endTime = activity.timestamp;
      }

      // Count by category
      if (activity.category === 'file') session.filesCount++;
      if (activity.category === 'agent') session.agentCount++;
      if (activity.category === 'system') session.systemCount++;
    });

    // Convert to array and calculate durations
    let sessionsArray = Array.from(sessionMap.values()).map(session => ({
      ...session,
      duration: Math.floor((new Date(session.endTime) - new Date(session.startTime)) / 1000)
    }));

    // Apply sorting
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

  // Reactive: Re-sort when sortBy changes
  $: if (sortBy) {
    groupActivitiesBySession();
  }

  function toggleSession(sessionId) {
    if (collapsedSessions.has(sessionId)) {
      collapsedSessions.delete(sessionId);
    } else {
      collapsedSessions.add(sessionId);
    }
    collapsedSessions = collapsedSessions; // Trigger reactivity
  }

  function formatDuration(seconds) {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
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

  // WebSocket event handler for project switches
  const handleProjectSwitched = async (_data) => {
    offset = 0;
    await loadActivities();
  };

  function formatRelativeTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  }

  function getCategoryIcon(category) {
    switch (category) {
    case 'file': return '📁';
    case 'agent': return '🤖';
    case 'system': return '⚙️';
    default: return '📝';
    }
  }

  function getCategoryColor(category) {
    switch (category) {
    case 'file': return 'var(--info)';
    case 'agent': return 'var(--accent)';
    case 'system': return 'var(--warning)';
    default: return 'var(--muted)';
    }
  }

  async function exportLog() {
    try {
      const res = await fetch(`${API_BASE}/activity-log?limit=10000`);
      const data = await res.json();

      // Build export with session metadata
      const exportData = {
        exported_at: new Date().toISOString(),
        total_activities: data.activities.length,
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
        activities: data.activities
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

  async function exportToCSV() {
    try {
      const res = await fetch(`${API_BASE}/activity-log?limit=10000`);
      const data = await res.json();

      // CSV headers
      const headers = ['Timestamp', 'Type', 'Description', 'Session ID', 'Category', 'Target'];

      // CSV rows
      const rows = data.activities.map(activity => [
        activity.timestamp || '',
        activity.type || '',
        activity.description || '',
        activity.session_id || '',
        activity.category || '',
        activity.target || ''
      ]);

      // Build CSV with proper escaping
      const csv = [
        headers.join(','),
        ...rows.map(row => row.map(cell => {
          // Escape quotes and wrap in quotes if contains comma, newline, or quote
          const escaped = String(cell).replace(/"/g, '""');
          return escaped.includes(',') || escaped.includes('\n') || escaped.includes('"')
            ? `"${escaped}"`
            : escaped;
        }).join(','))
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

  // WebSocket event handler
  const handleFileChanged = () => {
    // Reload if on first page
    if (offset === 0) {
      loadActivities();
    }
  };

  // Keyboard shortcuts for filters
  function handleKeydown(event) {
    // Only handle if not typing in input field
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

  // Calculate enhanced statistics
  $: enhancedStats = {
    totalActivities: activities.length,
    uniqueSessions: sessions.length,
    averageSessionDuration: sessions.length > 0
      ? Math.floor(sessions.reduce((sum, s) => sum + s.duration, 0) / sessions.length)
      : 0,
    activitiesPerHour: activities.length > 0 && sessions.length > 0
      ? (activities.length / Math.max(1, sessions.reduce((sum, s) => sum + s.duration, 0) / 3600)).toFixed(2)
      : 0
  };

  // Chart creation function
  function createCharts() {
    // Destroy existing charts
    Object.values(charts).forEach(chart => chart?.destroy());
    charts = {};

    if (!showCharts || activities.length === 0) return;

    // Get theme-aware colors from body element
    const textColor = getComputedStyle(document.body).getPropertyValue('--text').trim();
    const mutedColor = getComputedStyle(document.body).getPropertyValue('--muted').trim();
    const gridColor = 'rgba(128, 128, 128, 0.15)';

    // 1. Pie Chart: Activity type breakdown (file/agent/system)
    const pieCanvas = document.getElementById('chart-activity-types');
    if (pieCanvas) {
      const typeCounts = {
        file: stats.file,
        agent: stats.agent,
        system: stats.system
      };

      charts.activityTypes = new Chart(pieCanvas, {
        type: 'pie',
        data: {
          labels: ['File', 'Agent', 'System'],
          datasets: [{
            data: [typeCounts.file, typeCounts.agent, typeCounts.system],
            backgroundColor: ['#3b82f6', '#8b5cf6', '#f59e0b']
          }]
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

    // 2. Bar Chart: Activities per session
    const barCanvas = document.getElementById('chart-activities-per-session');
    if (barCanvas) {
      const topSessions = sessions.slice(0, 10);
      const sessionLabels = topSessions.map(s => s.id.substring(0, 8));
      const sessionData = topSessions.map(s => s.totalEvents);

      charts.activitiesPerSession = new Chart(barCanvas, {
        type: 'bar',
        data: {
          labels: sessionLabels,
          datasets: [{
            label: 'Events',
            data: sessionData,
            backgroundColor: '#3b82f6'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            },
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
              ticks: {
                color: mutedColor,
                font: { size: 10, family: 'var(--mono)' }
              },
              grid: {
                color: gridColor
              }
            },
            x: {
              ticks: {
                color: mutedColor,
                font: { size: 10, family: 'var(--mono)' }
              },
              grid: {
                color: gridColor
              }
            }
          }
        }
      });
    }

    // 3. Heatmap-style Bar Chart: Activities by hour of day (24 bars, 0-23)
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
          datasets: [{
            label: 'Activities',
            data: hourCounts,
            backgroundColor: hourCounts.map(count => {
              const max = Math.max(...hourCounts);
              const intensity = max > 0 ? count / max : 0;
              return `rgba(59, 130, 246, ${0.3 + intensity * 0.7})`;
            })
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            },
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
              ticks: {
                color: mutedColor,
                font: { size: 10, family: 'var(--mono)' }
              },
              grid: {
                color: gridColor
              }
            },
            x: {
              ticks: {
                color: mutedColor,
                font: { size: 9, family: 'var(--mono)' },
                maxRotation: 90,
                minRotation: 45
              },
              grid: {
                color: gridColor
              }
            }
          }
        }
      });
    }

    // 4. Line Chart: Cumulative activities over time
    const lineCanvas = document.getElementById('chart-cumulative-activities');
    if (lineCanvas) {
      const sortedActivities = [...activities].sort((a, b) =>
        new Date(a.timestamp) - new Date(b.timestamp)
      );

      const cumulativeData = sortedActivities.map((_, index) => index + 1);
      const timeLabels = sortedActivities.map((_, index) => index + 1);

      charts.cumulativeActivities = new Chart(lineCanvas, {
        type: 'line',
        data: {
          labels: timeLabels,
          datasets: [{
            label: 'Cumulative Activities',
            data: cumulativeData,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            fill: true,
            tension: 0.4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            },
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
              ticks: {
                color: mutedColor,
                font: { size: 10, family: 'var(--mono)' }
              },
              grid: {
                color: gridColor
              }
            },
            x: {
              ticks: {
                color: mutedColor,
                font: { size: 10, family: 'var(--mono)' },
                maxTicksLimit: 10
              },
              grid: {
                color: gridColor
              }
            }
          }
        }
      });
    }
  }

  // Recreate charts when data changes
  $: if (showCharts && activities.length > 0) {
    setTimeout(createCharts, 100);
  }

  onMount(async () => {
    await loadActivities();

    // Create charts after data loads and DOM is ready
    if (showCharts && activities.length > 0) {
      setTimeout(createCharts, 200);
    }

    // Listen for real-time updates (no polling!)
    websocketService.connect();
    websocketService.on('file-changed', handleFileChanged);
    websocketService.on('project-switched', handleProjectSwitched);

    // Add keyboard shortcuts
    window.addEventListener('keydown', handleKeydown);

    // Watch for theme changes on body element
    themeObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class' && showCharts) {
          logger.info('[ActivityLog] Theme changed, recreating charts');
          setTimeout(createCharts, 100);
        }
      });
    });

    themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });
  });

  onDestroy(() => {
    // Clean up WebSocket listeners
    websocketService.off('file-changed', handleFileChanged);
    websocketService.off('project-switched', handleProjectSwitched);

    // Remove keyboard listener
    window.removeEventListener('keydown', handleKeydown);

    // Disconnect theme observer
    if (themeObserver) {
      themeObserver.disconnect();
    }

    // Destroy all charts
    Object.values(charts).forEach(chart => chart?.destroy());
  });
</script>

<div class="activity-log" role="region" aria-label="Activity Log">
  <div class="main-content">
  <div class="log-header">
    <div class="header-title">
      <h1 id="activity-log-title"><span aria-hidden="true">📜</span> Activity Log</h1>
      <p class="subtitle">Complete audit trail • All files • Build artifacts • System events</p>
    </div>
    <div class="header-actions" role="toolbar" aria-label="Activity log actions">
      <span class="last-updated" role="status" aria-live="polite" aria-label="Last updated {timeAgo}">Updated: {timeAgo}</span>
      <button
        class="refresh-btn"
        on:click={() => loadActivities(true)}
        disabled={loading}
        aria-label="Refresh activity log"
      >
        <span class="refresh-icon" class:spinning={isManualRefresh} aria-hidden="true">🔄</span>
        Refresh
      </button>
      <button class="btn-export" on:click={exportLog} aria-label="Export activity log to JSON file">
        <span aria-hidden="true">💾</span> Export JSON
      </button>
      <button class="btn-export" on:click={exportToCSV} aria-label="Export activity log to CSV file">
        <span aria-hidden="true">📊</span> Export CSV
      </button>
    </div>
  </div>

  <!-- Search and Filters -->
  <div class="controls" role="search" aria-label="Activity search and filters">
    <div class="controls-row">
      <div class="search-bar">
        <label for="activity-search" class="visually-hidden">Search activities</label>
        <input
          id="activity-search"
          type="text"
          placeholder="Search activities..."
          bind:value={searchQuery}
          on:keydown={(e) => e.key === 'Enter' && search()}
          aria-label="Search activities by description, type, or target"
        />
        <button on:click={search} aria-label="Execute search"><span aria-hidden="true">🔍</span> Search</button>
      </div>

      <div class="view-controls" role="group" aria-label="View options">
        <button
          class="view-toggle"
          class:active={groupBySession}
          on:click={() => { groupBySession = !groupBySession; groupActivitiesBySession(); }}
          aria-label="{groupBySession ? 'Disable' : 'Enable'} session grouping"
          aria-pressed={groupBySession}
        >
          <span aria-hidden="true">📦</span> Session View
        </button>

        <label for="time-grouping" class="visually-hidden">Time grouping</label>
        <select
          id="time-grouping"
          class="time-grouping"
          bind:value={groupByTime}
          on:change={() => groupActivitiesBySession()}
          aria-label="Group activities by time period"
        >
          <option value="none">📅 No Time Grouping</option>
          <option value="hour">⏰ Group by Hour</option>
          <option value="day">📆 Group by Day</option>
        </select>

        <label for="sort-by" class="visually-hidden">Sort by</label>
        <select
          id="sort-by"
          class="sort-select"
          bind:value={sortBy}
          aria-label="Sort activities"
        >
          <option value="time_desc">↓ Newest First</option>
          <option value="time_asc">↑ Oldest First</option>
          <option value="duration_desc">⏱️ Longest Duration</option>
          <option value="events_desc">📊 Most Events</option>
        </select>

        {#if groupBySession && sessions.length > 1}
          <label for="session-filter" class="visually-hidden">Filter by session</label>
          <select
            id="session-filter"
            class="session-filter"
            bind:value={selectedSession}
            on:change={() => groupActivitiesBySession()}
            aria-label="Filter activities by session"
          >
            <option value="all">All Sessions ({sessions.length})</option>
            {#each sessions as session (session.id)}
              <option value={session.id}>
                {session.id.substring(0, 8)} ({session.totalEvents} events)
              </option>
            {/each}
          </select>
        {/if}
      </div>
    </div>

    <div class="filter-tabs" role="tablist" aria-label="Activity type filters">
      <button
        class="filter-tab"
        class:active={selectedType === 'all'}
        on:click={() => setFilter('all')}
        role="tab"
        aria-selected={selectedType === 'all'}
        aria-label="Show all activities ({total} total)"
      >
        All ({total})
      </button>
      <button
        class="filter-tab"
        class:active={selectedType === 'file'}
        on:click={() => setFilter('file')}
        role="tab"
        aria-selected={selectedType === 'file'}
        aria-label="Show file activities ({stats.file} files)"
      >
        <span aria-hidden="true">📁</span> Files ({stats.file})
      </button>
      <button
        class="filter-tab"
        class:active={selectedType === 'agent'}
        on:click={() => setFilter('agent')}
        role="tab"
        aria-selected={selectedType === 'agent'}
        aria-label="Show agent activities ({stats.agent} agents)"
      >
        <span aria-hidden="true">🤖</span> Agents ({stats.agent})
      </button>
      <button
        class="filter-tab"
        class:active={selectedType === 'system'}
        on:click={() => setFilter('system')}
        role="tab"
        aria-selected={selectedType === 'system'}
        aria-label="Show system activities ({stats.system} system events)"
      >
        <span aria-hidden="true">⚙️</span> System ({stats.system})
      </button>
    </div>
  </div>

  <!-- Statistics Dashboard -->
  {#if !loading && activities.length > 0}
    <div class="statistics-dashboard">
      <div class="stats-cards">
        <div class="stats-card">
          <div class="stats-card-icon">📈</div>
          <div class="stats-card-content">
            <div class="stats-card-label">Total Activities</div>
            <div class="stats-card-value">{enhancedStats.totalActivities}</div>
          </div>
        </div>

        <div class="stats-card">
          <div class="stats-card-icon">🔖</div>
          <div class="stats-card-content">
            <div class="stats-card-label">Unique Sessions</div>
            <div class="stats-card-value">{enhancedStats.uniqueSessions}</div>
          </div>
        </div>

        <div class="stats-card">
          <div class="stats-card-icon">⏱️</div>
          <div class="stats-card-content">
            <div class="stats-card-label">Avg Session Duration</div>
            <div class="stats-card-value">{formatDuration(enhancedStats.averageSessionDuration)}</div>
          </div>
        </div>

        <div class="stats-card">
          <div class="stats-card-icon">⚡</div>
          <div class="stats-card-content">
            <div class="stats-card-label">Activities Per Hour</div>
            <div class="stats-card-value">{enhancedStats.activitiesPerHour}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Charts Section -->
    {#if showCharts}
      <div class="charts-section">
        <div class="charts-header">
          <h3>📊 Analytics Visualizations</h3>
          <button class="btn-toggle-charts" on:click={() => showCharts = false}>Hide Charts</button>
        </div>
        <div class="charts-grid">
          <div class="chart-container">
            <canvas id="chart-activity-types"></canvas>
          </div>
          <div class="chart-container">
            <canvas id="chart-activities-per-session"></canvas>
          </div>
          <div class="chart-container chart-wide">
            <canvas id="chart-activities-by-hour"></canvas>
          </div>
          <div class="chart-container chart-wide">
            <canvas id="chart-cumulative-activities"></canvas>
          </div>
        </div>
      </div>
    {:else}
      <div class="charts-toggle">
        <button class="btn-toggle-charts" on:click={() => showCharts = true}>Show Charts</button>
      </div>
    {/if}
  {/if}

  <!-- Activity Timeline -->
  <div class="timeline" role="feed" aria-label="Activity timeline" aria-busy={loading}>
    {#if loading && activities.length === 0}
      <div role="status" aria-live="polite" aria-label="Loading activities">
        <LoadingSkeleton count={5} height="80px" />
      </div>
    {:else if activities.length === 0}
      <div class="empty-state" role="status">
        <div class="empty-icon" aria-hidden="true">📭</div>
        <h2>No Activities Found</h2>
        {#if selectedType !== 'all'}
          <p>No <strong>{selectedType}</strong> activities found. Try changing filters or search query.</p>
        {:else if searchQuery}
          <p>No activities match "<strong>{searchQuery}</strong>". Try a different search term.</p>
        {:else}
          <p>No activity has been logged yet. Start coding and Raven will track all changes!</p>
        {/if}
        <button class="clear-filters-btn" on:click={() => { selectedType = 'all'; searchQuery = ''; loadActivities(); }} aria-label="Clear all filters and reload">
          Clear Filters
        </button>
      </div>
    {:else if groupBySession && sessions.length > 0}
      <!-- Session Grouped View -->
      {#each sessions.filter(s => selectedSession === 'all' || s.id === selectedSession) as session (session.id)}
        <article class="session-group" aria-labelledby="session-{session.id}">
          <!-- Session Summary Card -->
          <button
            class="session-header"
            class:collapsed={collapsedSessions.has(session.id)}
            on:click={() => toggleSession(session.id)}
            aria-expanded={!collapsedSessions.has(session.id)}
            aria-controls="session-activities-{session.id}"
          >
            <div class="session-header-left">
              <span class="expand-arrow" aria-hidden="true">{collapsedSessions.has(session.id) ? '▶' : '▼'}</span>
              <div class="session-info">
                <div class="session-title">
                  <span class="session-icon" aria-hidden="true">🔖</span>
                  <span class="session-id" id="session-{session.id}">Session: {session.id.substring(0, 12)}</span>
                </div>
                <div class="session-stats" aria-label="Session stats: {formatDuration(session.duration)}, {session.totalEvents} events, {session.filesCount} files, {session.agentCount} agent activities, {session.systemCount} system activities">
                  <span class="stat"><span aria-hidden="true">⏱️</span> {formatDuration(session.duration)}</span>
                  <span class="stat-separator" aria-hidden="true">•</span>
                  <span class="stat"><span aria-hidden="true">📊</span> {session.totalEvents} events</span>
                  <span class="stat-separator" aria-hidden="true">•</span>
                  <span class="stat"><span aria-hidden="true">📁</span> {session.filesCount} files</span>
                  <span class="stat-separator" aria-hidden="true">•</span>
                  <span class="stat"><span aria-hidden="true">🤖</span> {session.agentCount} agent</span>
                  <span class="stat-separator" aria-hidden="true">•</span>
                  <span class="stat"><span aria-hidden="true">⚙️</span> {session.systemCount} system</span>
                </div>
              </div>
            </div>
            <div class="session-header-right">
              <time class="session-time" datetime={session.startTime}>{formatTimestamp(session.startTime)}</time>
            </div>
          </button>

          <!-- Session Activities (collapsible) -->
          {#if !collapsedSessions.has(session.id)}
            <div class="session-activities" id="session-activities-{session.id}" role="list" aria-label="Activities in session {session.id.substring(0, 8)}">
              {#each session.activities as activity (activity.id + activity.category)}
                <div class="activity-item" class:expanded={expandedActivity?.id === activity.id} role="listitem">
                  <button
                    class="activity-header"
                    on:click={() => toggleActivity(activity)}
                    on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleActivity(activity)}
                    aria-expanded={expandedActivity?.id === activity.id}
                    aria-controls="activity-details-{activity.id}"
                    aria-label="{activity.description} at {formatTimestamp(activity.timestamp)}"
                  >
                    <div class="activity-left">
                      <span class="expand-arrow">{expandedActivity?.id === activity.id ? '▼' : '▶'}</span>
                      <span class="activity-icon" style="color: {getCategoryColor(activity.category)}">
                        {getCategoryIcon(activity.category)}
                      </span>
                      <div class="activity-info">
                        <div class="activity-description">{activity.description}</div>
                        <div class="activity-meta">
                          <span class="meta-item">{activity.type}</span>
                          <span class="meta-separator">•</span>
                          <span class="meta-item">{formatRelativeTime(activity.timestamp)}</span>
                        </div>
                      </div>
                    </div>
                    <div class="activity-right">
                      <span class="activity-time">{formatTimestamp(activity.timestamp)}</span>
                      <span class="activity-category">{activity.category}</span>
                    </div>
                  </button>

                  {#if expandedActivity?.id === activity.id}
                    <div class="activity-details" id="activity-details-{activity.id}" role="region" aria-label="Activity details">
                      <div class="details-grid">
                        <div class="detail-item">
                          <span class="detail-label">ID:</span>
                          <span class="detail-value">{activity.id}</span>
                        </div>
                        <div class="detail-item">
                          <span class="detail-label">Type:</span>
                          <span class="detail-value">{activity.type}</span>
                        </div>
                        <div class="detail-item">
                          <span class="detail-label">Category:</span>
                          <span class="detail-value">{activity.category}</span>
                        </div>
                        <div class="detail-item">
                          <span class="detail-label">Timestamp:</span>
                          <span class="detail-value">{activity.timestamp}</span>
                        </div>
                        {#if activity.target}
                          <div class="detail-item">
                            <span class="detail-label">Target:</span>
                            <span class="detail-value">{activity.target}</span>
                          </div>
                        {/if}
                      </div>

                      {#if activity.metadata && Object.keys(activity.metadata).length > 0}
                        <div class="metadata-section">
                          <h4>Metadata</h4>
                          <pre class="metadata-code">{JSON.stringify(activity.metadata, null, 2)}</pre>
                        </div>
                      {/if}

                      {#if activity.diff}
                        <div class="diff-section">
                          <h4>Diff</h4>
                          <pre class="diff-code">{activity.diff.substring(0, 500)}{activity.diff.length > 500 ? '...' : ''}</pre>
                        </div>
                      {/if}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        </article>
      {/each}
    {:else}
      <!-- Flat List View -->
      <div role="list" aria-label="Activity list">
      {#each activities as activity (activity.id + activity.category)}
        <div class="activity-item" class:expanded={expandedActivity?.id === activity.id} role="listitem">
          <button
            class="activity-header"
            on:click={() => toggleActivity(activity)}
            on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleActivity(activity)}
            aria-expanded={expandedActivity?.id === activity.id}
            aria-controls="activity-flat-details-{activity.id}"
            aria-label="{activity.description} at {formatTimestamp(activity.timestamp)}"
          >
            <div class="activity-left">
              <span class="expand-arrow">{expandedActivity?.id === activity.id ? '▼' : '▶'}</span>
              <span class="activity-icon" style="color: {getCategoryColor(activity.category)}">
                {getCategoryIcon(activity.category)}
              </span>
              <div class="activity-info">
                <div class="activity-description">{activity.description}</div>
                <div class="activity-meta">
                  <span class="meta-item">{activity.type}</span>
                  <span class="meta-separator">•</span>
                  <span class="meta-item">{formatRelativeTime(activity.timestamp)}</span>
                  {#if activity.session_id}
                    <span class="meta-separator">•</span>
                    <span class="meta-item session-id">{activity.session_id.substring(0, 8)}</span>
                  {/if}
                </div>
              </div>
            </div>
            <div class="activity-right">
              <span class="activity-time">{formatTimestamp(activity.timestamp)}</span>
              <span class="activity-category">{activity.category}</span>
            </div>
          </button>

          {#if expandedActivity?.id === activity.id}
            <div class="activity-details" id="activity-flat-details-{activity.id}" role="region" aria-label="Activity details">
              <div class="details-grid">
                <div class="detail-item">
                  <span class="detail-label">ID:</span>
                  <span class="detail-value">{activity.id}</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">Type:</span>
                  <span class="detail-value">{activity.type}</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">Category:</span>
                  <span class="detail-value">{activity.category}</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">Timestamp:</span>
                  <span class="detail-value">{activity.timestamp}</span>
                </div>
                {#if activity.target}
                  <div class="detail-item">
                    <span class="detail-label">Target:</span>
                    <span class="detail-value">{activity.target}</span>
                  </div>
                {/if}
              </div>

              {#if activity.metadata && Object.keys(activity.metadata).length > 0}
                <div class="metadata-section">
                  <h4>Metadata</h4>
                  <pre class="metadata-code">{JSON.stringify(activity.metadata, null, 2)}</pre>
                </div>
              {/if}

              {#if activity.diff}
                <div class="diff-section">
                  <h4>Diff</h4>
                  <pre class="diff-code">{activity.diff.substring(0, 500)}{activity.diff.length > 500 ? '...' : ''}</pre>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
      </div>

      {#if hasMore}
        <div class="load-more">
          <button on:click={loadMore} disabled={loading} aria-label="Load more activities, {total - activities.length} remaining" aria-live="polite">
            {loading ? 'Loading...' : `Load More (${total - activities.length} remaining)`}
          </button>
        </div>
      {/if}
    {/if}
  </div>
  </div> <!-- End main-content -->

  <!-- Recent Activity Sidebar -->
  <aside class="recent-activity-sidebar" aria-labelledby="recent-activity-heading">
    <div class="sidebar-header">
      <h3 id="recent-activity-heading"><span aria-hidden="true">⚡</span> Recent Activity</h3>
    </div>
    <div class="sidebar-content">
      {#if loading}
        <div class="sidebar-loading" role="status" aria-live="polite">Loading...</div>
      {:else if recentActivity.length === 0}
        <div class="sidebar-empty" role="status">
          <p>No recent activity</p>
        </div>
      {:else}
        <div class="sidebar-list" role="feed" aria-label="Recent activity feed">
          {#each recentActivity || [] as activity, index (`${activity.id || activity.type}-${activity.timestamp}-${index}`)}
            <div class="sidebar-item" class:file={activity.type === 'file'} class:agent={activity.type === 'agent'}>
              <div class="sidebar-icon">
                {#if activity.type === 'file'}
                  <span style="color: {getChangeTypeColor(activity.change_type)}">
                    {getChangeTypeIcon(activity.change_type)}
                  </span>
                {:else}
                  <span>🤖</span>
                {/if}
              </div>

              <div class="sidebar-details">
                {#if activity.type === 'file'}
                  <div class="sidebar-file">{truncatePath(activity.filepath)}</div>
                  <div class="sidebar-meta">
                    <span class="sidebar-type">{activity.change_type}</span>
                    {#if activity.project_name}
                      <ProjectBadge project={activity.project_name} size="small" />
                    {/if}
                    <span class="sidebar-time">{formatTimestamp(activity.timestamp)}</span>
                  </div>
                {:else}
                  <div class="sidebar-file">{activity.agent || 'Agent'}</div>
                  <div class="sidebar-meta">
                    <span class="sidebar-type">{activity.event_type}</span>
                    {#if activity.project_name}
                      <ProjectBadge project={activity.project_name} size="small" />
                    {/if}
                    <span class="sidebar-time">{formatTimestamp(activity.timestamp)}</span>
                  </div>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </aside>
</div>

<style>
  .activity-log {
    display: grid;
    grid-template-columns: 1fr 300px;
    gap: 8px;
    padding: 8px;
    max-width: 1600px;
    margin: 0 auto;
    position: relative;
    height: calc(100vh - 180px);
    overflow: hidden;
  }

  .main-content {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .log-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    padding: 0 8px 12px 8px;
    border-bottom: 2px solid var(--border);
  }

  .header-title h1 {
    margin: 0 0 4px 0;
    font-size: 12px;
    color: var(--text);
  }

  .subtitle {
    margin: 0;
    font-size: 12px;
    color: var(--muted);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .last-updated {
    font-size: 12px;
    color: var(--muted);
    font-family: var(--mono);
  }

  .refresh-btn {
    padding: 6px 10px;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 3px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .refresh-btn:hover:not(:disabled) {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .refresh-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .refresh-icon {
    display: inline-block;
    font-size: 11px;
  }

  .refresh-icon.spinning {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .btn-export {
    padding: 6px 10px;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 3px;
    cursor: pointer;
    font-size: 13px;
    transition: all 0.2s;
  }

  .btn-export:hover {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .controls {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 8px;
    background: var(--surface);
    padding: 8px;
    border-radius: 4px;
    border: 1px solid var(--border);
  }

  .controls-row {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .search-bar {
    display: flex;
    gap: 12px;
    flex: 1;
  }

  .view-controls {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .view-toggle {
    padding: 6px 10px;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 3px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .view-toggle:hover {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .view-toggle.active {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }

  .time-grouping {
    padding: 6px 10px;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 3px;
    font-size: 12px;
    font-family: var(--mono);
    cursor: pointer;
    min-width: 180px;
  }

  .time-grouping:focus {
    outline: none;
    border-color: var(--accent);
  }

  .session-filter {
    padding: 6px 10px;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 3px;
    font-size: 12px;
    font-family: var(--mono);
    cursor: pointer;
    min-width: 200px;
  }

  .session-filter:focus {
    outline: none;
    border-color: var(--accent);
  }

  .search-bar input {
    flex: 1;
    padding: 6px 10px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--text);
    font-size: 12px;
    font-family: var(--mono);
  }

  .search-bar input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .search-bar button {
    padding: 6px 10px;
    background: var(--accent);
    color: white;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    transition: all 0.2s;
  }

  .search-bar button:hover {
    background: color-mix(in srgb, var(--accent) 80%, black);
  }

  .filter-tabs {
    display: flex;
    gap: 8px;
  }

  .filter-tab {
    padding: 8px 16px;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 3px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    transition: all 0.2s;
  }

  .filter-tab:hover {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .filter-tab.active {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }

  /* Session Grouping Styles */
  .session-group {
    margin-bottom: 6px;
    border: 2px solid var(--border);
    border-radius: 4px;
    overflow: hidden;
    background: var(--bg);
  }

  .session-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    background: var(--surface);
    border-bottom: 2px solid var(--border);
    cursor: pointer;
    user-select: none;
    transition: all 0.2s;
  }

  .session-header:hover {
    background: var(--surface-2);
  }

  .session-header.collapsed {
    border-bottom: none;
  }

  .session-header-left {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
  }

  .session-info {
    flex: 1;
  }

  .session-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  .session-icon {
    font-size: 11px;
  }

  .session-id {
    font-size: 11px;
    font-weight: 700;
    color: var(--text);
    font-family: var(--mono);
  }

  .session-stats {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    color: var(--muted);
    font-family: var(--mono);
  }

  .session-stats .stat {
    color: var(--text);
  }

  .stat-separator {
    color: var(--border);
  }

  .session-header-right {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .session-time {
    font-size: 12px;
    color: var(--muted);
    font-family: var(--mono);
  }

  .session-activities {
    padding: 12px;
    background: var(--bg);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .timeline {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .empty-state {
    text-align: center;
    padding: 40px 20px;
    color: var(--muted);
  }

  .empty-icon {
    font-size: 11px;
    margin-bottom: 6px;
  }

  .empty-state h2 {
    font-size: 12px;
    margin: 0 0 6px 0;
    color: var(--text);
  }

  .empty-state p {
    margin: 0 0 6px 0;
    font-size: 11px;
    color: var(--muted);
  }

  .clear-filters-btn {
    padding: 6px 12px;
    background: var(--accent);
    color: white;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    transition: all 0.2s;
  }

  .clear-filters-btn:hover {
    background: color-mix(in srgb, var(--accent) 80%, black);
  }

  .activity-item {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    overflow: hidden;
    transition: all 0.2s;
  }

  .activity-item:hover {
    border-color: var(--accent);
    box-shadow: 0 2px 8px color-mix(in srgb, var(--accent) 20%, transparent);
  }

  .activity-item.expanded {
    border-color: var(--accent);
  }

  .activity-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    cursor: pointer;
    user-select: none;
    width: 100%;
    background: transparent;
    border: none;
    text-align: left;
    font-family: inherit;
    color: inherit;
  }

  .activity-header:focus {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .activity-left {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
    min-width: 0;
  }

  .expand-arrow {
    font-size: 11px;
    color: var(--muted);
    width: 12px;
    flex-shrink: 0;
  }

  .activity-icon {
    font-size: 13px;
    flex-shrink: 0;
  }

  .activity-info {
    flex: 1;
    min-width: 0;
  }

  .activity-description {
    font-size: 13px;
    color: var(--text);
    font-weight: 500;
    margin-bottom: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .activity-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--muted);
  }

  .meta-item {
    font-family: var(--mono);
  }

  .meta-separator {
    color: var(--border);
  }

  .session-id {
    color: var(--accent);
    font-weight: 600;
  }

  .activity-right {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }

  .activity-time {
    font-size: 12px;
    color: var(--muted);
    font-family: var(--mono);
  }

  .activity-category {
    padding: 4px 10px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    color: var(--muted);
  }

  .activity-details {
    padding: 0 12px 12px 12px;
    border-top: 1px solid var(--border);
  }

  .details-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 12px;
    padding: 8px 0;
  }

  .detail-item {
    display: flex;
    gap: 8px;
  }

  .detail-label {
    font-size: 11px;
    color: var(--muted);
    font-weight: 600;
    text-transform: uppercase;
  }

  .detail-value {
    font-size: 12px;
    color: var(--text);
    font-family: var(--mono);
  }

  .metadata-section,
  .diff-section {
    margin-top: 8px;
  }

  .metadata-section h4,
  .diff-section h4 {
    margin: 0 0 6px 0;
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
  }

  .metadata-code,
  .diff-code {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 8px;
    font-size: 11px;
    font-family: var(--mono);
    color: var(--text);
    overflow-x: auto;
    margin: 0;
    max-height: 300px;
    overflow-y: auto;
  }

  .load-more {
    text-align: center;
    padding: 8px;
  }

  .load-more button {
    padding: 6px 12px;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 3px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    transition: all 0.2s;
  }

  .load-more button:hover:not(:disabled) {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .load-more button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Accessibility */
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
  }

  /* Make session-header work as button */
  .session-header {
    width: 100%;
    text-align: left;
    font-family: inherit;
  }

  /* Recent Activity Sidebar */
  .recent-activity-sidebar {
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    overflow: hidden;
    height: 100%;
  }

  .sidebar-header {
    padding: 8px 12px;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
  }

  .sidebar-header h3 {
    margin: 0;
    font-size: 11px;
    font-weight: 600;
    color: var(--text);
  }

  .sidebar-content {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .sidebar-loading,
  .sidebar-empty {
    padding: 20px 12px;
    text-align: center;
    color: var(--muted);
    font-size: 11px;
  }

  .sidebar-list {
    padding: 4px;
  }

  .sidebar-item {
    display: flex;
    gap: 8px;
    padding: 6px 8px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    margin-bottom: 4px;
    transition: all 0.2s;
  }

  .sidebar-item:hover {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .sidebar-icon {
    font-size: 11px;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .sidebar-details {
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }

  .sidebar-file {
    font-size: 11px;
    color: var(--text);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 2px;
  }

  .sidebar-meta {
    display: flex;
    gap: 4px;
    align-items: center;
    font-size: 10px;
    color: var(--muted);
    flex-wrap: wrap;
  }

  .sidebar-type {
    background: var(--surface);
    padding: 1px 4px;
    border-radius: 2px;
    font-size: 10px;
    text-transform: uppercase;
  }

  .sidebar-time {
    font-size: 10px;
    color: var(--muted);
  }

  /* Sort select styling */
  .sort-select {
    padding: 6px 10px;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 3px;
    font-size: 12px;
    font-family: var(--mono);
    cursor: pointer;
    min-width: 160px;
  }

  .sort-select:focus {
    outline: none;
    border-color: var(--accent);
  }

  /* Statistics Dashboard */
  .statistics-dashboard {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 12px;
    margin-bottom: 8px;
  }

  .stats-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 8px;
  }

  .stats-card {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 10px 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    transition: all 0.15s ease;
  }

  .stats-card:hover {
    border-color: var(--accent);
    background: var(--surface-2);
    transform: translateY(-1px);
  }

  .stats-card-icon {
    font-size: 20px;
    flex-shrink: 0;
  }

  .stats-card-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .stats-card-label {
    font-size: 10px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.3px;
    font-weight: 600;
  }

  .stats-card-value {
    font-size: 16px;
    color: var(--text);
    font-weight: 700;
    font-family: var(--mono);
  }

  /* Charts Section */
  .charts-section {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 12px;
    margin-bottom: 8px;
  }

  .charts-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .charts-header h3 {
    margin: 0;
    font-size: 12px;
    color: var(--text);
    font-weight: 600;
  }

  .charts-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }

  .chart-container {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 12px;
    height: 250px;
  }

  .chart-container.chart-wide {
    grid-column: 1 / -1;
  }

  .charts-toggle {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 8px 12px;
    text-align: center;
    margin-bottom: 8px;
  }

  .btn-toggle-charts {
    padding: 6px 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--text);
    font-family: var(--sans);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-toggle-charts:hover {
    background: var(--accent);
    border-color: var(--accent);
    color: white;
  }

  @media (max-width: 768px) {
    .activity-log {
      grid-template-columns: 1fr;
      padding: 8px;
      height: auto;
    }

    .recent-activity-sidebar {
      order: -1; /* Show sidebar first on mobile */
      max-height: 300px;
    }

    .activity-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
    }

    .activity-right {
      width: 100%;
      justify-content: space-between;
    }

    .details-grid {
      grid-template-columns: 1fr;
    }

    .stats-cards {
      grid-template-columns: 1fr;
    }

    .charts-grid {
      grid-template-columns: 1fr;
    }

    .chart-container.chart-wide {
      grid-column: 1;
    }
  }
</style>
