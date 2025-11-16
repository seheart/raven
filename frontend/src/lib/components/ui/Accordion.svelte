<script>
  /**
   * Accordion Component - Raven UI Library
   * Collapsible sections with expand/collapse functionality
   *
   * @component
   * @example
   * <Accordion
   *   items={[
   *     { title: 'Section 1', content: 'Content for section 1' },
   *     { title: 'Section 2', content: 'Content for section 2' }
   *   ]}
   * />
   */

  let {
    /** Accordion items array */
    items = [],
    /** Allow multiple sections open */
    multiple = false,
    /** Default open items (array of indices) */
    defaultOpen = [],
    /** Variant style */
    variant = 'default', // 'default' | 'bordered' | 'separated'
    /** Additional CSS classes */
    class: className = '',
    /** Item toggle callback */
    onToggle = undefined,
    ...restProps
  } = $props();

  // Track open items
  let openItems = $state(new Set(defaultOpen));

  // Toggle item
  function toggleItem(index) {
    const newOpenItems = new Set(openItems);

    if (newOpenItems.has(index)) {
      newOpenItems.delete(index);
    } else {
      if (!multiple) {
        newOpenItems.clear();
      }
      newOpenItems.add(index);
    }

    openItems = newOpenItems;
    onToggle?.(index, newOpenItems.has(index));
  }

  // Check if item is open
  function isOpen(index) {
    return openItems.has(index);
  }

  // Variant styles
  const variants = {
    default: {
      container: 'border border-[var(--border)] rounded-lg overflow-hidden',
      item: 'border-b border-[var(--border)] last:border-b-0',
      header: 'bg-[var(--surface)] hover:bg-[var(--surface-2)]',
      content: 'bg-[var(--surface)]'
    },
    bordered: {
      container: 'space-y-0',
      item: 'border border-[var(--border)] rounded-lg overflow-hidden mb-2 last:mb-0',
      header: 'bg-[var(--surface)] hover:bg-[var(--surface-2)]',
      content: 'bg-[var(--surface)]'
    },
    separated: {
      container: 'space-y-3',
      item: 'border border-[var(--border)] rounded-lg overflow-hidden shadow-sm',
      header: 'bg-[var(--surface)] hover:bg-[var(--surface-2)]',
      content: 'bg-[var(--surface)]'
    }
  };

  const currentVariant = $derived(variants[variant]);

  // Header classes
  const headerBaseClasses =
    'w-full flex items-center justify-between px-4 py-3 text-left font-medium text-[var(--text)] transition-colors duration-150 cursor-pointer font-sans';

  // Content classes
  const contentBaseClasses =
    'px-4 py-3 text-[var(--text)] font-sans transition-all duration-200 overflow-hidden';

  // Icon rotation
  function getIconRotation(index) {
    return isOpen(index) ? 'rotate-180' : 'rotate-0';
  }
</script>

<div class="{currentVariant.container} {className}" {...restProps}>
  {#each items as item, i (i)}
    <div class={currentVariant.item}>
      <!-- Header -->
      <button
        type="button"
        class="{headerBaseClasses} {currentVariant.header}"
        onclick={() => toggleItem(i)}
        aria-expanded={isOpen(i)}
        aria-controls="accordion-content-{i}"
        id="accordion-header-{i}"
      >
        <span>{item.title}</span>

        <!-- Chevron Icon -->
        <svg
          class="w-5 h-5 text-[var(--muted)] transition-transform duration-200 {getIconRotation(i)}"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      <!-- Content -->
      {#if isOpen(i)}
        <div
          class="{contentBaseClasses} {currentVariant.content}"
          id="accordion-content-{i}"
          role="region"
          aria-labelledby="accordion-header-{i}"
        >
          {#if typeof item.content === 'string'}
            <p>{item.content}</p>
          {:else}
            {@render item.content?.()}
          {/if}
        </div>
      {/if}
    </div>
  {/each}
</div>
