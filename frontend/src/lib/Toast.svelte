<script>
  import { notifications } from './stores/notifications.js';
  import { fly } from 'svelte/transition';

  function getIcon(type) {
    switch(type) {
      case 'success': return '✓';
      case 'error': return '✕';
      case 'warning': return '⚠';
      case 'info': return 'ℹ';
      default: return 'ℹ';
    }
  }
</script>

<div class="toast-container" aria-live="polite" aria-atomic="true">
  {#each $notifications as notification (notification.id)}
    <div
      class="toast toast-{notification.type}"
      transition:fly={{ y: -30, duration: 300 }}
      role="alert"
    >
      <span class="toast-icon">{getIcon(notification.type)}</span>
      <span class="toast-message">{notification.message}</span>
      <button
        class="toast-close"
        on:click={() => notifications.remove(notification.id)}
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
</style>
