<script>
  import { toasts } from './toastStore.js';
  import { fade, fly } from 'svelte/transition';
  import { flip } from 'svelte/animate';

  function getIcon(type) {
    switch(type) {
    case 'success': return '✅';
    case 'error': return '❌';
    case 'warning': return '⚠️';
    case 'info': return 'ℹ️';
    default: return '💬';
    }
  }

  function dismiss(id) {
    toasts.dismiss(id);
  }
</script>

<div class="toast-container" role="region" aria-live="polite" aria-atomic="true" aria-label="Notifications">
  {#each $toasts as toast (toast.id)}
    <div
      class="toast toast-{toast.type}"
      animate:flip={{ duration: 200 }}
      in:fly={{ x: 300, duration: 200 }}
      out:fade={{ duration: 150 }}
      role="alert"
      aria-live="assertive"
    >
      <span class="toast-icon" aria-hidden="true">{getIcon(toast.type)}</span>
      <span class="toast-message">{toast.message}</span>
      <button
        class="toast-close"
        on:click={() => dismiss(toast.id)}
        aria-label="Close {toast.type} notification"
        tabindex="0"
      >
        ×
      </button>
    </div>
  {/each}
</div>

<style>
  .toast-container {
    position: fixed;
    top: 80px;
    right: 16px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    pointer-events: none;
    max-width: 400px;
  }

  .toast {
    display: flex;
    align-items: center;
    gap: var(--space-xl);
    padding: var(--space-md) var(--space-lg);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font-family: var(--sans);
    font-size: 13px;
    color: var(--text);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    pointer-events: auto;
    position: relative;
    animation: slideIn 0.2s ease-out;
  }

  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  .toast-success {
    border-left: 3px solid var(--success);
    background: color-mix(in srgb, var(--success) 5%, var(--surface));
  }

  .toast-error {
    border-left: 3px solid var(--error);
    background: color-mix(in srgb, var(--error) 5%, var(--surface));
  }

  .toast-warning {
    border-left: 3px solid var(--warning);
    background: color-mix(in srgb, var(--warning) 5%, var(--surface));
  }

  .toast-info {
    border-left: 3px solid var(--info);
    background: color-mix(in srgb, var(--info) 5%, var(--surface));
  }

  .toast-icon {
    font-size: 12px;
    flex-shrink: 0;
  }

  .toast-message {
    flex: 1;
    line-height: 1.4;
  }

  .toast-close {
    background: none;
    border: none;
    color: var(--muted);
    font-size: 11px;
    line-height: 1;
    cursor: pointer;
    padding: 0;
    width: var(--icon-md);
    height: var(--icon-md);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius);
    transition: all var(--duration-base) var(--ease-smooth);
    flex-shrink: 0;
  }

  .toast-close:hover {
    background: var(--surface-2);
    color: var(--text);
  }

  .toast-close:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  /* Responsive */
  @media (max-width: 480px) {
    .toast-container {
      left: 16px;
      right: 16px;
      max-width: none;
    }
  }

  /* Alive feeling - subtle pulse on appear */
  @keyframes gentlePulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.02); }
    100% { transform: scale(1); }
  }

  .toast {
    animation: slideIn 0.2s ease-out, gentlePulse 0.4s ease-out;
  }
</style>
