<script>
  import { onMount, onDestroy, tick } from 'svelte';

  // Props
  export let items = [];
  export let itemHeight = 40;
  export let containerHeight = 400;
  export let overscan = 3; // Extra items to render outside viewport
  export let getKey = (item, index) => index; // Function to get unique key for each item

  // State
  let containerElement;
  let scrollTop = 0;
  let visibleStart = 0;
  let visibleEnd = 0;

  // Computed values
  $: totalHeight = items.length * itemHeight;
  $: visibleCount = Math.ceil(containerHeight / itemHeight);
  $: {
    visibleStart = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    visibleEnd = Math.min(items.length, Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan);
  }
  $: visibleItems = items.slice(visibleStart, visibleEnd);
  $: offsetY = visibleStart * itemHeight;

  // Scroll handler with RAF for smooth performance
  let rafId;
  function handleScroll(e) {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      scrollTop = e.target.scrollTop;
    });
  }

  // Cleanup
  onDestroy(() => {
    if (rafId) cancelAnimationFrame(rafId);
  });

  // Public API to scroll to an item
  export async function scrollToItem(index) {
    if (!containerElement) return;
    const targetScrollTop = Math.max(0, Math.min((items.length - 1) * itemHeight, index * itemHeight));
    containerElement.scrollTop = targetScrollTop;
    await tick();
  }

  // Public API to refresh the list
  export async function refresh() {
    await tick();
    if (containerElement) {
      handleScroll({ target: containerElement });
    }
  }
</script>

<div
  class="virtual-scroll-container"
  bind:this={containerElement}
  on:scroll={handleScroll}
  style="height: {containerHeight}px;"
  role="list"
  aria-label="Scrollable list"
  tabindex="0"
>
  <div class="virtual-scroll-spacer" style="height: {totalHeight}px;">
    <div
      class="virtual-scroll-content"
      style="transform: translateY({offsetY}px);"
    >
      {#each visibleItems as item, i (getKey(item, visibleStart + i))}
        <div
          class="virtual-scroll-item"
          style="height: {itemHeight}px;"
          role="listitem"
        >
          <slot {item} index={visibleStart + i} />
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .virtual-scroll-container {
    overflow-y: auto;
    overflow-x: hidden;
    position: relative;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }

  .virtual-scroll-container:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .virtual-scroll-spacer {
    position: relative;
  }

  .virtual-scroll-content {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
  }

  .virtual-scroll-item {
    display: flex;
    align-items: center;
    padding: 0 var(--space-md);
    border-bottom: 1px solid var(--border);
    transition: background var(--transition-fast);
  }

  .virtual-scroll-item:hover {
    background: var(--surface);
  }

  /* Custom scrollbar styling */
  .virtual-scroll-container::-webkit-scrollbar {
    width: 8px;
  }

  .virtual-scroll-container::-webkit-scrollbar-track {
    background: var(--surface);
    border-radius: var(--radius-sm);
  }

  .virtual-scroll-container::-webkit-scrollbar-thumb {
    background: var(--muted);
    border-radius: var(--radius-sm);
    transition: background var(--transition-fast);
  }

  .virtual-scroll-container::-webkit-scrollbar-thumb:hover {
    background: var(--accent);
  }

  /* Firefox scrollbar */
  .virtual-scroll-container {
    scrollbar-width: thin;
    scrollbar-color: var(--muted) var(--surface);
  }
</style>
