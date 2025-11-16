<script>
  /**
   * Dropdown Component - Raven UI Library
   * A dropdown menu with items, dividers, and keyboard navigation
   *
   * @component
   * @example
   * <Dropdown>
   *   <Button slot="trigger">Actions</Button>
   *   <DropdownItem onclick={() => handleEdit()}>Edit</DropdownItem>
   *   <DropdownItem onclick={() => handleDelete()} variant="danger">Delete</DropdownItem>
   * </Dropdown>
   */

  let {
    /** Open state (bindable) */
    open = $bindable(false),
    /** Position relative to trigger */
    position = 'bottom-left', // 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right'
    /** Full width of trigger */
    fullWidth = false,
    /** Additional CSS classes */
    class: className = '',
    trigger,
    children,
    ...restProps
  } = $props();

  let dropdownRef = $state(null);

  // Toggle dropdown
  function toggleDropdown() {
    open = !open;
  }

  // Close dropdown
  function closeDropdown() {
    open = false;
  }

  // Click outside to close
  function handleClickOutside(event) {
    if (dropdownRef && !dropdownRef.contains(event.target)) {
      closeDropdown();
    }
  }

  // Escape key to close
  function handleKeydown(e) {
    if (e.key === 'Escape' && open) {
      closeDropdown();
    }
  }

  // Position variants
  const positions = {
    'bottom-left': 'top-full left-0 mt-2',
    'bottom-right': 'top-full right-0 mt-2',
    'top-left': 'bottom-full left-0 mb-2',
    'top-right': 'bottom-full right-0 mb-2'
  };

  // Menu classes
  const menuBaseClasses =
    'absolute z-50 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-lg py-1 transition-all duration-150 origin-top font-sans';
  const widthClasses = fullWidth ? 'w-full' : 'min-w-[200px]';
  const visibilityClasses = open
    ? 'opacity-100 scale-100'
    : 'opacity-0 scale-95 pointer-events-none';
  const menuClasses = `${menuBaseClasses} ${positions[position]} ${widthClasses} ${visibilityClasses}`;
</script>

<svelte:window onclick={handleClickOutside} onkeydown={handleKeydown} />

<div bind:this={dropdownRef} class="relative inline-block {className}" {...restProps}>
  <!-- Trigger -->
  <div onclick={toggleDropdown}>
    {@render trigger?.()}
  </div>

  <!-- Menu -->
  <div class={menuClasses}>
    {@render children?.({ close: closeDropdown })}
  </div>
</div>
