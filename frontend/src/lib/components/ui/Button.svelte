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

  // Variant styles using Tailwind default utilities
  const variants = {
    primary: 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700 hover:border-blue-700 focus:ring-blue-500',
    secondary: 'bg-gray-200 text-gray-900 border-gray-300 hover:bg-gray-300 hover:border-gray-400 focus:ring-gray-400',
    ghost: 'bg-transparent text-gray-700 border-gray-300 hover:bg-gray-100 hover:border-gray-400 focus:ring-gray-400',
    danger: 'bg-red-600 text-white border-red-600 hover:bg-red-700 hover:border-red-700 focus:ring-red-500'
  };

  // Size styles using Tailwind default utilities
  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg'
  };

  // Base button classes
  const baseClasses = 'inline-flex items-center justify-center gap-2 rounded border font-semibold font-sans cursor-pointer transition-all duration-200 outline-none whitespace-nowrap';

  // Disabled state
  const disabledClasses = 'opacity-50 cursor-not-allowed pointer-events-none';

  // Hover effect
  const hoverClasses = 'hover:-translate-y-0.5 active:translate-y-0';

  // Focus ring for accessibility
  const focusClasses = 'focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white';

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
