<!-- design-system-skip: utility/infrastructure component, not a user-facing primitive -->
<script>
  import { logger } from '../../logger.js';
  import { notificationHistory, unreadCount } from '../../stores/notificationHistory.js';
  import { navigate } from '../../utils/router.svelte.js';

  let { visible = false, onClose = () => {} } = $props();

  let filter = $state('all');
  let copiedId = $state(null);

  const filteredNotifications = $derived(
    $notificationHistory.filter(n => {
      if (filter === 'unread') return !n.read;
      if (filter === 'errors') return n.type === 'error';
      if (filter === 'warnings') return n.type === 'warning';
      return true;
    })
  );

  function getIcon(type) {
    switch (type) {
    case 'success':
      return '';
    case 'error':
      return '';
    case 'warning':
      return '';
    case 'trigger':
      return '';
    case 'performance':
      return '';
    case 'info':
    default:
      return '';
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
    } catch (error) {
      logger.error('Failed to copy:', error);
    }
  }

  function handleNotificationClick(notification) {
    if (!notification.read) {
      notificationHistory.markRead(notification.id);
    }

    // Navigate based on notification link
    if (notification.link) {
      navigate(notification.link);
      onClose();
    }
  }

  function handleKeyDown(event, notification) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleNotificationClick(notification);
    }
  }
</script>

{#if visible}
  <div class="notification-panel">
    <div class="panel-header">
      <h2 class="text-[var(--text-heading)] text-sm font-semibold m-0 font-sans">Notifications</h2>
      <div class="header-actions flex gap-2">
        {#if $notificationHistory.length > 0}
          <button
            class="btn-clear-all px-2 py-1 bg-[var(--accent)] text-white text-xs font-semibold rounded hover:opacity-90 transition-all border-0 cursor-pointer font-sans"
            onclick={() => notificationHistory.clearAll()}
          >
            Clear All
          </button>
        {/if}
        <button
          class="btn-close p-1.5 bg-transparent text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] rounded transition-all border-0 cursor-pointer flex items-center justify-center text-lg"
          onclick={onClose}
          aria-label="Close notifications"
        >
        </button>
      </div>
    </div>

    <div class="filter-tabs flex gap-1.5 p-2.5 border-b border-[var(--border)] bg-[var(--surface)]">
      <button
        class="filter-tab {filter === 'all' ? 'active' : ''}"
        onclick={() => (filter = 'all')}
      >
        All ({$notificationHistory.length})
      </button>
      <button
        class="filter-tab {filter === 'unread' ? 'active' : ''}"
        onclick={() => (filter = 'unread')}
      >
        Unread ({$unreadCount})
      </button>
      <button
        class="filter-tab {filter === 'errors' ? 'active' : ''}"
        onclick={() => (filter = 'errors')}
      >
        Errors
      </button>
      <button
        class="filter-tab {filter === 'warnings' ? 'active' : ''}"
        onclick={() => (filter = 'warnings')}
      >
        Warnings
      </button>
    </div>

    <div class="notification-list flex-1 overflow-y-auto p-3 flex flex-col gap-2.5">
      {#if filteredNotifications.length === 0}
        <div
          class="empty-state flex flex-col items-center justify-center h-full text-[var(--muted)] gap-3"
        >
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="opacity-50"
          >
            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p class="text-xs font-sans">No notifications</p>
        </div>
      {:else}
        {#each filteredNotifications as notification (notification.id)}
          <div
            class="notification-card {notification.read ? '' : 'unread'} {notification.link
              ? 'clickable'
              : ''}"
            onclick={() => handleNotificationClick(notification)}
            onkeydown={e => handleKeyDown(e, notification)}
            role="button"
            tabindex="0"
          >
            <div class="notification-icon text-base">
              {getIcon(notification.type)}
            </div>
            <div class="notification-body flex-1 flex flex-col gap-1.5 min-w-0">
              <div class="notification-header-row flex items-center justify-between gap-2">
                <span
                  class="notification-title text-xs font-semibold text-[var(--text-heading)] font-sans"
                  >{notification.title}</span
                >
                <span
                  class="notification-time text-[11px] text-[var(--muted)] flex-shrink-0 font-mono"
                  >{formatTime(notification.timestamp)}</span
                >
              </div>
              <div
                class="notification-message text-xs text-[var(--muted)] leading-normal font-sans"
              >
                {notification.message}
              </div>
            </div>
            <div class="notification-actions flex gap-1 flex-shrink-0">
              <button
                class="btn-copy p-1 bg-transparent text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--accent)] rounded transition-all border-0 cursor-pointer flex items-center justify-center"
                onclick={e => {
                  e.stopPropagation();
                  copyNotification(notification);
                }}
                title="Copy notification"
              >
                {#if copiedId === notification.id}
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                {:else}
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                {/if}
              </button>
              <button
                class="btn-remove p-1 bg-transparent text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--error)] rounded transition-all border-0 cursor-pointer flex items-center justify-center"
                onclick={e => {
                  e.stopPropagation();
                  notificationHistory.clear(notification.id);
                }}
                title="Remove notification"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
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
    padding: 1rem 1.25rem;
    background: var(--surface-2);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .filter-tab {
    padding: 0.375rem 0.75rem;
    background: var(--surface-2);
    color: var(--muted);
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s;
    font-family: var(--sans);
  }

  .filter-tab:hover {
    background: var(--bg);
    color: var(--text);
  }

  .filter-tab.active {
    background: var(--accent);
    color: #ffffff;
    border-color: var(--accent);
  }

  .notification-card {
    display: flex;
    gap: 0.75rem;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-left: 3px solid var(--border);
    border-radius: 6px;
    padding: 0.75rem;
    cursor: default;
    transition: all 0.15s;
  }

  .notification-card.unread {
    border-left-color: var(--accent);
    background: var(--surface);
  }

  .notification-card:hover {
    border-color: var(--accent);
  }

  .notification-card.clickable {
    cursor: pointer;
  }

  .notification-card.clickable:hover {
    transform: translateX(-2px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  }

  @media (max-width: 768px) {
    .notification-panel {
      width: 100vw;
    }
  }
</style>
