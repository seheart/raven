<script>
  import { onDestroy } from 'svelte';
  import DOMPurify from 'dompurify';
  import { logger } from '../logger.js';
  import { formatDateTime } from '../timeFormat.js';
  import { PageLayout, PageHeader, StatusBar } from '../components/layout/index.js';
  import { EmptyState, ToolbarButton, FilterToggle, LoadingState } from '../components/ui/index.js';
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

  // Utility-class color for the event-type chip (text + matching subtle bg).
  // Mirrors SystemPage's methodTextClass pattern — keeps semantic colors out
  // of inline styles.
  function getEventChipClass(changeType) {
    switch (changeType) {
      case 'add':
      case 'create':
        return 'text-success bg-success/15';
      case 'change':
      case 'edit':
      case 'modified':
        return 'text-accent bg-accent/15';
      case 'unlink':
      case 'delete':
        return 'text-error bg-error/15';
      case 'tool_call':
        return 'text-warning bg-warning/15';
      case 'tool_result':
        return 'text-info bg-info/15';
      case 'user_message':
        return 'text-accent bg-accent/15';
      case 'assistant_text':
        return 'text-info bg-info/15';
      default:
        return 'text-muted bg-surface';
    }
  }

  // Friendly chip labels — the API uses raw enum values like `unlink`,
  // `tool_call`, and `assistant_text`; readable names belong on the page.
  function getEventLabel(changeType) {
    switch (changeType) {
      case 'add':
      case 'create':
        return 'CREATED';
      case 'change':
      case 'edit':
      case 'modified':
        return 'EDITED';
      case 'unlink':
      case 'delete':
        return 'DELETED';
      case 'tool_call':
        return 'TOOL';
      case 'tool_result':
        return 'RESULT';
      case 'user_message':
        return 'YOU';
      case 'assistant_text':
        return 'AI';
      default:
        return (changeType || 'EVENT').toUpperCase();
    }
  }

  function formatTimestamp(timestamp) {
    if (!timestamp) return 'N/A';
    return formatDateTime(timestamp);
  }

  // Autofocus the search box on mount — this page is search-first, the user
  // shouldn't have to click before typing.
  function autofocus(node) {
    node.focus();
  }
</script>

<PageLayout>
  <StatusBar prompt="RAVEN.ACTIVITY" label="Search" />
  <PageHeader
    title="Search"
    description="Look across every file, every AI tool call, and every message Raven has seen. Type a filename, a project name, or part of a path."
  />

  <!-- Search Bar -->
  <div class="bg-surface border border-border rounded-lg p-4 mb-6">
    <div class="flex gap-3 mb-3">
      <input
        type="text"
        use:autofocus
        bind:value={searchQuery}
        onkeypress={handleKeyPress}
        placeholder="Search file paths, messages, or your AI tools..."
        class="flex-1 px-3 py-1.5 bg-canvas border border-border rounded text-sm font-mono text-body placeholder:text-muted focus:outline-none focus:border-accent"
      />
      <ToolbarButton onClick={performSearch} disabled={loading || !searchQuery.trim()}
        >{loading ? 'Searching…' : 'Search'}</ToolbarButton
      >
    </div>

    <div class="flex flex-wrap gap-2">
      {#each [['all', 'All results'], ['files', 'Files only'], ['messages', 'Messages only'], ['agents', 'AI tools only']] as [value, label] (value)}
        <FilterToggle active={searchType === value} onClick={() => (searchType = value)}>
          {label}
        </FilterToggle>
      {/each}
    </div>
  </div>

  <!-- Search Results -->
  {#if loading}
    <LoadingState message="Searching..." />
  {:else if !hasSearched}
    <EmptyState
      title="Search across everything"
      description="Looks through every file event, agent action, and edited path Raven has recorded. Try a filename, a project name, or part of a path."
      icon="?"
    />
  {:else if filteredResults.length === 0}
    <EmptyState
      title="Nothing matches “{searchQuery}”"
      description="Try a partial filename, your project's folder name, or drop the file extension — search matches any chunk of text, not just whole words."
      icon="∅"
    />
  {:else}
    <!-- Results Header -->
    <div class="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
      <div class="bg-surface border border-border rounded p-4">
        <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Results</div>
        <div class="text-sm font-mono text-body">
          {filteredResults.length} in {searchTime}ms
        </div>
      </div>
      <div class="bg-surface border border-border rounded p-4">
        <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
          Unique Files
        </div>
        <div class="text-sm font-mono text-body">{stats.filesFound}</div>
      </div>
      <div class="bg-surface border border-border rounded p-4">
        <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
          File Changes
        </div>
        <div class="text-sm font-mono text-body">{stats.fileChanges}</div>
      </div>
      <div class="bg-surface border border-border rounded p-4">
        <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
          Agent Events
        </div>
        <div class="text-sm font-mono text-body">{stats.agentEvents}</div>
      </div>
    </div>

    <!-- Results — flat dense table, bounded so big result sets scroll within
         the page instead of dwarfing it. -->
    <div class="border-t border-b border-border font-mono text-sm overflow-x-auto">
      <table class="w-full">
        <thead class="bg-canvas sticky top-0 z-10">
          <tr class="text-[11px] text-muted uppercase tracking-wide">
            <th class="text-left font-semibold px-3 py-1 w-20">Type</th>
            <th class="text-left font-semibold px-3 py-1">Path / Message</th>
            <th class="text-left font-semibold px-3 py-1 hidden md:table-cell w-32">Agent</th>
            <th class="text-right font-semibold px-3 py-1 w-40">Time</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredResults as result, i (result.id || result.timestamp + ':' + i)}
            <tr class="hover:bg-surface/40 align-top">
              <td class="px-3 py-0.5">
                <span
                  class="text-[11px] px-1.5 py-0.5 rounded font-semibold {getEventChipClass(
                    result.change_type
                  )}"
                >
                  {getEventLabel(result.change_type)}
                </span>
              </td>
              <td class="px-3 py-0.5 text-body max-w-[40rem]">
                {#if result.filepath}
                  <div class="truncate">
                    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                    {@html highlightMatch(result.filepath, searchQuery)}
                  </div>
                {/if}
                {#if result.message}
                  <div class="text-muted truncate">
                    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                    {@html highlightMatch(result.message, searchQuery)}
                  </div>
                {/if}
              </td>
              <td class="px-3 py-0.5 text-muted hidden md:table-cell truncate max-w-[8rem]">
                {#if result.agent}
                  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                  {@html highlightMatch(result.agent, searchQuery)}
                {/if}
              </td>
              <td class="px-3 py-0.5 text-muted text-right whitespace-nowrap">
                {formatTimestamp(result.timestamp)}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</PageLayout>
