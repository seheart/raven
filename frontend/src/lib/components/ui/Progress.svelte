<script>
  /**
   * Progress Component - Raven UI Library
   * A progress bar with percentage display
   *
   * @component
   * @example
   * <Progress value={75} variant="success" showValue={true} />
   */

  import { buildProgressClasses, cx } from '$lib/utils/classBuilder.js';

  let {
    /** Progress value (0-100) */
    value = 0,
    /** Color variant */
    variant = 'primary', // 'primary' | 'success' | 'error' | 'warning' | 'info'
    /** Size variant */
    size = 'md', // 'sm' | 'md' | 'lg'
    /** Show percentage value */
    showValue = false,
    /** Indeterminate/loading state */
    indeterminate = false,
    /** Additional CSS classes */
    class: className = '',
    ...restProps
  } = $props();

  // Clamp value between 0 and 100
  const clampedValue = $derived(Math.min(100, Math.max(0, value)));

  // Size variants for track
  const sizes = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3'
  };

  // Track classes
  const trackClasses = $derived(
    cx('w-full bg-[var(--surface-2)] rounded-full overflow-hidden', sizes[size], className)
  );

  // Bar classes using shared utility
  const barClasses = $derived(
    cx(
      'h-full',
      buildProgressClasses({ variant, size, className: '' }),
      indeterminate ? 'animate-pulse' : ''
    )
  );
</script>

<div {...restProps}>
  <div
    class={trackClasses}
    role="progressbar"
    aria-valuenow={clampedValue}
    aria-valuemin="0"
    aria-valuemax="100"
  >
    <div class={barClasses} style="width: {indeterminate ? '100%' : `${clampedValue}%`}"></div>
  </div>
  {#if showValue && !indeterminate}
    <div class="text-xs text-[var(--muted)] mt-1 font-sans text-right">
      {clampedValue}%
    </div>
  {/if}
</div>
