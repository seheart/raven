<script>
  import { onMount } from 'svelte';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import { showSuccess, showError } from './stores/notifications.js';
  import { logger } from './logger.js';

  const API_BASE = import.meta.env.VITE_API_BASE || '/api';

  let config = {
    autoDiscover: true,
    basePath: '',
    projects: []
  };
  let discoveredProjects = [];
  let loading = true;
  let discovering = false;
  let error = null;

  // Modal states
  let showAddModal = false;
  let showEditModal = false;
  let showDiscoverModal = false;
  let showConfirmModal = false;
  let selectedProject = null;
  let confirmAction = null;
  let confirmMessage = '';

  // Form data
  let formData = {
    name: '',
    path: '',
    enabled: true,
    ignorePatterns: ['node_modules/**', 'dist/**', '.git/**'],
    maxFileSize: 10485760, // 10MB
    retentionDays: 30
  };

  onMount(async () => {
    await loadConfig();
  });

  async function loadConfig() {
    try {
      loading = true;
      // Add cache-busting to avoid stale redirects
      const response = await fetch(`${API_BASE}/projects?_t=${Date.now()}`, {
        cache: 'no-store'
      });

      config = await response.json();
      error = null;
    } catch (err) {
      logger.error('Failed to load projects:', err);
      // Provide specific error messages for network issues
      if (err instanceof TypeError && err.message.includes('fetch')) {
        error = 'Cannot connect to Raven backend. Is it running on http://localhost:3030?';
      } else {
        error = err.message;
      }
    } finally {
      loading = false;
    }
  }

  async function discoverProjects() {
    try {
      discovering = true;
      const response = await fetch(`${API_BASE}/projects/discover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ basePath: config.basePath })
      });

        const errorData = await response.json().catch(() => ({}));
      }

      const data = await response.json();
      discoveredProjects = data.discovered;

      if (discoveredProjects.length > 0) {
        showDiscoverModal = true;
        showSuccess(`Found ${discoveredProjects.length} project(s)`);
      } else {
        showSuccess('No new projects found');
      }
    } catch (err) {
      logger.error('Failed to discover projects:', err);
      // Provide specific error messages
      if (err instanceof TypeError && err.message.includes('fetch')) {
        showError('Cannot connect to backend. Check if Raven is running.');
      } else {
        showError(`Discovery failed: ${err.message}`);
      }
    } finally {
      discovering = false;
    }
  }

  async function addDiscoveredProject(project) {
    try {
      const response = await fetch(`${API_BASE}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project)
      });

        const error = await response.json();
        throw new Error(error.error || 'Failed to add project');
      }

      await loadConfig();
      discoveredProjects = discoveredProjects.filter(p => p.name !== project.name);
      showSuccess(`Project "${project.name}" added`);
    } catch (err) {
      showError(`Failed to add project: ${err.message}`);
    }
  }

  async function addProject() {
    try {
      const response = await fetch(`${API_BASE}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

        const error = await response.json();
        throw new Error(error.error || 'Failed to add project');
      }

      await loadConfig();
      showAddModal = false;
      resetForm();
      showSuccess(`Project "${formData.name}" added`);
    } catch (err) {
      showError(`Failed to add project: ${err.message}`);
    }
  }

  async function updateProject() {
    try {
      const response = await fetch(`${API_BASE}/projects/${selectedProject.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

        const error = await response.json();
        throw new Error(error.error || 'Failed to update project');
      }

      await loadConfig();
      showEditModal = false;
      selectedProject = null;
      resetForm();
      showSuccess(`Project "${formData.name}" updated`);
    } catch (err) {
      showError(`Failed to update project: ${err.message}`);
    }
  }

  async function deleteProject(projectName, deleteDb = false) {
    confirmMessage = `Are you sure you want to remove this project?${deleteDb ? ' The database will be deleted.' : ''}`;
    confirmAction = async () => {
      try {
        const response = await fetch(`${API_BASE}/projects/${projectName}?deleteDb=${deleteDb}`, {
          method: 'DELETE'
        });

          const error = await response.json();
          throw new Error(error.error || 'Failed to delete project');
        }

        await loadConfig();
        showSuccess('Project removed successfully');
      } catch (err) {
        showError(`Failed to delete project: ${err.message}`);
      } finally {
        showConfirmModal = false;
      }
    };
    showConfirmModal = true;
  }

  async function toggleProject(project) {
    try {
      const response = await fetch(`${API_BASE}/projects/${project.name}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !project.enabled })
      });


      await loadConfig();
      showSuccess(`Project ${project.enabled ? 'disabled' : 'enabled'}`);
    } catch (err) {
      showError(`Failed to toggle project: ${err.message}`);
    }
  }

  function openAddModal() {
    resetForm();
    showAddModal = true;
  }

  // Handle directory picker
  function handleDirectorySelect(event) {
    const files = event.target.files;
    if (files.length > 0) {
      const file = files[0];
      const fullPath = file.webkitRelativePath || file.name;
      const pathParts = fullPath.split('/');

      // Extract just the directory name
      const directoryName = pathParts[0];

      // Construct absolute path using basePath from config
      if (config.basePath && directoryName) {
        // Remove trailing slash from basePath if present
        const cleanBasePath = config.basePath.endsWith('/') ? config.basePath.slice(0, -1) : config.basePath;
        formData.path = `${cleanBasePath}/${directoryName}`;
      } else {
        // Fallback: just show the directory name if basePath not available
        formData.path = directoryName || fullPath;
      }
    }
  }

  // Trigger directory picker
  function browseDirectory() {
    const input = document.getElementById('project-directory-picker');
    if (input) {
      input.click();
    }
  }

  function openEditModal(project) {
    selectedProject = project;
    formData = {
      name: project.name,
      path: project.path,
      enabled: project.enabled,
      ignorePatterns: project.ignorePatterns || [],
      maxFileSize: project.maxFileSize || 10485760,
      retentionDays: project.retentionDays || 30
    };
    showEditModal = true;
  }

  function resetForm() {
    formData = {
      name: '',
      path: '',
      enabled: true,
      ignorePatterns: ['node_modules/**', 'dist/**', '.git/**'],
      maxFileSize: 10485760,
      retentionDays: 30
    };
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  function formatNumber(num) {
    return new Intl.NumberFormat().format(num);
  }
</script>

<div class="projects-config-panel" role="region" aria-label="Project configuration panel">
  <div class="panel-header">
    <div class="header-left">
      <h2 id="projects-config-heading"><span aria-hidden="true">📂</span> Project Configuration</h2>
      <p class="subtitle">Manage which projects Raven monitors</p>
    </div>
    <div class="header-right" role="toolbar" aria-label="Project configuration actions">
      <button class="btn btn-secondary btn-sm" on:click={discoverProjects} disabled={discovering} aria-label={discovering ? 'Discovering projects' : 'Discover projects automatically'}>
        <span aria-hidden="true">{discovering ? '🔍' : '🔍'}</span> {discovering ? 'Discovering...' : 'Discover Projects'}
      </button>
      <button class="btn btn-primary btn-sm" on:click={openAddModal} aria-label="Add new project">+ Add Project</button>
    </div>
  </div>

  {#if loading}
    <LoadingSkeleton />
  {:else if error}
    <div class="error-state" role="alert">
      <p><span aria-hidden="true">❌</span> Error: {error}</p>
      <button on:click={loadConfig} aria-label="Retry loading configuration">Try Again</button>
    </div>
  {:else}
    {#if config.projects.length === 0}
      <div class="empty-state" role="status">
        <p><span aria-hidden="true">📭</span> No projects configured</p>
        <p class="hint">Add a project or discover projects automatically</p>
        <button class="btn btn-primary btn-sm" on:click={discoverProjects} aria-label="Discover projects automatically"><span aria-hidden="true">🔍</span> Discover Projects</button>
      </div>
    {:else}
      <div class="projects-grid" role="list" aria-labelledby="projects-config-heading">
        {#each config.projects as project (project.name)}
          <div class="project-card" class:disabled={!project.enabled}>
            <div class="project-header">
              <div class="project-info">
                <h3>{project.name}</h3>
                <span class="project-id">{project.name}</span>
              </div>
              <div class="project-actions">
                <button
                  class="btn-toggle"
                  class:active={project.enabled}
                  on:click={() => toggleProject(project)}
                  title={project.enabled ? 'Disable monitoring' : 'Enable monitoring'}
                >
                  {project.enabled ? '✓ Enabled' : '○ Disabled'}
                </button>
              </div>
            </div>

            <div class="project-details">
              <div class="detail-row">
                <span class="label">Path:</span>
                <span class="value mono">{project.path}</span>
              </div>
              <div class="detail-row">
                <span class="label">Database:</span>
                <span class="value mono">
                  {formatBytes(project.dbSize)} ({formatNumber(project.eventCount)} events)
                </span>
              </div>
              {#if project.ignorePatterns && project.ignorePatterns.length > 0}
                <div class="detail-row">
                  <span class="label">Ignore Patterns:</span>
                  <span class="value">{project.ignorePatterns.join(', ')}</span>
                </div>
              {/if}
            </div>

            <div class="project-footer">
              <button class="btn btn-secondary btn-sm" on:click={() => openEditModal(project)}>✏️ Edit</button>
              <button class="btn btn-ghost btn-sm" on:click={() => deleteProject(project.name, false)}>🗑️ Remove</button>
              <button class="btn btn-danger btn-sm" on:click={() => deleteProject(project.name, true)}>🗑️ Delete DB</button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<!-- Add/Edit Project Modal -->
{#if showAddModal || showEditModal}
  <div class="modal-overlay" role="dialog" aria-modal="true" tabindex="-1" on:click={() => { showAddModal = false; showEditModal = false; }} on:keydown={(e) => e.key === 'Escape' && (showAddModal = false, showEditModal = false)}>
    <div class="modal" role="dialog" tabindex="-1" on:click|stopPropagation on:keydown={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <h3>{showAddModal ? 'Add New Project' : 'Edit Project'}</h3>
        <button class="modal-close" on:click={() => { showAddModal = false; showEditModal = false; }}>×</button>
      </div>

      <div class="modal-body">
        <div class="form-group">
          <label for="project-name">Project Name</label>
          <input
            id="project-name"
            type="text"
            bind:value={formData.name}
            placeholder="My Project"
          />
        </div>

        <div class="form-group">
          <label for="project-path">Project Path</label>
          <div class="path-input-group">
            <input
              id="project-path"
              type="text"
              bind:value={formData.path}
              placeholder="/path/to/project"
              disabled={showEditModal}
            />
            {#if !showEditModal}
              <button type="button" class="browse-btn" on:click={browseDirectory} title="Browse for directory">
                📁 Browse
              </button>
            {/if}
          </div>
          <!-- Hidden file input for directory selection -->
          <input
            id="project-directory-picker"
            type="file"
            webkitdirectory
            directory
            multiple
            style="display: none;"
            on:change={handleDirectorySelect}
          />
        </div>

        <div class="form-group">
          <label>
            <input type="checkbox" bind:checked={formData.enabled} />
            Enable monitoring
          </label>
        </div>

        <div class="form-group">
          <label for="ignore-patterns">Ignore Patterns (one per line)</label>
          <textarea
            id="ignore-patterns"
            value={formData.ignorePatterns.join('\n')}
            on:input={(e) => formData.ignorePatterns = e.target.value.split('\n').filter(p => p.trim())}
            placeholder="node_modules/**&#10;dist/**&#10;.git/**"
            rows="4"
          ></textarea>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="max-file-size">Max File Size (bytes)</label>
            <input
              id="max-file-size"
              type="number"
              bind:value={formData.maxFileSize}
            />
          </div>

          <div class="form-group">
            <label for="retention-days">Retention Days</label>
            <input
              id="retention-days"
              type="number"
              bind:value={formData.retentionDays}
              min="1"
              max="365"
            />
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary btn-sm" on:click={() => { showAddModal = false; showEditModal = false; }}>
          Cancel
        </button>
        <button class="btn btn-primary btn-sm" on:click={showAddModal ? addProject : updateProject}>
          {showAddModal ? 'Add Project' : 'Save Changes'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Discover Projects Modal -->
{#if showDiscoverModal}
  <div class="modal-overlay" role="dialog" aria-modal="true" tabindex="-1" on:click={() => showDiscoverModal = false} on:keydown={(e) => e.key === 'Escape' && (showDiscoverModal = false)}>
    <div class="modal" role="dialog" tabindex="-1" on:click|stopPropagation on:keydown={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <h3>🔍 Discovered Projects</h3>
        <button class="modal-close" on:click={() => showDiscoverModal = false}>×</button>
      </div>

      <div class="modal-body">
        {#if discoveredProjects.length === 0}
          <p class="empty-message">No new projects found in {config.basePath}</p>
        {:else}
          <div class="discovered-list">
            {#each discoveredProjects as project (project.name)}
              <div class="discovered-item">
                <div class="discovered-info">
                  <strong>{project.name}</strong>
                  <span class="mono">{project.path}</span>
                </div>
                <button
                  class="btn btn-primary btn-sm"
                  on:click={() => addDiscoveredProject(project)}
                >
                  + Add
                </button>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary btn-sm" on:click={() => showDiscoverModal = false}>Close</button>
      </div>
    </div>
  </div>
{/if}

<!-- Confirmation Modal -->
{#if showConfirmModal}
  <div class="modal-overlay" role="dialog" aria-modal="true" tabindex="-1" on:click={() => showConfirmModal = false} on:keydown={(e) => e.key === 'Escape' && (showConfirmModal = false)}>
    <div class="modal modal-confirm" role="dialog" tabindex="-1" on:click|stopPropagation on:keydown={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <h3>⚠️ Confirm Action</h3>
        <button class="modal-close" on:click={() => showConfirmModal = false}>×</button>
      </div>

      <div class="modal-body">
        <p class="confirm-message">{confirmMessage}</p>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary btn-sm" on:click={() => showConfirmModal = false}>
          Cancel
        </button>
        <button class="btn btn-danger btn-sm" on:click={confirmAction}>
          Confirm
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .projects-config-panel {
    padding: var(--space-lg);
    max-width: 1400px;
    margin: 0 auto;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: var(--space-lg);
  }

  .header-left h2 {
    margin: 0 0 var(--space-sm) 0;
    font-size: 11px;
    color: var(--text);
  }

  .subtitle {
    margin: 0;
    color: var(--muted);
    font-size: 11px;
  }

  .header-right {
    display: flex;
    gap: var(--space-xl);
  }

  .projects-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
    gap: var(--space-lg);
  }

  .project-card {
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-lg);
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .project-card.disabled {
    opacity: 0.6;
  }

  .project-card:hover {
    border-color: var(--accent);
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  }

  .project-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: var(--space-md);
  }

  .project-info h3 {
    margin: 0 0 var(--space-sm) 0;
    font-size: 12px;
    color: var(--text);
  }

  .project-id {
    font-size: 12px;
    color: var(--muted);
    font-family: var(--mono);
  }

  .btn-toggle {
    padding: var(--space-md) var(--space-xl);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 12px;
    cursor: pointer;
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .btn-toggle.active {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }

  .project-details {
    margin-bottom: var(--space-md);
  }

  .detail-row {
    display: flex;
    gap: var(--space-lg);
    margin-bottom: var(--space-lg);
    font-size: 13px;
  }

  .detail-row .label {
    color: var(--muted);
    min-width: 120px;
    font-weight: 500;
  }

  .detail-row .value {
    color: var(--text);
    word-break: break-all;
  }

  .mono {
    font-family: var(--mono);
  }

  .project-footer {
    display: flex;
    gap: var(--space-lg);
    padding-top: var(--space-2xl);
    border-top: 1px solid var(--border);
  }

  /* Button styles removed - using global .btn classes */

  .empty-state, .error-state {
    text-align: center;
    padding: var(--space-lg) var(--space-xl);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .empty-state p, .error-state p {
    margin: var(--space-lg) 0;
    color: var(--text);
  }

  .hint {
    font-size: 13px;
    color: var(--muted);
    margin-bottom: var(--space-md);
  }

  /* Modal Styles */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    max-width: 600px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-lg);
    border-bottom: 1px solid var(--border);
  }

  .modal-header h3 {
    margin: 0;
    font-size: 12px;
    color: var(--text);
  }

  .modal-close {
    background: none;
    border: none;
    font-size: 11px;
    color: var(--muted);
    cursor: pointer;
    padding: 0;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .modal-close:hover {
    color: var(--text);
  }

  .btn-toggle:focus,
  .modal-close:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .modal-body {
    padding: var(--space-lg);
  }

  .form-group {
    margin-bottom: var(--space-md);
  }

  .form-group label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: var(--text);
    margin-bottom: var(--space-md);
  }

  .form-group input[type="text"],
  .form-group input[type="number"],
  .form-group textarea {
    width: 100%;
    padding: var(--space-lg) var(--space-xl);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-size: 13px;
    font-family: var(--mono);
  }

  .form-group input:focus,
  .form-group textarea:focus {
    outline: none;
    border-color: var(--accent);
  }

  .path-input-group {
    display: flex;
    gap: var(--space-lg);
    align-items: stretch;
  }

  .path-input-group input {
    flex: 1;
  }

  .browse-btn {
    padding: var(--space-lg) var(--space-2xl);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-base) var(--ease-smooth);
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  .browse-btn:hover {
    background: var(--accent);
    border-color: var(--accent);
    color: white;
    transform: translateY(-1px);
  }

  .browse-btn:active {
    transform: translateY(0);
  }

  .form-group input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-lg);
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-xl);
    padding: var(--space-lg);
    border-top: 1px solid var(--border);
  }

  .discovered-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
  }

  .discovered-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-xl);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }

  .discovered-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .discovered-info strong {
    color: var(--text);
  }

  .discovered-info span {
    font-size: 12px;
    color: var(--muted);
  }

  .empty-message {
    text-align: center;
    color: var(--muted);
    padding: var(--space-lg);
  }

  .modal-confirm {
    max-width: 500px;
  }

  .confirm-message {
    color: var(--text);
    font-size: 11px;
    line-height: 1.6;
    margin: 0;
  }
</style>
