<script>
  /**
   * Example component demonstrating VirtualScroll and debounce usage
   * This can be used as a template for updating EventFeed, ErrorLog, etc.
   */
  import { onMount } from 'svelte';
  import VirtualScroll from './VirtualScroll.svelte';
  import { debounceInput } from './utils/debounce.js';

  // Example data - replace with actual data fetching
  let allItems = [];
  let filteredItems = [];
  let searchQuery = '';
  let virtualScroll;

  // Generate example data
  onMount(() => {
    // In real usage, fetch from API
    allItems = Array.from({ length: 10000 }, (_, i) => ({
      id: i,
      timestamp: new Date(Date.now() - i * 60000).toISOString(),
      type: ['error', 'warning', 'info', 'success'][i % 4],
      message: `Event message ${i} - ${['Critical error', 'Warning detected', 'Info update', 'Success action'][i % 4]}`,
      details: `Additional details for event ${i}`
    }));
    filteredItems = allItems;
  });

  // Debounced search handler
  function handleSearch(event) {
    const query = event.detail.toLowerCase();
    searchQuery = query;

    if (query) {
      filteredItems = allItems.filter(item =>
        item.message.toLowerCase().includes(query) ||
        item.type.toLowerCase().includes(query) ||
        item.details.toLowerCase().includes(query)
      );
    } else {
      filteredItems = allItems;
    }

    // Reset scroll position when filtering
    if (virtualScroll) {
      virtualScroll.scrollToItem(0);
    }
  }

  // Type badge colors
  const typeColors = {
    error: 'var(--error)',
    warning: 'var(--warning)',
    info: 'var(--info)',
    success: 'var(--success)'
  };

  // Format timestamp for display
  function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }
</script>

<div class="virtual-list-example">
  <div class="header standard-section-header">
    <h2 class="standard-section-title">Virtual List Example</h2>
    <div class="controls">
      <input
        type="text"
        class="standard-input search-input"
        placeholder="Search events..."
        use:debounceInput={{ delay: 300 }}
        on:debounced={handleSearch}
        aria-label="Search events"
      />
      <span class="count-badge">{filteredItems.length} items</span>
    </div>
  </div>

  {#if filteredItems.length > 0}
    <VirtualScroll
      bind:this={virtualScroll}
      items={filteredItems}
      itemHeight={60}
      containerHeight={500}
      overscan={5}
      getKey={item => item.id}
      let:item
      let:index
    >
      <div class="list-item">
        <div class="item-header">
          <span class="timestamp">{formatTime(item.timestamp)}</span>
          <span
            class="type-badge"
            style="background: {typeColors[item.type]};"
          >
            {item.type.toUpperCase()}
          </span>
        </div>
        <div class="item-content">
          <div class="message">{item.message}</div>
          <div class="details">{item.details}</div>
        </div>
        <div class="item-index">#{index + 1}</div>
      </div>
    </VirtualScroll>
  {:else}
    <div class="empty-state">
      <p>No items found matching "{searchQuery}"</p>
    </div>
  {/if}
</div>

<style>
  .virtual-list-example {
    padding: var(--space-lg);
    background: var(--surface);
    border-radius: var(--radius-lg);
  }

  .header {
    margin-bottom: var(--space-md);
  }

  .controls {
    display: flex;
    align-items: center;
    gap: var(--gap-normal);
  }

  .search-input {
    flex: 1;
    max-width: 300px;
  }

  .count-badge {
    padding: var(--space-xs) var(--space-sm);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-family: var(--mono);
    font-size: 12px;
    color: var(--muted);
  }

  .list-item {
    display: flex;
    align-items: center;
    gap: var(--gap-normal);
    padding: var(--space-sm) 0;
    height: 100%;
    position: relative;
  }

  .item-header {
    display: flex;
    flex-direction: column;
    gap: var(--gap-tight);
    min-width: 100px;
  }

  .timestamp {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--muted);
  }

  .type-badge {
    display: inline-block;
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    font-family: var(--mono);
    font-size: 10px;
    font-weight: 600;
    color: white;
    text-align: center;
  }

  .item-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--gap-tight);
  }

  .message {
    font-family: var(--mono);
    font-size: 13px;
    color: var(--text);
    font-weight: 500;
  }

  .details {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--muted);
  }

  .item-index {
    position: absolute;
    right: var(--space-sm);
    top: 50%;
    transform: translateY(-50%);
    font-family: var(--mono);
    font-size: 10px;
    color: var(--muted);
    opacity: 0.5;
  }

  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 300px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }

  .empty-state p {
    font-family: var(--mono);
    font-size: 13px;
    color: var(--muted);
  }
</style>