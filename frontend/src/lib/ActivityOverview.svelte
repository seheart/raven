<script>
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';
  import { logger } from './logger.js';

  // Activity metrics
  let totalChanges = 0;
  let filesModified = 0;
  let recentEvents = [];
  let activityByType = { create: 0, edit: 0, delete: 0 };
  let topModifiedFiles = [];
  let isPaused = false;

  let loading = true;
  let error = null;
  let lastUpdated = new Date();

  // Fetch activity data
  async function loadActivityData() {
    try {
      loading = true;
      error = null;

      // Parallel data fetching
      const [eventsData, topFiles, trackingStatus] = await Promise.all([
        fetch('/api/file-events?limit=100')
          .then(r => r.json())
          .catch(() => ({ events: [] })),
        fetch('/api/top-modified-files?limit=10')
          .then(r => r.json())
          .catch(() => ({ files: [] })),
        fetch('/api/status')
          .then(r => r.json())
          .catch(() => ({ paused: false }))
      ]);

      const events = eventsData.events || [];
      recentEvents = events.slice(0, 10);
      totalChanges = events.length;

      // Count files and activity types
      const uniqueFiles = new Set();
      const typeCount = { create: 0, edit: 0, delete: 0 };

      events.forEach(event => {
        if (event.filepath) uniqueFiles.add(event.filepath);
        if (event.change_type) {
          typeCount[event.change_type] = (typeCount[event.change_type] || 0) + 1;
        }
      });

      filesModified = uniqueFiles.size;
      activityByType = typeCount;
      topModifiedFiles = topFiles.files || [];
      isPaused = trackingStatus.paused || false;

      lastUpdated = new Date();
      loading = false;
    } catch (err) {
      logger.error('Failed to load activity data:', error);
      errorMessage = error.message;
      loading = false;
    }
  }

  // Toggle pause/resume
  async function togglePause() {
    try {
      const endpoint = isPaused ? '/api/resume' : '/api/pause';
      await fetch(endpoint, { method: 'POST' });
      isPaused = !isPaused;
    } catch (err) {
      logger.error('Failed to toggle tracking:', error);
    }
  }

  // WebSocket listeners
  let unsubscribers = [];

  onMount(() => {
    loadActivityData();

    unsubscribers.push(
      websocketService.subscribe('file-changed', data => {
        // Prepend new event to recent events
        recentEvents = [data, ...recentEvents].slice(0, 10);
        totalChanges++;
        if (data.change_type) {
          activityByType[data.change_type]++;
        }
      })
    );
  });

  onDestroy(() => {
    unsubscribers.forEach(unsub => unsub());
  });

  // Calculate activity intensity
  $: activityIntensity = totalChanges > 100 ? 'high' : totalChanges > 50 ? 'medium' : 'low';
  $: intensityColor =
    activityIntensity === 'high'
      ? 'var(--error)'
      : activityIntensity === 'medium'
        ? 'var(--warning)'
        : 'var(--success)';
</script>

