<script>
  /**
   * Modal Component - Raven UI Library
   * A dialog/popup overlay with backdrop, animations, and accessibility
   *
   * @component
   * @example
   * <Modal bind:open={showModal} title="Confirm Action">
   *   <p>Are you sure you want to continue?</p>
   *   <div slot="footer">
   *     <Button onclick={() => showModal = false}>Cancel</Button>
   *     <Button variant="primary" onclick={handleConfirm}>Confirm</Button>
   *   </div>
   * </Modal>
   */

  import SVGIcon from './SVGIcon.svelte';

  let {
    /** Open state (bindable) */
    open = $bindable(false),
    /** Modal title */
    title = '',
    /** Size variant */
    size = 'md', // 'sm' | 'md' | 'lg' | 'xl' | 'full'
    /** Close on backdrop click */
    closeOnBackdrop = true,
    /** Close on escape key */
    closeOnEscape = true,
    /** Show close button */
    showClose = true,
    /** Prevent scroll on body when open */
    preventScroll = true,
    /** Additional CSS classes */
    class: className = '',
    /** On close callback */
    onClose = undefined,
    children,
    footer,
    ...restProps
  } = $props();

  // Size variants
  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    full: 'max-w-full mx-4'
  };

  // Handle escape key
  function handleKeydown(e) {
    if (closeOnEscape && e.key === 'Escape' && open) {
      closeModal();
    }
  }

  // Handle backdrop click
  function handleBackdropClick(e) {
    if (closeOnBackdrop && e.target === e.currentTarget) {
      closeModal();
    }
  }

  // Close modal
  function closeModal() {
    open = false;
    onClose?.();
  }

  // Body scroll lock
  $effect(() => {
    if (preventScroll && open) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  });

  // Backdrop classes
  const backdropClasses =
    'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 transition-opacity duration-200';

  // Modal classes
  const modalBaseClasses =
    'bg-[var(--surface)] rounded-lg shadow-xl transform transition-all duration-200 w-full';
  const modalClasses = `${modalBaseClasses} ${sizes[size]} ${className}`;

  // Header classes
  const headerClasses =
    'flex items-center justify-between px-6 py-4 border-b border-[var(--border)]';

  // Body classes
  const bodyClasses = 'px-6 py-4 text-[var(--text)] font-sans';

  // Footer classes
  const footerClasses =
    'px-6 py-4 border-t border-[var(--border)] flex items-center justify-end gap-3';
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <!-- Backdrop -->
  <div
    class={backdropClasses}
    onclick={handleBackdropClick}
    onkeydown={e => e.key === 'Escape' && handleBackdropClick()}
    role="dialog"
    aria-modal="true"
    aria-labelledby={title ? 'modal-title' : undefined}
    tabindex="-1"
  >
    <!-- Modal Container -->
    <div class={modalClasses} {...restProps}>
      <!-- Header -->
      {#if title || showClose}
        <div class={headerClasses}>
          {#if title}
            <h2 id="modal-title" class="text-xl font-semibold text-[var(--text-heading)] font-sans">
              {title}
            </h2>
          {:else}
            <div></div>
          {/if}

          {#if showClose}
            <button
              type="button"
              onclick={closeModal}
              class="text-[var(--muted)] hover:text-[var(--text)] transition-colors duration-150 p-1 rounded hover:bg-[var(--surface-2)]"
              aria-label="Close modal"
            >
              <SVGIcon type="close" size="w-5 h-5" />
            </button>
          {/if}
        </div>
      {/if}

      <!-- Body -->
      <div class={bodyClasses}>
        {@render children?.()}
      </div>

      <!-- Footer -->
      {#if footer}
        <div class={footerClasses}>
          {@render footer?.()}
        </div>
      {/if}
    </div>
  </div>
{/if}
