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
  <div class="mb-4">
    <LiveStatusBar />
  </div>

  <!-- Side-by-side at xl+ (1280px+). Below that — including the ~960 px
       half-screen design center — the diff stacks below the change list
       so neither column gets crushed. -->
  <div class="grid grid-cols-1 xl:grid-cols-[minmax(320px,420px)_1fr] gap-4">
    <!-- Left: Recent Changes -->
    <div
      class="bg-surface border border-border rounded-lg overflow-hidden flex flex-col min-w-[280px]"
    >
      <div class="flex items-center justify-between px-4 py-2 border-b border-border bg-canvas">
        <span class="text-xs font-semibold text-muted uppercase tracking-wide">Recent Changes</span>
        <span class="text-xs font-mono text-muted">{recentFiles.length}</span>
      </div>
      <div class="max-h-[480px] overflow-y-auto">
        {#if loading}
          <div class="text-sm text-muted font-sans p-4 text-center">Loading...</div>
        {:else if recentFiles.length === 0}
          <div class="p-4 text-center">
            <div class="text-sm text-body font-sans mb-1">Waiting for file changes</div>
            <div class="text-xs text-muted font-sans">
              Edit any file in a tracked project — or let Claude Code do it — and it'll appear here
              within a second, with a side-by-side diff below.
            </div>
          </div>
        {:else}
          {#each recentFiles as file (file.id || file.filepath || file.path)}
            <button
              class="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-canvas transition-colors border-b border-border/40 last:border-b-0"
              class:bg-canvas={(file.filepath || file.path) === selectedFile}
              onclick={() => handleFileClick(file)}
              aria-label="{getChangeType(file)} {getFileName(file)}"
              aria-current={(file.filepath || file.path) === selectedFile ? 'true' : undefined}
            >
              <span class="text-xs font-mono font-bold w-4 flex-shrink-0 {getChangeClass(file)}"
                >{getChangeType(file)}</span
              >
              <div class="flex-1 min-w-0">
                <div class="text-sm font-mono text-body truncate">{getFileName(file)}</div>
                <div class="text-xs font-mono text-muted truncate">{getFileDir(file)}</div>
              </div>
              <span class="text-xs font-mono text-muted flex-shrink-0"
                >{timeAgo(file.timestamp)}</span
              >
            </button>
          {/each}
        {/if}
      </div>
    </div>

    <!-- Right: Diff Viewer — needs a sensible min-height so it's usable
         even when stacked below the list at narrow widths. -->
    <div class="bg-surface border border-border rounded-lg overflow-hidden min-h-[420px]">
      <DiffViewer filePath={selectedFile} />
    </div>
  </div>
</PageLayout>
