<script>
  /**
   * Button Component - Raven UI Library
   * Built with Tailwind CSS for complete control
   * Refactored to use shared utilities for better maintainability
   */

  import { buildButtonClasses, cx } from '$lib/utils/classBuilder.js';
  import {
    validateVariant,
    validateSize,
    VALID_BUTTON_VARIANTS,
    VALID_SIZES
  } from '$lib/utils/propValidation.js';

  let {
    variant = 'primary',
    size = 'md',
    disabled = false,
    type = 'button',
    onclick = () => {},
    children,
    class: className = '',
    ...restProps
  } = $props();

  // Validate props
  const validatedVariant = $derived(validateVariant(variant, VALID_BUTTON_VARIANTS, 'Button'));
  const validatedSize = $derived(validateSize(size, VALID_SIZES, 'Button'));

  // Additional button-specific classes (hover/focus effects)
  const hoverClasses = 'hover:-translate-y-0.5 active:translate-y-0';
  const focusClasses =
    'focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white whitespace-nowrap cursor-pointer';

  // Build button classes using shared utility
  const buttonClasses = $derived(
    cx(
      buildButtonClasses({
        variant: validatedVariant,
        size: validatedSize,
        disabled,
        className: ''
      }),
      !disabled ? hoverClasses : '',
      focusClasses,
      className
    )
  );
</script>

<button {type} {disabled} {onclick} class={buttonClasses} {...restProps}>
  {@render children?.()}
</button>
