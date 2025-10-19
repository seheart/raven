<script>
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';

  const API_BASE = 'http://localhost:3030/api';

  let activities = [];
  let total = 0;
  let loading = true;
  let searchQuery = '';
  let selectedType = 'all';
  let expandedActivity = null;

  // Pagination
  let limit = 100;
  let offset = 0;
  let hasMore = false;

  // Stats
  let stats = {
    file: 0,
    agent: 0,
    system: 0
  };

  async function loadActivities() {
    try {
      loading = true;
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
        type: selectedType,
        search: searchQuery
      });

      const res = await fetch(`${API_BASE}/activity-log?${params}`);
      const data = await res.json();

      if (offset === 0) {
        activities = data.activities;
      } else {
        activities = [...activities, ...data.activities];
      }

      total = data.total;
      hasMore = data.hasMore;

      // Calculate stats
      calculateStats();

      loading = false;
    } catch (error) {
      console.error('Failed to load activity log:', error);
      loading = false;
    }
  }

  function calculateStats() {
    stats = {
      file: activities.filter(a => a.category === 'file').length,
      agent: activities.filter(a => a.category === 'agent').length,
      system: activities.filter(a => a.category === 'system').length
    };
  }

  function setFilter(type) {
    selectedType = type;
    offset = 0;
    loadActivities();
  }

  function search() {
    offset = 0;
    loadActivities();
  }

  function loadMore() {
    offset += limit;
    loadActivities();
  }

  function toggleActivity(activity) {
    if (expandedActivity?.id === activity.id) {
      expandedActivity = null;
    } else {
      expandedActivity = activity;
    }
  }

  function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  // WebSocket event handler for project switches
  const handleProjectSwitched = async (data) => {
    console.log('📡 Project switched, reloading activity log:', data.project);
    offset = 0;
    await loadActivities();
  };

  function formatRelativeTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  }

  function getCategoryIcon(category) {
    switch (category) {
      case 'file': return '📁';
      case 'agent': return '🤖';
      case 'system': return '⚙️';
      default: return '📝';
    }
  }

  function getCategoryColor(category) {
    switch (category) {
      case 'file': return 'var(--info)';
      case 'agent': return 'var(--accent)';
      case 'system': return 'var(--warning)';
      default: return 'var(--muted)';
    }
  }

  async function exportLog() {
    try {
      const res = await fetch(`${API_BASE}/activity-log?limit=10000`);
      const data = await res.json();

      const json = JSON.stringify(data.activities, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `raven-activity-log-${Date.now()}.json`;
      a.click();

      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
    }
  }

  // WebSocket event handler
  const handleFileChanged = () => {
    // Reload if on first page
    if (offset === 0) {
      loadActivities();
    }
  };

  onMount(() => {
    loadActivities();

    // Listen for real-time updates
    websocketService.connect();
    websocketService.on('file-changed', handleFileChanged);
    websocketService.on('project-switched', handleProjectSwitched);
  });

  onDestroy(() => {
    // Clean up WebSocket listeners
    websocketService.off('file-changed', handleFileChanged);
    websocketService.off('project-switched', handleProjectSwitched);
  });
</script>

<div class="activity-log">
  <div class="log-header">
    <div class="header-title">
      <h1>📜 Activity Log</h1>
      <p class="subtitle">Complete audit trail of all Raven activity</p>
    </div>
    <div class="header-actions">
      <button class="btn-export" on:click={exportLog}>
        💾 Export JSON
      </button>
    </div>
  </div>

  <!-- Search and Filters -->
  <div class="controls">
    <div class="search-bar">
      <input
        type="text"
        placeholder="Search activities..."
        bind:value={searchQuery}
        on:keydown={(e) => e.key === 'Enter' && search()}
      />
      <button on:click={search}>🔍 Search</button>
    </div>

    <div class="filter-tabs">
      <button
        class="filter-tab"
        class:active={selectedType === 'all'}
        on:click={() => setFilter('all')}
      >
        All ({total})
      </button>
      <button
        class="filter-tab"
        class:active={selectedType === 'file'}
        on:click={() => setFilter('file')}
      >
        📁 Files ({stats.file})
      </button>
      <button
        class="filter-tab"
        class:active={selectedType === 'agent'}
        on:click={() => setFilter('agent')}
      >
        🤖 Agents ({stats.agent})
      </button>
      <button
        class="filter-tab"
        class:active={selectedType === 'system'}
        on:click={() => setFilter('system')}
      >
        ⚙️ System ({stats.system})
      </button>
    </div>
  </div>

  <!-- Activity Timeline -->
  <div class="timeline">
    {#if loading && activities.length === 0}
      <div class="loading-state">
        <div class="spinner"></div>
        <p>Loading activity log...</p>
      </div>
    {:else if activities.length === 0}
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <h2>No Activities Found</h2>
        <p>No activities match your current filters.</p>
      </div>
    {:else}
      {#each activities as activity (activity.id + activity.category)}
        <div class="activity-item" class:expanded={expandedActivity?.id === activity.id}>
          <div class="activity-header" on:click={() => toggleActivity(activity)}>
            <div class="activity-left">
              <span class="expand-arrow">{expandedActivity?.id === activity.id ? '▼' : '▶'}</span>
              <span class="activity-icon" style="color: {getCategoryColor(activity.category)}">
                {getCategoryIcon(activity.category)}
              </span>
              <div class="activity-info">
                <div class="activity-description">{activity.description}</div>
                <div class="activity-meta">
                  <span class="meta-item">{activity.type}</span>
                  <span class="meta-separator">•</span>
                  <span class="meta-item">{formatRelativeTime(activity.timestamp)}</span>
                  {#if activity.session_id}
                    <span class="meta-separator">•</span>
                    <span class="meta-item session-id">{activity.session_id.substring(0, 8)}</span>
                  {/if}
                </div>
              </div>
            </div>
            <div class="activity-right">
              <span class="activity-time">{formatTimestamp(activity.timestamp)}</span>
              <span class="activity-category">{activity.category}</span>
            </div>
          </div>

          {#if expandedActivity?.id === activity.id}
            <div class="activity-details">
              <div class="details-grid">
                <div class="detail-item">
                  <span class="detail-label">ID:</span>
                  <span class="detail-value">{activity.id}</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">Type:</span>
                  <span class="detail-value">{activity.type}</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">Category:</span>
                  <span class="detail-value">{activity.category}</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">Timestamp:</span>
                  <span class="detail-value">{activity.timestamp}</span>
                </div>
                {#if activity.target}
                  <div class="detail-item">
                    <span class="detail-label">Target:</span>
                    <span class="detail-value">{activity.target}</span>
                  </div>
                {/if}
              </div>

              {#if activity.metadata && Object.keys(activity.metadata).length > 0}
                <div class="metadata-section">
                  <h4>Metadata</h4>
                  <pre class="metadata-code">{JSON.stringify(activity.metadata, null, 2)}</pre>
                </div>
              {/if}

              {#if activity.diff}
                <div class="diff-section">
                  <h4>Diff</h4>
                  <pre class="diff-code">{activity.diff.substring(0, 500)}{activity.diff.length > 500 ? '...' : ''}</pre>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/each}

      {#if hasMore}
        <div class="load-more">
          <button on:click={loadMore} disabled={loading}>
            {loading ? 'Loading...' : `Load More (${total - activities.length} remaining)`}
          </button>
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .activity-log {
    padding: 24px;
    max-width: 1600px;
    margin: 0 auto;
  }

  .log-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 2px solid var(--border);
  }

  .header-title h1 {
    margin: 0 0 4px 0;
    font-size: 28px;
    color: var(--text);
  }

  .subtitle {
    margin: 0;
    font-size: 14px;
    color: var(--muted);
  }

  .btn-export {
    padding: 10px 20px;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    transition: all 0.2s;
  }

  .btn-export:hover {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .controls {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-bottom: 24px;
    background: var(--surface);
    padding: 20px;
    border-radius: 8px;
    border: 1px solid var(--border);
  }

  .search-bar {
    display: flex;
    gap: 12px;
  }

  .search-bar input {
    flex: 1;
    padding: 10px 16px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    font-size: 14px;
    font-family: var(--mono);
  }

  .search-bar input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .search-bar button {
    padding: 10px 20px;
    background: var(--accent);
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    transition: all 0.2s;
  }

  .search-bar button:hover {
    background: color-mix(in srgb, var(--accent) 80%, black);
  }

  .filter-tabs {
    display: flex;
    gap: 8px;
  }

  .filter-tab {
    padding: 8px 16px;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    transition: all 0.2s;
  }

  .filter-tab:hover {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .filter-tab.active {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }

  .timeline {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .loading-state {
    text-align: center;
    padding: 60px 20px;
    color: var(--muted);
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 4px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 16px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .empty-state {
    text-align: center;
    padding: 80px 20px;
    color: var(--muted);
  }

  .empty-icon {
    font-size: 64px;
    margin-bottom: 16px;
  }

  .empty-state h2 {
    font-size: 24px;
    margin: 0 0 8px 0;
    color: var(--text);
  }

  .activity-item {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
    transition: all 0.2s;
  }

  .activity-item:hover {
    border-color: var(--accent);
    box-shadow: 0 2px 8px color-mix(in srgb, var(--accent) 20%, transparent);
  }

  .activity-item.expanded {
    border-color: var(--accent);
  }

  .activity-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    cursor: pointer;
    user-select: none;
  }

  .activity-left {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
    min-width: 0;
  }

  .expand-arrow {
    font-size: 10px;
    color: var(--muted);
    width: 12px;
    flex-shrink: 0;
  }

  .activity-icon {
    font-size: 20px;
    flex-shrink: 0;
  }

  .activity-info {
    flex: 1;
    min-width: 0;
  }

  .activity-description {
    font-size: 14px;
    color: var(--text);
    font-weight: 500;
    margin-bottom: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .activity-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--muted);
  }

  .meta-item {
    font-family: var(--mono);
  }

  .meta-separator {
    color: var(--border);
  }

  .session-id {
    color: var(--accent);
    font-weight: 600;
  }

  .activity-right {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }

  .activity-time {
    font-size: 12px;
    color: var(--muted);
    font-family: var(--mono);
  }

  .activity-category {
    padding: 4px 10px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    color: var(--muted);
  }

  .activity-details {
    padding: 0 20px 20px 20px;
    border-top: 1px solid var(--border);
  }

  .details-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 12px;
    padding: 16px 0;
  }

  .detail-item {
    display: flex;
    gap: 8px;
  }

  .detail-label {
    font-size: 11px;
    color: var(--muted);
    font-weight: 600;
    text-transform: uppercase;
  }

  .detail-value {
    font-size: 12px;
    color: var(--text);
    font-family: var(--mono);
  }

  .metadata-section,
  .diff-section {
    margin-top: 16px;
  }

  .metadata-section h4,
  .diff-section h4 {
    margin: 0 0 8px 0;
    font-size: 12px;
    color: var(--muted);
    text-transform: uppercase;
  }

  .metadata-code,
  .diff-code {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 12px;
    font-size: 11px;
    font-family: var(--mono);
    color: var(--text);
    overflow-x: auto;
    margin: 0;
    max-height: 300px;
    overflow-y: auto;
  }

  .load-more {
    text-align: center;
    padding: 20px;
  }

  .load-more button {
    padding: 12px 32px;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    transition: all 0.2s;
  }

  .load-more button:hover:not(:disabled) {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .load-more button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @media (max-width: 768px) {
    .activity-log {
      padding: 16px;
    }

    .activity-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
    }

    .activity-right {
      width: 100%;
      justify-content: space-between;
    }

    .details-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
