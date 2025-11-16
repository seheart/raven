<script>
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';
  import { formatDateTime, formatRelativeTime, getTimeAgo } from './timeFormat.js';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import { API_CONFIG } from '../config.js';
  import { logger } from './logger.js';
  import { formatNumber } from './numberFormat.js';
  import { exportJSON } from './exportUtils.js';
  import { Chart, registerables } from 'chart.js';
  import {
    initializeCharts,
    setupChartThemeObserver,
    getChartThemeColors
  } from './utils/chartHelpers.js';

  Chart.register(...registerables);

  const API_BASE = API_CONFIG.API_BASE;

  // ID counter for generating unique notification IDs (using crypto.randomUUID for true uniqueness)
  function generateNotificationId() {
    // Use crypto.randomUUID if available, fallback to timestamp + random
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  let notifications = [];
  let stats = {
    total: 0,
    unread: 0,
    by_type: {},
    by_severity: {}
  };
  let loading = true;
  let filterType = 'all'; // all, error, trigger, performance, git, agent, file, system
  let filterSeverity = 'all'; // all, critical, warning, info
  let showUnreadOnly = false;
  let expandedNotification = null;
  let groupDuplicates = true; // Group identical notifications
  let lastUpdated = null;
  let isManualRefresh = false;
  let showCharts = false; // Toggle for showing/hiding charts

  // Charts
  let charts = {};
  let themeObserver;

  // Cache for grouped notifications to prevent expensive recomputation
  let cachedNotifications = null;
  let cachedGroupDuplicates = null;
  let cachedGroupedResult = [];

  // Pagination
  let limit = 50;
  let offset = 0;
  let hasMore = false;

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

    // Connect to WebSocket for real-time notifications (event-driven, no polling!)
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

      const response = await fetch(`${API_BASE}/notifications?${params}`);
      const data = await response.json();

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
      const response = await fetch(`${API_BASE}/notifications/stats`);
      stats = await response.json();
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

  // Export notifications as JSON
  async function exportNotifications() {
    try {
      exportJSON(notifications, 'raven-notifications');
    } catch (error) {
      logger.error('Failed to export notifications:', error);
      alert('Failed to export notifications: ' + error.message);
    }
  }

  // Group notifications by title+message to show duplicates with count (optimized with caching)
  $: groupedNotifications = (() => {
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
  })();

  function groupNotificationsByContent(notifs) {
    const grouped = [];
    const seen = new Map();

    for (const notif of notifs) {
      const key = `${notif.title}|${notif.message}|${notif.type}|${notif.severity}`;

      if (seen.has(key)) {
        // Increment count for existing group
        const existing = seen.get(key);
        existing.count++;
        existing.allIds.push(notif.id);
        if (!existing.read && !notif.read) {
          // Keep track of unread status
          existing.read = false;
        }
        // Keep the most recent timestamp
        if (new Date(notif.timestamp) > new Date(existing.timestamp)) {
          existing.timestamp = notif.timestamp;
        }
      } else {
        // New unique notification
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

  async function handleProjectSwitched(_data) {
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

  function getSeverityClass(severity) {
    switch (severity) {
      case 'critical':
        return 'severity-critical';
      case 'warning':
        return 'severity-warning';
      case 'info':
        return 'severity-info';
      default:
        return '';
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
      // Group notifications by hour or day depending on data range
      const timeData = {};
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      notifications.forEach(n => {
        const timestamp = new Date(n.timestamp);
        let timeKey;

        if (timestamp >= oneDayAgo) {
          // Group by hour for last 24 hours
          timeKey = `${timestamp.getHours()}:00`;
        } else {
          // Group by day for older notifications
          timeKey = timestamp.toLocaleDateString();
        }

        timeData[timeKey] = (timeData[timeKey] || 0) + 1;
      });

      // Sort keys chronologically
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

  // Reactive "time ago" - updates when lastUpdated changes (no polling!)
  $: timeAgo = getTimeAgo(lastUpdated);

  $: filteredCount = notifications.length;

  // Update charts when notifications or stats change
  $: if (showCharts && (notifications || stats)) {
    updateCharts();
  }
</script>

<div class="notifications-panel" role="region" aria-label="Notifications panel">
  <div class="header">
    <div class="header-left">
      <h1 id="notifications-heading"><span aria-hidden="true">📬</span> Notifications</h1>
      <p class="subtitle">System alerts and activity updates</p>
    </div>
    <div class="header-actions" role="toolbar" aria-label="Notification actions">
      <span class="last-updated" role="status" aria-live="polite">Updated: {timeAgo}</span>
      <label class="toggle-label">
        <input
          type="checkbox"
          bind:checked={groupDuplicates}
          aria-label="Group duplicate notifications"
        />
        Group Duplicates
      </label>
      <label class="toggle-label">
        <input
          type="checkbox"
          bind:checked={showCharts}
          on:change={updateCharts}
          aria-label="Show charts"
        />
        Show Charts
      </label>
      <button
        class="btn btn-primary btn-sm"
        on:click={exportNotifications}
        disabled={notifications.length === 0}
        aria-label="Export notifications to JSON"
      >
        <span aria-hidden="true">📤</span> Export
      </button>
      <button
        class="btn btn-secondary btn-sm"
        on:click={markAllAsRead}
        disabled={stats.unread === 0}
        aria-label="Mark all {stats.unread} notifications as read"
      >
        Mark All Read
      </button>
      <button
        class="btn btn-danger btn-sm"
        on:click={clearAll}
        disabled={stats.total === 0}
        aria-label="Clear all {stats.total} notifications"
      >
        Clear All
      </button>
      <button
        class="btn btn-secondary btn-sm"
        on:click={() => {
          offset = 0;
          loadNotifications(true);
          loadStats();
        }}
        disabled={loading}
        aria-label="Refresh notifications"
      >
        <span class="refresh-icon" class:spinning={isManualRefresh} aria-hidden="true">🔄</span>
        Refresh
      </button>
    </div>
  </div>

  <!-- Stats Bar -->
  <div class="stats-bar" role="region" aria-label="Notification statistics">
    <div class="stat-card" role="status" aria-label="Total notifications: {stats.total}">
      <div class="stat-label">Total</div>
      <div class="stat-value">{formatNumber(stats.total)}</div>
    </div>
    <div
      class="stat-card unread-stat"
      role="status"
      aria-label="Unread notifications: {stats.unread}"
    >
      <div class="stat-label">Unread</div>
      <div class="stat-value">{formatNumber(stats.unread)}</div>
    </div>
    <div
      class="stat-card"
      role="status"
      aria-label="Error notifications: {stats.by_type?.error || 0}"
    >
      <div class="stat-label">Errors</div>
      <div class="stat-value">{formatNumber(stats.by_type?.error || 0)}</div>
    </div>
    <div
      class="stat-card"
      role="status"
      aria-label="Trigger notifications: {stats.by_type?.trigger || 0}"
    >
      <div class="stat-label">Triggers</div>
      <div class="stat-value">{formatNumber(stats.by_type?.trigger || 0)}</div>
    </div>
    <div
      class="stat-card"
      role="status"
      aria-label="Performance notifications: {stats.by_type?.performance || 0}"
    >
      <div class="stat-label">Performance</div>
      <div class="stat-value">{formatNumber(stats.by_type?.performance || 0)}</div>
    </div>
  </div>

  <!-- Charts Section -->
  {#if showCharts && notifications.length > 0}
    <div class="charts-section" role="region" aria-label="Notification charts">
      <div class="charts-grid">
        <div class="chart-container">
          <div class="chart-header">
            <h3>Notifications by Type</h3>
          </div>
          <div class="chart-canvas-wrapper">
            <canvas id="chart-notifications-by-type"></canvas>
          </div>
        </div>

        <div class="chart-container">
          <div class="chart-header">
            <h3>Severity Distribution</h3>
          </div>
          <div class="chart-canvas-wrapper">
            <canvas id="chart-severity-distribution"></canvas>
          </div>
        </div>

        <div class="chart-container chart-wide">
          <div class="chart-header">
            <h3>Notifications Over Time</h3>
          </div>
          <div class="chart-canvas-wrapper">
            <canvas id="chart-notifications-over-time"></canvas>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Filters -->
  <div class="filters" role="region" aria-label="Notification filters">
    <div class="filter-group">
      <label for="filter-type">Type:</label>
      <select
        id="filter-type"
        bind:value={filterType}
        on:change={applyFilters}
        aria-label="Filter notifications by type"
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

    <div class="filter-group">
      <label for="filter-severity">Severity:</label>
      <select
        id="filter-severity"
        bind:value={filterSeverity}
        on:change={applyFilters}
        aria-label="Filter notifications by severity"
      >
        <option value="all">All Severities</option>
        <option value="critical">Critical</option>
        <option value="warning">Warning</option>
        <option value="info">Info</option>
      </select>
    </div>

    <div class="filter-group">
      <label class="checkbox-label">
        <input
          type="checkbox"
          bind:checked={showUnreadOnly}
          on:change={applyFilters}
          aria-label="Show only unread notifications"
        />
        <span>Unread Only</span>
      </label>
    </div>

    <div class="filter-results" role="status" aria-live="polite">
      Showing {formatNumber(filteredCount)} of {formatNumber(stats.total)} notifications
    </div>
  </div>

  <!-- Notifications List -->
  <div class="notifications-list" role="list" aria-label="Notifications" aria-live="polite">
    {#if loading && offset === 0}
      <LoadingSkeleton count={8} height="80px" />
    {:else if notifications.length === 0}
      <div class="empty-state" role="status">
        <div class="empty-icon" aria-hidden="true">📭</div>
        <div class="empty-title">No notifications</div>
        <div class="empty-message">
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
          class="notification-item {getSeverityClass(notification.severity)}"
          class:unread={!notification.read}
          class:expanded={expandedNotification?.id === notification.id}
          on:click={() => toggleExpand(notification)}
          on:keydown={e =>
            (e.key === 'Enter' || e.key === ' ') &&
            (e.preventDefault(), toggleExpand(notification))}
          role="button"
          aria-expanded={expandedNotification?.id === notification.id}
          aria-controls="notification-details-{notification.id}"
          aria-label="{notification.severity} {notification.type}: {notification.title}"
          tabindex="0"
        >
          <div class="notification-header">
            <div class="notification-left">
              <span class="notification-icon" aria-hidden="true"
                >{getNotificationIcon(notification.type)}</span
              >
              <div class="notification-info">
                <div class="notification-title">
                  {notification.title}
                  {#if notification.count > 1}
                    <span
                      class="count-badge"
                      title="{notification.count} duplicate notifications"
                      role="status">{formatNumber(notification.count)}×</span
                    >
                  {/if}
                </div>
                <div class="notification-meta">
                  <span class="notification-type">{notification.type}</span>
                  <span class="notification-time">{formatRelativeTime(notification.timestamp)}</span
                  >
                  {#if !notification.read}
                    <span class="unread-badge" role="status" aria-label="New notification">NEW</span
                    >
                  {/if}
                </div>
              </div>
            </div>
            <div class="notification-actions" role="group" aria-label="Notification actions">
              <button
                class="btn btn-ghost btn-icon"
                on:click|stopPropagation={() => clearNotification(notification.id)}
                aria-label="Clear notification"
              >
                <span aria-hidden="true">🗑️</span>
              </button>
              {#if !notification.read}
                <button
                  class="btn btn-ghost btn-icon"
                  on:click|stopPropagation={() => markAsRead(notification.id)}
                  aria-label="Mark notification as read"
                >
                  <span aria-hidden="true">✓</span>
                </button>
              {/if}
            </div>
          </div>

          {#if expandedNotification?.id === notification.id}
            <div
              class="notification-details"
              id="notification-details-{notification.id}"
              role="region"
              aria-label="Notification details"
            >
              <div class="detail-section">
                <div class="detail-label">Message</div>
                <div class="detail-value">{notification.message}</div>
              </div>
              <div class="detail-section">
                <div class="detail-label">Timestamp</div>
                <div class="detail-value">
                  <time datetime={notification.timestamp}
                    >{formatDateTime(notification.timestamp)}</time
                  >
                </div>
              </div>
              {#if notification.metadata}
                <div class="detail-section">
                  <div class="detail-label">Details</div>
                  <pre class="detail-metadata" role="code">{JSON.stringify(
                      notification.metadata,
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
        <div class="load-more">
          <button
            class="btn btn-secondary btn-sm"
            on:click={loadMore}
            disabled={loading}
            aria-label="Load more notifications"
          >
            {loading ? 'Loading...' : 'Load More'}
          </button>
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .notifications-panel {
    padding: var(--space-lg);
    position: relative;
    max-width: 1400px;
    margin: 0 auto;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 2rem;
    gap: var(--space-2xl);
  }

  .header {
    padding: 0 var(--space-lg);
  }

  .header-left h1 {
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
    margin: 0 0 0.5rem 0;
  }

  .subtitle {
    color: var(--muted);
    font-size: 12px;
    margin: 0;
  }

  .header-actions {
    display: flex;
    gap: var(--space-xl);
    align-items: center;
  }

  .last-updated {
    font-size: 12px;
    color: var(--muted);
    font-family: var(--mono);
  }

  .refresh-icon {
    display: inline-block;
    font-size: 11px;
  }

  .refresh-icon.spinning {
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .stats-bar {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: var(--space-xl);
    margin-bottom: 2rem;
  }

  .stat-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1rem;
    border-left: 3px solid var(--border);
  }

  .stat-card.unread-stat {
    border-left-color: var(--accent);
  }

  .stat-label {
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
    font-weight: 600;
    margin-bottom: 0.5rem;
  }

  .stat-value {
    font-size: 13px;
    color: var(--text);
    font-family: var(--mono);
    font-weight: 700;
  }

  .filters {
    display: flex;
    gap: var(--space-2xl);
    align-items: center;
    padding: 1rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    margin-bottom: 2rem;
    flex-wrap: wrap;
  }

  .filter-group {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
  }

  .filter-group label {
    font-size: 12px;
    color: var(--muted);
    font-weight: 600;
  }

  .filter-group select {
    padding: var(--space-md) var(--space-xl);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-size: 13px;
    font-family: var(--mono);
    cursor: pointer;
  }

  .filter-group select:focus {
    outline: none;
    border-color: var(--accent);
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
    cursor: pointer;
  }

  .checkbox-label input[type='checkbox'] {
    cursor: pointer;
  }

  .filter-results {
    margin-left: auto;
    font-size: 12px;
    color: var(--muted);
  }

  .notifications-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
  }

  .notification-item {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1rem;
    cursor: pointer;
    transition: all var(--duration-base) var(--ease-smooth);
    border-left: 3px solid var(--border);
  }

  .notification-item:hover {
    border-color: var(--accent);
    box-shadow: 0 2px 8px color-mix(in srgb, var(--accent) 20%, transparent);
  }

  .notification-item:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .notification-item.unread {
    border-left-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 5%, var(--surface));
  }

  .notification-item.severity-critical {
    border-left-color: var(--error);
  }

  .notification-item.severity-warning {
    border-left-color: var(--warning);
  }

  .notification-item.severity-info {
    border-left-color: var(--info);
  }

  .notification-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-xl);
  }

  .notification-left {
    display: flex;
    align-items: flex-start;
    gap: var(--space-xl);
    flex: 1;
  }

  .notification-icon {
    font-size: 13px;
  }

  .notification-info {
    flex: 1;
  }

  .notification-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
    margin-bottom: 0.25rem;
  }

  .notification-meta {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
    font-size: 11px;
    color: var(--muted);
  }

  .notification-type {
    text-transform: uppercase;
    font-weight: 600;
  }

  .unread-badge {
    padding: var(--space-xs) var(--space-md);
    background: var(--accent);
    color: white;
    border-radius: var(--radius);
    font-size: 11px;
    font-weight: 700;
  }

  .notification-actions {
    display: flex;
    gap: var(--space-lg);
  }

  .notification-details {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border);
  }

  .detail-section {
    margin-bottom: 1rem;
  }

  .detail-section:last-child {
    margin-bottom: 0;
  }

  .detail-label {
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
    font-weight: 600;
    margin-bottom: 0.5rem;
  }

  .detail-value {
    font-size: 13px;
    color: var(--text);
  }

  .detail-metadata {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--space-xl);
    font-size: 12px;
    color: var(--text);
    overflow-x: auto;
    font-family: var(--mono);
  }

  .loading,
  .empty-state {
    text-align: center;
    padding: 3rem;
    color: var(--muted);
  }

  .empty-state {
    background: var(--surface);
    border: 1px dashed var(--border);
    border-radius: var(--radius);
  }

  .empty-icon {
    font-size: 13px;
    margin-bottom: 1rem;
  }

  .empty-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
    margin-bottom: 0.5rem;
  }

  .empty-message {
    font-size: 12px;
    color: var(--muted);
  }

  .load-more {
    text-align: center;
    padding: 1rem;
  }

  /* Count Badge */
  .count-badge {
    display: inline-block;
    background: var(--accent);
    color: white;
    font-size: 11px;
    font-weight: 700;
    padding: var(--space-xs) var(--space-lg);
    border-radius: var(--radius-sm);
    margin-left: var(--space-lg);
    vertical-align: middle;
  }

  /* Toggle Label */
  .toggle-label {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
    font-size: 13px;
    color: var(--text);
    cursor: pointer;
    padding: var(--space-md) var(--space-lg);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .toggle-label:hover {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .toggle-label input[type='checkbox'] {
    cursor: pointer;
    width: var(--icon-xs);
    height: var(--icon-xs);
  }

  /* Charts Section */
  .charts-section {
    margin-bottom: 2rem;
  }

  .charts-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-2xl);
  }

  .chart-container {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1rem;
    border-left: 3px solid var(--accent);
  }

  .chart-container.chart-wide {
    grid-column: 1 / -1;
  }

  .chart-header {
    margin-bottom: 1rem;
  }

  .chart-header h3 {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .chart-canvas-wrapper {
    position: relative;
    height: 250px;
  }

  .chart-wide .chart-canvas-wrapper {
    height: 300px;
  }

  /* Responsive Charts */
  @media (max-width: 768px) {
    .charts-grid {
      grid-template-columns: 1fr;
    }

    .chart-container.chart-wide {
      grid-column: 1;
    }
  }
</style>
