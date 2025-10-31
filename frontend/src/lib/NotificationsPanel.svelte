<script>
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';
  import { formatDateTime, formatRelativeTime } from './timeFormat.js';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import { API_CONFIG } from '../config.js';
  import { logger } from './logger.js';
  import { formatNumber } from './numberFormat.js';

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

    // Connect to WebSocket for real-time notifications (event-driven, no polling!)
    websocketService.connect();
    websocketService.on('notification', handleNewNotification);
    websocketService.on('error-logged', handleErrorLogged);
    websocketService.on('trigger-fired', handleTriggerFired);
    websocketService.on('project-switched', handleProjectSwitched);
  });

  onDestroy(() => {
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
      notifications = notifications.map(n =>
        n.id === id ? { ...n, read: true } : n
      );
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
      const jsonContent = JSON.stringify(notifications, null, 2);
      const blob = new Blob([jsonContent], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `raven-notifications-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
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
    switch(type) {
    case 'error': return '⚠️';
    case 'trigger': return '🔔';
    case 'performance': return '⚡';
    case 'git': return '🌳';
    case 'agent': return '🤖';
    case 'file': return '📁';
    case 'system': return '⚙️';
    default: return '📝';
    }
  }

  function getSeverityClass(severity) {
    switch(severity) {
    case 'critical': return 'severity-critical';
    case 'warning': return 'severity-warning';
    case 'info': return 'severity-info';
    default: return '';
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

  // Format "time ago" for last updated timestamp

  // Reactive "time ago" - updates when lastUpdated changes (no polling!)
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

  $: filteredCount = notifications.length;
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
        <input type="checkbox" bind:checked={groupDuplicates} aria-label="Group duplicate notifications" />
        Group Duplicates
      </label>
      <button class="btn-secondary" on:click={exportNotifications} disabled={notifications.length === 0} aria-label="Export notifications to JSON">
        <span aria-hidden="true">📤</span> Export
      </button>
      <button class="btn-secondary" on:click={markAllAsRead} disabled={stats.unread === 0} aria-label="Mark all {stats.unread} notifications as read">
        Mark All Read
      </button>
      <button class="btn-secondary" on:click={clearAll} disabled={stats.total === 0} aria-label="Clear all {stats.total} notifications">
        Clear All
      </button>
      <button class="btn-primary" on:click={() => { offset = 0; loadNotifications(true); loadStats(); }} disabled={loading} aria-label="Refresh notifications">
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
    <div class="stat-card unread-stat" role="status" aria-label="Unread notifications: {stats.unread}">
      <div class="stat-label">Unread</div>
      <div class="stat-value">{formatNumber(stats.unread)}</div>
    </div>
    <div class="stat-card" role="status" aria-label="Error notifications: {stats.by_type?.error || 0}">
      <div class="stat-label">Errors</div>
      <div class="stat-value">{formatNumber(stats.by_type?.error || 0)}</div>
    </div>
    <div class="stat-card" role="status" aria-label="Trigger notifications: {stats.by_type?.trigger || 0}">
      <div class="stat-label">Triggers</div>
      <div class="stat-value">{formatNumber(stats.by_type?.trigger || 0)}</div>
    </div>
    <div class="stat-card" role="status" aria-label="Performance notifications: {stats.by_type?.performance || 0}">
      <div class="stat-label">Performance</div>
      <div class="stat-value">{formatNumber(stats.by_type?.performance || 0)}</div>
    </div>
  </div>

  <!-- Filters -->
  <div class="filters" role="region" aria-label="Notification filters">
    <div class="filter-group">
      <label for="filter-type">Type:</label>
      <select id="filter-type" bind:value={filterType} on:change={applyFilters} aria-label="Filter notifications by type">
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
      <select id="filter-severity" bind:value={filterSeverity} on:change={applyFilters} aria-label="Filter notifications by severity">
        <option value="all">All Severities</option>
        <option value="critical">Critical</option>
        <option value="warning">Warning</option>
        <option value="info">Info</option>
      </select>
    </div>

    <div class="filter-group">
      <label class="checkbox-label">
        <input type="checkbox" bind:checked={showUnreadOnly} on:change={applyFilters} aria-label="Show only unread notifications" />
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
          on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggleExpand(notification))}
          role="listitem"
          aria-expanded={expandedNotification?.id === notification.id}
          aria-controls="notification-details-{notification.id}"
          aria-label="{notification.severity} {notification.type}: {notification.title}"
          tabindex="0"
        >
          <div class="notification-header">
            <div class="notification-left">
              <span class="notification-icon" aria-hidden="true">{getNotificationIcon(notification.type)}</span>
              <div class="notification-info">
                <div class="notification-title">
                  {notification.title}
                  {#if notification.count > 1}
                    <span class="count-badge" title="{notification.count} duplicate notifications" role="status">{formatNumber(notification.count)}×</span>
                  {/if}
                </div>
                <div class="notification-meta">
                  <span class="notification-type">{notification.type}</span>
                  <span class="notification-time">{formatRelativeTime(notification.timestamp)}</span>
                  {#if !notification.read}
                    <span class="unread-badge" role="status" aria-label="New notification">NEW</span>
                  {/if}
                </div>
              </div>
            </div>
            <div class="notification-actions" role="group" aria-label="Notification actions">
              <button
                class="btn-icon"
                on:click|stopPropagation={() => clearNotification(notification.id)}
                aria-label="Clear notification"
              >
                <span aria-hidden="true">🗑️</span>
              </button>
              {#if !notification.read}
                <button
                  class="btn-icon"
                  on:click|stopPropagation={() => markAsRead(notification.id)}
                  aria-label="Mark notification as read"
                >
                  <span aria-hidden="true">✓</span>
                </button>
              {/if}
            </div>
          </div>

          {#if expandedNotification?.id === notification.id}
            <div class="notification-details" id="notification-details-{notification.id}" role="region" aria-label="Notification details">
              <div class="detail-section">
                <div class="detail-label">Message</div>
                <div class="detail-value">{notification.message}</div>
              </div>
              <div class="detail-section">
                <div class="detail-label">Timestamp</div>
                <div class="detail-value"><time datetime={notification.timestamp}>{formatDateTime(notification.timestamp)}</time></div>
              </div>
              {#if notification.metadata}
                <div class="detail-section">
                  <div class="detail-label">Details</div>
                  <pre class="detail-metadata" role="code">{JSON.stringify(notification.metadata, null, 2)}</pre>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/each}

      {#if hasMore}
        <div class="load-more">
          <button class="btn-secondary" on:click={loadMore} disabled={loading} aria-label="Load more notifications">
            {loading ? 'Loading...' : 'Load More'}
          </button>
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .notifications-panel {
    padding: 24px;
    position: relative;
    max-width: 1400px;
    margin: 0 auto;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 2rem;
    gap: 2rem;
  }

  .header {
    padding: 0 8px;
  }

  .header-left h1 {
    font-size: 18px;
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
    gap: 12px;
    align-items: center;
  }

  .last-updated {
    font-size: 12px;
    color: var(--muted);
    font-family: var(--mono);
  }

  .refresh-icon {
    display: inline-block;
    font-size: 14px;
  }

  .refresh-icon.spinning {
    animation: spin-refresh 1s linear infinite;
  }

  @keyframes spin-refresh {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .btn-primary, .btn-secondary {
    padding: 10px 20px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    font-family: var(--mono);
    border: none;
  }

  .btn-primary {
    background: var(--accent);
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    opacity: 0.9;
    transform: translateY(-2px);
  }

  .btn-secondary {
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .btn-primary:disabled, .btn-secondary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .stats-bar {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 1rem;
    margin-bottom: 2rem;
  }

  .stat-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
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
    gap: 1.5rem;
    align-items: center;
    padding: 1rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    margin-bottom: 2rem;
    flex-wrap: wrap;
  }

  .filter-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .filter-group label {
    font-size: 12px;
    color: var(--muted);
    font-weight: 600;
  }

  .filter-group select {
    padding: 6px 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
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
    gap: 0.5rem;
    cursor: pointer;
  }

  .checkbox-label input[type="checkbox"] {
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
    gap: 1rem;
  }

  .notification-item {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1rem;
    cursor: pointer;
    transition: all 0.2s;
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
    gap: 1rem;
  }

  .notification-left {
    display: flex;
    align-items: flex-start;
    gap: 12px;
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
    gap: 0.75rem;
    font-size: 11px;
    color: var(--muted);
  }

  .notification-type {
    text-transform: uppercase;
    font-weight: 600;
  }

  .unread-badge {
    padding: 2px 6px;
    background: var(--accent);
    color: white;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 700;
  }

  .notification-actions {
    display: flex;
    gap: 0.5rem;
  }

  .btn-icon {
    padding: 6px;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    color: var(--success);
    transition: all 0.2s;
  }

  .btn-icon:hover {
    background: var(--surface-2);
    border-color: var(--accent);
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
    border-radius: 6px;
    padding: 12px;
    font-size: 12px;
    color: var(--text);
    overflow-x: auto;
    font-family: var(--mono);
  }

  .loading, .empty-state {
    text-align: center;
    padding: 3rem;
    color: var(--muted);
  }

  .empty-state {
    background: var(--surface);
    border: 1px dashed var(--border);
    border-radius: 8px;
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
    padding: 2px 8px;
    border-radius: 12px;
    margin-left: 8px;
    vertical-align: middle;
  }

  /* Toggle Label */
  .toggle-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--text);
    cursor: pointer;
    padding: 10px 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    transition: all 0.2s;
  }

  .toggle-label:hover {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .toggle-label input[type="checkbox"] {
    cursor: pointer;
    width: 16px;
    height: 16px;
  }
</style>
