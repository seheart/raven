<script>
  import { notificationHistory, unreadCount } from './notificationHistory.js';
  import { fade } from 'svelte/transition';
  import { logger } from './logger.js';

  export let visible = false;
  export let onClose = () => {};

  let filter = 'all';

  $: filteredNotifications = $notificationHistory.filter(n => {
    if (filter === 'unread') return !n.read;
    if (filter === 'errors') return n.type === 'error';
    if (filter === 'warnings') return n.type === 'warning';
    return true;
  });

  function getIcon(type) {
    switch(type) {
    case 'success': return '✓';
    case 'error': return '✕';
    case 'warning': return '⚠';
    case 'trigger': return '⚡';
    case 'performance': return '📊';
    case 'info':
    default: return 'ℹ';
    }
  }

  function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  }

  let copiedId = null;

  async function copyNotification(notification) {
    let text = `[${notification.type.toUpperCase()}] ${notification.title}\n`;
    text += `Message: ${notification.message}\n`;
    text += `Time: ${new Date(notification.timestamp).toLocaleString()}\n`;

    try {
      await navigator.clipboard.writeText(text);
      copiedId = notification.id;
      setTimeout(() => {
        copiedId = null;
      }, 2000);
    } catch (err) {
      logger.error('Failed to copy:', err);
    }
  }

  function handleNotificationClick(notification) {
    if (!notification.read) {
      notificationHistory.markRead(notification.id);
    }

    // Navigate based on notification type
    if (notification.link) {
      window.location.hash = notification.link;
      onClose();
    }
  }
</script>

{#if visible}
<div class="notification-panel" transition:fade>
  <div class="panel-header">
    <h2>🔔 Notifications</h2>
    <div class="header-actions">
      {#if $notificationHistory.length > 0}
        <button class="btn-clear-all" on:click={() => notificationHistory.clearAll()}>Clear All</button>
      {/if}
      <button class="btn-close" on:click={onClose}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>
  </div>

  <div class="filter-tabs">
    <button
      class="filter-tab"
      class:active={filter === 'all'}
      on:click={() => filter = 'all'}
    >
      All ({$notificationHistory.length})
    </button>
    <button
      class="filter-tab"
      class:active={filter === 'unread'}
      on:click={() => filter = 'unread'}
    >
      Unread ({$unreadCount})
    </button>
    <button
      class="filter-tab"
      class:active={filter === 'errors'}
      on:click={() => filter = 'errors'}
    >
      Errors
    </button>
    <button
      class="filter-tab"
      class:active={filter === 'warnings'}
      on:click={() => filter = 'warnings'}
    >
      Warnings
    </button>
  </div>

  <div class="notification-list">
    {#if filteredNotifications.length === 0}
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <p>No notifications</p>
      </div>
    {:else}
      {#each filteredNotifications as notification (notification.id)}
        <div
          class="notification-card"
          class:unread={!notification.read}
          class:clickable={notification.link}
          on:click={() => handleNotificationClick(notification)}
          on:keydown={(e) => e.key === 'Enter' && handleNotificationClick(notification)}
          role="button"
          tabindex="0"
        >
          <div class="notification-icon">{getIcon(notification.type)}</div>
          <div class="notification-body">
            <div class="notification-header-row">
              <span class="notification-title">{notification.title}</span>
              <span class="notification-time">{formatTime(notification.timestamp)}</span>
            </div>
            <div class="notification-message">{notification.message}</div>
          </div>
          <div class="notification-actions">
            <button
              class="btn-copy"
              on:click|stopPropagation={() => copyNotification(notification)}
              title="Copy notification"
            >
              {#if copiedId === notification.id}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
              {:else}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                </svg>
              {/if}
            </button>
            <button
              class="btn-remove"
              on:click|stopPropagation={() => notificationHistory.clear(notification.id)}
              title="Remove notification"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>
{/if}

<style>
  .notification-panel {
    position: fixed;
    top: 0;
    right: 0;
    width: 420px;
    max-width: 90vw;
    height: 100vh;
    background: var(--surface);
    border-left: 1px solid var(--border);
    box-shadow: -4px 0 12px rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
    z-index: 1000;
  }

  .panel-header {
    padding: 1.5rem;
    background: var(--surface-2);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .panel-header h2 {
    margin: 0;
    font-size: 1.25rem;
    color: var(--text);
  }

  .header-actions {
    display: flex;
    gap: var(--space-lg);
  }

  .btn-clear-all {
    padding: 0.5rem 1rem;
    background: var(--info);
    color: white;
    border: none;
    border-radius: var(--radius-lg);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .btn-clear-all:hover {
    opacity: 0.9;
    transform: translateY(-1px);
  }

  .btn-close {
    padding: 0.5rem;
    background: transparent;
    color: var(--muted);
    border: none;
    border-radius: var(--radius-lg);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .btn-close:hover {
    background: var(--surface-2);
    color: var(--text);
  }

  .filter-tabs {
    display: flex;
    gap: var(--space-lg);
    padding: 1rem;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }

  .filter-tab {
    padding: 0.5rem 1rem;
    background: var(--surface-2);
    color: var(--muted);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .filter-tab:hover {
    background: var(--bg);
    color: var(--text);
  }

  .filter-tab.active {
    background: var(--info);
    color: white;
    border-color: var(--info);
  }

  .notification-list {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--muted);
    gap: var(--space-xl);
  }

  .empty-state svg {
    opacity: 0.5;
  }

  .notification-card {
    display: flex;
    gap: var(--space-xl);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-left: 4px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 1rem;
    cursor: pointer;
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .notification-card.unread {
    border-left-color: var(--info);
    background: var(--surface);
  }

  .notification-card:hover {
    border-color: var(--info);
  }

  .notification-card.clickable {
    cursor: pointer;
  }

  .notification-card.clickable:hover {
    transform: translateX(-2px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  }

  .notification-icon {
    flex-shrink: 0;
    width: var(--icon-md);
    height: var(--icon-md);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--icon-xs);
  }

  .notification-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    min-width: 0;
  }

  .notification-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-lg);
  }

  .notification-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text);
  }

  .notification-time {
    font-size: 0.75rem;
    color: var(--muted);
    flex-shrink: 0;
  }

  .notification-message {
    font-size: 0.875rem;
    color: var(--muted);
    line-height: 1.5;
  }

  .notification-actions {
    display: flex;
    gap: var(--space-sm);
    flex-shrink: 0;
  }

  .btn-copy,
  .btn-remove {
    padding: 0.25rem;
    background: transparent;
    color: var(--muted);
    border: none;
    border-radius: var(--radius);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .btn-copy:hover {
    background: var(--surface-2);
    color: var(--info);
  }

  .btn-remove:hover {
    background: var(--surface-2);
    color: var(--error);
  }

  @media (max-width: 768px) {
    .notification-panel {
      width: 100vw;
    }
  }
</style>
