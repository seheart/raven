<script>
  /**
   * Radio Component - Raven UI Library
   * A radio button input, typically used in groups
   *
   * @component
   * @example
   * <Radio bind:group={selected} value="option1" label="Option 1" />
   * <Radio bind:group={selected} value="option2" label="Option 2" />
   */

  import { cx } from '$lib/utils/classBuilder.js';

  let {
    /** Group value (bindable) - the selected value */
    group = $bindable(''),
    /** This radio's value */
    value = '',
    /** Label text */
    label = '',
    /** Description text */
    description = '',
    /** Disabled state */
    disabled = false,
    /** Size variant */
    size = 'md', // 'sm' | 'md' | 'lg'
    /** Additional CSS classes */
    class: className = '',
    /** Name attribute */
    name = '',
    /** ID attribute */
    id = '',
    ...restProps
  } = $props();

  // Size variants
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6'
  };

  const labelSizes = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg'
  };

  // Radio classes
  const radioClasses = $derived(
    cx(
      sizes[size],
      'rounded-full border-2 border-[var(--border)] text-[var(--accent)]',
      'focus:ring-2 focus:ring-[var(--accent)] focus:ring-opacity-20',
      'transition-all duration-200 cursor-pointer',
      disabled && 'opacity-50 cursor-not-allowed'
    )
  );

  // Container classes
  const containerClasses = $derived(cx('flex items-start gap-3', className));
</script>

<label class={containerClasses}>
  <input
    type="radio"
    bind:group
    {value}
    {name}
    {id}
    {disabled}
    class={radioClasses}
    {...restProps}
  />

  {#if label || description}
    <div class="flex-1">
      {#if label}
        <div class="{labelSizes[size]} font-medium text-[var(--text)] font-sans cursor-pointer">
          {label}
        </div>
      {/if}
      {#if description}
        <div class="text-xs text-[var(--muted)] mt-0.5 font-sans">
          {description}
        </div>
      {/if}
    </div>
  {/if}
</label>
