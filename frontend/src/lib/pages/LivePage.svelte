<script>
  /**
   * Live Monitor Page - Real-time AI activity monitoring
   * Two-panel layout: recent changes list + diff viewer
   */
  import { onMount, onDestroy } from 'svelte';
  import { api } from '../apiClient.js';
  import { websocketService } from '../services/websocket.js';
  import LiveStatusBar from '../components/live/LiveStatusBar.svelte';
  import DiffViewer from '../components/live/DiffViewer.svelte';

  let recentFiles = $state([]);
  let selectedFile = $state(null);
  let loading = $state(true);
  let unsubscribe = null;

  async function loadRecentFiles() {
    try {
      const data = await api.get('/session/files');
      recentFiles = (data.files || data || []).slice(0, 50);
      if (recentFiles.length > 0 && !selectedFile) {
        selectedFile = recentFiles[0].path || recentFiles[0].file;
      }
    } catch (err) {
      console.error('Failed to load recent files:', err);
    } finally {
      loading = false;
    }
  }

  function handleFileClick(file) {
    selectedFile = file.path || file.file;
  }

  function getChangeType(file) {
    const type = file.change_type || file.type || 'modified';
    return type.charAt(0).toUpperCase();
  }

  function getChangeClass(file) {
    const type = (file.change_type || file.type || '').toLowerCase();
    if (type.includes('add') || type.includes('create')) return 'text-[var(--success)]';
    if (type.includes('del') || type.includes('remove')) return 'text-[var(--error)]';
    return 'text-[var(--accent)]';
  }

  function getFileName(file) {
    const path = file.path || file.file || '';
    return path.split('/').pop();
  }

  function getFileDir(file) {
    const path = file.path || file.file || '';
    const parts = path.split('/');
    parts.pop();
    return parts.join('/');
  }

  onMount(() => {
    loadRecentFiles();
    unsubscribe = websocketService.subscribe('file-changed', () => {
      loadRecentFiles();
    });
  });

  onDestroy(() => {
    if (unsubscribe) unsubscribe();
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
          {#each recentFiles as file (file.path || file.file)}
            <button
              class="file-item"
              class:active={(file.path || file.file) === selectedFile}
              onclick={() => handleFileClick(file)}
            >
              <span class="change-indicator {getChangeClass(file)}">{getChangeType(file)}</span>
              <div class="file-info">
                <span class="file-name">{getFileName(file)}</span>
                <span class="file-dir">{getFileDir(file)}</span>
              </div>
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
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
  }

  .panel-count {
    font-size: 0.65rem;
    font-weight: 600;
    font-family: var(--mono);
    color: var(--accent);
    background: var(--accent-subtle);
    padding: 0.1rem 0.4rem;
    border-radius: 8px;
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
    font-size: 0.65rem;
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
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-dir {
    font-size: 0.65rem;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .diff-panel {
    min-height: 0;
    overflow: hidden;
  }

  .empty-state {
    padding: 2rem 1rem;
    text-align: center;
    color: var(--muted);
    font-size: 0.8rem;
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
