<script>
  import { createEventDispatcher } from 'svelte';
  import { fade, scale } from 'svelte/transition';

  export let show = false;
  export let title = 'Confirm Action';
  export let message = 'Are you sure you want to proceed?';
  export let confirmText = 'Confirm';
  export let cancelText = 'Cancel';
  export let type = 'warning'; // 'info', 'warning', 'danger'

  const dispatch = createEventDispatcher();

  function handleConfirm() {
    dispatch('confirm');
    show = false;
  }

  function handleCancel() {
    dispatch('cancel');
    show = false;
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      handleCancel();
    }
  }

  function getIcon() {
    switch (type) {
      case 'danger':
        return '⚠️';
      case 'warning':
        return '⚡';
      case 'info':
        return 'ℹ️';
      default:
        return '❓';
    }
  }
</script>

{#if show}
  <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
  <div
    class="dialog-overlay"
    on:click={handleCancel}
    on:keydown={handleKeyDown}
    transition:fade={{ duration: 200 }}
    role="dialog"
    aria-modal="true"
    aria-labelledby="dialog-title"
    aria-describedby="dialog-message"
    tabindex="-1"
  >
    <div
      class="dialog-content dialog-{type}"
      on:click|stopPropagation
      on:keydown|stopPropagation
      transition:scale={{ duration: 200, start: 0.9 }}
      role="document"
    >
      <div class="dialog-header">
        <span class="dialog-icon" aria-hidden="true">{getIcon()}</span>
        <h3 id="dialog-title" class="dialog-title">{title}</h3>
      </div>

      <div id="dialog-message" class="dialog-body">
        {message}
      </div>

      <div class="dialog-footer" role="group" aria-label="Dialog actions">
        <button
          class="btn btn-secondary"
          on:click={handleCancel}
          tabindex="0"
          aria-label="Cancel and close dialog"
        >
          {cancelText}
        </button>
        <button
          class="btn {type === 'danger' ? 'btn-danger' : 'btn-primary'}"
          on:click={handleConfirm}
          tabindex="0"
          autofocus
          aria-label="Confirm action"
        >
          {confirmText}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .dialog-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    -webkit-backdrop-filter: blur(2px);
    backdrop-filter: blur(2px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    padding: var(--space-2xl);
  }

  .dialog-content {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    max-width: 400px;
    width: 100%;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    overflow: hidden;
  }

  .dialog-header {
    display: flex;
    align-items: center;
    gap: var(--space-xl);
    padding: var(--space-lg) var(--space-3xl);
    border-bottom: 1px solid var(--border);
    background: var(--surface-2);
  }

  .dialog-icon {
    font-size: 11px;
  }

  .dialog-title {
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 600;
    color: var(--text);
    margin: 0;
  }

  .dialog-body {
    padding: var(--space-lg);
    font-family: var(--mono);
    font-size: 13px;
    color: var(--text);
    line-height: 1.6;
  }

  .dialog-footer {
    display: flex;
    gap: var(--space-xl);
    padding: var(--space-lg) var(--space-xl);
    border-top: 1px solid var(--border);
    background: var(--bg);
    justify-content: flex-end;
  }

  /* Button styles removed - now using global .btn classes */

  /* Type-specific styling */
  .dialog-danger {
    border-top: 3px solid var(--error);
  }

  .dialog-warning {
    border-top: 3px solid var(--warning);
  }

  .dialog-info {
    border-top: 3px solid var(--info);
  }

  /* Alive feeling - subtle animation */
  @keyframes dialogPulse {
    0% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.01);
    }
    100% {
      transform: scale(1);
    }
  }

  .dialog-content {
    animation: dialogPulse 0.3s ease-out;
  }
</style>
