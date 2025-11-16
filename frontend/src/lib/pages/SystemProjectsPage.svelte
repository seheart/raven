<script>
  import { logger } from '../logger.js';
  import { onMount } from 'svelte';
  import { api } from '../apiClient.js';
  import { notifications } from '../notificationService.js';

  /**
   * Projects Configuration Page - Comprehensive project management
   * Migrated from old ProjectsConfigPanel.svelte to Svelte 5 + Tailwind
   */

  // State management using Svelte 5 runes
  let config = $state({
    autoDiscover: true,
    basePath: '',
    projects: []
  });
  let discoveredProjects = $state([]);
  let loading = $state(true);
  let discovering = $state(false);
  let error = $state(null);

  // Modal states
  let showAddModal = $state(false);
  let showEditModal = $state(false);
  let showDiscoverModal = $state(false);
  let showConfirmModal = $state(false);
  let selectedProject = $state(null);
  let confirmAction = $state(null);
  let confirmMessage = $state('');

  // Form data
  let formData = $state({
    name: '',
    path: '',
    enabled: true,
    ignorePatterns: ['node_modules/**', 'dist/**', '.git/**'],
    maxFileSize: 10485760, // 10MB
    retentionDays: 30
  });

  onMount(async () => {
    await loadConfig();
  });

  async function loadConfig() {
    try {
      loading = true;
      const data = await api.get(`/projects?_t=${Date.now()}`);
      config = data;
      error = null;
    } catch (error) {
      logger.error('Failed to load projects:', error);
      if (error instanceof TypeError && error.message.includes('fetch')) {
        error = 'Cannot connect to Raven backend. Is it running on http://localhost:3030?';
      } else {
        errorMessage = error.message;
      }
    } finally {
      loading = false;
    }
  }

  async function discoverProjects() {
    try {
      discovering = true;
      const data = await api.post('/projects/discover', { basePath: config.basePath });
      discoveredProjects = data.discovered || [];

      if (discoveredProjects.length > 0) {
        showDiscoverModal = true;
        notifications.success(`Found ${discoveredProjects.length} project(s)`);
      } else {
        notifications.success('No new projects found');
      }
    } catch (error) {
      logger.error('Failed to discover projects:', error);
      if (error instanceof TypeError && error.message.includes('fetch')) {
        notifications.error('Cannot connect to backend. Check if Raven is running.');
      } else {
        notifications.error(`Discovery failed: ${error.message}`);
      }
    } finally {
      discovering = false;
    }
  }

  async function addDiscoveredProject(project) {
    try {
      await api.post('/projects', project);
      await loadConfig();
      discoveredProjects = discoveredProjects.filter(p => p.name !== project.name);
      notifications.success(`Project "${project.name}" added`);
    } catch (error) {
      notifications.error(`Failed to add project: ${error.message}`);
    }
  }

  async function addProject() {
    try {
      await api.post('/projects', formData);
      await loadConfig();
      showAddModal = false;
      resetForm();
      notifications.success(`Project "${formData.name}" added`);
    } catch (error) {
      notifications.error(`Failed to add project: ${error.message}`);
    }
  }

  async function updateProject() {
    try {
      await api.put(`/projects/${selectedProject.id}`, formData);
      await loadConfig();
      showEditModal = false;
      selectedProject = null;
      resetForm();
      notifications.success(`Project "${formData.name}" updated`);
    } catch (error) {
      notifications.error(`Failed to update project: ${error.message}`);
    }
  }

  async function deleteProject(projectName, deleteDb = false) {
    confirmMessage = `Are you sure you want to remove this project?${deleteDb ? ' The database will be deleted.' : ''}`;
    confirmAction = async () => {
      try {
        await api.delete(`/projects/${projectName}?deleteDb=${deleteDb}`);
        await loadConfig();
        notifications.success('Project removed successfully');
      } catch (error) {
        notifications.error(`Failed to delete project: ${error.message}`);
      } finally {
        showConfirmModal = false;
      }
    };
    showConfirmModal = true;
  }

  async function toggleProject(project) {
    try {
      await api.put(`/projects/${project.name}`, { enabled: !project.enabled });
      await loadConfig();
      notifications.success(`Project ${project.enabled ? 'disabled' : 'enabled'}`);
    } catch (error) {
      notifications.error(`Failed to toggle project: ${error.message}`);
    }
  }

  function openAddModal() {
    resetForm();
    showAddModal = true;
  }

  function handleDirectorySelect(event) {
    const files = event.target.files;
    if (files.length > 0) {
      const file = files[0];
      const fullPath = file.webkitRelativePath || file.name;
      const pathParts = fullPath.split('/');
      const directoryName = pathParts[0];

      if (config.basePath && directoryName) {
        const cleanBasePath = config.basePath.endsWith('/')
          ? config.basePath.slice(0, -1)
          : config.basePath;
        formData.path = `${cleanBasePath}/${directoryName}`;
      } else {
        formData.path = directoryName || fullPath;
      }
    }
  }

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
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  function formatNumber(num) {
    return new Intl.NumberFormat().format(num);
  }

  function handleModalKeydown(e) {
    if (e.key === 'Escape') {
      showAddModal = false;
      showEditModal = false;
      showDiscoverModal = false;
      showConfirmModal = false;
    }
  }

  function closeAllModals() {
    showAddModal = false;
    showEditModal = false;
    showDiscoverModal = false;
    showConfirmModal = false;
  }
