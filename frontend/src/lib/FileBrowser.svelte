<script>
  import { onMount } from 'svelte';
  import FileHistory from './FileHistory.svelte';
  import PageInfo from './PageInfo.svelte';

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

<div class="file-browser">
  <PageInfo
    title="File Browser"
    description="This is your project file explorer - like Finder or Windows Explorer, but specifically showing **only files that have changed** while Raven is watching. The File Browser displays every file across ALL your monitored projects that has been created, edited, or deleted. Think of it as a filtered view showing 'what actually got modified' rather than every file in your projects."
    keyPoints={[
      '**File Icons** - Different icons for different file types: 🐍 Python (.py), 📜 JavaScript (.js/.jsx), 📘 TypeScript (.ts/.tsx), 📋 JSON, 📝 Markdown (.md), 🦀 Rust (.rs), ⚙️ TOML config files, 📄 Generic files. Makes it easy to spot file types at a glance.',
      '**File Name** - Just the filename itself (like `server.js`), shown in monospace font for easy reading. The file name is clickable.',
      '**File Path** - Shows the directory path where the file lives, displayed below the filename in gray text. Example: test_workspace/backend/src tells you the file is inside that folder structure.',
      '**View History Button** - Click View History → on any file to open a detailed modal showing: Every change event for that file, timestamps of changes, diffs showing what actually changed, who/what modified it (user or AI agent).',
      '**Empty State** - If you see No files tracked yet, it means Raven has not detected any file changes since it started. Try editing a file in one of your monitored projects to populate this list.',
      '**Refresh Button** - Top-right ↻ button reloads the list from the backend. Useful if you suspect Raven missed a change or the list is stale.',
      '**File Order** - Files are NOT sorted alphabetically - they are sorted by most recently modified first. The file you just edited will appear at the top of the list.'
    ]}
    whenToCheck="Use this page to **find which files changed during a session**, **identify frequently edited files** (to understand hotspots in your codebase), or **browse file history** before making more changes to understand recent context."
    warnings={[
      '**No files tracked yet appears** - Raven either: (1) Just started and has not seen changes yet, or (2) Is not watching the correct directories. Check Settings to verify your projects are being monitored. Edit any file to test.',
      '**Deleted files still showing in list** - This is intentional. Raven tracks ALL file events including deletions. If you see a deleted file, it means Raven recorded its deletion. The file history will show the deletion event.',
      '**Very active files might have truncated history** - If a file was edited 1000+ times, Raven might only show the most recent 100-500 events to avoid performance issues. The oldest events may be truncated.',
      '**File path looks incomplete** - Paths are shown relative to the project root. If you see src/lib/utils.js, the full path is project_root/src/lib/utils.js. Raven strips the project path for readability.',
      '**Refresh button stuck/spinning** - Backend might be slow or not responding. Check Status page to verify backend is online. Try refreshing the entire page if button stays spinning more than 10 seconds.'
    ]}
  />

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
      {#each files || [] as filepath (filepath)}
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
