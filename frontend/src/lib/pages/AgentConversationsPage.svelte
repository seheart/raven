<script>
  import { createPageApi } from '../apiClient.js';
  import { PageLayout, PageHeader } from '../components/layout/index.js';
  import {
    RefreshButton,
    ToolbarButton,
    EmptyState,
    FreshnessBadge
  } from '../components/ui/index.js';
  const { api, abort: abortRequests } = createPageApi();
  import { formatDateOnly, formatDateTime } from '../timeFormat.js';
  /**
   * Agent Conversations Page
   * View and search agent conversations and interactions with full analytics
   */

  import { onMount } from 'svelte';
  import {
    createChart,
    destroyChart,
    createThemeObserver,
    getChartColors
  } from '../utils/chartUtils.js';
  import { websocketService } from '../services/websocket.js';
  import { logger } from '../logger.js';

  // State variables using Svelte 5 $state
  let conversations = $state([]);
  let stats = $state({
    total: 0,
    by_type: {},
    by_project: {}
  });
  let loading = $state(true);
  let loadingMore = $state(false);
  let error = $state(null);
  let searchQuery = $state('');
  let filterType = $state('all');
  let filterProject = $state('all');
  let expandedConversations = $state([]);
  let limit = $state(50);
  let offset = $state(0);
  let hasMore = $state(true);
  let lastUpdate = $state(null);
  let autoRefresh = $state(true);
  let conversationHandler = null;

  // New features
  let dateRange = $state('all'); // 'all', 'today', '7d', '30d'
  let sortBy = $state('timestamp'); // 'timestamp', 'type', 'project'
  let sortOrder = $state('desc'); // 'asc', 'desc'
  let viewMode = $state('detailed'); // 'compact', 'detailed'
  let groupBy = $state('none'); // 'none', 'session', 'project', 'date'
  let showCharts = $state(true);

  // Charts
  let charts = {};
  let themeObserver = null;

  // Import-conversations UI was removed; the underlying state + handlers
  // (showImportDialog, importing, _importConversations) lingered as
  // orphan scaffolding for several refactors. Cleaned out so a future
  // grep doesn't think there's a feature here.

  // Derived values using Svelte 5 $derived
  const filteredConversations = $derived.by(() => {
    let filtered = conversations.filter(conv => {
      // Search filter. Backend returns these keys verbatim from
      // /api/conversations: `message`, `project_name`, `session_id`,
      // `event_type`, `timestamp`. Earlier this code reached for `content`,
      // `tool_name`, `project`, `claude_session_id` — none of which exist
      // in the response — so search-by-anything-but-event-type silently
      // matched zero rows. Same problem in the sort + group blocks below.
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesContent = conv.message?.toLowerCase().includes(query);
        const matchesType = conv.event_type?.toLowerCase().includes(query);
        const matchesProject = conv.project_name?.toLowerCase().includes(query);
        if (!matchesContent && !matchesType && !matchesProject) {
          return false;
        }
      }

      // Date range filter
      if (dateRange !== 'all' && conv.timestamp) {
        const now = new Date();
        const convDate = new Date(conv.timestamp);
        const cutoff = new Date();

        if (dateRange === 'today') {
          cutoff.setHours(0, 0, 0, 0);
        } else if (dateRange === '7d') {
          cutoff.setDate(now.getDate() - 7);
        } else if (dateRange === '30d') {
          cutoff.setDate(now.getDate() - 30);
        }

        if (convDate < cutoff) {
          return false;
        }
      }

      return true;
    });

    // Sort
    filtered = [...filtered].sort((a, b) => {
      let aVal, bVal;

      if (sortBy === 'timestamp') {
        aVal = new Date(a.timestamp).getTime();
        bVal = new Date(b.timestamp).getTime();
      } else if (sortBy === 'type') {
        aVal = a.event_type || '';
        bVal = b.event_type || '';
      } else if (sortBy === 'project') {
        aVal = a.project_name || '';
        bVal = b.project_name || '';
      }

      if (typeof aVal === 'string') {
        return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      } else {
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
      }
    });

    return filtered;
  });

  // Group conversations
  const groupedConversations = $derived.by(() => {
    if (groupBy === 'none') {
      return { 'All Conversations': filteredConversations };
    }

    const groups = {};

    filteredConversations.forEach(conv => {
      let key;

      if (groupBy === 'session') {
        key = conv.session_id || 'Unknown Session';
      } else if (groupBy === 'project') {
        key = conv.project_name || 'Unknown Project';
      } else if (groupBy === 'date') {
        const date = new Date(conv.timestamp);
        key = date.toLocaleDateString();
      }

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(conv);
    });

    return groups;
  });

  const allExpanded = $derived(
    expandedConversations.length === filteredConversations.length &&
      filteredConversations.length > 0
  );

  // Load conversations from API
  async function loadConversations() {
    try {
      loading = true;
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: '0',
        event_type: filterType,
        project: filterProject
      });

      const [conversationsData, statsData] = await Promise.all([
        api.get(`/conversations?${params}`),
        api.get('/conversations/stats')
      ]);

      conversations = conversationsData.conversations || [];
      stats = { total: 0, by_type: {}, by_project: {}, ...statsData };
      offset = conversations.length;
      hasMore = conversations.length >= limit;
      lastUpdate = new Date();
      error = null;
    } catch (err) {
      logger.error('Failed to load conversations:', err);
      error = err.message || 'Failed to load conversations';
    } finally {
      loading = false;
    }
  }

  async function loadMore() {
    if (loadingMore || !hasMore) return;

    try {
      loadingMore = true;
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
        event_type: filterType,
        project: filterProject
      });

      const data = await api.get(`/conversations?${params}`);
      const newConversations = data.conversations || [];

      conversations = [...conversations, ...newConversations];
      offset += newConversations.length;
      hasMore = newConversations.length >= limit;
    } catch (error) {
      logger.error('Failed to load more:', error);
    } finally {
      loadingMore = false;
    }
  }

  function toggleExpanded(id) {
    if (expandedConversations.includes(id)) {
      expandedConversations = expandedConversations.filter(convId => convId !== id);
    } else {
      expandedConversations = [...expandedConversations, id];
    }
  }

  function toggleExpandAll() {
    if (expandedConversations.length === filteredConversations.length) {
      // All are expanded, collapse all
      expandedConversations = [];
    } else {
      // Expand all
      expandedConversations = filteredConversations.map(conv => conv.id);
    }
  }

  function getEventIcon(eventType) {
    switch (eventType) {
      case 'user_message':
        return '';
      case 'assistant_text':
        return '';
      case 'tool_call':
        return '';
      case 'tool_result':
        return '';
      default:
        return '';
    }
  }

  function getEventClass(eventType) {
    switch (eventType) {
      case 'user_message':
        return 'user';
      case 'assistant_text':
        return 'assistant';
      case 'tool_call':
        return 'tool-call';
      case 'tool_result':
        return 'tool-result';
      default:
        return 'default';
    }
  }

  function truncateContent(content, maxLength = 200) {
    if (!content) return '';
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  }

  function formatTime(timestamp) {
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
    return formatDateOnly(date);
  }

  async function exportConversations() {
    try {
      const exportData = {
        exported_at: new Date().toISOString(),
        stats,
        filter: { type: filterType, project: filterProject },
        conversations
      };

      const json = JSON.stringify(exportData, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `raven-conversations-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      logger.info('Conversations exported successfully');
    } catch (error) {
      logger.error('Export failed:', error);
    }
  }

  function setupWebSocket() {
    // Backend never emits a 'conversation' event — conversation rows arrive
    // as 'agent-event' WS messages with type ∈ {user_message, assistant_text,
    // tool_call, tool_result}. Filter on those to refresh the page live.
    const CONVERSATION_TYPES = new Set([
      'user_message',
      'assistant_text',
      'tool_call',
      'tool_result'
    ]);
    conversationHandler = event => {
      if (!autoRefresh) return;
      const t = event?.type || event?.event_type;
      if (t && CONVERSATION_TYPES.has(t)) loadConversations();
    };
    websocketService.on('agent-event', conversationHandler);

    // NOTE: Removed file-changed listener - it caused feedback loops
    // since Raven's own log writes trigger file-changed events
  }

  function toggleSort(field) {
    if (sortBy === field) {
      sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      sortBy = field;
      sortOrder = 'desc';
    }
  }

  async function copyToClipboard(text, label = 'Content') {
    try {
      await navigator.clipboard.writeText(text);
      logger.debug('Copied to clipboard', { label });
    } catch (error) {
      logger.error('Failed to copy to clipboard', { label, error: error.message });
    }
  }

  // Chart Functions
  function createCharts() {
    // Destroy existing charts
    Object.values(charts).forEach(chart => chart && destroyChart(chart));
    charts = {};

    if (!showCharts || filteredConversations.length === 0) return;

    // Get theme-aware colors
    const colors = getChartColors();

    // Type Breakdown Doughnut Chart
    const typeCanvas = document.getElementById('chart-type-breakdown');
    if (typeCanvas && stats.by_type) {
      const typeData = Object.entries(stats.by_type);
      if (typeData.length > 0) {
        charts.typeBreakdown = createChart('chart-type-breakdown', {
          type: 'doughnut',
          data: {
            labels: typeData.map(([type]) => type.replace('_', ' ')),
            datasets: [
              {
                data: typeData.map(([, count]) => count),
                backgroundColor: [
                  colors.primary,
                  colors.success,
                  colors.warning,
                  colors.error,
                  colors.muted,
                  colors.text
                ],
                borderColor: [
                  colors.primary,
                  colors.success,
                  colors.warning,
                  colors.error,
                  colors.muted,
                  colors.text
                ],
                borderWidth: 2
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'bottom',
                labels: {
                  color: colors.text,
                  font: {
                    size: 12,
                    family: 'monospace'
                  },
                  padding: 12
                }
              }
            }
          }
        });
      }
    }

    // Project Distribution Bar Chart
    const projectCanvas = document.getElementById('chart-project-distribution');
    if (projectCanvas && stats.by_project) {
      const projectData = Object.entries(stats.by_project).slice(0, 10);
      if (projectData.length > 0) {
        charts.projectDistribution = createChart('chart-project-distribution', {
          type: 'bar',
          data: {
            labels: projectData.map(([project]) => project),
            datasets: [
              {
                label: 'Conversations',
                data: projectData.map(([, count]) => count),
                backgroundColor: colors.primary,
                borderColor: colors.primary,
                borderWidth: 2,
                borderRadius: 4
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: {
              legend: {
                display: false
              }
            },
            scales: {
              x: {
                beginAtZero: true,
                ticks: {
                  color: colors.muted,
                  font: {
                    size: 11,
                    family: 'monospace'
                  }
                },
                grid: {
                  color: colors.border
                }
              },
              y: {
                ticks: {
                  color: colors.text,
                  font: {
                    size: 11,
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
    }
  }

  // Use $effect for lifecycle and reactivity
  $effect(() => {
    if (showCharts && stats.by_type) {
      setTimeout(createCharts, 100);
    }
  });

  onMount(async () => {
    await loadConversations();
    setupWebSocket();

    // Create charts after data loads and DOM is ready
    if (showCharts && conversations.length > 0) {
      setTimeout(createCharts, 200);
    }

    // Watch for theme changes using chartUtils helper
    themeObserver = createThemeObserver(() => {
      if (showCharts) {
        logger.debug('Theme changed, recreating charts');
        setTimeout(createCharts, 100);
      }
    });

    // Cleanup function
    return () => {
      abortRequests();
      // Clean up WebSocket listeners
      if (conversationHandler) websocketService.off('agent-event', conversationHandler);

      // Disconnect theme observer
      if (themeObserver) {
        themeObserver.disconnect();
      }

      // Destroy charts
      Object.values(charts).forEach(chart => chart && destroyChart(chart));
    };
  });
</script>

<PageLayout>
  <PageHeader
    title="Agent Conversations"
    description="The back-and-forth between you and your AI tools — your prompts, their replies, the tools they reached for. Search the history, filter by project, or export it."
  >
    {#snippet actions()}
      <div class="flex items-center gap-3">
        <FreshnessBadge mode="historical" />
        {#if lastUpdate}
          <span class="text-xs text-muted font-mono">{formatTime(lastUpdate.toISOString())}</span>
        {/if}
        <RefreshButton onClick={loadConversations} {loading} />
      </div>
    {/snippet}
  </PageHeader>

  <!-- Stats Cards -->
  <div class="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
    <div class="bg-surface border border-border rounded p-4">
      <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
        Total Conversations
      </div>
      <div class="text-sm font-mono text-body">
        {stats.total.toLocaleString()}
      </div>
    </div>

    <div class="bg-surface border border-border rounded p-4">
      <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">User Messages</div>
      <div class="text-sm font-mono text-body">
        {(stats.by_type?.user_message || 0).toLocaleString()}
      </div>
    </div>

    <div class="bg-surface border border-border rounded p-4">
      <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
        Assistant Responses
      </div>
      <div class="text-sm font-mono text-body">
        {(stats.by_type?.assistant_text || 0).toLocaleString()}
      </div>
    </div>

    <div class="bg-surface border border-border rounded p-4">
      <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Tool Calls</div>
      <div class="text-sm font-mono text-body">
        {(stats.by_type?.tool_call || 0).toLocaleString()}
      </div>
    </div>
  </div>

  <!-- Charts Section -->
  {#if !loading && stats.total > 0}
    <div class="bg-surface border border-border rounded-lg p-5 mb-6">
      <div class="flex justify-between items-center mb-5">
        <h3 class="text-xs font-semibold text-muted uppercase tracking-wide">Analytics</h3>
        <button
          class="px-3 py-1.5 bg-surface border border-border rounded text-sm font-sans cursor-pointer hover:border-accent transition-colors"
          onclick={() => (showCharts = !showCharts)}
        >
          {showCharts ? 'Hide Charts' : 'Show Charts'}
        </button>
      </div>
      {#if showCharts}
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div class="bg-canvas border border-border rounded-lg p-5">
            <h4 class="text-xs font-semibold text-body mb-3">Event Type Distribution</h4>
            <div class="min-h-[200px] h-[250px] relative">
              <canvas id="chart-type-breakdown"></canvas>
            </div>
          </div>
          <div class="bg-canvas border border-border rounded-lg p-5">
            <h4 class="text-xs font-semibold text-body mb-3">Top 10 Projects</h4>
            <div class="min-h-[200px] h-[300px] relative">
              <canvas id="chart-project-distribution"></canvas>
            </div>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Controls -->
  <div class="bg-surface border border-border rounded-lg p-5 mb-6">
    <div class="flex gap-3 flex-wrap items-center">
      <input
        type="text"
        class="flex-1 min-w-[200px] px-3 py-2 bg-canvas border border-border rounded text-body font-mono text-sm"
        placeholder="Search conversations..."
        bind:value={searchQuery}
      />

      <select
        class="px-3 py-2 bg-canvas border border-border rounded text-body font-mono text-sm cursor-pointer"
        bind:value={filterType}
        onchange={loadConversations}
      >
        <option value="all">All Types</option>
        <option value="user_message">User Messages</option>
        <option value="assistant_text">Assistant</option>
        <option value="tool_call">Tool Calls</option>
        <option value="tool_result">Tool Results</option>
      </select>

      <select
        class="px-3 py-2 bg-canvas border border-border rounded text-body font-mono text-sm cursor-pointer"
        bind:value={filterProject}
        onchange={loadConversations}
      >
        <option value="all">All Projects</option>
        {#each Object.keys(stats?.by_project || {}) as project (project)}
          <option value={project}>{project} ({stats?.by_project?.[project] || 0})</option>
        {/each}
      </select>

      <label
        class="flex items-center gap-2 px-3 py-2 bg-canvas border border-border rounded cursor-pointer text-sm"
      >
        <input type="checkbox" class="cursor-pointer" bind:checked={autoRefresh} />
        Auto-refresh
      </label>

      <ToolbarButton onClick={toggleExpandAll} disabled={filteredConversations.length === 0}>
        {allExpanded ? 'Collapse All' : 'Expand All'}
      </ToolbarButton>

      <ToolbarButton onClick={exportConversations}>Export</ToolbarButton>
    </div>

    <!-- Secondary Controls Row -->
    <div class="flex gap-3 flex-wrap items-center mt-5 pt-5 border-t border-border">
      <div class="flex items-center gap-2 flex-wrap">
        <span class="text-xs text-muted font-semibold uppercase tracking-wide">Date Range:</span>
        <button
          class="px-3 py-1.5 bg-canvas border border-border rounded text-body font-mono text-sm cursor-pointer hover:border-accent transition-colors {dateRange ===
          'all'
            ? '!bg-accent !text-white !border-accent font-semibold'
            : ''}"
          onclick={() => (dateRange = 'all')}
        >
          All Time
        </button>
        <button
          class="px-3 py-1.5 bg-canvas border border-border rounded text-body font-mono text-sm cursor-pointer hover:border-accent transition-colors {dateRange ===
          'today'
            ? '!bg-accent !text-white !border-accent font-semibold'
            : ''}"
          onclick={() => (dateRange = 'today')}
        >
          Today
        </button>
        <button
          class="px-3 py-1.5 bg-canvas border border-border rounded text-body font-mono text-sm cursor-pointer hover:border-accent transition-colors {dateRange ===
          '7d'
            ? '!bg-accent !text-white !border-accent font-semibold'
            : ''}"
          onclick={() => (dateRange = '7d')}
        >
          7 Days
        </button>
        <button
          class="px-3 py-1.5 bg-canvas border border-border rounded text-body font-mono text-sm cursor-pointer hover:border-accent transition-colors {dateRange ===
          '30d'
            ? '!bg-accent !text-white !border-accent font-semibold'
            : ''}"
          onclick={() => (dateRange = '30d')}
        >
          30 Days
        </button>
      </div>

      <div class="flex items-center gap-2 flex-wrap">
        <span class="text-xs text-muted font-semibold uppercase tracking-wide">Sort By:</span>
        <button
          class="px-3 py-1.5 bg-canvas border border-border rounded text-body font-mono text-sm cursor-pointer hover:border-accent transition-colors {sortBy ===
          'timestamp'
            ? '!bg-accent !text-white !border-accent font-semibold'
            : ''}"
          onclick={() => toggleSort('timestamp')}
        >
          Time {sortBy === 'timestamp' ? (sortOrder === 'desc' ? '↓' : '↑') : ''}
        </button>
        <button
          class="px-3 py-1.5 bg-canvas border border-border rounded text-body font-mono text-sm cursor-pointer hover:border-accent transition-colors {sortBy ===
          'type'
            ? '!bg-accent !text-white !border-accent font-semibold'
            : ''}"
          onclick={() => toggleSort('type')}
        >
          Type {sortBy === 'type' ? (sortOrder === 'desc' ? '↓' : '↑') : ''}
        </button>
        <button
          class="px-3 py-1.5 bg-canvas border border-border rounded text-body font-mono text-sm cursor-pointer hover:border-accent transition-colors {sortBy ===
          'project'
            ? '!bg-accent !text-white !border-accent font-semibold'
            : ''}"
          onclick={() => toggleSort('project')}
        >
          Project {sortBy === 'project' ? (sortOrder === 'desc' ? '↓' : '↑') : ''}
        </button>
      </div>

      <div class="flex items-center gap-2 flex-wrap">
        <span class="text-xs text-muted font-semibold uppercase tracking-wide">View:</span>
        <button
          class="px-3 py-1.5 bg-canvas border border-border rounded text-body font-mono text-sm cursor-pointer hover:border-accent transition-colors {viewMode ===
          'compact'
            ? '!bg-accent !text-white !border-accent font-semibold'
            : ''}"
          onclick={() => (viewMode = 'compact')}
        >
          Compact
        </button>
        <button
          class="px-3 py-1.5 bg-canvas border border-border rounded text-body font-mono text-sm cursor-pointer hover:border-accent transition-colors {viewMode ===
          'detailed'
            ? '!bg-accent !text-white !border-accent font-semibold'
            : ''}"
          onclick={() => (viewMode = 'detailed')}
        >
          Detailed
        </button>
      </div>

      <div class="flex items-center gap-2 flex-wrap">
        <span class="text-xs text-muted font-semibold uppercase tracking-wide">Group:</span>
        <button
          class="px-3 py-1.5 bg-canvas border border-border rounded text-body font-mono text-sm cursor-pointer hover:border-accent transition-colors {groupBy ===
          'none'
            ? '!bg-accent !text-white !border-accent font-semibold'
            : ''}"
          onclick={() => (groupBy = 'none')}
        >
          None
        </button>
        <button
          class="px-3 py-1.5 bg-canvas border border-border rounded text-body font-mono text-sm cursor-pointer hover:border-accent transition-colors {groupBy ===
          'session'
            ? '!bg-accent !text-white !border-accent font-semibold'
            : ''}"
          onclick={() => (groupBy = 'session')}
        >
          Session
        </button>
        <button
          class="px-3 py-1.5 bg-canvas border border-border rounded text-body font-mono text-sm cursor-pointer hover:border-accent transition-colors {groupBy ===
          'project'
            ? '!bg-accent !text-white !border-accent font-semibold'
            : ''}"
          onclick={() => (groupBy = 'project')}
        >
          Project
        </button>
        <button
          class="px-3 py-1.5 bg-canvas border border-border rounded text-body font-mono text-sm cursor-pointer hover:border-accent transition-colors {groupBy ===
          'date'
            ? '!bg-accent !text-white !border-accent font-semibold'
            : ''}"
          onclick={() => (groupBy = 'date')}
        >
          Date
        </button>
      </div>
    </div>
  </div>

  <!-- Conversations Timeline -->
  {#if error}
    <div
      class="flex flex-col items-center justify-center gap-4 p-8 bg-[color-mix(in_srgb,var(--error)_5%,transparent)] border border-[color-mix(in_srgb,var(--error)_20%,transparent)] rounded-lg text-center mb-6"
    >
      <p class="m-0 text-error text-sm font-medium">Error: {error}</p>
      <ToolbarButton variant="danger" onClick={loadConversations}>Retry</ToolbarButton>
    </div>
  {:else if loading}
    <div class="text-center p-8">
      <div
        class="w-12 h-12 border-4 border-border border-t-accent rounded-full animate-spin mx-auto mb-4"
      ></div>
      <p class="text-sm text-muted">Loading conversations...</p>
    </div>
  {:else if filteredConversations.length === 0}
    <EmptyState
      title={stats.total === 0 ? 'No conversations captured yet' : 'No conversations match'}
      description={stats.total === 0
        ? "Raven parses Claude Code's local session files (~/.claude/projects) and lists each conversation here with token counts, tool calls, and timing. Start a Claude Code session in any tracked project — it'll appear within a few seconds of the first message."
        : 'Try clearing your search or filters above. There are conversations in the system, just none matching the current selection.'}
    />
  {:else}
    <div class="flex flex-col gap-3">
      <div class="text-xs text-muted py-2">
        Showing {filteredConversations.length} of {stats.total} conversations
      </div>

      <div class="flex flex-col gap-3 max-h-[500px] overflow-y-auto">
        {#each Object.entries(groupedConversations) as [groupName, groupConvs] (groupName)}
          {#if groupBy !== 'none'}
            <div
              class="flex items-center gap-3 px-5 py-3 bg-surface-2 border border-border rounded-lg mb-3 mt-5"
            >
              <h3 class="m-0 text-sm font-semibold text-accent">{groupName}</h3>
              <span class="text-xs text-muted font-mono">({groupConvs.length} conversations)</span>
            </div>
          {/if}

          {#each groupConvs as conv (conv.id)}
            <article
              class="bg-surface border border-border rounded-lg overflow-hidden {getEventClass(
                conv.event_type
              ) === 'user'
                ? 'border-l-4 border-l-accent'
                : getEventClass(conv.event_type) === 'assistant'
                  ? 'border-l-4 border-l-info'
                  : getEventClass(conv.event_type) === 'tool-call'
                    ? 'border-l-4 border-l-warning'
                    : getEventClass(conv.event_type) === 'tool-result'
                      ? 'border-l-4 border-l-success'
                      : ''}"
            >
              <button
                class="flex items-center gap-3 p-5 cursor-pointer w-full bg-transparent border-none text-left font-inherit text-inherit hover:bg-canvas focus:outline-2 focus:outline-[var(--accent)] focus:outline-offset-[-2px] transition-colors"
                onclick={() => toggleExpanded(conv.id)}
              >
                <div class="text-xs shrink-0">{getEventIcon(conv.event_type)}</div>
                <div class="flex-1 min-w-0">
                  <div class="flex gap-2 mb-2 flex-wrap">
                    <span class="text-xs font-semibold uppercase tracking-wide text-accent"
                      >{conv.event_type}</span
                    >
                    {#if conv.file}
                      <span
                        class="text-xs px-2 py-0.5 rounded bg-canvas text-muted font-mono truncate max-w-[200px]"
                        >{conv.file.split('/').slice(-2).join('/')}</span
                      >
                    {/if}
                    {#if conv.project_name}
                      <span class="text-xs px-2 py-0.5 rounded bg-canvas text-muted"
                        >{conv.project_name}</span
                      >
                    {/if}
                  </div>
                  {#if viewMode === 'detailed' && conv.message}
                    <div
                      class="text-xs text-body leading-relaxed whitespace-nowrap overflow-hidden text-ellipsis"
                    >
                      {truncateContent(conv.message, 120)}
                    </div>
                  {/if}
                </div>
                <div class="text-right shrink-0">
                  <time class="text-xs text-muted block mb-1" datetime={conv.timestamp}
                    >{formatTime(conv.timestamp)}</time
                  >
                  <div class="text-xs text-muted font-mono">#{conv.id}</div>
                </div>
                <span class="text-xs text-muted shrink-0 p-1">
                  {expandedConversations.includes(conv.id) ? '' : ''}
                </span>
              </button>

              {#if expandedConversations.includes(conv.id)}
                <div class="border-t border-border p-5 bg-canvas">
                  {#if conv.message}
                    <div class="mb-4">
                      <div class="flex justify-between items-center mb-2">
                        <div class="text-xs font-semibold uppercase tracking-wide text-muted">
                          Message
                        </div>
                        <button
                          class="px-2 py-1 bg-surface border border-border rounded text-body font-mono text-xs cursor-pointer hover:border-accent transition-colors"
                          onclick={() => copyToClipboard(conv.message, 'Message')}
                        >
                          Copy
                        </button>
                      </div>
                      <pre
                        class="bg-surface border border-border rounded p-3 font-mono text-xs leading-relaxed overflow-x-auto whitespace-pre-wrap break-words max-h-[300px] overflow-y-auto">{conv.message}</pre>
                    </div>
                  {/if}

                  {#if conv.file}
                    <div class="mb-4">
                      <div class="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
                        File
                      </div>
                      <div
                        class="text-sm font-mono text-body bg-surface border border-border rounded p-3 break-all"
                      >
                        {conv.file}
                      </div>
                    </div>
                  {/if}

                  <div
                    class="flex flex-wrap gap-x-6 gap-y-2 p-3 bg-surface border border-border rounded text-xs"
                  >
                    <div>
                      <span class="text-muted">Agent</span>
                      <span class="text-body font-mono ml-2">{conv.agent || 'Unknown'}</span>
                    </div>
                    {#if conv.session_id}
                      <div>
                        <span class="text-muted">Session</span>
                        <span class="text-body font-mono ml-2"
                          >{conv.session_id.slice(0, 12)}...</span
                        >
                      </div>
                    {/if}
                    {#if conv.project_name}
                      <div>
                        <span class="text-muted">Project</span>
                        <span class="text-body font-mono ml-2">{conv.project_name}</span>
                      </div>
                    {/if}
                    <div>
                      <span class="text-muted">Timestamp</span>
                      <span class="text-body font-mono ml-2">{formatDateTime(conv.timestamp)}</span>
                    </div>
                  </div>
                </div>
              {/if}
            </article>
          {/each}
        {/each}
      </div>

      {#if hasMore}
        <div class="flex justify-center p-4">
          <ToolbarButton onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading...' : 'Load More'}
          </ToolbarButton>
        </div>
      {/if}
    </div>
  {/if}
</PageLayout>