</script>

<svelte:window onkeydown={handleModalKeydown} />

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-7xl mx-auto">
    <!-- Header -->
    <div class="flex justify-between items-start mb-6">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">Project Configuration</h1>
        <p class="text-base text-[var(--muted)] font-sans">Manage which projects Raven monitors</p>
      </div>
      <div class="flex gap-3">
        <button
          class="px-4 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-sm font-medium text-[var(--text)] hover:bg-[var(--accent)] hover:border-[var(--accent)] hover:text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          onclick={discoverProjects}
          disabled={discovering}
        >
          {discovering ? 'Discovering...' : 'Discover Projects'}
        </button>
        <button
          class="px-4 py-2 bg-[var(--accent)] border border-[var(--accent)] rounded-lg text-sm font-medium text-white hover:opacity-90 transition-opacity duration-200"
          onclick={openAddModal}
        >
          + Add Project
        </button>
      </div>
    </div>

    <!-- Content -->
    {#if loading}
      <!-- Loading skeleton -->
      <div class="space-y-4">
        {#each Array(3) as _, i (i)}
          <div
            class="h-48 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-pulse"
          ></div>
        {/each}
      </div>
    {:else if error}
      <!-- Error state -->
      <div class="text-center p-12 bg-[var(--surface)] border border-[var(--border)] rounded-lg">
        <p class="text-[var(--text)] mb-4">Error: {error}</p>
        <button
          class="px-4 py-2 bg-[var(--accent)] border border-[var(--accent)] rounded-lg text-sm font-medium text-white hover:opacity-90 transition-opacity duration-200"
          onclick={loadConfig}
        >
          Try Again
        </button>
      </div>
    {:else if config.projects.length === 0}
      <!-- Empty state -->
      <div class="text-center p-12 bg-[var(--surface)] border border-[var(--border)] rounded-lg">
        <p class="text-[var(--text)] text-lg mb-2">No projects configured</p>
        <p class="text-[var(--muted)] text-sm mb-6">
          Add a project or discover projects automatically
        </p>
        <button
          class="px-4 py-2 bg-[var(--accent)] border border-[var(--accent)] rounded-lg text-sm font-medium text-white hover:opacity-90 transition-opacity duration-200"
          onclick={discoverProjects}
        >
          Discover Projects
        </button>
      </div>
    {:else}
      <!-- Projects grid -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {#each config.projects as project (project.name)}
          {@const isDisabled = !project.enabled}
          <div
            class="bg-[var(--surface)] border-2 border-[var(--border)] rounded-lg p-6 transition-all duration-200 hover:border-[var(--accent)] hover:shadow-lg"
            class:opacity-60={isDisabled}
          >
            <!-- Project header -->
            <div class="flex justify-between items-start mb-4">
              <div>
                <h3 class="text-lg font-semibold text-[var(--text)] mb-1">{project.name}</h3>
                <span class="text-sm text-[var(--muted)] font-mono">{project.name}</span>
              </div>
              <button
                class="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200"
                class:bg-[var(--accent)]={project.enabled}
                class:text-white={project.enabled}
                class:border-[var(--accent)]={project.enabled}
                class:bg-[var(--surface-2)]={!project.enabled}
                class:text-[var(--text)]={!project.enabled}
                class:border-[var(--border)]={!project.enabled}
                class:border={true}
                onclick={() => toggleProject(project)}
                title={project.enabled ? 'Disable monitoring' : 'Enable monitoring'}
              >
                {project.enabled ? '✓ Enabled' : '○ Disabled'}
              </button>
            </div>

            <!-- Project details -->
            <div class="space-y-3 mb-6">
              <div class="flex gap-4 text-sm">
                <span class="text-[var(--muted)] min-w-[100px] font-medium">Path:</span>
                <span class="text-[var(--text)] font-mono break-all">{project.path}</span>
              </div>
              <div class="flex gap-4 text-sm">
                <span class="text-[var(--muted)] min-w-[100px] font-medium">Database:</span>
                <span class="text-[var(--text)] font-mono">
                  {formatBytes(project.dbSize)} ({formatNumber(project.eventCount)} events)
                </span>
              </div>
              {#if project.ignorePatterns && project.ignorePatterns.length > 0}
                <div class="flex gap-4 text-sm">
                  <span class="text-[var(--muted)] min-w-[100px] font-medium">Ignore Patterns:</span
                  >
                  <span class="text-[var(--text)]">{project.ignorePatterns.join(', ')}</span>
                </div>
              {/if}
            </div>

            <!-- Project footer -->
            <div class="flex gap-3 pt-6 border-t border-[var(--border)]">
              <button
                class="px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-sm font-medium text-[var(--text)] hover:bg-[var(--accent)] hover:border-[var(--accent)] hover:text-white transition-all duration-200"
                onclick={() => openEditModal(project)}
              >
                Edit
              </button>
              <button
                class="px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-sm font-medium text-[var(--text)] hover:bg-[var(--warning)] hover:border-[var(--warning)] hover:text-white transition-all duration-200"
                onclick={() => deleteProject(project.name, false)}
              >
                Remove
              </button>
              <button
                class="px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-sm font-medium text-[var(--danger)] hover:bg-[var(--danger)] hover:border-[var(--danger)] hover:text-white transition-all duration-200"
                onclick={() => deleteProject(project.name, true)}
              >
                Delete DB
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<!-- Add/Edit Project Modal -->
{#if showAddModal || showEditModal}
  <div
    class="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50"
    onclick={closeAllModals}
    onkeydown={e => e.key === 'Escape' && closeAllModals()}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div
      class="bg-[var(--bg)] border border-[var(--border)] rounded-lg max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto shadow-2xl"
      onclick={e => e.stopPropagation()}
      onkeydown={e => e.stopPropagation()}
      role="button"
      tabindex="0"
    >
      <!-- Modal header -->
      <div class="flex justify-between items-center p-6 border-b border-[var(--border)]">
        <h3 class="text-xl font-semibold text-[var(--text)]">
          {showAddModal ? 'Add New Project' : 'Edit Project'}
        </h3>
        <button
          class="text-[var(--muted)] hover:text-[var(--text)] text-3xl w-8 h-8 flex items-center justify-center"
          onclick={closeAllModals}
        >
          ×
        </button>
      </div>

      <!-- Modal body -->
      <div class="p-6 space-y-4">
        <!-- Project Name -->
        <div>
          <label for="project-name" class="block text-sm font-medium text-[var(--text)] mb-2">
            Project Name
          </label>
          <input
            id="project-name"
            type="text"
            bind:value={formData.name}
            placeholder="My Project"
            class="w-full px-4 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-[var(--text)] text-sm font-mono focus:outline-none focus:border-[var(--accent)]"
          />
        </div>

        <!-- Project Path -->
        <div>
          <label for="project-path" class="block text-sm font-medium text-[var(--text)] mb-2">
            Project Path
          </label>
          <div class="flex gap-3">
            <input
              id="project-path"
              type="text"
              bind:value={formData.path}
              placeholder="/path/to/project"
              disabled={showEditModal}
              class="flex-1 px-4 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-[var(--text)] text-sm font-mono focus:outline-none focus:border-[var(--accent)] disabled:opacity-60 disabled:cursor-not-allowed"
            />
            {#if !showEditModal}
              <button
                type="button"
                class="px-4 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-sm font-semibold text-[var(--text)] hover:bg-[var(--accent)] hover:border-[var(--accent)] hover:text-white transition-all duration-200 whitespace-nowrap"
                onclick={browseDirectory}
                title="Browse for directory"
              >
                Browse
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
            class="hidden"
            onchange={handleDirectorySelect}
          />
        </div>

        <!-- Enable monitoring -->
        <div>
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              bind:checked={formData.enabled}
              class="w-4 h-4 accent-[var(--accent)]"
            />
            <span class="text-sm font-medium text-[var(--text)]">Enable monitoring</span>
          </label>
        </div>

        <!-- Ignore Patterns -->
        <div>
          <label for="ignore-patterns" class="block text-sm font-medium text-[var(--text)] mb-2">
            Ignore Patterns (one per line)
          </label>
          <textarea
            id="ignore-patterns"
            value={formData.ignorePatterns.join('\n')}
            oninput={e =>
              (formData.ignorePatterns = e.target.value.split('\n').filter(p => p.trim()))}
            placeholder="node_modules/**&#10;dist/**&#10;.git/**"
            rows="4"
            class="w-full px-4 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-[var(--text)] text-sm font-mono focus:outline-none focus:border-[var(--accent)]"
          ></textarea>
        </div>

        <!-- Max File Size and Retention Days -->
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label for="max-file-size" class="block text-sm font-medium text-[var(--text)] mb-2">
              Max File Size (bytes)
            </label>
            <input
              id="max-file-size"
              type="number"
              bind:value={formData.maxFileSize}
              class="w-full px-4 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-[var(--text)] text-sm font-mono focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
          <div>
            <label for="retention-days" class="block text-sm font-medium text-[var(--text)] mb-2">
              Retention Days
            </label>
            <input
              id="retention-days"
              type="number"
              bind:value={formData.retentionDays}
              min="1"
              max="365"
              class="w-full px-4 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-[var(--text)] text-sm font-mono focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
        </div>
      </div>

      <!-- Modal footer -->
      <div class="flex justify-end gap-3 p-6 border-t border-[var(--border)]">
        <button
          class="px-4 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-sm font-medium text-[var(--text)] hover:bg-[var(--muted)] hover:border-[var(--muted)] transition-all duration-200"
          onclick={closeAllModals}
        >
          Cancel
        </button>
        <button
          class="px-4 py-2 bg-[var(--accent)] border border-[var(--accent)] rounded-lg text-sm font-medium text-white hover:opacity-90 transition-opacity duration-200"
          onclick={showAddModal ? addProject : updateProject}
        >
          {showAddModal ? 'Add Project' : 'Save Changes'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Discover Projects Modal -->
{#if showDiscoverModal}
  <div
    class="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50"
    onclick={() => (showDiscoverModal = false)}
    onkeydown={e => e.key === 'Escape' && (showDiscoverModal = false)}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div
      class="bg-[var(--bg)] border border-[var(--border)] rounded-lg max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto shadow-2xl"
      onclick={e => e.stopPropagation()}
      onkeydown={e => e.stopPropagation()}
      role="button"
      tabindex="0"
    >
      <!-- Modal header -->
      <div class="flex justify-between items-center p-6 border-b border-[var(--border)]">
        <h3 class="text-xl font-semibold text-[var(--text)]">Discovered Projects</h3>
        <button
          class="text-[var(--muted)] hover:text-[var(--text)] text-3xl w-8 h-8 flex items-center justify-center"
          onclick={() => (showDiscoverModal = false)}
        >
          ×
        </button>
      </div>

      <!-- Modal body -->
      <div class="p-6">
        {#if discoveredProjects.length === 0}
          <p class="text-center text-[var(--muted)] py-8">
            No new projects found in {config.basePath}
          </p>
        {:else}
          <div class="space-y-3">
            {#each discoveredProjects as project (project.name)}
              <div
                class="flex justify-between items-center p-4 bg-[var(--surface)] border border-[var(--border)] rounded-lg"
              >
                <div class="flex-1">
                  <div class="font-semibold text-[var(--text)]">{project.name}</div>
                  <div class="text-sm text-[var(--muted)] font-mono">{project.path}</div>
                </div>
                <button
                  class="px-4 py-2 bg-[var(--accent)] border border-[var(--accent)] rounded-lg text-sm font-medium text-white hover:opacity-90 transition-opacity duration-200"
                  onclick={() => addDiscoveredProject(project)}
                >
                  + Add
                </button>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Modal footer -->
      <div class="flex justify-end p-6 border-t border-[var(--border)]">
        <button
          class="px-4 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-sm font-medium text-[var(--text)] hover:bg-[var(--muted)] hover:border-[var(--muted)] transition-all duration-200"
          onclick={() => (showDiscoverModal = false)}
        >
          Close
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Confirmation Modal -->
{#if showConfirmModal}
  <div
    class="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50"
    onclick={() => (showConfirmModal = false)}
    onkeydown={e => e.key === 'Escape' && (showConfirmModal = false)}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div
      class="bg-[var(--bg)] border border-[var(--border)] rounded-lg max-w-md w-full mx-4 shadow-2xl"
      onclick={e => e.stopPropagation()}
      onkeydown={e => e.stopPropagation()}
      role="button"
      tabindex="0"
    >
      <!-- Modal header -->
      <div class="flex justify-between items-center p-6 border-b border-[var(--border)]">
        <h3 class="text-xl font-semibold text-[var(--text)]">Confirm Action</h3>
        <button
          class="text-[var(--muted)] hover:text-[var(--text)] text-3xl w-8 h-8 flex items-center justify-center"
          onclick={() => (showConfirmModal = false)}
        >
          ×
        </button>
      </div>

      <!-- Modal body -->
      <div class="p-6">
        <p class="text-[var(--text)] text-base leading-relaxed">{confirmMessage}</p>
      </div>

      <!-- Modal footer -->
      <div class="flex justify-end gap-3 p-6 border-t border-[var(--border)]">
        <button
          class="px-4 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-sm font-medium text-[var(--text)] hover:bg-[var(--muted)] hover:border-[var(--muted)] transition-all duration-200"
          onclick={() => (showConfirmModal = false)}
        >
          Cancel
        </button>
        <button
          class="px-4 py-2 bg-[var(--danger)] border border-[var(--danger)] rounded-lg text-sm font-medium text-white hover:opacity-90 transition-opacity duration-200"
          onclick={confirmAction}
        >
          Confirm
        </button>
      </div>
    </div>
  </div>
{/if}
