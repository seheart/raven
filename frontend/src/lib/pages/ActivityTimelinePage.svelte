<script>
  /**
   * Activity Timeline Page
   * Visual chronological timeline of events
   */

  import { api } from '../apiClient.js';

  // State
  let events = $state([]);
  let loading = $state(true);
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
    const creates = events.filter(e => e.change_type === 'create').length;
    const edits = events.filter(e => e.change_type === 'edit').length;
    const deletes = events.filter(e => e.change_type === 'delete').length;
    return { total, creates, edits, deletes };
  });

  // Load events
  async function loadEvents() {
    try {
      loading = true;
      error = null;

      const data = await api.get('/all-agent-events?limit=500');
      events = Array.isArray(data) ? data : [];

      loading = false;
    } catch (err) {
      console.error('Failed to load events:', err);
      error = err.message;
      loading = false;
    }
  }

  function getEventIcon(changeType) {
    switch (changeType) {
      case 'create': return '➕';
      case 'edit': return '✏️';
      case 'delete': return '🗑️';
      case 'read': return '👁️';
      case 'execute': return '⚡';
      default: return '📝';
    }
  }

  function getEventColor(changeType) {
    switch (changeType) {
      case 'create': return 'var(--success)';
      case 'edit': return 'var(--accent)';
      case 'delete': return 'var(--error)';
      case 'read': return 'var(--muted)';
      case 'execute': return 'var(--warning)';
      default: return 'var(--text)';
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

  $effect(() => {
    loadEvents();
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-5xl mx-auto">
    <!-- Header -->
    <div class="flex justify-between items-start mb-6">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">Activity Timeline</h1>
        <p class="text-base text-[var(--muted)] font-sans">Chronological view of all events</p>
      </div>
      <button
        onclick={loadEvents}
        disabled={loading}
        class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors disabled:opacity-50"
      >
        {loading ? '⏳ Loading' : '🔄 Refresh'}
      </button>
    </div>

    {#if error}
      <div class="bg-[var(--error-subtle)] border border-[var(--error)] rounded-lg p-4 mb-6">
        <span class="text-sm text-[var(--error)] font-sans">⚠️ {error}</span>
      </div>
    {/if}

    <!-- Stats -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
        <div class="text-sm text-[var(--muted)] font-sans">Total Events</div>
        <div class="text-2xl font-bold text-[var(--text-heading)]">{stats.total}</div>
      </div>
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
        <div class="text-sm text-[var(--muted)] font-sans">Created</div>
        <div class="text-2xl font-bold text-[var(--success)]">{stats.creates}</div>
      </div>
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
        <div class="text-sm text-[var(--muted)] font-sans">Edited</div>
        <div class="text-2xl font-bold text-[var(--accent)]">{stats.edits}</div>
      </div>
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
        <div class="text-sm text-[var(--muted)] font-sans">Deleted</div>
        <div class="text-2xl font-bold text-[var(--error)]">{stats.deletes}</div>
      </div>
    </div>

    <!-- Filters -->
    <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 mb-6">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label class="block text-sm text-[var(--muted)] font-sans mb-2">Event Type</label>
          <select
            bind:value={filter}
            class="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-sans text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
          >
            <option value="all">All Types</option>
            <option value="create">Create</option>
            <option value="edit">Edit</option>
            <option value="delete">Delete</option>
            <option value="read">Read</option>
            <option value="execute">Execute</option>
          </select>
        </div>

        <div>
          <label class="block text-sm text-[var(--muted)] font-sans mb-2">Time Range</label>
          <select
            bind:value={timeRange}
            class="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-sans text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="week">Last 7 Days</option>
            <option value="month">Last 30 Days</option>
          </select>
        </div>

        <div>
          <label class="block text-sm text-[var(--muted)] font-sans mb-2">Group By</label>
          <select
            bind:value={groupBy}
            class="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-sans text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
          >
            <option value="day">Day</option>
            <option value="hour">Hour</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Timeline -->
    {#if loading}
      <div class="text-center py-12">
        <div class="text-4xl mb-4">⏳</div>
        <div class="text-[var(--muted)] font-sans">Loading timeline...</div>
      </div>
    {:else if groupedEvents.length === 0}
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center">
        <div class="text-5xl mb-4">📊</div>
        <div class="text-xl font-semibold text-[var(--text-heading)] mb-2">No events found</div>
        <div class="text-base text-[var(--muted)] font-sans">Try adjusting your filters</div>
      </div>
    {:else}
      <div class="space-y-6">
        {#each groupedEvents as group (group.date)}
          <div class="relative">
            <!-- Date Header -->
            <div class="sticky top-0 bg-[var(--bg)] z-10 pb-3">
              <div class="flex items-center gap-3">
                <div class="bg-[var(--accent)] text-white px-4 py-2 rounded-lg font-semibold text-sm font-sans">
                  {group.date}
                </div>
                <div class="text-sm text-[var(--muted)] font-sans">
                  {group.events.length} event{group.events.length !== 1 ? 's' : ''}
                </div>
              </div>
            </div>

            <!-- Timeline Events -->
            <div class="relative pl-8 border-l-2 border-[var(--border)] ml-3">
              {#each group.events as event (event.id || event.timestamp)}
                <div class="relative mb-6">
                  <!-- Timeline Dot -->
                  <div
                    class="absolute -left-[34px] w-4 h-4 rounded-full border-2 border-[var(--bg)]"
                    style="background: {getEventColor(event.change_type)}"
                  ></div>

                  <!-- Event Card -->
                  <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 hover:border-[var(--accent)] transition-colors">
                    <div class="flex items-start gap-3">
                      <span class="text-2xl flex-shrink-0">{getEventIcon(event.change_type)}</span>
                      <div class="flex-1 min-w-0">
                        <div class="flex items-baseline gap-3 mb-2">
                          <span
                            class="text-xs px-2 py-1 rounded font-semibold"
                            style="background: {getEventColor(event.change_type)}20; color: {getEventColor(event.change_type)}"
                          >
                            {event.change_type?.toUpperCase() || 'UNKNOWN'}
                          </span>
                          <span class="text-sm text-[var(--muted)] font-sans">
                            {formatTime(event.timestamp)}
                          </span>
                          <span class="text-xs text-[var(--muted)] font-sans">
                            {getRelativeTime(event.timestamp)}
                          </span>
                        </div>

                        {#if event.filepath}
                          <div class="text-base font-medium text-[var(--text)] font-mono mb-1 truncate">
                            {event.filepath}
                          </div>
                        {/if}

                        {#if event.message}
                          <div class="text-sm text-[var(--muted)] font-sans mb-2">
                            {event.message}
                          </div>
                        {/if}

                        <div class="flex flex-wrap gap-3 text-xs text-[var(--muted)]">
                          {#if event.agent}
                            <span class="font-mono">🤖 {event.agent}</span>
                          {/if}
                          {#if event.event_size}
                            <span class="font-mono">📦 {event.event_size}B</span>
                          {/if}
                          {#if event.duration_ms}
                            <span class="font-mono">⏱️ {event.duration_ms}ms</span>
                          {/if}
                          {#if event.risk_level}
                            <span class="font-mono">⚠️ Risk: {event.risk_level}</span>
                          {/if}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  /* Custom styles for timeline */
</style>
