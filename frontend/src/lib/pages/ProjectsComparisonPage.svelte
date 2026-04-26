<script>
  import { onMount, onDestroy } from 'svelte';
  import { logger } from '../logger.js';
  import { formatDateTime as formatDateTimeUtil } from '../timeFormat.js';
  import { PageLayout, PageHeader } from '../components/layout/index.js';
  /**
   * Projects Comparison Page
   * Compare all monitored projects side-by-side
   */
  import { createPageApi } from '../apiClient.js';
  const { api, abort: abortRequests } = createPageApi();

  let projects = $state([]);
  let loading = $state(false);
  let sortBy = $state('activity');
  let sortDesc = $state(true);
  let searchQuery = $state('');
  let filterStatus = $state('all');
  let _autoRefresh = $state(true);

  // Filtered projects
  const filteredProjects = $derived.by(() => {
    let filtered = projects;

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        p =>
          p.name.toLowerCase().includes(query) || (p.path && p.path.toLowerCase().includes(query))
      );
    }

    // Status filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter(p => getActivityStatus(p.last_activity).class === filterStatus);
    }

    return filtered;
  });

  // Sorted projects
  const sortedProjects = $derived.by(() => {
    const sorted = [...filteredProjects];
    sorted.sort((a, b) => {
      let valA, valB;
      switch (sortBy) {
      case 'activity':
        valA = a.last_activity ? new Date(a.last_activity).getTime() : 0;
        valB = b.last_activity ? new Date(b.last_activity).getTime() : 0;
        break;
      case 'events':
        valA = a.total_events || 0;
        valB = b.total_events || 0;
        break;
      case 'files':
        valA = a.file_count || 0;
        valB = b.file_count || 0;
        break;
      case 'agent':
        valA = a.agent_events || 0;
        valB = b.agent_events || 0;
        break;
      case 'name':
        valA = a.name;
        valB = b.name;
        return sortDesc ? valB.localeCompare(valA) : valA.localeCompare(valB);
      case 'path':
        valA = a.path || '';
        valB = b.path || '';
        return sortDesc ? valB.localeCompare(valA) : valA.localeCompare(valB);
      default:
        valA = 0;
        valB = 0;
      }
      return sortDesc ? valB - valA : valA - valB;
    });
    return sorted;
  });

  // Activity status (4 levels)
  function getActivityStatus(lastActivity) {
    if (!lastActivity) return { label: 'Never', class: 'never' };

    const now = new Date();
    const last = new Date(lastActivity);
    const diffMs = now - last;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    // Active: < 1 hour
    if (diffMins < 60) {
      return { label: diffMins < 5 ? 'Active now' : `${diffMins}m ago`, class: 'active' };
    }

    // Recent: < 24 hours
    if (diffHours < 24) {
      return { label: `${diffHours}h ago`, class: 'recent' };
    }

    // Idle: >= 24 hours
    return { label: `${diffDays}d ago`, class: 'idle' };
  }

  function formatDateTime(timestamp) {
    if (!timestamp) return 'Never';
    return formatDateTimeUtil(timestamp);
  }

  function formatNumber(num) {
    return num?.toLocaleString() || '0';
  }

  function handleSort(newSortBy) {
    if (sortBy === newSortBy) {
      sortDesc = !sortDesc;
    } else {
      sortBy = newSortBy;
      sortDesc = true;
    }
  }

  function copyPath(path) {
    navigator.clipboard.writeText(path);
    // Simple feedback - could add toast notification
    logger.debug('Path copied:', path);
  }

  function exportCSV() {
    const headers = [
      'Project',
      'Path',
      'Events',
      'Files',
      'Agent Events',
      'Last Activity',
      'Status'
    ];
    const rows = filteredProjects.map(p => [
      p.name,
      p.path || '',
      p.total_events || 0,
      p.file_count || 0,
      p.agent_events || 0,
      p.last_activity || 'Never',
      getActivityStatus(p.last_activity).label
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `raven-projects-comparison-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function _exportJSON() {
    const exportData = {
      exported_at: new Date().toISOString(),
      total_projects: filteredProjects.length,
      projects: filteredProjects.map(p => ({
        name: p.name,
        path: p.path || '',
        total_events: p.total_events || 0,
        total_errors: p.total_errors || 0,
        last_activity: p.last_activity,
        status: getActivityStatus(p.last_activity).label
      }))
    };

    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `raven-projects-comparison-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function loadProjects() {
    try {
      loading = true;
      const [configData, storageData] = await Promise.all([
        api.get('/projects').catch(() => ({ projects: [] })),
        api.get('/storage/projects').catch(() => [])
      ]);

      const projectsList = configData.projects || [];
      const storageMap = new Map(
        (Array.isArray(storageData) ? storageData : []).map(s => [s.project_name, s])
      );

      projects = projectsList.map(project => {
        const storage = storageMap.get(project.name) || {};
        return {
          ...project,
          total_events: storage.event_count || project.eventCount || project.event_count || 0,
          agent_events: storage.agent_event_count || 0,
          file_count: storage.file_count || 0,
          total_errors: 0,
          last_activity: storage.last_event || null,
          first_activity: storage.first_event || null
        };
      });
    } catch (error) {
      logger.error('Failed to load projects:', error);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadProjects();
  });

  onDestroy(() => abortRequests());
</script>

<PageLayout>
  <PageHeader title="Projects Comparison" description="Compare all monitored projects side-by-side">
    {#snippet actions()}
      <div class="flex items-center gap-3">
        <button
          onclick={exportCSV}
          class="px-3 py-1.5 bg-surface border border-border rounded text-sm font-sans hover:border-accent transition-colors"
        >
          Export
        </button>
        <button
          onclick={() => loadProjects()}
          disabled={loading}
          class="px-3 py-1.5 bg-surface border border-border rounded text-sm font-sans hover:border-accent transition-colors disabled:opacity-50"
        >
          {loading ? '...' : '↻'} Refresh
        </button>
      </div>
    {/snippet}
  </PageHeader>

    <!-- Controls -->
    <div
      class="bg-surface border border-border rounded-lg p-4 mb-6 flex flex-wrap gap-3 items-center"
    >
      <input
        type="text"
        placeholder="Search projects..."
        bind:value={searchQuery}
        class="flex-1 min-w-[200px] px-3 py-1.5 bg-canvas border border-border rounded text-sm font-mono text-body placeholder-[var(--muted)] focus:outline-none focus:border-accent"
      />
      <select
        bind:value={filterStatus}
        class="px-3 py-1.5 bg-canvas border border-border rounded text-sm font-mono text-body cursor-pointer"
      >
        <option value="all">All Status</option>
        <option value="active">Active</option>
        <option value="recent">Recent</option>
        <option value="idle">Idle</option>
        <option value="never">Never</option>
      </select>
      <div class="text-xs text-muted font-mono">
        {filteredProjects.length} of {projects.length} projects
      </div>
    </div>

    {#if loading}
      <div class="bg-surface border border-border rounded-lg p-12 text-center">
        <div
          class="w-12 h-12 border-4 border-border border-t-accent rounded-full animate-spin mx-auto mb-4"
        ></div>
        <p class="text-sm text-muted font-sans">Loading projects...</p>
      </div>
    {:else if projects.length === 0}
      <div class="bg-surface border border-border rounded-lg p-12 text-center">
        <p class="text-sm text-muted mb-2">No projects found</p>
        <p class="text-xs text-muted opacity-80">
          Projects are automatically discovered when you start monitoring code with Raven.
        </p>
      </div>
    {:else if filteredProjects.length === 0}
      <div class="bg-surface border border-border rounded-lg p-12 text-center">
        <p class="text-sm text-muted mb-2">No projects match your filters</p>
        <p class="text-xs text-muted opacity-80">
          Try adjusting your search or status filter.
        </p>
      </div>
    {:else}
      <!-- Table -->
      <div class="bg-surface border border-border rounded-lg overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="bg-canvas border-b border-border">
              <tr class="text-left">
                <th
                  class="px-3 py-2 text-xs font-semibold text-muted uppercase tracking-wide cursor-pointer hover:text-accent transition-colors font-sans"
                  onclick={() => handleSort('name')}
                >
                  Project {sortBy === 'name' ? (sortDesc ? '▼' : '▲') : ''}
                </th>
                <th
                  class="px-3 py-2 text-xs font-semibold text-muted uppercase tracking-wide cursor-pointer hover:text-accent transition-colors font-sans"
                  onclick={() => handleSort('path')}
                >
                  Path {sortBy === 'path' ? (sortDesc ? '▼' : '▲') : ''}
                </th>
                <th
                  class="px-3 py-2 text-xs font-semibold text-muted uppercase tracking-wide cursor-pointer hover:text-accent transition-colors text-right font-sans"
                  onclick={() => handleSort('events')}
                >
                  Events {sortBy === 'events' ? (sortDesc ? '▼' : '▲') : ''}
                </th>
                <th
                  class="px-3 py-2 text-xs font-semibold text-muted uppercase tracking-wide cursor-pointer hover:text-accent transition-colors text-right font-sans"
                  onclick={() => handleSort('files')}
                >
                  Files {sortBy === 'files' ? (sortDesc ? '▼' : '▲') : ''}
                </th>
                <th
                  class="px-3 py-2 text-xs font-semibold text-muted uppercase tracking-wide cursor-pointer hover:text-accent transition-colors text-right font-sans"
                  onclick={() => handleSort('agent')}
                >
                  Agent Events {sortBy === 'agent' ? (sortDesc ? '▼' : '▲') : ''}
                </th>
                <th
                  class="px-3 py-2 text-xs font-semibold text-muted uppercase tracking-wide cursor-pointer hover:text-accent transition-colors font-sans"
                  onclick={() => handleSort('activity')}
                >
                  Last Activity {sortBy === 'activity' ? (sortDesc ? '▼' : '▲') : ''}
                </th>
                <th
                  class="px-3 py-2 text-xs font-semibold text-muted uppercase tracking-wide font-sans"
                >
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {#each sortedProjects as project (project.name)}
                {@const status = getActivityStatus(project.last_activity)}
                <tr class="border-b border-border hover:bg-canvas transition-colors">
                  <td class="px-4 py-3 text-sm font-semibold text-accent font-mono">
                    {project.name}
                  </td>
                  <td class="px-4 py-3">
                    <div class="flex items-center gap-2">
                      <span class="text-sm text-muted font-mono truncate max-w-md">
                        {project.path || 'N/A'}
                      </span>
                      {#if project.path}
                        <button
                          class="text-sm opacity-60 hover:opacity-100 transition-opacity flex-shrink-0"
                          onclick={() => copyPath(project.path)}
                          title="Copy path"
                        >
                        </button>
                      {/if}
                    </div>
                  </td>
                  <td
                    class="px-4 py-3 text-sm font-semibold text-body font-mono text-right"
                  >
                    {formatNumber(project.total_events)}
                  </td>
                  <td class="px-4 py-3 text-sm font-mono text-body text-right">
                    {formatNumber(project.file_count)}
                  </td>
                  <td class="px-4 py-3 text-sm font-mono text-body text-right">
                    {formatNumber(project.agent_events)}
                  </td>
                  <td class="px-4 py-3 text-sm text-body font-mono">
                    {#if project.last_activity}
                      {formatDateTime(project.last_activity)}
                    {:else}
                      Never
                    {/if}
                  </td>
                  <td class="px-4 py-3">
                    <span class="flex items-center gap-2 text-sm font-mono">
                      <span
                        class="w-2 h-2 rounded-full {status.class === 'active'
                          ? 'bg-success'
                          : status.class === 'recent'
                            ? 'bg-info'
                            : status.class === 'idle'
                              ? 'bg-muted'
                              : 'bg-border'}"
                      ></span>
                      <span class="text-body">{status.label}</span>
                    </span>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Summary -->
      <div class="flex gap-6 mt-6 p-4 bg-surface border border-border rounded-lg">
        <div class="text-xs font-mono">
          <strong class="text-accent text-sm">{filteredProjects.length}</strong>
          <span class="text-muted ml-1">displayed</span>
        </div>
        <div class="text-xs font-mono">
          <strong class="text-accent text-sm">
            {formatNumber(filteredProjects.reduce((sum, p) => sum + (p.total_events || 0), 0))}
          </strong>
          <span class="text-muted ml-1">total events</span>
        </div>
        <div class="text-xs font-mono">
          <strong class="text-accent text-sm">
            {formatNumber(filteredProjects.reduce((sum, p) => sum + (p.agent_events || 0), 0))}
          </strong>
          <span class="text-muted ml-1">agent events</span>
        </div>
        <div class="text-xs font-mono">
          <strong class="text-accent text-sm">
            {filteredProjects.filter(
              p =>
                getActivityStatus(p.last_activity).class === 'active' ||
                getActivityStatus(p.last_activity).class === 'recent'
            ).length}
          </strong>
          <span class="text-muted ml-1">active</span>
        </div>
      </div>
    {/if}
</PageLayout>
