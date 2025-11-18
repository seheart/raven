<script>
  import { api } from '../../apiClient.js';

  let { filePath = null } = $props();

  let diffData = $state(null);
  let loading = $state(false);
  let error = $state(null);
  let openTabs = $state([]);
  let activeTab = $state(null);

  // Fetch diff for a specific file
  async function fetchFileDiff(path) {
    if (!path) return;

    try {
      loading = true;
      error = null;
      const response = await api.get(`/session/diff/${encodeURIComponent(path)}`);
      diffData = parseDiff(response);
    } catch (err) {
      error = err.message;
      console.error('Failed to fetch diff:', err);
    } finally {
      loading = false;
    }
  }

  // Parse diff response into structured format
  function parseDiff(response) {
    if (!response || !response.diff) {
      return {
        filePath: response?.filePath || filePath,
        hunks: [],
        stats: { additions: 0, deletions: 0 }
      };
    }

    const hunks = [];
    const lines = response.diff.split('\n');
    let currentHunk = null;
    let additions = 0;
    let deletions = 0;

    lines.forEach(line => {
      // Hunk header (e.g., @@ -1,5 +1,7 @@)
      if (line.startsWith('@@')) {
        if (currentHunk) {
          hunks.push(currentHunk);
        }
        currentHunk = {
          header: line,
          lines: []
        };
      } else if (currentHunk) {
        const type = line.startsWith('+') ? 'add' : line.startsWith('-') ? 'remove' : 'context';

        if (type === 'add') additions++;
        if (type === 'remove') deletions++;

        currentHunk.lines.push({
          type,
          content: line.substring(1), // Remove +/- prefix
          originalLine: line
        });
      }
    });

    if (currentHunk) {
      hunks.push(currentHunk);
    }

    return {
      filePath: response.filePath || filePath,
      hunks,
      stats: { additions, deletions }
    };
  }

  // Watch for file path changes
  $effect(() => {
    if (filePath) {
      fetchFileDiff(filePath);

      // Add to tabs if not already there
      if (!openTabs.find(tab => tab.path === filePath)) {
        const fileName = filePath.split('/').pop();
        openTabs = [...openTabs, { path: filePath, name: fileName }];
      }
      activeTab = filePath;
    }
  });

  function switchTab(tabPath) {
    activeTab = tabPath;
    fetchFileDiff(tabPath);
  }

  function closeTab(tabPath, event) {
    event.stopPropagation();
    openTabs = openTabs.filter(tab => tab.path !== tabPath);

    // If closing active tab, switch to another
    if (activeTab === tabPath && openTabs.length > 0) {
      switchTab(openTabs[0].path);
    } else if (openTabs.length === 0) {
      activeTab = null;
      diffData = null;
    }
  }

  function getFileIcon(fileName) {
    const ext = fileName.split('.').pop();
    const iconMap = {
      js: '📄',
      ts: '📘',
      svelte: '🔶',
      json: '📋',
      md: '📝',
      css: '🎨',
      html: '🌐',
      sh: '⚙️',
      env: '🔧'
    };
    return iconMap[ext] || '📄';
  }
</script>

