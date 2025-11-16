<script>
  /**
   * DropdownItem Component - Raven UI Library
   * Individual item for Dropdown menus
   *
   * @component
   * @example
   * <DropdownItem onclick={() => handleAction()}>Action</DropdownItem>
   * <DropdownItem variant="danger">Delete</DropdownItem>
   * <DropdownItem disabled>Disabled Action</DropdownItem>
   */

  let {
    /** Click handler */
    onclick = undefined,
    /** Variant style */
    variant = 'default', // 'default' | 'danger'
    /** Disabled state */
    disabled = false,
    /** Icon (optional) */
    icon = '',
    /** Additional CSS classes */
    class: className = '',
    children,
    ...restProps
  } = $props();

  // Variant styles
  const variants = {
    default: 'text-[var(--text)] hover:bg-[var(--surface-2)]',
    danger: 'text-[var(--error)] hover:bg-[var(--error)] hover:bg-opacity-10'
  };

  // Item classes
  const itemBaseClasses =
    'w-full px-4 py-2 text-left text-sm transition-colors duration-150 flex items-center gap-2 font-sans';
  const disabledClasses = disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer';
  const itemClasses = `${itemBaseClasses} ${variants[variant]} ${disabledClasses} ${className}`;

  // Handle click
  function handleClick(e) {
    if (!disabled && onclick) {
      onclick(e);
    }
  }
</script>

<button type="button" class={itemClasses} {disabled} onclick={handleClick} {...restProps}>
  {#if icon}
    <span class="flex-shrink-0">{icon}</span>
  {/if}
  <span class="flex-1">
    {@render children?.()}
  </span>
</button>
