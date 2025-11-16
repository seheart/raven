<script>
  /**
   * Spacer Component - Raven UI Library
   * Flexible empty space for layouts
   *
   * @component
   * @example
   * <Spacer size="md" />
   * <Spacer height="2rem" />
   */

  let {
    /** Size preset */
    size = 'md', // 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
    /** Custom height */
    height = undefined,
    /** Custom width */
    width = undefined,
    /** Additional CSS classes */
    class: className = '',
    ...restProps
  } = $props();

  // Size presets
  const sizes = {
    xs: 'h-1',
    sm: 'h-2',
    md: 'h-4',
    lg: 'h-8',
    xl: 'h-16',
    '2xl': 'h-24'
  };

  const spacerClass = height || width ? className : `${sizes[size]} ${className}`;
  const style =
    height || width
      ? `${height ? `height: ${height};` : ''} ${width ? `width: ${width};` : ''}`
      : undefined;
</script>

<div class={spacerClass} {style} {...restProps}></div>
