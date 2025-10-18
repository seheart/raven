<script>
  import { invoke } from '@tauri-apps/api/core';
  import { onMount } from 'svelte';
  import FileHistory from './FileHistory.svelte';

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
      files = await invoke('get_tracked_files');
      loading = false;
    } catch (error) {
      console.error('Failed to load tracked files:', error);
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
    return filepath.split('/').pop();
  }

  function getFilePath(filepath) {
    const parts = filepath.split('/');
    return parts.slice(0, -1).join('/');
  }
</script>

<div class="file-browser">
  <div class="browser-header">
    <h3>📂 Tracked Files</h3>
    <button class="refresh-btn" on:click={loadFiles} disabled={loading}>
      {loading ? '⟳' : '↻'} Refresh
    </button>
  </div>

  {#if loading}
    <div class="loading">Loading files...</div>
  {:else if files.length === 0}
    <div class="empty">
      <p>No files tracked yet</p>
      <p class="hint">Edit files in test_workspace/ to start tracking</p>
    </div>
  {:else}
    <div class="file-list">
      {#each files as filepath (filepath)}
        <div class="file-item" on:click={() => viewFileHistory(filepath)}>
          <div class="file-icon">{getFileIcon(filepath)}</div>
          <div class="file-info">
            <div class="file-name">{getFileName(filepath)}</div>
            <div class="file-path">{getFilePath(filepath)}</div>
          </div>
          <div class="view-btn">View History →</div>
        </div>
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
  }

  .browser-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border);
  }

  h3 {
    margin: 0;
    color: var(--text);
    font-size: 12px;
  }

  .refresh-btn {
    background: var(--surface-2);
    color: var(--info);
    border: 1px solid var(--info);
    padding: 6px 0.8rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
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
    padding: 12px;
    color: var(--muted);
  }

  .empty {
    text-align: center;
    padding: 16px 1rem;
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
    gap: 0.5rem;
    overflow-y: auto;
  }

  .file-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px;
    background: var(--surface-2);
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .file-item:hover {
    background: var(--surface-2);
  }

  .file-icon {
    font-size: 12px;
  }

  .file-info {
    flex: 1;
    min-width: 0;
  }

  .file-name {
    color: var(--text);
    font-weight: 500;
    font-family: 'Courier New', monospace;
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
  }

  .view-btn {
    color: var(--info);
    font-size: 11px;
    white-space: nowrap;
  }
</style>
