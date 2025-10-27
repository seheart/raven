<script>
  import { logger } from './logger.js';
  import { onMount, onDestroy } from 'svelte';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import { exportCSV, exportJSON } from './exportUtils.js';
  import { API_CONFIG } from '../config.js';

  let searchQuery = '';
  let results = [];
  let categories = {};
  let total = 0;
  let loading = false;
  let error = null;
  let filterType = 'all'; // all, event, conversation, error, notification

  const API_BASE = API_CONFIG.API_BASE;

  $: filteredResults = results.filter(r => {
    if (filterType === 'all') return true;
    return r.type === filterType;
  });

  let searchTimeout;
  function handleSearchInput() {
    clearTimeout(searchTimeout);
    if (searchQuery.trim().length < 2) {
      results = [];
      total = 0;
      return;
    }
    searchTimeout = setTimeout(() => {
      performSearch();
    }, 300); // Debounce
  }

  async function performSearch() {
    if (searchQuery.trim().length < 2) return;

    try {
      loading = true;
      const response = await fetch(`${API_BASE}/search/global?q=${encodeURIComponent(searchQuery)}&limit=100`);
      if (!response.ok) throw new Error('Search failed');

      const data = await response.json();
      results = data.results || [];
      categories = data.categories || {};
      total = data.total || 0;
      error = null;
    } catch (err) {
      logger.error('Search error:', err);
      error = err.message;
    } finally {
      loading = false;
    }
  }

  function getTypeLabel(type) {
    return {
      event: 'File Event',
      conversation: 'Conversation',
      error: 'Error',
      notification: 'Notification'
    }[type] || type;
  }

  function getTypeClass(type) {
    return `type-${type}`;
  }

  function formatTimestamp(timestamp) {
    return new Date(timestamp).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  function clearSearch() {
    searchQuery = '';
    results = [];
    total = 0;
  }

  function handleExportCSV() {
    const data = results.map(r => ({
      Type: getTypeLabel(r.type),
      Title: r.title,
      Description: r.description,
      Project: r.project_name || '',
      Timestamp: r.timestamp
    }));
    exportCSV(data, 'search-results');
  }

  function handleExportJSON() {
    const data = {
      query: searchQuery,
      total,
      results,
      exported_at: new Date().toISOString()
    };
    exportJSON(data, 'search-results');
  }

  // Focus search input on mount
  let searchInput;
  onMount(() => {
    if (searchInput) searchInput.focus();
  });

  onDestroy(() => {
    // Clean up pending timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
  });
</script>

<div class="global-search-panel" role="region" aria-label="Global search">
  <div class="panel-header">
    <div class="header-left">
      <h2 id="search-heading"><span aria-hidden="true">🔍</span> Global Search</h2>
      <p class="subtitle">Search across all projects, files, conversations, and events</p>
    </div>
    <div class="header-right" role="toolbar" aria-label="Search actions">
      {#if results.length > 0}
        <button class="btn-secondary" on:click={handleExportCSV} aria-label="Export results as CSV">Export CSV</button>
        <button class="btn-secondary" on:click={handleExportJSON} aria-label="Export results as JSON">Export JSON</button>
      {/if}
    </div>
  </div>

  <div class="search-bar-container" role="search" aria-labelledby="search-heading">
    <div class="search-bar">
      <span class="search-icon" aria-hidden="true">🔍</span>
      <input
        bind:this={searchInput}
        type="search"
        placeholder="Search files, conversations, errors, notifications..."
        bind:value={searchQuery}
        on:input={handleSearchInput}
        class="search-input"
        aria-label="Search query"
        aria-describedby="search-hint"
      />
      {#if searchQuery}
        <button class="clear-btn" on:click={clearSearch} aria-label="Clear search">✕</button>
      {/if}
    </div>
    <div class="search-hint" id="search-hint" role="status" aria-live="polite">
      {#if searchQuery.length > 0 && searchQuery.length < 2}
        <span>Type at least 2 characters to search</span>
      {:else if loading}
        <span>Searching...</span>
      {:else if total > 0}
        <span>Found {total} result{total !== 1 ? 's' : ''} for "{searchQuery}"</span>
      {:else if searchQuery.length >= 2}
        <span>No results found for "{searchQuery}"</span>
      {:else}
        <span>Start typing to search</span>
      {/if}
    </div>
  </div>

  {#if total > 0}
    <div class="filter-bar" role="tablist" aria-label="Filter search results">
      <button class="filter-btn" class:active={filterType === 'all'} on:click={() => filterType = 'all'} role="tab" aria-selected={filterType === 'all'} aria-controls="results-list">
        All ({total})
      </button>
      <button class="filter-btn" class:active={filterType === 'event'} on:click={() => filterType = 'event'} role="tab" aria-selected={filterType === 'event'} aria-controls="results-list">
        Files ({categories.events || 0})
      </button>
      <button class="filter-btn" class:active={filterType === 'conversation'} on:click={() => filterType = 'conversation'} role="tab" aria-selected={filterType === 'conversation'} aria-controls="results-list">
        Conversations ({categories.conversations || 0})
      </button>
      <button class="filter-btn" class:active={filterType === 'error'} on:click={() => filterType = 'error'} role="tab" aria-selected={filterType === 'error'} aria-controls="results-list">
        Errors ({categories.errors || 0})
      </button>
      <button class="filter-btn" class:active={filterType === 'notification'} on:click={() => filterType = 'notification'} role="tab" aria-selected={filterType === 'notification'} aria-controls="results-list">
        Notifications ({categories.notifications || 0})
      </button>
    </div>
  {/if}

  {#if loading}
    <div role="status" aria-live="polite" aria-busy="true"><LoadingSkeleton /></div>
  {:else if error}
    <div class="error-state" role="alert">
      <p>❌ Search error: {error}</p>
    </div>
  {:else if filteredResults.length > 0}
    <div class="results-list" id="results-list" role="feed" aria-label="Search results" aria-busy="false">
      {#each filteredResults as result (result.type + result.id)}
        <article class="result-card {getTypeClass(result.type)}" role="article">
          <div class="result-header">
            <span class="result-icon" aria-hidden="true">{result.icon}</span>
            <div class="result-meta">
              <div class="result-title">{result.title}</div>
              <div class="result-info">
                <span class="result-type">{getTypeLabel(result.type)}</span>
                {#if result.project_name}
                  <span class="result-project">📁 {result.project_name}</span>
                {/if}
                <time class="result-timestamp" datetime="{result.timestamp}">🕒 {formatTimestamp(result.timestamp)}</time>
              </div>
            </div>
          </div>
          {#if result.description}
            <div class="result-description">{result.description}</div>
          {/if}
        </article>
      {/each}
    </div>
  {:else if searchQuery.length === 0}
    <div class="empty-state" role="status">
      <div class="empty-icon">🔍</div>
      <p>Search across your entire Raven database</p>
      <p class="hint">Find files, conversations, errors, and notifications instantly</p>
      <div class="search-tips">
        <h3>Search Tips:</h3>
        <ul>
          <li>🔹 Search by filename: <code>server.js</code></li>
          <li>🔹 Find conversations: <code>claude</code></li>
          <li>🔹 Track errors: <code>failed</code></li>
          <li>🔹 Filter by project name</li>
        </ul>
      </div>
    </div>
  {/if}
</div>

<style>
  .global-search-panel {
    padding: 24px;
    max-width: 1400px;
    margin: 0 auto;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 24px;
  }

  .header-left h2 {
    margin: 0 0 4px 0;
    font-size: 24px;
    color: var(--text);
  }

  .subtitle {
    margin: 0;
    color: var(--muted);
    font-size: 14px;
  }

  .header-right {
    display: flex;
    gap: 12px;
  }

  .search-bar-container {
    margin-bottom: 24px;
  }

  .search-bar {
    position: relative;
    display: flex;
    align-items: center;
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: var(--radius);
    padding: 12px 16px;
    transition: all 0.2s;
  }

  .search-bar:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent);
  }

  .search-icon {
    font-size: 20px;
    margin-right: 12px;
  }

  .search-input {
    flex: 1;
    border: none;
    background: transparent;
    color: var(--text);
    font-size: 16px;
    font-family: var(--mono);
    outline: none;
  }

  .search-input::placeholder {
    color: var(--muted);
  }

  .clear-btn {
    padding: 4px 8px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--muted);
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s;
  }

  .clear-btn:hover {
    background: var(--surface-2);
    color: var(--text);
  }

  .search-hint {
    margin-top: 8px;
    font-size: 13px;
    color: var(--muted);
    font-family: var(--mono);
  }

  .filter-bar {
    display: flex;
    gap: 8px;
    margin-bottom: 24px;
    flex-wrap: wrap;
  }

  .filter-btn {
    padding: 8px 16px;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font-size: 13px;
    font-family: var(--mono);
    cursor: pointer;
    transition: all 0.2s;
  }

  .filter-btn:hover {
    border-color: var(--accent);
  }

  .filter-btn.active {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }

  .results-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .result-card {
    padding: 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-left: 4px solid;
    border-radius: var(--radius);
    transition: all 0.2s;
    cursor: pointer;
  }

  .result-card:hover {
    transform: translateX(4px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .result-card.type-event {
    border-left-color: var(--accent, #7aa2f7);
  }

  .result-card.type-conversation {
    border-left-color: var(--success, #10b981);
  }

  .result-card.type-error {
    border-left-color: var(--error, #f7768e);
  }

  .result-card.type-notification {
    border-left-color: var(--warning, #e0af68);
  }

  .result-header {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }

  .result-icon {
    font-size: 24px;
    flex-shrink: 0;
  }

  .result-meta {
    flex: 1;
    min-width: 0;
  }

  .result-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--text);
    font-family: var(--mono);
    margin-bottom: 6px;
    word-break: break-all;
  }

  .result-info {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    font-size: 12px;
    color: var(--muted);
  }

  .result-type {
    background: var(--bg);
    padding: 2px 8px;
    border-radius: 3px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .result-project, .result-timestamp {
    font-family: var(--mono);
  }

  .result-description {
    margin-top: 8px;
    font-size: 13px;
    color: var(--muted);
    line-height: 1.5;
    border-top: 1px solid var(--border);
    padding-top: 8px;
  }

  .empty-state {
    text-align: center;
    padding: 60px 20px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .empty-icon {
    font-size: 64px;
    margin-bottom: 16px;
  }

  .empty-state p {
    margin: 8px 0;
    color: var(--text);
  }

  .hint {
    font-size: 13px;
    color: var(--muted);
  }

  .search-tips {
    margin-top: 32px;
    text-align: left;
    max-width: 500px;
    margin-left: auto;
    margin-right: auto;
  }

  .search-tips h3 {
    font-size: 16px;
    color: var(--text);
    margin-bottom: 12px;
  }

  .search-tips ul {
    list-style: none;
    padding: 0;
  }

  .search-tips li {
    padding: 8px 0;
    color: var(--muted);
    font-size: 14px;
  }

  .search-tips code {
    background: var(--bg);
    padding: 2px 6px;
    border-radius: 3px;
    font-family: var(--mono);
    color: var(--accent);
  }

  .btn-secondary {
    padding: 8px 16px;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-secondary:hover {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .error-state {
    text-align: center;
    padding: 60px 20px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .error-state p {
    margin: 8px 0;
    color: var(--error, #f7768e);
  }

  @media (max-width: 768px) {
    .panel-header {
      flex-direction: column;
      gap: 16px;
    }

    .filter-bar {
      flex-direction: column;
    }

    .result-info {
      flex-direction: column;
      gap: 4px;
    }
  }
</style>
