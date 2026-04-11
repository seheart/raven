<script>
  /**
   * Container Component - Raven UI Library
   * Layout wrapper with max-width and centering
   *
   * @component
   * @example
   * <Container size="lg">Content</Container>
   */

  let {
    /** Max width size */
    size = 'lg', // 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'
    /** Center content */
    center = true,
    /** Add padding */
    padding = true,
    /** Additional CSS classes */
    class: className = '',
    children,
    ...restProps
  } = $props();

  // Size variants
  const sizes = {
    sm: 'max-w-2xl',
    md: 'max-w-4xl',
    lg: 'max-w-6xl',
    xl: 'max-w-7xl',
    '2xl': 'max-w-screen-2xl',
    full: 'max-w-full'
  };

  const centerClass = $derived(center ? 'mx-auto' : '');
  const paddingClass = $derived(padding ? 'px-4 sm:px-6 lg:px-8' : '');

  const containerClasses = $derived(`${sizes[size]} ${centerClass} ${paddingClass} ${className}`);
</script>

<div class={containerClasses} {...restProps}>
  {@render children?.()}
</div>
