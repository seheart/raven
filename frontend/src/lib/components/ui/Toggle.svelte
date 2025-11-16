<script>
  /**
   * Toggle Component - Raven UI Library
   * A switch/toggle input with smooth animations
   *
   * @component
   * @example
   * <Toggle bind:checked={enabled} label="Enable feature" />
   */

  import { cx } from '$lib/utils/classBuilder.js';

  let {
    /** Checked state (bindable) */
    checked = $bindable(false),
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
    sm: { track: 'w-9 h-5', knob: 'w-4 h-4', translate: 'translate-x-4' },
    md: { track: 'w-11 h-6', knob: 'w-5 h-5', translate: 'translate-x-5' },
    lg: { track: 'w-14 h-7', knob: 'w-6 h-6', translate: 'translate-x-7' }
  };

  const labelSizes = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg'
  };

  // Track classes
  const trackClasses = $derived(
    cx(
      'relative inline-flex items-center rounded-full transition-colors duration-200 cursor-pointer',
      sizes[size].track,
      checked ? 'bg-[var(--accent)]' : 'bg-[var(--surface-2)]',
      disabled && 'opacity-50 cursor-not-allowed'
    )
  );

  // Knob classes
  const knobClasses = $derived(
    cx(
      'inline-block bg-white rounded-full transition-transform duration-200 shadow-sm',
      sizes[size].knob,
      checked ? sizes[size].translate : 'translate-x-0.5'
    )
  );

  // Container classes
  const containerClasses = $derived(cx('flex items-start gap-3', className));

  // Toggle handler
  function handleToggle() {
    if (!disabled) {
      checked = !checked;
    }
  }
</script>

<label class={containerClasses}>
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    {disabled}
    onclick={handleToggle}
    onkeydown={e => e.key === ' ' && (e.preventDefault(), handleToggle())}
    class={trackClasses}
    {...restProps}
  >
    <span class={knobClasses}></span>
  </button>

  <input type="checkbox" bind:checked {name} {id} {disabled} class="sr-only" />

  {#if label || description}
    <div class="flex-1">
      {#if label}
        <div
          class="{labelSizes[size]} font-medium text-[var(--text)] font-sans cursor-pointer"
          onclick={handleToggle}
        >
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

<style>
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
