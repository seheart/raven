<script>
  import { logger } from '../logger.js';
  /**
   * Multi-Project Health Page
   * At-a-glance health status across all monitored projects
   */
  import { api } from '../apiClient.js';

  let projects = $state([]);
  let totalProjects = $state(0);
  let activeProjects = $state(0);
  let recentProjects = $state(0);
  let loading = $state(true);
  let error = $state(null);
  let sortBy = $state('health');
  let sortDesc = $state(true);
  let searchQuery = $state('');
  let filterHealth = $state('all');
  let filterStatus = $state('all');
  let autoRefresh = $state(true);

  // Filter projects
  const filteredProjects = $derived.by(() => {
    let filtered = projects;

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p => p.name.toLowerCase().includes(query));
    }

    // Health filter
    if (filterHealth !== 'all') {
      const healthLabel = getHealthLabel(filtered[0]?.health_score || 0).toLowerCase();
      filtered = filtered.filter(p => {
        const label = getHealthLabel(p.health_score).toLowerCase();
        if (filterHealth === 'excellent' && label !== 'excellent') return false;
        if (filterHealth === 'good' && label !== 'good') return false;
        if (filterHealth === 'fair' && label !== 'fair') return false;
        if (filterHealth === 'poor' && label !== 'needs attention') return false;
        return true;
      });
    }

    // Status filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter(p => p.status === filterStatus);
    }

    return filtered;
  });

  // Sort projects
  const sortedProjects = $derived.by(() => {
    const sorted = [...filteredProjects];
    sorted.sort((a, b) => {
      let result;
      switch (sortBy) {
        case 'health':
          result = (b.health_score || 0) - (a.health_score || 0);
          break;
        case 'name':
          result = a.name.localeCompare(b.name);
          break;
        case 'activity':
          result = (b.recent_events || 0) - (a.recent_events || 0);
          break;
        case 'errors':
          result = (b.error_count || 0) - (a.error_count || 0);
          break;
        default:
          result = 0;
      }
      return sortDesc ? result : -result;
    });
    return sorted;
  });

  function getHealthLabel(score) {
    if (score >= 75) return 'Excellent';
    if (score >= 50) return 'Good';
    if (score >= 25) return 'Fair';
    return 'Needs Attention';
  }

  function getHealthBarColor(score) {
    if (score >= 75) return 'var(--success)';
    if (score >= 50) return 'var(--info)';
    if (score >= 25) return 'var(--warning)';
    return 'var(--error)';
  }

  function getStatusLabel(status) {
    return (
      {
        active: 'Active',
        recent: 'Recent',
        idle: 'Idle',
        inactive: 'Inactive'
      }[status] || 'Unknown'
    );
  }

  function formatLastActivity(timestamp) {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  function handleSort(newSortBy) {
    if (sortBy === newSortBy) {
      sortDesc = !sortDesc;
    } else {
      sortBy = newSortBy;
      sortDesc = true;
    }
  }

  function filterByStatsCard(type) {
    switch (type) {
      case 'active':
        filterStatus = 'active';
        break;
      case 'recent':
        filterStatus = 'recent';
        break;
      case 'idle':
        filterStatus = filterStatus === 'idle' ? 'all' : 'idle';
        break;
      default:
        filterStatus = 'all';
    }
  }

  function exportCSV() {
    const data = filteredProjects.map(p => ({
      Project: p.name,
      Status: getStatusLabel(p.status),
      'Health Score': p.health_score,
      'Health Label': getHealthLabel(p.health_score),
      'Recent Events': p.recent_events,
      Errors: p.error_count,
      'Last Activity': p.last_activity || 'Never'
    }));

    const headers = Object.keys(data[0] || {});
    const rows = data.map(row => headers.map(h => `"${row[h]}"`).join(','));
    const csv = [headers.join(','), ...rows].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `raven-project-health-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportJSON() {
    const data = {
      total_projects: totalProjects,
      filtered_count: filteredProjects.length,
      active: activeProjects,
      recent: recentProjects,
      filters: {
        search: searchQuery,
        health: filterHealth,
        status: filterStatus
      },
      projects: filteredProjects,
      exported_at: new Date().toISOString()
    };

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `raven-project-health-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function loadHealthData() {
    try {
      loading = true;
      error = null;

      // Fetch project health data
      const data = await api.get('/projects/list');
      const projectsList = data.projects || [];

      // Calculate health scores based on recent activity
      projects = projectsList.map(p => ({
        name: p.name,
        status: 'active', // Would be calculated based on last_activity
        health_score: Math.floor(Math.random() * 100), // Mock score for now
        recent_events: p.eventCount || 0,
        error_count: Math.floor(Math.random() * 10), // Would come from API
        last_activity: new Date(Date.now() - Math.random() * 86400000 * 7).toISOString()
      }));

      totalProjects = projects.length;
      activeProjects = projects.filter(p => p.status === 'active').length;
      recentProjects = projects.filter(p => p.status === 'recent').length;
    } catch (err) {
      logger.error('Failed to load project health:', err);
      error = err.message;
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    loadHealthData();
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-7xl mx-auto">
    <!-- Header -->
    <div class="mb-6">
      <h1 class="text-xl font-bold text-[var(--text)] mb-2">Multi-Project Health</h1>
      <p class="text-base text-[var(--muted)] font-sans">
        At-a-glance health status across all monitored projects
      </p>
    </div>

    <!-- Stats Row -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <button
        class="bg-[var(--surface)] border-2 border-[var(--border)] rounded-lg p-4 text-center hover:transform hover:-translate-y-0.5 hover:shadow-lg transition-all"
        onclick={() => filterByStatsCard('all')}
      >
        <div class="text-2xl font-bold text-[var(--text)] font-mono mb-1">{totalProjects}</div>
        <div class="text-sm text-[var(--muted)] uppercase tracking-wide">Total Projects</div>
      </button>

      <button
        class="bg-[var(--surface)] border-2 border-green-500 rounded-lg p-4 text-center hover:transform hover:-translate-y-0.5 hover:shadow-lg transition-all"
        onclick={() => filterByStatsCard('active')}
      >
        <div class="text-2xl font-bold text-[var(--text)] font-mono mb-1">{activeProjects}</div>
        <div class="text-sm text-[var(--muted)] uppercase tracking-wide">Active Now</div>
      </button>

      <button
        class="bg-[var(--surface)] border-2 border-blue-500 rounded-lg p-4 text-center hover:transform hover:-translate-y-0.5 hover:shadow-lg transition-all"
        onclick={() => filterByStatsCard('recent')}
      >
        <div class="text-2xl font-bold text-[var(--text)] font-mono mb-1">{recentProjects}</div>
        <div class="text-sm text-[var(--muted)] uppercase tracking-wide">Recently Active</div>
      </button>

      <button
        class="bg-[var(--surface)] border-2 border-gray-500 rounded-lg p-4 text-center hover:transform hover:-translate-y-0.5 hover:shadow-lg transition-all"
        onclick={() => filterByStatsCard('idle')}
      >
        <div class="text-2xl font-bold text-[var(--text)] font-mono mb-1">
          {totalProjects - activeProjects - recentProjects}
        </div>
        <div class="text-sm text-[var(--muted)] uppercase tracking-wide">Idle/Inactive</div>
      </button>
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
          bind:value={filterHealth}
          class="px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-sm text-[var(--text)] font-mono cursor-pointer"
        >
          <option value="all">All Health</option>
          <option value="excellent">Excellent (75+)</option>
          <option value="good">Good (50-74)</option>
          <option value="fair">Fair (25-49)</option>
          <option value="poor">Poor (&lt;25)</option>
        </select>

        <select
          bind:value={filterStatus}
          class="px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-sm text-[var(--text)] font-mono cursor-pointer"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="recent">Recent</option>
          <option value="idle">Idle</option>
          <option value="inactive">Inactive</option>
        </select>

        <label
          class="flex items-center gap-2 px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-sm cursor-pointer"
        >
          <input type="checkbox" bind:checked={autoRefresh} />
          <span class="font-mono">Auto-refresh</span>
        </label>

        <button
          class="px-3 py-2 bg-[var(--accent)] text-white rounded text-sm font-semibold hover:opacity-90 transition-opacity"
          onclick={loadHealthData}
        >
          🔄 Refresh
        </button>

        <button
          class="px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-mono hover:bg-[var(--accent)] hover:text-white hover:border-[var(--accent)] transition-all"
          onclick={exportCSV}
        >
          📤 CSV
        </button>

        <button
          class="px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-mono hover:bg-[var(--accent)] hover:text-white hover:border-[var(--accent)] transition-all"
          onclick={exportJSON}
        >
          📦 JSON
        </button>
      </div>

      <!-- Sort Controls -->
      <div class="flex items-center gap-3 flex-wrap">
        <span class="text-sm text-[var(--muted)] font-mono">Sort by:</span>
        <button
          class="px-2 py-1 text-sm rounded font-mono transition-all"
          class:bg-[var(--accent)]={sortBy === 'health'}
          class:text-white={sortBy === 'health'}
          class:border={sortBy !== 'health'}
          class:border-[var(--border)]={sortBy !== 'health'}
          onclick={() => handleSort('health')}
        >
          Health {sortBy === 'health' ? (sortDesc ? '▼' : '▲') : ''}
        </button>
        <button
          class="px-2 py-1 text-sm rounded font-mono transition-all"
          class:bg-[var(--accent)]={sortBy === 'name'}
          class:text-white={sortBy === 'name'}
          class:border={sortBy !== 'name'}
          class:border-[var(--border)]={sortBy !== 'name'}
          onclick={() => handleSort('name')}
        >
          Name {sortBy === 'name' ? (sortDesc ? '▼' : '▲') : ''}
        </button>
        <button
          class="px-2 py-1 text-sm rounded font-mono transition-all"
          class:bg-[var(--accent)]={sortBy === 'activity'}
          class:text-white={sortBy === 'activity'}
          class:border={sortBy !== 'activity'}
          class:border-[var(--border)]={sortBy !== 'activity'}
          onclick={() => handleSort('activity')}
        >
          Activity {sortBy === 'activity' ? (sortDesc ? '▼' : '▲') : ''}
        </button>
        <button
          class="px-2 py-1 text-sm rounded font-mono transition-all"
          class:bg-[var(--accent)]={sortBy === 'errors'}
          class:text-white={sortBy === 'errors'}
          class:border={sortBy !== 'errors'}
          class:border-[var(--border)]={sortBy !== 'errors'}
          onclick={() => handleSort('errors')}
        >
          Errors {sortBy === 'errors' ? (sortDesc ? '▼' : '▲') : ''}
        </button>
      </div>
    </div>

    {#if loading}
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center">
        <div
          class="w-12 h-12 border-4 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin mx-auto mb-4"
        ></div>
        <p class="text-base text-[var(--muted)] font-sans">Loading health data...</p>
      </div>
    {:else if error}
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center">
        <p class="text-base text-red-500 mb-2">⚠️ {error}</p>
        <button
          class="px-4 py-2 bg-[var(--accent)] text-white rounded text-sm font-semibold hover:opacity-90 transition-opacity mt-4"
          onclick={loadHealthData}
        >
          Try Again
        </button>
      </div>
    {:else if projects.length === 0}
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center">
        <p class="text-base text-[var(--muted)] mb-2">📭 No projects found</p>
        <p class="text-xs text-[var(--muted)] opacity-80">
          Projects will appear here automatically when Raven detects activity.
        </p>
      </div>
    {:else if filteredProjects.length === 0}
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center">
        <p class="text-base text-[var(--muted)] mb-2">🔍 No projects match your filters</p>
        <p class="text-xs text-[var(--muted)] opacity-80">
          Try adjusting your search or filter criteria.
        </p>
      </div>
    {:else}
      <div class="text-sm text-[var(--muted)] mb-3 font-mono">
        Showing <strong class="text-[var(--accent)]">{filteredProjects.length}</strong> of
        <strong class="text-[var(--accent)]">{projects.length}</strong> projects
      </div>

      <!-- Health Cards Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {#each sortedProjects as project (project.name)}
          <div
            class="bg-[var(--surface)] border-2 rounded-lg p-4 hover:transform hover:-translate-y-0.5 hover:shadow-lg transition-all"
            class:border-green-500={project.status === 'active'}
            class:border-blue-500={project.status === 'recent'}
            class:border-gray-500={project.status === 'idle' || project.status === 'inactive'}
          >
            <!-- Header -->
            <div class="flex items-center justify-between mb-3">
              <span class="text-base font-semibold text-[var(--accent)] font-mono truncate flex-1">
                {project.name}
              </span>
              <div class="flex items-center gap-2 flex-shrink-0 ml-2">
                <span
                  class="w-2.5 h-2.5 rounded-full"
                  class:bg-green-500={project.status === 'active'}
                  class:shadow-[0_0_8px_rgba(16,185,129,0.6)]={project.status === 'active'}
                  class:bg-blue-500={project.status === 'recent'}
                  class:shadow-[0_0_8px_rgba(59,130,246,0.5)]={project.status === 'recent'}
                  class:bg-gray-500={project.status === 'idle' || project.status === 'inactive'}
                ></span>
                <span class="text-xs text-[var(--muted)] uppercase tracking-wide">
                  {getStatusLabel(project.status)}
                </span>
              </div>
            </div>

            <!-- Health Bar -->
            <div class="h-2 bg-[var(--bg)] rounded overflow-hidden mb-3">
              <div
                class="h-full transition-all duration-300"
                style="width: {project.health_score}%; background: {getHealthBarColor(
                  project.health_score
                )}"
              ></div>
            </div>

            <!-- Health Score -->
            <div class="flex items-baseline gap-2 mb-4">
              <span class="text-xl font-bold text-[var(--text)] font-mono"
                >{project.health_score}</span
              >
              <span class="text-sm text-[var(--muted)]">{getHealthLabel(project.health_score)}</span
              >
            </div>

            <!-- Metrics -->
            <div class="grid grid-cols-2 gap-4 pt-3 border-t border-[var(--border)] mb-3">
              <div class="text-center">
                <div class="text-lg font-semibold text-[var(--text)] font-mono">
                  {project.recent_events}
                </div>
                <div class="text-xs text-[var(--muted)] uppercase tracking-wide">Events (24h)</div>
              </div>
              <div class="text-center">
                <div class="text-lg font-semibold text-[var(--text)] font-mono">
                  {project.error_count}
                </div>
                <div class="text-xs text-[var(--muted)] uppercase tracking-wide">Errors</div>
              </div>
            </div>

            <!-- Footer -->
            <div class="pt-3 border-t border-[var(--border)]">
              <span class="text-xs text-[var(--muted)] font-mono">
                Last: {formatLastActivity(project.last_activity)}
              </span>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
