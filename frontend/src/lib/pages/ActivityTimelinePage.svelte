<script>
  import { logger } from '../logger.js';
  import { formatTimeOnly, formatDateOnly } from '../timeFormat.js';
  import { PageLayout, PageHeader, StatusBar } from '../components/layout/index.js';
  import {
    RefreshButton,
    EmptyState,
    LoadingState,
    DataFetchError
  } from '../components/ui/index.js';
  import FreshnessBadge from '../components/ui/FreshnessBadge.svelte';
  /**
   * Activity Timeline Page
   * Visual chronological timeline of events
   */

  import { onMount, onDestroy } from 'svelte';
  import { createPageApi } from '../apiClient.js';
  import { websocketService } from '../services/websocket.js';
  import { debounce } from '../utils/debounce.js';
  const { api, abort: abortRequests } = createPageApi();

  // State
  let events = $state([]);
  let loading = $state(false);
  let error = $state(null);
  let filter = $state('all');
  let timeRange = $state('all'); // all, today, week, month
  let groupBy = $state('day'); // day, hour
  let lastUpdated = $state(null);

  // Normalize raw fs change types (add/change/unlink) to the vocabulary the
  // stats + filter dropdown use (created/modified/deleted). Keeps the filter
  // honest against the data.
  function normalizeChangeType(changeType) {
    const type = (changeType || '').toLowerCase();
    if (type === 'add' || type === 'create' || type === 'created') return 'created';
    if (type === 'unlink' || type === 'delete' || type === 'deleted') return 'deleted';
    return 'modified';
  }

  // Derived - Group events by time period
  const groupedEvents = $derived.by(() => {
    let filtered = events;

    // Filter by type
    if (filter !== 'all') {
      filtered = filtered.filter(e => e.change_type === filter);
    }

    // Filter by time range
    if (timeRange !== 'all') {
      const now = new Date();
      const cutoff = new Date();

      switch (timeRange) {
        case 'today':
          cutoff.setHours(0, 0, 0, 0);
          break;
        case 'week':
          cutoff.setDate(now.getDate() - 7);
          break;
        case 'month':
          cutoff.setMonth(now.getMonth() - 1);
          break;
      }

      filtered = filtered.filter(e => {
        const eventDate = new Date(e.timestamp);
        return eventDate >= cutoff;
      });
    }

    // Group by time period
    const grouped = new Map();

    filtered.forEach(event => {
      const date = new Date(event.timestamp);
      let key;

      if (groupBy === 'day') {
        key = date.toLocaleDateString();
      } else {
        key = `${date.toLocaleDateString()} ${date.getHours()}:00`;
      }

      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key).push(event);
    });

    // Convert to array and sort by date (newest first)
    return Array.from(grouped.entries())
      .map(([date, events]) => ({
        date,
        events: events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      }))
      .sort((a, b) => {
        const dateA = new Date(a.events[0].timestamp);
        const dateB = new Date(b.events[0].timestamp);
        return dateB - dateA;
      });
  });

  const stats = $derived.by(() => {
    const total = events.length;
    const creates = events.filter(e => e.change_type === 'created').length;
    const edits = events.filter(e => e.change_type === 'modified').length;
    const deletes = events.filter(e => e.change_type === 'deleted').length;
    return { total, creates, edits, deletes };
  });

  // Load events from file-events (has change_type) for the timeline
  async function loadEvents() {
    try {
      loading = true;
      error = null;

      const data = await api.get('/file-events?limit=500');
      events = (Array.isArray(data) ? data : []).map(e => ({
        ...e,
        change_type: normalizeChangeType(e.change_type || e.event_type),
        filepath: e.filepath || e.file
      }));

      lastUpdated = new Date();
      loading = false;
    } catch (err) {
      logger.error('Failed to load events:', err);
      error = err.message;
      loading = false;
    }
  }

  function getEventLabel(changeType) {
    // Friendly labels over the normalized vocabulary.
    switch (changeType) {
      case 'created':
        return 'CREATED';
      case 'modified':
        return 'EDITED';
      case 'deleted':
        return 'DELETED';
      default:
        return (changeType || 'EDIT').toUpperCase();
    }
  }

  // Utility-class color for the row marker + chip (SystemPage methodTextClass
  // pattern) — keeps semantic colors out of inline styles.
  function getEventChipClass(changeType) {
    switch (changeType) {
      case 'created':
        return 'text-success bg-success/15';
      case 'deleted':
        return 'text-error bg-error/15';
      default:
        return 'text-accent bg-accent/15';
    }
  }

  function formatTime(timestamp) {
    if (!timestamp) return 'N/A';
    return formatTimeOnly(timestamp);
  }

  function getRelativeTime(timestamp) {
    if (!timestamp) return 'Unknown time';

    const now = new Date();
    const date = new Date(timestamp);
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    return formatDateOnly(date);
  }

  // Coalesce WS bursts into a single reload so a flurry of edits doesn't
  // hammer the API.
  const debouncedReload = debounce(loadEvents, 400);
  let unsubscribeFileChanged = null;

  onMount(() => {
    loadEvents();
    websocketService.connect();
    unsubscribeFileChanged = websocketService.subscribe('file-changed', () => {
      debouncedReload();
    });
  });

  onDestroy(() => {
    abortRequests();
    debouncedReload.cancel();
    if (unsubscribeFileChanged) unsubscribeFileChanged();
  });
