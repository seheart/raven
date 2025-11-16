<script>
  /**
   * Badge Component - Raven UI Library
   * A small status indicator or label with semantic color variants
   *
   * @component
   * @example
   * <Badge variant="success">Active</Badge>
   * <Badge variant="error">Failed</Badge>
   * <Badge variant="warning" size="sm">Pending</Badge>
   */

  import { buildBadgeClasses, cx } from '$lib/utils/classBuilder.js';

  let {
    /** Badge variant - determines color */
    variant = 'default', // 'default' | 'primary' | 'success' | 'error' | 'warning' | 'info' | 'muted'
    /** Badge size */
    size = 'md', // 'sm' | 'md' | 'lg'
    /** Dot indicator (shows before text) */
    dot = false,
    /** Pill style (fully rounded) */
    pill = false,
    /** Additional CSS classes */
    class: className = '',
    /** Child content */
    children,
    ...restProps
  } = $props();

  // Dot colors
  const dotColors = {
    default: 'bg-[var(--text)]',
    primary: 'bg-[var(--accent)]',
    success: 'bg-[var(--success)]',
    error: 'bg-[var(--error)]',
    warning: 'bg-[var(--warning)]',
    info: 'bg-[var(--info)]',
    muted: 'bg-[var(--muted)]'
  };

  // Build badge classes using shared utility
  const badgeClasses = $derived(
    cx(
      buildBadgeClasses({ variant, size, pill, className }),
      'gap-1.5 font-bold uppercase tracking-wide' // Additional badge-specific styles
    )
  );
</script>

<span class={badgeClasses} {...restProps}>
  {#if dot}
    <span class="w-1.5 h-1.5 rounded-full {dotColors[variant]}" aria-hidden="true"></span>
  {/if}
  {@render children?.()}
</span>