<div class="activity-overview">
  <div class="header">
    <div class="header-content">
      <h1>⚡ Activity Overview</h1>
      <p class="subtitle">Real-time code changes and file monitoring</p>
    </div>
    <div class="header-actions">
      <button class="pause-btn" class:paused={isPaused} on:click={togglePause}>
        {isPaused ? '▶️ Resume' : '⏸️ Pause'} Tracking
      </button>
      <span class="last-updated">Updated {Math.floor((new Date() - lastUpdated) / 1000)}s ago</span>
      <button class="refresh-btn" on:click={loadActivityData} disabled={loading}>
        {loading ? '⏳' : '🔄'} Refresh
      </button>
    </div>
  </div>

  {#if error}
    <div class="error-banner">
      <span>⚠️ Failed to load activity data: {error}</span>
      <button on:click={loadActivityData}>Retry</button>
    </div>
  {:else if loading}
    <div class="loading-skeleton">
      <div class="skeleton-card"></div>
      <div class="skeleton-card"></div>
      <div class="skeleton-card"></div>
      <div class="skeleton-card"></div>
    </div>
  {:else}
    {#if isPaused}
      <div class="pause-banner">
        <span>⏸️ Tracking is currently paused</span>
        <button on:click={togglePause}>Resume Tracking</button>
      </div>
    {/if}

    <!-- Activity Intensity -->
    <div class="intensity-card" style="--intensity-color: {intensityColor}">
      <div class="intensity-icon">📊</div>
      <div class="intensity-content">
        <h2>
          Activity Intensity: <span class="intensity-label">{activityIntensity.toUpperCase()}</span>
        </h2>
        <p>{totalChanges} changes across {filesModified} files</p>
        <div class="intensity-bar">
          <div
            class="intensity-fill"
            style="width: {Math.min(100, (totalChanges / 100) * 100)}%"
          ></div>
        </div>
      </div>
    </div>

    <!-- Quick Stats -->
    <div class="stats-grid">
      <a href="#activity-code-changes" class="stat-card">
        <div class="stat-icon">➕</div>
        <div class="stat-content">
          <div class="stat-value">{activityByType.create || 0}</div>
          <div class="stat-label">Files Created</div>
          <div class="stat-percentage">
            {totalChanges > 0 ? Math.round((activityByType.create / totalChanges) * 100) : 0}% of
            changes
          </div>
        </div>
      </a>

      <a href="#activity-code-changes" class="stat-card">
        <div class="stat-icon">✏️</div>
        <div class="stat-content">
          <div class="stat-value">{activityByType.edit || 0}</div>
          <div class="stat-label">Files Edited</div>
          <div class="stat-percentage">
            {totalChanges > 0 ? Math.round((activityByType.edit / totalChanges) * 100) : 0}% of
            changes
          </div>
        </div>
      </a>

      <a href="#activity-code-changes" class="stat-card">
        <div class="stat-icon">🗑️</div>
        <div class="stat-content">
          <div class="stat-value">{activityByType.delete || 0}</div>
          <div class="stat-label">Files Deleted</div>
          <div class="stat-percentage">
            {totalChanges > 0 ? Math.round((activityByType.delete / totalChanges) * 100) : 0}% of
            changes
          </div>
        </div>
      </a>

      <a href="#activity-file-browser" class="stat-card">
        <div class="stat-icon">📁</div>
        <div class="stat-content">
          <div class="stat-value">{filesModified}</div>
          <div class="stat-label">Unique Files</div>
          <div class="stat-percentage">Modified recently</div>
        </div>
      </a>
    </div>

    <div class="content-grid">
      <!-- Top Modified Files -->
      <div class="section-card">
        <h2>🔥 Most Modified Files</h2>
        {#if topModifiedFiles.length > 0}
          <div class="files-list">
            {#each topModifiedFiles as file (file.filepath)}
              <div class="file-item">
                <div class="file-icon">📄</div>
                <div class="file-info">
                  <div class="file-name" title={file.filepath}>{file.filepath}</div>
                  <div class="file-stats">{file.change_count || file.edit_count || 0} changes</div>
                </div>
                <a href="#activity-file-browser" class="file-action">View →</a>
              </div>
            {/each}
          </div>
        {:else}
          <div class="empty-state">No file modifications yet</div>
        {/if}
      </div>

      <!-- Recent Activity -->
      <div class="section-card">
        <h2>🔄 Recent Changes</h2>
        {#if recentEvents.length > 0}
          <div class="events-list">
            {#each recentEvents as event (event.id || event.timestamp)}
              <div class="event-item">
                <div class="event-icon">
                  {event.change_type === 'create'
                    ? '➕'
                    : event.change_type === 'edit'
                      ? '✏️'
                      : '🗑️'}
                </div>
                <div class="event-content">
                  <div class="event-file">{event.filepath}</div>
                  <div class="event-meta">
                    {event.agent || 'Unknown'} · {new Date(event.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="empty-state">No recent changes</div>
        {/if}
      </div>
    </div>

    <!-- Quick Actions -->
    <div class="quick-actions">
      <h2>🚀 Quick Actions</h2>
      <div class="actions-grid">
        <a href="#activity-code-changes" class="action-card">
          <div class="action-icon">📝</div>
          <div>
            <div class="action-title">Code Changes</div>
            <div class="action-description">View detailed change log</div>
          </div>
        </a>

        <a href="#activity-live-feed" class="action-card">
          <div class="action-icon">🔴</div>
          <div>
            <div class="action-title">Live Feed</div>
            <div class="action-description">Real-time activity stream</div>
          </div>
        </a>

        <a href="#activity-event-log" class="action-card">
          <div class="action-icon">📋</div>
          <div>
            <div class="action-title">Event Log</div>
            <div class="action-description">Complete event history</div>
          </div>
        </a>

        <a href="#activity-file-browser" class="action-card">
          <div class="action-icon">📁</div>
          <div>
            <div class="action-title">File Browser</div>
            <div class="action-description">Browse tracked files</div>
          </div>
        </a>

        <a href="#activity-activity-log" class="action-card">
          <div class="action-icon">📊</div>
          <div>
            <div class="action-title">Activity Log</div>
            <div class="action-description">Timeline view</div>
          </div>
        </a>

        <a href="#activity-search" class="action-card">
          <div class="action-icon">🔍</div>
          <div>
            <div class="action-title">Global Search</div>
            <div class="action-description">Search all content</div>
          </div>
        </a>
      </div>
    </div>
  {/if}
</div>

<style>
  .activity-overview {
    padding: 1rem;
    max-width: 1400px;
    margin: 0 auto;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1rem;
    flex-wrap: wrap;
    gap: var(--space-xl);
  }

  .header-content h1 {
    margin: 0;
    font-size: var(--text-3xl);
    font-weight: var(--weight-bold);
    color: var(--text-primary);
  }

  .subtitle {
    margin: 0.25rem 0 0 0;
    color: var(--text-secondary);
    font-size: 0.85rem;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: var(--space-xl);
    flex-wrap: wrap;
  }

  .pause-btn {
    padding: 0.5rem 1rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    cursor: pointer;
    font-size: 0.9rem;
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .pause-btn.paused {
    background: var(--warning);
    color: white;
    border-color: var(--warning);
  }

  .pause-btn:hover {
    border-color: var(--primary);
  }

  .last-updated {
    color: var(--text-secondary);
    font-size: 0.85rem;
  }

  .refresh-btn {
    padding: 0.5rem 1rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    cursor: pointer;
    font-size: 0.9rem;
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .refresh-btn:hover:not(:disabled) {
    background: var(--bg-tertiary);
    border-color: var(--primary);
  }

  .refresh-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Pause Banner */
  .pause-banner {
    background: rgba(245, 158, 11, 0.1);
    border: 1px solid var(--warning);
    border-radius: var(--radius-xl);
    padding: 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .pause-banner button {
    padding: 0.5rem 1rem;
    background: var(--warning);
    color: white;
    border: none;
    border-radius: var(--radius-lg);
    cursor: pointer;
  }

  /* Intensity Card */
  .intensity-card {
    background: linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-tertiary) 100%);
    border: 2px solid var(--intensity-color);
    border-radius: var(--radius-xl);
    padding: 1rem;
    margin-bottom: 1rem;
    display: flex;
    gap: var(--space-2xl);
    align-items: center;
  }

  .intensity-icon {
    font-size: 3rem;
  }

  .intensity-content {
    flex: 1;
  }

  .intensity-content h2 {
    margin: 0 0 0.5rem 0;
    font-size: var(--text-2xl);
    font-weight: var(--weight-semibold);
    color: var(--text-primary);
  }

  .intensity-label {
    color: var(--intensity-color);
  }

  .intensity-content p {
    margin: 0 0 1rem 0;
    color: var(--text-secondary);
  }

  .intensity-bar {
    width: 100%;
    height: 8px;
    background: var(--bg-tertiary);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .intensity-fill {
    height: 100%;
    background: var(--intensity-color);
    transition: width var(--duration-slower) var(--ease-smooth);
  }

  /* Stats Grid */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--space-lg);
    margin-bottom: 1rem;
  }

  .stat-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-xl);
    padding: 0.65rem 0.85rem;
    display: flex;
    gap: var(--space-lg);
    align-items: center;
    text-decoration: none;
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .stat-card:hover {
    border-color: var(--primary);
    transform: translateY(-2px);
  }

  .stat-icon {
    font-size: 1.65rem;
    line-height: 1;
    flex-shrink: 0;
  }

  .stat-content {
    flex: 1;
    display: flex;
    align-items: baseline;
    gap: var(--space-lg);
    flex-wrap: wrap;
  }

  .stat-value {
    font-size: 1.65rem;
    font-weight: 700;
    color: var(--text-primary);
    line-height: 1;
    margin: 0;
  }

  .stat-label {
    color: var(--text-secondary);
    font-size: 0.82rem;
    margin: 0;
    line-height: 1.1;
    font-weight: 500;
  }

  .stat-percentage {
    font-size: 0.72rem;
    color: var(--text-tertiary);
    line-height: 1.2;
    margin: 0;
    flex-basis: 100%;
  }

  /* Content Grid */
  .content-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
    gap: var(--space-2xl);
    margin-bottom: 1rem;
  }

  .section-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-xl);
    padding: 1rem;
  }

  .section-card h2 {
    margin: 0 0 0.75rem 0;
    font-size: var(--text-2xl);
    font-weight: var(--weight-semibold);
    color: var(--text-primary);
  }

  /* Files List */
  .files-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .file-item {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
    padding: 0.65rem 0.85rem;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-xl);
  }

  .file-icon {
    font-size: 1.25rem;
    flex-shrink: 0;
  }

  .file-info {
    flex: 1;
    min-width: 0;
  }

  .file-name {
    font-weight: 500;
    color: var(--text-primary);
    margin-bottom: 0.25rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-stats {
    font-size: 0.85rem;
    color: var(--text-secondary);
  }

  .file-action {
    color: var(--primary);
    text-decoration: none;
    font-weight: 500;
    white-space: nowrap;
  }

  .file-action:hover {
    text-decoration: underline;
  }

  /* Events List */
  .events-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .event-item {
    display: flex;
    gap: var(--space-lg);
    padding: 0.65rem 0.85rem;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-xl);
  }

  .event-icon {
    font-size: 1.25rem;
    flex-shrink: 0;
  }

  .event-content {
    flex: 1;
    min-width: 0;
  }

  .event-file {
    font-weight: 500;
    color: var(--text-primary);
    margin-bottom: 0.25rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .event-meta {
    font-size: 0.85rem;
    color: var(--text-secondary);
  }

  /* Quick Actions */
  .quick-actions h2 {
    margin: 0 0 0.75rem 0;
    font-size: var(--text-2xl);
    font-weight: var(--weight-semibold);
    color: var(--text-primary);
  }

  .actions-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--space-lg);
  }

  .action-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-xl);
    padding: 0.65rem 0.85rem;
    text-decoration: none;
    transition: all var(--duration-base) var(--ease-smooth);
    display: flex;
    align-items: center;
    gap: var(--space-lg);
  }

  .action-card:hover {
    border-color: var(--primary);
    transform: translateY(-2px);
  }

  .action-icon {
    font-size: 1.65rem;
    line-height: 1;
    flex-shrink: 0;
  }

  .action-title {
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 0.15rem 0;
    font-size: 0.85rem;
    line-height: 1.2;
  }

  .action-description {
    font-size: 0.72rem;
    color: var(--text-secondary);
    line-height: 1.2;
    margin: 0;
  }

  /* Empty State */
  .empty-state {
    padding: 2rem;
    text-align: center;
    color: var(--text-secondary);
    font-style: italic;
  }

  /* Loading & Error States */
  .loading-skeleton {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: var(--space-2xl);
  }

  .skeleton-card {
    height: 150px;
    background: linear-gradient(
      90deg,
      var(--bg-secondary) 25%,
      var(--bg-tertiary) 50%,
      var(--bg-secondary) 75%
    );
    background-size: 200% 100%;
    animation: loading 1.5s infinite;
    border-radius: var(--radius-xl);
  }

  @keyframes loading {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  .error-banner {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid var(--error);
    border-radius: var(--radius-xl);
    padding: 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
  }

  .error-banner button {
    padding: 0.5rem 1rem;
    background: var(--error);
    color: white;
    border: none;
    border-radius: var(--radius-lg);
    cursor: pointer;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .activity-overview {
      padding: 1rem;
    }

    .header {
      flex-direction: column;
    }

    .intensity-card {
      flex-direction: column;
      text-align: center;
    }

    .stats-grid,
    .content-grid,
    .actions-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
