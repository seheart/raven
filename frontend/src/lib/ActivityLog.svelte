<script>
  import { logger } from './logger.js';
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';
  import { formatDateTime } from './timeFormat.js';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import { API_CONFIG } from '../config.js';

  const API_BASE = API_CONFIG.API_BASE;

  let activities = [];
  let total = 0;
  let loading = true;
  let searchQuery = '';
  let selectedType = 'all';
  let expandedActivity = null;
  let lastUpdated = null;
  let isManualRefresh = false;

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

  // Session grouping
  let groupBySession = true; // Toggle between grouped and flat view
  let groupByTime = 'none'; // 'none', 'hour', 'day'
  let collapsedSessions = new Set(); // Track which sessions are collapsed
  let sessions = []; // Grouped session data
  let selectedSession = 'all'; // Filter by specific session

  async function loadActivities(manual = false) {
    try {
      loading = true;
      isManualRefresh = manual;

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

      // Group by session if enabled
      groupActivitiesBySession();

      lastUpdated = new Date();
      loading = false;
      isManualRefresh = false;
    } catch (error) {
      logger.error('Failed to load activity log:', error);
      loading = false;
      isManualRefresh = false;
    }
  }

  function calculateStats() {
    // Ensure activities is an array before filtering
    const safeActivities = Array.isArray(activities) ? activities : [];

    stats = {
      file: safeActivities.filter(a => a && a.category === 'file').length,
      agent: safeActivities.filter(a => a && a.category === 'agent').length,
      system: safeActivities.filter(a => a && a.category === 'system').length
    };
  }

  // Format "time ago" for last updated timestamp (reactive, no interval)
  function getTimeAgo() {
    if (!lastUpdated) return 'Just now';
    const seconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
    if (seconds < 10) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  }

  // Compute reactively when lastUpdated changes
  $: timeAgo = getTimeAgo();

  function groupActivitiesBySession() {
    if (!groupBySession) {
      sessions = [];
      return;
    }

    const sessionMap = new Map();

    activities.forEach(activity => {
      const sessionId = activity.session_id || 'no-session';

      if (!sessionMap.has(sessionId)) {
        sessionMap.set(sessionId, {
          id: sessionId,
          activities: [],
          startTime: activity.timestamp,
          endTime: activity.timestamp,
          filesCount: 0,
          agentCount: 0,
          systemCount: 0,
          totalEvents: 0
        });
      }

      const session = sessionMap.get(sessionId);
      session.activities.push(activity);
      session.totalEvents++;

      // Update time range
      if (new Date(activity.timestamp) < new Date(session.startTime)) {
        session.startTime = activity.timestamp;
      }
      if (new Date(activity.timestamp) > new Date(session.endTime)) {
        session.endTime = activity.timestamp;
      }

      // Count by category
      if (activity.category === 'file') session.filesCount++;
      if (activity.category === 'agent') session.agentCount++;
      if (activity.category === 'system') session.systemCount++;
    });

    // Convert to array and calculate durations
    sessions = Array.from(sessionMap.values()).map(session => ({
      ...session,
      duration: Math.floor((new Date(session.endTime) - new Date(session.startTime)) / 1000)
    })).sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
  }

  function toggleSession(sessionId) {
    if (collapsedSessions.has(sessionId)) {
      collapsedSessions.delete(sessionId);
    } else {
      collapsedSessions.add(sessionId);
    }
    collapsedSessions = collapsedSessions; // Trigger reactivity
  }

  function formatDuration(seconds) {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
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
    return formatDateTime(timestamp);
  }

  // WebSocket event handler for project switches
  const handleProjectSwitched = async (data) => {
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

      // Build export with session metadata
      const exportData = {
        exported_at: new Date().toISOString(),
        total_activities: data.activities.length,
        sessions: sessions.map(s => ({
          session_id: s.id,
          start_time: s.startTime,
          end_time: s.endTime,
          duration_seconds: s.duration,
          total_events: s.totalEvents,
          files_count: s.filesCount,
          agent_count: s.agentCount,
          system_count: s.systemCount
        })),
        activities: data.activities
      };

      const json = JSON.stringify(exportData, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `raven-activity-log-${Date.now()}.json`;
      a.click();

      URL.revokeObjectURL(url);
    } catch (error) {
      logger.error('Export failed:', error);
    }
  }

  // WebSocket event handler
  const handleFileChanged = () => {
    // Reload if on first page
    if (offset === 0) {
      loadActivities();
    }
  };

  // Keyboard shortcuts for filters
  function handleKeydown(event) {
    // Only handle if not typing in input field
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
      return;
    }

    switch (event.key) {
    case '1':
      setFilter('all');
      break;
    case '2':
      setFilter('file');
      break;
    case '3':
      setFilter('agent');
      break;
    case '4':
      setFilter('system');
      break;
    case 'r':
    case 'R':
      loadActivities(true);
      break;
    }
  }

  onMount(() => {
    loadActivities();

    // Listen for real-time updates (no polling!)
    websocketService.connect();
    websocketService.on('file-changed', handleFileChanged);
    websocketService.on('project-switched', handleProjectSwitched);

    // Add keyboard shortcuts
    window.addEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    // Clean up WebSocket listeners
    websocketService.off('file-changed', handleFileChanged);
    websocketService.off('project-switched', handleProjectSwitched);

    // Remove keyboard listener
    window.removeEventListener('keydown', handleKeydown);
  });
