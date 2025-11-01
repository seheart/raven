<script>
  import { onMount } from 'svelte';
  import FileHistory from './FileHistory.svelte';
  import { logger } from './logger.js';
  import { notifications } from './notificationService.js';
  import { API_CONFIG } from '../config.js';

  const API_BASE = API_CONFIG.API_BASE;

  let files = [];
  let loading = true;
  let expandedFile = null;
  let projects = [];
  let selectedProject = localStorage.getItem('raven-file-browser-project') || '';
  let loadingProjects = true;

  onMount(async () => {
    await loadProjects();
    await loadFiles();
  });

  async function loadProjects() {
    try {
      loadingProjects = true;
      const response = await fetch(`${API_BASE}/projects`);
      if (!response.ok) {
        throw new Error(`Failed to load projects: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      projects = data.projects || [];
      loadingProjects = false;
    } catch (error) {
      logger.error('Failed to load projects:', error);
      notifications.error(`Failed to load projects: ${error.message || 'Network error'}`, {
        title: 'File Browser Error'
      });
      projects = [];
      loadingProjects = false;
    }
  }

  async function loadFiles() {
    try {
      loading = true;
      const url = selectedProject
        ? `${API_BASE}/tracked-files?project=${selectedProject}`
        : `${API_BASE}/tracked-files`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to load files: ${response.status} ${response.statusText}`);
      }
      files = await response.json();
      loading = false;
    } catch (error) {
      logger.error('Failed to load tracked files:', error);
      notifications.error(`Failed to load tracked files: ${error.message || 'Network error'}`, {
        title: 'File Browser Error',
        message: 'Using fallback data. Check if the Raven backend is running.'
      });
      // Fallback to mock data
      files = [
        'test_workspace/src/example.py',
        'test_workspace/src/example.js',
        'test_workspace/config.json'
      ];
      loading = false;
    }
  }

  async function handleProjectChange(event) {
    try {
      selectedProject = event.target.value;
      localStorage.setItem('raven-file-browser-project', selectedProject);
      expandedFile = null; // Collapse any expanded files when switching projects
      await loadFiles();
    } catch (error) {
      logger.error('Failed to handle project change:', error);
      notifications.error(`Failed to switch projects: ${error.message || 'Network error'}`, {
        title: 'File Browser Error'
      });
    }
  }

  function toggleFileHistory(filepath) {
    if (expandedFile === filepath) {
      expandedFile = null;
    } else {
      expandedFile = filepath;
    }
  }

  function getFileIcon(filepath) {
    if (!filepath || typeof filepath !== 'string') return '📄';
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
    <div class="header-controls">
      {#if !loadingProjects && projects.length > 0}
        <select
          class="project-selector"
          bind:value={selectedProject}
          on:change={handleProjectChange}
          aria-label="Select project"
        >
          <option value="">All Projects (Default)</option>
          {#each projects as project (project.name)}
            <option value={project.name}>{project.name}</option>
          {/each}
        </select>
      {/if}
      <button class="refresh-btn" on:click={loadFiles} disabled={loading} aria-label="Refresh file list">
        <span aria-hidden="true">{loading ? '⟳' : '↻'}</span> Refresh
      </button>
    </div>
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
        <div class="file-container">
          <button
            class="file-item"
            class:expanded={expandedFile === filepath}
            on:click={() => toggleFileHistory(filepath)}
            aria-label="View history for {getFileName(filepath)}"
            aria-expanded={expandedFile === filepath}
          >
            <div class="expand-arrow" aria-hidden="true">{expandedFile === filepath ? '▼' : '▶'}</div>
            <div class="file-icon" aria-hidden="true">{getFileIcon(filepath)}</div>
            <div class="file-info">
              <div class="file-name">{getFileName(filepath)}</div>
              <div class="file-path">{getFilePath(filepath)}</div>
            </div>
            <div class="view-btn" aria-hidden="true">{expandedFile === filepath ? 'Hide' : 'Show'} History</div>
          </button>

          {#if expandedFile === filepath}
            <div class="history-expansion">
              <FileHistory filepath={filepath} inline={true} />
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

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
    gap: 12px;
  }

  h3 {
    margin: 0;
    color: var(--text);
    font-size: 16px;
    font-family: var(--mono);
    font-weight: 600;
  }

  .header-controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .project-selector {
    background: var(--surface-2);
    color: var(--text);
    border: 1px solid var(--border);
    padding: 6px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    font-family: var(--mono);
    transition: all 0.2s;
    min-width: 150px;
  }

  .project-selector:hover {
    border-color: var(--info);
  }

  .project-selector:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
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
    gap: 8px;
    overflow-y: auto;
  }

  .file-container {
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
    background: var(--surface-2);
  }

  .file-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    background: transparent;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
    border-bottom: 1px solid transparent;
    width: 100%;
    text-align: left;
    font-family: inherit;
    font-size: inherit;
    color: inherit;
  }

  .file-item:hover {
    background: var(--surface);
  }

  .file-item.expanded {
    border-bottom-color: var(--border);
    background: var(--surface);
  }

  .file-item:focus {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .expand-arrow {
    font-size: 10px;
    color: var(--muted);
    width: 12px;
    flex-shrink: 0;
    transition: transform 0.2s;
  }

  .history-expansion {
    padding: 16px;
    background: var(--bg);
    border-top: 1px solid var(--border);
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
