<script>
  /**
   * Pagination Component - Raven UI Library
   * Page navigation with prev/next buttons and page numbers
   *
   * @component
   * @example
   * <Pagination
   *   bind:currentPage={page}
   *   totalPages={10}
   *   onPageChange={(page) => loadData(page)}
   * />
   */

  let {
    /** Current page (bindable, 1-indexed) */
    currentPage = $bindable(1),
    /** Total number of pages */
    totalPages = 1,
    /** Number of page buttons to show */
    siblingCount = 1,
    /** Show first/last buttons */
    showFirstLast = false,
    /** Size variant */
    size = 'md', // 'sm' | 'md' | 'lg'
    /** Additional CSS classes */
    class: className = '',
    /** Page change callback */
    onPageChange = undefined,
    ...restProps
  } = $props();

  // Generate page numbers to display
  const pageNumbers = $derived(() => {
    const pages = [];
    const totalNumbers = siblingCount * 2 + 3; // siblings + current + first + last
    const totalBlocks = totalNumbers + 2; // + 2 ellipsis

    if (totalPages <= totalBlocks) {
      // Show all pages
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      const leftSiblingIndex = Math.max(currentPage - siblingCount, 1);
      const rightSiblingIndex = Math.min(currentPage + siblingCount, totalPages);

      const showLeftEllipsis = leftSiblingIndex > 2;
      const showRightEllipsis = rightSiblingIndex < totalPages - 1;

      if (!showLeftEllipsis && showRightEllipsis) {
        const leftRange = 3 + 2 * siblingCount;
        for (let i = 1; i <= leftRange; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      } else if (showLeftEllipsis && !showRightEllipsis) {
        pages.push(1);
        pages.push('...');
        const rightRange = 3 + 2 * siblingCount;
        for (let i = totalPages - rightRange + 1; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = leftSiblingIndex; i <= rightSiblingIndex; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      }
    }

    return pages;
  });

  // Handle page change
  function goToPage(page) {
    if (page < 1 || page > totalPages || page === currentPage) return;
    currentPage = page;
    onPageChange?.(page);
  }

  // Size variants
  const sizes = {
    sm: 'text-sm px-2 py-1',
    md: 'text-base px-3 py-2',
    lg: 'text-lg px-4 py-2'
  };

  // Button classes
  const buttonBaseClasses =
    'min-w-[2.5rem] rounded border border-[var(--border)] font-medium transition-all duration-200 font-sans';
  const activeClasses = 'bg-[var(--accent)] text-white border-[var(--accent)]';
  const inactiveClasses =
    'bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-2)] hover:border-[var(--accent)]';
  const disabledClasses = 'opacity-50 cursor-not-allowed';

  function getButtonClasses(page) {
    const sizeClass = sizes[size];
    if (page === '...') {
      return `${buttonBaseClasses} ${sizeClass} ${inactiveClasses} cursor-default`;
    }
    const isActive = page === currentPage;
    return `${buttonBaseClasses} ${sizeClass} ${isActive ? activeClasses : inactiveClasses} cursor-pointer`;
  }

  // Container classes
  const containerClasses = `flex items-center gap-2 ${className}`;
</script>

<nav class={containerClasses} aria-label="Pagination" {...restProps}>
  <!-- First Page Button -->
  {#if showFirstLast}
    <button
      type="button"
      class="{buttonBaseClasses} {sizes[size]} {currentPage === 1
        ? disabledClasses
        : inactiveClasses}"
      disabled={currentPage === 1}
      onclick={() => goToPage(1)}
      aria-label="First page"
    >
      «
    </button>
  {/if}

  <!-- Previous Button -->
  <button
    type="button"
    class="{buttonBaseClasses} {sizes[size]} {currentPage === 1
      ? disabledClasses
      : inactiveClasses}"
    disabled={currentPage === 1}
    onclick={() => goToPage(currentPage - 1)}
    aria-label="Previous page"
  >
    ‹
  </button>

  <!-- Page Numbers -->
  {#each pageNumbers as page, i (i)}
    {#if page === '...'}
      <span class={getButtonClasses(page)}>...</span>
    {:else}
      <button
        type="button"
        class={getButtonClasses(page)}
        onclick={() => goToPage(page)}
        aria-label="Page {page}"
        aria-current={page === currentPage ? 'page' : undefined}
      >
        {page}
      </button>
    {/if}
  {/each}

  <!-- Next Button -->
  <button
    type="button"
    class="{buttonBaseClasses} {sizes[size]} {currentPage === totalPages
      ? disabledClasses
      : inactiveClasses}"
    disabled={currentPage === totalPages}
    onclick={() => goToPage(currentPage + 1)}
    aria-label="Next page"
  >
    ›
  </button>

  <!-- Last Page Button -->
  {#if showFirstLast}
    <button
      type="button"
      class="{buttonBaseClasses} {sizes[size]} {currentPage === totalPages
        ? disabledClasses
        : inactiveClasses}"
      disabled={currentPage === totalPages}
      onclick={() => goToPage(totalPages)}
      aria-label="Last page"
    >
      »
    </button>
  {/if}
</nav>
