<script>
  /**
   * Tooltip Component - Raven UI Library
   * A hover tooltip with positioning and animations
   *
   * @component
   * @example
   * <Tooltip text="Click to edit" position="top">
   *   <Button>Edit</Button>
   * </Tooltip>
   */

  let {
    /** Tooltip text */
    text = '',
    /** Position relative to trigger */
    position = 'top', // 'top' | 'bottom' | 'left' | 'right'
    /** Delay before showing (ms) */
    delay = 200,
    /** Variant style */
    variant = 'dark', // 'dark' | 'light'
    /** Additional CSS classes */
    class: className = '',
    children,
    ...restProps
  } = $props();

  let showTooltip = $state(false);
  let timeoutId = $state(null);

  // Show tooltip with delay
  function handleMouseEnter() {
    timeoutId = setTimeout(() => {
      showTooltip = true;
    }, delay);
  }

  // Hide tooltip immediately
  function handleMouseLeave() {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    showTooltip = false;
  }

  // Position variants
  const positions = {
    top: {
      tooltip: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
      arrow:
        'top-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent'
    },
    bottom: {
      tooltip: 'top-full left-1/2 -translate-x-1/2 mt-2',
      arrow:
        'bottom-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent'
    },
    left: {
      tooltip: 'right-full top-1/2 -translate-y-1/2 mr-2',
      arrow:
        'left-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent'
    },
    right: {
      tooltip: 'left-full top-1/2 -translate-y-1/2 ml-2',
      arrow:
        'right-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent'
    }
  };

  // Variant styles
  const variants = {
    dark: {
      bg: 'bg-[var(--text)] bg-opacity-90',
      text: 'text-white',
      arrow: 'border-[var(--text)]'
    },
    light: {
      bg: 'bg-white',
      text: 'text-[var(--text)]',
      arrow: 'border-white',
      shadow: 'shadow-lg'
    }
  };

  const currentVariant = $derived(variants[variant]);
  const currentPosition = $derived(positions[position]);

  // Tooltip classes
  const tooltipBaseClasses =
    'absolute z-50 px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap pointer-events-none transition-opacity duration-150 font-sans';
  const tooltipClasses = `${tooltipBaseClasses} ${currentPosition.tooltip} ${currentVariant.bg} ${currentVariant.text} ${currentVariant.shadow || ''} ${showTooltip ? 'opacity-100' : 'opacity-0'}`;

  // Arrow classes
  const arrowBaseClasses = 'absolute w-0 h-0 border-4';
  const arrowClasses = `${arrowBaseClasses} ${currentPosition.arrow} ${currentVariant.arrow}`;
</script>

<div
  class="relative inline-block {className}"
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
  onfocus={handleMouseEnter}
  onblur={handleMouseLeave}
  {...restProps}
>
  <!-- Trigger Element -->
  {@render children?.()}

  <!-- Tooltip -->
  {#if text && showTooltip}
    <div class={tooltipClasses} role="tooltip">
      {text}
      <div class={arrowClasses}></div>
    </div>
  {/if}
</div>
