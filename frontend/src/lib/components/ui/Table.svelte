<script>
  /**
   * Table Component - Raven UI Library
   * A flexible, theme-aware table for displaying tabular data
   *
   * @component
   * @example
   * <Table
   *   headers={['Name', 'Status', 'Time']}
   *   rows={[
   *     ['Agent 1', 'Active', '2m ago'],
   *     ['Agent 2', 'Idle', '5m ago']
   *   ]}
   * />
   *
   * @example
   * <Table variant="bordered" striped={true} hoverable={true}>
   *   <!-- Custom table content -->
   * </Table>
   */

  import { buildTableClasses, buildHoverClasses, cx } from '$lib/utils/classBuilder.js';

  let {
    /** Table headers (array of strings or objects) */
    headers = [],
    /** Table rows (array of arrays) */
    rows = [],
    /** Table variant */
    variant = 'default', // 'default' | 'bordered' | 'borderless' | 'compact'
    /** Striped rows (zebra stripes) */
    striped = false,
    /** Hoverable rows */
    hoverable = true,
    /** Dense/compact spacing */
    dense = false,
    /** Full width */
    fullWidth = true,
    /** Row click handler */
    onRowClick = undefined,
    /** Additional CSS classes */
    class: className = '',
    /** Custom content via children slot */
    children,
    ...restProps
  } = $props();

  // Variant styles
  const variants = {
    default: 'border border-[var(--border)]',
    bordered: 'border-2 border-[var(--border)]',
    borderless: '',
    compact: 'border border-[var(--border)]'
  };

  // Combine table container classes
  const containerClasses = $derived(
    cx(
      'bg-[var(--surface)] rounded-lg overflow-hidden',
      variants[variant],
      fullWidth && 'w-full',
      className
    )
  );

  // Table element classes
  const tableClasses = $derived(
    buildTableClasses({
      variant,
      striped,
      hoverable,
      className: 'border-collapse'
    })
  );

  // Header cell classes
  const thClasses = $derived(
    cx(
      dense ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-sm',
      'text-left font-bold text-[var(--text-heading)] bg-[var(--surface-2)]',
      'border-b-2 border-[var(--border)] uppercase tracking-wide font-sans'
    )
  );

  // Body cell classes
  const tdClasses = $derived(
    cx(
      dense ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-sm',
      'text-[var(--text)] border-b border-[var(--border)] font-sans'
    )
  );

  // Row classes
  const getRowClasses = index => {
    return cx(
      'transition-colors duration-150',
      striped && index % 2 === 1 && 'bg-[var(--surface-2)] bg-opacity-30',
      buildHoverClasses(hoverable),
      onRowClick && 'cursor-pointer'
    );
  };

  // Handle row click
  const handleRowClick = (row, index) => {
    if (onRowClick) {
      onRowClick(row, index);
    }
  };
</script>

<div class={containerClasses} {...restProps}>
  <table class={tableClasses}>
    {#if children}
      <!-- Custom table content via slot -->
      {@render children?.()}
    {:else}
      <!-- Auto-generated table from headers/rows -->
      {#if headers.length > 0}
        <thead>
          <tr>
            {#each headers as header, i (i)}
              <th class={thClasses}>
                {typeof header === 'string' ? header : header.label || ''}
              </th>
            {/each}
          </tr>
        </thead>
      {/if}

      {#if rows.length > 0}
        <tbody>
          {#each rows as row, index (index)}
            <tr
              class={getRowClasses(index)}
              onclick={() => handleRowClick(row, index)}
              role={onRowClick ? 'button' : undefined}
              tabindex={onRowClick ? 0 : undefined}
              onkeydown={e => e.key === 'Enter' && onRowClick && handleRowClick(row, index)}
            >
              {#each row as cell, j (j)}
                <td class={tdClasses}>
                  {cell}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      {/if}
    {/if}
  </table>

  {#if rows.length === 0 && !children}
    <div class="p-8 text-center text-[var(--muted)] font-sans text-sm">No data available</div>
  {/if}
</div>
