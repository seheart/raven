<script>
  import { onMount, onDestroy } from 'svelte';
  import { activeProject, availableProjects, projectStatus } from './projectStore.js';
  import { websocketService } from './websocket.js';

  const API_BASE = 'http://localhost:3030/api';

  let selectedProject = $activeProject;
  let isLoading = $projectStatus.loading;
  let error = $projectStatus.error;

  // Reactive subscriptions
  $: isLoading = $projectStatus.loading;
  $: error = $projectStatus.error;

  /**
   * Fetch the list of available projects from the backend
   */
  async function fetchProjects() {
    try {
      const res = await fetch(`${API_BASE}/projects/list`);
      if (!res.ok) throw new Error('Failed to fetch projects');

      const data = await res.json();
      availableProjects.set(data.projects);
      activeProject.set(data.active);
      selectedProject = data.active;
    } catch (err) {
      console.error('Error fetching projects:', err);
      projectStatus.set({ loading: false, error: err.message });
    }
  }

  /**
   * Refresh/rescan for new projects
   */
  async function refreshProjects() {
    projectStatus.set({ loading: true, error: null });

    try {
      const res = await fetch(`${API_BASE}/projects/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!res.ok) throw new Error('Failed to refresh projects');

      const data = await res.json();
      availableProjects.set(data.projects);
      activeProject.set(data.active);
      selectedProject = data.active;

      console.log(`✅ ${data.message}`);
      projectStatus.set({ loading: false, error: null });
    } catch (err) {
      console.error('Error refreshing projects:', err);
      projectStatus.set({ loading: false, error: err.message });
    }
  }

  /**
   * Switch to a different project
   */
  async function switchProject(event) {
    const newProject = event.target.value;

    // Don't switch if already on this project
    if (newProject === $activeProject) {
      return;
    }

    projectStatus.set({ loading: true, error: null });

    try {
      const res = await fetch(`${API_BASE}/projects/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: newProject })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to switch project');
      }

      const data = await res.json();

      // Update store
      activeProject.set(newProject);
      selectedProject = newProject;
      projectStatus.set({ loading: false, error: null });

      console.log(`✅ Switched to project: ${newProject}`);
    } catch (err) {
      console.error('Error switching project:', err);
      projectStatus.set({ loading: false, error: err.message });

      // Revert selection on error
      selectedProject = $activeProject;
      event.target.value = $activeProject;
    }
  }

  // WebSocket event handler
  const handleProjectSwitched = (data) => {
    console.log('📡 Project switched via WebSocket:', data.project);
    activeProject.set(data.project);
    selectedProject = data.project;
  };

  onMount(() => {
    fetchProjects();

    // Listen for server-side project switches (from other clients or system events)
    websocketService.on('project-switched', handleProjectSwitched);
  });

  onDestroy(() => {
    // Clean up WebSocket listeners
    websocketService.off('project-switched', handleProjectSwitched);
  });
</script>

<div class="project-selector">
  <label for="project-select">Project:</label>
  <select
    id="project-select"
    bind:value={selectedProject}
    on:change={switchProject}
    disabled={isLoading}
    class:loading={isLoading}
  >
    {#each $availableProjects as project}
      <option value={project}>{project}</option>
    {/each}
  </select>
  <button
    class="refresh-btn"
    on:click={refreshProjects}
    disabled={isLoading}
    title="Refresh project list"
  >
    ↻
  </button>
  {#if isLoading}
    <span class="loading-indicator">⏳</span>
  {/if}
  {#if error}
    <span class="error-message" title={error}>⚠️</span>
  {/if}
</div>

<style>
  .project-selector {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }

  label {
    color: var(--muted);
    font-weight: 500;
  }

  select {
    padding: 6px 12px;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    cursor: pointer;
    font-size: 12px;
    font-family: var(--mono);
    transition: all 0.2s;
    min-width: 120px;
  }

  select:hover:not(:disabled) {
    border-color: var(--accent);
    background: var(--surface-2);
  }

  select:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent);
  }

  select:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  select.loading {
    border-color: var(--accent);
  }

  .refresh-btn {
    padding: 6px 10px;
    background: var(--surface);
    color: var(--accent);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .refresh-btn:hover:not(:disabled) {
    border-color: var(--accent);
    background: var(--surface-2);
    transform: rotate(180deg);
  }

  .refresh-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .loading-indicator {
    font-size: 14px;
    animation: spin 1s linear infinite;
  }

  .error-message {
    color: var(--error, #ef4444);
    font-size: 14px;
    cursor: help;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 768px) {
    .project-selector {
      font-size: 11px;
    }

    select {
      min-width: 100px;
      font-size: 11px;
      padding: 4px 8px;
    }

    label {
      display: none;
    }
  }
</style>
