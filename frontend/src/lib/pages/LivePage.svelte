<script>
  /**
   * Live Monitor Page - Real-time AI activity monitoring
   * Two-panel layout: recent changes list + diff viewer
   */
  import { onMount, onDestroy } from 'svelte';
  import { createPageApi } from '../apiClient.js';
  const { api, abort: abortRequests } = createPageApi();
  import { websocketService } from '../services/websocket.js';
  import LiveStatusBar from '../components/live/LiveStatusBar.svelte';
  import DiffViewer from '../components/live/DiffViewer.svelte';

  let recentFiles = $state([]);
  let selectedFile = $state(null);
  let loading = $state(true);
  let unsubscribe = null;
  let pollInterval = null;

  async function loadRecentFiles() {
    try {
      const data = await api.get('/file-events?limit=50');
      const events = Array.isArray(data) ? data : data?.events || [];
      // Show one entry per file, most recent event wins
      const seen = new Map();
      for (const e of events) {
        const path = e.filepath || e.path;
        if (!seen.has(path)) seen.set(path, e);
      }
      recentFiles = Array.from(seen.values());
      if (recentFiles.length > 0 && !selectedFile) {
        selectedFile = recentFiles[0].filepath || recentFiles[0].path;
      }
    } catch (err) {
      console.error('Failed to load recent files:', err);
    } finally {
      loading = false;
    }
  }

  function handleFileClick(file) {
    selectedFile = file.filepath || file.path;
  }

  function getChangeType(file) {
    const type = file.status || file.change_type || file.type || 'change';
    if (type.includes('add') || type.includes('create')) return 'A';
    if (type.includes('del') || type.includes('remove')) return 'D';
    return 'M';
  }

  function getChangeClass(file) {
    const type = (file.status || file.change_type || file.type || '').toLowerCase();
    if (type.includes('add') || type.includes('create')) return 'text-[var(--success)]';
    if (type.includes('del') || type.includes('remove')) return 'text-[var(--error)]';
    return 'text-[var(--accent)]';
  }

  function getFileName(file) {
    const path = file.path || file.filepath || file.file || '';
    return path.split('/').pop();
  }

  function getFileDir(file) {
    const path = file.path || file.filepath || file.file || '';
    const parts = path.split('/');
    parts.pop();
    return parts.join('/');
  }

  function timeAgo(timestamp) {
    if (!timestamp) return '';
    const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
    if (seconds < 5) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  onMount(() => {
    loadRecentFiles();
    unsubscribe = websocketService.subscribe('file-changed', () => {
      loadRecentFiles();
    });
    // Poll every 5s as fallback in case WebSocket misses events
    pollInterval = setInterval(loadRecentFiles, 5000);
  });

  onDestroy(() => {
    abortRequests();
    if (unsubscribe) unsubscribe();
    if (pollInterval) clearInterval(pollInterval);
  });
</script>

<div class="live-page">
  <div class="top-section">
    <LiveStatusBar />
  </div>

  <div class="main-layout">
    <!-- Left: Recent Changes -->
    <div class="changes-panel">
      <div class="panel-header">
        <span class="panel-title">Recent Changes</span>
        <span class="panel-count">{recentFiles.length}</span>
      </div>
      <div class="file-list">
        {#if loading}
          <div class="empty-state">Loading...</div>
        {:else if recentFiles.length === 0}
          <div class="empty-state">No file changes detected yet</div>
        {:else}
          {#each recentFiles as file (file.id || file.filepath || file.path)}
            <button
              class="file-item"
              class:active={(file.filepath || file.path) === selectedFile}
              onclick={() => handleFileClick(file)}
              aria-label="{getChangeType(file)} {getFileName(file)}"
              aria-current={(file.filepath || file.path) === selectedFile ? 'true' : undefined}
            >
              <span class="change-indicator {getChangeClass(file)}">{getChangeType(file)}</span>
              <div class="file-info">
                <span class="file-name">{getFileName(file)}</span>
                <span class="file-dir">{getFileDir(file)}</span>
              </div>
              <span class="file-time">{timeAgo(file.timestamp)}</span>
            </button>
          {/each}
        {/if}
      </div>
    </div>

    <!-- Right: Diff Viewer -->
    <div class="diff-panel">
      <DiffViewer filePath={selectedFile} />
    </div>
  </div>
</div>

<style>
  .live-page {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--bg);
  }

  .top-section {
    padding: 0.75rem 1.5rem;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }

  .main-layout {
    flex: 1;
    display: grid;
    grid-template-columns: 300px 1fr;
    overflow: hidden;
    min-height: 0;
  }

  .changes-panel {
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--surface);
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.6rem 1rem;
    border-bottom: 1px solid var(--border);
    background: var(--bg);
  }

  .panel-title {
    font-size: var(--text-sm);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
  }

  .panel-count {
    font-size: var(--text-xs);
    font-weight: 600;
    font-family: var(--mono);
    color: var(--accent);
    background: var(--accent-subtle);
    padding: 0.1rem 0.4rem;
    border-radius: var(--radius-xl);
  }

  .file-list {
    flex: 1;
    overflow-y: auto;
  }

  .file-item {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: 100%;
    padding: 0.5rem 1rem;
    border: none;
    border-bottom: 1px solid var(--border);
    background: transparent;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
    font-family: var(--sans);
  }

  .file-item:hover {
    background: var(--bg);
  }

  .file-item.active {
    background: var(--accent-subtle);
    border-left: 2px solid var(--accent);
  }

  .change-indicator {
    font-size: var(--text-xs);
    font-weight: 700;
    font-family: var(--mono);
    min-width: 1rem;
    text-align: center;
  }

  .file-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .file-name {
    font-size: var(--text-base);
    font-weight: 500;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-dir {
    font-size: var(--text-xs);
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-time {
    font-size: var(--text-xs);
    color: var(--muted);
    font-family: var(--mono);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .diff-panel {
    min-height: 0;
    overflow: hidden;
  }

  .empty-state {
    padding: 2rem 1rem;
    text-align: center;
    color: var(--muted);
    font-size: var(--text-base);
  }

  @media (max-width: 900px) {
    .main-layout {
      grid-template-columns: 1fr;
      grid-template-rows: 200px 1fr;
    }
    .changes-panel {
      border-right: none;
      border-bottom: 1px solid var(--border);
    }
  }
</style>
