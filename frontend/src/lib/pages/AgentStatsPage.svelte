<script>
  import { api } from '../apiClient.js';
  /**
   * Agent Stats Page
   * Comprehensive agent statistics with search, filtering, and export
   */
  import { onMount } from 'svelte';
  import { websocketService } from '../services/websocket.js';
  import { createChart, destroyChart, createThemeObserver, getChartColors } from '../utils/chartUtils.js';
  import AgentsNav from '../components/layout/AgentsNav.svelte';

  // Agent configuration with colors and icons
  const AGENT_CONFIG = {
    'claude-code': { icon: '🤖', color: '#6366f1', name: 'Claude Code' },
    'claude': { icon: '🤖', color: '#6366f1', name: 'Claude' },
    'cursor': { icon: '↗️', color: '#10b981', name: 'Cursor' },
    'copilot': { icon: '🤝', color: '#0ea5e9', name: 'Copilot' },
    'ant': { icon: '🐜', color: '#f59e0b', name: 'ANT' },
    'aider': { icon: '🛠️', color: '#8b5cf6', name: 'Aider' },
    'chatgpt': { icon: '💬', color: '#10a37f', name: 'ChatGPT' },
    'gpt': { icon: '🧠', color: '#10a37f', name: 'GPT' },
    'manual': { icon: '👤', color: '#6b7280', name: 'Manual' },
    'default': { icon: '🔧', color: '#9ca3af', name: 'Unknown' }
  };

  let agentStats = $state([]);
  let loading = $state(true);
  let error = $state(null);
  let searchQuery = $state('');
  let sortBy = $state('total_events');
  let sortDesc = $state(true);
  let lastUpdated = $state(new Date());
  let projectFilter = $state('all');
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
    return agentStats.filter(agent =>
      (agent.agent_name || '').toLowerCase().includes(query)
    );
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
    const date = new Date(timestamp);
    return date.toLocaleString();
  }

  function formatDuration(seconds) {
    if (!seconds) return '0m';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  // Get agent config
  function getAgentConfig(agentName) {
    const lowerName = (agentName || '').toLowerCase();
    for (const [key, config] of Object.entries(AGENT_CONFIG)) {
      if (lowerName.includes(key)) return config;
    }
    return AGENT_CONFIG.default;
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

  function getMoodEmoji(mood) {
    const moods = {
      'aggressive': '🔥',
      'conservative': '🛡️',
      'balanced': '⚖️'
    };
    return moods[mood] || '❓';
  }

  function getStyleEmoji(style) {
    const styles = {
      'builder': '🏗️',
      'cleanup': '🧹',
      'refactorer': '🔧',
      'mixed': '🎨'
    };
    return styles[style] || '❓';
  }

  function handleSort(newSortBy) {
    if (sortBy === newSortBy) {
      sortDesc = !sortDesc;
    } else {
      sortBy = newSortBy;
      sortDesc = true;
    }
  }

  function exportCSV() {
    const headers = ['Agent Name', 'Total Events', 'Lines Changed', 'Files Modified', 'Duration (seconds)', 'Last Active'];
    const rows = filteredStats.map(a => [
      a.agent_name || 'Unknown',
      a.total_events || 0,
      a.lines_changed || 0,
      a.files_modified || 0,
      a.total_duration_seconds || 0,
      a.last_active || 'Never'
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

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
    a.click;
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
            datasets: [{
              data: [
                stat.create_count || 0,
                stat.edit_count || 0,
                stat.delete_count || 0
              ],
              backgroundColor: [
                colors.success,
                colors.warning,
                colors.error
              ],
              borderColor: [
                colors.success,
                colors.warning,
                colors.error
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
              },
              tooltip: {
                callbacks: {
                  label: (context) => {
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
  const handleAgentEvent = (event) => {
    // Show animation
    showNewEventAnimation = true;
    setTimeout(() => showNewEventAnimation = false, 2000);

    // Reload stats to reflect new event
    loadStats();
  };

  const handleAgentStats = (stats) => {
    // Update stats in real-time
    loadStats();
  };

  async function loadStats() {
    try {
      loading = true;
      error = null;

      // Fetch agent stats and events
      const [statsData, eventsData] = await Promise.all([
        api.get('/agent-stats').catch(() => ({ stats: [] })),
        api.get('/agent-events').catch(() => ({ events: [] }))
      ]);

      const stats = statsData.stats || [];
      const events = eventsData.events || [];

      // Calculate detailed metrics per agent
      const agentData = {};
      events.forEach(event => {
        const agentName = event.agent_name || 'Unknown';
        if (!agentData[agentName]) {
          agentData[agentName] = {
            lines_changed: 0,
            files_modified: new Set,
            last_active: event.timestamp,
            create_count: 0,
            edit_count: 0,
            delete_count: 0,
            first_seen: event.timestamp,
            total_change_size: 0,
            event_count: 0
          };
        }

        agentData[agentName].lines_changed += (event.lines_added || 0) + (event.lines_deleted || 0);
        agentData[agentName].total_change_size += (event.lines_added || 0) + (event.lines_deleted || 0);
        agentData[agentName].event_count++;

        if (event.filepath) {
          agentData[agentName].files_modified.add(event.filepath);
        }

        // Count event types
        const eventType = (event.event_type || '').toLowerCase();
        if (eventType.includes('create') || eventType.includes('add')) {
          agentData[agentName].create_count++;
        } else if (eventType.includes('delete') || eventType.includes('remove')) {
          agentData[agentName].delete_count++;
        } else if (eventType.includes('edit') || eventType.includes('modify') || eventType.includes('change')) {
          agentData[agentName].edit_count++;
        }

        // Update timestamps
        if (new Date(event.timestamp) > new Date(agentData[agentName].last_active)) {
          agentData[agentName].last_active = event.timestamp;
        }
        if (new Date(event.timestamp) < new Date(agentData[agentName].first_seen)) {
          agentData[agentName].first_seen = event.timestamp;
        }
      });

      // Merge stats with calculated data and add advanced metrics
      agentStats = stats.map(agent => {
        const data = agentData[agent.agent_name] || {};
        const daysSinceFirst = data.first_seen
          ? Math.max(1, Math.ceil((new Date - new Date(data.first_seen)) / (1000 * 60 * 60 * 24)))
          : 1;

        return {
          ...agent,
          lines_changed: data.lines_changed || 0,
          files_modified: data.files_modified?.size || 0,
          last_active: data.last_active || null,
          create_count: data.create_count || 0,
          edit_count: data.edit_count || 0,
          delete_count: data.delete_count || 0,
          // Advanced metrics
          changes_per_day: Math.round((data.event_count || 0) / daysSinceFirst),
          avg_change_size: data.event_count > 0 ? Math.round(data.total_change_size / data.event_count) : 0,
          unique_files: data.files_modified?.size || 0
        };
      });

      loading = false;
      lastUpdated = new Date();

      // Create charts after data loads
      setTimeout(createCharts, 100);
    } catch (err) {
      console.error('Failed to load agent stats:', err);
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
      setTimeout(createCharts, 100);
    });

    // Cleanup
    return () => {
      websocketService.off('agent-event', handleAgentEvent);
      websocketService.off('agent-stats', handleAgentStats);

      if (themeObserver) {
        themeObserver.disconnect();
      }

      Object.values(charts).forEach(chart => destroyChart(chart));
    };
  });
</script>

<div class="min-h-screen bg-[var(--bg)] pb-20">
  <AgentsNav />
  <div class="max-w-7xl mx-auto space-y-6 px-6">
    <!-- Header -->
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">Agent Statistics</h1>
      <p class="text-base text-[var(--muted)] font-sans">
        Comprehensive agent statistics and performance metrics
      </p>
    </div>

    {#if error}
      <div class="bg-[var(--error-subtle)] border border-[var(--error)] rounded-lg p-4 mb-6 flex justify-between items-center">
        <span class="text-base text-[var(--error)] font-sans">⚠️ Failed to load agent stats: {error}</span>
        <button onclick={loadStats} class="px-3 py-1.5 bg-[var(--error)] text-white rounded text-sm font-sans">
          Retry
        </button>
      </div>
    {/if}

    <!-- Summary Cards -->
    {#if loading}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {#each Array(5) as _, i (i)}
          <div class="h-24 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-pulse"></div>
        {/each}
      </div>
    {:else}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <div class="text-sm text-[var(--muted)] mb-1 font-sans">Total Agents</div>
          <div class="text-2xl font-bold text-[var(--accent)] font-mono">
            {formatNumber(summaryStats.total_agents)}
          </div>
        </div>
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <div class="text-sm text-[var(--muted)] mb-1 font-sans">Total Events</div>
          <div class="text-2xl font-bold text-[var(--accent)] font-mono">
            {formatNumber(summaryStats.total_events)}
          </div>
        </div>
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <div class="text-sm text-[var(--muted)] mb-1 font-sans">Lines Changed</div>
          <div class="text-2xl font-bold text-[var(--accent)] font-mono">
            {formatNumber(summaryStats.total_lines)}
          </div>
        </div>
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <div class="text-sm text-[var(--muted)] mb-1 font-sans">Files Modified</div>
          <div class="text-2xl font-bold text-[var(--accent)] font-mono">
            {formatNumber(summaryStats.total_files)}
          </div>
        </div>
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <div class="text-sm text-[var(--muted)] mb-1 font-sans">Total Duration</div>
          <div class="text-2xl font-bold text-[var(--accent)] font-mono">
            {formatDuration(summaryStats.total_duration)}
          </div>
        </div>
      </div>
    {/if}

    <!-- Controls -->
    <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 mb-6">
      <div class="flex flex-wrap gap-3 mb-3">
        <input
          type="text"
          placeholder="🔍 Search agents..."
          bind:value={searchQuery}
          class="flex-1 min-w-[200px] px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-sm text-[var(--text)] placeholder-[var(--muted)] focus:outline-none focus:border-[var(--accent)] font-mono"
        />

        <button
          class="px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-mono hover:bg-[var(--accent)] hover:text-white hover:border-[var(--accent)] transition-all disabled:opacity-50"
          onclick={loadStats}
          disabled={loading}
        >
          <span>{loading ? '⏳' : '🔄'}</span> Refresh
        </button>

        <button
          class="px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-mono hover:bg-[var(--accent)] hover:text-white hover:border-[var(--accent)] transition-all"
          onclick={exportCSV}
        >
          <span>📤</span> CSV
        </button>

        <button
          class="px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-mono hover:bg-[var(--accent)] hover:text-white hover:border-[var(--accent)] transition-all"
          onclick={exportJSON}
        >
          <span>📦</span> JSON
        </button>
      </div>

      <div class="flex items-center gap-4 text-sm font-mono">
        <span class="text-[var(--muted)]">
          Sorted by: <strong class="text-[var(--accent)]">{sortBy}</strong> ({sortDesc ? 'desc' : 'asc'})
        </span>
        <span class="text-[var(--muted)]">•</span>
        <span class="text-[var(--muted)]" class:text-[var(--warning)]={showNewEventAnimation} class:font-bold={showNewEventAnimation}>
          {#if showNewEventAnimation}
            ✨ New Event!
          {:else}
            Updated {timeAgo}
          {/if}
        </span>
      </div>
    </div>

    {#if loading}
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center">
        <div class="w-12 h-12 border-4 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin mx-auto mb-4"></div>
        <p class="text-base text-[var(--muted)] font-sans">Loading agent statistics...</p>
      </div>
    {:else if agentStats.length === 0}
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center">
        <span class="text-4xl block mb-3">🤖</span>
        <p class="text-base text-[var(--muted)] mb-2 font-sans">No agent statistics available</p>
        <p class="text-sm text-[var(--muted)] opacity-80 font-sans">
          Agent activity will appear here once detected by Raven.
        </p>
      </div>
    {:else if filteredStats.length === 0}
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center">
        <p class="text-base text-[var(--muted)] mb-2 font-sans">No agents match your search</p>
        <p class="text-sm text-[var(--muted)] opacity-80 font-sans">Try adjusting your search query.</p>
      </div>
    {:else}
      <div class="text-sm text-[var(--muted)] mb-3 font-mono">
        Showing <strong class="text-[var(--accent)]">{filteredStats.length}</strong> of
        <strong class="text-[var(--accent)]">{agentStats.length}</strong> agents
      </div>

      <!-- Agent Cards with Enhanced Details -->
      <div class="space-y-4">
        {#each sortedStats as agent (agent.agent_name)}
          {@const config = getAgentConfig(agent.agent_name)}
          {@const mood = calculateMood(agent)}
          {@const style = calculateStyle(agent)}
          {@const totalChanges = (agent.create_count || 0) + (agent.edit_count || 0) + (agent.delete_count || 0)}
          {@const createRate = totalChanges > 0 ? (agent.create_count || 0) / totalChanges : 0}
          {@const modifyRate = totalChanges > 0 ? (agent.edit_count || 0) / totalChanges : 0}
          {@const deleteRate = totalChanges > 0 ? (agent.delete_count || 0) / totalChanges : 0}

          <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 hover:border-[var(--accent)] transition-all" style="border-left: 4px solid {config.color}">
            <!-- Agent Header -->
            <div class="flex items-center justify-between mb-4">
              <div class="flex items-center gap-3">
                <div class="w-12 h-12 rounded-full flex items-center justify-center text-2xl" style="background-color: {config.color}20;">
                  {config.icon}
                </div>
                <div>
                  <div class="flex items-center gap-2">
                    <h3 class="text-lg font-bold text-[var(--text-heading)] font-mono">{agent.agent_name || 'Unknown'}</h3>
                    <span class="px-2 py-0.5 rounded text-xs font-semibold font-mono" style="background-color: {config.color}20; color: {config.color}">
                      {config.name}
                    </span>
                  </div>
                  <div class="flex items-center gap-3 mt-1 text-sm text-[var(--muted)] font-sans">
                    <span title="Mood">{getMoodEmoji(mood)} {mood}</span>
                    <span>•</span>
                    <span title="Style">{getStyleEmoji(style)} {style}</span>
                  </div>
                </div>
              </div>
              <div class="text-right">
                <div class="text-sm text-[var(--muted)] font-sans">Last Active</div>
                <div class="text-base font-semibold text-[var(--text)] font-mono">{formatDateTime(agent.last_active)}</div>
              </div>
            </div>

            <!-- Metrics Grid -->
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
              <div class="bg-[var(--bg)] rounded p-3">
                <div class="text-xs text-[var(--muted)] font-sans mb-1">Events</div>
                <div class="text-xl font-bold text-[var(--accent)] font-mono">{formatNumber(agent.total_events)}</div>
              </div>
              <div class="bg-[var(--bg)] rounded p-3">
                <div class="text-xs text-[var(--muted)] font-sans mb-1">Lines Changed</div>
                <div class="text-xl font-bold text-[var(--accent)] font-mono">{formatNumber(agent.lines_changed)}</div>
              </div>
              <div class="bg-[var(--bg)] rounded p-3">
                <div class="text-xs text-[var(--muted)] font-sans mb-1">Files Modified</div>
                <div class="text-xl font-bold text-[var(--accent)] font-mono">{formatNumber(agent.files_modified)}</div>
              </div>
              <div class="bg-[var(--bg)] rounded p-3">
                <div class="text-xs text-[var(--muted)] font-sans mb-1">Changes/Day</div>
                <div class="text-xl font-bold text-[var(--accent)] font-mono">{agent.changes_per_day || 0}</div>
              </div>
              <div class="bg-[var(--bg)] rounded p-3">
                <div class="text-xs text-[var(--muted)] font-sans mb-1">Avg Size</div>
                <div class="text-xl font-bold text-[var(--accent)] font-mono">{agent.avg_change_size || 0}</div>
              </div>
              <div class="bg-[var(--bg)] rounded p-3">
                <div class="text-xs text-[var(--muted)] font-sans mb-1">Duration</div>
                <div class="text-xl font-bold text-[var(--accent)] font-mono">{formatDuration(agent.total_duration_seconds)}</div>
              </div>
            </div>

            <!-- Chart and Distribution -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <!-- Activity Breakdown Chart -->
              <div class="space-y-2">
                <div class="text-sm text-[var(--muted)] font-sans font-semibold">Activity Breakdown</div>
                <div class="h-40 flex items-center justify-center bg-[var(--bg)] rounded p-2">
                  <canvas id="pie-{(agent.agent_name || 'unknown').replace(/[^a-zA-Z0-9]/g, '-')}"></canvas>
                </div>
                <div class="flex justify-around text-xs font-sans">
                  <span class="text-[var(--success)]">➕ Create: {agent.create_count || 0}</span>
                  <span class="text-[var(--warning)]">✏️ Edit: {agent.edit_count || 0}</span>
                  <span class="text-[var(--error)]">🗑️ Delete: {agent.delete_count || 0}</span>
                </div>
              </div>

              <!-- Change Distribution Bar -->
              <div class="space-y-2">
                <div class="text-sm text-[var(--muted)] font-sans font-semibold">Change Distribution</div>
                <div class="h-40 flex flex-col justify-center">
                  <div class="flex h-8 rounded overflow-hidden bg-[var(--bg)] mb-2">
                    {#if createRate > 0}
                      <div class="bg-[var(--success)] flex items-center justify-center text-white text-xs font-semibold" style="width: {createRate * 100}%" title="Created: {(createRate * 100).toFixed(0)}%">
                        {#if createRate > 0.15}
                          {(createRate * 100).toFixed(0)}%
                        {/if}
                      </div>
                    {/if}
                    {#if modifyRate > 0}
                      <div class="bg-[var(--warning)] flex items-center justify-center text-white text-xs font-semibold" style="width: {modifyRate * 100}%" title="Modified: {(modifyRate * 100).toFixed(0)}%">
                        {#if modifyRate > 0.15}
                          {(modifyRate * 100).toFixed(0)}%
                        {/if}
                      </div>
                    {/if}
                    {#if deleteRate > 0}
                      <div class="bg-[var(--error)] flex items-center justify-center text-white text-xs font-semibold" style="width: {deleteRate * 100}%" title="Deleted: {(deleteRate * 100).toFixed(0)}%">
                        {#if deleteRate > 0.15}
                          {(deleteRate * 100).toFixed(0)}%
                        {/if}
                      </div>
                    {/if}
                  </div>
                  <div class="text-xs text-[var(--muted)] font-sans space-y-1">
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
  </div>
</div>
