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
    switch(type) {
    case 'danger': return '⚠️';
    case 'warning': return '⚡';
    case 'info': return 'ℹ️';
    default: return '❓';
    }
  }
</script>

{#if show}
  <div
    class="dialog-overlay"
    on:click={handleCancel}
    on:keydown={handleKeyDown}
    transition:fade={{ duration: 200 }}
    role="dialog"
    aria-modal="true"
    aria-labelledby="dialog-title"
    aria-describedby="dialog-message"
  >
    <div
      class="dialog-content dialog-{type}"
      on:click|stopPropagation
      transition:scale={{ duration: 200, start: 0.9 }}
    >
      <div class="dialog-header">
        <span class="dialog-icon" aria-hidden="true">{getIcon()}</span>
        <h3 id="dialog-title" class="dialog-title">{title}</h3>
      </div>

      <div id="dialog-message" class="dialog-body">
        {message}
      </div>

      <div class="dialog-footer">
        <button
          class="btn btn-cancel"
          on:click={handleCancel}
          tabindex="0"
        >
          {cancelText}
        </button>
        <button
          class="btn btn-confirm btn-{type}"
          on:click={handleConfirm}
          tabindex="0"
          autofocus
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
    padding: 16px;
  }

  .dialog-content {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    max-width: 400px;
    width: 100%;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    overflow: hidden;
  }

  .dialog-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 20px 24px;
    border-bottom: 1px solid var(--border);
    background: var(--surface-2);
  }

  .dialog-icon {
    font-size: 24px;
  }

  .dialog-title {
    font-family: var(--mono);
    font-size: 16px;
    font-weight: 600;
    color: var(--text);
    margin: 0;
  }

  .dialog-body {
    padding: 24px;
    font-family: var(--mono);
    font-size: 13px;
    color: var(--text);
    line-height: 1.6;
  }

  .dialog-footer {
    display: flex;
    gap: 12px;
    padding: 16px 24px;
    border-top: 1px solid var(--border);
    background: var(--bg);
    justify-content: flex-end;
  }

  .btn {
    padding: 10px 20px;
    font-family: var(--mono);
    font-size: 13px;
    font-weight: 600;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
    border: none;
    outline: none;
  }

  .btn:focus {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 30%, transparent);
  }

  .btn-cancel {
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
  }

  .btn-cancel:hover {
    background: var(--surface-2);
    transform: translateY(-1px);
  }

  .btn-confirm {
    color: white;
  }

  .btn-info {
    background: var(--info);
  }

  .btn-info:hover {
    background: color-mix(in srgb, var(--info) 80%, black);
  }

  .btn-warning {
    background: var(--warning);
  }

  .btn-warning:hover {
    background: color-mix(in srgb, var(--warning) 80%, black);
  }

  .btn-danger {
    background: var(--error);
  }

  .btn-danger:hover {
    background: color-mix(in srgb, var(--error) 80%, black);
  }

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
    0% { transform: scale(1); }
    50% { transform: scale(1.01); }
    100% { transform: scale(1); }
  }

  .dialog-content {
    animation: dialogPulse 0.3s ease-out;
  }
</style>
