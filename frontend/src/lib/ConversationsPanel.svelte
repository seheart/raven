<script>
  import { onMount, onDestroy } from 'svelte';
  import { api } from './apiClient.js';
  import { notifications } from './notificationService.js';
  import { websocketService } from './websocket.js';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import { formatTime } from './timeFormat.js';
  import { Chart, registerables } from 'chart.js';
  import { settings } from './settingsStore.js';

  Chart.register(...registerables);

  let conversations = [];
  let stats = {
    total: 0,
    by_type: {},
    by_project: {}
  };
  let loading = true;
  let loadingMore = false;
  let searchQuery = '';
  let filterType = 'all';
  let filterProject = 'all';
  let expandedConversations = [];
  let limit = 50;
  let offset = 0;
  let hasMore = true;
  let lastUpdate = null;
  let autoRefresh = true;

  // New features
  let dateRange = 'all'; // 'all', 'today', '7d', '30d'
  let sortBy = 'timestamp'; // 'timestamp', 'type', 'project'
  let sortOrder = 'desc'; // 'asc', 'desc'
  let viewMode = 'detailed'; // 'compact', 'detailed'
  let groupBy = 'none'; // 'none', 'session', 'project', 'date'
  let showCharts = true;

  // Charts
  let charts = {};

  // Import dialog state
  let showImportDialog = false;
  let importSessionFile = '';
  let importProject = '';
  let importing = false;

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
    } catch (error) {
      notifications.error(`Failed to load conversations: ${error.message}`);
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
      notifications.error(`Failed to load more: ${error.message}`);
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

  $: allExpanded = expandedConversations.length === filteredConversations.length && filteredConversations.length > 0;

  function getEventIcon(eventType) {
    switch (eventType) {
    case 'user_message': return '👤';
    case 'assistant_text': return '🤖';
    case 'tool_call': return '🔧';
    case 'tool_result': return '✅';
    default: return '📝';
    }
  }

  function getEventClass(eventType) {
    switch (eventType) {
    case 'user_message': return 'user';
    case 'assistant_text': return 'assistant';
    case 'tool_call': return 'tool-call';
    case 'tool_result': return 'tool-result';
    default: return 'default';
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

      notifications.success('Conversations exported successfully');
    } catch (error) {
      notifications.error(`Export failed: ${error.message}`);
    }
  }

  async function importConversations() {
    if (!importSessionFile.trim()) {
      notifications.warning('Please enter a session file path');
      return;
    }

    try {
      importing = true;
      const result = await api.post('/conversations/import', {
        sessionFile: importSessionFile,
        project: importProject || 'raven'
      });

      notifications.success(
        `Imported ${result.imported.total} conversations from ${result.sessionFile}`,
        { duration: 5000 }
      );

      showImportDialog = false;
      importSessionFile = '';
      importProject = '';
      loadConversations();
    } catch (error) {
      notifications.error(`Import failed: ${error.message}`);
    } finally {
      importing = false;
    }
  }

  function setupWebSocket() {
    // Listen for new conversation events (WebSocket-driven, no polling!)
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

  // Sorting & Filtering Functions
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
      notifications.success(`${label} copied to clipboard`);
    } catch (error) {
      notifications.error(`Failed to copy: ${error.message}`);
    }
  }

  // Chart Functions
  function createCharts() {
    // Destroy existing charts
    Object.values(charts).forEach(chart => chart?.destroy());
    charts = {};

    if (!showCharts || filteredConversations.length === 0) return;

    // Get theme-aware colors from body element (where theme classes are applied)
    const textColor = getComputedStyle(document.body).getPropertyValue('--text').trim();
    const mutedColor = getComputedStyle(document.body).getPropertyValue('--muted').trim();
    const gridColor = 'rgba(128, 128, 128, 0.15)';

    // Type Breakdown Pie Chart
    const pieCanvas = document.getElementById('chart-type-breakdown');
    if (pieCanvas && stats.by_type) {
      const typeData = Object.entries(stats.by_type);
      if (typeData.length > 0) {
        charts.typeBreakdown = new Chart(pieCanvas, {
          type: 'doughnut',
          data: {
            labels: typeData.map(([type]) => type.replace('_', ' ')),
            datasets: [{
              data: typeData.map(([, count]) => count),
              backgroundColor: [
                'rgba(59, 130, 246, 0.8)',    // Blue
                'rgba(16, 185, 129, 0.8)',    // Green
                'rgba(255, 165, 0, 0.8)',     // Orange
                'rgba(168, 85, 247, 0.8)',    // Purple
                'rgba(239, 68, 68, 0.8)',     // Red
                'rgba(236, 72, 153, 0.8)'     // Pink
              ],
              borderColor: [
                'rgba(59, 130, 246, 1)',      // Blue
                'rgba(16, 185, 129, 1)',      // Green
                'rgba(255, 165, 0, 1)',       // Orange
                'rgba(168, 85, 247, 1)',      // Purple
                'rgba(239, 68, 68, 1)',       // Red
                'rgba(236, 72, 153, 1)'       // Pink
              ],
              borderWidth: 2
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'bottom',
                labels: {
                  color: textColor,
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
    const barCanvas = document.getElementById('chart-project-distribution');
    if (barCanvas && stats.by_project) {
      const projectData = Object.entries(stats.by_project).slice(0, 10);
      if (projectData.length > 0) {
        charts.projectDistribution = new Chart(barCanvas, {
          type: 'bar',
          data: {
            labels: projectData.map(([project]) => project),
            datasets: [{
              label: 'Conversations',
              data: projectData.map(([, count]) => count),
              backgroundColor: 'rgba(59, 130, 246, 0.8)',
              borderColor: 'rgba(59, 130, 246, 1)',
              borderWidth: 2,
              borderRadius: 4
            }]
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
                  color: mutedColor,
                  font: {
                    size: 11,
                    family: 'monospace'
                  }
                },
                grid: {
                  color: gridColor
                }
              },
              y: {
                ticks: {
                  color: textColor,
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

  function updateCharts() {
    setTimeout(createCharts, 100);
  }

  // Watch for data changes to update charts
  $: if (showCharts && stats.by_type) {
    setTimeout(createCharts, 100);
  }

  $: filteredConversations = (() => {
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
        return sortOrder === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      } else {
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
      }
    });

    return filtered;
  })();

  // Group conversations
  $: groupedConversations = (() => {
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
  })();

  // Watch for theme changes by observing body class changes
  let themeObserver;

  onMount(() => {
    loadConversations();
    setupWebSocket();

    // Watch for theme changes on body element
    themeObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class' && showCharts) {
          console.log('[ConversationsPanel] Theme changed, recreating charts');
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
    // Clean up WebSocket listeners
    websocketService.off('conversation', loadConversations);
    websocketService.off('file-changed', loadConversations);

    // Disconnect theme observer
    if (themeObserver) {
      themeObserver.disconnect();
    }
  });
</script>

<div class="conversations-panel" role="region" aria-label="Conversations tracking">
  <!-- Stats Cards -->
  <div class="stats-grid" role="group" aria-label="Conversation statistics">
    <div class="stat-card" role="status">
      <div class="stat-icon" aria-hidden="true">💬</div>
      <div class="stat-content">
        <div class="stat-label">Total Conversations</div>
        <div class="stat-value">{stats.total.toLocaleString()}</div>
      </div>
    </div>

    <div class="stat-card" role="status">
      <div class="stat-icon" aria-hidden="true">👤</div>
      <div class="stat-content">
        <div class="stat-label">User Messages</div>
        <div class="stat-value">{(stats.by_type.user_message || 0).toLocaleString()}</div>
      </div>
    </div>

    <div class="stat-card" role="status">
      <div class="stat-icon" aria-hidden="true">🤖</div>
      <div class="stat-content">
        <div class="stat-label">Assistant Responses</div>
        <div class="stat-value">{(stats.by_type.assistant_text || 0).toLocaleString()}</div>
      </div>
    </div>

    <div class="stat-card" role="status">
      <div class="stat-icon" aria-hidden="true">🔧</div>
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
        <h3>📊 Analytics</h3>
        <button class="btn-toggle-charts" on:click={() => showCharts = false} aria-label="Hide charts">
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
      <button class="btn-show-charts" on:click={() => showCharts = true} aria-label="Show charts">
        📊 Show Analytics Charts
      </button>
    </div>
  {/if}

  <!-- Controls -->
  <div class="controls" role="search" aria-label="Search and filter conversations">
    <div class="controls-row">
      <input
        type="text"
        class="search-input"
        placeholder="🔍 Search conversations..."
        bind:value={searchQuery}
        aria-label="Search conversations"
      />

      <label for="filter-type" class="visually-hidden">Filter by event type</label>
      <select id="filter-type" class="filter-select" bind:value={filterType} on:change={loadConversations} aria-label="Filter by event type">
        <option value="all">All Types</option>
        <option value="user_message">User Messages</option>
        <option value="assistant_text">Assistant</option>
        <option value="tool_call">Tool Calls</option>
        <option value="tool_result">Tool Results</option>
      </select>

      <label for="filter-project" class="visually-hidden">Filter by project</label>
      <select id="filter-project" class="filter-select" bind:value={filterProject} on:change={loadConversations} aria-label="Filter by project">
        <option value="all">All Projects</option>
        {#each Object.keys(stats.by_project || {}) as project (project)}
          <option value={project}>{project} ({stats.by_project[project]})</option>
        {/each}
      </select>

      <label class="auto-refresh">
        <input type="checkbox" bind:checked={autoRefresh} />
        Auto-refresh
      </label>

      <button class="btn-refresh" on:click={loadConversations} disabled={loading}>
        {#if loading}⏳{:else}🔄{/if} Refresh
      </button>

      <button class="btn-expand-all" on:click={toggleExpandAll} disabled={filteredConversations.length === 0} aria-label={allExpanded ? 'Collapse all conversations' : 'Expand all conversations'}>
        {#if allExpanded}📕{:else}📖{/if} {allExpanded ? 'Collapse All' : 'Expand All'}
      </button>

      <button class="btn-import" on:click={() => showImportDialog = true}>
        📥 Import
      </button>

      <button class="btn-export" on:click={exportConversations}>
        📤 Export
      </button>
    </div>

    <!-- Secondary Controls Row -->
    <div class="controls-row secondary">
      <div class="control-group">
        <span class="control-label">Date Range:</span>
        <button
          class="filter-btn"
          class:active={dateRange === 'all'}
          on:click={() => dateRange = 'all'}
        >
          All Time
        </button>
        <button
          class="filter-btn"
          class:active={dateRange === 'today'}
          on:click={() => dateRange = 'today'}
        >
          Today
        </button>
        <button
          class="filter-btn"
          class:active={dateRange === '7d'}
          on:click={() => dateRange = '7d'}
        >
          7 Days
        </button>
        <button
          class="filter-btn"
          class:active={dateRange === '30d'}
          on:click={() => dateRange = '30d'}
        >
          30 Days
        </button>
      </div>

      <div class="control-group">
        <span class="control-label">Sort By:</span>
        <button
          class="sort-btn"
          class:active={sortBy === 'timestamp'}
          on:click={() => toggleSort('timestamp')}
        >
          Time {sortBy === 'timestamp' ? (sortOrder === 'desc' ? '↓' : '↑') : ''}
        </button>
        <button
          class="sort-btn"
          class:active={sortBy === 'type'}
          on:click={() => toggleSort('type')}
        >
          Type {sortBy === 'type' ? (sortOrder === 'desc' ? '↓' : '↑') : ''}
        </button>
        <button
          class="sort-btn"
          class:active={sortBy === 'project'}
          on:click={() => toggleSort('project')}
        >
          Project {sortBy === 'project' ? (sortOrder === 'desc' ? '↓' : '↑') : ''}
        </button>
      </div>

      <div class="control-group">
        <span class="control-label">View:</span>
        <button
          class="view-btn"
          class:active={viewMode === 'compact'}
          on:click={() => viewMode = 'compact'}
        >
          Compact
        </button>
        <button
          class="view-btn"
          class:active={viewMode === 'detailed'}
          on:click={() => viewMode = 'detailed'}
        >
          Detailed
        </button>
      </div>

      <div class="control-group">
        <span class="control-label">Group:</span>
        <button
          class="group-btn"
          class:active={groupBy === 'none'}
          on:click={() => groupBy = 'none'}
        >
          None
        </button>
        <button
          class="group-btn"
          class:active={groupBy === 'session'}
          on:click={() => groupBy = 'session'}
        >
          Session
        </button>
        <button
          class="group-btn"
          class:active={groupBy === 'project'}
          on:click={() => groupBy = 'project'}
        >
          Project
        </button>
        <button
          class="group-btn"
          class:active={groupBy === 'date'}
          on:click={() => groupBy = 'date'}
        >
          Date
        </button>
      </div>
    </div>

    {#if lastUpdate}
      <div class="last-update" role="status" aria-live="polite">
        Updated: {formatTime(lastUpdate.toISOString())}
      </div>
    {/if}
  </div>

  <!-- Conversations Timeline -->
  {#if loading}
    <div role="status" aria-live="polite" aria-busy="true"><LoadingSkeleton count={5} height="120px" /></div>
  {:else if filteredConversations.length === 0}
    <div class="empty" role="status">
      <p>No conversations found</p>
      <button class="btn-import" on:click={() => showImportDialog = true}>
        📥 Import Claude Sessions
      </button>
    </div>
  {:else}
    <div class="conversations-timeline" role="feed" aria-label="Conversations timeline">
      <div class="results-count" role="status">
        Showing {filteredConversations.length} of {stats.total} conversations
      </div>

      {#each Object.entries(groupedConversations) as [groupName, groupConvs]}
        {#if groupBy !== 'none'}
          <div class="group-header">
            <h3>{groupName}</h3>
            <span class="group-count">({groupConvs.length} conversations)</span>
          </div>
        {/if}

        {#each groupConvs as conv (conv.id)}
        <article class="conversation-item {getEventClass(conv.event_type)}" aria-labelledby="conv-type-{conv.id}">
          <button
            class="conv-header"
            on:click={() => toggleExpanded(conv.id)}
            on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggleExpanded(conv.id))}
            aria-expanded={expandedConversations.includes(conv.id)}
            aria-controls="conv-details-{conv.id}"
            aria-label="{conv.event_type} at {formatTime(conv.timestamp)}"
          >
            <div class="conv-icon" aria-hidden="true">{getEventIcon(conv.event_type)}</div>
            <div class="conv-info">
              <div class="conv-type-row">
                <span class="conv-type" id="conv-type-{conv.id}">{conv.event_type}</span>
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
              <time class="conv-time" datetime="{conv.timestamp}">{formatTime(conv.timestamp)}</time>
              <div class="conv-id">#{conv.id}</div>
            </div>
            <span class="expand-btn" aria-hidden="true">
              {expandedConversations.includes(conv.id) ? '▼' : '▶'}
            </span>
          </button>

          {#if expandedConversations.includes(conv.id)}
            <div class="conv-details" id="conv-details-{conv.id}" role="region" aria-label="Conversation details">
              {#if conv.content}
                <div class="detail-section">
                  <div class="detail-header">
                    <div class="detail-label">Content:</div>
                    <button
                      class="btn-copy-content"
                      on:click={() => copyToClipboard(conv.content, 'Content')}
                      aria-label="Copy content to clipboard"
                    >
                      📋 Copy
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
                      on:click={() => copyToClipboard(formatToolInput(conv.tool_input), 'Tool Input')}
                      aria-label="Copy tool input to clipboard"
                    >
                      📋 Copy
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
                      on:click={() => copyToClipboard(conv.tool_output, 'Tool Output')}
                      aria-label="Copy tool output to clipboard"
                    >
                      📋 Copy
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
          <button class="btn-load-more" on:click={loadMore} disabled={loadingMore} aria-label="Load more conversations">
            {#if loadingMore}
              <span aria-hidden="true">⏳</span> Loading...
            {:else}
              Load More
            {/if}
          </button>
        </div>
      {/if}
    </div>
  {/if}
</div>

<!-- Import Dialog -->
{#if showImportDialog}
  <div
    class="modal-overlay"
    on:click={() => showImportDialog = false}
    on:keydown={(e) => e.key === 'Escape' && (showImportDialog = false)}
    role="dialog"
    aria-modal="true"
    aria-labelledby="import-dialog-title"
    tabindex="-1"
  >
    <div class="modal-content" on:click|stopPropagation on:keydown={(e) => e.stopPropagation()} role="dialog" tabindex="-1" aria-modal="true">
      <h2 id="import-dialog-title">Import Claude Conversations</h2>
      <p>Import conversation history from Claude Code .jsonl session files.</p>

      <div class="form-group">
        <label for="sessionFile">Session File Path:</label>
        <input
          id="sessionFile"
          type="text"
          class="form-input"
          placeholder="c6ceb139-5c3f-4cc6-923a-2bcac56f3479.jsonl"
          bind:value={importSessionFile}
          aria-describedby="sessionFile-hint"
          aria-required="true"
        />
        <div id="sessionFile-hint" class="form-hint">
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

      <div class="modal-actions" role="group" aria-label="Dialog actions">
        <button class="btn-cancel" on:click={() => showImportDialog = false} aria-label="Cancel import">
          Cancel
        </button>
        <button class="btn-primary" on:click={importConversations} disabled={importing} aria-label="Import conversations">
          {#if importing}
            <span aria-hidden="true">⏳</span> Importing...
          {:else}
            <span aria-hidden="true">📥</span> Import
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .conversations-panel {
    padding: 8px;
    max-width: 1400px;
    margin: 0 auto;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 8px;
    margin-bottom: 8px;
  }

  .stat-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
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
    margin-bottom: 4px;
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
    border-radius: 4px;
    padding: 16px;
    margin-bottom: 8px;
  }

  .controls-row {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    align-items: center;
  }

  .search-input {
    flex: 1;
    min-width: 200px;
    padding: 8px 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--text);
    font-family: var(--mono);
    font-size: 11px;
  }

  .filter-select {
    padding: 8px 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--text);
    font-family: var(--mono);
    font-size: 11px;
    cursor: pointer;
  }

  .auto-refresh {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    cursor: pointer;
    font-size: 11px;
  }

  .auto-refresh input {
    cursor: pointer;
  }

  .btn-refresh, .btn-import, .btn-export, .btn-expand-all {
    padding: 8px 16px;
    background: var(--accent);
    color: white;
    border: none;
    border-radius: 3px;
    font-family: var(--mono);
    font-size: 11px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-refresh:hover, .btn-import:hover, .btn-export:hover, .btn-expand-all:hover {
    filter: brightness(1.2);
  }

  .btn-refresh:disabled, .btn-expand-all:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .last-update {
    margin-top: 12px;
    font-size: 12px;
    color: var(--text-muted);
  }

  .conversations-timeline {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .results-count {
    font-size: 11px;
    color: var(--text-muted);
    padding: 8px 0;
  }

  .conversation-item {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    overflow: hidden;
  }

  .conversation-item.user {
    border-left: 4px solid var(--accent);
  }

  .conversation-item.assistant {
    border-left: 4px solid var(--accent-2);
  }

  .conversation-item.tool-call {
    border-left: 4px solid #FFA500;
  }

  .conversation-item.tool-result {
    border-left: 4px solid #00C853;
  }

  .conv-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 16px;
    cursor: pointer;
    transition: background 0.2s;
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
    gap: 8px;
    margin-bottom: 8px;
    flex-wrap: wrap;
  }

  .conv-type {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--accent);
  }

  .tool-badge, .project-badge {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 3px;
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
    margin-bottom: 4px;
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
    padding: 4px;
    flex-shrink: 0;
  }

  .conv-details {
    border-top: 1px solid var(--border);
    padding: 16px;
    background: var(--bg);
  }

  .detail-section {
    margin-bottom: 6px;
  }

  .detail-label {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
    margin-bottom: 8px;
  }

  .detail-content {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 12px;
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
    gap: 8px;
    padding: 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 3px;
  }

  .meta-item {
    display: flex;
    gap: 12px;
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
    padding: 8px;
  }

  .btn-load-more {
    padding: 6px 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--text);
    font-family: var(--mono);
    cursor: pointer;
    transition: all 0.2s;
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
    padding: 64px 24px;
    color: var(--text-muted);
  }

  .empty p {
    margin-bottom: 8px;
    font-size: 11px;
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
    border-radius: 3px;
    padding: 12px;
    max-width: 600px;
    width: 90%;
    max-height: 90vh;
    overflow-y: auto;
  }

  .modal-content h2 {
    margin: 0 0 8px 0;
    color: var(--accent);
  }

  .modal-content p {
    margin: 0 0 6px 0;
    color: var(--text-muted);
  }

  .form-group {
    margin-bottom: 8px;
  }

  .form-group label {
    display: block;
    margin-bottom: 8px;
    font-weight: 600;
    color: var(--text);
  }

  .form-input {
    width: 100%;
    padding: 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--text);
    font-family: var(--mono);
    font-size: 11px;
  }

  .form-hint {
    margin-top: 8px;
    font-size: 12px;
    color: var(--text-muted);
    font-style: italic;
  }

  .modal-actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
    margin-top: 32px;
  }

  .btn-cancel, .btn-primary {
    padding: 6px 12px;
    border: none;
    border-radius: 3px;
    font-family: var(--mono);
    font-size: 11px;
    cursor: pointer;
    transition: all 0.2s;
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
    border-radius: 4px;
    padding: 16px;
    margin-bottom: 16px;
  }

  .charts-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }

  .charts-header h3 {
    margin: 0;
    font-size: 16px;
    color: var(--accent);
  }

  .btn-toggle-charts,
  .btn-show-charts {
    padding: 6px 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--text);
    font-family: var(--mono);
    font-size: 11px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-toggle-charts:hover,
  .btn-show-charts:hover {
    background: var(--accent);
    color: white;
  }

  .charts-toggle {
    text-align: center;
    padding: 16px;
    margin-bottom: 16px;
  }

  .charts-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
    gap: 16px;
  }

  .chart-card {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 16px;
  }

  .chart-card h4 {
    margin: 0 0 12px 0;
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
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
  }

  .control-group {
    display: flex;
    align-items: center;
    gap: 8px;
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
    padding: 6px 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--text);
    font-family: var(--mono);
    font-size: 11px;
    cursor: pointer;
    transition: all 0.2s;
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
    gap: 12px;
    padding: 12px 16px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 4px;
    margin-bottom: 12px;
    margin-top: 16px;
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

  /* Detail Section Enhancements */
  .detail-section {
    margin-bottom: 16px;
  }

  .detail-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .btn-copy-content {
    padding: 4px 10px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--text);
    font-family: var(--mono);
    font-size: 10px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-copy-content:hover {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }

  /* Compact View Adjustments */
  .conversation-item {
    transition: all 0.2s;
  }

  .conversation-item:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
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

  /* Accessibility */
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
  }
</style>
