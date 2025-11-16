<script>
  /**
   * List Component - Raven UI Library
   * Display structured lists with various styles and interactivity
   *
   * @component
   * @example
   * <List
   *   items={['Item 1', 'Item 2', 'Item 3']}
   * />
   *
   * @example
   * <List variant="bordered" divided={true}>
   *   <li>Custom item 1</li>
   *   <li>Custom item 2</li>
   * </List>
   */

  let {
    /** List items (array of strings or objects) */
    items = [],
    /** List variant */
    variant = 'default', // 'default' | 'bordered' | 'flush' | 'compact'
    /** Divided items (borders between) */
    divided = true,
    /** Hoverable items */
    hoverable = false,
    /** Clickable items */
    clickable = false,
    /** Item click handler */
    onItemClick = undefined,
    /** Ordered list (ol vs ul) */
    ordered = false,
    /** Dense/compact spacing */
    dense = false,
    /** Additional CSS classes */
    class: className = '',
    /** Custom content via children slot */
    children,
    ...restProps
  } = $props();

  // Variant styles
  const variants = {
    default: 'bg-[var(--surface)] border border-[var(--border)] rounded-lg',
    bordered: 'bg-[var(--surface)] border-2 border-[var(--border)] rounded-lg',
    flush: 'bg-transparent', // No border, no background
    compact: 'bg-[var(--surface)] border border-[var(--border)] rounded'
  };

  // Base list classes
  const baseClasses = 'overflow-hidden';

  // Container classes
  const containerClasses = `${baseClasses} ${variants[variant]} ${className}`;

  // Item classes
  const getItemClasses = index => {
    const paddingClasses = dense ? 'px-3 py-2' : 'px-4 py-3';
    let classes = `${paddingClasses} text-sm text-[var(--text)] font-sans transition-colors duration-150`;

    if (divided && index > 0) {
      classes += ' border-t border-[var(--border)]';
    }

    if (hoverable || clickable || onItemClick) {
      classes += ' hover:bg-[var(--accent)] hover:bg-opacity-5';
    }

    if (clickable || onItemClick) {
      classes += ' cursor-pointer';
    }

    return classes;
  };

  // Handle item click
  const handleItemClick = (item, index) => {
    if (onItemClick) {
      onItemClick(item, index);
    }
  };

  // Determine list tag
  const ListTag = ordered ? 'ol' : 'ul';
</script>

<svelte:element this={ListTag} class={containerClasses} {...restProps}>
  {#if children}
    <!-- Custom list content via slot -->
    {@render children?.()}
  {:else}
    <!-- Auto-generated list from items -->
    {#if items.length > 0}
      {#each items as item, index (index)}
        <li
          class={getItemClasses(index)}
          onclick={() => handleItemClick(item, index)}
          role={onItemClick ? 'button' : undefined}
          tabindex={onItemClick ? 0 : undefined}
          onkeydown={e => e.key === 'Enter' && onItemClick && handleItemClick(item, index)}
        >
          {#if typeof item === 'string'}
            {item}
          {:else if item.label}
            <div class="flex items-center justify-between gap-3">
              <span class="flex-1">{item.label}</span>
              {#if item.value}
                <span class="text-[var(--muted)] font-mono text-xs">{item.value}</span>
              {/if}
              {#if item.badge}
                <span
                  class="px-2 py-0.5 text-[10px] font-bold bg-[var(--accent)] bg-opacity-15 text-[var(--accent)] rounded uppercase"
                >
                  {item.badge}
                </span>
              {/if}
            </div>
          {/if}
        </li>
      {/each}
    {:else}
      <li class="px-4 py-6 text-center text-[var(--muted)] font-sans text-sm">No items</li>
    {/if}
  {/if}
</svelte:element>
