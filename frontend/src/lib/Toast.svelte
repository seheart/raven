<script>
  import { notifications } from './stores/notifications.js';
  import { fly } from 'svelte/transition';

  export let onErrorClick = null;

  function getIcon(type) {
    switch(type) {
    case 'success': return '✓';
    case 'error': return '✕';
    case 'warning': return '⚠';
    case 'info': return 'ℹ';
    default: return 'ℹ';
    }
  }

  function handleToastClick(notification) {
    // Allow clicking on errors and warnings to view details
    if ((notification.type === 'error' || notification.type === 'warning') && onErrorClick) {
      onErrorClick(notification);
      // Dismiss the notification after click
      notifications.remove(notification.id);
    }
  }
</script>

<div class="toast-container" role="region" aria-live="polite" aria-atomic="true" aria-label="Notifications">
  {#each $notifications as notification (notification.id)}
    <div
      class="toast toast-{notification.type}"
      class:clickable={notification.type === 'error' || notification.type === 'warning'}
      transition:fly={{ y: -30, duration: 300 }}
      role="alert"
      title={notification.type === 'error' || notification.type === 'warning' ? 'Click to view details in Error Log' : ''}
    >
      <span class="toast-icon" aria-hidden="true">{getIcon(notification.type)}</span>
      <span class="toast-message">{notification.message}</span>
      {#if notification.type === 'error' || notification.type === 'warning'}
        <button
          class="toast-action"
          on:click={(e) => (e.stopPropagation(), handleToastClick(notification))}
          aria-label="View error details"
        >
          View details
        </button>
      {/if}
      <button
        class="toast-close"
        on:click|stopPropagation={() => notifications.remove(notification.id)}
        aria-label="Close notification"
      >
        ×
      </button>
    </div>
  {/each}
</div>

<style>
  .toast-container {
    position: fixed;
    top: 50px;
    right: 20px;
    z-index: 10000;
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 400px;
    pointer-events: none;
  }

  .toast {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 10px;
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    pointer-events: all;
    min-width: 300px;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .toast.clickable {
    cursor: pointer;
  }

  .toast.clickable:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
  }

  .toast.clickable:focus {
    outline: 2px solid currentColor;
    outline-offset: 2px;
  }

  .toast-success {
    border-left: 3px solid var(--success);
    background: color-mix(in srgb, var(--success) 10%, var(--surface));
    color: var(--text);
  }

  .toast-error {
    border-left: 3px solid var(--error);
    background: color-mix(in srgb, var(--error) 10%, var(--surface));
    color: var(--text);
  }

  .toast-warning {
    border-left: 3px solid var(--warning);
    background: color-mix(in srgb, var(--warning) 10%, var(--surface));
    color: var(--text);
  }

  .toast-info {
    border-left: 3px solid var(--info);
    background: color-mix(in srgb, var(--info) 10%, var(--surface));
    color: var(--text);
  }

  .toast-icon {
    font-size: 12px;
    font-weight: bold;
    flex-shrink: 0;
  }

  .toast-message {
    flex: 1;
    font-size: 11px;
    font-weight: 500;
  }

  .toast-action {
    padding: 4px 8px;
    background: var(--accent);
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    transition: all 0.2s;
  }

  .toast-action:hover {
    background: var(--accent-2);
    transform: scale(1.05);
  }

  .toast-close {
    background: none;
    border: none;
    font-size: 13px;
    color: currentColor;
    cursor: pointer;
    opacity: 0.6;
    transition: opacity 0.2s;
    padding: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .toast-close:hover {
    opacity: 1;
  }

  .toast-close:focus {
    outline: 2px solid currentColor;
    outline-offset: 2px;
    border-radius: 4px;
  }

  .toast-hint {
    font-size: 11px;
    opacity: 0.7;
    font-style: italic;
    white-space: nowrap;
  }
</style>