</script>

<div class="activity-log">
  <div class="log-header">
    <div class="header-title">
      <h1>📜 Activity Log</h1>
      <p class="subtitle">Complete audit trail of all Raven activity</p>
    </div>
    <div class="header-actions">
      <span class="last-updated">Updated: {timeAgo}</span>
      <button
        class="refresh-btn"
        on:click={() => loadActivities(true)}
        disabled={loading}
        title="Refresh activity log"
      >
        <span class="refresh-icon" class:spinning={isManualRefresh}>🔄</span>
        Refresh
      </button>
      <button class="btn-export" on:click={exportLog}>
        💾 Export JSON
      </button>
    </div>
  </div>

  <!-- Search and Filters -->
  <div class="controls">
    <div class="controls-row">
      <div class="search-bar">
        <input
          type="text"
          placeholder="Search activities..."
          bind:value={searchQuery}
          on:keydown={(e) => e.key === 'Enter' && search()}
        />
        <button on:click={search}>🔍 Search</button>
      </div>

      <div class="view-controls">
        <button
          class="view-toggle"
          class:active={groupBySession}
          on:click={() => { groupBySession = !groupBySession; groupActivitiesBySession(); }}
          title="Group by session"
        >
          📦 Session View
        </button>

        <select
          class="time-grouping"
          bind:value={groupByTime}
          on:change={() => groupActivitiesBySession()}
          title="Group by time"
        >
          <option value="none">📅 No Time Grouping</option>
          <option value="hour">⏰ Group by Hour</option>
          <option value="day">📆 Group by Day</option>
        </select>

        {#if groupBySession && sessions.length > 1}
          <select
            class="session-filter"
            bind:value={selectedSession}
            on:change={() => groupActivitiesBySession()}
          >
            <option value="all">All Sessions ({sessions.length})</option>
            {#each sessions as session}
              <option value={session.id}>
                {session.id.substring(0, 8)} ({session.totalEvents} events)
              </option>
            {/each}
          </select>
        {/if}
      </div>
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
      <LoadingSkeleton count={5} height="80px" />
    {:else if activities.length === 0}
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <h2>No Activities Found</h2>
        {#if selectedType !== 'all'}
          <p>No <strong>{selectedType}</strong> activities found. Try changing filters or search query.</p>
        {:else if searchQuery}
          <p>No activities match "<strong>{searchQuery}</strong>". Try a different search term.</p>
        {:else}
          <p>No activity has been logged yet. Start coding and Raven will track all changes!</p>
        {/if}
        <button class="clear-filters-btn" on:click={() => { selectedType = 'all'; searchQuery = ''; loadActivities(); }}>
          Clear Filters
        </button>
      </div>
    {:else if groupBySession && sessions.length > 0}
      <!-- Session Grouped View -->
      {#each sessions.filter(s => selectedSession === 'all' || s.id === selectedSession) as session (session.id)}
        <div class="session-group">
          <!-- Session Summary Card -->
          <div
            class="session-header"
            class:collapsed={collapsedSessions.has(session.id)}
            on:click={() => toggleSession(session.id)}
          >
            <div class="session-header-left">
              <span class="expand-arrow">{collapsedSessions.has(session.id) ? '▶' : '▼'}</span>
              <div class="session-info">
                <div class="session-title">
                  <span class="session-icon">🔖</span>
                  <span class="session-id">Session: {session.id.substring(0, 12)}</span>
                </div>
                <div class="session-stats">
                  <span class="stat">⏱️ {formatDuration(session.duration)}</span>
                  <span class="stat-separator">•</span>
                  <span class="stat">📊 {session.totalEvents} events</span>
                  <span class="stat-separator">•</span>
                  <span class="stat">📁 {session.filesCount} files</span>
                  <span class="stat-separator">•</span>
                  <span class="stat">🤖 {session.agentCount} agent</span>
                  <span class="stat-separator">•</span>
                  <span class="stat">⚙️ {session.systemCount} system</span>
                </div>
              </div>
            </div>
            <div class="session-header-right">
              <span class="session-time">{formatTimestamp(session.startTime)}</span>
            </div>
          </div>

          <!-- Session Activities (collapsible) -->
          {#if !collapsedSessions.has(session.id)}
            <div class="session-activities">
              {#each session.activities as activity (activity.id + activity.category)}
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
            </div>
          {/if}
        </div>
      {/each}
    {:else}
      <!-- Flat List View -->
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
    position: relative;
  }

  .log-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
    padding: 0 8px 24px 8px;
    border-bottom: 2px solid var(--border);
  }

  .header-title h1 {
    margin: 0 0 4px 0;
    font-size: 18px;
    color: var(--text);
  }

  .subtitle {
    margin: 0;
    font-size: 12px;
    color: var(--muted);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .last-updated {
    font-size: 12px;
    color: var(--muted);
    font-family: var(--mono);
  }

  .refresh-btn {
    padding: 10px 20px;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .refresh-btn:hover:not(:disabled) {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .refresh-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .refresh-icon {
    display: inline-block;
    font-size: 14px;
  }

  .refresh-icon.spinning {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
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

  .controls-row {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .search-bar {
    display: flex;
    gap: 12px;
    flex: 1;
  }

  .view-controls {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .view-toggle {
    padding: 10px 20px;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .view-toggle:hover {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .view-toggle.active {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }

  .time-grouping {
    padding: 10px 16px;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 12px;
    font-family: var(--mono);
    cursor: pointer;
    min-width: 180px;
  }

  .time-grouping:focus {
    outline: none;
    border-color: var(--accent);
  }

  .session-filter {
    padding: 10px 16px;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 12px;
    font-family: var(--mono);
    cursor: pointer;
    min-width: 200px;
  }

  .session-filter:focus {
    outline: none;
    border-color: var(--accent);
  }

  .search-bar input {
    flex: 1;
    padding: 10px 16px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    font-size: 12px;
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

  /* Session Grouping Styles */
  .session-group {
    margin-bottom: 16px;
    border: 2px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
    background: var(--bg);
  }

  .session-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    background: var(--surface);
    border-bottom: 2px solid var(--border);
    cursor: pointer;
    user-select: none;
    transition: all 0.2s;
  }

  .session-header:hover {
    background: var(--surface-2);
  }

  .session-header.collapsed {
    border-bottom: none;
  }

  .session-header-left {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
  }

  .session-info {
    flex: 1;
  }

  .session-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  .session-icon {
    font-size: 16px;
  }

  .session-id {
    font-size: 14px;
    font-weight: 700;
    color: var(--text);
    font-family: var(--mono);
  }

  .session-stats {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    color: var(--muted);
    font-family: var(--mono);
  }

  .session-stats .stat {
    color: var(--text);
  }

  .stat-separator {
    color: var(--border);
  }

  .session-header-right {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .session-time {
    font-size: 12px;
    color: var(--muted);
    font-family: var(--mono);
  }

  .session-activities {
    padding: 12px;
    background: var(--bg);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .timeline {
    display: flex;
    flex-direction: column;
    gap: 8px;
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
    font-size: 18px;
    margin: 0 0 12px 0;
    color: var(--text);
  }

  .empty-state p {
    margin: 0 0 24px 0;
    font-size: 14px;
    color: var(--muted);
  }

  .clear-filters-btn {
    padding: 10px 24px;
    background: var(--accent);
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    transition: all 0.2s;
  }

  .clear-filters-btn:hover {
    background: color-mix(in srgb, var(--accent) 80%, black);
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
    font-size: 13px;
    flex-shrink: 0;
  }

  .activity-info {
    flex: 1;
    min-width: 0;
  }

  .activity-description {
    font-size: 13px;
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
    font-size: 14px;
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
