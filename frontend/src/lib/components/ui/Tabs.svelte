<script>
  /**
   * Tabs Component - Raven UI Library
   * A tabbed navigation interface with panels
   *
   * @component
   * @example
   * <Tabs bind:activeTab={currentTab} tabs={['Overview', 'Activity', 'Settings']}>
   *   <div slot="panel-0">Overview content</div>
   *   <div slot="panel-1">Activity content</div>
   *   <div slot="panel-2">Settings content</div>
   * </Tabs>
   */

  let {
    /** Active tab index (bindable) */
    activeTab = $bindable(0),
    /** Array of tab labels */
    tabs = [],
    /** Variant style */
    variant = 'underline', // 'underline' | 'pills' | 'bordered'
    /** Full width tabs */
    fullWidth = false,
    /** Additional CSS classes */
    class: className = '',
    /** Tab change callback */
    onTabChange = undefined,
    children,
    ...restProps
  } = $props();

  // Handle tab click
  function handleTabClick(index) {
    activeTab = index;
    onTabChange?.(index);
  }

  // Variant styles for tab list
  const tabListVariants = {
    underline: 'border-b border-[var(--border)]',
    pills: 'bg-[var(--surface-2)] p-1 rounded-lg',
    bordered: 'border border-[var(--border)] rounded-lg p-1'
  };

  // Variant styles for individual tabs
  const tabVariants = {
    underline: {
      base: 'px-4 py-2 font-medium transition-all duration-200 border-b-2 -mb-px',
      active: 'border-[var(--accent)] text-[var(--accent)]',
      inactive:
        'border-transparent text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--border)]'
    },
    pills: {
      base: 'px-4 py-2 font-medium transition-all duration-200 rounded-md',
      active: 'bg-[var(--surface)] text-[var(--accent)] shadow-sm',
      inactive:
        'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface)] hover:bg-opacity-50'
    },
    bordered: {
      base: 'px-4 py-2 font-medium transition-all duration-200 rounded-md',
      active: 'bg-[var(--accent)] text-white',
      inactive: 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]'
    }
  };

  const currentVariant = $derived(tabVariants[variant]);

  // Tab list classes
  const tabListBaseClasses = 'flex gap-2 font-sans';
  const widthClasses = $derived(fullWidth ? 'w-full' : '');
  const tabListClasses = $derived(`${tabListBaseClasses} ${tabListVariants[variant]} ${widthClasses} ${className}`);

  // Individual tab classes
  function getTabClasses(index) {
    const isActive = index === activeTab;
    const widthClass = fullWidth ? 'flex-1 text-center' : '';
    return `${currentVariant.base} ${isActive ? currentVariant.active : currentVariant.inactive} ${widthClass} cursor-pointer`;
  }

  // Panel classes
  const panelClasses = 'py-4 font-sans text-[var(--text)]';
</script>

<div {...restProps}>
  <!-- Tab List -->
  <div class={tabListClasses} role="tablist">
    {#each tabs as tab, i (i)}
      <button
        type="button"
        role="tab"
        aria-selected={i === activeTab}
        aria-controls="panel-{i}"
        id="tab-{i}"
        class={getTabClasses(i)}
        onclick={() => handleTabClick(i)}
      >
        {tab}
      </button>
    {/each}
  </div>

  <!-- Tab Panels -->
  <div class={panelClasses}>
    {@render children?.({ activeTab })}
  </div>
</div>
