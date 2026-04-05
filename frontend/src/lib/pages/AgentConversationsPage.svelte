<script>
  import { api } from '../apiClient.js';
  /**
   * Agent Conversations Page
   * View and search agent conversations and interactions with full analytics
   */

  import { onMount } from 'svelte';
  import AgentsNav from '../components/layout/AgentsNav.svelte';
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

  // Import dialog state
  let showImportDialog = $state(false);
  let importSessionFile = $state('');
  let importProject = $state('');
  let importing = $state(false);
  let importModalElement = $state();

  // Derived values using Svelte 5 $derived
  const filteredConversations = $derived.by(() => {
    let filtered = conversations.filter(conv => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesContent = conv.content?.toLowerCase().includes(query);
        const matchesTool = conv.tool_name?.toLowerCase().includes(query);
        const matchesProject = conv.project?.toLowerCase().includes(query);
        if (!matchesContent && !matchesTool && !matchesProject) {
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
        aVal = a.project || '';
        bVal = b.project || '';
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
        key = conv.claude_session_id || 'Unknown Session';
      } else if (groupBy === 'project') {
        key = conv.project || 'Unknown Project';
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

  function formatToolInput(input) {
    if (!input) return '';
    if (typeof input === 'string') return input;
    return JSON.stringify(input, null, 2);
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
    return date.toLocaleDateString();
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

  async function importConversations() {
    if (!importSessionFile.trim()) {
      logger.warn('Please enter a session file path');
      return;
    }

    try {
      importing = true;
      const result = await api.post('/conversations/import', {
        sessionFile: importSessionFile,
        project: importProject || 'raven'
      });

      logger.info('Imported conversations', {
        total: result.imported.total,
        sessionFile: result.sessionFile
      });

      showImportDialog = false;
      importSessionFile = '';
      importProject = '';
      loadConversations();
    } catch (error) {
      logger.error('Import failed:', error);
    } finally {
      importing = false;
    }
  }

  function closeImportDialog() {
    showImportDialog = false;
  }

  function setupWebSocket() {
    // Listen for new conversation events
    websocketService.on('conversation', () => {
      if (autoRefresh) {
        loadConversations();
      }
    });

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
      // Clean up WebSocket listeners
      websocketService.off('conversation', loadConversations);

      // Disconnect theme observer
      if (themeObserver) {
        themeObserver.disconnect();
      }

      // Destroy charts
      Object.values(charts).forEach(chart => chart && destroyChart(chart));
    };
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <AgentsNav />

  <div class="max-w-6xl mx-auto">
    <!-- Header -->
    <div class="flex justify-between items-start mb-6 flex-wrap gap-4">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">Agent Conversations</h1>
        <p class="text-sm text-[var(--muted)] font-sans">
          View and search agent conversations and interactions
        </p>
      </div>
      <div class="flex items-center gap-3">
        {#if lastUpdate}
          <span class="text-xs text-[var(--muted)] font-mono"
            >{formatTime(lastUpdate.toISOString())}</span
          >
        {/if}
        <button
          onclick={loadConversations}
          disabled={loading}
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors disabled:opacity-50"
        >
          {loading ? '...' : '↻'} Refresh
        </button>
      </div>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
        <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
          Total Conversations
        </div>
        <div class="text-sm font-mono text-[var(--text)]">
          {stats.total.toLocaleString()}
        </div>
      </div>

      <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
        <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
          User Messages
        </div>
        <div class="text-sm font-mono text-[var(--text)]">
          {(stats.by_type?.user_message || 0).toLocaleString()}
        </div>
      </div>

      <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
        <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
          Assistant Responses
        </div>
        <div class="text-sm font-mono text-[var(--text)]">
          {(stats.by_type?.assistant_text || 0).toLocaleString()}
        </div>
      </div>

      <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
        <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
          Tool Calls
        </div>
        <div class="text-sm font-mono text-[var(--text)]">
          {(stats.by_type?.tool_call || 0).toLocaleString()}
        </div>
      </div>
    </div>

    <!-- Charts Section -->
    {#if showCharts && !loading && stats.total > 0}
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 mb-6">
        <div class="flex justify-between items-center mb-5">
          <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">
            Analytics
          </h3>
          <button
            class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans cursor-pointer hover:border-[var(--accent)] transition-colors"
            onclick={() => (showCharts = false)}
          >
            Hide Charts
          </button>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div class="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-5">
            <h4 class="text-xs font-semibold text-[var(--text)] mb-3">Event Type Distribution</h4>
            <div class="h-[250px] relative">
              <canvas id="chart-type-breakdown"></canvas>
            </div>
          </div>
          <div class="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-5">
            <h4 class="text-xs font-semibold text-[var(--text)] mb-3">Top 10 Projects</h4>
            <div class="h-[300px] relative">
              <canvas id="chart-project-distribution"></canvas>
            </div>
          </div>
        </div>
      </div>
    {:else if !showCharts && !loading}
      <div class="text-center p-5 mb-6">
        <button
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans cursor-pointer hover:border-[var(--accent)] transition-colors"
          onclick={() => (showCharts = true)}
        >
          Show Analytics Charts
        </button>
      </div>
    {/if}

    <!-- Controls -->
    <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 mb-6">
      <div class="flex gap-3 flex-wrap items-center">
        <input
          type="text"
          class="flex-1 min-w-[200px] px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-[var(--text)] font-mono text-sm"
          placeholder="Search conversations..."
          bind:value={searchQuery}
        />

        <select
          class="px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-[var(--text)] font-mono text-sm cursor-pointer"
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
          class="px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-[var(--text)] font-mono text-sm cursor-pointer"
          bind:value={filterProject}
          onchange={loadConversations}
        >
          <option value="all">All Projects</option>
          {#each Object.keys(stats?.by_project || {}) as project (project)}
            <option value={project}>{project} ({stats?.by_project?.[project] || 0})</option>
          {/each}
        </select>

        <label
          class="flex items-center gap-2 px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded cursor-pointer text-sm"
        >
          <input type="checkbox" class="cursor-pointer" bind:checked={autoRefresh} />
          Auto-refresh
        </label>

        <button
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors disabled:opacity-50"
          onclick={loadConversations}
          disabled={loading}
        >
          {#if loading}{:else}{/if} Refresh
        </button>

        <button
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors disabled:opacity-50"
          onclick={toggleExpandAll}
          disabled={filteredConversations.length === 0}
        >
          {#if allExpanded}{:else}{/if}
          {allExpanded ? 'Collapse All' : 'Expand All'}
        </button>

        <button
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors"
          onclick={() => (showImportDialog = true)}
          >Import
        </button>

        <button
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors"
          onclick={exportConversations}
          >Export
        </button>
      </div>

      <!-- Secondary Controls Row -->
      <div class="flex gap-3 flex-wrap items-center mt-5 pt-5 border-t border-[var(--border)]">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-xs text-[var(--muted)] font-semibold uppercase tracking-wide"
            >Date Range:</span
          >
          <button
            class="px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded text-[var(--text)] font-mono text-sm cursor-pointer hover:border-[var(--accent)] transition-colors {dateRange ===
            'all'
              ? '!bg-[var(--accent)] !text-white !border-[var(--accent)] font-semibold'
              : ''}"
            onclick={() => (dateRange = 'all')}
          >
            All Time
          </button>
          <button
            class="px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded text-[var(--text)] font-mono text-sm cursor-pointer hover:border-[var(--accent)] transition-colors {dateRange ===
            'today'
              ? '!bg-[var(--accent)] !text-white !border-[var(--accent)] font-semibold'
              : ''}"
            onclick={() => (dateRange = 'today')}
          >
            Today
          </button>
          <button
            class="px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded text-[var(--text)] font-mono text-sm cursor-pointer hover:border-[var(--accent)] transition-colors {dateRange ===
            '7d'
              ? '!bg-[var(--accent)] !text-white !border-[var(--accent)] font-semibold'
              : ''}"
            onclick={() => (dateRange = '7d')}
          >
            7 Days
          </button>
          <button
            class="px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded text-[var(--text)] font-mono text-sm cursor-pointer hover:border-[var(--accent)] transition-colors {dateRange ===
            '30d'
              ? '!bg-[var(--accent)] !text-white !border-[var(--accent)] font-semibold'
              : ''}"
            onclick={() => (dateRange = '30d')}
          >
            30 Days
          </button>
        </div>

        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-xs text-[var(--muted)] font-semibold uppercase tracking-wide"
            >Sort By:</span
          >
          <button
            class="px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded text-[var(--text)] font-mono text-sm cursor-pointer hover:border-[var(--accent)] transition-colors {sortBy ===
            'timestamp'
              ? '!bg-[var(--accent)] !text-white !border-[var(--accent)] font-semibold'
              : ''}"
            onclick={() => toggleSort('timestamp')}
          >
            Time {sortBy === 'timestamp' ? (sortOrder === 'desc' ? '↓' : '↑') : ''}
          </button>
          <button
            class="px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded text-[var(--text)] font-mono text-sm cursor-pointer hover:border-[var(--accent)] transition-colors {sortBy ===
            'type'
              ? '!bg-[var(--accent)] !text-white !border-[var(--accent)] font-semibold'
              : ''}"
            onclick={() => toggleSort('type')}
          >
            Type {sortBy === 'type' ? (sortOrder === 'desc' ? '↓' : '↑') : ''}
          </button>
          <button
            class="px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded text-[var(--text)] font-mono text-sm cursor-pointer hover:border-[var(--accent)] transition-colors {sortBy ===
            'project'
              ? '!bg-[var(--accent)] !text-white !border-[var(--accent)] font-semibold'
              : ''}"
            onclick={() => toggleSort('project')}
          >
            Project {sortBy === 'project' ? (sortOrder === 'desc' ? '↓' : '↑') : ''}
          </button>
        </div>

        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-xs text-[var(--muted)] font-semibold uppercase tracking-wide"
            >View:</span
          >
          <button
            class="px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded text-[var(--text)] font-mono text-sm cursor-pointer hover:border-[var(--accent)] transition-colors {viewMode ===
            'compact'
              ? '!bg-[var(--accent)] !text-white !border-[var(--accent)] font-semibold'
              : ''}"
            onclick={() => (viewMode = 'compact')}
          >
            Compact
          </button>
          <button
            class="px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded text-[var(--text)] font-mono text-sm cursor-pointer hover:border-[var(--accent)] transition-colors {viewMode ===
            'detailed'
              ? '!bg-[var(--accent)] !text-white !border-[var(--accent)] font-semibold'
              : ''}"
            onclick={() => (viewMode = 'detailed')}
          >
            Detailed
          </button>
        </div>

        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-xs text-[var(--muted)] font-semibold uppercase tracking-wide"
            >Group:</span
          >
          <button
            class="px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded text-[var(--text)] font-mono text-sm cursor-pointer hover:border-[var(--accent)] transition-colors {groupBy ===
            'none'
              ? '!bg-[var(--accent)] !text-white !border-[var(--accent)] font-semibold'
              : ''}"
            onclick={() => (groupBy = 'none')}
          >
            None
          </button>
          <button
            class="px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded text-[var(--text)] font-mono text-sm cursor-pointer hover:border-[var(--accent)] transition-colors {groupBy ===
            'session'
              ? '!bg-[var(--accent)] !text-white !border-[var(--accent)] font-semibold'
              : ''}"
            onclick={() => (groupBy = 'session')}
          >
            Session
          </button>
          <button
            class="px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded text-[var(--text)] font-mono text-sm cursor-pointer hover:border-[var(--accent)] transition-colors {groupBy ===
            'project'
              ? '!bg-[var(--accent)] !text-white !border-[var(--accent)] font-semibold'
              : ''}"
            onclick={() => (groupBy = 'project')}
          >
            Project
          </button>
          <button
            class="px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded text-[var(--text)] font-mono text-sm cursor-pointer hover:border-[var(--accent)] transition-colors {groupBy ===
            'date'
              ? '!bg-[var(--accent)] !text-white !border-[var(--accent)] font-semibold'
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
        <p class="m-0 text-[var(--error)] text-sm font-medium">Error: {error}</p>
        <button
          class="px-4 py-2 bg-[var(--error)] text-white border-none rounded text-sm font-semibold cursor-pointer hover:translate-y-[-1px] hover:shadow-md transition-all focus:outline-2 focus:outline-[var(--error)] focus:outline-offset-2"
          onclick={loadConversations}
          >Retry
        </button>
      </div>
    {:else if loading}
      <div class="text-center p-8">
        <div
          class="w-12 h-12 border-4 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin mx-auto mb-4"
        ></div>
        <p class="text-sm text-[var(--muted)]">Loading conversations...</p>
      </div>
    {:else if filteredConversations.length === 0}
      <div class="text-center p-12 text-[var(--muted)]">
        <p class="mb-4 text-sm">No conversations found</p>
        <button
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors"
          onclick={() => (showImportDialog = true)}
        >
          Import Claude Sessions
        </button>
      </div>
    {:else}
      <div class="flex flex-col gap-3">
        <div class="text-xs text-[var(--muted)] py-2">
          Showing {filteredConversations.length} of {stats.total} conversations
        </div>

        {#each Object.entries(groupedConversations) as [groupName, groupConvs] (groupName)}
          {#if groupBy !== 'none'}
            <div
              class="flex items-center gap-3 px-5 py-3 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg mb-3 mt-5"
            >
              <h3 class="m-0 text-sm font-semibold text-[var(--accent)]">{groupName}</h3>
              <span class="text-xs text-[var(--muted)] font-mono"
                >({groupConvs.length} conversations)</span
              >
            </div>
          {/if}

          {#each groupConvs as conv (conv.id)}
            <article
              class="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden {getEventClass(
                conv.event_type
              ) === 'user'
                ? 'border-l-4 border-l-[var(--accent)]'
                : getEventClass(conv.event_type) === 'assistant'
                  ? 'border-l-4 border-l-[var(--accent-2)]'
                  : getEventClass(conv.event_type) === 'tool-call'
                    ? 'border-l-4 border-l-[#ffa500]'
                    : getEventClass(conv.event_type) === 'tool-result'
                      ? 'border-l-4 border-l-[#00c853]'
                      : ''}"
            >
              <button
                class="flex items-center gap-3 p-5 cursor-pointer w-full bg-transparent border-none text-left font-inherit text-inherit hover:bg-[var(--bg)] focus:outline-2 focus:outline-[var(--accent)] focus:outline-offset-[-2px] transition-colors"
                onclick={() => toggleExpanded(conv.id)}
              >
                <div class="text-xs shrink-0">{getEventIcon(conv.event_type)}</div>
                <div class="flex-1 min-w-0">
                  <div class="flex gap-2 mb-2 flex-wrap">
                    <span class="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]"
                      >{conv.event_type}</span
                    >
                    {#if conv.tool_name}
                      <span class="text-xs px-2 py-0.5 rounded bg-[var(--bg)] text-[var(--muted)]"
                        >{conv.tool_name}</span
                      >
                    {/if}
                    {#if conv.project}
                      <span class="text-xs px-2 py-0.5 rounded bg-[var(--bg)] text-[var(--muted)]"
                        >{conv.project}</span
                      >
                    {/if}
                  </div>
                  {#if viewMode === 'detailed'}
                    <div
                      class="text-xs text-[var(--text)] leading-relaxed whitespace-nowrap overflow-hidden text-ellipsis"
                    >
                      {#if conv.content}
                        {truncateContent(conv.content)}
                      {:else if conv.tool_name}
                        Tool: {conv.tool_name}
                      {:else if conv.tool_output}
                        {truncateContent(conv.tool_output)}
                      {/if}
                    </div>
                  {/if}
                </div>
                <div class="text-right shrink-0">
                  <time class="text-xs text-[var(--muted)] block mb-1" datetime={conv.timestamp}
                    >{formatTime(conv.timestamp)}</time
                  >
                  <div class="text-xs text-[var(--muted)] font-mono">#{conv.id}</div>
                </div>
                <span class="text-xs text-[var(--muted)] shrink-0 p-1">
                  {expandedConversations.includes(conv.id) ? '' : ''}
                </span>
              </button>

              {#if expandedConversations.includes(conv.id)}
                <div class="border-t border-[var(--border)] p-5 bg-[var(--bg)]">
                  {#if conv.content}
                    <div class="mb-5">
                      <div class="flex justify-between items-center mb-2">
                        <div
                          class="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]"
                        >
                          Content:
                        </div>
                        <button
                          class="px-2 py-1 bg-[var(--surface)] border border-[var(--border)] rounded text-[var(--text)] font-mono text-[10px] cursor-pointer hover:bg-[var(--accent)] hover:text-white hover:border-[var(--accent)] transition-colors"
                          onclick={() => copyToClipboard(conv.content, 'Content')}
                        >
                          Copy
                        </button>
                      </div>
                      <pre
                        class="bg-[var(--surface)] border border-[var(--border)] rounded p-3 font-mono text-xs leading-relaxed overflow-x-auto whitespace-pre-wrap break-words">{conv.content}</pre>
                    </div>
                  {/if}

                  {#if conv.tool_input}
                    <div class="mb-5">
                      <div class="flex justify-between items-center mb-2">
                        <div
                          class="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]"
                        >
                          Tool Input:
                        </div>
                        <button
                          class="px-2 py-1 bg-[var(--surface)] border border-[var(--border)] rounded text-[var(--text)] font-mono text-[10px] cursor-pointer hover:bg-[var(--accent)] hover:text-white hover:border-[var(--accent)] transition-colors"
                          onclick={() =>
                            copyToClipboard(formatToolInput(conv.tool_input), 'Tool Input')}
                        >
                          Copy
                        </button>
                      </div>
                      <pre
                        class="bg-[var(--surface)] border border-[var(--border)] rounded p-3 font-mono text-xs leading-relaxed overflow-x-auto whitespace-pre-wrap break-words">{formatToolInput(
                          conv.tool_input
                        )}</pre>
                    </div>
                  {/if}

                  {#if conv.tool_output}
                    <div class="mb-5">
                      <div class="flex justify-between items-center mb-2">
                        <div
                          class="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]"
                        >
                          Tool Output:
                        </div>
                        <button
                          class="px-2 py-1 bg-[var(--surface)] border border-[var(--border)] rounded text-[var(--text)] font-mono text-[10px] cursor-pointer hover:bg-[var(--accent)] hover:text-white hover:border-[var(--accent)] transition-colors"
                          onclick={() => copyToClipboard(conv.tool_output, 'Tool Output')}
                        >
                          Copy
                        </button>
                      </div>
                      <pre
                        class="bg-[var(--surface)] border border-[var(--border)] rounded p-3 font-mono text-xs leading-relaxed overflow-x-auto whitespace-pre-wrap break-words max-h-[400px] overflow-y-auto">{conv.tool_output}</pre>
                    </div>
                  {/if}

                  <div
                    class="flex flex-col gap-2 p-3 bg-[var(--surface)] border border-[var(--border)] rounded"
                  >
                    <div class="flex gap-3 text-xs">
                      <span class="text-[var(--muted)] font-semibold min-w-[100px]"
                        >Session ID:</span
                      >
                      <span class="text-[var(--text)] font-mono break-all"
                        >{conv.claude_session_id}</span
                      >
                    </div>
                    {#if conv.parent_uuid}
                      <div class="flex gap-3 text-xs">
                        <span class="text-[var(--muted)] font-semibold min-w-[100px]"
                          >Parent UUID:</span
                        >
                        <span class="text-[var(--text)] font-mono break-all"
                          >{conv.parent_uuid}</span
                        >
                      </div>
                    {/if}
                    {#if conv.metadata}
                      <div class="flex gap-3 text-xs">
                        <span class="text-[var(--muted)] font-semibold min-w-[100px]"
                          >Metadata:</span
                        >
                        <span class="text-[var(--text)] font-mono break-all"
                          >{JSON.stringify(conv.metadata)}</span
                        >
                      </div>
                    {/if}
                  </div>
                </div>
              {/if}
            </article>
          {/each}
        {/each}

        {#if hasMore}
          <div class="flex justify-center p-4">
            <button
              class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors disabled:opacity-50"
              onclick={loadMore}
              disabled={loadingMore}
            >
              {#if loadingMore}
                <span></span>Loading...
              {:else}
                Load More
              {/if}
            </button>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<!-- Import Section (inline) -->
{#if showImportDialog}
  <div class="mt-4 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 max-w-xl">
    <div class="flex justify-between items-center mb-4">
      <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">
        Import Claude Conversations
      </h3>
      <button onclick={closeImportDialog} class="text-xs text-[var(--accent)] hover:underline"
        >Cancel</button
      >
    </div>
    <p class="text-xs text-[var(--muted)] mb-4">
      Import conversation history from Claude Code .jsonl session files.
    </p>
    <div class="space-y-3">
      <div>
        <label for="sessionFile" class="block text-sm text-[var(--muted)] mb-1"
          >Session File Path</label
        >
        <input
          id="sessionFile"
          type="text"
          bind:value={importSessionFile}
          placeholder="session-id.jsonl"
          class="w-full px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
        />
      </div>
      <div>
        <label for="importProject" class="block text-sm text-[var(--muted)] mb-1"
          >Project Name (optional)</label
        >
        <input
          id="importProject"
          type="text"
          bind:value={importProject}
          placeholder="raven"
          class="w-full px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
        />
      </div>
      <div class="flex gap-2 pt-3 border-t border-[var(--border)]">
        <button
          onclick={importConversations}
          disabled={importing}
          class="px-3 py-1.5 bg-[var(--accent)] text-white rounded text-sm font-sans hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {importing ? 'Importing...' : 'Import'}
        </button>
        <button
          onclick={closeImportDialog}
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans text-[var(--muted)] hover:border-[var(--accent)] transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
{/if}
