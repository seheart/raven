<script>
  /**
   * Input Component - Raven UI Library
   * A flexible input field with support for various types, states, and validation
   * Refactored to use FormField wrapper and shared utilities
   *
   * @component
   * @example
   * <Input
   *   bind:value={email}
   *   type="email"
   *   placeholder="Enter your email"
   *   label="Email Address"
   * />
   *
   * @example
   * <Input
   *   bind:value={password}
   *   type="password"
   *   error="Password is required"
   * />
   */

  import FormField from './FormField.svelte';
  import { buildFormInputClasses } from '$lib/utils/classBuilder.js';
  import { validateSize, VALID_SIZES } from '$lib/utils/propValidation.js';

  let {
    /** Input value (bindable) */
    value = $bindable(''),
    /** Input type */
    type = 'text', // 'text' | 'email' | 'password' | 'number' | 'search' | 'url' | 'tel'
    /** Input size */
    size = 'md', // 'sm' | 'md' | 'lg'
    /** Placeholder text */
    placeholder = '',
    /** Label text (displayed above input) */
    label = '',
    /** Helper text (displayed below input) */
    helper = '',
    /** Error message (displayed below input, red) */
    error = '',
    /** Disabled state */
    disabled = false,
    /** Required field */
    required = false,
    /** Read-only state */
    readonly = false,
    /** Full width */
    fullWidth = true,
    /** Icon prefix (emoji or text) */
    icon = '',
    /** Additional CSS classes */
    class: className = '',
    /** Input name attribute */
    name = '',
    /** Input id attribute */
    id = '',
    /** Autocomplete attribute */
    autocomplete = undefined,
    /** Min value (for number inputs) */
    min = undefined,
    /** Max value (for number inputs) */
    max = undefined,
    /** Input element reference (bindable) */
    ref = $bindable(undefined),
    ...restProps
  } = $props();

  // Validate size prop
  const validatedSize = $derived(validateSize(size, VALID_SIZES, 'Input'));

  // Build input classes using shared utility
  const inputClasses = $derived(
    buildFormInputClasses({
      size: validatedSize,
      error: !!error,
      disabled,
      fullWidth,
      hasIcon: !!icon,
      className
    })
  );
</script>

<FormField {label} {error} {helper} {required} {id} {name}>
  {#snippet children({ describedById })}
    <div class="relative">
      {#if icon}
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)] text-lg">
          {icon}
        </span>
      {/if}

      <input
        bind:this={ref}
        bind:value
        {type}
        {name}
        id={id || name}
        {placeholder}
        {disabled}
        {required}
        {readonly}
        {autocomplete}
        {min}
        {max}
        class={inputClasses}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={describedById}
        {...restProps}
      />
    </div>
  {/snippet}
</FormField>
