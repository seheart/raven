<script>
  /**
   * Stat Component - Raven UI Library
   * Display key metrics, statistics, and KPIs with optional trends
   *
   * @component
   * @example
   * <Stat
   *   label="Active Agents"
   *   value="127"
   *   icon=""
   * />
   *
   * @example
   * <Stat
   *   label="Error Rate"
   *   value="0.3%"
   *   trend="down"
   *   trendValue="-12%"
   *   variant="success"
   * />
   */

  let {
    /** Stat label/title */
    label = '',
    /** Main value to display */
    value = '',
    /** Optional icon (emoji or text) */
    icon = '',
    /** Description/helper text */
    description = '',
    /** Trend direction */
    trend = undefined, // 'up' | 'down' | 'neutral' | undefined
    /** Trend value (e.g., "+12%", "-5%") */
    trendValue = '',
    /** Color variant */
    variant = 'default', // 'default' | 'primary' | 'success' | 'error' | 'warning' | 'info'
    /** Size variant */
    size = 'md', // 'sm' | 'md' | 'lg'
    /** Show as card */
    card = true,
    /** Additional CSS classes */
    class: className = '',
    ...restProps
  } = $props();

  // Variant styles
  const variants = {
    default: {
      bg: 'bg-[var(--surface)]',
      value: 'text-[var(--text-heading)]',
      label: 'text-[var(--muted)]'
    },
    primary: {
      bg: 'bg-[var(--accent)] bg-opacity-10',
      value: 'text-[var(--accent)]',
      label: 'text-[var(--text)]'
    },
    success: {
      bg: 'bg-[var(--success)] bg-opacity-10',
      value: 'text-[var(--success)]',
      label: 'text-[var(--text)]'
    },
    error: {
      bg: 'bg-[var(--error)] bg-opacity-10',
      value: 'text-[var(--error)]',
      label: 'text-[var(--text)]'
    },
    warning: {
      bg: 'bg-[var(--warning)] bg-opacity-10',
      value: 'text-[var(--warning)]',
      label: 'text-[var(--text)]'
    },
    info: {
      bg: 'bg-[var(--info)] bg-opacity-10',
      value: 'text-[var(--info)]',
      label: 'text-[var(--text)]'
    }
  };

  // Size variants
  const sizes = {
    sm: {
      value: 'text-xl',
      label: 'text-xs',
      icon: 'text-2xl',
      padding: 'p-3'
    },
    md: {
      value: 'text-3xl',
      label: 'text-sm',
      icon: 'text-3xl',
      padding: 'p-4'
    },
    lg: {
      value: 'text-4xl',
      label: 'text-base',
      icon: 'text-4xl',
      padding: 'p-6'
    }
  };

  // Trend icons and colors
  const trendIcons = {
    up: '',
    down: '',
    neutral: '→'
  };

  const trendColors = {
    up: 'text-[var(--success)]',
    down: 'text-[var(--error)]',
    neutral: 'text-[var(--muted)]'
  };

  // Base classes
  const baseClasses = $derived(card
    ? `rounded-lg border border-[var(--border)] transition-all duration-200 ${sizes[size].padding}`
    : sizes[size].padding);

  // Container classes
  const containerClasses = $derived(`${baseClasses} ${variants[variant].bg} ${className}`);
</script>

<div class={containerClasses} {...restProps}>
  <div class="flex items-start justify-between gap-3">
    <div class="flex-1 min-w-0">
      <!-- Label -->
      <div
        class="text-sm font-medium uppercase tracking-wide font-sans {variants[variant].label} mb-1"
      >
        {label}
      </div>

      <!-- Value -->
      <div
        class="font-bold font-mono {sizes[size].value} {variants[variant].value} leading-none mb-1"
      >
        {value}
      </div>

      <!-- Description -->
      {#if description}
        <div class="text-xs text-[var(--muted)] font-sans mt-1">
          {description}
        </div>
      {/if}

      <!-- Trend -->
      {#if trend && trendValue}
        <div class="flex items-center gap-1 mt-2">
          <span class="text-lg {trendColors[trend]}" aria-label={`Trend ${trend}`}>
            {trendIcons[trend]}
          </span>
          <span class="text-sm font-semibold font-sans {trendColors[trend]}">
            {trendValue}
          </span>
        </div>
      {/if}
    </div>

    <!-- Icon -->
    {#if icon}
      <div class="{sizes[size].icon} opacity-30 flex-shrink-0">
        {icon}
      </div>
    {/if}
  </div>
</div>