</script>

<PageLayout>
  <StatusBar label="Timeline" />
  <PageHeader
    title="Your timeline, day by day"
    description="Everything your AI tools have touched, grouped by when it happened. Scroll back to see how a busy afternoon — or a quiet week — actually played out."
  >
    {#snippet actions()}
      <div class="flex items-center gap-3">
        <FreshnessBadge mode="live" since={lastUpdated} />
        <RefreshButton onClick={loadEvents} {loading} />
      </div>
    {/snippet}
  </PageHeader>

  {#if error}
    <DataFetchError
      endpoint="/api/file-events"
      message="Failed to load timeline."
      hint={error}
      onRetry={loadEvents}
    />
  {/if}

  <!-- Stats -->
  <div class="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
    <div class="bg-surface border border-border rounded p-4">
      <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Total Events</div>
      <div class="text-sm font-mono text-body">{stats.total}</div>
    </div>
    <div class="bg-surface border border-border rounded p-4">
      <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Created</div>
      <div class="text-sm font-mono text-body">{stats.creates}</div>
    </div>
    <div class="bg-surface border border-border rounded p-4">
      <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Modified</div>
      <div class="text-sm font-mono text-body">{stats.edits}</div>
    </div>
    <div class="bg-surface border border-border rounded p-4">
      <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Deleted</div>
      <div class="text-sm font-mono text-body">{stats.deletes}</div>
    </div>
  </div>

  <!-- Filters -->
  <div
    class="bg-surface border border-border rounded-lg p-4 mb-6 flex gap-4 flex-wrap items-center"
  >
    <div class="flex items-center gap-2">
      <span class="text-sm text-muted">Type</span>
      <select
        bind:value={filter}
        class="px-3 py-1.5 bg-canvas border border-border rounded text-sm font-mono text-body focus:outline-none focus:border-accent"
      >
        <option value="all">All Types</option>
        <option value="created">Created</option>
        <option value="modified">Modified</option>
        <option value="deleted">Deleted</option>
      </select>
    </div>
    <div class="flex items-center gap-2">
      <span class="text-sm text-muted">Range</span>
      <select
        bind:value={timeRange}
        class="px-3 py-1.5 bg-canvas border border-border rounded text-sm font-mono text-body focus:outline-none focus:border-accent"
      >
        <option value="all">All Time</option>
        <option value="today">Today</option>
        <option value="week">Last 7 Days</option>
        <option value="month">Last 30 Days</option>
      </select>
    </div>
    <div class="flex items-center gap-2">
      <span class="text-sm text-muted">Group</span>
      <select
        bind:value={groupBy}
        class="px-3 py-1.5 bg-canvas border border-border rounded text-sm font-mono text-body focus:outline-none focus:border-accent"
      >
        <option value="day">Day</option>
        <option value="hour">Hour</option>
      </select>
    </div>
  </div>

  <!-- Timeline -->
  {#if loading}
    <LoadingState message="Loading timeline..." />
  {:else if groupedEvents.length === 0}
    <EmptyState
      title="Nothing in this window"
      description="Either no edits happened in the time range you selected, or the project / change-type filters above are hiding them. Widen the time range or clear the filters to see more."
      icon="◴"
    />
  {:else}
    <!-- Bounded scroller — timelines grow unbounded with use, and at
         half-screen we want the user scrolling within the feed, not the
         whole page. Sticky date headers still work inside the scroller. -->
    <div class="max-h-[720px] space-y-6 pr-1">
      {#each groupedEvents as group (group.date)}
        <div class="relative">
          <!-- Date Header -->
          <div class="sticky top-12 bg-canvas z-10 pb-2">
            <div class="flex items-center gap-3">
              <div
                class="bg-surface border border-border px-3 py-1.5 rounded text-sm font-mono text-body"
              >
                {group.date}
              </div>
              <div class="text-xs text-muted font-mono">
                {group.events.length} event{group.events.length !== 1 ? 's' : ''}
              </div>
            </div>
          </div>

          <!-- Timeline Events — flat dense rows -->
          <div class="border-t border-b border-border font-mono text-sm overflow-x-auto">
            <table class="w-full">
              <tbody>
                {#each group.events as event (event.id || event.timestamp + ':' + (event.filepath || ''))}
                  <tr class="hover:bg-surface/40 align-top">
                    <td class="px-3 py-0.5 w-20">
                      <span
                        class="text-[11px] px-1.5 py-0.5 rounded font-semibold {getEventChipClass(
                          event.change_type
                        )}"
                      >
                        {getEventLabel(event.change_type)}
                      </span>
                    </td>
                    <td class="px-3 py-0.5 text-body">
                      <span class="truncate">{event.filepath || '—'}</span>
                    </td>
                    <td class="px-3 py-0.5 text-muted hidden md:table-cell w-40 truncate">
                      {event.project_name || ''}
                    </td>
                    <td
                      class="px-3 py-0.5 text-muted text-right whitespace-nowrap w-44"
                      title={getRelativeTime(event.timestamp)}
                    >
                      {formatTime(event.timestamp)}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</PageLayout>
