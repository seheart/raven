<script>
  /**
   * Select Component - Raven UI Library
   * A dropdown select input with theme support
   * Refactored to use FormField wrapper and shared utilities
   *
   * @component
   * @example
   * <Select
   *   bind:value={selected}
   *   options={['Option 1', 'Option 2', 'Option 3']}
   *   label="Choose an option"
   * />
   */

  import FormField from './FormField.svelte';
  import SVGIcon from './SVGIcon.svelte';
  import { buildFormInputClasses, cx } from '$lib/utils/classBuilder.js';
  import { validateSize, validateArray, VALID_SIZES } from '$lib/utils/propValidation.js';

  let {
    /** Selected value (bindable) */
    value = $bindable(''),
    /** Options array (strings or objects with label/value) */
    options = [],
    /** Label text */
    label = '',
    /** Placeholder text */
    placeholder = 'Select an option...',
    /** Helper text */
    helper = '',
    /** Error message */
    error = '',
    /** Disabled state */
    disabled = false,
    /** Required field */
    required = false,
    /** Size variant */
    size = 'md', // 'sm' | 'md' | 'lg'
    /** Full width */
    fullWidth = true,
    /** Additional CSS classes */
    class: className = '',
    /** Name attribute */
    name = '',
    /** ID attribute */
    id = '',
    ...restProps
  } = $props();

  // Validate props
  const validatedSize = $derived(validateSize(size, VALID_SIZES, 'Select'));
  const validatedOptions = $derived(validateArray(options, 'options', 'Select'));

  // Build select classes using shared utility
  const selectClasses = $derived(
    cx(
      buildFormInputClasses({
        size: validatedSize,
        error: !!error,
        disabled,
        fullWidth,
        hasIcon: false,
        className: ''
      }),
      'appearance-none bg-no-repeat cursor-pointer pr-10',
      className
    )
  );
</script>

<FormField {label} {error} {helper} {required} {id} {name}>
  {#snippet children({ describedById })}
    <div class="relative">
      <select
        bind:value
        {name}
        id={id || name}
        {disabled}
        {required}
        class={selectClasses}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={describedById}
        {...restProps}
      >
        {#if placeholder && !value}
          <option value="" disabled selected class="text-[var(--muted)]">{placeholder}</option>
        {/if}

        {#each validatedOptions as option, i (i)}
          <option value={typeof option === 'string' ? option : option.value}>
            {typeof option === 'string' ? option : option.label}
          </option>
        {/each}
      </select>

      <!-- Dropdown Arrow Icon -->
      <div class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
        <SVGIcon type="chevronDown" size="w-4 h-4" class="text-[var(--muted)]" />
      </div>
    </div>
  {/snippet}
</FormField>