<div class="diff-viewer">
  <!-- Editor Tabs -->
  {#if openTabs.length > 0}
    <div class="editor-tabs">
      {#each openTabs as tab (tab.path)}
        <div class="editor-tab" class:active={activeTab === tab.path}>
          <button class="tab-label" onclick={() => switchTab(tab.path)}>
            <span>{getFileIcon(tab.name)}</span>
            <span>{tab.name}</span>
          </button>
          <button class="tab-close" onclick={e => closeTab(tab.path, e)}>×</button>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Diff Content -->
  <div class="diff-container">
    {#if loading}
      <div class="loading-state">
        <div class="spinner"></div>
        <div>Loading diff...</div>
      </div>
    {:else if error}
      <div class="error-state">
        <div>⚠️ Error loading diff</div>
        <div class="error-message">{error}</div>
      </div>
    {:else if !diffData}
      <div class="empty-state">
        <div>📄</div>
        <div>No file selected</div>
        <div class="empty-hint">Select a file from the sidebar to view changes</div>
      </div>
    {:else}
      <!-- Diff Header -->
      <div class="diff-header">
        <div class="diff-file-path">{diffData.filePath}</div>
        <div class="diff-stats">
          <span class="stat-add">+{diffData.stats.additions}</span>
          <span class="stat-remove">-{diffData.stats.deletions}</span>
        </div>
      </div>

      <!-- Diff View -->
      <div class="diff-view">
        {#if diffData.hunks.length === 0}
          <div class="no-changes">
            <div>No changes in this file</div>
          </div>
        {:else}
          {#each diffData.hunks as hunk, idx (idx)}
            <div class="diff-chunk">
              <div class="chunk-header">{hunk.header}</div>
              <div class="diff-lines">
                {#each hunk.lines as line, lineIdx (lineIdx)}
                  <div class="diff-row {line.type}">
                    <div class="line-number">{lineIdx + 1}</div>
                    <div class="line-content">{line.content}</div>
                  </div>
                {/each}
              </div>
            </div>
          {/each}
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .diff-viewer {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--bg);
  }

  .editor-tabs {
    background: var(--surface-2);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    padding: 0 1rem;
    gap: 0.5rem;
    min-height: 42px;
  }

  .editor-tab {
    background: transparent;
    border-bottom: 2px solid transparent;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    position: relative;
  }

  .editor-tab.active {
    border-bottom-color: var(--accent);
  }

  .editor-tab:hover {
    background: rgba(88, 166, 255, 0.1);
  }

  .tab-label {
    padding: 0.5rem 0.5rem 0.5rem 1rem;
    background: none;
    border: none;
    color: var(--muted);
    cursor: pointer;
    font-family: monospace;
    font-size: 0.8rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
  }

  .editor-tab.active .tab-label {
    color: var(--text);
  }

  .tab-close {
    background: none;
    border: none;
    color: var(--muted);
    cursor: pointer;
    padding: 0.5rem 1rem 0.5rem 0.5rem;
    font-size: 1.2rem;
    line-height: 1;
    opacity: 0.6;
    transition: opacity 0.2s;
  }

  .editor-tab.active .tab-close {
    color: var(--text);
  }

  .tab-close:hover {
    opacity: 1;
  }

  .diff-container {
    flex: 1;
    overflow-y: auto;
    background: var(--bg);
  }

  .loading-state,
  .error-state,
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 2rem;
    text-align: center;
    color: var(--muted);
    font-size: 0.9rem;
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin-bottom: 1rem;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .error-state {
    color: var(--error);
  }

  .error-message {
    font-size: 0.8rem;
    margin-top: 0.5rem;
    opacity: 0.8;
  }

  .empty-state div:first-child {
    font-size: 3rem;
    margin-bottom: 1rem;
  }

  .empty-hint {
    font-size: 0.75rem;
    margin-top: 0.5rem;
    opacity: 0.6;
  }

  .diff-header {
    background: var(--surface-2);
    padding: 0.75rem 1.5rem;
    border-bottom: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .diff-file-path {
    font-family: monospace;
    font-size: 0.85rem;
    color: var(--accent);
  }

  .diff-stats {
    font-size: 0.8rem;
    display: flex;
    gap: 1rem;
  }

  .stat-add {
    color: var(--success);
  }

  .stat-remove {
    color: var(--error);
  }

  .diff-view {
    font-family: 'SF Mono', monospace;
    font-size: 0.8rem;
    line-height: 1.5;
  }

  .no-changes {
    padding: 2rem;
    text-align: center;
    color: var(--muted);
  }

  .diff-chunk {
    margin: 1.5rem 0;
  }

  .chunk-header {
    background: var(--surface-2);
    color: var(--muted);
    padding: 0.4rem 1rem;
    font-size: 0.75rem;
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
  }

  .diff-lines {
    display: table;
    width: 100%;
    border-collapse: collapse;
  }

  .diff-row {
    display: table-row;
  }

  .line-number {
    display: table-cell;
    width: 50px;
    padding: 0.15rem 0.75rem;
    text-align: right;
    color: var(--muted);
    user-select: none;
    background: var(--bg);
    border-right: 1px solid var(--border);
    font-size: 0.75rem;
  }

  .line-content {
    display: table-cell;
    padding: 0.15rem 1rem;
    white-space: pre;
    overflow-x: auto;
  }

  .diff-row.add .line-number {
    background: var(--success-subtle);
  }

  .diff-row.add .line-content {
    background: var(--success-subtle);
    color: var(--text);
  }

  .diff-row.remove .line-number {
    background: var(--error-subtle);
  }

  .diff-row.remove .line-content {
    background: var(--error-subtle);
    color: var(--text);
  }

  .diff-row.context .line-content {
    color: var(--muted);
  }

  ::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }

  ::-webkit-scrollbar-track {
    background: var(--bg);
  }

  ::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 5px;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: var(--muted);
  }
</style>
