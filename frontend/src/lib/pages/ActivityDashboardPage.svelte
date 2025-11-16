<script>
  import { logger } from '../logger.js';
  /**
   * Activity Dashboard Page
   * Dashboard-style overview of activity monitoring with real-time updates
   * Provides quick stats, top files, recent changes, and quick actions
   */

  import { onMount } from 'svelte';
  import { api } from '../apiClient.js';
  import { websocketService } from '../services/websocket.js';
  import { navigate } from '../utils/router.svelte.js';

  // State
  let stats = $state({
    totalChanges: 0,
    filesModified: 0,
    creates: 0,
    edits: 0,
    deletes: 0
  });

  let recentEvents = $state([]);
  let topModifiedFiles = $state([]);
  let isPaused = $state(false);
  let loading = $state(true);
  let error = $state(null);
  let lastUpdated = $state(null);

  // Derived values
  const activityIntensity = $derived.by(() => {
    if (stats.totalChanges > 100) return { level: 'HIGH', color: 'var(--error)', icon: '🔥' };
    if (stats.totalChanges > 50) return { level: 'MEDIUM', color: 'var(--warning)', icon: '⚡' };
    return { level: 'LOW', color: 'var(--success)', icon: '💤' };
  });

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

  function getChangeIcon(changeType) {
    if (changeType === 'create' || changeType === 'add') return '➕';
    if (changeType === 'edit' || changeType === 'change') return '✏️';
    if (changeType === 'delete' || changeType === 'unlink') return '🗑️';
    return '📄';
  }

  function calculatePercentage(value) {
    if (stats.totalChanges === 0) return 0;
    return Math.round((value / stats.totalChanges) * 100);
  }

  // Load activity data
  async function loadActivityData() {
    try {
      loading = true;
      error = null;

      // Parallel data fetching
      const [eventsData, topFiles, trackingStatus] = await Promise.all([
        api.get('/file-events?limit=100').catch(() => ({ events: [] })),
        api.get('/top-modified-files?limit=10').catch(() => ({ files: [] })),
        api.get('/status').catch(() => ({ paused: false }))
      ]);

      const events = eventsData.events || [];
      recentEvents = events.slice(0, 10);
      stats.totalChanges = events.length;

      // Count files and activity types
      const uniqueFiles = new Set();
      let createCount = 0;
      let editCount = 0;
      let deleteCount = 0;

      events.forEach(event => {
        if (event.filepath) uniqueFiles.add(event.filepath);
        if (event.change_type === 'create' || event.change_type === 'add') createCount++;
        else if (event.change_type === 'edit' || event.change_type === 'change') editCount++;
        else if (event.change_type === 'delete' || event.change_type === 'unlink') deleteCount++;
      });

      stats.filesModified = uniqueFiles.size;
      stats.creates = createCount;
      stats.edits = editCount;
      stats.deletes = deleteCount;

      topModifiedFiles = topFiles.files || [];
      isPaused = trackingStatus.paused || false;

      lastUpdated = new Date();
      loading = false;
    } catch (err) {
      logger.error('Failed to load activity data:', err);
      error = err.message;
      loading = false;
    }
  }

  // Toggle pause/resume
  async function togglePause() {
    try {
      const endpoint = isPaused ? '/resume' : '/pause';
      await api.post(endpoint, {});
      isPaused = !isPaused;
    } catch (err) {
      logger.error('Failed to toggle tracking:', err);
    }
  }

  // WebSocket handler for real-time updates
  const handleFileChanged = (data) => {
    // Prepend new event to recent events
    recentEvents = [data, ...recentEvents].slice(0, 10);
    stats.totalChanges++;

    // Update type counts
    if (data.change_type === 'create' || data.change_type === 'add') {
      stats.creates++;
    } else if (data.change_type === 'edit' || data.change_type === 'change') {
      stats.edits++;
    } else if (data.change_type === 'delete' || data.change_type === 'unlink') {
      stats.deletes++;
    }

    lastUpdated = new Date();
  };

  // Load data and setup WebSocket on mount
  onMount(() => {
    loadActivityData();

    // Connect to WebSocket for real-time updates
    websocketService.connect();
    websocketService.on('file-changed', handleFileChanged);

    // Cleanup function
    return () => {
      websocketService.off('file-changed', handleFileChanged);
    };
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-7xl mx-auto space-y-6">
    <!-- Header -->
    <div class="flex justify-between items-start flex-wrap gap-4 mb-6">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1 font-sans">Activity Dashboard</h1>
        <p class="text-base text-[var(--muted)] font-sans">Real-time code changes and file monitoring</p>
      </div>
      <div class="flex items-center gap-3 flex-wrap">
        <button
          onclick={togglePause}
          class="px-4 py-2 rounded-lg text-sm font-semibold transition-all border"
          class:bg-[var(--warning)]={isPaused}
          class:text-white={isPaused}
          class:border-[var(--warning)]={isPaused}
          class:bg-[var(--surface)]={!isPaused}
          class:text-[var(--text)]={!isPaused}
          class:border-[var(--border)]={!isPaused}
          class:hover:border-[var(--accent)]={!isPaused}
        >
          {isPaused ? '▶️ Resume' : '⏸️ Pause'} Tracking
        </button>
        <span class="text-sm text-[var(--muted)] font-sans">Updated {timeAgo}</span>
        <button
          onclick={() => loadActivityData()}
          disabled={loading}
          class="px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-sm font-sans hover:border-[var(--accent)] transition-colors disabled:opacity-50"
        >
          {loading ? '⏳' : '🔄'} Refresh
        </button>
      </div>
    </div>

    {#if error}
      <div class="bg-[var(--error-subtle)] border border-[var(--error)] rounded-lg p-4 flex justify-between items-center">
        <span class="text-base text-[var(--error)] font-sans">⚠️ Failed to load activity data: {error}</span>
        <button
          onclick={() => loadActivityData()}
          class="px-3 py-1.5 bg-[var(--error)] text-white rounded text-sm font-sans"
        >
          Retry
        </button>
      </div>
    {/if}

    {#if loading}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {#each Array(4) as _, i (i)}
          <div class="h-32 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-pulse"></div>
        {/each}
      </div>
    {:else}
      {#if isPaused}
        <div class="bg-[var(--warning-subtle)] border border-[var(--warning)] rounded-lg p-4 flex justify-between items-center">
          <span class="text-base font-sans">⏸️ Tracking is currently paused</span>
          <button
            onclick={togglePause}
            class="px-3 py-1.5 bg-[var(--warning)] text-white rounded text-sm font-sans"
          >
            Resume Tracking
          </button>
        </div>
      {/if}

      <!-- Activity Intensity Card -->
      <div
        class="bg-gradient-to-br from-[var(--surface)] to-[var(--bg-tertiary)] border-2 rounded-lg p-5 flex items-center gap-6"
        style="border-color: {activityIntensity.color}"
      >
        <div class="text-5xl flex-shrink-0">{activityIntensity.icon}</div>
        <div class="flex-1">
          <h2 class="text-xl font-semibold text-[var(--text-heading)] mb-1 font-sans">
            Activity Intensity: <span style="color: {activityIntensity.color}">{activityIntensity.level}</span>
          </h2>
          <p class="text-base text-[var(--muted)] mb-3 font-sans">
            {formatNumber(stats.totalChanges)} changes across {formatNumber(stats.filesModified)} files
          </p>
          <div class="w-full h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
            <div
              class="h-full transition-all duration-500"
              style="width: {Math.min(100, (stats.totalChanges / 100) * 100)}%; background: {activityIntensity.color}"
            ></div>
          </div>
        </div>
      </div>

      <!-- Quick Stats Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          onclick={() => navigate('/activity/code-changes')}
          class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex items-center gap-4 hover:border-[var(--accent)] hover:-translate-y-0.5 transition-all text-left"
        >
          <div class="text-3xl flex-shrink-0">➕</div>
          <div class="flex-1">
            <div class="text-2xl font-bold text-[var(--text-heading)] leading-none mb-1">
              {formatNumber(stats.creates)}
            </div>
            <div class="text-sm text-[var(--muted)] font-sans mb-1">Files Created</div>
            <div class="text-xs text-[var(--muted)] font-sans">{calculatePercentage(stats.creates)}% of changes</div>
          </div>
        </button>

        <button
          onclick={() => navigate('/activity/code-changes')}
          class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex items-center gap-4 hover:border-[var(--accent)] hover:-translate-y-0.5 transition-all text-left"
        >
          <div class="text-3xl flex-shrink-0">✏️</div>
          <div class="flex-1">
            <div class="text-2xl font-bold text-[var(--text-heading)] leading-none mb-1">
              {formatNumber(stats.edits)}
            </div>
            <div class="text-sm text-[var(--muted)] font-sans mb-1">Files Edited</div>
            <div class="text-xs text-[var(--muted)] font-sans">{calculatePercentage(stats.edits)}% of changes</div>
          </div>
        </button>

        <button
          onclick={() => navigate('/activity/code-changes')}
          class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex items-center gap-4 hover:border-[var(--accent)] hover:-translate-y-0.5 transition-all text-left"
        >
          <div class="text-3xl flex-shrink-0">🗑️</div>
          <div class="flex-1">
            <div class="text-2xl font-bold text-[var(--text-heading)] leading-none mb-1">
              {formatNumber(stats.deletes)}
            </div>
            <div class="text-sm text-[var(--muted)] font-sans mb-1">Files Deleted</div>
            <div class="text-xs text-[var(--muted)] font-sans">{calculatePercentage(stats.deletes)}% of changes</div>
          </div>
        </button>

        <button
          onclick={() => navigate('/activity/file-browser')}
          class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex items-center gap-4 hover:border-[var(--accent)] hover:-translate-y-0.5 transition-all text-left"
        >
          <div class="text-3xl flex-shrink-0">📁</div>
          <div class="flex-1">
            <div class="text-2xl font-bold text-[var(--text-heading)] leading-none mb-1">
              {formatNumber(stats.filesModified)}
            </div>
            <div class="text-sm text-[var(--muted)] font-sans mb-1">Unique Files</div>
            <div class="text-xs text-[var(--muted)] font-sans">Modified recently</div>
          </div>
        </button>
      </div>

      <!-- Content Grid: Top Files & Recent Changes -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Top Modified Files -->
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
          <h2 class="text-xl font-semibold text-[var(--text-heading)] mb-4 font-sans flex items-center gap-2">
            <span>🔥</span> Most Modified Files
          </h2>
          {#if topModifiedFiles.length > 0}
            <div class="space-y-2">
              {#each topModifiedFiles as file (file.filepath)}
                <div class="flex items-center gap-3 p-3 bg-[var(--bg)] border border-[var(--border)] rounded-lg">
                  <div class="text-xl flex-shrink-0">📄</div>
                  <div class="flex-1 min-w-0">
                    <div class="text-sm font-semibold text-[var(--text)] font-mono truncate" title={file.filepath}>
                      {file.filepath}
                    </div>
                    <div class="text-xs text-[var(--muted)] font-sans">
                      {formatNumber(file.change_count || file.edit_count || 0)} changes
                    </div>
                  </div>
                  <button
                    onclick={() => navigate('/activity/file-browser')}
                    class="text-sm text-[var(--accent)] hover:underline font-sans flex-shrink-0"
                  >
                    View →
                  </button>
                </div>
              {/each}
            </div>
          {:else}
            <div class="text-center py-8">
              <span class="text-2xl block mb-2">📂</span>
              <p class="text-base text-[var(--muted)] font-sans">No file modifications yet</p>
            </div>
          {/if}
        </div>

        <!-- Recent Changes -->
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
          <h2 class="text-xl font-semibold text-[var(--text-heading)] mb-4 font-sans flex items-center gap-2">
            <span>🔄</span> Recent Changes
          </h2>
          {#if recentEvents.length > 0}
            <div class="space-y-2">
              {#each recentEvents as event (event.id || event.timestamp)}
                <div class="flex items-start gap-3 p-3 bg-[var(--bg)] border border-[var(--border)] rounded-lg">
                  <div class="text-lg flex-shrink-0 mt-0.5">
                    {getChangeIcon(event.change_type)}
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="text-sm text-[var(--text)] font-mono truncate" title={event.filepath}>
                      {event.filepath}
                    </div>
                    <div class="text-xs text-[var(--muted)] font-sans">
                      {event.agent || 'Unknown'} • {formatDateTime(event.timestamp)}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <div class="text-center py-8">
              <span class="text-2xl block mb-2">💤</span>
              <p class="text-base text-[var(--muted)] font-sans">No recent changes</p>
            </div>
          {/if}
        </div>
      </div>

      <!-- Quick Actions -->
      <section>
        <h2 class="text-xl font-semibold text-[var(--text-heading)] mb-4 font-sans flex items-center gap-2">
          <span>🚀</span> Quick Actions
        </h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <button
            onclick={() => navigate('/activity/code-changes')}
            class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 hover:border-[var(--accent)] hover:-translate-y-0.5 transition-all text-left"
          >
            <div class="text-2xl mb-2">📝</div>
            <div class="text-base font-semibold text-[var(--text-heading)] mb-1 font-sans">Code Changes</div>
            <div class="text-xs text-[var(--muted)] font-sans">View detailed change log</div>
          </button>

          <button
            onclick={() => navigate('/activity/live-feed')}
            class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 hover:border-[var(--accent)] hover:-translate-y-0.5 transition-all text-left"
          >
            <div class="text-2xl mb-2">🔴</div>
            <div class="text-base font-semibold text-[var(--text-heading)] mb-1 font-sans">Live Feed</div>
            <div class="text-xs text-[var(--muted)] font-sans">Real-time activity stream</div>
          </button>

          <button
            onclick={() => navigate('/activity/event-log')}
            class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 hover:border-[var(--accent)] hover:-translate-y-0.5 transition-all text-left"
          >
            <div class="text-2xl mb-2">📋</div>
            <div class="text-base font-semibold text-[var(--text-heading)] mb-1 font-sans">Event Log</div>
            <div class="text-xs text-[var(--muted)] font-sans">Complete event history</div>
          </button>

          <button
            onclick={() => navigate('/activity/file-browser')}
            class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 hover:border-[var(--accent)] hover:-translate-y-0.5 transition-all text-left"
          >
            <div class="text-2xl mb-2">📁</div>
            <div class="text-base font-semibold text-[var(--text-heading)] mb-1 font-sans">File Browser</div>
            <div class="text-xs text-[var(--muted)] font-sans">Browse tracked files</div>
          </button>

          <button
            onclick={() => navigate('/activity/timeline')}
            class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 hover:border-[var(--accent)] hover:-translate-y-0.5 transition-all text-left"
          >
            <div class="text-2xl mb-2">📊</div>
            <div class="text-base font-semibold text-[var(--text-heading)] mb-1 font-sans">Timeline</div>
            <div class="text-xs text-[var(--muted)] font-sans">Activity timeline view</div>
          </button>

          <button
            onclick={() => navigate('/activity/search')}
            class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 hover:border-[var(--accent)] hover:-translate-y-0.5 transition-all text-left"
          >
            <div class="text-2xl mb-2">🔍</div>
            <div class="text-base font-semibold text-[var(--text-heading)] mb-1 font-sans">Search</div>
            <div class="text-xs text-[var(--muted)] font-sans">Search all content</div>
          </button>
        </div>
      </section>
    {/if}
  </div>
</div>
