<script>
  /**
   * MultiSelect Component - Raven UI Library
   * Multi-selection dropdown with chips
   *
   * @component
   * @example
   * <MultiSelect bind:selected={selectedItems} options={items} />
   */

  import FormField from './FormField.svelte';
  import { cx } from '$lib/utils/classBuilder.js';

  let {
    /** Selected values array (bindable) */
    selected = $bindable([]),
    /** Options array (strings or objects with label/value) */
    options = [],
    /** Label text */
    label = '',
    /** Placeholder */
    placeholder = 'Select items...',
    /** Helper text */
    helper = '',
    /** Error message */
    error = '',
    /** Disabled state */
    disabled = false,
    /** Required */
    required = false,
    /** Max selections allowed */
    maxSelections = undefined,
    /** On change callback */
    onChange = undefined,
    /** Additional CSS classes */
    class: className = '',
    /** Name attribute */
    name = '',
    /** ID attribute */
    id = '',
    ...restProps
  } = $props();

  let showDropdown = $state(false);
  let searchQuery = $state('');

  // Filter options based on search
  const filteredOptions = $derived(() => {
    if (!searchQuery) return options;

    return options.filter(option => {
      const label = typeof option === 'string' ? option : option.label;
      return label.toLowerCase().includes(searchQuery.toLowerCase());
    });
  });

  // Check if option is selected
  function isSelected(option) {
    const value = typeof option === 'string' ? option : option.value;
    return selected.includes(value);
  }

  // Toggle option selection
  function toggleOption(option) {
    const value = typeof option === 'string' ? option : option.value;

    if (selected.includes(value)) {
      selected = selected.filter(v => v !== value);
    } else {
      if (maxSelections && selected.length >= maxSelections) {
        return; // Max selections reached
      }
      selected = [...selected, value];
    }

    onChange?.(selected);
  }

  // Remove item by value
  function removeItem(value) {
    selected = selected.filter(v => v !== value);
    onChange?.(selected);
  }

  // Get label for value
  function getLabel(value) {
    const option = options.find(opt => (typeof opt === 'string' ? opt : opt.value) === value);
    return typeof option === 'string' ? option : option?.label || value;
  }

  // Container classes
  const multiSelectClasses = $derived(
    cx(
      'w-full rounded-lg border font-sans transition-all duration-200 px-3 py-2 min-h-[42px]',
      error
        ? 'border-[var(--error)]'
        : showDropdown
          ? 'border-[var(--accent)] ring-2 ring-[var(--accent)] ring-opacity-20'
          : 'border-[var(--border)]',
      'bg-[var(--input-bg)]',
      disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-text',
      className
    )
  );

  // Dropdown classes
  const dropdownClasses =
    'absolute z-50 w-full mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-lg max-h-60 overflow-y-auto';
</script>

<FormField {label} {error} {helper} {required} {id} {name}>
  {#snippet children({ describedById })}
    <div class="relative" {...restProps}>
      <div
        class={multiSelectClasses}
        onclick={() => !disabled && (showDropdown = !showDropdown)}
        onkeydown={e =>
          (e.key === 'Enter' || e.key === ' ') && !disabled && (showDropdown = !showDropdown)}
        role="button"
        tabindex="0"
        aria-describedby={describedById}
      >
        <div class="flex flex-wrap gap-2">
          {#each selected as value (value)}
            <span
              class="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-[var(--accent)] bg-opacity-10 text-[var(--accent)] font-medium"
            >
              {getLabel(value)}
              <button
                type="button"
                onclick={e => {
                  e.stopPropagation();
                  removeItem(value);
                }}
                class="hover:bg-[var(--accent)] hover:bg-opacity-20 rounded-full p-0.5"
                aria-label="Remove {getLabel(value)}"
              >
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </span>
          {/each}

          {#if selected.length === 0}
            <span class="text-[var(--muted)] text-sm">{placeholder}</span>
          {/if}
        </div>

        <input
          type="text"
          bind:value={searchQuery}
          {name}
          id={id || name}
          {disabled}
          class="hidden"
        />
      </div>

      {#if showDropdown}
        <div class={dropdownClasses}>
          {#each filteredOptions as option, i (i)}
            {@const selected = isSelected(option)}
            {@const optionLabel = typeof option === 'string' ? option : option.label}

            <div
              class="px-4 py-2 cursor-pointer font-sans text-sm transition-colors duration-150 hover:bg-[var(--surface-2)] flex items-center justify-between"
              onclick={e => {
                e.stopPropagation();
                toggleOption(option);
              }}
              onkeydown={e =>
                (e.key === 'Enter' || e.key === ' ') && (e.stopPropagation(), toggleOption(option))}
              role="option"
              tabindex="0"
              aria-selected={selected}
            >
              <span>{optionLabel}</span>
              {#if selected}
                <svg
                  class="w-4 h-4 text-[var(--accent)]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              {/if}
            </div>
          {/each}

          {#if filteredOptions.length === 0}
            <div class="px-4 py-2 text-sm text-[var(--muted)] text-center">No options found</div>
          {/if}
        </div>
      {/if}

      {#if maxSelections}
        <p class="text-xs text-[var(--muted)] mt-1 font-sans">
          {selected.length} / {maxSelections} selected
        </p>
      {/if}
    </div>
  {/snippet}
</FormField>
