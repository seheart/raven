<script>
  /**
   * Divider Component - Raven UI Library
   * Horizontal or vertical line separator
   *
   * @component
   * @example
   * <Divider />
   * <Divider orientation="vertical" />
   */

  let {
    /** Orientation */
    orientation = 'horizontal', // 'horizontal' | 'vertical'
    /** Text label */
    label = '',
    /** Label position */
    labelPosition = 'center', // 'left' | 'center' | 'right'
    /** Additional CSS classes */
    class: className = '',
    ...restProps
  } = $props();

  // Orientation classes
  const orientationClasses = orientation === 'horizontal' ? 'w-full h-px' : 'w-px h-full';

  // Base classes
  const baseClasses = `bg-[var(--border)] ${orientationClasses}`;

  // Label alignment
  const labelAlignments = {
    left: 'justify-start',
    center: 'justify-center',
    right: 'justify-end'
  };
</script>

{#if label && orientation === 'horizontal'}
  <div class="flex items-center gap-4 {labelAlignments[labelPosition]} {className}" {...restProps}>
    {#if labelPosition === 'center' || labelPosition === 'right'}
      <div class={baseClasses}></div>
    {/if}
    <span class="text-sm text-[var(--muted)] font-sans whitespace-nowrap">{label}</span>
    {#if labelPosition === 'center' || labelPosition === 'left'}
      <div class={baseClasses}></div>
    {/if}
  </div>
{:else}
  <div class="{baseClasses} {className}" {...restProps}></div>
{/if}
