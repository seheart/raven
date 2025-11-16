<script>
  import { logger } from '../logger.js';
  /**
   * System Notifications Page
   * Comprehensive notification management system with filtering, grouping, charts, and real-time updates
   */
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from '../services/websocket.js';
  import { formatDateTime, formatRelativeTime, getTimeAgo } from '../timeFormat.js';
  import { formatNumber } from '../numberFormat.js';
  import { exportJSON } from '../exportUtils.js';
  import {
    initializeCharts,
    setupChartThemeObserver,
    getChartThemeColors
  } from '../utils/chartHelpers.js';
  import { API_CONFIG } from '../../config.js';
  import DOMPurify from 'dompurify';
  import { Chart, registerables } from 'chart.js';

  Chart.register(...registerables);

  const API_BASE = API_CONFIG.API_BASE;

  // ID counter for generating unique notification IDs
  function generateNotificationId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  // State
  let notifications = $state([]);
  let stats = $state({
    total: 0,
    unread: 0,
    by_type: {},
    by_severity: {}
  });
  let loading = $state(true);
  let filterType = $state('all');
  let filterSeverity = $state('all');
  let showUnreadOnly = $state(false);
  let expandedNotification = $state(null);
  let groupDuplicates = $state(true);
  let lastUpdated = $state(null);
  let isManualRefresh = $state(false);
  let showCharts = $state(false);

  // Charts
  let charts = {};
  let themeObserver;

  // Cache for grouped notifications to prevent expensive recomputation
  let cachedNotifications = null;
  let cachedGroupDuplicates = null;
  let cachedGroupedResult = [];

  // Pagination
  let limit = $state(50);
  let offset = $state(0);
  let hasMore = $state(false);

  onMount(async () => {
    await loadNotifications();
    await loadStats();

    // Initialize charts after data loads
    initializeCharts(createCharts, {
      data: notifications,
      enabled: showCharts
    });

    // Setup theme observer for charts
    themeObserver = setupChartThemeObserver(createCharts, {
      enabled: showCharts
    });

    // Connect to WebSocket for real-time notifications
    websocketService.connect();
    websocketService.on('notification', handleNewNotification);
    websocketService.on('error-logged', handleErrorLogged);
    websocketService.on('trigger-fired', handleTriggerFired);
    websocketService.on('project-switched', handleProjectSwitched);
  });

  onDestroy(() => {
    // Destroy charts
    Object.values(charts).forEach(chart => chart?.destroy());

    // Disconnect theme observer
    themeObserver?.disconnect();

    // Clean up WebSocket listeners
    websocketService.off('notification', handleNewNotification);
    websocketService.off('error-logged', handleErrorLogged);
    websocketService.off('trigger-fired', handleTriggerFired);
    websocketService.off('project-switched', handleProjectSwitched);
  });

  async function loadNotifications(manual = false) {
    try {
      loading = true;
      isManualRefresh = manual;
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
        type: filterType,
        severity: filterSeverity,
        unread_only: showUnreadOnly.toString()
      });

      const res = await fetch(`${API_BASE}/notifications?${params}`);
      const data = await res.json();

      if (offset === 0) {
        notifications = data.notifications;
      } else {
        notifications = [...notifications, ...data.notifications];
      }

      hasMore = data.hasMore;
      lastUpdated = new Date();
    } catch (error) {
      logger.error('Failed to load notifications:', error);
    } finally {
      loading = false;
      isManualRefresh = false;
    }
  }

  async function loadStats() {
    try {
      const res = await fetch(`${API_BASE}/notifications/stats`);
      stats = await res.json();
    } catch (error) {
      logger.error('Failed to load notification stats:', error);
    }
  }

  async function markAsRead(id) {
    try {
      await fetch(`${API_BASE}/notifications/${id}/read`, { method: 'POST' });
      notifications = notifications.map(n => (n.id === id ? { ...n, read: true } : n));
      stats.unread = Math.max(0, stats.unread - 1);
    } catch (error) {
      logger.error('Failed to mark notification as read:', error);
    }
  }

  async function markAllAsRead() {
    if (stats.unread === 0) return;

    if (!confirm(`Mark all ${formatNumber(stats.unread)} notification(s) as read?`)) {
      return;
    }

    try {
      await fetch(`${API_BASE}/notifications/mark-all-read`, { method: 'POST' });
      notifications = notifications.map(n => ({ ...n, read: true }));
      stats.unread = 0;
    } catch (error) {
      logger.error('Failed to mark all as read:', error);
    }
  }

  async function exportNotifications() {
    try {
      exportJSON(notifications, 'raven-notifications');
    } catch (error) {
      logger.error('Failed to export notifications:', error);
      alert('Failed to export notifications: ' + error.message);
    }
  }

  // Group notifications by title+message to show duplicates with count
  const groupedNotifications = $derived.by(() => {
    // Check if we can use cached result
    if (cachedNotifications === notifications && cachedGroupDuplicates === groupDuplicates) {
      return cachedGroupedResult;
    }

    // Recompute and cache
    cachedNotifications = notifications;
    cachedGroupDuplicates = groupDuplicates;
    cachedGroupedResult = groupDuplicates
      ? groupNotificationsByContent(notifications)
      : notifications.map(n => ({ ...n, count: 1 }));

    return cachedGroupedResult;
  });

  function groupNotificationsByContent(notifs) {
    const grouped = [];
    const seen = new Map();

    for (const notif of notifs) {
      const key = `${notif.title}|${notif.message}|${notif.type}|${notif.severity}`;

      if (seen.has(key)) {
        const existing = seen.get(key);
        existing.count++;
        existing.allIds.push(notif.id);
        if (!existing.read && !notif.read) {
          existing.read = false;
        }
        if (new Date(notif.timestamp) > new Date(existing.timestamp)) {
          existing.timestamp = notif.timestamp;
        }
      } else {
        const group = { ...notif, count: 1, allIds: [notif.id] };
        seen.set(key, group);
        grouped.push(group);
      }
    }

    return grouped;
  }

  async function clearNotification(id) {
    try {
      await fetch(`${API_BASE}/notifications/${id}`, { method: 'DELETE' });
      notifications = notifications.filter(n => n.id !== id);
      stats.total = Math.max(0, stats.total - 1);
      await loadStats();
    } catch (error) {
      logger.error('Failed to clear notification:', error);
    }
  }

  async function clearAll() {
    if (!confirm('Clear all notifications? This cannot be undone.')) return;

    try {
      await fetch(`${API_BASE}/notifications`, { method: 'DELETE' });
      notifications = [];
      stats = { total: 0, unread: 0, by_type: {}, by_severity: {} };
    } catch (error) {
      logger.error('Failed to clear all notifications:', error);
    }
  }

  function handleNewNotification(notification) {
    notifications = [notification, ...notifications];
    stats.unread += 1;
    stats.total += 1;
    loadStats();
  }

  function handleErrorLogged(data) {
    const notification = {
      id: generateNotificationId(),
      type: 'error',
      severity: data?.severity || 'warning',
      title: `${data?.error_type || 'Error'}: ${data?.message || 'Unknown error'}`,
      message: data?.message || 'Unknown error',
      timestamp: new Date().toISOString(),
      read: false,
      metadata: {
        component: data?.component,
        stack: data?.stack
      }
    };
    handleNewNotification(notification);
  }

  function handleTriggerFired(data) {
    const notification = {
      id: generateNotificationId(),
      type: 'trigger',
      severity: 'warning',
      title: `Trigger: ${data.trigger_name}`,
      message: data.message || `Trigger "${data.trigger_name}" was fired`,
      timestamp: new Date().toISOString(),
      read: false,
      metadata: data
    };
    handleNewNotification(notification);
  }

  async function handleProjectSwitched(data) {
    offset = 0;
    await loadNotifications();
    await loadStats();
  }

  function toggleExpand(notification) {
    if (expandedNotification?.id === notification.id) {
      expandedNotification = null;
    } else {
      expandedNotification = notification;
      if (!notification.read) {
        markAsRead(notification.id);
      }
    }
  }

  function getNotificationIcon(type) {
    switch (type) {
      case 'error':
        return '⚠️';
      case 'trigger':
        return '🔔';
      case 'performance':
        return '⚡';
      case 'git':
        return '🌳';
      case 'agent':
        return '🤖';
      case 'file':
        return '📁';
      case 'system':
        return '⚙️';
      default:
        return '📝';
    }
  }

  function getSeverityBorderClass(severity) {
    switch (severity) {
      case 'critical':
        return 'border-l-[var(--error)]';
      case 'warning':
        return 'border-l-[var(--warning)]';
      case 'info':
        return 'border-l-[var(--info)]';
      default:
        return 'border-l-[var(--border)]';
    }
  }

  async function applyFilters() {
    offset = 0;
    await loadNotifications();
  }

  async function loadMore() {
    offset += limit;
    await loadNotifications();
  }

  // Chart Functions
  function createCharts() {
    // Destroy existing charts
    Object.values(charts).forEach(chart => chart?.destroy());
    charts = {};

    if (!showCharts || notifications.length === 0) return;

    const colors = getChartThemeColors();

    // Chart 1: Pie Chart - Notifications by Type
    const typeCanvas = document.getElementById('chart-notifications-by-type');
    if (typeCanvas) {
      const typeData = {};
      notifications.forEach(n => {
        typeData[n.type] = (typeData[n.type] || 0) + 1;
      });

      const typeColors = {
        error: colors.error,
        trigger: colors.warning,
        performance: colors.info,
        git: colors.success,
        agent: colors.accent,
        file: 'var(--accent)',
        system: '#ff9e64',
        default: colors.muted
      };

      charts.typeChart = new Chart(typeCanvas, {
        type: 'pie',
        data: {
          labels: Object.keys(typeData),
          datasets: [
            {
              data: Object.values(typeData),
              backgroundColor: Object.keys(typeData).map(
                type => typeColors[type] || typeColors.default
              ),
              borderColor: Object.keys(typeData).map(
                type => typeColors[type] || typeColors.default
              ),
              borderWidth: 2
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              labels: {
                color: colors.text,
                font: { size: 11, family: 'var(--mono)' },
                padding: 8
              }
            }
          }
        }
      });
    }

    // Chart 2: Donut Chart - Severity Distribution
    const severityCanvas = document.getElementById('chart-severity-distribution');
    if (severityCanvas) {
      const severityData = {};
      notifications.forEach(n => {
        severityData[n.severity] = (severityData[n.severity] || 0) + 1;
      });

      const severityColors = {
        critical: colors.error,
        warning: colors.warning,
        info: colors.info
      };

      charts.severityChart = new Chart(severityCanvas, {
        type: 'doughnut',
        data: {
          labels: Object.keys(severityData),
          datasets: [
            {
              data: Object.values(severityData),
              backgroundColor: Object.keys(severityData).map(
                sev => severityColors[sev] || colors.muted
              ),
              borderColor: Object.keys(severityData).map(
                sev => severityColors[sev] || colors.muted
              ),
              borderWidth: 2
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              labels: {
                color: colors.text,
                font: { size: 11, family: 'var(--mono)' },
                padding: 8
              }
            }
          }
        }
      });
    }

    // Chart 3: Bar Chart - Notifications Over Time
    const timeCanvas = document.getElementById('chart-notifications-over-time');
    if (timeCanvas) {
      const timeData = {};
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      notifications.forEach(n => {
        const timestamp = new Date(n.timestamp);
        let timeKey;

        if (timestamp >= oneDayAgo) {
          timeKey = `${timestamp.getHours()}:00`;
        } else {
          timeKey = timestamp.toLocaleDateString();
        }

        timeData[timeKey] = (timeData[timeKey] || 0) + 1;
      });

      const sortedKeys = Object.keys(timeData).sort();

      charts.timeChart = new Chart(timeCanvas, {
        type: 'bar',
        data: {
          labels: sortedKeys,
          datasets: [
            {
              label: 'Notifications',
              data: sortedKeys.map(key => timeData[key]),
              backgroundColor: colors.accent,
              borderColor: colors.accent,
              borderWidth: 2,
              borderRadius: 4
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                color: colors.muted,
                font: { size: 10, family: 'var(--mono)' },
                stepSize: 1
              },
              grid: {
                color: colors.grid
              }
            },
            x: {
              ticks: {
                color: colors.muted,
                font: { size: 10, family: 'var(--mono)' },
                maxRotation: 45,
                minRotation: 45
              },
              grid: {
                color: colors.grid
              }
            }
          }
        }
      });
    }
  }

  function updateCharts() {
    if (showCharts) {
      setTimeout(createCharts, 100);
    }
  }

  // Reactive time ago
  const timeAgo = $derived(getTimeAgo(lastUpdated));
  const filteredCount = $derived(notifications.length);

  // Update charts when notifications or stats change
  $effect(() => {
    if (showCharts && (notifications || stats)) {
      updateCharts();
    }
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-7xl mx-auto">
    <!-- Header -->
    <div class="flex justify-between items-start mb-6 gap-6">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">📬 Notifications</h1>
        <p class="text-base text-[var(--muted)] font-sans">System alerts and activity updates</p>
      </div>
      <div class="flex gap-3 items-center flex-wrap justify-end">
        <span class="text-sm text-[var(--muted)] font-mono">
          Updated: {timeAgo}
        </span>
        <label
          class="flex items-center gap-2 text-sm text-[var(--text)] cursor-pointer px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg hover:bg-[var(--surface-2)] hover:border-[var(--accent)] transition-all"
        >
          <input type="checkbox" bind:checked={groupDuplicates} class="cursor-pointer w-4 h-4" />
          Group Duplicates
        </label>
        <label
          class="flex items-center gap-2 text-sm text-[var(--text)] cursor-pointer px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg hover:bg-[var(--surface-2)] hover:border-[var(--accent)] transition-all"
        >
          <input
            type="checkbox"
            bind:checked={showCharts}
            onchange={updateCharts}
            class="cursor-pointer w-4 h-4"
          />
          Show Charts
        </label>
        <button
          class="px-3 py-2 bg-[var(--accent)] text-white text-sm font-medium rounded-lg hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          onclick={exportNotifications}
          disabled={notifications.length === 0}
        >
          📤 Export
        </button>
        <button
          class="px-3 py-2 bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] text-sm font-medium rounded-lg hover:bg-[var(--surface-2)] hover:border-[var(--accent)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          onclick={markAllAsRead}
          disabled={stats.unread === 0}
        >
          Mark All Read
        </button>
        <button
          class="px-3 py-2 bg-[var(--error)] text-white text-sm font-medium rounded-lg hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          onclick={clearAll}
          disabled={stats.total === 0}
        >
          Clear All
        </button>
        <button
          class="px-3 py-2 bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] text-sm font-medium rounded-lg hover:bg-[var(--surface-2)] hover:border-[var(--accent)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          onclick={() => {
            offset = 0;
            loadNotifications(true);
            loadStats();
          }}
          disabled={loading}
        >
          <span class={isManualRefresh ? 'inline-block animate-spin' : ''}>🔄</span>
          Refresh
        </button>
      </div>
    </div>

    <!-- Stats Bar -->
    <div class="grid grid-cols-5 gap-4 mb-6">
      <div
        class="bg-[var(--surface)] border border-[var(--border)] border-l-[3px] border-l-[var(--border)] rounded-lg p-4"
      >
        <div class="text-xs text-[var(--muted)] font-semibold uppercase mb-2">Total</div>
        <div class="text-sm text-[var(--text)] font-mono font-bold">
          {formatNumber(stats.total)}
        </div>
      </div>
      <div
        class="bg-[var(--surface)] border border-[var(--border)] border-l-[3px] border-l-[var(--accent)] rounded-lg p-4"
      >
        <div class="text-xs text-[var(--muted)] font-semibold uppercase mb-2">Unread</div>
        <div class="text-sm text-[var(--text)] font-mono font-bold">
          {formatNumber(stats.unread)}
        </div>
      </div>
      <div
        class="bg-[var(--surface)] border border-[var(--border)] border-l-[3px] border-l-[var(--border)] rounded-lg p-4"
      >
        <div class="text-xs text-[var(--muted)] font-semibold uppercase mb-2">Errors</div>
        <div class="text-sm text-[var(--text)] font-mono font-bold">
          {formatNumber(stats.by_type?.error || 0)}
        </div>
      </div>
      <div
        class="bg-[var(--surface)] border border-[var(--border)] border-l-[3px] border-l-[var(--border)] rounded-lg p-4"
      >
        <div class="text-xs text-[var(--muted)] font-semibold uppercase mb-2">Triggers</div>
        <div class="text-sm text-[var(--text)] font-mono font-bold">
          {formatNumber(stats.by_type?.trigger || 0)}
        </div>
      </div>
      <div
        class="bg-[var(--surface)] border border-[var(--border)] border-l-[3px] border-l-[var(--border)] rounded-lg p-4"
      >
        <div class="text-xs text-[var(--muted)] font-semibold uppercase mb-2">Performance</div>
        <div class="text-sm text-[var(--text)] font-mono font-bold">
          {formatNumber(stats.by_type?.performance || 0)}
        </div>
      </div>
    </div>

    <!-- Charts Section -->
    {#if showCharts && notifications.length > 0}
      <div class="mb-6">
        <div class="grid grid-cols-2 gap-4">
          <div
            class="bg-[var(--surface)] border border-[var(--border)] border-l-[3px] border-l-[var(--accent)] rounded-lg p-4"
          >
            <h3 class="text-sm font-semibold text-[var(--text)] uppercase tracking-wide mb-4">
              Notifications by Type
            </h3>
            <div class="relative h-64">
              <canvas id="chart-notifications-by-type"></canvas>
            </div>
          </div>

          <div
            class="bg-[var(--surface)] border border-[var(--border)] border-l-[3px] border-l-[var(--accent)] rounded-lg p-4"
          >
            <h3 class="text-sm font-semibold text-[var(--text)] uppercase tracking-wide mb-4">
              Severity Distribution
            </h3>
            <div class="relative h-64">
              <canvas id="chart-severity-distribution"></canvas>
            </div>
          </div>

          <div
            class="col-span-2 bg-[var(--surface)] border border-[var(--border)] border-l-[3px] border-l-[var(--accent)] rounded-lg p-4"
          >
            <h3 class="text-sm font-semibold text-[var(--text)] uppercase tracking-wide mb-4">
              Notifications Over Time
            </h3>
            <div class="relative h-80">
              <canvas id="chart-notifications-over-time"></canvas>
            </div>
          </div>
        </div>
      </div>
    {/if}

    <!-- Filters -->
    <div
      class="flex gap-6 items-center p-4 bg-[var(--surface)] border border-[var(--border)] rounded-lg mb-6 flex-wrap"
    >
      <div class="flex items-center gap-3">
        <label for="filter-type" class="text-sm text-[var(--muted)] font-semibold">Type:</label>
        <select
          id="filter-type"
          bind:value={filterType}
          onchange={applyFilters}
          class="px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-[var(--text)] text-sm font-mono cursor-pointer focus:outline-none focus:border-[var(--accent)]"
        >
          <option value="all">All Types</option>
          <option value="error">Errors</option>
          <option value="trigger">Triggers</option>
          <option value="performance">Performance</option>
          <option value="git">Git</option>
          <option value="agent">Agents</option>
          <option value="file">Files</option>
          <option value="system">System</option>
        </select>
      </div>

      <div class="flex items-center gap-3">
        <label for="filter-severity" class="text-sm text-[var(--muted)] font-semibold"
          >Severity:</label
        >
        <select
          id="filter-severity"
          bind:value={filterSeverity}
          onchange={applyFilters}
          class="px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-[var(--text)] text-sm font-mono cursor-pointer focus:outline-none focus:border-[var(--accent)]"
        >
          <option value="all">All Severities</option>
          <option value="critical">Critical</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
        </select>
      </div>

      <label class="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          bind:checked={showUnreadOnly}
          onchange={applyFilters}
          class="cursor-pointer w-4 h-4"
        />
        <span class="text-sm text-[var(--text)]">Unread Only</span>
      </label>

      <div class="ml-auto text-sm text-[var(--muted)]">
        Showing {formatNumber(filteredCount)} of {formatNumber(stats.total)} notifications
      </div>
    </div>

    <!-- Notifications List -->
    <div class="space-y-4">
      {#if loading && offset === 0}
        {#each Array(8) as _, i (i)}
          <div
            class="h-20 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-pulse"
          ></div>
        {/each}
      {:else if notifications.length === 0}
        <div
          class="bg-[var(--surface)] border border-dashed border-[var(--border)] rounded-lg p-12 text-center"
        >
          <div class="text-4xl mb-4">📭</div>
          <div class="text-sm font-semibold text-[var(--text)] mb-2">No notifications</div>
          <div class="text-sm text-[var(--muted)]">
            {#if filterType !== 'all' || filterSeverity !== 'all' || showUnreadOnly}
              Try adjusting your filters
            {:else}
              You're all caught up!
            {/if}
          </div>
        </div>
      {:else}
        {#each groupedNotifications as notification (notification.id)}
          <div
            class="bg-[var(--surface)] border border-[var(--border)] border-l-[3px] {getSeverityBorderClass(
              notification.severity
            )} rounded-lg p-4 cursor-pointer transition-all hover:border-[var(--accent)] hover:shadow-lg focus:outline-2 focus:outline-[var(--accent)] focus:outline-offset-2 {!notification.read
              ? 'bg-[color-mix(in_srgb,var(--accent)_5%,var(--surface))]'
              : ''}"
            onclick={() => toggleExpand(notification)}
            onkeydown={e =>
              (e.key === 'Enter' || e.key === ' ') &&
              (e.preventDefault(), toggleExpand(notification))}
            role="button"
            tabindex="0"
          >
            <div class="flex justify-between items-start gap-4">
              <div class="flex items-start gap-4 flex-1">
                <span class="text-lg">{getNotificationIcon(notification.type)}</span>
                <div class="flex-1">
                  <div class="text-sm font-semibold text-[var(--text)] mb-1">
                    {notification.title}
                    {#if notification.count > 1}
                      <span
                        class="inline-block bg-[var(--accent)] text-white text-xs font-bold px-2 py-1 rounded ml-2"
                      >
                        {formatNumber(notification.count)}×
                      </span>
                    {/if}
                  </div>
                  <div class="flex items-center gap-3 text-xs text-[var(--muted)]">
                    <span class="uppercase font-semibold">{notification.type}</span>
                    <span>{formatRelativeTime(notification.timestamp)}</span>
                    {#if !notification.read}
                      <span
                        class="px-2 py-1 bg-[var(--accent)] text-white rounded text-xs font-bold"
                      >
                        NEW
                      </span>
                    {/if}
                  </div>
                </div>
              </div>
              <div class="flex gap-2" role="group">
                <button
                  class="px-2 py-1 text-[var(--text)] hover:bg-[var(--bg)] rounded transition-all"
                  onclick={e => {
                    e.stopPropagation();
                    clearNotification(notification.id);
                  }}
                >
                  🗑️
                </button>
                {#if !notification.read}
                  <button
                    class="px-2 py-1 text-[var(--text)] hover:bg-[var(--bg)] rounded transition-all"
                    onclick={e => {
                      e.stopPropagation();
                      markAsRead(notification.id);
                    }}
                  >
                    ✓
                  </button>
                {/if}
              </div>
            </div>

            {#if expandedNotification?.id === notification.id}
              <div class="mt-4 pt-4 border-t border-[var(--border)]">
                <div class="mb-4">
                  <div class="text-xs text-[var(--muted)] font-semibold uppercase mb-2">
                    Message
                  </div>
                  <div class="text-sm text-[var(--text)]">{notification.message}</div>
                </div>
                <div class="mb-4">
                  <div class="text-xs text-[var(--muted)] font-semibold uppercase mb-2">
                    Timestamp
                  </div>
                  <div class="text-sm text-[var(--text)]">
                    <time datetime={notification.timestamp}
                      >{formatDateTime(notification.timestamp)}</time
                    >
                  </div>
                </div>
                {#if notification.metadata}
                  <div>
                    <div class="text-xs text-[var(--muted)] font-semibold uppercase mb-2">
                      Details
                    </div>
                    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                    <pre
                      class="bg-[var(--bg)] border border-[var(--border)] rounded p-4 text-xs text-[var(--text)] overflow-x-auto font-mono">{@html DOMPurify.sanitize(
                        JSON.stringify(notification.metadata, null, 2)
                      )}</pre>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/each}

        {#if hasMore}
          <div class="text-center py-4">
            <button
              class="px-4 py-2 bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] text-sm font-medium rounded-lg hover:bg-[var(--surface-2)] hover:border-[var(--accent)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              onclick={loadMore}
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Load More'}
            </button>
          </div>
        {/if}
      {/if}
    </div>
  </div>
</div>
