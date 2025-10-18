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
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid #333;
  }

  h3 {
    margin: 0;
    color: #fff;
    font-size: 1rem;
  }

  .refresh-btn {
    background: #2a2a2a;
    color: #646cff;
    border: 1px solid #646cff;
    padding: 0.4rem 0.8rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.85rem;
  }

  .refresh-btn:hover:not(:disabled) {
    background: #646cff;
    color: white;
  }

  .refresh-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .loading {
    text-align: center;
    padding: 2rem;
    color: #888;
  }

  .empty {
    text-align: center;
    padding: 3rem 1rem;
    color: #666;
  }

  .empty p {
    margin: 0.5rem 0;
  }

  .hint {
    font-size: 0.9rem;
    color: #555;
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
    gap: 1rem;
    padding: 0.75rem;
    background: #2a2a2a;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .file-item:hover {
    background: #333;
  }

  .file-icon {
    font-size: 1.5rem;
  }

  .file-info {
    flex: 1;
    min-width: 0;
  }

  .file-name {
    color: #fff;
    font-weight: 500;
    font-family: 'Courier New', monospace;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-path {
    color: #666;
    font-size: 0.85rem;
    font-family: 'Courier New', monospace;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .view-btn {
    color: #646cff;
    font-size: 0.85rem;
    white-space: nowrap;
  }
</style>
