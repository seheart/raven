<script>
  import { logger } from '../logger.js';
  /**
   * Projects Comparison Page
   * Compare all monitored projects side-by-side
   */
  import { api } from '../apiClient.js';

  let projects = $state([]);
  let loading = $state(true);
  let sortBy = $state('activity');
  let sortDesc = $state(true);
  let searchQuery = $state('');
  let filterStatus = $state('all');
  let autoRefresh = $state(true);

  // Filtered projects
  const filteredProjects = $derived.by(() => {
    let filtered = projects;

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        p =>
          p.name.toLowerCase().includes(query) ||
          (p.path && p.path.toLowerCase().includes(query))
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
        case 'errors':
          valA = a.total_errors || 0;
          valB = b.total_errors || 0;
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
    return new Date(timestamp).toLocaleString();
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
    const headers = ['Project', 'Path', 'Total Events', 'Total Errors', 'Last Activity', 'Status'];
    const rows = filteredProjects.map(p => [
      p.name,
      p.path || '',
      p.total_events || 0,
      p.total_errors || 0,
      p.last_activity || 'Never',
      getActivityStatus(p.last_activity).label
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
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

  function exportJSON() {
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
      const data = await api.get('/projects/list');
      const projectsList = data.projects || [];

      // Load stats for each project
      const statsPromises = projectsList.map(async project => {
        try {
          const eventsData = await api.get(
            `/file-events?limit=1&project=${encodeURIComponent(project.name)}`
          );

          return {
            ...project,
            total_events: eventsData.total || 0,
            total_errors: 0,
            last_activity: eventsData.events?.[0]?.timestamp || null
          };
        } catch (error) {
          logger.error(`Failed to load stats for project ${project.name}:`, error);
          return { ...project, total_events: 0, total_errors: 0, last_activity: null };
        }
      });

      projects = await Promise.all(statsPromises);
    } catch (error) {
      logger.error('Failed to load projects:', error);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    loadProjects();
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-7xl mx-auto">
    <!-- Header -->
    <div class="mb-6">
      <h1 class="text-xl font-bold text-[var(--text)] mb-2">Projects Comparison</h1>
      <p class="text-base text-[var(--muted)] font-sans">
        Compare all monitored projects side-by-side
      </p>
    </div>

    <!-- Controls -->
    <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 mb-6">
      <div class="flex flex-wrap gap-3 mb-3">
        <input
          type="text"
          placeholder="🔍 Search projects..."
          bind:value={searchQuery}
          class="flex-1 min-w-[200px] px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-sm text-[var(--text)] placeholder-[var(--muted)] focus:outline-none focus:border-[var(--accent)] font-mono"
        />

        <select
          bind:value={filterStatus}
          class="px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-sm text-[var(--text)] font-mono cursor-pointer"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="recent">Recent</option>
          <option value="idle">Idle</option>
          <option value="never">Never</option>
        </select>

        <label class="flex items-center gap-2 px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-sm cursor-pointer">
          <input type="checkbox" bind:checked={autoRefresh} />
          <span class="font-mono">Auto-refresh</span>
        </label>

        <button
          class="px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-mono hover:bg-[var(--accent)] hover:text-white hover:border-[var(--accent)] transition-all disabled:opacity-50"
          onclick={() => loadProjects()}
          disabled={loading}
        >
          <span>{loading ? '⏳' : '🔄'}</span> Refresh
        </button>

        <button
          class="px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-mono hover:bg-[var(--accent)] hover:text-white hover:border-[var(--accent)] transition-all"
          onclick={exportCSV}
        >
          <span>📤</span> CSV
        </button>

        <button
          class="px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-mono hover:bg-[var(--accent)] hover:text-white hover:border-[var(--accent)] transition-all"
          onclick={exportJSON}
        >
          <span>📦</span> JSON
        </button>
      </div>

      <div class="text-sm text-[var(--muted)] font-mono">
        Sorted by: <strong class="text-[var(--accent)]">{sortBy}</strong> ({sortDesc ? 'desc' : 'asc'})
      </div>
    </div>

    {#if loading}
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center">
        <div class="w-12 h-12 border-4 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin mx-auto mb-4"></div>
        <p class="text-base text-[var(--muted)] font-sans">Loading projects...</p>
      </div>
    {:else if projects.length === 0}
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center">
        <p class="text-base text-[var(--muted)] mb-2">No projects found</p>
        <p class="text-xs text-[var(--muted)] opacity-80">
          Projects are automatically discovered when you start monitoring code with Raven.
        </p>
      </div>
    {:else if filteredProjects.length === 0}
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center">
        <p class="text-base text-[var(--muted)] mb-2">No projects match your filters</p>
        <p class="text-xs text-[var(--muted)] opacity-80">Try adjusting your search or status filter.</p>
      </div>
    {:else}
      <div class="text-sm text-[var(--muted)] mb-3 font-mono">
        Showing <strong class="text-[var(--accent)]">{filteredProjects.length}</strong> of
        <strong class="text-[var(--accent)]">{projects.length}</strong> projects
      </div>

      <!-- Table -->
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="bg-[var(--bg)] border-b border-[var(--border)]">
              <tr class="text-left">
                <th
                  class="px-4 py-3 text-sm font-semibold text-[var(--muted)] uppercase tracking-wide cursor-pointer hover:text-[var(--accent)] transition-colors font-sans"
                  onclick={() => handleSort('name')}
                >
                  Project {sortBy === 'name' ? (sortDesc ? '▼' : '▲') : ''}
                </th>
                <th
                  class="px-4 py-3 text-sm font-semibold text-[var(--muted)] uppercase tracking-wide cursor-pointer hover:text-[var(--accent)] transition-colors font-sans"
                  onclick={() => handleSort('path')}
                >
                  Path {sortBy === 'path' ? (sortDesc ? '▼' : '▲') : ''}
                </th>
                <th
                  class="px-4 py-3 text-sm font-semibold text-[var(--muted)] uppercase tracking-wide cursor-pointer hover:text-[var(--accent)] transition-colors text-right font-sans"
                  onclick={() => handleSort('events')}
                >
                  Events {sortBy === 'events' ? (sortDesc ? '▼' : '▲') : ''}
                </th>
                <th
                  class="px-4 py-3 text-sm font-semibold text-[var(--muted)] uppercase tracking-wide cursor-pointer hover:text-[var(--accent)] transition-colors text-right font-sans"
                  onclick={() => handleSort('errors')}
                >
                  Errors {sortBy === 'errors' ? (sortDesc ? '▼' : '▲') : ''}
                </th>
                <th
                  class="px-4 py-3 text-sm font-semibold text-[var(--muted)] uppercase tracking-wide cursor-pointer hover:text-[var(--accent)] transition-colors font-sans"
                  onclick={() => handleSort('activity')}
                >
                  Last Activity {sortBy === 'activity' ? (sortDesc ? '▼' : '▲') : ''}
                </th>
                <th
                  class="px-4 py-3 text-sm font-semibold text-[var(--muted)] uppercase tracking-wide font-sans"
                >
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {#each sortedProjects as project (project.name)}
                {@const status = getActivityStatus(project.last_activity)}
                <tr class="border-b border-[var(--border)] hover:bg-[var(--bg)] transition-colors">
                  <td class="px-4 py-3 text-base font-semibold text-[var(--accent)] font-mono">
                    {project.name}
                  </td>
                  <td class="px-4 py-3">
                    <div class="flex items-center gap-2">
                      <span class="text-sm text-[var(--muted)] font-mono truncate max-w-md">
                        {project.path || 'N/A'}
                      </span>
                      {#if project.path}
                        <button
                          class="text-sm opacity-60 hover:opacity-100 transition-opacity flex-shrink-0"
                          onclick={() => copyPath(project.path)}
                          title="Copy path"
                        >
                          📋
                        </button>
                      {/if}
                    </div>
                  </td>
                  <td class="px-4 py-3 text-sm font-semibold text-[var(--text)] font-mono text-right">
                    {formatNumber(project.total_events)}
                  </td>
                  <td class="px-4 py-3 text-sm font-semibold text-red-500 font-mono text-right">
                    {formatNumber(project.total_errors)}
                  </td>
                  <td class="px-4 py-3 text-sm text-[var(--text)] font-mono">
                    {#if project.last_activity}
                      {formatDateTime(project.last_activity)}
                    {:else}
                      Never
                    {/if}
                  </td>
                  <td class="px-4 py-3">
                    <span
                      class="inline-block px-2 py-1 rounded text-xs font-semibold uppercase tracking-wide font-mono"
                      class:bg-green-500={status.class === 'active'}
                      class:bg-blue-500={status.class === 'recent'}
                      class:bg-gray-500={status.class === 'idle'}
                      class:bg-transparent={status.class === 'never'}
                      class:text-white={status.class === 'active' || status.class === 'recent' || status.class === 'idle'}
                      class:text-[var(--muted)]={status.class === 'never'}
                      class:border={status.class === 'never'}
                      class:border-[var(--border)]={status.class === 'never'}
                    >
                      {status.label}
                    </span>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Summary -->
      <div class="flex gap-6 mt-6 p-4 bg-[var(--surface)] border border-[var(--border)] rounded-lg">
        <div class="text-xs font-mono">
          <strong class="text-[var(--accent)] text-sm">{filteredProjects.length}</strong>
          <span class="text-[var(--muted)] ml-1">displayed</span>
        </div>
        <div class="text-xs font-mono">
          <strong class="text-[var(--accent)] text-sm">
            {formatNumber(filteredProjects.reduce((sum, p) => sum + (p.total_events || 0), 0))}
          </strong>
          <span class="text-[var(--muted)] ml-1">total events</span>
        </div>
        <div class="text-xs font-mono">
          <strong class="text-[var(--accent)] text-sm">
            {formatNumber(filteredProjects.reduce((sum, p) => sum + (p.total_errors || 0), 0))}
          </strong>
          <span class="text-[var(--muted)] ml-1">total errors</span>
        </div>
        <div class="text-xs font-mono">
          <strong class="text-[var(--accent)] text-sm">
            {filteredProjects.filter(
              p =>
                getActivityStatus(p.last_activity).class === 'active' ||
                getActivityStatus(p.last_activity).class === 'recent'
            ).length}
          </strong>
          <span class="text-[var(--muted)] ml-1">active</span>
        </div>
      </div>
    {/if}
  </div>
</div>
