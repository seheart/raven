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
      console.log('Toast clicked, navigating to Error Log:', notification.message);
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
      on:click={() => handleToastClick(notification)}
      on:keydown={(e) => e.key === 'Enter' && handleToastClick(notification)}
      tabindex={notification.type === 'error' || notification.type === 'warning' ? '0' : '-1'}
      title={notification.type === 'error' || notification.type === 'warning' ? 'Click to view details in Error Log' : ''}
    >
      <span class="toast-icon" aria-hidden="true">{getIcon(notification.type)}</span>
      <span class="toast-message">{notification.message}</span>
      {#if notification.type === 'error' || notification.type === 'warning'}
        <span class="toast-hint" aria-hidden="true">Click for details →</span>
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
    top: 20px;
    right: 20px;
    z-index: 9999;
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
    padding: 12px 16px;
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: 8px;
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
    border-color: #10b981;
    background: #d1fae5;
    color: #065f46;
  }

  .toast-error {
    border-color: #ef4444;
    background: #fee2e2;
    color: #991b1b;
  }

  .toast-warning {
    border-color: #f59e0b;
    background: #fef3c7;
    color: #92400e;
  }

  .toast-info {
    border-color: #3b82f6;
    background: #dbeafe;
    color: #1e40af;
  }

  .toast-icon {
    font-size: 18px;
    font-weight: bold;
    flex-shrink: 0;
  }

  .toast-message {
    flex: 1;
    font-size: 14px;
    font-weight: 500;
  }

  .toast-close {
    background: none;
    border: none;
    font-size: 20px;
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
