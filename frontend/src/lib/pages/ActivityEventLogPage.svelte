<script>
  import { logger } from '../logger.js';
  import { api } from '../apiClient.js';
  import {
    createChart,
    destroyChart,
    createThemeObserver,
    getChartColors
  } from '../utils/chartUtils.js';
  /**
   * Activity Event Log Page - Complete event history
   * Advanced filtering and detailed event information with Chart.js visualizations
   */

  // State
  let events = $state([]);
  let loading = $state(true);
  let error = $state(null);
  let searchQuery = $state('');
  let selectedType = $state('all');
  let selectedAgent = $state('all');
  let dateRange = $state('all'); // all, today, week, month
  let sortBy = $state('newest'); // newest, oldest, filepath, agent
  let eventsLimit = $state(50);

  let agents = $state([]);

  // Chart instances
  let charts = {};
  let themeObserver = null;

  // Derived
  const filteredEvents = $derived.by(() => {
    let filtered = events;

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        e =>
          e.filepath?.toLowerCase().includes(query) ||
          e.agent?.toLowerCase().includes(query) ||
          e.message?.toLowerCase().includes(query)
      );
    }

    // Type filter
    if (selectedType !== 'all') {
      filtered = filtered.filter(
        e => e.change_type === selectedType || e.event_type === selectedType
      );
    }

    // Agent filter
    if (selectedAgent !== 'all') {
      filtered = filtered.filter(e => e.agent === selectedAgent);
    }

    // Date range filter
    if (dateRange !== 'all') {
      const now = new Date();
      const cutoff = new Date();

      switch (dateRange) {
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

    // Sorting - create a copy first to avoid mutating state
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.timestamp) - new Date(a.timestamp);
        case 'oldest':
          return new Date(a.timestamp) - new Date(b.timestamp);
        case 'filepath':
          return (a.filepath || '').localeCompare(b.filepath || '');
        case 'agent':
          return (a.agent || '').localeCompare(b.agent || '');
        default:
          return 0;
      }
    });

    return sorted.slice(0, eventsLimit);
  });

  const stats = $derived.by(() => {
    const total = events.length;
    const creates = events.filter(
      e => e.change_type === 'create' || e.change_type === 'add'
    ).length;
    const edits = events.filter(e => e.change_type === 'edit' || e.change_type === 'change').length;
    const deletes = events.filter(
      e => e.change_type === 'delete' || e.change_type === 'unlink'
    ).length;
    const reads = events.filter(e => e.change_type === 'read').length;
    return { total, creates, edits, deletes, reads };
  });

  // Top files calculation
  const topFiles = $derived.by(() => {
    const fileCounts = {};
    events.forEach(e => {
      if (e.filepath) {
        fileCounts[e.filepath] = (fileCounts[e.filepath] || 0) + 1;
      }
    });
    return Object.entries(fileCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  });

  // Create charts
  function createCharts() {
    // Destroy existing charts
    Object.values(charts).forEach(chart => destroyChart(chart));
    charts = {};

    if (events.length === 0) return;

    const colors = getChartColors();

    // 1. Pie Chart: Event Type Distribution
    const pieCanvas = document.getElementById('chart-event-types');
    if (pieCanvas) {
      const typeCounts = {
        create: events.filter(e => e.change_type === 'create' || e.change_type === 'add').length,
        edit: events.filter(e => e.change_type === 'edit' || e.change_type === 'change').length,
        delete: events.filter(e => e.change_type === 'delete' || e.change_type === 'unlink').length
      };

      const labels = [];
      const data = [];
      const chartColors = [];

      if (typeCounts.create > 0) {
        labels.push('Created');
        data.push(typeCounts.create);
        chartColors.push(colors.success);
      }
      if (typeCounts.edit > 0) {
        labels.push('Modified');
        data.push(typeCounts.edit);
        chartColors.push(colors.primary);
      }
      if (typeCounts.delete > 0) {
        labels.push('Deleted');
        data.push(typeCounts.delete);
        chartColors.push(colors.error);
      }

      charts.eventTypes = createChart('chart-event-types', {
        type: 'pie',
        data: {
          labels,
          datasets: [
            {
              data,
              backgroundColor: chartColors,
              borderColor: colors.border,
              borderWidth: 1
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: colors.text, font: { size: 11, family: 'monospace' } }
            },
            title: {
              display: true,
              text: 'Event Type Distribution',
              color: colors.text,
              font: { size: 14, weight: 'bold', family: 'monospace' }
            }
          }
        }
      });
    }

    // 2. Bar Chart: Events Per Hour (Last 24 hours)
    const barCanvas = document.getElementById('chart-events-per-hour');
    if (barCanvas) {
      const now = new Date();
      const last24Hours = new Array(24).fill(0);

      events.forEach(event => {
        const eventDate = new Date(event.timestamp);
        const hoursDiff = Math.floor((now - eventDate) / (1000 * 60 * 60));
        if (hoursDiff >= 0 && hoursDiff < 24) {
          last24Hours[23 - hoursDiff]++;
        }
      });

      const hourLabels = [];
      for (let i = 23; i >= 0; i--) {
        const hour = new Date(now.getTime() - i * 60 * 60 * 1000);
        hourLabels.push(hour.getHours() + ':00');
      }

      charts.eventsPerHour = createChart('chart-events-per-hour', {
        type: 'bar',
        data: {
          labels: hourLabels,
          datasets: [
            {
              label: 'Events',
              data: last24Hours,
              backgroundColor: colors.primary,
              borderColor: colors.primary,
              borderWidth: 1
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            title: {
              display: true,
              text: 'Events Per Hour (Last 24h)',
              color: colors.text,
              font: { size: 14, weight: 'bold', family: 'monospace' }
            }
          },
          scales: {
            x: {
              ticks: { color: colors.muted, font: { size: 10 }, maxRotation: 45, minRotation: 45 },
              grid: { color: colors.border, display: false }
            },
            y: {
              beginAtZero: true,
              ticks: { color: colors.muted, font: { size: 10 } },
              grid: { color: colors.border }
            }
          }
        }
      });
    }
  }

  // Load events
  async function loadEvents() {
    try {
      loading = true;
      error = null;

      const data = await api.get('/all-file-events?limit=1000');
      events = Array.isArray(data) ? data : data.events || [];

      // Extract unique agents
      const uniqueAgents = new Set();
      events.forEach(e => {
        if (e.agent) uniqueAgents.add(e.agent);
      });
      agents = Array.from(uniqueAgents).sort();

      loading = false;
    } catch (err) {
      logger.error('Failed to load events:', err);
      error = err.message;
      loading = false;
    }
  }

  // Create charts when data is loaded
  $effect(() => {
    if (!loading && events.length > 0) {
      setTimeout(() => {
        try {
          createCharts();
        } catch (error) {
          logger.error('Failed to create charts:', error);
        }
      }, 200);
    }
  });

  // function formatTimestamp(timestamp) {
  //   if (!timestamp) return 'N/A';
  //   const date = new Date(timestamp);
  //   return date.toLocaleString();
  // }

  function formatDate(timestamp) {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleDateString();
  }

  function formatTime(timestamp) {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  }

  function loadMore() {
    eventsLimit += 50;
  }

  function exportEvents() {
    const dataStr = JSON.stringify(filteredEvents, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `raven-events-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  $effect(() => {
    loadEvents();

    // Set up theme observer
    themeObserver = createThemeObserver(() => {
      if (!loading && events.length > 0) {
        createCharts();
      }
    });

    return () => {
      // Cleanup
      Object.values(charts).forEach(chart => destroyChart(chart));
      if (themeObserver) themeObserver.disconnect();
    };
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-7xl mx-auto">
    <!-- Header -->
    <div class="flex justify-between items-start mb-6">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">Event Log</h1>
        <p class="text-base text-[var(--muted)] font-sans">Complete history of all file events</p>
      </div>
      <div class="flex items-center gap-3">
        <button
          onclick={exportEvents}
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors"
        >
          💾 Export
        </button>
        <button
          onclick={loadEvents}
          disabled={loading}
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors disabled:opacity-50"
        >
          {loading ? '⏳ Loading' : '🔄 Refresh'}
        </button>
      </div>
    </div>

    {#if error}
      <div class="bg-[var(--error-subtle)] border border-[var(--error)] rounded-lg p-4 mb-6">
        <span class="text-sm text-[var(--error)] font-sans">⚠️ {error}</span>
      </div>
    {/if}

    <!-- Stats -->
    <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
        <div class="text-sm text-[var(--muted)] font-sans">Total</div>
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
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
        <div class="text-sm text-[var(--muted)] font-sans">Unique Files</div>
        <div class="text-2xl font-bold text-[var(--text)]">{topFiles.length}</div>
      </div>
    </div>

    <!-- Charts Section -->
    {#if !loading && events.length > 0}
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <!-- Event Type Distribution -->
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <div class="h-[300px]">
            <canvas id="chart-event-types"></canvas>
          </div>
        </div>

        <!-- Events Per Hour -->
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <div class="h-[300px]">
            <canvas id="chart-events-per-hour"></canvas>
          </div>
        </div>
      </div>

      <!-- Top Files -->
      {#if topFiles.length > 0}
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 mb-6">
          <h3 class="text-sm font-semibold text-[var(--text)] font-sans mb-4">
            🔥 Top 5 Most Changed Files
          </h3>
          <div class="space-y-2">
            {#each topFiles as [file, count] (file)}
              <div class="flex justify-between items-center p-2 bg-[var(--bg)] rounded">
                <span class="text-sm font-mono text-[var(--text)] truncate flex-1">{file}</span>
                <span class="text-sm font-bold text-[var(--accent)] ml-4">{count} changes</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    {/if}

    <!-- Advanced Filters -->
    <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 mb-4">
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- Search -->
        <div>
          <label for="event-search" class="block text-sm text-[var(--muted)] font-sans mb-2"
            >Search</label
          >
          <input
            id="event-search"
            type="text"
            bind:value={searchQuery}
            placeholder="File, agent, or message..."
            class="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-sans text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>

        <!-- Event Type -->
        <div>
          <label for="event-type" class="block text-sm text-[var(--muted)] font-sans mb-2"
            >Event Type</label
          >
          <select
            id="event-type"
            bind:value={selectedType}
            class="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-sans text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
          >
            <option value="all">All Types</option>
            <option value="create">Create</option>
            <option value="add">Add</option>
            <option value="edit">Edit</option>
            <option value="change">Change</option>
            <option value="delete">Delete</option>
            <option value="unlink">Unlink</option>
          </select>
        </div>

        <!-- Agent -->
        <div>
          <label for="event-agent" class="block text-sm text-[var(--muted)] font-sans mb-2"
            >Agent</label
          >
          <select
            id="event-agent"
            bind:value={selectedAgent}
            class="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-sans text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
          >
            <option value="all">All Agents</option>
            {#each agents as agent (agent)}
              <option value={agent}>{agent}</option>
            {/each}
          </select>
        </div>

        <!-- Date Range -->
        <div>
          <label for="event-date-range" class="block text-sm text-[var(--muted)] font-sans mb-2"
            >Date Range</label
          >
          <select
            id="event-date-range"
            bind:value={dateRange}
            class="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-sans text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="week">Last 7 Days</option>
            <option value="month">Last 30 Days</option>
          </select>
        </div>

        <!-- Sort By -->
        <div>
          <label for="event-sort" class="block text-sm text-[var(--muted)] font-sans mb-2"
            >Sort By</label
          >
          <select
            id="event-sort"
            bind:value={sortBy}
            class="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-sans text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="filepath">File Path</option>
            <option value="agent">Agent Name</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Events List -->
    {#if loading}
      <div class="text-center py-12">
        <div class="text-4xl mb-4">⏳</div>
        <div class="text-[var(--muted)] font-sans">Loading events...</div>
      </div>
    {:else if filteredEvents.length === 0}
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center">
        <div class="text-5xl mb-4">📋</div>
        <div class="text-xl font-semibold text-[var(--text-heading)] mb-2">No events found</div>
        <div class="text-base text-[var(--muted)] font-sans">
          Try adjusting your filters or check back later
        </div>
      </div>
    {:else}
      <div
        class="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden mb-4"
      >
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="bg-[var(--bg)] border-b border-[var(--border)]">
              <tr>
                <th class="px-4 py-3 text-left text-sm font-semibold text-[var(--muted)] font-sans"
                  >Type</th
                >
                <th class="px-4 py-3 text-left text-sm font-semibold text-[var(--muted)] font-sans"
                  >File/Project</th
                >
                <th class="px-4 py-3 text-left text-sm font-semibold text-[var(--muted)] font-sans"
                  >Agent</th
                >
                <th class="px-4 py-3 text-left text-sm font-semibold text-[var(--muted)] font-sans"
                  >Timestamp</th
                >
                <th class="px-4 py-3 text-left text-sm font-semibold text-[var(--muted)] font-sans"
                  >Details</th
                >
              </tr>
            </thead>
            <tbody class="divide-y divide-[var(--border)]">
              {#each filteredEvents as event (event.id || event.timestamp)}
                {@const isCreate = event.change_type === 'create' || event.change_type === 'add'}
                {@const isEdit = event.change_type === 'edit' || event.change_type === 'change'}
                {@const isDelete = event.change_type === 'delete' || event.change_type === 'unlink'}
                <tr class="hover:bg-[var(--bg)] transition-colors">
                  <td class="px-4 py-3">
                    <span
                      class="text-xs px-2 py-1 rounded font-semibold {isCreate
                        ? 'bg-green-500/10 text-[var(--success)]'
                        : ''} {isEdit ? 'bg-blue-500/10 text-[var(--accent)]' : ''} {isDelete
                        ? 'bg-red-500/10 text-[var(--error)]'
                        : ''}"
                    >
                      {event.change_type?.toUpperCase() ||
                        event.event_type?.toUpperCase() ||
                        'UNKNOWN'}
                    </span>
                  </td>
                  <td class="px-4 py-3">
                    {#if event.filepath}
                      <div class="text-sm font-mono text-[var(--text)] max-w-md truncate">
                        {event.filepath}
                      </div>
                    {/if}
                    {#if event.project}
                      <div class="text-xs text-[var(--muted)] font-sans">
                        Project: {event.project}
                      </div>
                    {/if}
                  </td>
                  <td class="px-4 py-3 text-sm font-mono text-[var(--muted)]">
                    {event.agent || 'N/A'}
                  </td>
                  <td class="px-4 py-3">
                    <div class="text-sm text-[var(--text)] font-sans">
                      {formatDate(event.timestamp)}
                    </div>
                    <div class="text-xs text-[var(--muted)] font-mono">
                      {formatTime(event.timestamp)}
                    </div>
                  </td>
                  <td class="px-4 py-3 text-xs text-[var(--muted)] font-mono">
                    {#if event.lines_added}
                      <div>+{event.lines_added} lines</div>
                    {/if}
                    {#if event.lines_deleted}
                      <div>-{event.lines_deleted} lines</div>
                    {/if}
                    {#if event.risk_level}
                      <div class="text-[var(--warning)]">Risk: {event.risk_level}</div>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Showing count and Load More button -->
      <div class="text-center space-y-4">
        <div class="text-sm text-[var(--muted)] font-sans">
          Showing {filteredEvents.length} of {events.length} events
        </div>
        {#if filteredEvents.length < events.length}
          <button
            onclick={loadMore}
            class="px-4 py-2 bg-[var(--accent)] text-white rounded text-sm font-sans hover:opacity-90 transition-opacity"
          >
            Load More
          </button>
        {/if}
      </div>
    {/if}
  </div>
</div>
