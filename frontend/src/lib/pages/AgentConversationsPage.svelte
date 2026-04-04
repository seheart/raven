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
      stats = statsData;
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

  function handleImportModalKeydown(event) {
    if (event.key === 'Escape') {
      closeImportDialog();
      return;
    }

    // Focus trap
    if (event.key === 'Tab' && importModalElement) {
      const focusableElements = importModalElement.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }
  }

  function setupWebSocket() {
    // Listen for new conversation events
    websocketService.on('conversation', () => {
      if (autoRefresh) {
        loadConversations();
      }
    });

    // Listen for file changes as trigger for conversation updates
    websocketService.on('file-changed', () => {
      if (autoRefresh) {
        loadConversations();
      }
    });
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
      websocketService.off('file-changed', loadConversations);

      // Disconnect theme observer
      if (themeObserver) {
        themeObserver.disconnect();
      }

      // Destroy charts
      Object.values(charts).forEach(chart => chart && destroyChart(chart));
    };
  });
</script>

<div class="min-h-screen bg-[var(--bg)] pb-20">
  <AgentsNav />

  <div class="conversations-panel">
    <!-- Stats Cards -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon"></div>
        <div class="stat-content">
          <div class="stat-label">Total Conversations</div>
          <div class="stat-value">{stats.total.toLocaleString()}</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon"></div>
        <div class="stat-content">
          <div class="stat-label">User Messages</div>
          <div class="stat-value">{(stats.by_type.user_message || 0).toLocaleString()}</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon"></div>
        <div class="stat-content">
          <div class="stat-label">Assistant Responses</div>
          <div class="stat-value">{(stats.by_type.assistant_text || 0).toLocaleString()}</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon"></div>
        <div class="stat-content">
          <div class="stat-label">Tool Calls</div>
          <div class="stat-value">{(stats.by_type.tool_call || 0).toLocaleString()}</div>
        </div>
      </div>
    </div>

    <!-- Charts Section -->
    {#if showCharts && !loading && stats.total > 0}
      <div class="charts-section">
        <div class="charts-header">
          <h3>Analytics</h3>
          <button class="btn-toggle-charts" onclick={() => (showCharts = false)}>
            Hide Charts
          </button>
        </div>
        <div class="charts-grid">
          <div class="chart-card">
            <h4>Event Type Distribution</h4>
            <div class="chart-container">
              <canvas id="chart-type-breakdown"></canvas>
            </div>
          </div>
          <div class="chart-card">
            <h4>Top 10 Projects</h4>
            <div class="chart-container horizontal">
              <canvas id="chart-project-distribution"></canvas>
            </div>
          </div>
        </div>
      </div>
    {:else if !showCharts && !loading}
      <div class="charts-toggle">
        <button class="btn-show-charts" onclick={() => (showCharts = true)}>
          Show Analytics Charts
        </button>
      </div>
    {/if}

    <!-- Controls -->
    <div class="controls">
      <div class="controls-row">
        <input
          type="text"
          class="search-input"
          placeholder=" Search conversations..."
          bind:value={searchQuery}
        />

        <select class="filter-select" bind:value={filterType} onchange={loadConversations}>
          <option value="all">All Types</option>
          <option value="user_message">User Messages</option>
          <option value="assistant_text">Assistant</option>
          <option value="tool_call">Tool Calls</option>
          <option value="tool_result">Tool Results</option>
        </select>

        <select class="filter-select" bind:value={filterProject} onchange={loadConversations}>
          <option value="all">All Projects</option>
          {#each Object.keys(stats?.by_project || {}) as project (project)}
            <option value={project}>{project} ({stats?.by_project?.[project] || 0})</option>
          {/each}
        </select>

        <label class="auto-refresh">
          <input type="checkbox" bind:checked={autoRefresh} />
          Auto-refresh
        </label>

        <button class="btn-refresh" onclick={loadConversations} disabled={loading}>
          {#if loading}{:else}{/if} Refresh
        </button>

        <button
          class="btn-expand-all"
          onclick={toggleExpandAll}
          disabled={filteredConversations.length === 0}
        >
          {#if allExpanded}{:else}{/if}
          {allExpanded ? 'Collapse All' : 'Expand All'}
        </button>

        <button class="btn-import" onclick={() => (showImportDialog = true)}>Import </button>

        <button class="btn-export" onclick={exportConversations}>Export </button>
      </div>

      <!-- Secondary Controls Row -->
      <div class="controls-row secondary">
        <div class="control-group">
          <span class="control-label">Date Range:</span>
          <button
            class="filter-btn"
            class:active={dateRange === 'all'}
            onclick={() => (dateRange = 'all')}
          >
            All Time
          </button>
          <button
            class="filter-btn"
            class:active={dateRange === 'today'}
            onclick={() => (dateRange = 'today')}
          >
            Today
          </button>
          <button
            class="filter-btn"
            class:active={dateRange === '7d'}
            onclick={() => (dateRange = '7d')}
          >
            7 Days
          </button>
          <button
            class="filter-btn"
            class:active={dateRange === '30d'}
            onclick={() => (dateRange = '30d')}
          >
            30 Days
          </button>
        </div>

        <div class="control-group">
          <span class="control-label">Sort By:</span>
          <button
            class="sort-btn"
            class:active={sortBy === 'timestamp'}
            onclick={() => toggleSort('timestamp')}
          >
            Time {sortBy === 'timestamp' ? (sortOrder === 'desc' ? '↓' : '↑') : ''}
          </button>
          <button
            class="sort-btn"
            class:active={sortBy === 'type'}
            onclick={() => toggleSort('type')}
          >
            Type {sortBy === 'type' ? (sortOrder === 'desc' ? '↓' : '↑') : ''}
          </button>
          <button
            class="sort-btn"
            class:active={sortBy === 'project'}
            onclick={() => toggleSort('project')}
          >
            Project {sortBy === 'project' ? (sortOrder === 'desc' ? '↓' : '↑') : ''}
          </button>
        </div>

        <div class="control-group">
          <span class="control-label">View:</span>
          <button
            class="view-btn"
            class:active={viewMode === 'compact'}
            onclick={() => (viewMode = 'compact')}
          >
            Compact
          </button>
          <button
            class="view-btn"
            class:active={viewMode === 'detailed'}
            onclick={() => (viewMode = 'detailed')}
          >
            Detailed
          </button>
        </div>

        <div class="control-group">
          <span class="control-label">Group:</span>
          <button
            class="group-btn"
            class:active={groupBy === 'none'}
            onclick={() => (groupBy = 'none')}
          >
            None
          </button>
          <button
            class="group-btn"
            class:active={groupBy === 'session'}
            onclick={() => (groupBy = 'session')}
          >
            Session
          </button>
          <button
            class="group-btn"
            class:active={groupBy === 'project'}
            onclick={() => (groupBy = 'project')}
          >
            Project
          </button>
          <button
            class="group-btn"
            class:active={groupBy === 'date'}
            onclick={() => (groupBy = 'date')}
          >
            Date
          </button>
        </div>
      </div>

      {#if lastUpdate}
        <div class="last-update">
          Updated: {formatTime(lastUpdate.toISOString())}
        </div>
      {/if}
    </div>

    <!-- Conversations Timeline -->
    {#if error}
      <div class="error-state">
        <p>Error: {error}</p>
        <button class="btn-retry" onclick={loadConversations}>Retry </button>
      </div>
    {:else if loading}
      <div class="loading-state">
        <div class="spinner"></div>
        <p>Loading conversations...</p>
      </div>
    {:else if filteredConversations.length === 0}
      <div class="empty">
        <p>No conversations found</p>
        <button class="btn-import" onclick={() => (showImportDialog = true)}>
          Import Claude Sessions
        </button>
      </div>
    {:else}
      <div class="conversations-timeline">
        <div class="results-count">
          Showing {filteredConversations.length} of {stats.total} conversations
        </div>

        {#each Object.entries(groupedConversations) as [groupName, groupConvs] (groupName)}
          {#if groupBy !== 'none'}
            <div class="group-header">
              <h3>{groupName}</h3>
              <span class="group-count">({groupConvs.length} conversations)</span>
            </div>
          {/if}

          {#each groupConvs as conv (conv.id)}
            <article class="conversation-item {getEventClass(conv.event_type)}">
              <button class="conv-header" onclick={() => toggleExpanded(conv.id)}>
                <div class="conv-icon">{getEventIcon(conv.event_type)}</div>
                <div class="conv-info">
                  <div class="conv-type-row">
                    <span class="conv-type">{conv.event_type}</span>
                    {#if conv.tool_name}
                      <span class="tool-badge">{conv.tool_name}</span>
                    {/if}
                    {#if conv.project}
                      <span class="project-badge">{conv.project}</span>
                    {/if}
                  </div>
                  {#if viewMode === 'detailed'}
                    <div class="conv-preview">
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
                <div class="conv-meta">
                  <time class="conv-time" datetime={conv.timestamp}
                    >{formatTime(conv.timestamp)}</time
                  >
                  <div class="conv-id">#{conv.id}</div>
                </div>
                <span class="expand-btn">
                  {expandedConversations.includes(conv.id) ? '' : ''}
                </span>
              </button>

              {#if expandedConversations.includes(conv.id)}
                <div class="conv-details">
                  {#if conv.content}
                    <div class="detail-section">
                      <div class="detail-header">
                        <div class="detail-label">Content:</div>
                        <button
                          class="btn-copy-content"
                          onclick={() => copyToClipboard(conv.content, 'Content')}
                        >
                          Copy
                        </button>
                      </div>
                      <pre class="detail-content">{conv.content}</pre>
                    </div>
                  {/if}

                  {#if conv.tool_input}
                    <div class="detail-section">
                      <div class="detail-header">
                        <div class="detail-label">Tool Input:</div>
                        <button
                          class="btn-copy-content"
                          onclick={() =>
                            copyToClipboard(formatToolInput(conv.tool_input), 'Tool Input')}
                        >
                          Copy
                        </button>
                      </div>
                      <pre class="detail-content">{formatToolInput(conv.tool_input)}</pre>
                    </div>
                  {/if}

                  {#if conv.tool_output}
                    <div class="detail-section">
                      <div class="detail-header">
                        <div class="detail-label">Tool Output:</div>
                        <button
                          class="btn-copy-content"
                          onclick={() => copyToClipboard(conv.tool_output, 'Tool Output')}
                        >
                          Copy
                        </button>
                      </div>
                      <pre class="detail-content tool-output">{conv.tool_output}</pre>
                    </div>
                  {/if}

                  <div class="detail-metadata">
                    <div class="meta-item">
                      <span class="meta-label">Session ID:</span>
                      <span class="meta-value">{conv.claude_session_id}</span>
                    </div>
                    {#if conv.parent_uuid}
                      <div class="meta-item">
                        <span class="meta-label">Parent UUID:</span>
                        <span class="meta-value">{conv.parent_uuid}</span>
                      </div>
                    {/if}
                    {#if conv.metadata}
                      <div class="meta-item">
                        <span class="meta-label">Metadata:</span>
                        <span class="meta-value">{JSON.stringify(conv.metadata)}</span>
                      </div>
                    {/if}
                  </div>
                </div>
              {/if}
            </article>
          {/each}
        {/each}

        {#if hasMore}
          <div class="load-more">
            <button class="btn-load-more" onclick={loadMore} disabled={loadingMore}>
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

<!-- Import Dialog -->
{#if showImportDialog}
  <div
    class="modal-overlay"
    onclick={closeImportDialog}
    onkeydown={handleImportModalKeydown}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="modal-content"
      onclick={e => e.stopPropagation()}
      onkeydown={e => {
        e.stopPropagation();
        handleImportModalKeydown(e);
      }}
      bind:this={importModalElement}
      role="document"
    >
      <h2>Import Claude Conversations</h2>
      <p>Import conversation history from Claude Code .jsonl session files.</p>

      <div class="form-group">
        <label for="sessionFile">Session File Path:</label>
        <input
          id="sessionFile"
          type="text"
          class="form-input"
          placeholder="c6ceb139-5c3f-4cc6-923a-2bcac56f3479.jsonl"
          bind:value={importSessionFile}
        />
        <div class="form-hint">
          Enter filename or full path. Default location: ~/.claude/projects/-home-seth/
        </div>
      </div>

      <div class="form-group">
        <label for="importProject">Project Name (optional):</label>
        <input
          id="importProject"
          type="text"
          class="form-input"
          placeholder="raven"
          bind:value={importProject}
        />
      </div>

      <div class="modal-actions">
        <button class="btn-cancel" onclick={closeImportDialog}>Cancel </button>
        <button class="btn-primary" onclick={importConversations} disabled={importing}>
          {#if importing}
            <span></span>Importing...
          {:else}
            <span></span>Import
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .conversations-panel {
    padding: var(--space-lg);
    max-width: 1400px;
    margin: 0 auto;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: var(--space-lg);
    margin-bottom: var(--space-lg);
  }

  .stat-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-2xl);
    display: flex;
    align-items: center;
    gap: var(--space-lg);
  }

  .stat-icon {
    font-size: 11px;
  }

  .stat-content {
    flex: 1;
  }

  .stat-label {
    font-size: 12px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: var(--space-sm);
  }

  .stat-value {
    font-size: 11px;
    font-weight: 600;
    color: var(--accent);
    font-family: var(--mono);
  }

  .controls {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-2xl);
    margin-bottom: var(--space-lg);
  }

  .controls-row {
    display: flex;
    gap: var(--space-xl);
    flex-wrap: wrap;
    align-items: center;
  }

  .search-input {
    flex: 1;
    min-width: 200px;
    padding: var(--space-lg) var(--space-xl);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-family: var(--mono);
    font-size: 11px;
  }

  .filter-select {
    padding: var(--space-lg) var(--space-xl);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-family: var(--mono);
    font-size: 11px;
    cursor: pointer;
  }

  .auto-refresh {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
    padding: var(--space-lg) var(--space-xl);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: 11px;
  }

  .auto-refresh input {
    cursor: pointer;
  }

  .btn-refresh,
  .btn-import,
  .btn-export,
  .btn-expand-all {
    padding: var(--space-lg) var(--space-2xl);
    background: var(--accent);
    color: white;
    border: none;
    border-radius: var(--radius-sm);
    font-family: var(--mono);
    font-size: 11px;
    cursor: pointer;
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .btn-refresh:hover,
  .btn-import:hover,
  .btn-export:hover,
  .btn-expand-all:hover {
    filter: brightness(1.2);
  }

  .btn-refresh:disabled,
  .btn-expand-all:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .last-update {
    margin-top: var(--space-xl);
    font-size: 12px;
    color: var(--text-muted);
  }

  .conversations-timeline {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .results-count {
    font-size: 11px;
    color: var(--text-muted);
    padding: var(--space-lg) 0;
  }

  .conversation-item {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .conversation-item.user {
    border-left: 4px solid var(--accent);
  }

  .conversation-item.assistant {
    border-left: 4px solid var(--accent-2);
  }

  .conversation-item.tool-call {
    border-left: 4px solid #ffa500;
  }

  .conversation-item.tool-result {
    border-left: 4px solid #00c853;
  }

  .conv-header {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
    padding: var(--space-2xl);
    cursor: pointer;
    transition: background var(--duration-base) var(--ease-smooth);
    width: 100%;
    background: transparent;
    border: none;
    text-align: left;
    font-family: inherit;
    color: inherit;
  }

  .conv-header:hover {
    background: var(--bg);
  }

  .conv-header:focus {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .conv-icon {
    font-size: 11px;
    flex-shrink: 0;
  }

  .conv-info {
    flex: 1;
    min-width: 0;
  }

  .conv-type-row {
    display: flex;
    gap: var(--space-lg);
    margin-bottom: var(--space-lg);
    flex-wrap: wrap;
  }

  .conv-type {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--accent);
  }

  .tool-badge,
  .project-badge {
    font-size: 11px;
    padding: var(--space-xs) var(--space-lg);
    border-radius: var(--radius-sm);
    background: var(--bg);
    color: var(--text-muted);
  }

  .conv-preview {
    font-size: 11px;
    color: var(--text);
    line-height: 1.5;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .conv-meta {
    text-align: right;
    flex-shrink: 0;
  }

  .conv-time {
    font-size: 12px;
    color: var(--text-muted);
    margin-bottom: var(--space-sm);
  }

  .conv-id {
    font-size: 11px;
    color: var(--text-muted);
    font-family: var(--mono);
  }

  .expand-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 11px;
    padding: var(--space-sm);
    flex-shrink: 0;
  }

  .conv-details {
    border-top: 1px solid var(--border);
    padding: var(--space-2xl);
    background: var(--bg);
  }

  .detail-section {
    margin-bottom: var(--space-2xl);
  }

  .detail-label {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
    margin-bottom: var(--space-lg);
  }

  .detail-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-lg);
  }

  .detail-content {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--space-xl);
    font-family: var(--mono);
    font-size: 13px;
    line-height: 1.6;
    overflow-x: auto;
    white-space: pre-wrap;
    overflow-wrap: break-word;
  }

  .detail-content.tool-output {
    max-height: 400px;
    overflow-y: auto;
  }

  .detail-metadata {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    padding: var(--space-xl);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }

  .meta-item {
    display: flex;
    gap: var(--space-xl);
    font-size: 12px;
  }

  .meta-label {
    color: var(--text-muted);
    font-weight: 600;
    min-width: 100px;
  }

  .meta-value {
    color: var(--text);
    font-family: var(--mono);
    word-break: break-all;
  }

  .load-more {
    display: flex;
    justify-content: center;
    padding: var(--space-lg);
  }

  .btn-load-more {
    padding: var(--space-md) var(--space-xl);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-family: var(--mono);
    cursor: pointer;
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .btn-load-more:hover {
    background: var(--accent);
    color: white;
  }

  .btn-load-more:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .empty {
    text-align: center;
    padding: var(--space-4xl) var(--space-3xl);
    color: var(--text-muted);
  }

  .empty p {
    margin-bottom: var(--space-lg);
    font-size: 11px;
  }

  .loading-state {
    text-align: center;
    padding: var(--space-4xl) var(--space-3xl);
  }

  .spinner {
    width: 48px;
    height: 48px;
    border: 4px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto var(--space-lg);
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* Modal Styles */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
  }

  .modal-content {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--space-xl);
    max-width: 600px;
    width: 90%;
    max-height: 90vh;
    overflow-y: auto;
  }

  .modal-content h2 {
    margin: 0 0 var(--space-lg) 0;
    color: var(--accent);
  }

  .modal-content p {
    margin: 0 0 var(--space-md) 0;
    color: var(--text-muted);
  }

  .form-group {
    margin-bottom: var(--space-lg);
  }

  .form-group label {
    display: block;
    margin-bottom: var(--space-lg);
    font-weight: 600;
    color: var(--text);
  }

  .form-input {
    width: 100%;
    padding: var(--space-xl);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-family: var(--mono);
    font-size: 11px;
  }

  .form-hint {
    margin-top: var(--space-lg);
    font-size: 12px;
    color: var(--text-muted);
    font-style: italic;
  }

  .modal-actions {
    display: flex;
    gap: var(--space-xl);
    justify-content: flex-end;
    margin-top: var(--space-4xl);
  }

  .btn-cancel,
  .btn-primary {
    padding: var(--space-md) var(--space-xl);
    border: none;
    border-radius: var(--radius-sm);
    font-family: var(--mono);
    font-size: 11px;
    cursor: pointer;
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .btn-cancel {
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
  }

  .btn-cancel:hover {
    background: var(--bg);
  }

  .btn-primary {
    background: var(--accent);
    color: white;
  }

  .btn-primary:hover {
    filter: brightness(1.2);
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Charts Section */
  .charts-section {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-2xl);
    margin-bottom: var(--space-2xl);
  }

  .charts-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-2xl);
  }

  .charts-header h3 {
    margin: 0;
    font-size: var(--icon-xs);
    color: var(--accent);
  }

  .btn-toggle-charts,
  .btn-show-charts {
    padding: var(--space-md) var(--space-xl);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-family: var(--mono);
    font-size: 11px;
    cursor: pointer;
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .btn-toggle-charts:hover,
  .btn-show-charts:hover {
    background: var(--accent);
    color: white;
  }

  .charts-toggle {
    text-align: center;
    padding: var(--space-2xl);
    margin-bottom: var(--space-2xl);
  }

  .charts-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
    gap: var(--space-2xl);
  }

  .chart-card {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-2xl);
  }

  .chart-card h4 {
    margin: 0 0 var(--space-xl) 0;
    font-size: 13px;
    color: var(--text);
    font-weight: 600;
  }

  .chart-container {
    height: 250px;
    position: relative;
  }

  .chart-container.horizontal {
    height: 300px;
  }

  /* Secondary Controls */
  .controls-row.secondary {
    margin-top: var(--space-2xl);
    padding-top: var(--space-2xl);
    border-top: 1px solid var(--border);
  }

  .control-group {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
    flex-wrap: wrap;
  }

  .control-label {
    font-size: 11px;
    color: var(--text-muted);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .filter-btn,
  .sort-btn,
  .view-btn,
  .group-btn {
    padding: var(--space-md) var(--space-xl);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-family: var(--mono);
    font-size: 11px;
    cursor: pointer;
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .filter-btn:hover,
  .sort-btn:hover,
  .view-btn:hover,
  .group-btn:hover {
    background: var(--surface);
    border-color: var(--accent);
  }

  .filter-btn.active,
  .sort-btn.active,
  .view-btn.active,
  .group-btn.active {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
    font-weight: 600;
  }

  /* Group Headers */
  .group-header {
    display: flex;
    align-items: center;
    gap: var(--space-xl);
    padding: var(--space-xl) var(--space-2xl);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    margin-bottom: var(--space-xl);
    margin-top: var(--space-2xl);
  }

  .group-header h3 {
    margin: 0;
    font-size: 14px;
    color: var(--accent);
    font-weight: 600;
  }

  .group-count {
    font-size: 12px;
    color: var(--text-muted);
    font-family: var(--mono);
  }

  .btn-copy-content {
    padding: var(--space-sm) var(--space-lg);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-family: var(--mono);
    font-size: 10px;
    cursor: pointer;
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .btn-copy-content:hover {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }

  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-xl);
    padding: var(--space-4xl) var(--space-2xl);
    background: color-mix(in srgb, var(--error) 5%, transparent);
    border: 1px solid color-mix(in srgb, var(--error) 20%, transparent);
    border-radius: var(--radius);
    text-align: center;
    margin-bottom: var(--space-2xl);
  }

  .error-state p {
    margin: 0;
    color: var(--error);
    font-size: 13px;
    font-weight: 500;
  }

  .btn-retry {
    padding: var(--space-lg) var(--space-2xl);
    background: var(--error);
    color: white;
    border: none;
    border-radius: var(--radius);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .btn-retry:hover {
    background: var(--error);
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .btn-retry:focus {
    outline: 2px solid var(--error);
    outline-offset: 2px;
  }

  /* Responsive Adjustments */
  @media (max-width: 1024px) {
    .charts-grid {
      grid-template-columns: 1fr;
    }

    .control-group {
      width: 100%;
    }

    .controls-row.secondary {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
