<script>
  import { logger } from '../logger.js';
  import { api } from '../apiClient.js';
  /**
   * Activity Search Page
   * Global search across all activity data
   */

  // State
  let searchQuery = $state('');
  let searchType = $state('all'); // all, files, messages, agents
  let results = $state([]);
  let loading = $state(false);
  let hasSearched = $state(false);
  let searchTime = $state(0);

  // Derived
  const filteredResults = $derived.by(() => {
    let filtered = results;

    if (searchType !== 'all') {
      filtered = filtered.filter(r => {
        switch (searchType) {
          case 'files':
            return r.filepath;
          case 'messages':
            return r.message;
          case 'agents':
            return r.agent;
          default:
            return true;
        }
      });
    }

    return filtered;
  });

  const stats = $derived.by(() => {
    const byType = {
      create: results.filter(r => r.change_type === 'create').length,
      edit: results.filter(r => r.change_type === 'edit').length,
      delete: results.filter(r => r.change_type === 'delete').length,
      read: results.filter(r => r.change_type === 'read').length,
      execute: results.filter(r => r.change_type === 'execute').length
    };

    const filesFound = new Set(results.filter(r => r.filepath).map(r => r.filepath)).size;
    const agentsFound = new Set(results.filter(r => r.agent).map(r => r.agent)).size;

    return { byType, filesFound, agentsFound };
  });

  // Perform search
  async function performSearch() {
    if (!searchQuery.trim()) {
      results = [];
      hasSearched = false;
      return;
    }

    try {
      loading = true;
      hasSearched = true;
      const startTime = performance.now();

      // Search across multiple endpoints
      const [eventsResp] = await Promise.all([
        api.get('/all-agent-events?limit=1000').catch(() => ({ json: async () => [] })),
        api.get('/tracked-files').catch(() => ({ json: async () => ({ files: [] }) }))
      ]);

      const eventsData = await eventsResp.json();

      const allEvents = Array.isArray(eventsData) ? eventsData : [];
      const query = searchQuery.toLowerCase();

      // Filter events based on search query
      const matchedEvents = allEvents.filter(event => {
        const filepath = event.filepath || event.file;
        const changeType = event.change_type || event.event_type;
        return (
          filepath?.toLowerCase().includes(query) ||
          event.message?.toLowerCase().includes(query) ||
          event.agent?.toLowerCase().includes(query) ||
          changeType?.toLowerCase().includes(query)
        );
      });

      results = matchedEvents;
      const endTime = performance.now();
      searchTime = Math.round(endTime - startTime);
      loading = false;
    } catch (error) {
      logger.error('Search failed:', error);
      results = [];
      loading = false;
    }
  }

  function handleKeyPress(event) {
    if (event.key === 'Enter') {
      performSearch();
    }
  }

  function highlightMatch(text, query) {
    if (!text || !query) return text || '';
    const regex = new RegExp(`(${query})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  }

  function getEventIcon(changeType) {
    switch (changeType) {
      case 'create':
        return '➕';
      case 'edit':
        return '✏️';
      case 'delete':
        return '🗑️';
      case 'read':
        return '👁️';
      case 'execute':
        return '⚡';
      default:
        return '📝';
    }
  }

  function getEventColor(changeType) {
    switch (changeType) {
      case 'create':
        return 'var(--success)';
      case 'edit':
        return 'var(--accent)';
      case 'delete':
        return 'var(--error)';
      case 'read':
        return 'var(--muted)';
      case 'execute':
        return 'var(--warning)';
      default:
        return 'var(--text)';
    }
  }

  function formatTimestamp(timestamp) {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleString();
  }
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-6xl mx-auto">
    <!-- Header -->
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">Global Search</h1>
      <p class="text-base text-[var(--muted)] font-sans">
        Search across all files, events, and activity
      </p>
    </div>

    <!-- Search Bar -->
    <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6 mb-6">
      <div class="flex gap-3 mb-4">
        <div class="flex-1">
          <input
            type="text"
            bind:value={searchQuery}
            onkeypress={handleKeyPress}
            placeholder="Search for files, messages, agents, or event types..."
            class="w-full px-4 py-3 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-base font-sans text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)]"
            autofocus
          />
        </div>
        <button
          onclick={performSearch}
          disabled={loading || !searchQuery.trim()}
          class="px-6 py-3 bg-[var(--accent)] text-white rounded-lg text-base font-sans hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? '🔍 Searching...' : '🔍 Search'}
        </button>
      </div>

      <!-- Search Type Filter -->
      <div class="flex flex-wrap gap-2">
        <button
          onclick={() => (searchType = 'all')}
          class="px-3 py-1.5 rounded text-sm font-sans transition-colors"
          class:bg-accent={searchType === 'all'}
          class:text-white={searchType === 'all'}
          class:bg-bg={searchType !== 'all'}
          class:border={searchType !== 'all'}
          class:border-border={searchType !== 'all'}
        >
          All Results
        </button>
        <button
          onclick={() => (searchType = 'files')}
          class="px-3 py-1.5 rounded text-sm font-sans transition-colors"
          class:bg-accent={searchType === 'files'}
          class:text-white={searchType === 'files'}
          class:bg-bg={searchType !== 'files'}
          class:border={searchType !== 'files'}
          class:border-border={searchType !== 'files'}
        >
          Files Only
        </button>
        <button
          onclick={() => (searchType = 'messages')}
          class="px-3 py-1.5 rounded text-sm font-sans transition-colors"
          class:bg-accent={searchType === 'messages'}
          class:text-white={searchType === 'messages'}
          class:bg-bg={searchType !== 'messages'}
          class:border={searchType !== 'messages'}
          class:border-border={searchType !== 'messages'}
        >
          Messages Only
        </button>
        <button
          onclick={() => (searchType = 'agents')}
          class="px-3 py-1.5 rounded text-sm font-sans transition-colors"
          class:bg-accent={searchType === 'agents'}
          class:text-white={searchType === 'agents'}
          class:bg-bg={searchType !== 'agents'}
          class:border={searchType !== 'agents'}
          class:border-border={searchType !== 'agents'}
        >
          Agents Only
        </button>
      </div>
    </div>

    <!-- Search Results -->
    {#if loading}
      <div class="text-center py-12">
        <div class="text-4xl mb-4">🔍</div>
        <div class="text-[var(--muted)] font-sans">Searching...</div>
      </div>
    {:else if !hasSearched}
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center">
        <div class="text-5xl mb-4">🔍</div>
        <div class="text-xl font-semibold text-[var(--text-heading)] mb-2">Start Searching</div>
        <div class="text-base text-[var(--muted)] font-sans">
          Enter a search term to find files, events, and activity
        </div>
      </div>
    {:else if filteredResults.length === 0}
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center">
        <div class="text-5xl mb-4">🔎</div>
        <div class="text-xl font-semibold text-[var(--text-heading)] mb-2">No Results Found</div>
        <div class="text-base text-[var(--muted)] font-sans">
          No matches for "{searchQuery}". Try a different search term.
        </div>
      </div>
    {:else}
      <!-- Results Header -->
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 mb-4">
        <div class="flex justify-between items-center">
          <div>
            <div class="text-lg font-semibold text-[var(--text-heading)] font-sans">
              Found {filteredResults.length} result{filteredResults.length !== 1 ? 's' : ''}
            </div>
            <div class="text-sm text-[var(--muted)] font-sans">
              Search completed in {searchTime}ms
            </div>
          </div>
          <div class="flex gap-4 text-sm text-[var(--muted)] font-sans">
            {#if stats.filesFound > 0}
              <span>📄 {stats.filesFound} files</span>
            {/if}
            {#if stats.agentsFound > 0}
              <span>🤖 {stats.agentsFound} agents</span>
            {/if}
          </div>
        </div>
      </div>

      <!-- Stats -->
      {#if results.length > 0}
        <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 text-center">
            <div class="text-sm text-[var(--muted)] font-sans mb-1">Created</div>
            <div class="text-xl font-bold text-[var(--success)]">{stats.byType.create}</div>
          </div>
          <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 text-center">
            <div class="text-sm text-[var(--muted)] font-sans mb-1">Edited</div>
            <div class="text-xl font-bold text-[var(--accent)]">{stats.byType.edit}</div>
          </div>
          <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 text-center">
            <div class="text-sm text-[var(--muted)] font-sans mb-1">Deleted</div>
            <div class="text-xl font-bold text-[var(--error)]">{stats.byType.delete}</div>
          </div>
          <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 text-center">
            <div class="text-sm text-[var(--muted)] font-sans mb-1">Read</div>
            <div class="text-xl font-bold text-[var(--text)]">{stats.byType.read}</div>
          </div>
          <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 text-center">
            <div class="text-sm text-[var(--muted)] font-sans mb-1">Execute</div>
            <div class="text-xl font-bold text-[var(--warning)]">{stats.byType.execute}</div>
          </div>
        </div>
      {/if}

      <!-- Results List -->
      <div class="space-y-3">
        {#each filteredResults as result (result.id || result.timestamp)}
          <div
            class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 hover:border-[var(--accent)] transition-colors"
          >
            <div class="flex items-start gap-3">
              <span class="text-2xl flex-shrink-0"
                >{getEventIcon(result.change_type || result.event_type)}</span
              >
              <div class="flex-1 min-w-0">
                <div class="flex items-baseline gap-3 mb-2">
                  <span
                    class="text-xs px-2 py-1 rounded font-semibold"
                    style="background: {getEventColor(
                      result.change_type || result.event_type
                    )}20; color: {getEventColor(result.change_type || result.event_type)}"
                  >
                    {(result.change_type || result.event_type)?.toUpperCase() || 'UNKNOWN'}
                  </span>
                  <span class="text-sm text-[var(--muted)] font-sans">
                    {formatTimestamp(result.timestamp)}
                  </span>
                </div>

                {#if result.filepath || result.file}
                  <div class="text-base font-medium text-[var(--text)] font-mono mb-1">
                    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                    {@html highlightMatch(result.filepath || result.file, searchQuery)}
                  </div>
                {/if}

                {#if result.message}
                  <div class="text-sm text-[var(--muted)] font-sans mb-2">
                    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                    {@html highlightMatch(result.message, searchQuery)}
                  </div>
                {/if}

                <div class="flex flex-wrap gap-3 text-xs text-[var(--muted)]">
                  {#if result.agent}
                    <span class="font-mono"
                      >🤖
                      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                      {@html highlightMatch(result.agent, searchQuery)}</span
                    >
                  {/if}
                  {#if result.event_size}
                    <span class="font-mono">📦 {result.event_size}B</span>
                  {/if}
                  {#if result.duration_ms}
                    <span class="font-mono">⏱️ {result.duration_ms}ms</span>
                  {/if}
                </div>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .bg-accent {
    background: var(--accent);
  }
  .text-white {
    color: white;
  }
  .bg-bg {
    background: var(--bg);
  }
  .border {
    border-width: 1px;
  }
  .border-border {
    border-color: var(--border);
  }

  :global(mark) {
    background: rgba(99, 102, 241, 0.3);
    color: var(--accent);
    padding: 2px 4px;
    border-radius: 3px;
    font-weight: 600;
  }
</style>
