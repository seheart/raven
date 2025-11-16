<script>
  /**
   * Reusable SVG icon component to eliminate duplication across components
   * Supports common icons used throughout the UI library
   */
  let {
    type = 'close',
    size = 'w-4 h-4',
    color = 'currentColor',
    class: className = '',
    strokeWidth = '2',
    ...restProps
  } = $props();

  // Icon path definitions
  const icons = {
    close: 'M6 18L18 6M6 6l12 12',
    chevronDown: 'M19 9l-7 7-7-7',
    chevronUp: 'M5 15l7-7 7 7',
    chevronLeft: 'M15 19l-7-7 7-7',
    chevronRight: 'M9 5l7 7-7 7',
    check: 'M5 13l4 4L19 7',
    info: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    warning:
      'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
    error: 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z',
    success: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
    search: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
    copy: 'M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z',
    menu: 'M4 6h16M4 12h16M4 18h16',
    plus: 'M12 4v16m8-8H4',
    minus: 'M20 12H4'
  };

  const iconPath = $derived(icons[type] || icons.close);
  const iconClasses = $derived(`${size} ${className}`);
</script>

<svg
  class={iconClasses}
  fill="none"
  stroke={color}
  viewBox="0 0 24 24"
  xmlns="http://www.w3.org/2000/svg"
  {...restProps}
>
  <path stroke-linecap="round" stroke-linejoin="round" stroke-width={strokeWidth} d={iconPath} />
</svg>
