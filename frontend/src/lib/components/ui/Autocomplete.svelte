<script>
  /**
   * Autocomplete Component - Raven UI Library
   * Search input with suggestion dropdown
   *
   * @component
   * @example
   * <Autocomplete bind:value={selected} options={items} />
   */

  import FormField from './FormField.svelte';
  import { buildFormInputClasses } from '$lib/utils/classBuilder.js';

  let {
    /** Selected value (bindable) */
    value = $bindable(''),
    /** Options array (strings or objects with label/value) */
    options = [],
    /** Label text */
    label = '',
    /** Placeholder */
    placeholder = 'Search...',
    /** Helper text */
    helper = '',
    /** Error message */
    error = '',
    /** Disabled state */
    disabled = false,
    /** Required */
    required = false,
    /** Filter function */
    filterFn = undefined,
    /** On select callback */
    onSelect = undefined,
    /** Additional CSS classes */
    class: className = '',
    /** Name attribute */
    name = '',
    /** ID attribute */
    id = '',
    ...restProps
  } = $props();

  let searchQuery = $state('');
  let showDropdown = $state(false);
  let selectedIndex = $state(-1);
  let inputRef = $state(null);

  // Filter options based on search query
  const filteredOptions = $derived(() => {
    if (!searchQuery) return options;

    if (filterFn) {
      return filterFn(options, searchQuery);
    }

    return options.filter(option => {
      const label = typeof option === 'string' ? option : option.label;
      return label.toLowerCase().includes(searchQuery.toLowerCase());
    });
  });

  function handleInput(e) {
    searchQuery = e.target.value;
    showDropdown = true;
    selectedIndex = -1;
  }

  function handleSelect(option) {
    const selectedValue = typeof option === 'string' ? option : option.value;
    const selectedLabel = typeof option === 'string' ? option : option.label;

    value = selectedValue;
    searchQuery = selectedLabel;
    showDropdown = false;
    onSelect?.(option);
    inputRef?.blur();
  }

  function handleKeydown(e) {
    if (!showDropdown) return;

    const opts = filteredOptions;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, opts.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, -1);
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      handleSelect(opts[selectedIndex]);
    } else if (e.key === 'Escape') {
      showDropdown = false;
    }
  }

  function handleBlur() {
    // Delay to allow click on dropdown items
    setTimeout(() => {
      showDropdown = false;
    }, 200);
  }

  // Input classes using shared utility
  const inputClasses = $derived(
    buildFormInputClasses({
      size: 'md',
      error: !!error,
      disabled,
      fullWidth: true,
      className
    })
  );

  // Dropdown classes
  const dropdownClasses =
    'absolute z-50 w-full mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-lg max-h-60 overflow-y-auto';
  const itemBaseClasses =
    'px-4 py-2 cursor-pointer font-sans text-sm transition-colors duration-150';
  const itemHoverClasses = 'hover:bg-[var(--surface-2)]';
  const itemSelectedClasses = 'bg-[var(--accent)] bg-opacity-10 text-[var(--accent)]';
</script>

<FormField {label} {error} {helper} {required} {id} {name}>
  {#snippet children({ describedById })}
    <div class="relative" {...restProps}>
      <input
        bind:this={inputRef}
        type="text"
        bind:value={searchQuery}
        {name}
        id={id || name}
        {disabled}
        {required}
        {placeholder}
        class={inputClasses}
        oninput={handleInput}
        onkeydown={handleKeydown}
        onblur={handleBlur}
        onfocus={() => (showDropdown = true)}
        autocomplete="off"
        aria-autocomplete="list"
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={describedById}
        aria-controls="autocomplete-listbox"
      />

      {#if showDropdown && filteredOptions.length > 0}
        <div class={dropdownClasses} role="listbox" id="autocomplete-listbox">
          {#each filteredOptions as option, i (i)}
            {@const isSelected = i === selectedIndex}
            {@const optionLabel = typeof option === 'string' ? option : option.label}

            <div
              class="{itemBaseClasses} {itemHoverClasses} {isSelected ? itemSelectedClasses : ''}"
              onclick={() => handleSelect(option)}
              onkeydown={e => (e.key === 'Enter' || e.key === ' ') && handleSelect(option)}
              role="option"
              aria-selected={isSelected}
              tabindex="0"
            >
              {optionLabel}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/snippet}
</FormField>
