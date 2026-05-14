<!-- design-system-skip: infrastructure component, not a user-facing primitive -->
<script>
  import { toasts } from '../../toastStore.js';
  import { fly } from 'svelte/transition';
  import { flip } from 'svelte/animate';

  function getToastStyles(type) {
    switch (type) {
      case 'success':
        return 'bg-[var(--success)] text-white border-[var(--success)]';
      case 'error':
        return 'bg-[var(--error)] text-white border-[var(--error)]';
      case 'warning':
        return 'bg-[var(--warning)] text-white border-[var(--warning)]';
      case 'info':
      default:
        return 'bg-[var(--accent)] text-canvas border-[var(--accent)]';
    }
  }

  function getToastIcon(type) {
    switch (type) {
      case 'success':
        return '';
      case 'error':
        return '';
      case 'warning':
        return '';
      case 'info':
      default:
        return '';
    }
  }
</script>

<!-- Toast container fixed at bottom-right -->
<div
  class="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none"
  role="status"
  aria-live="polite"
  aria-atomic="false"
>
  {#each $toasts as toast (toast.id)}
    <div
      class="pointer-events-auto min-w-[300px] max-w-[28rem] rounded-lg border-2 shadow-lg px-4 py-3 flex items-start gap-3 {getToastStyles(
        toast.type
      )}"
      role={toast.type === 'error' ? 'alert' : 'status'}
      aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
      transition:fly={{ y: 50, duration: 200 }}
      animate:flip={{ duration: 200 }}
    >
      <!-- Icon -->
      <div class="flex-shrink-0 text-xl font-bold">
        {getToastIcon(toast.type)}
      </div>

      <!-- Message -->
      <div class="flex-1 text-sm font-medium">
        {toast.message}
      </div>

      <!-- Close button -->
      <button
        class="flex-shrink-0 hover:opacity-70 transition-opacity text-lg font-bold px-2 py-1 -mr-1 -my-1"
        onclick={() => toasts.dismiss(toast.id)}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  {/each}
</div>
