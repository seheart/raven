<script>
  import { onMount, onDestroy } from 'svelte';
  import { createPageApi } from '../apiClient.js';
  const { api, abort: abortRequests } = createPageApi();

  let config = $state({ autoDiscover: true, basePath: '', projects: [] });
  let loading = $state(true);
  let discovering = $state(false);
  let error = $state(null);

  // Edit/Add state
  let editingProject = $state(null); // null = list view, 'new' = add, or project object = edit
  let formData = $state({
    name: '',
    path: '',
    enabled: true,
    ignorePatterns: ['node_modules', '.git', 'dist', 'build']
  });

  onMount(() => loadConfig());

  onDestroy(() => abortRequests());

  async function loadConfig() {
    try {
      loading = true;
      const data = await api.get(`/projects?_t=${Date.now()}`);
      config = data;
      error = null;
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  async function discoverProjects() {
    try {
      discovering = true;
      const data = await api.post('/projects/discover', { basePath: config.basePath, autoRegister: true });
      const count = data.discovered?.length || 0;
      if (count > 0) await loadConfig();
      alert(count > 0 ? `Found and added ${count} project(s)` : 'No new projects found');
    } catch (err) {
      alert('Discovery failed: ' + err.message);
    } finally {
      discovering = false;
    }
  }

  function startEdit(project) {
    editingProject = project;
    formData = {
      name: project.name,
      path: project.path,
      enabled: project.enabled,
      ignorePatterns: project.ignorePatterns || ['node_modules', '.git', 'dist', 'build']
    };
  }

  function startAdd() {
    editingProject = 'new';
    formData = {
      name: '',
      path: '',
      enabled: true,
      ignorePatterns: ['node_modules', '.git', 'dist', 'build']
    };
  }

  function cancelEdit() {
    editingProject = null;
  }

  async function saveProject() {
    try {
      if (editingProject === 'new') {
        await api.post('/projects', formData);
      } else {
        await api.put(`/projects/${editingProject.id || editingProject.name}`, formData);
      }
      editingProject = null;
      await loadConfig();
    } catch (err) {
      alert('Failed to save: ' + err.message);
    }
  }

  async function deleteProject(name) {
    if (!confirm(`Remove project "${name}"?`)) return;
    try {
      await api.delete(`/projects/${name}`);
      await loadConfig();
    } catch (err) {
      alert('Failed to remove: ' + err.message);
    }
  }

  async function toggleProject(project) {
    try {
      await api.put(`/projects/${project.name}`, { enabled: !project.enabled });
      await loadConfig();
    } catch (err) {
      alert('Failed to toggle: ' + err.message);
    }
  }

  let healthNarratives = $state({});

  async function getProjectHealth(projectName) {
    healthNarratives = { ...healthNarratives, [projectName]: { loading: true, content: null, error: null } };
    try {
      const result = await api.post('/insights/generate/project-health', { projectName }, { timeout: 120000 });
      healthNarratives = { ...healthNarratives, [projectName]: { loading: false, content: result?.content || 'No data available', error: null } };
    } catch (err) {
      healthNarratives = { ...healthNarratives, [projectName]: { loading: false, content: null, error: err.message } };
    }
  }

  function renderMarkdown(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/^### (.+)$/gm, '<h4 class="font-semibold text-[var(--text-heading)] mt-3 mb-1">$1</h4>')
      .replace(/^## (.+)$/gm, '<h3 class="font-semibold text-[var(--text-heading)] mt-3 mb-1">$1</h3>')
      .replace(/\*\*(.+?)\*\*/g, '<strong class="text-[var(--text-heading)]">$1</strong>')
      .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 bg-[var(--bg)] rounded text-[var(--accent)] text-[11px] font-mono">$1</code>')
      .replace(/^- (.+)$/gm, '<div class="flex gap-2 ml-2"><span class="text-[var(--muted)]">-</span><span>$1</span></div>')
      .replace(/\n/g, '<br>');
  }

  function _formatBytes(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-6xl mx-auto">
    {#if editingProject}
      <!-- Edit/Add Form -->
      <div class="flex items-center gap-3 mb-6">
        <button onclick={cancelEdit} class="text-sm text-[var(--accent)] hover:underline">
          ← Back to Projects
        </button>
      </div>

      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 max-w-xl">
        <h2 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-5">
          {editingProject === 'new' ? 'Add Project' : `Edit: ${formData.name}`}
        </h2>

        <div class="space-y-4">
          <div>
            <label class="block text-sm text-[var(--muted)] mb-1">
              Project Name
              <input
                type="text"
                bind:value={formData.name}
                placeholder="my-project"
                class="w-full px-3 py-1.5 mt-1 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
              />
            </label>
          </div>

          <div>
            <label class="block text-sm text-[var(--muted)] mb-1">
              Project Path
              <input
                type="text"
                bind:value={formData.path}
                placeholder="/home/user/projects/my-project"
                disabled={editingProject !== 'new'}
                class="w-full px-3 py-1.5 mt-1 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)] disabled:opacity-50"
              />
            </label>
          </div>

          <div>
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                bind:checked={formData.enabled}
                class="accent-[var(--success)]"
              />
              <span class="text-sm text-[var(--text)]">Enable monitoring</span>
            </label>
          </div>

          <div>
            <label class="block text-sm text-[var(--muted)] mb-1"
              >Ignore Patterns (one per line)
            <textarea
              value={formData.ignorePatterns.join('\n')}
              oninput={e =>
                (formData.ignorePatterns = e.target.value.split('\n').filter(p => p.trim()))}
              rows="4"
              class="w-full px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
            ></textarea>
            </label>
          </div>

          <div class="flex gap-2 pt-3 border-t border-[var(--border)]">
            <button
              onclick={saveProject}
              class="px-3 py-1.5 bg-[var(--accent)] border border-[var(--accent)] rounded text-sm font-sans text-white hover:opacity-90 transition-opacity"
            >
              {editingProject === 'new' ? 'Add Project' : 'Save Changes'}
            </button>
            <button
              onclick={cancelEdit}
              class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans text-[var(--muted)] hover:border-[var(--accent)] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    {:else}
      <!-- Project List -->
      <div class="flex justify-between items-start mb-6">
        <div>
          <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">Projects</h1>
          <p class="text-sm text-[var(--muted)] font-sans">Manage which projects Raven monitors</p>
        </div>
        <div class="flex gap-2">
          <button
            onclick={discoverProjects}
            disabled={discovering}
            class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors disabled:opacity-50"
          >
            {discovering ? 'Discovering...' : 'Discover'}
          </button>
          <button
            onclick={startAdd}
            class="px-3 py-1.5 bg-[var(--accent)] border border-[var(--accent)] rounded text-sm font-sans text-white hover:opacity-90 transition-opacity"
          >
            + Add
          </button>
        </div>
      </div>

      {#if loading}
        <div class="space-y-3">
          {#each Array(3) as _, i (i)}
            <div
              class="h-20 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-pulse"
            ></div>
          {/each}
        </div>
      {:else if error}
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-8 text-center">
          <p class="text-sm text-[var(--error)] mb-3">{error}</p>
          <button
            onclick={loadConfig}
            class="px-3 py-1.5 bg-[var(--accent)] text-white rounded text-sm">Retry</button
          >
        </div>
      {:else if config.projects.length === 0}
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-8 text-center">
          <p class="text-sm text-[var(--muted)] mb-3">No projects configured</p>
          <button
            onclick={discoverProjects}
            class="px-3 py-1.5 bg-[var(--accent)] text-white rounded text-sm"
            >Discover Projects</button
          >
        </div>
      {:else}
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg">
          <div class="divide-y divide-[var(--border)]">
            {#each config.projects as project (project.name)}
              <div class="px-5 py-4 flex items-center gap-4" class:opacity-50={!project.enabled}>
                <span
                  class="w-2 h-2 rounded-full flex-shrink-0 {project.enabled
                    ? 'bg-[var(--success)]'
                    : 'bg-[var(--muted)]'}"
                ></span>
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-mono font-semibold text-[var(--text)]">
                    {project.name}
                  </div>
                  <div class="text-xs text-[var(--muted)] truncate">{project.path}</div>
                </div>
                <div class="text-xs text-[var(--muted)] font-mono flex-shrink-0">
                  {project.eventCount || project.event_count || 0} events
                </div>
                <div class="flex gap-2 flex-shrink-0">
                  <button
                    onclick={() => getProjectHealth(project.name)}
                    disabled={healthNarratives[project.name]?.loading}
                    class="px-2 py-1 bg-[var(--accent)] text-white rounded text-xs font-sans hover:opacity-90 transition-opacity disabled:opacity-40"
                  >
                    {healthNarratives[project.name]?.loading ? 'Analyzing...' : 'AI Summary'}
                  </button>
                  <button
                    onclick={() => toggleProject(project)}
                    class="px-2 py-1 rounded text-xs font-sans transition-colors {project.enabled
                      ? 'bg-[var(--success-subtle)] text-[var(--success)] border border-[var(--success)]'
                      : 'bg-[var(--surface-2)] text-[var(--muted)] border border-[var(--border)]'}"
                  >
                    {project.enabled ? 'On' : 'Off'}
                  </button>
                  <button
                    onclick={() => startEdit(project)}
                    class="px-2 py-1 bg-[var(--surface)] border border-[var(--border)] rounded text-xs font-sans hover:border-[var(--accent)] transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onclick={() => deleteProject(project.name)}
                    class="px-2 py-1 bg-[var(--surface)] border border-[var(--error)] rounded text-xs font-sans text-[var(--error)] hover:bg-[var(--error-subtle)] transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </div>
              {#if healthNarratives[project.name]?.content}
                <div class="px-5 pb-4 -mt-2">
                  <!-- eslint-disable-next-line svelte/no-at-html-tags -- Content is HTML-escaped in renderMarkdown -->
                  <div class="bg-[var(--bg)] border border-[var(--border)] rounded p-3 text-sm text-[var(--text)] font-sans leading-relaxed">
                    {@html renderMarkdown(healthNarratives[project.name].content)}
                  </div>
                </div>
              {:else if healthNarratives[project.name]?.error}
                <div class="px-5 pb-4 -mt-2">
                  <div class="text-xs text-[var(--error)]">Failed: {healthNarratives[project.name].error}</div>
                </div>
              {/if}
            {/each}
          </div>
        </div>
      {/if}
    {/if}
  </div>
</div>
