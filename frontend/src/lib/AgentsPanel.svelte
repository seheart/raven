<script>
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';
  import { formatDateTime } from './timeFormat.js';
  import { formatNumber } from './numberFormat.js';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import { API_CONFIG } from '../config.js';
  import { Chart, registerables } from 'chart.js';
  import { settings } from './settingsStore.js';

  Chart.register(...registerables);

  const API_BASE = API_CONFIG.API_BASE;

  let activeTab = 'overview'; // 'overview', 'activity', 'performance', 'setup'
  let agents = [];
  let agentStats = [];
  let agentEvents = [];
  let loading = true;
  let error = null;
  let lastUpdated = null;
  let isRefreshing = false;
  let searchQuery = '';
  let eventsLimit = 30;
  let loadingMoreEvents = false;
  let totalEvents = 0;
  let showSetupGuide = true;

  // Filtering & Sorting
  let selectedEventTypes = []; // Empty = all types
  let sortBy = 'events'; // 'events', 'lines', 'duration'
  let sortOrder = 'desc'; // 'asc', 'desc'
  let selectedAgent = null; // For cross-tab filtering
  let dateRange = 'all'; // 'all', 'today', '7d', '30d'
  let showNewEventAnimation = false;

  // Charts
  let charts = {};

  // Agent color mapping
  const AGENT_COLORS = {
    'claude': 'var(--accent)',
    'gpt': 'var(--success)',
    'gemini': 'var(--info)',
    'ollama': 'var(--warning)',
    'default': 'var(--muted)'
  };

  // WebSocket event handlers (event-driven, no polling)
  const handleAgentEvent = (event) => {
    // Add to events list
    agentEvents = [event, ...agentEvents].slice(0, eventsLimit);
    lastUpdated = new Date();

    // Show animation
    showNewEventAnimation = true;
    setTimeout(() => showNewEventAnimation = false, 2000);
  };

  const handleAgentStats = (stats) => {
    agentStats = stats;
    lastUpdated = new Date();

    // Update charts if on performance tab
    if (activeTab === 'performance') {
      updateCharts();
    }
  };

  const handleProjectSwitched = async (data) => {
    await loadAllData();
  };

  const handleFileChanged = async () => {
    // Reload agent data when files change (agents might have done work)
    await loadAllData();
  };

  // Watch for theme changes by observing body class changes
  let themeObserver;

  onMount(async () => {
    // Initial data load
    await loadAllData();

    // Connect to WebSocket for real-time updates
    websocketService.connect();

    // Listen for real-time agent events (no polling needed!)
    websocketService.on('agent-event', handleAgentEvent);
    websocketService.on('agent-stats', handleAgentStats);
    websocketService.on('project-switched', handleProjectSwitched);
    websocketService.on('file-changed', handleFileChanged);

    // Watch for theme changes on body element
    themeObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class' && activeTab === 'performance') {
          console.log('[AgentsPanel] Theme changed, recreating charts');
          setTimeout(createCharts, 100);
        }
      });
    });

    themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });
  });

  onDestroy(() => {
    // Remove WebSocket listeners
    websocketService.off('agent-event', handleAgentEvent);
    websocketService.off('agent-stats', handleAgentStats);
    websocketService.off('project-switched', handleProjectSwitched);
    websocketService.off('file-changed', handleFileChanged);

    // Disconnect theme observer
    if (themeObserver) {
      themeObserver.disconnect();
    }
  });

  async function loadAllData(manual = false) {
    loading = activeTab === 'overview' && !lastUpdated; // Only show loading on first load
    isRefreshing = manual;
    error = null;

    if (manual) {
      eventsLimit = 30; // Reset limit on manual refresh
    }

    try {
      const [agentsRes, statsRes, eventsRes] = await Promise.all([
        fetch(`${API_BASE}/agents-status`),
        fetch(`${API_BASE}/agent-stats`),
        fetch(`${API_BASE}/agent-events?limit=${eventsLimit}`)
      ]);

      agents = await agentsRes.json();
      agentStats = await statsRes.json();
      agentEvents = await eventsRes.json();

      // Track total events from agent stats
      totalEvents = agentStats.reduce((sum, stat) => sum + (stat?.event_count || 0), 0);

      // Auto-hide setup guide if we have agents
      if (agentStats.length > 0) {
        showSetupGuide = false;
      }

      error = null;
      lastUpdated = new Date();
    } catch (e) {
      error = `Failed to load agent data: ${e}`;
    } finally {
      loading = false;
      isRefreshing = false;
    }
  }

  async function loadMoreEvents() {
    loadingMoreEvents = true;
    eventsLimit += 30;

    try {
      const eventsRes = await fetch(`${API_BASE}/agent-events?limit=${eventsLimit}`);
      agentEvents = await eventsRes.json();
    } catch (e) {
      error = `Failed to load more events: ${e}`;
    } finally {
      loadingMoreEvents = false;
    }
  }

  // Test telemetry - send a sample event
  let testingTelemetry = false;
  async function testTelemetry() {
    testingTelemetry = true;
    try {
      const response = await fetch('http://localhost:3030/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent: 'test-agent',
          event_type: 'test',
          message: 'Test telemetry event from Raven UI',
          file: 'test.js',
          lines_changed: 10,
          duration_ms: 150,
          metadata: { source: 'raven-ui-test' }
        })
      });

      if (response.ok) {
        error = null;
        // Reload data to show the test event
        await loadAllData();
      } else {
        const data = await response.json();
        error = `Test failed: ${data.error || 'Unknown error'}`;
      }
    } catch (e) {
      error = `Test failed: ${e.message}`;
    } finally {
      testingTelemetry = false;
    }
  }

  // Sorting & Filtering Functions
  function toggleSort(field) {
    if (sortBy === field) {
      sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      sortBy = field;
      sortOrder = 'desc';
    }
  }

  function toggleEventType(type) {
    if (selectedEventTypes.includes(type)) {
      selectedEventTypes = selectedEventTypes.filter(t => t !== type);
    } else {
      selectedEventTypes = [...selectedEventTypes, type];
    }
  }

  function selectAgent(agentName) {
    selectedAgent = selectedAgent === agentName ? null : agentName;
  }

  function clearFilters() {
    selectedAgent = null;
    selectedEventTypes = [];
    searchQuery = '';
    dateRange = 'all';
  }

  // Chart Functions
  function createCharts() {
    // Destroy existing charts
    Object.values(charts).forEach(chart => chart?.destroy());
    charts = {};

    // Only create charts if we have data and we're on the performance tab
    if (activeTab !== 'performance' || filteredAgentStats.length === 0) return;

    // Get theme-aware colors from body element (where theme classes are applied)
    const textColor = getComputedStyle(document.body).getPropertyValue('--text').trim();
    const mutedColor = getComputedStyle(document.body).getPropertyValue('--muted').trim();
    const gridColor = 'rgba(128, 128, 128, 0.15)';

    // Create charts for each agent
    filteredAgentStats.forEach(stat => {
      const agentId = stat.agent.replace(/[^a-zA-Z0-9]/g, '-');

      // Activity Breakdown Pie Chart
      const pieCanvas = document.getElementById(`pie-${agentId}`);
      if (pieCanvas) {
        charts[`pie-${agentId}`] = new Chart(pieCanvas, {
          type: 'doughnut',
          data: {
            labels: ['Creates', 'Edits', 'Deletes'],
            datasets: [{
              data: [
                stat.create_count || 0,
                stat.edit_count || 0,
                stat.delete_count || 0
              ],
              backgroundColor: [
                'rgba(16, 185, 129, 0.8)',
                'rgba(59, 130, 246, 0.8)',
                'rgba(239, 68, 68, 0.8)'
              ],
              borderColor: [
                'rgba(16, 185, 129, 1)',
                'rgba(59, 130, 246, 1)',
                'rgba(239, 68, 68, 1)'
              ],
              borderWidth: 2
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: false
              }
            }
          }
        });
      }

      // Response Time Bar Chart
      const barCanvas = document.getElementById(`bar-${agentId}`);
      if (barCanvas) {
        charts[`bar-${agentId}`] = new Chart(barCanvas, {
          type: 'bar',
          data: {
            labels: ['Fastest', 'Average', 'Slowest'],
            datasets: [{
              label: 'Response Time (ms)',
              data: [
                stat.min_duration_ms || 0,
                stat.avg_duration_ms || 0,
                stat.max_duration_ms || 0
              ],
              backgroundColor: [
                'rgba(16, 185, 129, 0.8)',
                'rgba(59, 130, 246, 0.8)',
                'rgba(234, 179, 8, 0.8)'
              ],
              borderColor: [
                'rgba(16, 185, 129, 1)',
                'rgba(59, 130, 246, 1)',
                'rgba(234, 179, 8, 1)'
              ],
              borderWidth: 2,
              borderRadius: 4
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: false
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                ticks: {
                  color: mutedColor,
                  font: {
                    size: 12,
                    family: 'monospace'
                  },
                  maxTicksLimit: 6
                },
                grid: {
                  color: gridColor
                }
              },
              x: {
                ticks: {
                  color: textColor,
                  font: {
                    size: 12,
                    family: 'monospace'
                  }
                },
                grid: {
                  display: false
                }
              }
            }
          }
        });
      }
    });
  }

  function updateCharts() {
    // Recreate charts when data changes
    setTimeout(createCharts, 100);
  }

  // Watch for tab changes to create charts
  $: if (activeTab === 'performance' && filteredAgentStats.length > 0) {
    setTimeout(createCharts, 100);
  }

  // Format time ago (reactive, no interval)

  // Compute reactively when lastUpdated changes
  let timeAgo = 'Just now';
  // Update time ago when lastUpdated changes (prevents infinite loop)
  $: if (lastUpdated) {
    if (!lastUpdated) timeAgo = 'Just now';
    else {
      const seconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
      if (seconds < 10) timeAgo = 'Just now';
      else if (seconds < 60) timeAgo = `${seconds}s ago`;
      else if (seconds < 3600) timeAgo = `${Math.floor(seconds / 60)}m ago`;
      else timeAgo = `${Math.floor(seconds / 3600)}h ago`;
    }
  }

  function getAgentColor(agentName) {
    const lowerName = agentName.toLowerCase();
    for (const [key, color] of Object.entries(AGENT_COLORS)) {
      if (lowerName.includes(key)) return color;
    }
    return AGENT_COLORS.default;
  }

  function getStatusIcon(isRunning) {
    return isRunning ? '🟢' : '⚫';
  }

  function getStatusText(isRunning) {
    return isRunning ? 'Active' : 'Idle';
  }

  function formatTimestamp(timestamp) {
    if (!timestamp) return 'Never';
    return formatDateTime(timestamp);
  }

  function formatDuration(ms) {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  function getEventIcon(eventType) {
    switch(eventType.toLowerCase()) {
    case 'edit': return '✏️';
    case 'create': return '➕';
    case 'delete': return '🗑️';
    case 'read': return '👁️';
    case 'execute': return '⚙️';
    default: return '📝';
    }
  }

  // Reactive computed values
  $: totalEvents = agentStats.reduce((sum, stat) => sum + (stat?.event_count || 0), 0);
  $: totalLinesChanged = agentStats.reduce((sum, stat) => sum + (stat?.total_lines_changed || 0), 0);
  $: averageResponseTime = (() => {
    const length = agentStats.length;
    if (length === 0) return 0;
    const total = agentStats.reduce((sum, stat) => sum + (stat.avg_duration_ms || 0), 0);
    return Math.round(total / length);
  })();

  // Filter and sort agents
  $: filteredAgentStats = (() => {
    let filtered = agentStats;

    // Filter by search query
    if (searchQuery) {
      filtered = filtered.filter(stat =>
        stat.agent.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Filter by selected agent (cross-tab filtering)
    if (selectedAgent) {
      filtered = filtered.filter(stat => stat.agent === selectedAgent);
    }

    // Sort
    filtered = [...filtered].sort((a, b) => {
      let aVal, bVal;
      if (sortBy === 'events') {
        aVal = a.event_count || 0;
        bVal = b.event_count || 0;
      } else if (sortBy === 'lines') {
        aVal = a.total_lines_changed || 0;
        bVal = b.total_lines_changed || 0;
      } else if (sortBy === 'duration') {
        aVal = a.avg_duration_ms || 0;
        bVal = b.avg_duration_ms || 0;
      }

      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    });

    return filtered;
  })();

  // Filter events by search, agent, type, and date range
  $: filteredAgentEvents = (() => {
    let filtered = agentEvents;

    // Filter by search query
    if (searchQuery) {
      filtered = filtered.filter(event =>
        event.agent.toLowerCase().includes(searchQuery.toLowerCase()) ||
        event.message?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Filter by selected agent (cross-tab filtering)
    if (selectedAgent) {
      filtered = filtered.filter(event => event.agent === selectedAgent);
    }

    // Filter by event types
    if (selectedEventTypes.length > 0) {
      filtered = filtered.filter(event =>
        selectedEventTypes.includes(event.event_type.toLowerCase())
      );
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
  })();

  // Get available event types for filtering
  $: availableEventTypes = (() => {
    const types = new Set();
    agentEvents.forEach(event => {
      if (event.event_type) {
        types.add(event.event_type.toLowerCase());
      }
    });
    return Array.from(types).sort();
  })();

  // Export functions
  function exportAgentStatsCSV() {
    const headers = ['Agent', 'Event Count', 'Lines Changed', 'Avg Duration (ms)'];
    const rows = agentStats.map(stat => [
      stat.agent,
      stat.event_count,
      stat.total_lines_changed || 0,
      stat.avg_duration_ms || 'N/A'
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    downloadFile(csv, 'agent-stats.csv', 'text/csv');
  }

  function exportAgentStatsJSON() {
    const data = {
      exported_at: new Date().toISOString(),
      total_agents: agentStats.length,
      total_events: totalEvents,
      total_lines_changed: totalLinesChanged,
      avg_response_time: averageResponseTime,
      agents: agentStats
    };

    downloadFile(JSON.stringify(data, null, 2), 'agent-stats.json', 'application/json');
  }

  function downloadFile(content, filename, contentType) {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }
</script>

<div class="agents-panel" role="region" aria-label="AI Agents monitoring">
  <div class="header">
    <h2 id="agents-heading">🤖 AI Agents</h2>
    <div class="header-actions" role="toolbar" aria-label="Agent panel actions">
      <span class="last-updated" role="status" aria-live="polite" class:pulse-animation={showNewEventAnimation}>
        {#if showNewEventAnimation}
          ✨ New Event!
        {:else}
          Updated: {timeAgo}
        {/if}
      </span>
      <div class="export-dropdown">
        <button class="btn-export" aria-label="Export agent data" aria-haspopup="menu">📊 Export</button>
        <div class="export-menu" role="menu" aria-label="Export options">
          <button on:click={exportAgentStatsCSV} role="menuitem" aria-label="Export as CSV">📄 Export CSV</button>
          <button on:click={exportAgentStatsJSON} role="menuitem" aria-label="Export as JSON">📋 Export JSON</button>
        </div>
      </div>
      <button on:click={() => loadAllData(true)} class="btn-refresh" disabled={isRefreshing} aria-label="Refresh agent data">
        <span class="refresh-icon" class:spinning={isRefreshing} aria-hidden="true">↻</span>
        <span>Refresh</span>
      </button>
    </div>
  </div>

  {#if error}
    <div class="message error" role="alert">{error}</div>
  {/if}

  <!-- Summary Stats -->
  <div class="summary-stats" role="group" aria-labelledby="agents-heading">
    <div class="stat-card" role="status">
      <div class="stat-value">{formatNumber(agentStats.length)}</div>
      <div class="stat-label">Active Agents</div>
    </div>
    <div class="stat-card" role="status">
      <div class="stat-value">{formatNumber(totalEvents)}</div>
      <div class="stat-label">Total Events</div>
    </div>
    <div class="stat-card" role="status">
      <div class="stat-value">{formatNumber(totalLinesChanged)}</div>
      <div class="stat-label">Lines Changed</div>
    </div>
    <div class="stat-card" role="status">
      <div class="stat-value">{formatDuration(averageResponseTime)}</div>
      <div class="stat-label">Avg Response Time</div>
    </div>
  </div>

  <!-- Search & Filter -->
  <div class="search-section" role="search" aria-label="Search agents">
    <input
      type="text"
      class="search-input"
      placeholder="🔍 Search agents..."
      bind:value={searchQuery}
      aria-label="Search agents by name"
    />
  </div>

  <!-- Active Filters Bar -->
  {#if selectedAgent || selectedEventTypes.length > 0 || dateRange !== 'all'}
    <div class="active-filters">
      <span class="filter-label">Active Filters:</span>
      {#if selectedAgent}
        <button
          class="filter-chip"
          on:click={() => selectedAgent = null}
          aria-label="Remove agent filter"
        >
          Agent: {selectedAgent} ✕
        </button>
      {/if}
      {#each selectedEventTypes as type}
        <button
          class="filter-chip"
          on:click={() => toggleEventType(type)}
          aria-label="Remove {type} filter"
        >
          Type: {type} ✕
        </button>
      {/each}
      {#if dateRange !== 'all'}
        <button
          class="filter-chip"
          on:click={() => dateRange = 'all'}
          aria-label="Remove date range filter"
        >
          Range: {dateRange} ✕
        </button>
      {/if}
      <button class="btn-clear-filters" on:click={clearFilters}>Clear All</button>
    </div>
  {/if}

  <!-- Tabs -->
  <div class="tabs" role="tablist" aria-label="Agent information tabs">
    <button
      class="tab"
      class:active={activeTab === 'overview'}
      on:click={() => activeTab = 'overview'}
      role="tab"
      aria-selected={activeTab === 'overview'}
      aria-controls="agents-tabpanel"
      id="overview-tab"
    >
      <span aria-hidden="true">📊</span> Overview
    </button>
    <button
      class="tab"
      class:active={activeTab === 'activity'}
      on:click={() => activeTab = 'activity'}
      role="tab"
      aria-selected={activeTab === 'activity'}
      aria-controls="agents-tabpanel"
      id="activity-tab"
    >
      <span aria-hidden="true">📝</span> Recent Activity
    </button>
    <button
      class="tab"
      class:active={activeTab === 'performance'}
      on:click={() => activeTab = 'performance'}
      role="tab"
      aria-selected={activeTab === 'performance'}
      aria-controls="agents-tabpanel"
      id="performance-tab"
    >
      <span aria-hidden="true">⚡</span> Performance
    </button>
    <button
      class="tab"
      class:active={activeTab === 'setup'}
      on:click={() => activeTab = 'setup'}
      role="tab"
      aria-selected={activeTab === 'setup'}
      aria-controls="agents-tabpanel"
      id="setup-tab"
    >
      <span aria-hidden="true">⚙️</span> Setup Guide
    </button>
  </div>

  <!-- Tab Content -->
  <div class="tab-content" id="agents-tabpanel" role="tabpanel" aria-labelledby="{activeTab}-tab">
    {#if loading}
      <div role="status" aria-live="polite" aria-busy="true"><LoadingSkeleton type="grid" count={4} /></div>
    {:else if activeTab === 'overview'}
      <!-- Overview Tab -->
      <!-- Sort Controls -->
      {#if agentStats.length > 0}
        <div class="sort-controls">
          <span class="sort-label">Sort by:</span>
          <button
            class="sort-btn"
            class:active={sortBy === 'events'}
            on:click={() => toggleSort('events')}
          >
            Events {sortBy === 'events' ? (sortOrder === 'desc' ? '↓' : '↑') : ''}
          </button>
          <button
            class="sort-btn"
            class:active={sortBy === 'lines'}
            on:click={() => toggleSort('lines')}
          >
            Lines Changed {sortBy === 'lines' ? (sortOrder === 'desc' ? '↓' : '↑') : ''}
          </button>
          <button
            class="sort-btn"
            class:active={sortBy === 'duration'}
            on:click={() => toggleSort('duration')}
          >
            Response Time {sortBy === 'duration' ? (sortOrder === 'desc' ? '↓' : '↑') : ''}
          </button>
        </div>
      {/if}

      {#if filteredAgentStats.length === 0}
        <div class="empty" role="status">
          <div class="icon">{searchQuery ? '🔍' : '🤖'}</div>
          <h3>{searchQuery ? 'No agents match your search' : 'No Agent Activity Yet'}</h3>
          <p>{searchQuery ? 'Try a different search term' : 'Send telemetry events to see agent statistics here.'}</p>
          {#if !searchQuery}
            <p class="hint">Agents will appear automatically when they start sending events.</p>
          {/if}
        </div>
      {:else}
        <div class="agents-grid" role="list" aria-label="Agent list">
          {#each filteredAgentStats as stat (stat.agent)}
            <div
              class="agent-card"
              class:clickable={!selectedAgent || selectedAgent === stat.agent}
              class:selected={selectedAgent === stat.agent}
              class:slow-performance={(stat.avg_duration_ms || 0) > 5000}
              style="border-left-color: {getAgentColor(stat.agent)}"
              role="button"
              on:click={() => selectAgent(stat.agent)}
              tabindex="0"
              on:keydown={(e) => e.key === 'Enter' && selectAgent(stat.agent)}
              aria-label="Filter by {stat.agent}"
            >
              <div class="agent-header">
                <div class="agent-icon" style="background-color: {getAgentColor(stat.agent)}" aria-hidden="true">
                  {stat.agent.charAt(0).toUpperCase()}
                </div>
                <div class="agent-info">
                  <h3>{stat.agent}</h3>
                  <span class="agent-type">AI Agent</span>
                </div>
                <!-- Performance Alert -->
                {#if (stat.avg_duration_ms || 0) > 5000}
                  <span class="performance-alert" title="Slow response time detected">⚠️</span>
                {/if}
              </div>

              <div class="agent-stats" role="group" aria-label="{stat.agent} statistics">
                <div class="stat-row">
                  <span class="label">Events:</span>
                  <span class="value">{formatNumber(stat.event_count)}</span>
                </div>
                <div class="stat-row">
                  <span class="label">Lines Changed:</span>
                  <span class="value">{formatNumber(stat.total_lines_changed || 0)}</span>
                </div>
                <div class="stat-row">
                  <span class="label">Avg Duration:</span>
                  <span class="value" class:warning={(stat.avg_duration_ms || 0) > 5000}>
                    {formatDuration(stat.avg_duration_ms)}
                  </span>
                </div>
              </div>

              {#if selectedAgent === stat.agent}
                <div class="filter-badge">Filtering by this agent - Click to clear</div>
              {:else if !selectedAgent}
                <div class="click-hint">Click to filter</div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}

    {:else if activeTab === 'activity'}
      <!-- Activity Tab -->
      <!-- Event Type Filters -->
      {#if agentEvents.length > 0}
        <div class="filter-controls">
          <div class="filter-group">
            <span class="filter-label">Event Type:</span>
            {#each availableEventTypes as type}
              <button
                class="filter-btn"
                class:active={selectedEventTypes.includes(type)}
                on:click={() => toggleEventType(type)}
              >
                {getEventIcon(type)} {type}
                {#if selectedEventTypes.includes(type)}✓{/if}
              </button>
            {/each}
          </div>

          <div class="filter-group">
            <span class="filter-label">Date Range:</span>
            <button
              class="filter-btn"
              class:active={dateRange === 'all'}
              on:click={() => dateRange = 'all'}
            >
              All Time {#if dateRange === 'all'}✓{/if}
            </button>
            <button
              class="filter-btn"
              class:active={dateRange === 'today'}
              on:click={() => dateRange = 'today'}
            >
              Today {#if dateRange === 'today'}✓{/if}
            </button>
            <button
              class="filter-btn"
              class:active={dateRange === '7d'}
              on:click={() => dateRange = '7d'}
            >
              Last 7 Days {#if dateRange === '7d'}✓{/if}
            </button>
            <button
              class="filter-btn"
              class:active={dateRange === '30d'}
              on:click={() => dateRange = '30d'}
            >
              Last 30 Days {#if dateRange === '30d'}✓{/if}
            </button>
          </div>
        </div>
      {/if}

      {#if filteredAgentEvents.length === 0}
        <div class="empty" role="status">
          <div class="icon" aria-hidden="true">{searchQuery || selectedEventTypes.length > 0 || dateRange !== 'all' ? '🔍' : '📝'}</div>
          <h3>{searchQuery || selectedEventTypes.length > 0 || dateRange !== 'all' ? 'No events match your filters' : 'No Recent Activity'}</h3>
          <p>{searchQuery || selectedEventTypes.length > 0 || dateRange !== 'all' ? 'Try adjusting your filters' : 'Agent events will appear here as they occur.'}</p>
        </div>
      {:else}
        <div class="events-list" role="feed" aria-label="Agent activity feed">
          {#each filteredAgentEvents as event (event.id || event.timestamp)}
            <article class="event-row">
              <span class="event-icon" aria-hidden="true">{getEventIcon(event.event_type)}</span>
              <div class="event-details">
                <div class="event-header">
                  <span class="event-agent" style="color: {getAgentColor(event.agent)}">
                    {event.agent}
                  </span>
                  <span class="event-type">{event.event_type}</span>
                </div>
                <div class="event-message">{event.message}</div>
                {#if event.file}
                  <div class="event-file">
                    {#if event.project_name}
                      <span class="file-project">{event.project_name}/</span>
                    {/if}
                    📄 {event.file}
                  </div>
                {/if}
              </div>
              <div class="event-meta">
                {#if event.duration_ms}
                  <span class="event-duration">{formatDuration(event.duration_ms)}</span>
                {/if}
                {#if event.lines_changed}
                  <span class="event-lines">{formatNumber(event.lines_changed)} lines</span>
                {/if}
                <time class="event-time" datetime="{event.timestamp}">{formatTimestamp(event.timestamp)}</time>
              </div>
            </article>
          {/each}
        </div>

        <!-- Load More Button -->
        {#if filteredAgentEvents.length > 0 && filteredAgentEvents.length < totalEvents}
          <div class="load-more-container">
            <button class="load-more-btn" on:click={loadMoreEvents} disabled={loadingMoreEvents}>
              {#if loadingMoreEvents}
                <span class="spinner-small"></span> Loading...
              {:else}
                Load More ({formatNumber(Math.min(30, totalEvents - filteredAgentEvents.length))} more)
              {/if}
            </button>
            <span class="load-more-info">Showing {formatNumber(filteredAgentEvents.length)} of {formatNumber(totalEvents)} events</span>
          </div>
        {/if}
      {/if}

    {:else if activeTab === 'performance'}
      <!-- Performance Tab -->
      {#if filteredAgentStats.length === 0}
        <div class="empty">
          <div class="icon">⚡</div>
          <h3>No Performance Data</h3>
          <p>Performance metrics will appear here once agents are active.</p>
        </div>
      {:else}
        {#each filteredAgentStats as stat (stat.agent)}
          {@const agentId = stat.agent.replace(/[^a-zA-Z0-9]/g, '-')}
          <div class="agent-performance-section">
            <h3 class="agent-section-title" style="color: {getAgentColor(stat.agent)}">
              {stat.agent}
              {#if (stat.avg_duration_ms || 0) > 5000}
                <span class="performance-alert-inline" title="Slow response time detected">⚠️ Slow Performance</span>
              {/if}
            </h3>

            <div class="performance-grid">
              <!-- Response Time Chart -->
              <div class="performance-card chart-card">
                <h4>⚡ Response Time</h4>
                <div class="chart-container">
                  <canvas id="bar-{agentId}"></canvas>
                </div>
                <div class="metric-grid compact">
                  <div class="metric-item">
                    <span class="metric-label">Average</span>
                    <span class="metric-value primary">{stat.avg_duration_ms ? formatDuration(stat.avg_duration_ms) : 'N/A'}</span>
                  </div>
                  <div class="metric-item">
                    <span class="metric-label">Fastest</span>
                    <span class="metric-value success">{stat.min_duration_ms ? formatDuration(stat.min_duration_ms) : 'N/A'}</span>
                  </div>
                  <div class="metric-item">
                    <span class="metric-label">Slowest</span>
                    <span class="metric-value warning">{stat.max_duration_ms ? formatDuration(stat.max_duration_ms) : 'N/A'}</span>
                  </div>
                </div>
              </div>

              <!-- Activity Breakdown Chart -->
              <div class="performance-card chart-card">
                <h4>📊 Activity Breakdown</h4>
                <div class="chart-container pie">
                  <canvas id="pie-{agentId}"></canvas>
                </div>
                <div class="breakdown-summary">
                  <div class="breakdown-item compact">
                    <span class="breakdown-icon create">➕</span>
                    <div class="breakdown-info">
                      <span class="breakdown-value">{formatNumber(stat.create_count || 0)}</span>
                      <span class="breakdown-label">Creates</span>
                    </div>
                  </div>
                  <div class="breakdown-item compact">
                    <span class="breakdown-icon edit">✏️</span>
                    <div class="breakdown-info">
                      <span class="breakdown-value">{formatNumber(stat.edit_count || 0)}</span>
                      <span class="breakdown-label">Edits</span>
                    </div>
                  </div>
                  <div class="breakdown-item compact">
                    <span class="breakdown-icon delete">🗑️</span>
                    <div class="breakdown-info">
                      <span class="breakdown-value">{formatNumber(stat.delete_count || 0)}</span>
                      <span class="breakdown-label">Deletes</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Code Impact Card -->
              <div class="performance-card detail-card">
                <h4>💻 Code Impact</h4>
                <div class="metric-grid">
                  <div class="metric-item">
                    <span class="metric-label">Total Lines</span>
                    <span class="metric-value primary">{formatNumber(stat.total_lines_changed || 0)}</span>
                  </div>
                  <div class="metric-item">
                    <span class="metric-label">Per Event</span>
                    <span class="metric-value">{stat.event_count > 0 ? formatNumber(Math.round((stat.total_lines_changed || 0) / stat.event_count)) : '0'}</span>
                  </div>
                  <div class="metric-item">
                    <span class="metric-label">Total Events</span>
                    <span class="metric-value">{formatNumber(stat.event_count)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        {/each}
      {/if}

    {:else if activeTab === 'setup'}
      <!-- Setup Guide Tab -->
      <div class="setup-guide">
        <div class="setup-header">
          <h3>📡 Configure Your AI Agents</h3>
          <p>Send telemetry data from your AI agents to Raven for real-time monitoring and analytics.</p>
        </div>

        <!-- Test Telemetry Button -->
        <div class="test-section">
          <h4>1. Test the Connection</h4>
          <p>Send a test event to verify Raven is receiving telemetry:</p>
          <button class="btn-test" on:click={testTelemetry} disabled={testingTelemetry}>
            {#if testingTelemetry}
              <span class="spinner-small"></span> Sending...
            {:else}
              🧪 Send Test Event
            {/if}
          </button>
        </div>

        <!-- Endpoint Information -->
        <div class="endpoint-section">
          <h4>2. Telemetry Endpoint</h4>
          <p>Configure your agents to POST telemetry data to:</p>
          <div class="endpoint-box">
            <code class="endpoint-url">POST http://localhost:3030/telemetry</code>
            <button class="btn-copy" on:click={() => navigator.clipboard.writeText('http://localhost:3030/telemetry')}>
              📋 Copy
            </button>
          </div>
        </div>

        <!-- Example Payload -->
        <div class="payload-section">
          <h4>3. Example Payload</h4>
          <p>Send a JSON payload with the following structure:</p>
          <pre class="payload-example"><code>{JSON.stringify({
            agent: 'your-agent-name',
            event_type: 'edit',
            message: 'Modified user authentication logic',
            file: 'src/auth.js',
            lines_changed: 25,
            duration_ms: 1500,
            metadata: {
              model: 'claude-3-5-sonnet',
              prompt_type: 'code-edit'
            }
          }, null, 2)}</code></pre>
          <button class="btn-copy-payload" on:click={() => navigator.clipboard.writeText(JSON.stringify({
            agent: 'your-agent-name',
            event_type: 'edit',
            message: 'Modified user authentication logic',
            file: 'src/auth.js',
            lines_changed: 25,
            duration_ms: 1500,
            metadata: {
              model: 'claude-3-5-sonnet',
              prompt_type: 'code-edit'
            }
          }, null, 2))}>
            📋 Copy Example
          </button>
        </div>

        <!-- Field Descriptions -->
        <div class="fields-section">
          <h4>4. Required Fields</h4>
          <table class="fields-table">
            <tbody>
              <tr>
                <td class="field-name"><code>agent</code></td>
                <td class="field-type">string</td>
                <td class="field-desc">Agent identifier (e.g., "claude-code", "cursor", "chatgpt")</td>
              </tr>
              <tr>
                <td class="field-name"><code>event_type</code></td>
                <td class="field-type">string</td>
                <td class="field-desc">Event type: "edit", "create", "delete", "read", "execute"</td>
              </tr>
              <tr>
                <td class="field-name"><code>message</code></td>
                <td class="field-type">string</td>
                <td class="field-desc">Human-readable description of the event</td>
              </tr>
            </tbody>
          </table>

          <h4 style="margin-top: 16px;">Optional Fields</h4>
          <table class="fields-table">
            <tbody>
              <tr>
                <td class="field-name"><code>file</code></td>
                <td class="field-type">string</td>
                <td class="field-desc">File path relative to project root</td>
              </tr>
              <tr>
                <td class="field-name"><code>lines_changed</code></td>
                <td class="field-type">number</td>
                <td class="field-desc">Number of lines modified</td>
              </tr>
              <tr>
                <td class="field-name"><code>duration_ms</code></td>
                <td class="field-type">number</td>
                <td class="field-desc">Operation duration in milliseconds</td>
              </tr>
              <tr>
                <td class="field-name"><code>metadata</code></td>
                <td class="field-type">object</td>
                <td class="field-desc">Additional context (model, prompt type, etc.)</td>
              </tr>
              <tr>
                <td class="field-name"><code>project</code></td>
                <td class="field-type">string</td>
                <td class="field-desc">Project identifier (optional, auto-detected)</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Integration Examples -->
        <div class="integration-section">
          <h4>5. Integration Examples</h4>
          <div class="integration-tabs">
            <details>
              <summary>JavaScript/Node.js</summary>
              <pre><code>{`async function sendTelemetry(agent, eventType, message, file, linesChanged) {
  await fetch('http://localhost:3030/telemetry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agent,
      event_type: eventType,
      message,
      file,
      lines_changed: linesChanged,
      duration_ms: Date.now() - startTime
    })
  });
}`}</code></pre>
            </details>
            <details>
              <summary>Python</summary>
              <pre><code>{`import requests

def send_telemetry(agent, event_type, message, file=None, lines_changed=0):
    requests.post('http://localhost:3030/telemetry', json={
        'agent': agent,
        'event_type': event_type,
        'message': message,
        'file': file,
        'lines_changed': lines_changed
    })`}</code></pre>
            </details>
            <details>
              <summary>cURL</summary>
              <pre><code>{`curl -X POST http://localhost:3030/telemetry \\
  -H "Content-Type: application/json" \\
  -d '{
    "agent": "my-agent",
    "event_type": "edit",
    "message": "Updated function",
    "file": "src/main.js",
    "lines_changed": 10
  }'`}</code></pre>
            </details>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <div class="footer">
    <p class="hint">
      Raven monitors AI agent activity through telemetry events.
      Supports: Claude, GPT, Gemini, Ollama, and more.
    </p>
  </div>
</div>

<style>
  .agents-panel {
    padding: 8px;
    width: 100%;
    margin: 0;
    font-family: var(--mono);
    background: var(--bg);
    color: var(--text);
    position: relative;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
    padding: 0 8px;
  }

  h2 {
    margin: 0;
    font-size: 11px;
    font-weight: 600;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .last-updated {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--muted);
  }

  .btn-refresh {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--text);
    cursor: pointer;
    font-size: 12px;
    transition: all 0.2s;
  }

  .btn-refresh:hover:not(:disabled) {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
    transform: translateY(-1px);
  }

  .btn-refresh:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .refresh-icon {
    display: inline-block;
    transition: transform 0.3s ease;
  }

  .refresh-icon.spinning {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  /* Export Dropdown */
  .export-dropdown {
    position: relative;
  }

  .btn-export {
    padding: 6px 10px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--text);
    cursor: pointer;
    font-size: 12px;
    transition: all 0.2s;
  }

  .btn-export:hover {
    background: var(--surface-2);
  }

  .btn-export:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .export-menu {
    display: none;
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 4px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 3px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    z-index: 100;
    min-width: 150px;
  }

  .export-dropdown:hover .export-menu,
  .export-dropdown:focus-within .export-menu {
    display: block;
  }

  .export-menu button {
    display: block;
    width: 100%;
    padding: 6px 10px;
    background: transparent;
    border: none;
    color: var(--text);
    text-align: left;
    cursor: pointer;
    font-size: 12px;
    font-family: var(--mono);
    transition: background 0.2s;
  }

  .export-menu button:hover {
    background: var(--surface-2);
  }

  .export-menu button:first-child {
    border-radius: 3px 6px 0 0;
  }

  .export-menu button:last-child {
    border-radius: 0 0 6px 6px;
  }

  .message {
    padding: 6px;
    border-radius: 3px;
    margin-bottom: 10px;
    font-size: 12px;
  }

  .message.error {
    background: color-mix(in srgb, var(--error) 15%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--error) 25%, var(--surface));
    color: var(--error);
  }

  /* Search Section */
  .search-section {
    margin-bottom: 6px;
  }

  .search-input {
    width: 100%;
    padding: 6px 10px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--text);
    font-family: var(--mono);
    font-size: 11px;
    transition: all 0.2s;
  }

  .search-input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent);
  }

  .search-input::placeholder {
    color: var(--muted);
  }

  /* Summary Stats */
  .summary-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 6px;
    margin-bottom: 10px;
  }

  .stat-card {
    background: var(--surface);
    border: 1px solid var(--surface-2);
    border-radius: 4px;
    padding: 6px;
    text-align: center;
  }

  .stat-value {
    font-size: 11px;
    font-weight: 700;
    color: var(--warning);
    margin-bottom: 8px;
  }

  .stat-label {
    font-size: 12px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* Tabs */
  .tabs {
    display: flex;
    gap: 4px;
    align-items: center;
    margin-bottom: 10px;
    border-bottom: 2px solid var(--surface-2);
  }

  .tab {
    padding: 6px 12px;
    background: transparent;
    border: none;
    border-bottom: 3px solid transparent;
    color: var(--muted);
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    transition: all 0.2s;
  }

  .tab:hover {
    color: var(--text);
    background: var(--surface);
  }

  .tab:focus {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .tab.active {
    color: var(--warning);
    border-bottom-color: var(--warning);
  }

  .tab-content {
    min-height: 400px;
  }

  /* (removed unused .loading) */

  .empty {
    text-align: center;
    padding: 40px 20px;
    color: var(--muted);
  }

  .empty .icon {
    font-size: 11px;
    margin-bottom: 10px;
  }

  .empty h3 {
    color: var(--text);
    font-size: 11px;
    margin-bottom: 6px;
  }

  .empty p {
    font-size: 12px;
    line-height: 1.4;
    margin-bottom: 8px;
  }

  .empty .hint {
    font-size: 12px;
    color: var(--muted);
    font-style: italic;
  }

  /* Overview Tab */
  .agents-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 6px;
  }

  .agent-card {
    background: var(--surface);
    border: 1px solid var(--surface-2);
    border-left-width: 4px;
    border-radius: 4px;
    padding: 6px;
  }

  .agent-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 10px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--surface-2);
  }

  .agent-icon {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 11px;
    font-weight: 700;
    flex-shrink: 0;
  }

  .agent-info {
    flex: 1;
  }

  .agent-info h3 {
    margin: 0 0 4px 0;
    font-size: 11px;
    font-weight: 600;
    color: var(--text);
  }

  .agent-type {
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .agent-stats {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .stat-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
  }

  .stat-row .label {
    color: var(--muted);
  }

  .stat-row .value {
    color: var(--text);
    font-weight: 600;
  }

  /* Activity Tab */
  .events-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .event-row {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    background: var(--surface);
    border: 1px solid var(--surface-2);
    border-radius: 3px;
    padding: 6px;
    transition: all 0.2s;
  }

  .event-row:hover {
    background: var(--surface-2);
    border-color: var(--surface-2);
  }

  .event-icon {
    font-size: 12px;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .event-details {
    flex: 1;
    min-width: 0;
  }

  .event-header {
    display: flex;
    gap: 6px;
    align-items: center;
    margin-bottom: 4px;
  }

  .event-agent {
    font-weight: 600;
    font-size: 12px;
  }

  .event-type {
    background: var(--surface-2);
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
  }

  .event-message {
    color: var(--text);
    font-size: 11px;
    margin-bottom: 4px;
  }

  .event-file {
    color: var(--muted);
    font-size: 12px;
    font-family: monospace;
  }

  .file-project {
    color: #3b82f6;
    font-weight: 600;
  }

  .event-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
    font-size: 11px;
    color: var(--muted);
  }

  .event-duration,
  .event-lines {
    background: var(--surface-2);
    padding: 2px 6px;
    border-radius: 3px;
  }

  /* Performance Tab */
  .agent-performance-section {
    margin-bottom: 16px;
  }

  .agent-section-title {
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 10px;
    padding: 8px 12px;
    background: var(--surface-2);
    border-radius: 4px;
    display: flex;
    align-items: center;
  }

  .performance-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 10px;
  }

  .performance-card {
    background: var(--surface);
    border: 1px solid var(--surface-2);
    border-radius: 4px;
    padding: 10px 12px;
  }

  .performance-card h4 {
    color: var(--text);
    font-size: 12px;
    margin: 0 0 8px 0;
    font-weight: 600;
  }

  .metric-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }

  .metric-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px;
    background: var(--surface-2);
    border-radius: 3px;
  }

  .metric-label {
    font-size: 10px;
    color: var(--muted);
    text-transform: uppercase;
    font-weight: 600;
    letter-spacing: 0.5px;
  }

  .metric-value {
    font-size: 14px;
    color: var(--text);
    font-weight: 700;
    font-family: var(--mono);
  }

  .metric-value.primary {
    color: var(--accent);
  }

  .metric-value.success {
    color: #10b981;
  }

  .metric-value.warning {
    color: var(--warning);
  }

  .breakdown-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    background: var(--surface-2);
    border-radius: 3px;
  }

  .breakdown-icon {
    font-size: 16px;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    flex-shrink: 0;
  }

  .breakdown-icon.create {
    background: rgba(16, 185, 129, 0.1);
  }

  .breakdown-icon.edit {
    background: rgba(59, 130, 246, 0.1);
  }

  .breakdown-icon.delete {
    background: rgba(239, 68, 68, 0.1);
  }

  .breakdown-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
  }

  .breakdown-value {
    font-size: 16px;
    font-weight: 700;
    color: var(--text);
    font-family: var(--mono);
  }

  .breakdown-label {
    font-size: 10px;
    color: var(--muted);
    text-transform: uppercase;
    font-weight: 600;
    letter-spacing: 0.5px;
  }

  /* Load More Button */
  .load-more-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 24px;
    margin-top: 16px;
  }

  .load-more-btn {
    padding: 10px 20px;
    background: var(--accent);
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--mono);
  }

  .load-more-btn:hover:not(:disabled) {
    background: var(--accent-hover, var(--accent));
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  .load-more-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .load-more-info {
    font-size: 12px;
    color: var(--muted);
    font-family: var(--mono);
  }

  .spinner-small {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  /* Setup Guide Tab */
  .setup-guide {
    max-width: 900px;
    margin: 0 auto;
  }

  .setup-header {
    text-align: center;
    margin-bottom: 32px;
    padding: 20px;
    background: var(--surface-2);
    border-radius: 6px;
  }

  .setup-header h3 {
    font-size: 18px;
    margin: 0 0 12px 0;
    color: var(--text);
  }

  .setup-header p {
    font-size: 13px;
    color: var(--muted);
    margin: 0;
    line-height: 1.6;
  }

  .test-section,
  .endpoint-section,
  .payload-section,
  .fields-section,
  .integration-section {
    margin-bottom: 32px;
    padding: 20px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  .setup-guide h4 {
    font-size: 14px;
    font-weight: 700;
    color: var(--text);
    margin: 0 0 12px 0;
  }

  .setup-guide p {
    font-size: 13px;
    color: var(--muted);
    margin: 0 0 16px 0;
    line-height: 1.6;
  }

  .btn-test {
    padding: 12px 24px;
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    border: 1px solid #047857;
    border-radius: 4px;
    color: white;
    font-family: var(--mono);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .btn-test:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
  }

  .btn-test:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .endpoint-box {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 4px;
  }

  .endpoint-url {
    flex: 1;
    font-family: var(--mono);
    font-size: 13px;
    color: var(--accent);
    font-weight: 600;
  }

  .btn-copy,
  .btn-copy-payload {
    padding: 6px 12px;
    background: var(--surface-3);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-copy:hover,
  .btn-copy-payload:hover {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }

  .btn-copy-payload {
    margin-top: 12px;
  }

  .payload-example {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 16px;
    overflow-x: auto;
    margin: 0;
  }

  .payload-example code {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--text);
    line-height: 1.6;
  }

  .fields-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    margin-bottom: 16px;
  }

  .fields-table tr {
    border-bottom: 1px solid var(--border);
  }

  .fields-table td {
    padding: 12px 8px;
    vertical-align: top;
  }

  .field-name {
    font-family: var(--mono);
    font-weight: 600;
    color: var(--accent);
    width: 150px;
  }

  .field-type {
    color: var(--warning);
    font-family: var(--mono);
    width: 80px;
  }

  .field-desc {
    color: var(--muted);
    line-height: 1.5;
  }

  .integration-tabs details {
    margin-bottom: 12px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--surface-2);
  }

  .integration-tabs summary {
    padding: 12px 16px;
    cursor: pointer;
    font-weight: 600;
    font-size: 13px;
    color: var(--text);
    user-select: none;
  }

  .integration-tabs summary:hover {
    background: var(--surface-3);
  }

  .integration-tabs pre {
    margin: 0;
    padding: 16px;
    background: var(--surface);
    border-top: 1px solid var(--border);
    overflow-x: auto;
  }

  .integration-tabs code {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--text);
    line-height: 1.6;
  }

  /* Footer */
  .footer {
    margin-top: 20px;
    padding-top: 12px;
    border-top: 1px solid var(--surface-2);
  }

  .footer .hint {
    font-size: 11px;
    color: var(--muted);
    text-align: center;
    line-height: 1.4;
  }

  /* Pulse Animation */
  .pulse-animation {
    animation: pulse 1s ease-in-out infinite;
    color: var(--warning) !important;
    font-weight: 600;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  /* Active Filters Bar */
  .active-filters {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 4px;
    margin-bottom: 10px;
    flex-wrap: wrap;
  }

  .filter-label {
    font-size: 11px;
    color: var(--muted);
    font-weight: 600;
    text-transform: uppercase;
  }

  .filter-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: var(--accent);
    color: white;
    border: none;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
    font-family: var(--mono);
    cursor: pointer;
    transition: all 0.2s;
  }

  .filter-chip:hover {
    background: var(--accent-hover, var(--accent));
    transform: scale(1.05);
  }

  .btn-clear-filters {
    padding: 4px 12px;
    background: var(--error);
    color: white;
    border: none;
    border-radius: 3px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    margin-left: auto;
  }

  .btn-clear-filters:hover {
    background: #dc2626;
    transform: translateY(-1px);
  }

  /* Sort Controls */
  .sort-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px;
    background: var(--surface-2);
    border-radius: 4px;
    margin-bottom: 16px;
  }

  .sort-label {
    font-size: 11px;
    color: var(--muted);
    font-weight: 600;
    text-transform: uppercase;
    margin-right: 4px;
  }

  .sort-btn {
    padding: 6px 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--text);
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    font-family: var(--mono);
  }

  .sort-btn:hover {
    background: var(--surface-3);
    border-color: var(--accent);
  }

  .sort-btn.active {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
    font-weight: 600;
  }

  /* Filter Controls */
  .filter-controls {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
    background: var(--surface-2);
    border-radius: 4px;
    margin-bottom: 16px;
  }

  .filter-group {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .filter-btn {
    padding: 6px 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--text);
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    font-family: var(--mono);
  }

  .filter-btn:hover {
    background: var(--surface-3);
    border-color: var(--accent);
  }

  .filter-btn.active {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
    font-weight: 600;
  }

  /* Agent Card Enhancements */
  .agent-card.clickable {
    cursor: pointer;
    transition: all 0.2s;
  }

  .agent-card.clickable:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    border-left-width: 6px;
  }

  .agent-card.selected {
    border-left-width: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    background: var(--surface-2);
  }

  .agent-card.slow-performance {
    border-right: 3px solid var(--warning);
  }

  .performance-alert {
    font-size: 16px;
    margin-left: auto;
    animation: pulse 2s ease-in-out infinite;
  }

  .performance-alert-inline {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: rgba(234, 179, 8, 0.2);
    color: var(--warning);
    border-radius: 3px;
    font-size: 11px;
    font-weight: 600;
    margin-left: 12px;
  }

  .click-hint {
    text-align: center;
    font-size: 10px;
    color: var(--muted);
    margin-top: 8px;
    padding: 4px;
    background: var(--surface-2);
    border-radius: 3px;
    opacity: 0;
    transition: opacity 0.2s;
  }

  .agent-card:hover .click-hint {
    opacity: 1;
  }

  .filter-badge {
    text-align: center;
    font-size: 10px;
    color: white;
    background: var(--accent);
    margin-top: 8px;
    padding: 6px;
    border-radius: 3px;
    font-weight: 600;
  }

  .stat-row .value.warning {
    color: var(--warning);
  }

  /* Chart Styles */
  .chart-card {
    display: flex;
    flex-direction: column;
  }

  .chart-container {
    flex: 1;
    height: 180px;
    max-height: 180px;
    padding: 12px 16px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .chart-container.pie {
    height: 200px;
    max-height: 200px;
    padding: 16px;
  }

  .metric-grid.compact {
    margin-top: 8px;
    gap: 8px;
  }

  .breakdown-summary {
    display: flex;
    flex-direction: row;
    justify-content: space-around;
    gap: 8px;
    padding: 12px;
    border-top: 1px solid var(--border);
  }

  .breakdown-item.compact {
    padding: 4px 6px;
    flex: 1;
  }

  @media (max-width: 768px) {
    .agents-grid,
    .performance-grid {
      grid-template-columns: 1fr;
    }

    .filter-controls,
    .sort-controls {
      flex-direction: column;
      align-items: flex-start;
    }

    .filter-group {
      width: 100%;
    }

    .breakdown-summary {
      flex-direction: column;
    }

    .breakdown-item.compact {
      flex: none;
    }
  }
</style>
