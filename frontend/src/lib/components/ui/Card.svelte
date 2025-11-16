<script>
  /**
   * Card Component - Raven UI Library
   * A versatile container component with consistent styling across all themes
   *
   * @component
   * @example
   * <Card>
   *   <h3>Card Title</h3>
   *   <p>Card content...</p>
   * </Card>
   *
   * @example
   * <Card variant="compact" hover={true}>
   *   Compact card with hover effect
   * </Card>
   */

  import { buildCardClasses, cx } from '$lib/utils/classBuilder.js';

  let {
    /** Card variant - controls padding and style */
    variant = 'default', // 'default' | 'compact' | 'flat' | 'bordered'
    /** Enable hover effect (lift and shadow) */
    hover = false,
    /** Enable click cursor */
    clickable = false,
    /** Optional click handler */
    onclick = undefined,
    /** Additional CSS classes */
    class: className = '',
    /** Child content */
    children,
    ...restProps
  } = $props();

  // Build card classes using shared utility with custom hover effect
  const cardClasses = $derived(
    cx(
      buildCardClasses({ variant, hoverable: hover, clickable: clickable || !!onclick, className }),
      'transition-all duration-200',
      hover ? 'hover:border-[var(--accent)] hover:shadow-md hover:-translate-y-0.5' : ''
    )
  );
</script>

{#if onclick}
  <div
    class={cardClasses}
    {onclick}
    role="button"
    tabindex="0"
    onkeydown={e => e.key === 'Enter' && onclick?.(e)}
    {...restProps}
  >
    {@render children?.()}
  </div>
{:else}
  <div class={cardClasses} {...restProps}>
    {@render children?.()}
  </div>
{/if}
