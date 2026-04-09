<script>
  import { logger } from '../logger.js';
  import { createPageApi } from '../apiClient.js';
  /**
   * Agent Monitoring Page
   * Real-time agent monitoring with live status and activity timeline
   */
  import { onMount } from 'svelte';
  const { api, abort: abortRequests } = createPageApi();
  import { websocketService } from '../services/websocket.js';
  import {
    createChart,
    destroyChart,
    createThemeObserver,
    getChartColors
  } from '../utils/chartUtils.js';
  let agentsStatus = $state([]);
  let recentEvents = $state([]);
  let loading = $state(false);
  let error = $state(null);
  let lastUpdated = $state(new Date());
  let autoRefresh = $state(true);
  let refreshInterval = null;
  let eventsLimit = $state(50);
  let loadingMore = $state(false);
  let charts = $state({});
  let themeObserver = $state(null);
  let showNewEventAnimation = $state(false);

  // Filtering state
  let selectedEventTypes = $state([]);
  let dateRange = $state('all'); // 'all', 'today', '7d', '30d'

  // Derived
  const runningAgents = $derived(agentsStatus.filter(a => a.is_running));
  const idleAgents = $derived(agentsStatus.filter(a => !a.is_running));

  // Get available event types
  const availableEventTypes = $derived.by(() => {
    const types = new Set();
    recentEvents.forEach(event => {
      if (event.event_type) {
        types.add(event.event_type);
      }
    });
    return Array.from(types).sort();
  });

  // Filtered events
  const filteredEvents = $derived.by(() => {
    let filtered = recentEvents;

    // Filter by event types
    if (selectedEventTypes.length > 0) {
      filtered = filtered.filter(event => selectedEventTypes.includes(event.event_type));
    }

    // Filter by date range
    if (dateRange !== 'all') {
      const now = new Date();
      const cutoff = new Date();

      if (dateRange === 'today') {
        cutoff.setHours(0, 0, 0, 0);
      } else if (dateRange === '7d') {
        cutoff.setDate(now.getDate() - 7);
      } else if (dateRange === '30d') {
        cutoff.setDate(now.getDate() - 30);
      }

      filtered = filtered.filter(event => {
        const eventDate = new Date(event.timestamp);
        return eventDate >= cutoff;
      });
    }

    return filtered;
  });

  // Check if any filters are active
  const hasActiveFilters = $derived(selectedEventTypes.length > 0 || dateRange !== 'all');

  const timeAgo = $derived.by(() => {
    if (!lastUpdated) return 'Just now';
    const seconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
    if (seconds < 10) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  });

  // Format functions
  function formatNumber(num) {
    return num?.toLocaleString() || '0';
  }

  function formatDateTime(timestamp) {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  }

  function getConfidenceColor(confidence) {
    if (confidence >= 0.9) return 'var(--success)';
    if (confidence >= 0.7) return 'var(--info)';
    if (confidence >= 0.5) return 'var(--warning)';
    return 'var(--muted)';
  }

  function getConfidenceLabel(confidence) {
    if (confidence >= 0.9) return 'Very High';
    if (confidence >= 0.7) return 'High';
    if (confidence >= 0.5) return 'Medium';
    if (confidence >= 0.3) return 'Low';
    return 'Very Low';
  }

  function getEventIcon(eventType) {
    const icons = {
      tool_call: '',
      tool_result: '',
      user_message: '',
      assistant_text: '',
      file_change: '',
      change: '',
      add: '',
      unlink: ''
    };
    return icons[eventType?.toLowerCase()] || '';
  }

  function toggleEventType(type) {
    if (selectedEventTypes.includes(type)) {
      selectedEventTypes = selectedEventTypes.filter(t => t !== type);
    } else {
      selectedEventTypes = [...selectedEventTypes, type];
    }
  }

  function clearFilters() {
    selectedEventTypes = [];
    dateRange = 'all';
  }

  // Create charts for agent utilization
  function createCharts() {
    // Destroy existing charts
    Object.values(charts).forEach(chart => destroyChart(chart));
    charts = {};

    const colors = getChartColors();

    // Create agent utilization over time chart
    const utilizationCanvas = document.getElementById('agent-utilization-chart');
    if (utilizationCanvas && recentEvents.length > 0) {
      // Group events by hour for the last 24 hours
      const hours = 24;
      const now = new Date();
      const hourlyData = {};

      // Initialize hourly buckets
      for (let i = 0; i < hours; i++) {
        const hour = new Date(now.getTime() - i * 60 * 60 * 1000);
        hourlyData[hour.getHours()] = 0;
      }

      // Count events per hour
      recentEvents.forEach(event => {
        const eventDate = new Date(event.timestamp);
        const hourDiff = Math.floor((now - eventDate) / (60 * 60 * 1000));
        if (hourDiff < hours) {
          const hour = eventDate.getHours();
          hourlyData[hour] = (hourlyData[hour] || 0) + 1;
        }
      });

      const labels = Object.keys(hourlyData)
        .sort((a, b) => a - b)
        .map(h => `${h}:00`);
      const data = Object.keys(hourlyData)
        .sort((a, b) => a - b)
        .map(h => hourlyData[h]);

      charts['utilization'] = createChart('agent-utilization-chart', {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Agent Activity',
              data,
              borderColor: colors.primary,
              backgroundColor: `${colors.primary}20`,
              fill: true,
              tension: 0.4,
              pointRadius: 3,
              pointHoverRadius: 5
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              callbacks: {
                label: context => `Events: ${context.parsed.y}`
              }
            }
          },
          scales: {
            x: {
              grid: {
                display: false
              },
              ticks: {
                maxRotation: 0,
                autoSkipPadding: 20
              }
            },
            y: {
              beginAtZero: true,
              ticks: {
                precision: 0
              }
            }
          }
        }
      });
    }

    // Create agent distribution pie chart
    const distributionCanvas = document.getElementById('agent-distribution-chart');
    if (distributionCanvas && agentsStatus.length > 0) {
      const agentCounts = {};
      recentEvents.forEach(event => {
        const agent = event.agent_name || 'Unknown';
        agentCounts[agent] = (agentCounts[agent] || 0) + 1;
      });

      const agentNames = Object.keys(agentCounts);
      const agentValues = Object.values(agentCounts);

      // Generate colors for each agent
      const agentColors = agentNames.map((_, i) => {
        const hue = (i * 360) / agentNames.length;
        return `hsl(${hue}, 70%, 60%)`;
      });

      charts['distribution'] = createChart('agent-distribution-chart', {
        type: 'doughnut',
        data: {
          labels: agentNames,
          datasets: [
            {
              data: agentValues,
              backgroundColor: agentColors,
              borderColor: agentColors,
              borderWidth: 2
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'right',
              labels: {
                color: colors.text,
                padding: 10,
                font: {
                  size: 11
                }
              }
            },
            tooltip: {
              callbacks: {
                label: context => {
                  const label = context.label || '';
                  const value = context.parsed || 0;
                  const total = context.dataset.data.reduce((a, b) => a + b, 0);
                  const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                  return `${label}: ${value} events (${percentage}%)`;
                }
              }
            }
          }
        }
      });
    }
  }

  // WebSocket event handlers
  const handleAgentEvent = event => {
    // Show animation
    showNewEventAnimation = true;
    setTimeout(() => (showNewEventAnimation = false), 2000);

    // Add to events list
    recentEvents = [event, ...recentEvents].slice(0, eventsLimit);
    lastUpdated = new Date();

    // Update charts
    setTimeout(createCharts, 100);
  };

  const handleAgentStatus = _status => {
    // Update agent status in real-time
    loadMonitoringData();
  };

  async function loadMonitoringData() {
    try {
      error = null;

      const [statusData, eventsData] = await Promise.all([
        api.get('/agents-status').catch(() => []),
        api.get(`/agent-events?limit=${eventsLimit}`).catch(() => [])
      ]);

      // Normalize agent status - add confidence from requests_handled
      agentsStatus = (Array.isArray(statusData) ? statusData : []).map(a => ({
        ...a,
        confidence: a.confidence ?? (a.requests_handled > 0 ? 0.95 : 0)
      }));

      // Normalize events - map 'agent' to 'agent_name', add description
      const rawEvents = Array.isArray(eventsData) ? eventsData : eventsData.events || [];
      recentEvents = rawEvents.map(e => ({
        ...e,
        agent_name: e.agent_name || e.agent || 'Unknown',
        description: e.message || e.file || e.event_type
      }));

      loading = false;
      lastUpdated = new Date();

      setTimeout(createCharts, 100);
    } catch (err) {
      logger.error('Failed to load monitoring data:', err);
      error = err.message;
      loading = false;
    }
  }

  async function loadMoreEvents() {
    if (loadingMore) return;

    loadingMore = true;
    eventsLimit += 30;
    await loadMonitoringData();
    loadingMore = false;
  }

  // Auto-refresh effect - only reacts to autoRefresh toggle
  $effect(() => {
    if (autoRefresh) {
      refreshInterval = setInterval(() => {
        loadMonitoringData();
      }, 5000);
    } else if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }

    return () => {
      if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
      }
    };
  });

  // Mount lifecycle
  onMount(() => {
    // Initial load
    loadMonitoringData();

    // Connect to WebSocket for real-time updates
    websocketService.connect();
    websocketService.on('agent-event', handleAgentEvent);
    websocketService.on('agent-status', handleAgentStatus);

    // Watch for theme changes
    themeObserver = createThemeObserver(() => {
      setTimeout(createCharts, 100);
    });

    // Cleanup
    return () => {
      abortRequests();
      websocketService.off('agent-event', handleAgentEvent);
      websocketService.off('agent-status', handleAgentStatus);

      if (themeObserver) {
        themeObserver.disconnect();
      }

      if (refreshInterval) {
        clearInterval(refreshInterval);
      }

      Object.values(charts).forEach(chart => destroyChart(chart));
    };
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-6xl mx-auto">
    <!-- Header -->
    <div class="flex justify-between items-start mb-6 flex-wrap gap-4">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">Agent Monitoring</h1>
        <p class="text-sm text-[var(--muted)] font-sans">
          Real-time agent status and activity tracking
        </p>
      </div>
      <div class="flex items-center gap-3">
        <label
          class="flex items-center gap-2 px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm cursor-pointer"
        >
          <input type="checkbox" bind:checked={autoRefresh} />
          <span class="font-sans">Auto-refresh</span>
        </label>
        <span
          class="text-xs font-mono"
          class:text-[var(--muted)]={!showNewEventAnimation}
          class:text-[var(--warning)]={showNewEventAnimation}
          class:font-bold={showNewEventAnimation}
        >
          {#if showNewEventAnimation}
            New Event!
          {:else}
            Updated {timeAgo}
          {/if}
        </span>
        <button
          onclick={loadMonitoringData}
          disabled={loading}
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors disabled:opacity-50"
        >
          {loading ? '...' : '↻'} Refresh
        </button>
      </div>
    </div>

    {#if error}
      <div
        class="bg-[var(--error-subtle)] border border-[var(--error)] rounded-lg p-4 flex justify-between items-center"
      >
        <span class="text-sm text-[var(--error)] font-sans"
          >Failed to load monitoring data: {error}</span
        >
        <button
          onclick={loadMonitoringData}
          class="px-3 py-1.5 bg-[var(--error)] text-white rounded text-sm font-sans"
        >
          Retry
        </button>
      </div>
    {/if}

    <!-- Status Overview -->
    {#if loading}
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {#each Array(3) as _, i (i)}
          <div
            class="h-24 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-pulse"
          ></div>
        {/each}
      </div>
    {:else}
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
          <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
            Total Agents
          </div>
          <div class="text-sm font-mono text-[var(--text)]">
            {formatNumber(agentsStatus.length)}
          </div>
        </div>

        <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
          <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
            Currently Running
          </div>
          <div class="text-sm font-mono text-[var(--text)]">
            {formatNumber(runningAgents.length)}
          </div>
        </div>

        <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
          <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
            Idle Agents
          </div>
          <div class="text-sm font-mono text-[var(--text)]">
            {formatNumber(idleAgents.length)}
          </div>
        </div>
      </div>
    {/if}

    <!-- Agent Activity Charts -->
    {#if !loading && recentEvents.length > 0}
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <!-- Agent Activity Over Time -->
        <section class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
          <h2 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-4">
            Agent Activity (Last 24h)
          </h2>
          <div class="h-64 bg-[var(--bg)] rounded p-3">
            <canvas id="agent-utilization-chart"></canvas>
          </div>
        </section>

        <!-- Agent Distribution -->
        <section class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
          <h2 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-4">
            Event Distribution by Agent
          </h2>
          <div class="h-64 bg-[var(--bg)] rounded p-3">
            <canvas id="agent-distribution-chart"></canvas>
          </div>
        </section>
      </div>
    {/if}

    <!-- Currently Running Agents -->
    <section class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 mb-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">
          Currently Running Agents
        </h2>
        {#if autoRefresh}
          <span class="flex items-center gap-2 text-sm text-[var(--success)] font-mono">
            <span class="w-2 h-2 bg-[var(--success)] rounded-full animate-pulse"></span>
            Live
          </span>
        {/if}
      </div>

      {#if loading}
        <div class="text-center py-8 text-sm text-[var(--muted)]">Loading agents...</div>
      {:else if runningAgents.length === 0}
        <div class="text-center py-8">
          <p class="text-sm text-[var(--muted)] font-sans">No agents currently running</p>
        </div>
      {:else}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {#each runningAgents as agent (agent.agent_name)}
            <div
              class="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-4 hover:border-[var(--accent)] transition-all"
              style="border-left: 3px solid {getConfidenceColor(agent.confidence)}"
            >
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-semibold text-[var(--text)] font-mono truncate">
                    {agent.agent_name || 'Unknown'}
                  </span>
                </div>
                <span class="flex-shrink-0 w-2 h-2 bg-[var(--success)] rounded-full animate-pulse"
                ></span>
              </div>

              <div class="space-y-2">
                <div class="flex justify-between text-sm">
                  <span class="text-[var(--muted)]">Status:</span>
                  <span class="text-[var(--success)] font-semibold font-mono">
                    {agent.is_running ? 'Running' : 'Active'}
                  </span>
                </div>
                <div class="flex justify-between text-sm">
                  <span class="text-[var(--muted)]">Confidence:</span>
                  <span
                    class="font-semibold font-mono"
                    style="color: {getConfidenceColor(agent.confidence)}"
                  >
                    {(agent.confidence * 100).toFixed(0)}% ({getConfidenceLabel(agent.confidence)})
                  </span>
                </div>
                {#if agent.last_seen}
                  <div class="flex justify-between text-sm">
                    <span class="text-[var(--muted)]">Last Seen:</span>
                    <span class="text-[var(--text)] font-semibold font-mono">
                      {formatDateTime(agent.last_seen)}
                    </span>
                  </div>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <!-- All Agents Status -->
    <section class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 mb-6">
      <h2 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-4">
        All Agents Status
      </h2>

      {#if loading}
        <div class="text-center py-8 text-sm text-[var(--muted)]">Loading agents...</div>
      {:else if agentsStatus.length === 0}
        <div class="text-center py-8">
          <p class="text-sm text-[var(--muted)] font-sans">No agents detected</p>
        </div>
      {:else}
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="bg-[var(--bg)] border-b border-[var(--border)]">
              <tr class="text-left">
                <th
                  class="px-4 py-3 text-xs font-semibold text-[var(--muted)] uppercase tracking-wide"
                >
                  Agent
                </th>
                <th
                  class="px-4 py-3 text-xs font-semibold text-[var(--muted)] uppercase tracking-wide"
                >
                  Status
                </th>
                <th
                  class="px-4 py-3 text-xs font-semibold text-[var(--muted)] uppercase tracking-wide"
                >
                  Confidence
                </th>
                <th
                  class="px-4 py-3 text-xs font-semibold text-[var(--muted)] uppercase tracking-wide"
                >
                  Last Seen
                </th>
              </tr>
            </thead>
            <tbody>
              {#each agentsStatus as agent (agent.agent_name)}
                <tr class="border-b border-[var(--border)] hover:bg-[var(--bg)] transition-colors">
                  <td class="px-4 py-3 text-sm font-semibold text-[var(--accent)] font-mono">
                    {agent.agent_name || 'Unknown'}
                  </td>
                  <td class="px-4 py-3">
                    <span class="flex items-center gap-2 text-sm font-mono">
                      <span
                        class="w-2 h-2 rounded-full {agent.is_running
                          ? 'bg-[var(--success)]'
                          : 'bg-[var(--muted)]'}"
                      ></span>
                      <span class="text-[var(--text)]">{agent.is_running ? 'Running' : 'Idle'}</span
                      >
                    </span>
                  </td>
                  <td class="px-4 py-3">
                    <div class="flex items-center gap-3">
                      <div class="flex-1 h-2 bg-[var(--bg)] rounded overflow-hidden">
                        <div
                          class="h-full transition-all duration-300"
                          style="width: {agent.confidence * 100}%; background: {getConfidenceColor(
                            agent.confidence
                          )}"
                        ></div>
                      </div>
                      <span
                        class="text-sm font-semibold font-mono"
                        style="color: {getConfidenceColor(agent.confidence)}"
                      >
                        {(agent.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  </td>
                  <td class="px-4 py-3 text-sm text-[var(--text)] font-mono">
                    {formatDateTime(agent.last_seen)}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>

    <!-- Activity Timeline -->
    <section class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 mb-6">
      <h2 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-4">
        Recent Activity Timeline
      </h2>

      <!-- Event Filters -->
      {#if !loading && recentEvents.length > 0}
        <div class="mb-4 space-y-3">
          <!-- Event Type Filters -->
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-sm text-[var(--muted)] font-sans font-semibold">Event Type:</span>
            {#each availableEventTypes as type (type)}
              <button
                class="px-3 py-1.5 rounded text-sm font-sans transition-colors border"
                class:bg-[var(--accent)]={selectedEventTypes.includes(type)}
                class:text-white={selectedEventTypes.includes(type)}
                class:border-[var(--accent)]={selectedEventTypes.includes(type)}
                class:bg-[var(--bg)]={!selectedEventTypes.includes(type)}
                class:border-[var(--border)]={!selectedEventTypes.includes(type)}
                class:text-[var(--text)]={!selectedEventTypes.includes(type)}
                onclick={() => toggleEventType(type)}
              >
                {getEventIcon(type)}
                {type}
                {#if selectedEventTypes.includes(type)}{/if}
              </button>
            {/each}
          </div>

          <!-- Date Range Filters -->
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-sm text-[var(--muted)] font-sans font-semibold">Date Range:</span>
            {#each ['all', 'today', '7d', '30d'] as range (range)}
              <button
                class="px-3 py-1.5 rounded text-sm font-sans transition-colors border"
                class:bg-[var(--accent)]={dateRange === range}
                class:text-white={dateRange === range}
                class:border-[var(--accent)]={dateRange === range}
                class:bg-[var(--bg)]={dateRange !== range}
                class:border-[var(--border)]={dateRange !== range}
                class:text-[var(--text)]={dateRange !== range}
                onclick={() => (dateRange = range)}
              >
                {range === 'all'
                  ? 'All Time'
                  : range === 'today'
                    ? 'Today'
                    : range === '7d'
                      ? 'Last 7 Days'
                      : 'Last 30 Days'}
                {#if dateRange === range}{/if}
              </button>
            {/each}
          </div>

          <!-- Active Filters Display -->
          {#if hasActiveFilters}
            <div
              class="flex flex-wrap items-center gap-2 p-3 bg-[var(--bg)] rounded border border-[var(--border)]"
            >
              <span class="text-sm text-[var(--muted)] font-sans font-semibold"
                >Active Filters:</span
              >
              {#each selectedEventTypes as type (type)}
                <button
                  class="inline-flex items-center gap-1 px-2 py-1 bg-[var(--accent)] text-white rounded text-xs font-sans font-semibold"
                  onclick={() => toggleEventType(type)}
                >
                  Type: {type}
                </button>
              {/each}
              {#if dateRange !== 'all'}
                <button
                  class="inline-flex items-center gap-1 px-2 py-1 bg-[var(--accent)] text-white rounded text-xs font-sans font-semibold"
                  onclick={() => (dateRange = 'all')}
                >
                  Range: {dateRange}
                </button>
              {/if}
              <button
                class="ml-auto px-3 py-1 bg-[var(--error)] text-white rounded text-xs font-sans font-semibold hover:opacity-90"
                onclick={clearFilters}
              >
                Clear All
              </button>
            </div>
          {/if}
        </div>
      {/if}

      {#if loading}
        <div class="text-center py-8 text-sm text-[var(--muted)]">Loading activity...</div>
      {:else if filteredEvents.length === 0}
        <div class="text-center py-8">
          <p class="text-sm text-[var(--muted)] font-sans">
            {hasActiveFilters ? 'No events match your filters' : 'No recent activity'}
          </p>
          {#if hasActiveFilters}
            <button
              class="mt-3 px-3 py-1.5 bg-[var(--accent)] text-white rounded text-sm font-sans"
              onclick={clearFilters}
            >
              Clear Filters
            </button>
          {/if}
        </div>
      {:else}
        <div class="space-y-2">
          {#each filteredEvents as event (event.id || event.timestamp)}
            <div
              class="flex items-start gap-3 p-3 bg-[var(--bg)] rounded hover:bg-[var(--surface-2)] transition-all"
            >
              <span class="text-base flex-shrink-0 mt-1">
                {getEventIcon(event.event_type)}
              </span>
              <div class="flex-1 min-w-0">
                <div class="text-sm text-[var(--text)] font-mono mb-1">
                  {#if event.agent_name}
                    <span
                      class="inline-block px-2 py-0.5 mr-2 bg-[var(--accent)] text-white rounded text-sm font-semibold uppercase tracking-wide"
                    >
                      {event.agent_name}
                    </span>
                  {/if}
                  <span>{event.description || event.event_type || 'Activity'}</span>
                </div>
                <div class="text-sm text-[var(--muted)] font-mono">
                  {event.event_type} • {formatDateTime(event.timestamp)}
                </div>
              </div>
            </div>
          {/each}
        </div>

        <!-- Load More Button -->
        {#if filteredEvents.length > 0 && filteredEvents.length >= eventsLimit && filteredEvents.length < recentEvents.length}
          <div class="mt-4 text-center">
            <button
              class="px-4 py-2 bg-[var(--accent)] text-white rounded text-sm font-sans hover:opacity-90 disabled:opacity-50"
              onclick={loadMoreEvents}
              disabled={loadingMore}
            >
              {#if loadingMore}
                <span class="inline-flex items-center gap-2">
                  <span
                    class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"
                  ></span>
                  Loading...
                </span>
              {:else}
                Load More (30 more events)
              {/if}
            </button>
            <p class="mt-2 text-sm text-[var(--muted)] font-sans">
              Showing {filteredEvents.length} of {recentEvents.length} events
            </p>
          </div>
        {/if}
      {/if}
    </section>
  </div>
</div>
