<script>
  import { onMount, onDestroy } from 'svelte';
  import { createPageApi } from '../apiClient.js';
  import { renderMarkdown } from '../utils/markdown.js';
  import { PageLayout, PageHeader } from '../components/layout/index.js';
  import { ToolbarButton, EmptyState, DataFetchError } from '../components/ui/index.js';
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
      // Distinguish "fetch failed" from "available: false" — leave the flag
      // null so the AI Summary buttons render as "Unknown" with a retry,
      // not permanently disabled.
      insightsAvailable = null;
    }
  }

  onDestroy(() => {
    abortRequests();
    if (elapsedTimer) clearInterval(elapsedTimer);
  });

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
  // Project profile data, lazy-loaded when the user clicks AI Summary so
  // we don't hammer du/find/git for every project on page load. Keyed by
  // project name; null while loading, populated when the fetch returns.
  let projectProfiles = $state({});
  // Live elapsed counter for the active AI Summary run. The earlier
  // "Analyzing..." button label was too quiet for a 30-90s wait — users
  // clicked and didn't know whether anything was happening. Same fix
  // pattern as /insights: a loud banner + ticking counter + scroll-to.
  let activeProjectName = $state(null);
  let activeStartedAt = $state(0);
  let elapsedTick = $state(0);
  let elapsedTimer = null;
  let highlightProjectName = $state(null);

  const elapsed = $derived.by(() => {
    void elapsedTick;
    if (!activeStartedAt) return 0;
    return Math.max(0, Math.floor((Date.now() - activeStartedAt) / 1000));
  });

  async function loadProjectProfile(projectName) {
    if (projectProfiles[projectName]?.data || projectProfiles[projectName]?.loading) return;
    projectProfiles = { ...projectProfiles, [projectName]: { loading: true } };
    try {
      const data = await api.get(`/projects/${encodeURIComponent(projectName)}/profile`, {
        silent: true
      });
      projectProfiles = { ...projectProfiles, [projectName]: { loading: false, data } };
    } catch (err) {
      projectProfiles = {
        ...projectProfiles,
        [projectName]: { loading: false, error: err?.message || String(err) }
      };
    }
  }

  async function getProjectHealth(projectName) {
    healthNarratives = {
      ...healthNarratives,
      [projectName]: { loading: true, content: null, error: null }
    };
    // Kick off the profile load in parallel — it's fast (~100-300ms) and
    // gives the user instant context (stack, dates, top files) while the
    // LLM is still writing.
    loadProjectProfile(projectName);
    activeProjectName = projectName;
    activeStartedAt = Date.now();
    elapsedTick = 0;
    elapsedTimer = setInterval(() => (elapsedTick += 1), 1000);
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
      // Highlight the row so the user can find what just landed; auto-scroll
      // it into view since the projects list can be long.
      highlightProjectName = projectName;
      setTimeout(() => {
        if (highlightProjectName === projectName) highlightProjectName = null;
      }, 3000);
      requestAnimationFrame(() => {
        const el = document.getElementById(`project-summary-${projectName}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    } catch (err) {
      healthNarratives = {
        ...healthNarratives,
        [projectName]: { loading: false, content: null, error: friendlyError(err.message) }
      };
    } finally {
      if (elapsedTimer) {
        clearInterval(elapsedTimer);
        elapsedTimer = null;
      }
      activeProjectName = null;
      activeStartedAt = 0;
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

  function timeAgo(iso) {
    if (!iso) return null;
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 60_000) return 'just now';
    if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
    if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
    if (ms < 31 * 86_400_000) return `${Math.floor(ms / 86_400_000)}d ago`;
    if (ms < 365 * 86_400_000) return `${Math.floor(ms / (30 * 86_400_000))}mo ago`;
    return `${(ms / (365 * 86_400_000)).toFixed(1)}y ago`;
  }

  function shortRemote(url) {
    if (!url) return null;
    // git@github.com:foo/bar.git → foo/bar
    // https://github.com/foo/bar.git → foo/bar
    const m = url.match(/[:/]([^:/]+\/[^/]+?)(?:\.git)?$/);
    return m ? m[1] : url;
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

    {#if activeProjectName}
      <!-- Loud feedback while AI Summary is generating. The earlier
           button-label-only "Analyzing..." was too quiet for a 30-90s
           wait. Same pattern as /insights: animated dot, what's being
           written, copy explaining the wait, live elapsed counter. -->
      <div
        class="bg-accent-subtle border border-accent rounded-lg p-4 mb-4 flex items-center gap-3"
        role="status"
        aria-live="polite"
      >
        <div class="flex-shrink-0 relative w-3 h-3">
          <span class="absolute inset-0 bg-accent rounded-full animate-ping opacity-60"></span>
          <span class="absolute inset-0 bg-accent rounded-full"></span>
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-sm font-semibold text-accent">
            Raven is writing the project summary for
            <span class="font-mono">{activeProjectName}</span>…
          </div>
          <div class="text-xs text-muted mt-0.5">
            Local AI is reading the project's recent activity. Usually 30 seconds to a minute,
            sometimes longer on the first run while the model loads. The summary will appear under
            the project row when it's ready.
          </div>
        </div>
        <div class="text-xs font-mono text-muted tabular-nums flex-shrink-0">
          {elapsed}s
        </div>
      </div>
    {/if}

    {#if loading}
      <div class="space-y-3">
        {#each Array(3) as _, i (i)}
          <div class="h-20 bg-surface border border-border rounded-lg animate-pulse"></div>
        {/each}
      </div>
    {:else if error}
      <DataFetchError
        endpoint="/api/projects"
        message="Failed to load projects"
        hint={error}
        onRetry={loadConfig}
      />
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
            <!-- Wrap project row + its expanded summary in a single child of
                 divide-y, so the divider line only appears BETWEEN projects,
                 not between a project and its own AI summary card. -->
            <div class:opacity-50={!project.enabled}>
              <div class="px-5 py-4 flex flex-wrap items-center gap-x-4 gap-y-2">
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
                    disabled={healthNarratives[project.name]?.loading ||
                      insightsAvailable === false}
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
              {#if projectProfiles[project.name]?.data || projectProfiles[project.name]?.loading || healthNarratives[project.name]?.content || healthNarratives[project.name]?.error}
                {@const prof = projectProfiles[project.name]?.data}
                <div id="project-summary-{project.name}" class="px-5 pb-4 -mt-2 space-y-3">
                  <!-- Profile card: deterministic metadata (stack, dates,
                       top files) computed without the LLM. Lands fast so
                       the user sees something immediately while the AI
                       Summary is still being written. -->
                  {#if prof}
                    <div
                      class="bg-canvas border border-border rounded p-4 text-sm text-body font-sans"
                    >
                      <!-- Stack pills row: runtime + frameworks + package manager -->
                      {#if prof.runtime || prof.frameworks?.length || prof.package_manager}
                        <div class="flex flex-wrap items-center gap-1.5 mb-3">
                          {#if prof.runtime}
                            <span
                              class="px-2 py-0.5 rounded text-[11px] font-mono bg-accent text-canvas font-semibold"
                              >{prof.runtime}</span
                            >
                          {/if}
                          {#each prof.frameworks ?? [] as fw (fw)}
                            <span
                              class="px-2 py-0.5 rounded text-[11px] font-mono bg-surface border border-border text-body"
                              >{fw}</span
                            >
                          {/each}
                          {#if prof.package_manager}
                            <span class="text-[10px] font-mono text-muted ml-1"
                              >via {prof.package_manager}</span
                            >
                          {/if}
                        </div>
                      {/if}

                      <!-- Languages: top 6 with file count -->
                      {#if prof.languages?.length}
                        <div class="mb-3">
                          <div
                            class="text-[10px] font-mono uppercase tracking-wide text-muted mb-1.5"
                          >
                            Languages
                          </div>
                          <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono">
                            {#each prof.languages.slice(0, 6) as lang (lang.name)}
                              <span>
                                <span class="text-body">{lang.name}</span>
                                <span class="text-muted ml-1">{lang.files}</span>
                                {#if lang.percent >= 5}
                                  <span class="text-muted/60 ml-0.5">· {lang.percent}%</span>
                                {/if}
                              </span>
                            {/each}
                          </div>
                        </div>
                      {/if}

                      <!-- Dates row: created / last touched / git stats -->
                      <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-1 text-xs mb-3">
                        {#if prof.git?.first_commit_at}
                          <div>
                            <div class="text-[10px] font-mono uppercase tracking-wide text-muted">
                              First commit
                            </div>
                            <div
                              class="font-mono text-body"
                              title={new Date(prof.git.first_commit_at).toLocaleString()}
                            >
                              {timeAgo(prof.git.first_commit_at)}
                            </div>
                          </div>
                        {:else if prof.filesystem?.created_at}
                          <div>
                            <div class="text-[10px] font-mono uppercase tracking-wide text-muted">
                              Created
                            </div>
                            <div
                              class="font-mono text-body"
                              title={new Date(prof.filesystem.created_at).toLocaleString()}
                            >
                              {timeAgo(prof.filesystem.created_at)}
                            </div>
                          </div>
                        {/if}

                        <div>
                          <div class="text-[10px] font-mono uppercase tracking-wide text-muted">
                            Last touched
                          </div>
                          <div
                            class="font-mono text-body"
                            title={new Date(
                              prof.raven?.last_seen_at ||
                                prof.git?.last_commit_at ||
                                prof.filesystem?.modified_at ||
                                Date.now()
                            ).toLocaleString()}
                          >
                            {timeAgo(
                              prof.raven?.last_seen_at ||
                                prof.git?.last_commit_at ||
                                prof.filesystem?.modified_at
                            ) || '—'}
                          </div>
                        </div>

                        {#if prof.git?.commits_total}
                          <div>
                            <div class="text-[10px] font-mono uppercase tracking-wide text-muted">
                              Commits
                            </div>
                            <div class="font-mono text-body">
                              {prof.git.commits_total.toLocaleString()}
                              {#if prof.git.branch}
                                <span class="text-muted ml-1">· {prof.git.branch}</span>
                              {/if}
                            </div>
                          </div>
                        {/if}

                        {#if prof.git?.remote}
                          <div class="min-w-0">
                            <div class="text-[10px] font-mono uppercase tracking-wide text-muted">
                              Remote
                            </div>
                            <div class="font-mono text-body truncate" title={prof.git.remote}>
                              {shortRemote(prof.git.remote)}
                            </div>
                          </div>
                        {/if}
                      </div>

                      <!-- Last commit subject — a tiny human signal that
                           the project is actually being worked on -->
                      {#if prof.git?.last_commit_subject}
                        <div class="text-xs mb-3">
                          <span class="text-muted">Latest:</span>
                          <span class="font-mono text-body italic">
                            "{prof.git.last_commit_subject}"
                          </span>
                        </div>
                      {/if}

                      <!-- Top edited + key files in a two-column block -->
                      <div class="grid sm:grid-cols-2 gap-4">
                        {#if prof.top_edited_files?.length}
                          <div>
                            <div
                              class="text-[10px] font-mono uppercase tracking-wide text-muted mb-1"
                            >
                              Hot files (last 7d)
                            </div>
                            <ul class="space-y-0.5 text-xs font-mono">
                              {#each prof.top_edited_files as f (f.filepath)}
                                <li class="flex justify-between gap-2">
                                  <span class="text-body truncate" title={f.filepath}>
                                    {f.filepath}
                                  </span>
                                  <span class="text-muted tabular-nums flex-shrink-0"
                                    >{f.edits}</span
                                  >
                                </li>
                              {/each}
                            </ul>
                          </div>
                        {/if}
                        {#if prof.key_files?.length}
                          <div>
                            <div
                              class="text-[10px] font-mono uppercase tracking-wide text-muted mb-1"
                            >
                              Key files
                            </div>
                            <div class="flex flex-wrap gap-1.5 text-[11px] font-mono">
                              {#each prof.key_files as kf (kf.name)}
                                <span
                                  class="px-1.5 py-0.5 rounded bg-surface border border-border text-muted"
                                  >{kf.name}</span
                                >
                              {/each}
                            </div>
                          </div>
                        {/if}
                      </div>
                    </div>
                  {:else if projectProfiles[project.name]?.loading}
                    <div
                      class="bg-canvas border border-border rounded p-4 text-xs text-muted font-mono italic"
                    >
                      Reading project metadata…
                    </div>
                  {:else if projectProfiles[project.name]?.error}
                    <div
                      class="bg-canvas border border-border rounded p-4 text-xs text-error font-mono"
                    >
                      Couldn't read project metadata: {projectProfiles[project.name].error}
                    </div>
                  {/if}

                  <!-- AI Summary card — appears when LLM run completes. -->
                  {#if healthNarratives[project.name]?.content}
                    <div
                      class="bg-canvas border rounded p-4 text-base text-body font-sans leading-relaxed transition-colors {highlightProjectName ===
                      project.name
                        ? 'border-accent shadow-[0_0_0_1px_var(--accent)]'
                        : 'border-border'}"
                    >
                      <!-- eslint-disable-next-line svelte/no-at-html-tags -- Output sanitized via DOMPurify in renderMarkdown -->
                      {@html renderMarkdown(healthNarratives[project.name].content)}
                    </div>
                  {:else if healthNarratives[project.name]?.error}
                    <div class="text-xs text-error font-mono">
                      Failed: {healthNarratives[project.name].error}
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</PageLayout>
