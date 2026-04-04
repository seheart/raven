<script>
  import { onMount } from 'svelte';
  import { api } from '../../apiClient.js';

  let { onFileSelect = () => {} } = $props();

  let modifiedFiles = $state([]);
  let selectedFile = $state(null);
  let loading = $state(true);
  let error = $state(null);

  // Fetch modified files from session
  async function fetchModifiedFiles() {
    try {
      loading = true;
      const response = await api.get('/session/files');
      modifiedFiles = organizeFilesByFolder(response.files || []);
      error = null;
    } catch (err) {
      error = err.message;
      console.error('Failed to fetch modified files:', err);
    } finally {
      loading = false;
    }
  }

  // Organize files into folder structure
  function organizeFilesByFolder(files) {
    const folders = {};
    const seenPaths = new Set(); // Track duplicates

    files.forEach(file => {
      // Skip duplicates (keep only the first occurrence)
      if (seenPaths.has(file.path)) {
        return;
      }
      seenPaths.add(file.path);

      const parts = file.path.split('/');
      const fileName = parts.pop();
      const folderPath = parts.join('/') || 'root';

      if (!folders[folderPath]) {
        folders[folderPath] = {
          name: folderPath,
          files: []
        };
      }

      folders[folderPath].files.push({
        name: fileName,
        path: file.path,
        status: file.status, // 'added', 'modified', 'deleted'
        linesAdded: file.linesAdded || 0,
        linesRemoved: file.linesRemoved || 0
      });
    });

    return Object.values(folders);
  }

  function selectFile(file) {
    selectedFile = file.path;
    onFileSelect(file);
  }

  function getFileIcon(fileName) {
    const ext = fileName.split('.').pop();
    const iconMap = {
      js: '',
      ts: '',
      svelte: '',
      json: '',
      md: '',
      css: '',
      html: '',
      sh: '',
      env: ''
    };
    return iconMap[ext] || '';
  }

  function getStatusBadge(status) {
    const badges = {
      added: { text: 'A', class: 'added' },
      modified: { text: 'M', class: 'modified' },
      deleted: { text: 'D', class: 'deleted' }
    };
    return badges[status] || { text: 'M', class: 'modified' };
  }

  onMount(() => {
    // Stagger initial load by 200ms to reduce simultaneous API calls
    const initialDelay = setTimeout(fetchModifiedFiles, 200);
    // Poll for updates every 5 seconds
    const interval = setInterval(fetchModifiedFiles, 5000);
    return () => {
      clearTimeout(initialDelay);
      clearInterval(interval);
    };
  });
</script>

<div class="file-tree-sidebar">
  <div class="sidebar-header">
    <span>Modified Files</span>
    {#if !loading}
      <span class="file-count"
        >{modifiedFiles.reduce((acc, folder) => acc + folder.files.length, 0)}</span
      >
    {/if}
  </div>

  {#if loading && modifiedFiles.length === 0}
    <div class="loading-state">
      <div class="spinner"></div>
      <div>Loading files...</div>
    </div>
  {:else if error}
    <div class="error-state">
      <div>Error loading files</div>
      <div class="error-message">{error}</div>
    </div>
  {:else if modifiedFiles.length === 0}
    <div class="empty-state">
      <div></div>
      <div>No modified files</div>
      <div class="empty-hint">Files will appear here as the AI makes changes</div>
    </div>
  {:else}
    <div class="file-tree">
      {#each modifiedFiles as folder (folder.name)}
        <div class="tree-folder">
          <div class="folder-name">
            <span class="folder-icon"></span>
            <span>{folder.name === 'root' ? 'Root' : folder.name}</span>
          </div>
          <div class="file-list">
            {#each folder.files as file (file.path)}
              <button
                class="file-item"
                class:modified={file.status === 'modified'}
                class:active={selectedFile === file.path}
                onclick={() => selectFile(file)}
              >
                <div class="file-name">
                  <span>{getFileIcon(file.name)}</span>
                  <span>{file.name}</span>
                </div>
                <span class="file-status {getStatusBadge(file.status).class}">
                  {getStatusBadge(file.status).text}
                </span>
              </button>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .file-tree-sidebar {
    height: 100%;
    background: var(--bg);
    border-right: 1px solid var(--border);
    overflow-y: auto;
    padding: 1rem;
  }

  .sidebar-header {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--muted);
    font-weight: 600;
    margin-bottom: 0.75rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .file-count {
    background: rgba(88, 166, 255, 0.2);
    padding: 0.15rem 0.4rem;
    border-radius: 3px;
    font-size: 0.7rem;
  }

  .loading-state,
  .error-state,
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem 1rem;
    text-align: center;
    color: var(--muted);
    font-size: 0.85rem;
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin-bottom: 0.75rem;
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
    font-size: 0.75rem;
    margin-top: 0.5rem;
    opacity: 0.8;
  }

  .empty-state div:first-child {
    font-size: 2rem;
    margin-bottom: 0.5rem;
  }

  .empty-hint {
    font-size: 0.7rem;
    margin-top: 0.5rem;
    opacity: 0.6;
  }

  .file-tree {
    font-size: 0.85rem;
  }

  .tree-folder {
    margin-bottom: 0.75rem;
  }

  .folder-name {
    color: var(--muted);
    padding: 0.35rem 0.5rem;
    cursor: pointer;
    border-radius: 4px;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    transition: background 0.2s;
  }

  .folder-name:hover {
    background: var(--surface-2);
  }

  .folder-icon {
    font-size: 0.9rem;
  }

  .file-list {
    margin-left: 1.25rem;
    margin-top: 0.25rem;
  }

  .file-item {
    width: 100%;
    padding: 0.35rem 0.5rem;
    margin-bottom: 0.15rem;
    cursor: pointer;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    transition: all 0.2s;
    background: transparent;
    border: none;
    color: var(--text);
    text-align: left;
    font-family: inherit;
    font-size: inherit;
  }

  .file-item:hover {
    background: var(--surface-2);
  }

  .file-item.modified {
    background: rgba(88, 166, 255, 0.05);
    border-left: 2px solid var(--accent);
  }

  .file-item.active {
    background: rgba(88, 166, 255, 0.15);
    border-left: 2px solid var(--accent);
    color: var(--accent);
    font-weight: 600;
  }

  .file-name {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
  }

  .file-status {
    font-size: 0.7rem;
    padding: 0.1rem 0.4rem;
    border-radius: 3px;
    font-weight: 600;
  }

  .file-status.added {
    background: var(--success-subtle);
    color: var(--success);
  }

  .file-status.modified {
    background: var(--accent-subtle);
    color: var(--accent);
  }

  .file-status.deleted {
    background: var(--error-subtle);
    color: var(--error);
  }

  ::-webkit-scrollbar {
    width: 8px;
  }

  ::-webkit-scrollbar-track {
    background: var(--bg);
  }

  ::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 4px;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: var(--muted);
  }
</style>
