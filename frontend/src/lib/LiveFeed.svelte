<script>
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';
  import { formatTime as formatTimeString } from './timeFormat.js';
  import ProjectBadge from './ProjectBadge.svelte';
  import { api } from './apiClient.js';
  import { logger } from './logger.js';
  import { notifications } from './notificationService.js';
  import LoadingSkeleton from './LoadingSkeleton.svelte';

  let changes = [];
  let loading = true;
  let searchQuery = '';
  let isPaused = false;
  let autoScroll = true;
  let maxChanges = 50; // Keep last 50 changes in view

  // Filter out build artifacts - only show real source code changes
  function isSourceCodeFile(filepath) {
    if (!filepath) return false;

    // Exclude build/dist directories
    if (filepath.match(/\/(dist|build|\.vite|\.next|\.nuxt|out|public\/build)\//)) return false;

    // Exclude build artifacts
    if (filepath.match(/\.(map|min\.js|min\.css|chunk\.js)$/)) return false;

    // Exclude dependencies
    if (filepath.match(/\/(node_modules|\.git|\.svelte-kit)\//)) return false;

    // Include everything else (source code)
    return true;
  }

  // Debounce utility
  let debouncedTimeoutId;
  const debounce = (fn, delay) => {
    return function (...args) {
      clearTimeout(debouncedTimeoutId);
      debouncedTimeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
  };

  // Debounced reload
  const debouncedLoadChanges = debounce(async () => {
    await loadRecentChanges();
  }, 300);

  // WebSocket event handlers
  const handleFileChanged = (data) => {
    if (isPaused) return;
    logger.info('🟢 LIVE: File change detected:', data);
    debouncedLoadChanges();
  };

  const handleProjectSwitched = (data) => {
    logger.info('📡 Project switched, reloading live feed:', data.project);
    loadRecentChanges();
  };

  onMount(async () => {
    await loadRecentChanges();
    loading = false;

    // Connect to WebSocket for real-time updates
    websocketService.connect();
    websocketService.on('file-changed', handleFileChanged);
    websocketService.on('project-switched', handleProjectSwitched);
  });

  onDestroy(() => {
    websocketService.off('file-changed', handleFileChanged);
    websocketService.off('project-switched', handleProjectSwitched);

    if (debouncedTimeoutId) {
      clearTimeout(debouncedTimeoutId);
    }
  });

  async function loadRecentChanges() {
    try {
      // Get recent file events with diffs from ALL projects
      const data = await api.get('/all-file-events?limit=50&diff=true');
      const allChanges = Array.isArray(data) ? data : [];

      // Filter to only show real source code (exclude build artifacts)
      const sourceChanges = allChanges.filter(change => isSourceCodeFile(change.filepath));

      // Keep only last maxChanges items
      changes = sourceChanges.slice(0, maxChanges);

      // Auto-scroll to top when new changes arrive
      if (autoScroll && !isPaused) {
        setTimeout(() => {
          const container = document.querySelector('.live-feed-content');
          if (container) {
            container.scrollTop = 0;
          }
        }, 100);
      }
    } catch (error) {
      logger.error('Failed to load live changes:', error);
    }
  }

  function parseDiffLines(diff) {
    if (!diff) return [];

    const lines = diff.split('\n');
    let currentLineNum = 0;

    return lines.map((line, index) => {
      let type = 'context';
      let displayNum = '';

      // Check if it's a header line (@@)
      if (line.startsWith('@@')) {
        type = 'header';
        const match = line.match(/\+(\d+)/);
        if (match) {
          currentLineNum = parseInt(match[1], 10) - 1;
        }
        displayNum = '•';
      }
      // Addition line
      else if (line.startsWith('+') && !line.startsWith('+++')) {
        type = 'add';
        currentLineNum++;
        displayNum = currentLineNum.toString();
      }
      // Deletion line
      else if (line.startsWith('-') && !line.startsWith('---')) {
        type = 'remove';
        displayNum = '-';
      }
      // File header lines
      else if (line.startsWith('+++') || line.startsWith('---')) {
        type = 'header';
        displayNum = '•';
      }
      // Context line
      else if (line.trim() !== '') {
        type = 'context';
        currentLineNum++;
        displayNum = currentLineNum.toString();
      }

      return {
        text: line,
        type,
        lineNum: displayNum,
        index
      };
    }).filter(line => line.text.trim() !== '' || line.type !== 'context');
  }

  function getChangeTypeIcon(changeType) {
    if (changeType === 'add' || changeType === 'create') return '➕';
    if (changeType === 'change' || changeType === 'modify') return '✏️';
    if (changeType === 'unlink' || changeType === 'delete') return '🗑️';
    return '📝';
  }

  function getChangeTypeColor(changeType) {
    if (changeType === 'add' || changeType === 'create') return 'var(--success)';
    if (changeType === 'change' || changeType === 'modify') return 'var(--info)';
    if (changeType === 'unlink' || changeType === 'delete') return 'var(--error)';
    return 'var(--muted)';
  }

  function formatTime(timestamp) {
    return formatTimeString(timestamp);
  }

  function togglePause() {
    isPaused = !isPaused;
    if (!isPaused) {
      // Resume and reload
      loadRecentChanges();
    }
  }

  // Reactive filtering
  $: filteredChanges = changes.filter(change => {
    if (searchQuery && !change.filepath?.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    return true;
  });
</script>

<div class="live-feed" role="region" aria-label="Live code feed">
  <!-- Header -->
  <div class="live-feed-header">
    <div class="header-left">
      <h2>🟢 Live Feed</h2>
      <p class="subtitle">Real-time code changes as they happen</p>
    </div>
    <div class="header-controls">
      <div class="control-group">
        <label class="checkbox-label">
          <input type="checkbox" bind:checked={autoScroll} />
          <span>Auto-scroll</span>
        </label>
      </div>
      <button
        class="btn-pause"
        class:paused={isPaused}
        on:click={togglePause}
        aria-label={isPaused ? 'Resume live updates' : 'Pause live updates'}
        aria-pressed={isPaused}
      >
        <span aria-hidden="true">{isPaused ? '▶️' : '⏸️'}</span>
        <span>{isPaused ? 'Resume' : 'Pause'}</span>
      </button>
    </div>
  </div>

  {#if isPaused}
    <div class="paused-banner" role="status" aria-live="polite">
      <span aria-hidden="true">⏸️</span> Feed paused - Click Resume to continue live updates
    </div>
  {/if}

  <!-- Search Bar -->
  <div class="search-bar">
    <input
      type="text"
      class="search-input"
      placeholder="Filter by file path..."
      bind:value={searchQuery}
      aria-label="Search file changes"
    />
    {#if searchQuery}
      <button class="clear-search" on:click={() => searchQuery = ''} aria-label="Clear search">✕</button>
    {/if}
    <div class="search-info">
      <span class="count">{filteredChanges.length} {filteredChanges.length === 1 ? 'change' : 'changes'}</span>
    </div>
  </div>

  <!-- Feed Content -->
  <div class="live-feed-content" role="feed" aria-label="Live code changes" aria-busy={loading}>
    {#if loading}
      <LoadingSkeleton type="list" count={5} height="80px" />
    {:else if filteredChanges.length === 0}
      <div class="empty-state" role="status">
        {#if searchQuery}
          <p>No changes match "{searchQuery}"</p>
          <p class="empty-hint">Try a different search term</p>
        {:else}
          <p>Waiting for code changes...</p>
          <p class="empty-hint">Start coding and watch this feed light up! 🚀</p>
        {/if}
      </div>
    {:else}
      <div class="changes-list">
        {#each filteredChanges as change, index (`${change.id || change.filepath}-${change.timestamp}-${index}`)}
          <div class="change-item" class:has-diff={change.diff}>
            <div class="change-header">
              <div class="change-meta">
                <span class="change-icon" style="color: {getChangeTypeColor(change.change_type)}">
                  {getChangeTypeIcon(change.change_type)}
                </span>
                <span class="change-type" style="color: {getChangeTypeColor(change.change_type)}">
                  {change.change_type.toUpperCase()}
                </span>
                {#if change.project}
                  <ProjectBadge project={change.project} size="small" />
                {/if}
                <span class="change-time">{formatTime(change.timestamp)}</span>
              </div>
              <button class="btn-copy" title="Copy file path" on:click={() => {
                navigator.clipboard.writeText(change.filepath || 'Unknown file');
                notifications.success('File path copied!');
              }}>📋</button>
            </div>

            <div class="change-file">
              <code>{change.filepath || 'Unknown file'}</code>
            </div>

            {#if change.diff}
              <div class="change-diff">
                {#each parseDiffLines(change.diff) as line (line.index)}
                  <div class="diff-line {line.type}">
                    <span class="line-number">{line.lineNum}</span>
                    <code class="line-content">{line.text}</code>
                  </div>
                {/each}
              </div>
            {/if}

            <div class="change-footer">
              <span class="change-size">{change.event_size || 0} bytes</span>
              {#if change.file_hash}
                <span class="change-hash">{change.file_hash.substring(0, 8)}</span>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .live-feed {
    width: 100%;
    height: calc(100vh - 180px);
    display: flex;
    flex-direction: column;
    background: var(--bg);
    position: relative;
    color: var(--text);
  }

  /* Header */
  .live-feed-header {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: var(--space-lg) var(--space-xl);
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
  }

  .header-left h2 {
    margin: 0 0 var(--space-sm) 0;
    font-size: var(--text-2xl);
    color: var(--text);
    font-weight: var(--weight-semibold);
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  .subtitle {
    margin: 0;
    font-size: 11px;
    color: var(--muted);
  }

  .header-controls {
    display: flex;
    gap: var(--space-xl);
    align-items: center;
  }

  .control-group {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    font-size: 11px;
    color: var(--text);
    cursor: pointer;
    user-select: none;
  }

  .checkbox-label input[type="checkbox"] {
    cursor: pointer;
  }

  .btn-pause {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-md) var(--space-xl);
    background: var(--error);
    border: 1px solid var(--error);
    border-radius: var(--radius-sm);
    color: white;
    font-family: var(--sans);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-fast) var(--ease-smooth);
  }

  .btn-pause.paused {
    background: var(--success);
    border-color: var(--success);
  }

  .btn-pause:hover {
    opacity: 0.9;
    transform: translateY(-1px);
  }

  .btn-pause:focus {
    outline: 2px solid white;
    outline-offset: 2px;
  }

  .paused-banner {
    padding: var(--space-lg) var(--space-xl);
    background: color-mix(in srgb, var(--warning) 15%, transparent);
    border-bottom: 1px solid var(--warning);
    color: var(--warning);
    font-size: 12px;
    font-weight: 600;
    text-align: center;
    animation: pulse 2s ease-in-out infinite;
    flex-shrink: 0;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  /* Search Bar */
  .search-bar {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: var(--space-lg) var(--space-xl);
    display: flex;
    gap: var(--space-lg);
    align-items: center;
    flex-shrink: 0;
  }

  .search-input {
    flex: 1;
    padding: var(--space-md) var(--space-lg);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-family: var(--mono);
    font-size: 11px;
    transition: all var(--duration-fast) var(--ease-smooth);
  }

  .search-input:focus {
    outline: none;
    border-color: var(--accent);
    background: var(--surface-2);
  }

  .clear-search {
    padding: var(--space-md) var(--space-lg);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--muted);
    font-size: 11px;
    cursor: pointer;
    transition: all var(--duration-fast) var(--ease-smooth);
  }

  .clear-search:hover {
    background: var(--error);
    border-color: var(--error);
    color: white;
  }

  .search-info {
    display: flex;
    gap: var(--space-md);
    align-items: center;
  }

  .count {
    font-size: 11px;
    color: var(--muted);
    font-weight: 600;
  }

  /* Feed Content */
  .live-feed-content {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: var(--space-xl);
  }

  .changes-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    padding-bottom: 20px;
  }

  .change-item {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-lg) var(--space-lg);
    transition: all var(--duration-fast) var(--ease-smooth);
    animation: fadeIn 0.3s ease;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .change-item:hover {
    border-color: var(--accent);
    background: var(--surface-2);
    transform: translateX(2px);
  }

  .change-item.has-diff {
    border-left: 3px solid var(--accent);
  }

  .change-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-md);
  }

  .change-meta {
    display: flex;
    gap: var(--space-lg);
    align-items: center;
  }

  .change-icon {
    font-size: 14px;
  }

  .change-type {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.5px;
  }

  .change-time {
    font-size: 11px;
    color: var(--muted);
  }

  .btn-copy {
    padding: var(--space-sm) var(--space-lg);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: 11px;
    transition: all var(--duration-fast) var(--ease-smooth);
  }

  .btn-copy:hover {
    background: var(--accent);
    border-color: var(--accent);
    color: white;
  }

  .btn-copy:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .change-file {
    margin-bottom: var(--space-md);
  }

  .change-file code {
    font-size: 12px;
    color: var(--accent);
    background: var(--bg);
    padding: var(--space-sm) var(--space-lg);
    border-radius: var(--radius-sm);
    display: inline-block;
    font-weight: 500;
  }

  .change-diff {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    margin-bottom: var(--space-md);
    overflow-x: auto;
    max-height: 400px;
    overflow-y: auto;
    font-family: var(--mono);
  }

  .diff-line {
    display: flex;
    align-items: stretch;
    font-size: 11px;
    line-height: 1.5;
    min-height: var(--icon-sm);
    transition: background var(--duration-fast) var(--ease-smooth);
  }

  .diff-line:hover {
    background: color-mix(in srgb, var(--accent) 5%, transparent);
  }

  .diff-line.add {
    background: color-mix(in srgb, var(--success) 15%, transparent);
    border-left: 3px solid var(--success);
  }

  .diff-line.remove {
    background: color-mix(in srgb, var(--error) 15%, transparent);
    border-left: 3px solid var(--error);
  }

  .diff-line.context {
    background: transparent;
    border-left: 3px solid transparent;
  }

  .diff-line.header {
    background: color-mix(in srgb, var(--info) 10%, transparent);
    border-left: 3px solid var(--info);
    color: var(--info);
    font-weight: 600;
  }

  .line-number {
    display: inline-block;
    width: 36px;
    padding: var(--space-xs) var(--space-lg);
    color: var(--muted);
    text-align: right;
    user-select: none;
    font-size: 11px;
    flex-shrink: 0;
    background: color-mix(in srgb, var(--bg) 50%, var(--surface));
  }

  .diff-line.add .line-number {
    color: var(--success);
    font-weight: 600;
  }

  .diff-line.remove .line-number {
    color: var(--error);
    font-weight: 600;
  }

  .line-content {
    flex: 1;
    padding: var(--space-xs) var(--space-lg);
    white-space: pre;
    overflow-x: auto;
    color: var(--text);
    font-family: inherit;
  }

  .diff-line.add .line-content {
    color: var(--success);
  }

  .diff-line.remove .line-content {
    color: var(--error);
  }

  .change-diff::-webkit-scrollbar {
    height: 6px;
    width: 6px;
  }

  .change-diff::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: var(--radius-sm);
  }

  .change-footer {
    display: flex;
    gap: var(--space-lg);
    font-size: 11px;
    color: var(--muted);
  }

  .change-size,
  .change-hash {
    padding: var(--space-xs) var(--space-md);
    background: var(--bg);
    border-radius: var(--radius-sm);
  }

  .loading {
    text-align: center;
    padding: var(--space-3xl);
    color: var(--muted);
    font-size: 12px;
  }

  .empty-state {
    text-align: center;
    padding: var(--space-4xl) var(--space-3xl);
    color: var(--muted);
  }

  .empty-state p {
    margin: 0 0 var(--space-lg) 0;
    font-size: 13px;
  }

  .empty-hint {
    font-size: 11px;
  }

  /* Scrollbar */
  .live-feed-content::-webkit-scrollbar {
    width: 8px;
  }

  .live-feed-content::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: var(--radius);
  }

  .live-feed-content::-webkit-scrollbar-thumb:hover {
    background: var(--muted);
  }

  /* Responsive */
  @media (max-width: 768px) {
    .live-feed-header {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-lg);
    }

    .header-controls {
      width: 100%;
      justify-content: space-between;
    }

    .live-feed-content {
      padding: var(--space-lg);
    }
  }
</style>
