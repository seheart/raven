<script>
  /**
   * Button Component - Raven UI Library
   * Built with Tailwind CSS for complete control
   */

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

  // Variant styles using Tailwind utilities
  const variants = {
    primary: 'bg-night-accent text-white border-night-accent hover:bg-night-accent-2 hover:border-night-accent-2 focus:ring-night-accent',
    secondary: 'bg-night-surface-2 text-night-text border-night-border hover:border-night-accent focus:ring-night-border',
    ghost: 'bg-transparent text-night-text border-transparent hover:bg-night-surface hover:border-night-border focus:ring-night-border',
    danger: 'bg-night-error text-white border-night-error hover:opacity-80 focus:ring-night-error'
  };

  // Size styles using Tailwind utilities
  const sizes = {
    sm: 'px-sm py-xs text-xs',
    md: 'px-lg py-md text-sm',
    lg: 'px-xl py-lg text-base'
  };

  // Base button classes
  const baseClasses = 'inline-flex items-center justify-content gap-sm rounded border font-semibold font-sans cursor-pointer transition-all duration-200 outline-none whitespace-nowrap';

  // Disabled state
  const disabledClasses = 'opacity-50 cursor-not-allowed pointer-events-none';

  // Hover effect
  const hoverClasses = 'hover:-translate-y-0.5 active:translate-y-0';

  // Focus ring for accessibility
  const focusClasses = 'focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-night-bg';

  // Combine all classes
  const buttonClasses = `${baseClasses} ${variants[variant]} ${sizes[size]} ${!disabled ? hoverClasses : ''} ${focusClasses} ${disabled ? disabledClasses : ''} ${className}`;
</script>

<button
  {type}
  {disabled}
  {onclick}
  class={buttonClasses}
  {...restProps}
>
  {@render children?.()}
</button>
