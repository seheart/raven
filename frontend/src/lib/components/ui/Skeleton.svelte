<script>
  /**
   * Skeleton Component - Raven UI Library
   * Loading placeholder with pulse animation
   *
   * @component
   * @example
   * <Skeleton variant="text" />
   * <Skeleton variant="circle" size="lg" />
   */

  let {
    /** Variant shape */
    variant = 'text', // 'text' | 'circle' | 'rect' | 'card'
    /** Size */
    size = 'md', // 'sm' | 'md' | 'lg' | 'xl'
    /** Custom width */
    width = undefined,
    /** Custom height */
    height = undefined,
    /** Number of lines (for text variant) */
    lines = 1,
    /** Additional CSS classes */
    class: className = '',
    ...restProps
  } = $props();

  // Variant shapes
  const variants = {
    text: 'rounded',
    circle: 'rounded-full',
    rect: 'rounded-lg',
    card: 'rounded-lg'
  };

  // Size presets
  const sizes = {
    sm: { width: 'w-16', height: 'h-3' },
    md: { width: 'w-24', height: 'h-4' },
    lg: { width: 'w-32', height: 'h-5' },
    xl: { width: 'w-48', height: 'h-6' }
  };

  const circleSizes = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
    xl: 'w-24 h-24'
  };

  const cardSizes = {
    sm: 'h-32',
    md: 'h-48',
    lg: 'h-64',
    xl: 'h-96'
  };

  // Base classes
  const baseClasses = 'bg-[var(--surface-2)] animate-pulse';

  // Get dimension classes
  const dimensionClasses = $derived.by(() => {
    if (width || height) {
      return '';
    }
    if (variant === 'circle') return circleSizes[size];
    if (variant === 'card') return `w-full ${cardSizes[size]}`;
    return `${sizes[size].width} ${sizes[size].height}`;
  });

  const skeletonClasses = $derived(`${baseClasses} ${variants[variant]} ${dimensionClasses} ${className}`);

  // Inline style for custom dimensions
  const style = $derived(
    width || height
      ? `${width ? `width: ${width};` : ''} ${height ? `height: ${height};` : ''}`
      : undefined);
</script>

{#if variant === 'text' && lines > 1}
  <div class="space-y-2" {...restProps}>
    {#each Array(lines) as _, i (i)}
      <div class={skeletonClasses} {style}></div>
    {/each}
  </div>
{:else}
  <div class={skeletonClasses} {style} {...restProps}></div>
{/if}
