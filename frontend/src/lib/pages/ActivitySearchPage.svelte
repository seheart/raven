<script>
  import { onDestroy } from 'svelte';
  import DOMPurify from 'dompurify';
  import { logger } from '../logger.js';
  import { formatDateTime } from '../timeFormat.js';
  import { createPageApi } from '../apiClient.js';
  const { api, abort: abortRequests } = createPageApi();

  onDestroy(() => abortRequests());
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
    const filesFound = new Set(results.filter(r => r.filepath).map(r => r.filepath)).size;
    const agentsFound = new Set(results.filter(r => r.agent).map(r => r.agent)).size;
    const fileChanges = results.filter(r => r.source === 'file').length;
    const agentEvents = results.filter(r => r.source === 'agent').length;

    return { filesFound, agentsFound, fileChanges, agentEvents };
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
      const query = searchQuery.toLowerCase();

      // Search both file events and agent events
      const [fileEvents, agentEvents] = await Promise.all([
        api.get('/file-events?limit=500&diff=false').catch(() => []),
        api.get('/all-agent-events?limit=500').catch(() => [])
      ]);

      const fileArray = Array.isArray(fileEvents) ? fileEvents : [];
      const agentArray = Array.isArray(agentEvents) ? agentEvents : [];

      // Normalize and filter file events
      const matchedFiles = fileArray
        .filter(
          e =>
            e.filepath?.toLowerCase().includes(query) ||
            e.change_type?.toLowerCase().includes(query)
        )
        .map(e => ({
          ...e,
          filepath: e.filepath,
          change_type: e.change_type,
          source: 'file'
        }));

      // Normalize and filter agent events
      const matchedAgent = agentArray
        .filter(
          e =>
            (e.file || '').toLowerCase().includes(query) ||
            (e.message || '').toLowerCase().includes(query) ||
            (e.agent || '').toLowerCase().includes(query) ||
            (e.event_type || '').toLowerCase().includes(query)
        )
        .map(e => ({
          ...e,
          filepath: e.file || e.filepath,
          change_type: e.event_type,
          source: 'agent'
        }));

      // Combine and sort by timestamp
      results = [...matchedFiles, ...matchedAgent].sort(
        (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
      );

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
    // Escape the query to prevent regex injection
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    const highlighted = text.replace(regex, '<mark>$1</mark>');
    // Sanitize to prevent XSS attacks
    return DOMPurify.sanitize(highlighted, { ALLOWED_TAGS: ['mark'], ALLOWED_ATTR: [] });
  }

  function getEventColor(changeType) {
    switch (changeType) {
    case 'add':
    case 'create':
      return 'var(--success)';
    case 'change':
    case 'edit':
    case 'modified':
      return 'var(--accent)';
    case 'unlink':
    case 'delete':
      return 'var(--error)';
    case 'tool_call':
      return 'var(--warning)';
    case 'tool_result':
      return 'var(--info)';
    case 'user_message':
      return 'var(--accent)';
    case 'assistant_text':
      return 'var(--info)';
    default:
      return 'var(--muted)';
    }
  }

  function formatTimestamp(timestamp) {
    if (!timestamp) return 'N/A';
    return formatDateTime(timestamp);
  }
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-none">
    <!-- Header -->
    <div class="flex justify-between items-start mb-6 flex-wrap gap-4">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">Global Search</h1>
        <p class="text-sm text-[var(--muted)] font-sans">
          Search across all files, events, and activity
        </p>
      </div>
    </div>

    <!-- Search Bar -->
    <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 mb-6">
      <div class="flex gap-3 mb-3">
        <input
          type="text"
          bind:value={searchQuery}
          onkeypress={handleKeyPress}
          placeholder="Search files, messages, agents..."
          class="flex-1 px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-mono text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)]"
        />
        <button
          onclick={performSearch}
          disabled={loading || !searchQuery.trim()}
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors disabled:opacity-50"
        >
          {loading ? '...' : '↻'} Search
        </button>
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          onclick={() => (searchType = 'all')}
          class="px-3 py-1.5 rounded text-sm font-sans transition-colors"
          class:bg-[var(--accent)]={searchType === 'all'}
          class:text-white={searchType === 'all'}
          class:bg-[var(--bg)]={searchType !== 'all'}
          class:border={searchType !== 'all'}
          class:border-[var(--border)]={searchType !== 'all'}
        >
          All Results
        </button>
        <button
          onclick={() => (searchType = 'files')}
          class="px-3 py-1.5 rounded text-sm font-sans transition-colors"
          class:bg-[var(--accent)]={searchType === 'files'}
          class:text-white={searchType === 'files'}
          class:bg-[var(--bg)]={searchType !== 'files'}
          class:border={searchType !== 'files'}
          class:border-[var(--border)]={searchType !== 'files'}
        >
          Files Only
        </button>
        <button
          onclick={() => (searchType = 'messages')}
          class="px-3 py-1.5 rounded text-sm font-sans transition-colors"
          class:bg-[var(--accent)]={searchType === 'messages'}
          class:text-white={searchType === 'messages'}
          class:bg-[var(--bg)]={searchType !== 'messages'}
          class:border={searchType !== 'messages'}
          class:border-[var(--border)]={searchType !== 'messages'}
        >
          Messages Only
        </button>
        <button
          onclick={() => (searchType = 'agents')}
          class="px-3 py-1.5 rounded text-sm font-sans transition-colors"
          class:bg-[var(--accent)]={searchType === 'agents'}
          class:text-white={searchType === 'agents'}
          class:bg-[var(--bg)]={searchType !== 'agents'}
          class:border={searchType !== 'agents'}
          class:border-[var(--border)]={searchType !== 'agents'}
        >
          Agents Only
        </button>
      </div>
    </div>

    <!-- Search Results -->
    {#if loading}
      <div class="text-center py-12">
        <div class="text-sm text-[var(--muted)] font-sans">Searching...</div>
      </div>
    {:else if !hasSearched}
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center">
        <div class="text-sm font-semibold text-[var(--text-heading)] mb-2">Start Searching</div>
        <div class="text-sm text-[var(--muted)] font-sans">
          Enter a search term to find files, events, and activity
        </div>
      </div>
    {:else if filteredResults.length === 0}
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center">
        <div class="text-sm font-semibold text-[var(--text-heading)] mb-2">No Results Found</div>
        <div class="text-sm text-[var(--muted)] font-sans">
          No matches for "{searchQuery}". Try a different search term.
        </div>
      </div>
    {:else}
      <!-- Results Header -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
          <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
            Results
          </div>
          <div class="text-sm font-mono text-[var(--text)]">
            {filteredResults.length} in {searchTime}ms
          </div>
        </div>
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
          <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
            Unique Files
          </div>
          <div class="text-sm font-mono text-[var(--text)]">{stats.filesFound}</div>
        </div>
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
          <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
            File Changes
          </div>
          <div class="text-sm font-mono text-[var(--text)]">{stats.fileChanges}</div>
        </div>
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
          <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
            Agent Events
          </div>
          <div class="text-sm font-mono text-[var(--text)]">{stats.agentEvents}</div>
        </div>
      </div>

      <!-- Results List -->
      <div class="space-y-3">
        {#each filteredResults as result (result.id || result.timestamp)}
          <div
            class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 hover:border-[var(--accent)] transition-colors"
            style="border-left: 3px solid {getEventColor(result.change_type)}"
          >
            <div class="flex justify-between items-start mb-2">
              <div class="flex items-center gap-2">
                <span
                  class="text-xs px-2 py-0.5 rounded font-semibold font-mono"
                  style="background: {getEventColor(result.change_type)}15; color: {getEventColor(
                    result.change_type
                  )}"
                >
                  {result.change_type?.toUpperCase() || 'EVENT'}
                </span>
                {#if result.agent}
                  <span class="text-xs text-[var(--muted)] font-mono">
                    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                    {@html highlightMatch(result.agent, searchQuery)}
                  </span>
                {/if}
              </div>
              <span class="text-xs text-[var(--muted)] font-mono flex-shrink-0">
                {formatTimestamp(result.timestamp)}
              </span>
            </div>

            {#if result.filepath}
              <div class="text-sm font-mono text-[var(--text)] truncate mb-1">
                <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                {@html highlightMatch(result.filepath, searchQuery)}
              </div>
            {/if}

            {#if result.message}
              <div class="text-xs text-[var(--muted)] font-mono truncate">
                <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                {@html highlightMatch(result.message, searchQuery)}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  :global(mark) {
    background: rgba(99, 102, 241, 0.3);
    color: var(--accent);
    padding: 2px 4px;
    border-radius: 3px;
    font-weight: 600;
  }
</style>
