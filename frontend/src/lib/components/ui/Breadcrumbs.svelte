<script>
  /**
   * Breadcrumbs Component - Raven UI Library
   * Navigation breadcrumbs showing the current page location
   *
   * @component
   * @example
   * <Breadcrumbs
   *   items={[
   *     { label: 'Home', href: '/' },
   *     { label: 'Projects', href: '/projects' },
   *     { label: 'Current Project' }
   *   ]}
   * />
   */

  let {
    /** Breadcrumb items array */
    items = [],
    /** Separator character/icon */
    separator = '/',
    /** Size variant */
    size = 'md', // 'sm' | 'md' | 'lg'
    /** Max items to show before collapsing */
    maxItems = undefined,
    /** Additional CSS classes */
    class: className = '',
    /** Item click callback */
    onItemClick = undefined,
    ...restProps
  } = $props();

  // Size variants
  const sizes = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg'
  };

  // Collapse items if needed
  const displayItems = $derived.by(() => {
    if (!maxItems || items.length <= maxItems) {
      return items;
    }

    const firstItem = items[0];
    const lastItems = items.slice(-(maxItems - 1));
    return [firstItem, { label: '...', collapsed: true }, ...lastItems];
  });

  // Handle item click
  function handleClick(item, index) {
    if (item.href && onItemClick) {
      onItemClick(item, index);
    }
  }

  // Container classes
  const containerClasses = $derived(`flex items-center gap-2 ${sizes[size]} font-sans ${className}`);

  // Item classes
  const itemBaseClasses = 'transition-colors duration-150';
  const linkClasses = 'text-[var(--accent)] hover:underline cursor-pointer';
  const currentClasses = 'text-[var(--text)] font-medium';
  const collapsedClasses = 'text-[var(--muted)]';

  // Separator classes
  const separatorClasses = 'text-[var(--muted)] select-none';

  function getItemClasses(item, index, isLast) {
    if (item.collapsed) return `${itemBaseClasses} ${collapsedClasses}`;
    if (isLast) return `${itemBaseClasses} ${currentClasses}`;
    return `${itemBaseClasses} ${linkClasses}`;
  }
</script>

<nav class={containerClasses} aria-label="Breadcrumb" {...restProps}>
  <ol class="flex items-center gap-2 list-none p-0 m-0">
    {#each displayItems as item, i (i)}
      <li class="flex items-center gap-2">
        {#if item.collapsed}
          <!-- Collapsed indicator -->
          <span class={getItemClasses(item, i, false)}>
            {item.label}
          </span>
        {:else if i === displayItems.length - 1}
          <!-- Current page (no link) -->
          <span class={getItemClasses(item, i, true)} aria-current="page">
            {item.label}
          </span>
        {:else if item.href}
          <!-- Link item -->
          <a
            href={item.href}
            class={getItemClasses(item, i, false)}
            onclick={_e => handleClick(item, i)}
          >
            {item.label}
          </a>
        {:else}
          <!-- Non-link item -->
          <span class={getItemClasses(item, i, false)}>
            {item.label}
          </span>
        {/if}

        <!-- Separator (not after last item) -->
        {#if i < displayItems.length - 1}
          <span class={separatorClasses} aria-hidden="true">
            {separator}
          </span>
        {/if}
      </li>
    {/each}
  </ol>
</nav>
