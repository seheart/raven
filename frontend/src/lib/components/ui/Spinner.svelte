<script>
  /**
   * Spinner Component - Raven UI Library
   * A loading spinner with multiple styles and sizes
   *
   * @component
   * @example
   * <Spinner size="lg" variant="primary" />
   */

  import { buildSpinnerClasses } from '$lib/utils/classBuilder.js';

  let {
    /** Size variant */
    size = 'md', // 'sm' | 'md' | 'lg' | 'xl'
    /** Color variant */
    variant = 'primary', // 'primary' | 'success' | 'error' | 'warning' | 'muted'
    /** Loading text */
    text = '',
    /** Additional CSS classes */
    class: className = '',
    ...restProps
  } = $props();

  // Build spinner classes using shared utility
  const spinnerClasses = $derived(buildSpinnerClasses({ variant, size, className }));

  // Container classes
  const containerClasses = 'inline-flex items-center gap-3 font-sans';
</script>

<div class={containerClasses} {...restProps}>
  <div class={spinnerClasses} role="status" aria-label="Loading"></div>
  {#if text}
    <span class="text-sm text-[var(--muted)]">{text}</span>
  {/if}
</div>
