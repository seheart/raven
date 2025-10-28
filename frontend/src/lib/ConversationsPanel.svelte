<script>
  import { onMount, onDestroy } from 'svelte';
  import { api } from './apiClient.js';
  import { notifications } from './notificationService.js';
  import { websocketService } from './websocket.js';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import { formatTime } from './timeFormat.js';

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

  $: filteredConversations = conversations.filter(conv => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesContent = conv.content?.toLowerCase().includes(query);
      const matchesTool = conv.tool_name?.toLowerCase().includes(query);
      const matchesProject = conv.project?.toLowerCase().includes(query);
      if (!matchesContent && !matchesTool && !matchesProject) {
        return false;
      }
    }
    return true;
  });

  onMount(() => {
    loadConversations();
    setupWebSocket();
  });

  onDestroy(() => {
    // Clean up WebSocket listeners
    websocketService.off('conversation', loadConversations);
    websocketService.off('file-changed', loadConversations);
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

      <button class="btn-import" on:click={() => showImportDialog = true}>
        📥 Import
      </button>

      <button class="btn-export" on:click={exportConversations}>
        📤 Export
      </button>
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

      {#each filteredConversations as conv (conv.id)}
        <article class="conversation-item {getEventClass(conv.event_type)}" role="article" aria-labelledby="conv-type-{conv.id}">
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
              <div class="conv-preview">
                {#if conv.content}
                  {truncateContent(conv.content)}
                {:else if conv.tool_name}
                  Tool: {conv.tool_name}
                {:else if conv.tool_output}
                  {truncateContent(conv.tool_output)}
                {/if}
              </div>
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
                  <div class="detail-label">Content:</div>
                  <pre class="detail-content">{conv.content}</pre>
                </div>
              {/if}

              {#if conv.tool_input}
                <div class="detail-section">
                  <div class="detail-label">Tool Input:</div>
                  <pre class="detail-content">{formatToolInput(conv.tool_input)}</pre>
                </div>
              {/if}

              {#if conv.tool_output}
                <div class="detail-section">
                  <div class="detail-label">Tool Output:</div>
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
    <div class="modal-content" on:click|stopPropagation role="document">
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
    padding: 24px;
    max-width: 1400px;
    margin: 0 auto;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
  }

  .stat-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .stat-icon {
    font-size: 32px;
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
    font-size: 24px;
    font-weight: 600;
    color: var(--accent);
    font-family: var(--mono);
  }

  .controls {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 24px;
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
    border-radius: 6px;
    color: var(--text);
    font-family: var(--mono);
    font-size: 14px;
  }

  .filter-select {
    padding: 8px 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    font-family: var(--mono);
    font-size: 14px;
    cursor: pointer;
  }

  .auto-refresh {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
  }

  .auto-refresh input {
    cursor: pointer;
  }

  .btn-refresh, .btn-import, .btn-export {
    padding: 8px 16px;
    background: var(--accent);
    color: white;
    border: none;
    border-radius: 6px;
    font-family: var(--mono);
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-refresh:hover, .btn-import:hover, .btn-export:hover {
    filter: brightness(1.2);
  }

  .btn-refresh:disabled {
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
    gap: 16px;
  }

  .results-count {
    font-size: 14px;
    color: var(--text-muted);
    padding: 8px 0;
  }

  .conversation-item {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
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
    gap: 16px;
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
    font-size: 24px;
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
    border-radius: 12px;
    background: var(--bg);
    color: var(--text-muted);
  }

  .conv-preview {
    font-size: 14px;
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
    font-size: 16px;
    padding: 4px;
    flex-shrink: 0;
  }

  .conv-details {
    border-top: 1px solid var(--border);
    padding: 16px;
    background: var(--bg);
  }

  .detail-section {
    margin-bottom: 16px;
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
    border-radius: 6px;
    padding: 12px;
    font-family: var(--mono);
    font-size: 13px;
    line-height: 1.6;
    overflow-x: auto;
    white-space: pre-wrap;
    word-wrap: break-word;
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
    border-radius: 6px;
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
    padding: 24px;
  }

  .btn-load-more {
    padding: 12px 24px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
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
    margin-bottom: 24px;
    font-size: 16px;
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
    border-radius: 12px;
    padding: 32px;
    max-width: 600px;
    width: 90%;
    max-height: 90vh;
    overflow-y: auto;
  }

  .modal-content h2 {
    margin: 0 0 16px 0;
    color: var(--accent);
  }

  .modal-content p {
    margin: 0 0 24px 0;
    color: var(--text-muted);
  }

  .form-group {
    margin-bottom: 24px;
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
    border-radius: 6px;
    color: var(--text);
    font-family: var(--mono);
    font-size: 14px;
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
    padding: 12px 24px;
    border: none;
    border-radius: 6px;
    font-family: var(--mono);
    font-size: 14px;
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
