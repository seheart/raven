<script>
  /**
   * DatePicker Component - Raven UI Library
   * Date selection with calendar dropdown
   * Refactored to use FormField wrapper and shared utilities
   *
   * @component
   * @example
   * <DatePicker bind:value={selectedDate} label="Select Date" />
   */

  import FormField from './FormField.svelte';
  import { buildFormInputClasses } from '$lib/utils/classBuilder.js';

  let {
    /** Selected date (bindable) */
    value = $bindable(''),
    /** Label text */
    label = '',
    /** Placeholder */
    placeholder = 'Select date...',
    /** Helper text */
    helper = '',
    /** Error message */
    error = '',
    /** Disabled state */
    disabled = false,
    /** Required */
    required = false,
    /** Min date (YYYY-MM-DD) */
    min = undefined,
    /** Max date (YYYY-MM-DD) */
    max = undefined,
    /** Additional CSS classes */
    class: className = '',
    /** Name attribute */
    name = '',
    /** ID attribute */
    id = '',
    ...restProps
  } = $props();

  // Build input classes using shared utility (md size for date inputs)
  const inputClasses = $derived(
    buildFormInputClasses({
      size: 'md',
      error: !!error,
      disabled,
      fullWidth: true,
      hasIcon: false,
      className
    })
  );
</script>

<FormField {label} {error} {helper} {required} {id} {name} {...restProps}>
  {#snippet children({ describedById })}
    <input
      type="date"
      bind:value
      {name}
      id={id || name}
      {disabled}
      {required}
      {placeholder}
      {min}
      {max}
      class={inputClasses}
      aria-invalid={error ? 'true' : 'false'}
      aria-describedby={describedById}
    />
  {/snippet}
</FormField>
