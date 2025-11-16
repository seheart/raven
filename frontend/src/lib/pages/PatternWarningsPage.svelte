<script>
  /**
   * Pattern Warnings Page
   * Display and manage pattern-based code quality warnings
   */

  // State
  let warnings = $state([]);
  let loading = $state(true);
  let error = $state(null);
  let lastUpdated = $state(new Date);
  let searchQuery = $state('');
  let categoryFilter = $state('all');
  let projectFilter = $state('all');
  let severityFilter = $state('all');
  let limit = $state(30);
  let loadingMore = $state(false);

  // Categories
  const categories = [
    { id: 'all', label: 'All', icon: '🔍' },
    { id: 'security', label: 'Security', icon: '🔒' },
    { id: 'quality', label: 'Quality', icon: '✨' },
    { id: 'maintenance', label: 'Maintenance', icon: '🔧' },
    { id: 'performance', label: 'Performance', icon: '⚡' }
  ];

  // Derived values - Extract unique projects
  const projects = $derived.by(() => {
    const uniqueProjects = new Set(warnings.map((w) => w.project_name).filter(Boolean));
    return Array.from(uniqueProjects).sort;
  });

  // Filter warnings
  const filteredWarnings = $derived.by(() => {
    let filtered = warnings;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (warning) =>
          warning.filepath?.toLowerCase().includes(query) ||
          warning.message?.toLowerCase().includes(query) ||
          warning.pattern_name?.toLowerCase().includes(query)
      );
    }

    // Apply category filter
    if (categoryFilter !== 'all') {
      filtered = filtered.filter((warning) => warning.category === categoryFilter);
    }

    // Apply project filter
    if (projectFilter !== 'all') {
      filtered = filtered.filter((warning) => warning.project_name === projectFilter);
    }

    // Apply severity filter
    if (severityFilter !== 'all') {
      filtered = filtered.filter((warning) => warning.severity === severityFilter);
    }

    return filtered;
  });

  // Group by file
  const warningsByFile = $derived.by(() => {
    return filteredWarnings.reduce((acc, warning) => {
      if (!acc[warning.filepath]) {
        acc[warning.filepath] = [];
      }
      acc[warning.filepath].push(warning);
      return acc;
    }, {});
  });

  // Stats
  const stats = $derived.by(() => {
    return {
      total: warnings.length,
      filtered: filteredWarnings.length,
      critical: warnings.filter((w) => w.severity === 'critical').length,
      error: warnings.filter((w) => w.severity === 'error').length,
      warning: warnings.filter((w) => w.severity === 'warning').length,
      info: warnings.filter((w) => w.severity === 'info').length
    };
  });

  // Time since last update
  const timeSinceUpdate = $derived.by(() => {
    return Math.floor((new Date - lastUpdated) / 1000);
  });

  // Shorten file path
  function shortenPath(filepath) {
    if (!filepath) return '';
    let shortened = filepath.replace(/^\/home\/[^/]+\/Projects\//, '');
    if (shortened.length > 60) {
      const parts = shortened.split('/');
      if (parts.length > 2) {
        return '.../' + parts.slice(-2).join('/');
      }
    }
    return shortened;
  }

  // Get severity color
  function getSeverityColor(severity) {
    switch (severity) {
      case 'critical':
        return 'var(--error)';
      case 'error':
        return 'var(--error)';
      case 'warning':
        return 'var(--warning)';
      case 'info':
        return 'var(--info)';
      default:
        return 'var(--muted)';
    }
  }

  // Load pattern warnings data
  async function loadWarnings(append = false) {
    try {
      if (append) {
        loadingMore = true;
      } else {
        loading = true;
        limit = 30; // Reset limit
      }
      error = null;

      const url =
        categoryFilter === 'all'
          ? `http://localhost:3030/api/pattern-warnings?limit=${limit}`
          : `http://localhost:3030/api/pattern-warnings/category/${categoryFilter}?limit=${limit}`;

      const response = await fetch(url);

      const data = await response.json()
      warnings = data.warnings || [];

      lastUpdated = new Date();
      loading = false;
      loadingMore = false;
    } catch (err) {
      console.error('Failed to load pattern warnings:', err);
      error = err.message;
      loading = false;
      loadingMore = false;
    }
  }

  // Load more warnings
  async function loadMore() {
    limit += 30;
    await loadWarnings(true);
  }

  // Resolve warning
  async function resolveWarning(warningId) {
    try {
      const response = await fetch(
        `http://localhost:3030/api/pattern-warnings/${warningId}/resolve`,
        {
          method: 'POST'
        }
      );


      await loadWarnings;
    } catch (err) {
      console.error('Failed to resolve warning:', err);
      alert(`Failed to resolve warning: ${err.message}`);
    }
  }

  // Resolve all warnings
  async function resolveAllWarnings() {
    const count = filteredWarnings.length;
    if (!confirm(`Are you sure you want to resolve all ${count} filtered warnings?`)) {
      return;
    }

    try {
      const url =
        categoryFilter === 'all'
          ? 'http://localhost:3030/api/pattern-warnings/resolve-all'
          : `http://localhost:3030/api/pattern-warnings/resolve-all?category=${categoryFilter}`;

      const response = await fetch(url, { method: 'POST' });

      await loadWarnings;
    } catch (err) {
      console.error('Failed to resolve all warnings:', err);
      alert(`Failed to resolve all warnings: ${err.message}`);
    }
  }

  // Export to CSV
  function exportToCSV() {
    const headers = ['Filepath', 'Line', 'Category', 'Severity', 'Pattern', 'Message'];
    const rows = filteredWarnings.map((warning) => [
      warning.filepath || '',
      warning.line_number || '',
      warning.category || '',
      warning.severity || '',
      warning.pattern_name || '',
      warning.message || ''
    ]);

    const csv = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pattern-warnings-${new Date().toISOString().split('T')[0]}.csv`;
    a.click;
    URL.revokeObjectURL(url);
  }

  // Export to JSON
  function exportToJSON() {
    const json = JSON.stringify(filteredWarnings, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pattern-warnings-${new Date().toISOString().split('T')[0]}.json`;
    a.click;
    URL.revokeObjectURL(url);
  }

  // Watch for category changes
  $effect(() => {
    if (categoryFilter !== undefined) {
      loadWarnings();
    }
  });

  // Load on mount (initial load only)
  let mounted = false;
  $effect(() => {
    if (!mounted) {
      mounted = true;
      loadWarnings();
    }
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-7xl mx-auto">
    <!-- Header -->
    <div class="flex justify-between items-start mb-6">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">Pattern Warnings</h1>
        <p class="text-base text-[var(--muted)] font-sans">
          Automatic detection of problematic patterns: hardcoded secrets, debug statements, and code
          quality issues
        </p>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-sm text-[var(--muted)] font-sans">Updated {timeSinceUpdate}s ago</span>
        <button
          onclick={loadWarnings}
          disabled={loading}
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
        {#if stats.filtered > 0}
          <button
            onclick={resolveAllWarnings}
            class="px-3 py-1.5 bg-[var(--success)] text-white rounded text-sm font-sans hover:opacity-90 transition-opacity"
          >
            Resolve All
          </button>
        {/if}
      </div>
    </div>

    {#if error}
      <div
        class="bg-[var(--error-subtle)] border border-[var(--error)] rounded-lg p-4 mb-6 flex justify-between items-center"
      >
        <span class="text-sm text-[var(--error)] font-sans">Failed to load warnings: {error}</span>
        <button
          onclick={loadWarnings}
          class="px-3 py-1.5 bg-[var(--error)] text-white rounded text-sm font-sans"
        >
          Retry
        </button>
      </div>
    {:else if loading}
      <!-- Loading skeleton -->
      <div class="space-y-4">
        <div class="grid grid-cols-4 gap-4">
          {#each Array(4) as _, i (i)}
            <div class="h-24 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-pulse"></div>
          {/each}
        </div>
        <div class="h-96 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-pulse"></div>
      </div>
    {:else}
      <!-- Category Filter -->
      <div class="mb-6">
        <label class="text-sm font-semibold text-[var(--text)] uppercase mb-3 block">Category:</label>
        <div class="flex gap-3 flex-wrap">
          {#each categories as category (category.id)}
            <button
              onclick={() => (categoryFilter = category.id)}
              class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
              class:bg-[var(--accent)]={categoryFilter === category.id}
              class:text-white={categoryFilter === category.id}
              class:bg-[var(--surface)]={categoryFilter !== category.id}
              class:border={categoryFilter !== category.id}
              class:border-[var(--border)]={categoryFilter !== category.id}
              class:text-[var(--muted)]={categoryFilter !== category.id}
              class:hover:border-[var(--accent)]={categoryFilter !== category.id}
            >
              <span>{category.icon}</span>
              <span>{category.label}</span>
            </button>
          {/each}
        </div>
      </div>

      <!-- Stats Cards -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <div class="text-base text-[var(--muted)] font-sans mb-1">Total Warnings</div>
          <div class="text-3xl font-bold text-[var(--text-heading)]">{stats.total}</div>
        </div>
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <div class="text-base text-[var(--muted)] font-sans mb-1">Critical/Errors</div>
          <div class="text-3xl font-bold text-[var(--error)]">
            {stats.critical + stats.error}
          </div>
        </div>
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <div class="text-base text-[var(--muted)] font-sans mb-1">Warnings</div>
          <div class="text-3xl font-bold text-[var(--warning)]">{stats.warning}</div>
        </div>
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <div class="text-base text-[var(--muted)] font-sans mb-1">Info</div>
          <div class="text-3xl font-bold text-[var(--info)]">{stats.info}</div>
        </div>
      </div>

      <!-- Filters and Actions -->
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 mb-4">
        <div class="flex flex-wrap gap-4 items-center">
          <!-- Search -->
          <div class="flex-1 min-w-[200px]">
            <input
              type="text"
              bind:value={searchQuery}
              placeholder="Search by filepath, message, or pattern..."
              class="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-base font-sans text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          <!-- Project Filter -->
          {#if projects.length > 0}
            <select
              bind:value={projectFilter}
              class="px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-base font-sans text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
            >
              <option value="all">All Projects</option>
              {#each projects as project (project)}
                <option value={project}>{project}</option>
              {/each}
            </select>
          {/if}

          <!-- Severity Filter -->
          <select
            bind:value={severityFilter}
            class="px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-base font-sans text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical</option>
            <option value="error">Errors</option>
            <option value="warning">Warnings</option>
            <option value="info">Info</option>
          </select>

          <!-- Export Buttons -->
          <button
            onclick={exportToCSV}
            disabled={filteredWarnings.length === 0}
            class="px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors disabled:opacity-50"
          >
            Export CSV
          </button>
          <button
            onclick={exportToJSON}
            disabled={filteredWarnings.length === 0}
            class="px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors disabled:opacity-50"
          >
            Export JSON
          </button>
        </div>
      </div>

      <!-- Warnings List (Grouped by File) -->
      {#if filteredWarnings.length === 0}
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center">
          <div class="text-5xl mb-4">✅</div>
          <div class="text-xl font-semibold text-[var(--text-heading)] mb-2 font-sans">
            {searchQuery || projectFilter !== 'all' || categoryFilter !== 'all' || severityFilter !== 'all'
              ? 'No matching warnings'
              : 'No pattern warnings!'}
          </div>
          <div class="text-base text-[var(--muted)] font-sans">
            {searchQuery || projectFilter !== 'all' || categoryFilter !== 'all' || severityFilter !== 'all'
              ? 'Try adjusting your filters'
              : 'No problematic patterns detected in your code'}
          </div>
        </div>
      {:else}
        <div class="space-y-4">
          {#each Object.entries(warningsByFile) as [filepath, fileWarnings] (filepath)}
            <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
              <!-- File Header -->
              <div
                class="flex items-center justify-between gap-4 px-4 py-3 bg-[var(--surface-2)] border-b border-[var(--border)]"
              >
                <div class="flex items-center gap-3 flex-1 min-w-0">
                  <span class="text-lg">📄</span>
                  <span
                    class="text-sm font-mono font-semibold text-[var(--text)] truncate"
                    title={filepath}
                  >
                    {shortenPath(filepath)}
                  </span>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                  {#if fileWarnings[0]?.project_name}
                    <span
                      class="px-2 py-1 bg-[var(--accent)] text-white rounded text-xs font-bold font-mono uppercase"
                    >
                      {fileWarnings[0].project_name}
                    </span>
                  {/if}
                  {#if fileWarnings.some((w) => w.severity === 'critical' || w.severity === 'error')}
                    <span class="px-2 py-1 bg-[var(--error)] text-white rounded text-xs font-bold uppercase">
                      CRITICAL
                    </span>
                  {/if}
                  <span
                    class="px-2 py-1 bg-[var(--error-subtle)] text-[var(--error)] rounded text-xs font-bold"
                  >
                    {fileWarnings.length}
                  </span>
                </div>
              </div>

              <!-- Warnings for this file -->
              <div class="divide-y divide-[var(--border)]">
                {#each fileWarnings as warning (warning.id)}
                  <div
                    class="p-4 border-l-4 transition-colors hover:bg-[var(--surface-2)]"
                    style="border-left-color: {getSeverityColor(warning.severity)}"
                  >
                    <!-- Warning Header -->
                    <div class="flex items-center justify-between gap-4 mb-2">
                      <div class="flex items-center gap-3 flex-1">
                        <span class="text-sm font-bold text-[var(--text)] font-sans">
                          {warning.pattern_name || 'Unknown Pattern'}
                        </span>
                        <span
                          class="px-2 py-0.5 rounded text-xs font-bold text-white uppercase"
                          style="background-color: {getSeverityColor(warning.severity)}"
                        >
                          {warning.severity || 'unknown'}
                        </span>
                      </div>
                      <div class="flex items-center gap-3">
                        <span class="text-sm text-[var(--muted)] font-mono">
                          Line {warning.line_number || '?'}
                        </span>
                        <button
                          onclick={() => resolveWarning(warning.id)}
                          class="px-2 py-1 bg-[var(--success)] text-white rounded text-xs font-semibold hover:opacity-90"
                        >
                          Resolve
                        </button>
                      </div>
                    </div>

                    <!-- Warning Message -->
                    <div class="text-sm text-[var(--text)] mb-3 font-sans">
                      {warning.message || 'No message'}
                    </div>

                    <!-- Code Context -->
                    {#if warning.context || warning.match_text}
                      <div class="mb-3">
                        <code
                          class="block px-3 py-2 bg-[var(--bg)] rounded text-xs font-mono text-[var(--text)] overflow-x-auto whitespace-pre-wrap break-all"
                        >
                          {warning.context || warning.match_text}
                        </code>
                      </div>
                    {/if}

                    <!-- Suggestion -->
                    {#if warning.suggestion}
                      <div
                        class="flex items-start gap-2 px-3 py-2 bg-[var(--success-subtle)] border-l-2 border-[var(--success)] rounded text-sm text-[var(--success)]"
                      >
                        <span class="text-base">💡</span>
                        <span class="flex-1 font-sans">{warning.suggestion}</span>
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
          {/each}

          <!-- Load More Button -->
          {#if filteredWarnings.length > 0 && filteredWarnings.length < warnings.length}
            <div class="text-center py-6">
              <button
                onclick={loadMore}
                disabled={loadingMore}
                class="px-6 py-3 bg-[var(--accent)] text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {#if loadingMore}
                  Loading...
                {:else}
                  Load More ({Math.min(30, warnings.length - filteredWarnings.length)} more)
                {/if}
              </button>
              <div class="mt-2 text-sm text-[var(--muted)] font-sans">
                Showing {filteredWarnings.length} of {stats.total} warnings
              </div>
            </div>
          {/if}

          <!-- Results Count -->
          <div class="text-base text-[var(--muted)] font-sans text-center py-4">
            Showing {filteredWarnings.length} of {stats.total} warnings
          </div>
        </div>
      {/if}
    {/if}
  </div>
</div>
