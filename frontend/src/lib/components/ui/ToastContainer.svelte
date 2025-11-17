<script>
  import { toasts } from '../../toastStore.js';
  import { fly } from 'svelte/transition';
  import { flip } from 'svelte/animate';

  function getToastStyles(type) {
    switch (type) {
      case 'success':
        return 'bg-green-500 text-white border-green-600';
      case 'error':
        return 'bg-red-500 text-white border-red-600';
      case 'warning':
        return 'bg-yellow-500 text-white border-yellow-600';
      case 'info':
      default:
        return 'bg-blue-500 text-white border-blue-600';
    }
  }

  function getToastIcon(type) {
    switch (type) {
      case 'success':
        return '✓';
      case 'error':
        return '✕';
      case 'warning':
        return '⚠';
      case 'info':
      default:
        return 'ℹ';
    }
  }
</script>

<!-- Toast container fixed at bottom-right -->
<div class="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
  {#each $toasts as toast (toast.id)}
    <div
      class="pointer-events-auto min-w-[300px] max-w-md rounded-lg border-2 shadow-lg px-4 py-3 flex items-start gap-3 {getToastStyles(
        toast.type
      )}"
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
        class="flex-shrink-0 hover:opacity-70 transition-opacity text-lg font-bold"
        onclick={() => toasts.dismiss(toast.id)}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  {/each}
</div>
