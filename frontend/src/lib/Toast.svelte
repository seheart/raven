<script>
  import { toasts } from './toastStore.js';
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

  function handleToastClick(toast) {
    // Allow clicking on errors and warnings to view details
    if ((toast.type === 'error' || toast.type === 'warning') && onErrorClick) {
      onErrorClick(toast);
      // Dismiss the toast after click
      toasts.dismiss(toast.id);
    }
  }
</script>

<div class="toast-container" role="region" aria-live="polite" aria-atomic="true" aria-label="Notifications">
  {#each $toasts as toast (toast.id)}
    <div
      class="toast toast-{toast.type}"
      class:clickable={toast.type === 'error' || toast.type === 'warning'}
      transition:fly={{ y: -30, duration: 300 }}
      role="alert"
      title={toast.type === 'error' || toast.type === 'warning' ? 'Click to view details in Error Log' : ''}
    >
      <span class="toast-icon" aria-hidden="true">{getIcon(toast.type)}</span>
      <span class="toast-message">{toast.message}</span>
      {#if toast.type === 'error' || toast.type === 'warning'}
        <button
          class="toast-action"
          on:click={(e) => (e.stopPropagation(), handleToastClick(toast))}
          aria-label="View error details"
        >
          View details
        </button>
      {/if}
      <button
        class="toast-close"
        on:click|stopPropagation={() => toasts.dismiss(toast.id)}
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
    z-index: 99999;
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
    max-width: 400px;
    pointer-events: none;
  }

  .toast {
    display: flex;
    align-items: center;
    gap: var(--space-xl);
    padding: var(--space-md) var(--space-lg);
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: var(--radius);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    pointer-events: all;
    min-width: 300px;
    transition: transform var(--duration-base) var(--ease-smooth), box-shadow var(--duration-base) var(--ease-smooth);
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
    padding: var(--space-sm) var(--space-lg);
    background: var(--accent);
    color: white;
    border: none;
    border-radius: var(--radius);
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    transition: all var(--duration-base) var(--ease-smooth);
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
    transition: opacity var(--duration-base) var(--ease-smooth);
    padding: 0;
    width: var(--icon-md);
    height: var(--icon-md);
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
    border-radius: var(--radius);
  }

  .toast-hint {
    font-size: 11px;
    opacity: 0.7;
    font-style: italic;
    white-space: nowrap;
  }
</style>
