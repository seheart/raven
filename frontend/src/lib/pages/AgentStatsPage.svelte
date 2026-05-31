<script>
  import { logger } from '../logger.js';
  import { createPageApi } from '../apiClient.js';
  import { PageLayout, PageHeader, StatusBar } from '../components/layout/index.js';
  import {
    RefreshButton,
    ToolbarButton,
    EmptyState,
    LoadingState,
    DataFetchError,
    FreshnessBadge
  } from '../components/ui/index.js';
  const { api, abort: abortRequests } = createPageApi();
  import { formatDateTime as formatDateTimeUtil } from '../timeFormat.js';
  /**
   * Agent Stats Page
   * Comprehensive agent statistics with search, filtering, and export
   */
  import { onMount } from 'svelte';
  import { websocketService } from '../services/websocket.js';
  import {
    createChart,
    destroyChart,
    createThemeObserver,
    getChartColors
  } from '../utils/chartUtils.js';
  import { getAgentBrand } from '../utils/agentBrand.js';

  let agentStats = $state([]);
  let loading = $state(true);
  let error = $state(null);
  let searchQuery = $state('');
  let sortBy = $state('total_events');
  let sortDesc = $state(true);
  let lastUpdated = $state(new Date());

  let charts = $state({});
  let themeObserver = $state(null);
  let showNewEventAnimation = $state(false);

  // Summary stats
  const summaryStats = $derived.by(() => {
    const filtered = filteredStats;
    return {
      total_agents: filtered.length,
      total_events: filtered.reduce((sum, a) => sum + (a.total_events || 0), 0),
      total_lines: filtered.reduce((sum, a) => sum + (a.lines_changed || 0), 0),
      total_files: filtered.reduce((sum, a) => sum + (a.files_modified || 0), 0),
      total_duration: filtered.reduce((sum, a) => sum + (a.total_duration_seconds || 0), 0)
    };
  });

  // Filtered stats
  const filteredStats = $derived.by(() => {
    if (!searchQuery) return agentStats;
    const query = searchQuery.toLowerCase();
    return agentStats.filter(agent => (agent.agent_name || '').toLowerCase().includes(query));
  });

  // Sorted stats
  const sortedStats = $derived.by(() => {
    const sorted = [...filteredStats];
    sorted.sort((a, b) => {
      let valA, valB;
      switch (sortBy) {
        case 'agent_name':
          valA = a.agent_name || '';
          valB = b.agent_name || '';
          return sortDesc ? valB.localeCompare(valA) : valA.localeCompare(valB);
        case 'total_events':
          valA = a.total_events || 0;
          valB = b.total_events || 0;
          break;
        case 'lines_changed':
          valA = a.lines_changed || 0;
          valB = b.lines_changed || 0;
          break;
        case 'files_modified':
          valA = a.files_modified || 0;
          valB = b.files_modified || 0;
          break;
        case 'total_duration_seconds':
          valA = a.total_duration_seconds || 0;
          valB = b.total_duration_seconds || 0;
          break;
        case 'last_active':
          valA = a.last_active ? new Date(a.last_active).getTime() : 0;
          valB = b.last_active ? new Date(b.last_active).getTime() : 0;
          break;
        default:
          valA = 0;
          valB = 0;
      }
      return sortDesc ? valB - valA : valA - valB;
    });
    return sorted;
  });

  // Time ago
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
    return formatDateTimeUtil(timestamp);
  }

  function formatDuration(seconds) {
    if (!seconds) return '0m';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  // Get agent config (delegates to shared brand utility — keeps name+color in
  // one place across pages). Returns the same shape pages expect: an object
  // with at least { color, name }; icon was unused so it's gone.
  function getAgentConfig(agentName) {
    return getAgentBrand(agentName);
  }

  // Calculate mood from agent behavior
  function calculateMood(agent) {
    const createRate = (agent.create_count || 0) / Math.max(agent.total_events || 1, 1);
    const deleteRate = (agent.delete_count || 0) / Math.max(agent.total_events || 1, 1);

    if (createRate > 0.4 || deleteRate > 0.3) return 'aggressive';
    if (createRate < 0.15 && deleteRate < 0.1) return 'conservative';
    return 'balanced';
  }

  // Calculate style from agent behavior
  function calculateStyle(agent) {
    const createRate = (agent.create_count || 0) / Math.max(agent.total_events || 1, 1);
    const deleteRate = (agent.delete_count || 0) / Math.max(agent.total_events || 1, 1);
    const editRate = (agent.edit_count || 0) / Math.max(agent.total_events || 1, 1);

    if (createRate > 0.4) return 'builder';
    if (deleteRate > 0.3) return 'cleanup';
    if (editRate > 0.6) return 'refactorer';
    return 'mixed';
  }

  // getMoodEmoji / getStyleEmoji used to map labels to emoji glyphs;
  // those got stripped per project rules and the helpers became "return
  // ''" — leaking leading whitespace into chips. Removed entirely; the
  // labels alone read fine. Same for the commented-out handleSort —
  // dead since the table moved to a different sort flow.

  function exportCSV() {
    const headers = [
      'Agent Name',
      'Total Events',
      'Lines Changed',
      'Files Modified',
      'Duration (seconds)',
      'Last Active'
    ];
    const rows = filteredStats.map(a => [
      a.agent_name || 'Unknown',
      a.total_events || 0,
      a.lines_changed || 0,
      a.files_modified || 0,
      a.total_duration_seconds || 0,
      a.last_active || 'Never'
    ]);

    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agent-stats-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportJSON() {
    const exportData = {
      exported_at: new Date().toISOString(),
      total_agents: filteredStats.length,
      summary: summaryStats,
      agents: filteredStats.map(a => ({
        agent_name: a.agent_name || 'Unknown',
        total_events: a.total_events || 0,
        lines_changed: a.lines_changed || 0,
        files_modified: a.files_modified || 0,
        total_duration_seconds: a.total_duration_seconds || 0,
        last_active: a.last_active
      }))
    };

    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agent-stats-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Debounce chart rebuilds. loadStats() runs on initial load, manual
  // refresh, AND on every 'agent-event' / 'agent-stats' WS message — a
  // burst of live events would otherwise tear down and rebuild every
  // per-agent doughnut repeatedly. Collapse the storm into one rebuild.
  let chartRebuildTimer = null;
  function scheduleCharts(delay = 100) {
    if (chartRebuildTimer) clearTimeout(chartRebuildTimer);
    chartRebuildTimer = setTimeout(() => {
      chartRebuildTimer = null;
      createCharts();
    }, delay);
  }

  // Create charts for each agent
  function createCharts() {
    // Destroy existing charts
    Object.values(charts).forEach(chart => destroyChart(chart));
    charts = {};

    const colors = getChartColors();

    filteredStats.forEach(stat => {
      const agentId = (stat.agent_name || 'unknown').replace(/[^a-zA-Z0-9]/g, '-');

      // Activity Breakdown Pie Chart
      const pieCanvas = document.getElementById(`pie-${agentId}`);
      if (pieCanvas) {
        charts[`pie-${agentId}`] = createChart(`pie-${agentId}`, {
          type: 'doughnut',
          data: {
            labels: ['Creates', 'Edits', 'Deletes'],
            datasets: [
              {
                data: [stat.create_count || 0, stat.edit_count || 0, stat.delete_count || 0],
                backgroundColor: [colors.success, colors.warning, colors.error],
                borderColor: [colors.success, colors.warning, colors.error],
                borderWidth: 2
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
                  label: context => {
                    const label = context.label || '';
                    const value = context.parsed || 0;
                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                    const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                    return `${label}: ${value} (${percentage}%)`;
                  }
                }
              }
            }
          }
        });
      }
    });
  }

  // WebSocket event handlers
  const handleAgentEvent = _event => {
    // Show animation
    showNewEventAnimation = true;
    setTimeout(() => (showNewEventAnimation = false), 2000);

    // Reload stats to reflect new event
    loadStats();
  };

  const handleAgentStats = _stats => {
    // Update stats in real-time
    loadStats();
  };

  async function loadStats() {
    try {
      loading = true;
      error = null;

      // Fetch agent stats. Previously `.catch(() => [])` swallowed backend
      // outages into an empty "no agents" state — the exact silent-failure
      // the user objected to. Let it throw to the error path below.
      const statsData = await api.get('/agent-stats');
      const raw = Array.isArray(statsData) ? statsData : [];
      // Backend appends a synthetic _aggregate row carrying global file stats.
      // Skip it for the per-agent table.
      const stats = raw.filter(a => !a?.is_aggregate && a?.agent !== '_aggregate');

      agentStats = stats.map(agent => {
        // The repo's totals() now returns first_seen / last_active /
        // unique_files / total_file_events directly. Earlier this code
        // remapped to fields the SQL didn't compute (total_file_changes,
        // unique_files-when-not-returned, etc.) so the page rendered
        // 0 / 0 / 0m across every card. lines_changed in the table is
        // null on every row (the telemetry doesn't capture line counts),
        // so the headline "File Changes" stat now reflects file-events
        // count instead — that's the honest "how much file activity"
        // signal we actually have.
        const fileEvents = agent.total_file_events || 0;
        const daysSinceFirst = agent.first_seen
          ? Math.max(
              1,
              Math.ceil((new Date() - new Date(agent.first_seen)) / (1000 * 60 * 60 * 24))
            )
          : 1;
        const totalDurationSec =
          agent.first_seen && agent.last_active
            ? Math.round(
                (new Date(agent.last_active).getTime() - new Date(agent.first_seen).getTime()) /
                  1000
              )
            : 0;

        return {
          ...agent,
          agent_name: agent.agent_name || agent.agent || 'Unknown',
          total_events: agent.event_count || 0,
          lines_changed: fileEvents, // headline "File events" stat
          files_modified: agent.unique_files || 0,
          last_active: agent.last_active || null,
          first_seen: agent.first_seen || null,
          create_count: agent.create_count || 0,
          edit_count: agent.edit_count || 0,
          delete_count: agent.delete_count || 0,
          changes_per_day: Math.round(fileEvents / daysSinceFirst),
          unique_files: agent.unique_files || 0,
          total_duration_seconds: totalDurationSec,
          tool_breakdown: agent.tool_breakdown || []
        };
      });

      loading = false;
      lastUpdated = new Date();

      // Create charts after data loads (debounced to absorb WS-driven reloads)
      scheduleCharts();
    } catch (err) {
      logger.error('Failed to load agent stats:', err);
      error = err.message;
      loading = false;
    }
  }

  // Mount lifecycle
  onMount(() => {
    // Initial load
    loadStats();

    // Connect to WebSocket for real-time updates
    websocketService.connect();
    websocketService.on('agent-event', handleAgentEvent);
    websocketService.on('agent-stats', handleAgentStats);

    // Watch for theme changes
    themeObserver = createThemeObserver(() => {
      scheduleCharts();
    });

    // Cleanup
    return () => {
      abortRequests();
      websocketService.off('agent-event', handleAgentEvent);
      websocketService.off('agent-stats', handleAgentStats);

      if (themeObserver) {
        themeObserver.disconnect();
      }

      if (chartRebuildTimer) clearTimeout(chartRebuildTimer);

      Object.values(charts).forEach(chart => destroyChart(chart));
    };
  });
</script>

<PageLayout>
  <StatusBar prompt="RAVEN.AGENTS" label="Agents · Stats" />

  <PageHeader
    title="Agent Performance"
    description="How each of your AI tools has been working — what they touch, how often, and at what pace. The mood and style chips on each row describe how that agent edits in plain language; hover them for the definitions."
  >
    {#snippet actions()}
      <div class="flex items-center gap-3">
        <FreshnessBadge mode="polled" since={lastUpdated} />
        <RefreshButton onClick={loadStats} {loading} />
      </div>
    {/snippet}
  </PageHeader>

  {#if error}
    <DataFetchError
      endpoint="/api/agent-stats"
      message="Failed to load agent stats"
      hint={error}
      onRetry={loadStats}
    />
  {/if}

  <!-- Summary Cards -->
  {#if loading}
    <div class="grid grid-cols-2 xl:grid-cols-5 gap-4 mb-6">
      {#each Array(5) as _, i (i)}
        <div class="h-24 bg-surface border border-border rounded-lg animate-pulse"></div>
      {/each}
    </div>
  {:else}
    <div class="grid grid-cols-2 xl:grid-cols-5 gap-4 mb-6">
      <div class="bg-surface border border-border rounded p-4">
        <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
          Total Agents
        </div>
        <div class="text-sm font-mono text-body">
          {formatNumber(summaryStats.total_agents)}
        </div>
      </div>
      <div class="bg-surface border border-border rounded p-4">
        <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
          Total Events
        </div>
        <div class="text-sm font-mono text-body">
          {formatNumber(summaryStats.total_events)}
        </div>
      </div>
      <div
        class="bg-surface border border-border rounded p-4"
        title="Number of agent events that touched a file. The agent_events stream doesn't capture line counts directly, so this is the honest 'how much file activity' signal."
      >
        <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">File events</div>
        <div class="text-sm font-mono text-body">
          {formatNumber(summaryStats.total_lines)}
        </div>
      </div>
      <div class="bg-surface border border-border rounded p-4">
        <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
          Files Modified
        </div>
        <div class="text-sm font-mono text-body">
          {formatNumber(summaryStats.total_files)}
        </div>
      </div>
      <div
        class="bg-surface border border-border rounded p-4"
        title="Sum of each agent's active span (last activity minus first seen). This is wall-clock reach, not compute time spent."
      >
        <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Total Span</div>
        <div class="text-sm font-mono text-body">
          {formatDuration(summaryStats.total_duration)}
        </div>
      </div>
    </div>
  {/if}

  <!-- Controls -->
  <div class="bg-surface border border-border rounded-lg p-5 mb-6">
    <div class="flex flex-wrap gap-3 mb-3">
      <input
        type="text"
        placeholder="Search agents..."
        bind:value={searchQuery}
        class="flex-1 min-w-[200px] px-3 py-2 bg-canvas border border-border rounded text-sm text-body placeholder:text-muted focus:outline-none focus:border-accent font-mono"
      />

      <RefreshButton onClick={loadStats} {loading} />

      <ToolbarButton onClick={exportCSV}>CSV</ToolbarButton>
      <ToolbarButton onClick={exportJSON}>JSON</ToolbarButton>
    </div>

    <div class="flex items-center gap-4 text-sm font-mono">
      <span
        class="text-muted"
        class:text-warning={showNewEventAnimation}
        class:font-bold={showNewEventAnimation}
      >
        {#if showNewEventAnimation}
          New Event!
        {:else}
          Updated {timeAgo}
        {/if}
      </span>
    </div>
  </div>

  {#if loading}
    <LoadingState message="Loading agent statistics..." />
  {:else if agentStats.length === 0}
    <EmptyState
      title="No agent stats yet"
      description="This page summarises how each AI tool you use (Claude Code, Cursor, Codex, Ollama models) has been working — events, file changes, mood, and style. Run Claude Code in any tracked project and stats start accumulating within seconds; older sessions are imported from your Claude logs on Raven startup."
    />
  {:else if filteredStats.length === 0}
    <EmptyState
      title="No agents match your search"
      description="Try adjusting your search query."
    />
  {:else}
    <div class="text-sm text-muted mb-3 font-mono">
      Showing <strong class="text-accent">{filteredStats.length}</strong> of
      <strong class="text-accent">{agentStats.length}</strong> agents
    </div>

    <!-- Agent Cards with Enhanced Details -->
    <div class="space-y-4">
      {#each sortedStats as agent (agent.agent_name)}
        {@const config = getAgentConfig(agent.agent_name)}
        {@const mood = calculateMood(agent)}
        {@const style = calculateStyle(agent)}
        {@const totalChanges =
          (agent.create_count || 0) + (agent.edit_count || 0) + (agent.delete_count || 0)}
        {@const createRate = totalChanges > 0 ? (agent.create_count || 0) / totalChanges : 0}
        {@const modifyRate = totalChanges > 0 ? (agent.edit_count || 0) / totalChanges : 0}
        {@const deleteRate = totalChanges > 0 ? (agent.delete_count || 0) / totalChanges : 0}

        <div
          class="bg-surface border border-border rounded-lg p-5 hover:border-accent transition-all"
          style="border-left: 4px solid {config.color}"
        >
          <!-- Agent Header -->
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-3">
              <div>
                <div class="flex items-center gap-2">
                  <h3 class="text-sm font-bold text-heading font-mono">
                    {agent.agent_name || 'Unknown'}
                  </h3>
                  <span
                    class="px-2 py-0.5 rounded text-xs font-semibold font-mono"
                    style="background-color: {config.color}20; color: {config.color}"
                  >
                    {config.name}
                  </span>
                </div>
                <div class="flex items-center gap-3 mt-1 text-sm text-muted font-sans">
                  <span
                    title="Mood — how aggressively this agent edits. 'Aggressive' = lots of large changes; 'conservative' = small, careful ones."
                    >{mood}</span
                  >
                  <span>•</span>
                  <span
                    title="Style — what this agent mostly does. 'Builder' = adds new code; 'cleanup' = removes; 'refactorer' = restructures; 'mixed' = a bit of everything."
                    >{style}</span
                  >
                </div>
              </div>
            </div>
            <div class="text-right">
              <div class="text-sm text-muted font-sans">Last Active</div>
              <div class="text-sm font-semibold text-body font-mono">
                {formatDateTime(agent.last_active)}
              </div>
            </div>
          </div>

          <!-- Metrics Grid -->
          <div class="grid grid-cols-2 xl:grid-cols-5 gap-3 mb-4">
            <div class="bg-canvas border border-border rounded p-3">
              <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
                Events
              </div>
              <div class="text-sm font-mono text-body">
                {formatNumber(agent.total_events)}
              </div>
            </div>
            <div class="bg-canvas border border-border rounded p-3">
              <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
                File Changes
              </div>
              <div class="text-sm font-mono text-body">
                {formatNumber(agent.lines_changed)}
              </div>
            </div>
            <div class="bg-canvas border border-border rounded p-3">
              <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
                Files Modified
              </div>
              <div class="text-sm font-mono text-body">
                {formatNumber(agent.files_modified)}
              </div>
            </div>
            <div class="bg-canvas border border-border rounded p-3">
              <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
                Changes/Day
              </div>
              <div class="text-sm font-mono text-body">
                {agent.changes_per_day || 0}
              </div>
            </div>
            <div class="bg-canvas border border-border rounded p-3">
              <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
                Active over
              </div>
              <div class="text-sm font-mono text-body">
                {formatDuration(agent.total_duration_seconds)}
              </div>
            </div>
          </div>

          <!-- Chart and Distribution -->
          <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
            <!-- Activity Breakdown Chart -->
            <div class="space-y-2">
              <div class="text-xs font-semibold text-muted uppercase tracking-wide">
                Activity Breakdown
              </div>
              <div
                class="min-h-[200px] h-40 flex items-center justify-center bg-canvas rounded p-2"
              >
                <canvas id="pie-{(agent.agent_name || 'unknown').replace(/[^a-zA-Z0-9]/g, '-')}"
                ></canvas>
              </div>
              <div class="flex justify-around text-xs font-sans">
                <span class="text-success">Create: {agent.create_count || 0}</span>
                <span class="text-warning">Edit: {agent.edit_count || 0}</span>
                <span class="text-error">Delete: {agent.delete_count || 0}</span>
              </div>
            </div>

            <!-- Change Distribution Bar -->
            <div class="space-y-2">
              <div class="text-xs font-semibold text-muted uppercase tracking-wide">
                Change Distribution
              </div>
              <div class="min-h-[200px] h-40 flex flex-col justify-center">
                <div class="flex h-8 rounded overflow-hidden bg-canvas mb-2">
                  {#if createRate > 0}
                    <div
                      class="bg-success flex items-center justify-center text-canvas text-xs font-semibold"
                      style="width: {createRate * 100}%"
                      title="Created: {(createRate * 100).toFixed(0)}%"
                    >
                      {#if createRate > 0.15}
                        {(createRate * 100).toFixed(0)}%
                      {/if}
                    </div>
                  {/if}
                  {#if modifyRate > 0}
                    <div
                      class="bg-warning flex items-center justify-center text-canvas text-xs font-semibold"
                      style="width: {modifyRate * 100}%"
                      title="Modified: {(modifyRate * 100).toFixed(0)}%"
                    >
                      {#if modifyRate > 0.15}
                        {(modifyRate * 100).toFixed(0)}%
                      {/if}
                    </div>
                  {/if}
                  {#if deleteRate > 0}
                    <div
                      class="bg-error flex items-center justify-center text-canvas text-xs font-semibold"
                      style="width: {deleteRate * 100}%"
                      title="Deleted: {(deleteRate * 100).toFixed(0)}%"
                    >
                      {#if deleteRate > 0.15}
                        {(deleteRate * 100).toFixed(0)}%
                      {/if}
                    </div>
                  {/if}
                </div>
                <div class="text-xs text-muted font-sans space-y-1">
                  <div>Total Changes: {totalChanges}</div>
                  <div>Create Rate: {(createRate * 100).toFixed(1)}%</div>
                  <div>Modify Rate: {(modifyRate * 100).toFixed(1)}%</div>
                  <div>Delete Rate: {(deleteRate * 100).toFixed(1)}%</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</PageLayout>
