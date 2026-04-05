<script>
  import { logger } from '../logger.js';
  /**
   * Activity Timeline Page
   * Visual chronological timeline of events
   */

  import { onMount } from 'svelte';
  import { api } from '../apiClient.js';

  // State
  let events = $state([]);
  let loading = $state(false);
  let error = $state(null);
  let filter = $state('all');
  let timeRange = $state('all'); // all, today, week, month
  let groupBy = $state('day'); // day, hour

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
    const creates = events.filter(
      e => e.change_type === 'add' || e.change_type === 'create'
    ).length;
    const edits = events.filter(
      e => e.change_type === 'change' || e.change_type === 'edit' || e.change_type === 'modified'
    ).length;
    const deletes = events.filter(
      e => e.change_type === 'unlink' || e.change_type === 'delete'
    ).length;
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
        change_type: e.change_type || 'change',
        filepath: e.filepath || e.file
      }));

      loading = false;
    } catch (err) {
      logger.error('Failed to load events:', err);
      error = err.message;
      loading = false;
    }
  }

  function getEventIcon(changeType) {
    switch (changeType) {
      case 'add':
      case 'create':
        return '+';
      case 'change':
      case 'edit':
      case 'modified':
        return '~';
      case 'unlink':
      case 'delete':
        return '-';
      default:
        return '';
    }
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
      default:
        return 'var(--muted)';
    }
  }

  function formatTime(timestamp) {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
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
    return date.toLocaleDateString();
  }

  onMount(() => {
    loadEvents();
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-6xl mx-auto">
    <!-- Header -->
    <div class="flex justify-between items-start mb-6 flex-wrap gap-4">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">Activity Timeline</h1>
        <p class="text-sm text-[var(--muted)] font-sans">Chronological view of file changes</p>
      </div>
      <button
        onclick={loadEvents}
        disabled={loading}
        class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors disabled:opacity-50"
      >
        {loading ? '...' : '↻'} Refresh
      </button>
    </div>

    {#if error}
      <div class="bg-[var(--error-subtle)] border border-[var(--error)] rounded-lg p-4 mb-6">
        <span class="text-sm text-[var(--error)] font-sans"> {error}</span>
      </div>
    {/if}

    <!-- Stats -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
        <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
          Total Events
        </div>
        <div class="text-sm font-mono text-[var(--text)]">{stats.total}</div>
      </div>
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
        <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
          Created
        </div>
        <div class="text-sm font-mono text-[var(--text)]">{stats.creates}</div>
      </div>
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
        <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
          Modified
        </div>
        <div class="text-sm font-mono text-[var(--text)]">{stats.edits}</div>
      </div>
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
        <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
          Deleted
        </div>
        <div class="text-sm font-mono text-[var(--text)]">{stats.deletes}</div>
      </div>
    </div>

    <!-- Filters -->
    <div
      class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 mb-6 flex gap-4 flex-wrap items-center"
    >
      <div class="flex items-center gap-2">
        <span class="text-sm text-[var(--muted)]">Type</span>
        <select
          bind:value={filter}
          class="px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
        >
          <option value="all">All Types</option>
          <option value="add">Created</option>
          <option value="change">Modified</option>
          <option value="unlink">Deleted</option>
        </select>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-sm text-[var(--muted)]">Range</span>
        <select
          bind:value={timeRange}
          class="px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
        >
          <option value="all">All Time</option>
          <option value="today">Today</option>
          <option value="week">Last 7 Days</option>
          <option value="month">Last 30 Days</option>
        </select>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-sm text-[var(--muted)]">Group</span>
        <select
          bind:value={groupBy}
          class="px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
        >
          <option value="day">Day</option>
          <option value="hour">Hour</option>
        </select>
      </div>
    </div>

    <!-- Timeline -->
    {#if loading}
      <div class="text-center py-12">
        <div class="text-sm text-[var(--muted)] font-sans">Loading timeline...</div>
      </div>
    {:else if groupedEvents.length === 0}
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center">
        <div class="text-sm font-semibold text-[var(--text-heading)] mb-2">No events found</div>
        <div class="text-sm text-[var(--muted)] font-sans">Try adjusting your filters</div>
      </div>
    {:else}
      <div class="space-y-6">
        {#each groupedEvents as group, index (index)}
          <div class="relative">
            <!-- Date Header -->
            <div class="sticky top-12 bg-[var(--bg)] z-10 pb-3">
              <div class="flex items-center gap-3">
                <div
                  class="bg-[var(--surface)] border border-[var(--border)] px-3 py-1.5 rounded text-sm font-mono text-[var(--text)]"
                >
                  {group.date}
                </div>
                <div class="text-xs text-[var(--muted)] font-mono">
                  {group.events.length} event{group.events.length !== 1 ? 's' : ''}
                </div>
              </div>
            </div>

            <!-- Timeline Events -->
            <div class="space-y-3">
              {#each group.events as event, eventIndex (eventIndex)}
                <div
                  class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 hover:border-[var(--accent)] transition-colors"
                  style="border-left: 3px solid {getEventColor(event.change_type)}"
                >
                  <div class="flex justify-between items-start mb-2">
                    <div class="flex items-center gap-2">
                      <span
                        class="text-xs px-2 py-0.5 rounded font-semibold font-mono"
                        style="background: {getEventColor(
                          event.change_type
                        )}15; color: {getEventColor(event.change_type)}"
                      >
                        {event.change_type?.toUpperCase() || 'UNKNOWN'}
                      </span>
                      {#if event.project_name}
                        <span class="text-xs text-[var(--muted)] font-mono"
                          >{event.project_name}</span
                        >
                      {/if}
                    </div>
                    <div
                      class="flex items-center gap-2 text-xs text-[var(--muted)] font-mono flex-shrink-0"
                    >
                      <span>{formatTime(event.timestamp)}</span>
                      <span class="text-[var(--border)]">·</span>
                      <span>{getRelativeTime(event.timestamp)}</span>
                    </div>
                  </div>

                  {#if event.filepath}
                    <div class="text-sm font-mono text-[var(--text)] truncate">
                      {event.filepath}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
