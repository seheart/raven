<script>
  import { tick, onDestroy } from 'svelte';

  // Props using Svelte 5 runes
  let {
    items = [],
    itemHeight = 40,
    containerHeight = 400,
    overscan = 3,
    getKey = (item, index) => index,
    children
  } = $props();

  // State
  let containerElement;
  let scrollTop = $state(0);

  // Computed values using $derived for better performance
  const totalHeight = $derived(items.length * itemHeight);
  const visibleStart = $derived(Math.max(0, Math.floor(scrollTop / itemHeight) - overscan));
  const visibleEnd = $derived(
    Math.min(items.length, Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan)
  );
  const visibleItems = $derived(items.slice(visibleStart, visibleEnd));
  const offsetY = $derived(visibleStart * itemHeight);

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
    const targetScrollTop = Math.max(
      0,
      Math.min((items.length - 1) * itemHeight, index * itemHeight)
    );
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
  onscroll={handleScroll}
  style="height: {containerHeight}px;"
  role="list"
  aria-label="Virtual scrollable list with {items.length} items"
  aria-live="polite"
  tabindex="-1"
>
  <div class="virtual-scroll-spacer" style="height: {totalHeight}px;">
    <div class="virtual-scroll-content" style="transform: translateY({offsetY}px);">
      {#each visibleItems as item, i (getKey(item, visibleStart + i))}
        <div class="virtual-scroll-item" style="height: {itemHeight}px;" role="listitem">
          {@render children(item, visibleStart + i)}
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
  }

  .virtual-scroll-spacer {
    position: relative;
  }

  .virtual-scroll-content {
    position: absolute;
    width: 100%;
    left: 0;
    top: 0;
  }

  .virtual-scroll-item {
    overflow: hidden;
  }
</style>
