<script>
  /**
   * Toast Component - Raven UI Library
   * A notification/alert message with auto-dismiss and positioning
   *
   * @component
   * @example
   * <Toast
   *   bind:show={showToast}
   *   variant="success"
   *   message="Changes saved successfully!"
   *   duration={3000}
   * />
   */

  import SVGIcon from './SVGIcon.svelte';

  let {
    /** Show state (bindable) */
    show = $bindable(false),
    /** Toast message */
    message = '',
    /** Variant style */
    variant = 'default', // 'default' | 'success' | 'error' | 'warning' | 'info'
    /** Position on screen */
    position = 'top-right', // 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right'
    /** Auto-dismiss duration (ms), 0 = no auto-dismiss */
    duration = 3000,
    /** Show close button */
    showClose = true,
    /** Icon to display */
    icon = undefined,
    /** Additional CSS classes */
    class: className = '',
    /** On close callback */
    onClose = undefined,
    children,
    ...restProps
  } = $props();

  let timeoutId = $state(null);

  // Auto-dismiss timer
  $effect(() => {
    if (show && duration > 0) {
      timeoutId = setTimeout(() => {
        closeToast();
      }, duration);

      return () => {
        if (timeoutId) clearTimeout(timeoutId);
      };
    }
  });

  // Close toast
  function closeToast() {
    show = false;
    onClose?.();
  }

  // Position variants
  const positions = {
    'top-left': 'top-4 left-4',
    'top-center': 'top-4 left-1/2 -translate-x-1/2',
    'top-right': 'top-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2',
    'bottom-right': 'bottom-4 right-4'
  };

  // Variant styles
  const variants = {
    default: {
      bg: 'bg-[var(--surface)]',
      border: 'border-[var(--border)]',
      text: 'text-[var(--text)]',
      icon: 'ℹ️'
    },
    success: {
      bg: 'bg-[var(--success)]',
      border: 'border-[var(--success)]',
      text: 'text-white',
      icon: '✓'
    },
    error: {
      bg: 'bg-[var(--error)]',
      border: 'border-[var(--error)]',
      text: 'text-white',
      icon: '✕'
    },
    warning: {
      bg: 'bg-[var(--warning)]',
      border: 'border-[var(--warning)]',
      text: 'text-white',
      icon: '⚠'
    },
    info: {
      bg: 'bg-[var(--info)]',
      border: 'border-[var(--info)]',
      text: 'text-white',
      icon: 'ℹ'
    }
  };

  const currentVariant = $derived(variants[variant]);
  const displayIcon = $derived(icon ?? currentVariant.icon);

  // Toast classes
  const toastBaseClasses =
    'fixed z-50 flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg transform transition-all duration-300 min-w-[300px] max-w-md font-sans';
  const toastClasses = `${toastBaseClasses} ${positions[position]} ${currentVariant.bg} ${currentVariant.border} ${currentVariant.text} ${className}`;
</script>

{#if show}
  <div class={toastClasses} role="alert" aria-live="polite" {...restProps}>
    <!-- Icon -->
    {#if displayIcon}
      <div class="flex-shrink-0 text-lg" aria-hidden="true">
        {displayIcon}
      </div>
    {/if}

    <!-- Content -->
    <div class="flex-1">
      {#if message}
        <p class="text-sm font-medium">{message}</p>
      {:else}
        {@render children?.()}
      {/if}
    </div>

    <!-- Close Button -->
    {#if showClose}
      <button
        type="button"
        onclick={closeToast}
        class="flex-shrink-0 p-1 rounded hover:bg-black hover:bg-opacity-10 transition-colors duration-150"
        aria-label="Close notification"
      >
        <SVGIcon type="close" size="w-4 h-4" />
      </button>
    {/if}
  </div>
{/if}
