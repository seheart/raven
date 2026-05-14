<script>
  /**
   * Live Monitor Page - Real-time AI activity monitoring
   * Two-panel layout: recent changes list + diff viewer
   */
  import { onMount, onDestroy } from 'svelte';
  import { createPageApi } from '../apiClient.js';
  import { PageLayout, PageHeader } from '../components/layout/index.js';
  const { api, abort: abortRequests } = createPageApi();
  import { websocketService } from '../services/websocket.js';
  import LiveStatusBar from '../components/live/LiveStatusBar.svelte';
  import DiffViewer from '../components/live/DiffViewer.svelte';
  import FreshnessBadge from '../components/ui/FreshnessBadge.svelte';

  let recentFiles = $state([]);
  let selectedFile = $state(null);
  let loading = $state(true);
  let lastUpdated = $state(null);
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
      lastUpdated = new Date();
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
    if (type.includes('add') || type.includes('create')) return 'text-success';
    if (type.includes('del') || type.includes('remove')) return 'text-error';
    return 'text-accent';
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

<PageLayout variant="dashboard">
  <PageHeader
    title="Live activity"
    description="What your AI coder is touching right now — every file it creates, edits, or deletes shows up here as soon as it happens. Click any file to see what changed."
  >
    {#snippet actions()}
      <FreshnessBadge mode="live" since={lastUpdated} />
    {/snippet}
  </PageHeader>
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
            <div class="empty-state-block">
              <div class="empty-title">Waiting for file changes</div>
              <div class="empty-hint">
                Edit any file in a tracked project — or let Claude Code do it — and it'll appear
                here within a second, with a side-by-side diff on the right.
              </div>
            </div>
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
</PageLayout>
