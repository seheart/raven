<script>
  import { onMount } from 'svelte';
  import FileHistory from './FileHistory.svelte';
  import { logger } from './logger.js';

  let files = [];
  let loading = true;
  let selectedFile = null;
  let showHistory = false;

  onMount(async () => {
    await loadFiles();
  });

  async function loadFiles() {
    try {
      loading = true;
      const response = await fetch('http://localhost:3030/api/tracked-files');
      files = await response.json();
      loading = false;
    } catch (error) {
      logger.error('Failed to load tracked files:', error);
      // Fallback to mock data
      files = [
        'test_workspace/src/example.py',
        'test_workspace/src/example.js',
        'test_workspace/config.json'
      ];
      loading = false;
    }
  }

  function viewFileHistory(filepath) {
    selectedFile = filepath;
    showHistory = true;
  }

  function closeHistory() {
    showHistory = false;
    selectedFile = null;
  }

  function getFileIcon(filepath) {
    if (!filepath) return '📄';
    if (filepath.endsWith('.py')) return '🐍';
    if (filepath.endsWith('.js') || filepath.endsWith('.jsx')) return '📜';
    if (filepath.endsWith('.ts') || filepath.endsWith('.tsx')) return '📘';
    if (filepath.endsWith('.json')) return '📋';
    if (filepath.endsWith('.md')) return '📝';
    if (filepath.endsWith('.rs')) return '🦀';
    if (filepath.endsWith('.toml')) return '⚙️';
    return '📄';
  }

  function getFileName(filepath) {
    return filepath?.split('/')?.pop() || '';
  }

  function getFilePath(filepath) {
    const parts = filepath?.split('/') || [];
    return parts.slice(0, -1).join('/');
  }
</script>

<div class="file-browser" role="region" aria-label="File browser">
  <div class="browser-header">
    <h3 id="files-heading"><span aria-hidden="true">📂</span> Tracked Files</h3>
    <button class="refresh-btn" on:click={loadFiles} disabled={loading} aria-label="Refresh file list">
      <span aria-hidden="true">{loading ? '⟳' : '↻'}</span> Refresh
    </button>
  </div>

  {#if loading}
    <div class="loading" role="status" aria-live="polite" aria-busy="true">Loading files...</div>
  {:else if files.length === 0}
    <div class="empty" role="status">
      <p>No files tracked yet</p>
      <p class="hint">Edit files in test_workspace/ to start tracking</p>
    </div>
  {:else}
    <div class="file-list" role="list" aria-labelledby="files-heading">
      {#each files || [] as filepath (filepath)}
        <button class="file-item" on:click={() => viewFileHistory(filepath)} role="listitem" aria-label="View history for {getFileName(filepath)}">
          <div class="file-icon" aria-hidden="true">{getFileIcon(filepath)}</div>
          <div class="file-info">
            <div class="file-name">{getFileName(filepath)}</div>
            <div class="file-path">{getFilePath(filepath)}</div>
          </div>
          <div class="view-btn" aria-hidden="true">View History →</div>
        </button>
      {/each}
    </div>
  {/if}
</div>

{#if showHistory && selectedFile}
  <FileHistory filepath={selectedFile} onClose={closeHistory} />
{/if}

<style>
  .file-browser {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 24px;
    position: relative;
  }

  .browser-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border);
  }

  h3 {
    margin: 0;
    color: var(--text);
    font-size: 16px;
    font-family: var(--mono);
    font-weight: 600;
  }

  .refresh-btn {
    background: var(--surface-2);
    color: var(--info);
    border: 1px solid var(--info);
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    transition: all 0.2s;
  }

  .refresh-btn:hover:not(:disabled) {
    background: var(--info);
    color: white;
  }

  .refresh-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .loading {
    text-align: center;
    padding: 24px;
    color: var(--muted);
    font-family: var(--mono);
    font-size: 13px;
  }

  .empty {
    text-align: center;
    padding: 32px 16px;
    color: var(--muted);
  }

  .empty p {
    margin: 0.5rem 0;
  }

  .hint {
    font-size: 12px;
    color: var(--muted);
  }

  .file-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow-y: auto;
  }

  .file-item {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 16px;
    background: var(--surface-2);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
    border: 1px solid transparent;
    width: 100%;
    text-align: left;
    font-family: inherit;
    font-size: inherit;
    color: inherit;
  }

  .file-item:hover {
    background: var(--surface);
    border-color: var(--accent);
    transform: translateX(2px);
  }

  .file-icon {
    font-size: 20px;
  }

  .file-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .file-name {
    color: var(--text);
    font-weight: 500;
    font-family: 'Courier New', monospace;
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-path {
    color: var(--muted);
    font-size: 11px;
    font-family: 'Courier New', monospace;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 2px;
  }

  .view-btn {
    color: var(--info);
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
    padding: 4px 8px;
    border-radius: 4px;
    transition: all 0.2s;
  }

  .file-item:hover .view-btn {
    background: var(--info);
    color: white;
  }
</style>
