<script>
  import { onMount, onDestroy } from 'svelte';
  import PageInfo from './PageInfo.svelte';
  import { websocketService } from './websocket.js';
  import { formatDateTime, formatRelativeTime } from './timeFormat.js';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import { API_CONFIG } from '../config.js';

  const API_BASE = API_CONFIG.BASE_URL + '/api';

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

  // Pagination
  let limit = 50;
  let offset = 0;
  let hasMore = false;

  onMount(async () => {
    await loadNotifications();
    await loadStats();

    // Connect to WebSocket for real-time notifications
    websocketService.connect();
    websocketService.on('notification', handleNewNotification);
    websocketService.on('error-logged', handleErrorLogged);
    websocketService.on('trigger-fired', handleTriggerFired);
    websocketService.on('project-switched', handleProjectSwitched);
  });

  onDestroy(() => {
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
      console.error('Failed to load notifications:', error);
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
      console.error('Failed to load notification stats:', error);
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
      console.error('Failed to mark notification as read:', error);
    }
  }

  async function markAllAsRead() {
    if (stats.unread === 0) return;

    if (!confirm(`Mark all ${stats.unread} notification(s) as read?`)) {
      return;
    }

    try {
      await fetch(`${API_BASE}/notifications/mark-all-read`, { method: 'POST' });
      notifications = notifications.map(n => ({ ...n, read: true }));
      stats.unread = 0;
    } catch (error) {
      console.error('Failed to mark all as read:', error);
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
      console.error('Failed to export notifications:', error);
      alert('Failed to export notifications: ' + error.message);
    }
  }

  // Group notifications by title+message to show duplicates with count
  $: groupedNotifications = groupDuplicates ? groupNotificationsByContent(notifications) : notifications.map(n => ({ ...n, count: 1 }));

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
      console.error('Failed to clear notification:', error);
    }
  }

  async function clearAll() {
    if (!confirm('Clear all notifications? This cannot be undone.')) return;

    try {
      await fetch(`${API_BASE}/notifications`, { method: 'DELETE' });
      notifications = [];
      stats = { total: 0, unread: 0, by_type: {}, by_severity: {} };
    } catch (error) {
      console.error('Failed to clear all notifications:', error);
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
      case 'performance': return '⚡️';
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
  function getTimeAgo() {
    if (!lastUpdated) return 'Never';
    const seconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
    if (seconds < 10) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  }

  // Live timestamp updates
  let timeAgo = 'Never';
  setInterval(() => {
    timeAgo = getTimeAgo();
  }, 1000);

  $: filteredCount = notifications.length;
</script>

<div class="notifications-panel">
  <PageInfo
    title="Notifications Center"
    description="This is your Raven inbox - think of it like email or a notification center on your phone, but specifically for **all alerts and events** Raven generates. The Notifications page is where errors, trigger alerts, performance warnings, system events, and agent activity notifications are collected and displayed. Instead of alerts disappearing when you close a toast, they're saved here permanently so you can review them later or investigate what happened."
    keyPoints={[
      '**Stats Dashboard at Top** - Four key metrics: Total (all notifications ever), Unread (new ones you haven\'t clicked), By Type (breakdown by category like 47 errors, 12 triggers, 8 performance), By Severity (Critical/Warning/Info split). Example: "Total: 156, Unread: 23, Critical: 5, Warning: 18, Info: 133".',
      '**Filter Controls** - Type dropdown: "All", "Error" (system errors), "Trigger" (custom trigger fires), "Performance" (CPU/memory alerts), "Git" (git events), "Agent" (AI agent activity), "File" (file change notifications), "System" (Raven internal events). Severity dropdown: "All", "Critical" (red, urgent), "Warning" (yellow, important), "Info" (blue, FYI). "Unread Only" checkbox shows just new notifications.',
      '**Notification Cards** - Each notification displays: Severity icon (🔴 critical, ⚠️ warning, ℹ️ info), Type badge (colored pill like "ERROR" in red), Title (short summary), Timestamp (when it happened like "2 hours ago"), Message (detailed description), Expand arrow (▼) to show more details. Unread notifications have bold text and colored left border.',
      '**Expandable Details** - Click any notification to expand and see: Full message with all details, Stack trace (if error), Context data (related files, values), Project badge (which project triggered it), Action buttons (Mark Read/Unread, Delete). Helps diagnose what caused the notification.',
      '**Bulk Actions** - Header buttons: "Mark All Read" clears all unread badges at once, "Clear All" deletes ALL notifications (asks for confirmation), "Export" downloads notifications as JSON file for external analysis. Useful for cleaning up after reviewing or archiving.',
      '**Real-Time Updates** - New notifications appear instantly at the top of the list via WebSocket. You\'ll see the list scroll and unread count increment when new alerts arrive. No refresh needed.',
      '**Notification Types Explained** - Error: Backend errors, frontend exceptions, API failures. Trigger: Custom trigger rules firing (see Triggers page). Performance: CPU/memory/disk thresholds exceeded. Git: Commits, branch switches, merge conflicts. Agent: AI started/stopped, actions taken. File: Unusual file activity (mass deletions, etc.). System: Raven startup, shutdown, configuration changes.'
    ]}
    whenToCheck="Check Notifications **when you see the unread badge** in navigation (shows notification count), **after trigger alerts fire** (to see what triggered), **when troubleshooting issues** (review error notifications for clues), **to clear old notifications** (keep inbox tidy), or **periodically** (stay aware of what Raven is alerting about)."
    warnings={[
      '**Too many unread (>50)** - You\'re either ignoring notifications or getting too many. Review unread to see if there are patterns. Disable noisy triggers in Settings or Triggers page if getting spam. Important alerts might be buried in noise.',
      '**Frequent critical notifications (>10 per hour)** - Something is seriously wrong. Critical means "needs immediate attention" - do not ignore these. Common causes: Backend repeatedly crashing and restarting, Database corruption causing read errors, Disk full preventing writes, Runaway process consuming all CPU/memory. Investigate immediately.',
      '**No notifications appearing at all** - Either: (1) Nothing has happened yet (normal for new install), (2) Triggers are not configured (go to Triggers page to set up alerts), (3) Notification system disabled in Settings (check Settings → Notifications), (4) WebSocket disconnected (check Status page). If active for hours with no notifications, something might be broken.',
      '**Notifications for wrong project** - If monitoring multiple projects, verify project filter in top navigation. Some notifications are global (system CPU/memory) and always appear regardless of project filter.',
      '**Can\'t mark as read / buttons do not work** - Backend might not be responding. Check Status page to verify backend is online and WebSocket is connected. Try refreshing the page. Check browser console for JavaScript errors.',
      '**Notification list shows old items repeatedly** - Might be pagination bug or database corruption. Try "Clear All" to reset. If persists, check backend logs. Database might need manual cleanup via Storage page.',
      '**Export does not download file** - Browser might be blocking downloads. Check browser permissions. Try right-click → "Save Link As" on the export button. Make sure pop-up blocker is not interfering.'
    ]}
  />

  <div class="header">
    <div class="header-left">
      <h1>📬 Notifications</h1>
      <p class="subtitle">System alerts and activity updates</p>
    </div>
    <div class="header-actions">
      <span class="last-updated">Updated: {timeAgo}</span>
      <label class="toggle-label">
        <input type="checkbox" bind:checked={groupDuplicates} />
        Group Duplicates
      </label>
      <button class="btn-secondary" on:click={exportNotifications} disabled={notifications.length === 0}>
        📤 Export
      </button>
      <button class="btn-secondary" on:click={markAllAsRead} disabled={stats.unread === 0}>
        Mark All Read
      </button>
      <button class="btn-secondary" on:click={clearAll} disabled={stats.total === 0}>
        Clear All
      </button>
      <button class="btn-primary" on:click={() => { offset = 0; loadNotifications(true); loadStats(); }} disabled={loading}>
        <span class="refresh-icon" class:spinning={isManualRefresh}>🔄</span>
        Refresh
      </button>
    </div>
  </div>

  <!-- Stats Bar -->
  <div class="stats-bar">
    <div class="stat-card">
      <div class="stat-label">Total</div>
      <div class="stat-value">{stats.total}</div>
    </div>
    <div class="stat-card unread-stat">
      <div class="stat-label">Unread</div>
      <div class="stat-value">{stats.unread}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Errors</div>
      <div class="stat-value">{stats.by_type?.error || 0}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Triggers</div>
      <div class="stat-value">{stats.by_type?.trigger || 0}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Performance</div>
      <div class="stat-value">{stats.by_type?.performance || 0}</div>
    </div>
  </div>

  <!-- Filters -->
  <div class="filters">
    <div class="filter-group">
      <label>Type:</label>
      <select bind:value={filterType} on:change={applyFilters}>
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
      <label>Severity:</label>
      <select bind:value={filterSeverity} on:change={applyFilters}>
        <option value="all">All Severities</option>
        <option value="critical">Critical</option>
        <option value="warning">Warning</option>
        <option value="info">Info</option>
      </select>
    </div>

    <div class="filter-group">
      <label class="checkbox-label">
        <input type="checkbox" bind:checked={showUnreadOnly} on:change={applyFilters} />
        <span>Unread Only</span>
      </label>
    </div>

    <div class="filter-results">
      Showing {filteredCount} of {stats.total} notifications
    </div>
  </div>

  <!-- Notifications List -->
  <div class="notifications-list">
    {#if loading && offset === 0}
      <LoadingSkeleton count={8} height="80px" />
    {:else if notifications.length === 0}
      <div class="empty-state">
        <div class="empty-icon">📭</div>
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
        >
          <div class="notification-header">
            <div class="notification-left">
              <span class="notification-icon">{getNotificationIcon(notification.type)}</span>
              <div class="notification-info">
                <div class="notification-title">
                  {notification.title}
                  {#if notification.count > 1}
                    <span class="count-badge" title="{notification.count} duplicate notifications">{notification.count}×</span>
                  {/if}
                </div>
                <div class="notification-meta">
                  <span class="notification-type">{notification.type}</span>
                  <span class="notification-time">{formatRelativeTime(notification.timestamp)}</span>
                  {#if !notification.read}
                    <span class="unread-badge">NEW</span>
                  {/if}
                </div>
              </div>
            </div>
            <div class="notification-actions">
              <button
                class="btn-icon"
                on:click|stopPropagation={() => clearNotification(notification.id)}
                title="Clear notification"
              >
                🗑️
              </button>
              {#if !notification.read}
                <button
                  class="btn-icon"
                  on:click|stopPropagation={() => markAsRead(notification.id)}
                  title="Mark as read"
                >
                  ✓
                </button>
              {/if}
            </div>
          </div>

          {#if expandedNotification?.id === notification.id}
            <div class="notification-details">
              <div class="detail-section">
                <div class="detail-label">Message</div>
                <div class="detail-value">{notification.message}</div>
              </div>
              <div class="detail-section">
                <div class="detail-label">Timestamp</div>
                <div class="detail-value">{formatDateTime(notification.timestamp)}</div>
              </div>
              {#if notification.metadata}
                <div class="detail-section">
                  <div class="detail-label">Details</div>
                  <pre class="detail-metadata">{JSON.stringify(notification.metadata, null, 2)}</pre>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/each}

      {#if hasMore}
        <div class="load-more">
          <button class="btn-secondary" on:click={loadMore} disabled={loading}>
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
