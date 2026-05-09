<script>
  import { onMount, onDestroy } from 'svelte';
  import { createPageApi } from '../apiClient.js';
  import { renderMarkdown } from '../utils/markdown.js';
  import { PageLayout, PageHeader } from '../components/layout/index.js';
  import { ToolbarButton, EmptyState } from '../components/ui/index.js';
  const { api, abort: abortRequests } = createPageApi();

  let config = $state({ autoDiscover: true, basePath: '', projects: [] });
  let loading = $state(true);
  let discovering = $state(false);
  let error = $state(null);
  // null = unknown (still loading), true/false = checked. Drives the
  // AI Summary button: when false, we disable it instead of letting the
  // user click into a guaranteed 503.
  let insightsAvailable = $state(null);

  // Edit/Add state
  let editingProject = $state(null); // null = list view, 'new' = add, or project object = edit
  let formData = $state({
    name: '',
    path: '',
    enabled: true,
    ignorePatterns: ['node_modules', '.git', 'dist', 'build']
  });

  onMount(() => {
    loadConfig();
    checkInsights();
  });

  async function checkInsights() {
    try {
      const data = await api.get('/insights/status', { silent: true });
      insightsAvailable = data?.available === true;
    } catch {
      insightsAvailable = false;
    }
  }

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
      const data = await api.post('/projects/discover', {
        basePath: config.basePath,
        autoRegister: true
      });
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
    healthNarratives = {
      ...healthNarratives,
      [projectName]: { loading: true, content: null, error: null }
    };
    try {
      const result = await api.post(
        '/insights/generate/project-health',
        { projectName },
        // silent=true: the page renders its own inline error state via
        // healthNarratives[name].error, and a 503 here is expected when
        // RAVEN_INSIGHTS_DISABLED=1. Without this, every click on a disabled
        // backend writes a duplicate row to the error log.
        { timeout: 120000, silent: true }
      );
      healthNarratives = {
        ...healthNarratives,
        [projectName]: {
          loading: false,
          content: result?.content || 'No data available',
          error: null
        }
      };
    } catch (err) {
      healthNarratives = {
        ...healthNarratives,
        [projectName]: { loading: false, content: null, error: friendlyError(err.message) }
      };
    }
  }

  // The apiClient throws "API error (503): {raw json body}". When the body
  // is the structured insights-disabled response, surface its `message`
  // instead of dumping JSON in the UI; otherwise return the original.
  function friendlyError(raw) {
    const m = raw?.match(/^API error \(\d+\): (\{.*\})$/);
    if (m) {
      try {
        const body = JSON.parse(m[1]);
        if (body?.message) return body.message;
      } catch {
        // fall through
      }
    }
    return raw;
  }

  function _formatBytes(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
</script>

<PageLayout>
  {#if editingProject}
    <!-- Edit/Add Form -->
    <div class="flex items-center gap-3 mb-6">
      <button onclick={cancelEdit} class="text-sm text-accent hover:underline">
        ← Back to Projects
      </button>
    </div>

    <div class="bg-surface border border-border rounded-lg p-5 max-w-[36rem]">
      <h3 class="text-xs font-semibold text-muted uppercase tracking-wide mb-5">
        {editingProject === 'new' ? 'Add Project' : `Edit: ${formData.name}`}
      </h3>

      <div class="space-y-4">
        <div>
          <label class="block text-sm text-muted mb-1">
            Project Name
            <input
              type="text"
              bind:value={formData.name}
              placeholder="my-project"
              class="w-full px-3 py-1.5 mt-1 bg-canvas border border-border rounded text-sm font-mono text-body focus:outline-none focus:border-accent"
            />
          </label>
        </div>

        <div>
          <label class="block text-sm text-muted mb-1">
            Project Path
            <input
              type="text"
              bind:value={formData.path}
              placeholder="/home/user/projects/my-project"
              disabled={editingProject !== 'new'}
              class="w-full px-3 py-1.5 mt-1 bg-canvas border border-border rounded text-sm font-mono text-body focus:outline-none focus:border-accent disabled:opacity-50"
            />
          </label>
        </div>

        <div>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" bind:checked={formData.enabled} class="accent-success" />
            <span class="text-sm text-body">Enable monitoring</span>
          </label>
        </div>

        <div>
          <label class="block text-sm text-muted mb-1"
            >Ignore Patterns (one per line)
            <textarea
              value={formData.ignorePatterns.join('\n')}
              oninput={e =>
                (formData.ignorePatterns = e.target.value.split('\n').filter(p => p.trim()))}
              rows="4"
              class="w-full px-3 py-1.5 bg-canvas border border-border rounded text-sm font-mono text-body focus:outline-none focus:border-accent"
            ></textarea>
          </label>
        </div>

        <div class="flex gap-2 pt-3 border-t border-border">
          <ToolbarButton variant="primary" onClick={saveProject}>
            {editingProject === 'new' ? 'Add Project' : 'Save Changes'}
          </ToolbarButton>
          <ToolbarButton onClick={cancelEdit}>Cancel</ToolbarButton>
        </div>
      </div>
    </div>
  {:else}
    <PageHeader title="Projects" description="Manage which projects Raven monitors">
      {#snippet actions()}
        <div class="flex gap-2">
          <ToolbarButton onClick={discoverProjects} disabled={discovering}
            >{discovering ? 'Discovering...' : 'Discover'}</ToolbarButton
          >
          <ToolbarButton variant="primary" onClick={startAdd}>+ Add</ToolbarButton>
        </div>
      {/snippet}
    </PageHeader>

    {#if loading}
      <div class="space-y-3">
        {#each Array(3) as _, i (i)}
          <div class="h-20 bg-surface border border-border rounded-lg animate-pulse"></div>
        {/each}
      </div>
    {:else if error}
      <EmptyState size="compact" title={error}>
        {#snippet actions()}
          <ToolbarButton variant="primary" onClick={loadConfig}>Retry</ToolbarButton>
        {/snippet}
      </EmptyState>
    {:else if config.projects.length === 0}
      <EmptyState size="compact" title="No projects configured">
        {#snippet actions()}
          <ToolbarButton variant="primary" onClick={discoverProjects}
            >Discover Projects</ToolbarButton
          >
        {/snippet}
      </EmptyState>
    {:else}
      <div class="bg-surface border border-border rounded-lg">
        <div class="divide-y divide-[var(--border)]">
          {#each config.projects as project (project.name)}
            <div
              class="px-5 py-4 flex flex-wrap items-center gap-x-4 gap-y-2"
              class:opacity-50={!project.enabled}
            >
              <span
                class="w-2 h-2 rounded-full flex-shrink-0 {project.enabled
                  ? 'bg-success'
                  : 'bg-muted'}"
              ></span>
              <div class="flex-1 min-w-[12rem]">
                <div class="text-sm font-mono font-semibold text-body truncate">
                  {project.name}
                </div>
                <div class="text-xs text-muted truncate">{project.path}</div>
              </div>
              <div
                class="text-xs text-muted font-mono flex-shrink-0 text-right leading-tight"
                title={project.firstSeenAt
                  ? `First seen ${new Date(project.firstSeenAt).toLocaleDateString()}` +
                    (project.lastSeenAt
                      ? ` · last ${new Date(project.lastSeenAt).toLocaleDateString()}`
                      : '')
                  : ''}
              >
                <div>
                  {(
                    project.lifetimeEventCount ??
                    project.eventCount ??
                    project.event_count ??
                    0
                  ).toLocaleString()} events
                </div>
                {#if (project.eventCount ?? 0) > 0 && (project.lifetimeEventCount ?? 0) > (project.eventCount ?? 0)}
                  <div class="text-[10px] text-muted/70">
                    {project.eventCount.toLocaleString()} in last 7d
                  </div>
                {:else if (project.lifetimeEventCount ?? 0) > 0 && (project.eventCount ?? 0) === 0}
                  <div class="text-[10px] text-muted/70">none in last 7d</div>
                {/if}
              </div>
              <div class="flex flex-wrap gap-2 flex-shrink-0">
                <button
                  onclick={() => getProjectHealth(project.name)}
                  disabled={healthNarratives[project.name]?.loading || insightsAvailable === false}
                  title={insightsAvailable === false
                    ? 'Local-LLM insights are off. Restart Raven without RAVEN_INSIGHTS_DISABLED=1 to enable.'
                    : ''}
                  class="px-2 py-1 bg-accent text-canvas rounded text-xs font-sans hover:bg-accent-strong transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {healthNarratives[project.name]?.loading ? 'Analyzing...' : 'AI Summary'}
                </button>
                <button
                  onclick={() => toggleProject(project)}
                  class="px-2 py-1 rounded text-xs font-sans transition-colors {project.enabled
                    ? 'bg-success-subtle text-success border border-success'
                    : 'bg-surface-2 text-muted border border-border'}"
                >
                  {project.enabled ? 'On' : 'Off'}
                </button>
                <button
                  onclick={() => startEdit(project)}
                  class="px-2 py-1 bg-surface border border-border rounded text-xs font-sans hover:border-accent transition-colors"
                >
                  Edit
                </button>
                <ToolbarButton variant="danger" onClick={() => deleteProject(project.name)}
                  >Remove</ToolbarButton
                >
              </div>
            </div>
            {#if healthNarratives[project.name]?.content}
              <div class="px-5 pb-4 -mt-2">
                <div
                  class="bg-canvas border border-border rounded p-4 text-base text-body font-sans leading-relaxed"
                >
                  <!-- eslint-disable-next-line svelte/no-at-html-tags -- Output sanitized via DOMPurify in renderMarkdown -->
                  {@html renderMarkdown(healthNarratives[project.name].content)}
                </div>
              </div>
            {:else if healthNarratives[project.name]?.error}
              <div class="px-5 pb-4 -mt-2">
                <div class="text-xs text-error">Failed: {healthNarratives[project.name].error}</div>
              </div>
            {/if}
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</PageLayout>
