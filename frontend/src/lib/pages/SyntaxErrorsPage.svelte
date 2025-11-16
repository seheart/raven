<script>
  import { logger } from '../logger.js';
  import { api } from '../apiClient.js';
  /**
   * Syntax Errors Page
   * Display and manage syntax errors detected in the codebase
   */

  // State
  let errors = $state([]);
  let loading = $state(true);
  let error = $state(null);
  let lastUpdated = $state(new Date());
  let searchQuery = $state('');
  let severityFilter = $state('all');
  let projectFilter = $state('all');
  let limit = $state(30);
  let loadingMore = $state(false);

  // Derived values
  const filteredErrors = $derived.by(() => {
    let filtered = errors;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        err =>
          err.filepath?.toLowerCase().includes(query) || err.message?.toLowerCase().includes(query)
      );
    }

    // Apply severity filter
    if (severityFilter !== 'all') {
      filtered = filtered.filter(err => err.severity === severityFilter);
    }

    // Apply project filter
    if (projectFilter !== 'all') {
      filtered = filtered.filter(err => err.project_name === projectFilter);
    }

    return filtered;
  });

  const errorsBySeverity = $derived.by(() => {
    return {
      error: errors.filter(e => e.severity === 'error').length,
      warning: errors.filter(e => e.severity === 'warning').length,
      info: errors.filter(e => e.severity === 'info').length
    };
  });

  // Group errors by filepath
  const errorsByFile = $derived.by(() => {
    return filteredErrors.reduce((acc, err) => {
      if (!acc[err.filepath]) {
        acc[err.filepath] = [];
      }
      acc[err.filepath].push(err);
      return acc;
    }, {});
  });

  // Extract unique projects
  const projects = $derived.by(() => {
    const uniqueProjects = [...new Set(errors.map(e => e.project_name).filter(Boolean))];
    return uniqueProjects.sort();
  });

  // Time since last update
  const timeSinceUpdate = $derived.by(() => {
    return Math.floor((new Date() - lastUpdated) / 1000);
  });

  // Shorten file path for display
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

  // Load syntax errors data
  async function loadErrors(append = false) {
    try {
      if (append) {
        loadingMore = true;
      } else {
        loading = true;
        limit = 30;
      }
      error = null;

      const data = await api.get(`/syntax-errors?limit=${limit}`);
      errors = data.errors || [];

      lastUpdated = new Date();
      loading = false;
      loadingMore = false;
    } catch (error) {
      logger.error('Failed to load syntax errors:', error);
      errorMessage = error.message;
      loading = false;
      loadingMore = false;
    }
  }

  // Load more errors
  async function loadMore() {
    limit += 30;
    await loadErrors(true);
  }

  // Open file in editor
  async function openFile(filepath, lineNumber) {
    try {
      const result = await api.post('/open-file', {
        filepath,
        lineNumber,
        editor: 'auto'
      });

      if (!result.success) {
        throw new Error(result.message || 'Failed to open file');
      }
    } catch (error) {
      logger.error('Failed to open file:', error);
      // Fallback: Copy file path to clipboard
      try {
        const fileLocation = `${filepath}:${lineNumber}`;
        await navigator.clipboard.writeText(fileLocation);
        alert(`Could not open editor. File path copied to clipboard:\n${fileLocation}`);
      } catch (error) {
        alert(`Failed to open file: ${error.message}\n\nFile: ${filepath}:${lineNumber}`);
      }
    }
  }

  // Resolve error
  async function resolveError(errorId) {
    try {
      await fetch(`http://localhost:3030/api/syntax-errors/${errorId}/resolve`, {
        method: 'POST'
      });

      // Reload errors
      await loadErrors();
    } catch (error) {
      logger.error('Failed to resolve error:', error);
      alert(`Failed to resolve error: ${error.message}`);
    }
  }

  // Copy error details to clipboard
  async function copyError(err) {
    const errorText = `Syntax Error in ${err.filepath}

Project: ${err.project_name || 'N/A'}
Language: ${err.language || 'N/A'}
Location: Line ${err.line_number}${err.column_number ? `, Column ${err.column_number}` : ''}
Severity: ${err.severity}
Message: ${error.message}

${err.code_snippet ? 'Code:\n' + err.code_snippet : ''}`;

    try {
      await navigator.clipboard.writeText(errorText);
      alert('Error details copied to clipboard');
    } catch (error) {
      logger.error('Failed to copy to clipboard:', error);
      alert('Failed to copy to clipboard');
    }
  }

  // Export to CSV
  function exportToCSV() {
    const headers = ['Filepath', 'Line', 'Severity', 'Message', 'Timestamp'];
    const rows = filteredErrors.map(err => [
      err.filepath || '',
      err.line_number || '',
      err.severity || '',
      err.message || '',
      err.timestamp || ''
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `syntax-errors-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Export to JSON
  function exportToJSON() {
    const json = JSON.stringify(filteredErrors, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `syntax-errors-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Load on mount
  $effect(() => {
    loadErrors();
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-7xl mx-auto">
    <!-- Header -->
    <div class="flex justify-between items-start mb-6">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">Syntax Errors</h1>
        <p class="text-base text-[var(--muted)] font-sans">
          Detected syntax issues in your codebase
        </p>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-sm text-[var(--muted)] font-sans">Updated {timeSinceUpdate}s ago</span>
        <button
          onclick={loadErrors}
          disabled={loading}
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>
    </div>

    {#if error}
      <div
        class="bg-[var(--error-subtle)] border border-[var(--error)] rounded-lg p-4 mb-6 flex justify-between items-center"
      >
        <span class="text-base text-[var(--error)] font-sans">Failed to load errors: {error}</span>
        <button
          onclick={loadErrors}
          class="px-3 py-1.5 bg-[var(--error)] text-white rounded text-sm font-sans"
        >
          Retry
        </button>
      </div>
    {:else if loading}
      <!-- Loading skeleton -->
      <div class="space-y-4">
        <div class="grid grid-cols-3 gap-4">
          {#each Array(3) as _, i (i)}
            <div
              class="h-24 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-pulse"
            ></div>
          {/each}
        </div>
        <div
          class="h-96 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-pulse"
        ></div>
      </div>
    {:else}
      <!-- Stats Cards -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <div class="text-base text-[var(--muted)] font-sans mb-1">Total Errors</div>
          <div class="text-3xl font-bold text-[var(--text-heading)]">{errors.length}</div>
        </div>
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <div class="text-base text-[var(--muted)] font-sans mb-1">Critical</div>
          <div class="text-3xl font-bold text-[var(--error)]">{errorsBySeverity.error}</div>
        </div>
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <div class="text-base text-[var(--muted)] font-sans mb-1">Warnings</div>
          <div class="text-3xl font-bold text-[var(--warning)]">{errorsBySeverity.warning}</div>
        </div>
      </div>

      <!-- Filters and Actions -->
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 mb-4">
        <div class="flex flex-wrap gap-4 items-center mb-4">
          <!-- Search -->
          <div class="flex-1 min-w-[200px]">
            <input
              type="text"
              bind:value={searchQuery}
              placeholder="Search by filepath or message..."
              class="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-base font-sans text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          <!-- Severity Filter -->
          <select
            bind:value={severityFilter}
            class="px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-base font-sans text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
          >
            <option value="all">All Severities</option>
            <option value="error">Errors Only</option>
            <option value="warning">Warnings Only</option>
            <option value="info">Info Only</option>
          </select>

          <!-- Export Buttons -->
          <button
            onclick={exportToCSV}
            disabled={filteredErrors.length === 0}
            class="px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors disabled:opacity-50"
          >
            Export CSV
          </button>
          <button
            onclick={exportToJSON}
            disabled={filteredErrors.length === 0}
            class="px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors disabled:opacity-50"
          >
            Export JSON
          </button>
        </div>

        <!-- Project Filter -->
        {#if projects.length > 0}
          <div class="mb-0" role="group" aria-labelledby="project-filter-label">
            <div
              id="project-filter-label"
              class="text-sm font-semibold text-[var(--text)] uppercase mb-3 block"
            >
              Project:
            </div>
            <div class="flex gap-3 flex-wrap">
              <button
                onclick={() => (projectFilter = 'all')}
                class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
                class:bg-[var(--accent)]={projectFilter === 'all'}
                class:text-white={projectFilter === 'all'}
                class:bg-[var(--surface-2)]={projectFilter !== 'all'}
              >
                <span>📁</span>
                <span>All Projects</span>
              </button>
              {#each projects as project (project)}
                <button
                  onclick={() => (projectFilter = project)}
                  class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
                  class:bg-[var(--accent)]={projectFilter === project}
                  class:text-white={projectFilter === project}
                  class:bg-[var(--surface-2)]={projectFilter !== project}
                >
                  <span>📦</span>
                  <span>{project}</span>
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <!-- Errors Grouped by File -->
      {#if filteredErrors.length === 0}
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center">
          <div class="text-5xl mb-4">✅</div>
          <div class="text-xl font-semibold text-[var(--text-heading)] mb-2 font-sans">
            {searchQuery || severityFilter !== 'all' || projectFilter !== 'all'
              ? 'No matching errors'
              : 'No syntax errors!'}
          </div>
          <div class="text-base text-[var(--muted)] font-sans">
            {searchQuery || severityFilter !== 'all' || projectFilter !== 'all'
              ? 'Try adjusting your filters'
              : 'Your codebase is syntax-error free'}
          </div>
        </div>
      {:else}
        <div class="space-y-4">
          {#each Object.entries(errorsByFile) as [filepath, fileErrors] (filepath)}
            <div
              class="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden"
            >
              <!-- File Header -->
              <div
                class="flex items-center justify-between gap-4 px-4 py-3 bg-[var(--surface-2)] border-b border-[var(--border)]"
              >
                <div class="flex items-center gap-3 flex-1 min-w-0">
                  <span class="text-base">📄</span>
                  <span class="text-sm font-mono font-semibold text-[var(--text)] truncate"
                    >{shortenPath(filepath)}</span
                  >
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                  {#if fileErrors[0]?.project_name}
                    <span
                      class="px-2 py-1 bg-[var(--accent)] text-white rounded text-xs font-semibold"
                    >
                      {fileErrors[0].project_name}
                    </span>
                  {/if}
                  <span
                    class="px-2 py-1 bg-[var(--error-subtle)] text-[var(--error)] rounded text-xs font-semibold"
                  >
                    {fileErrors.length}
                    {fileErrors.length === 1 ? 'error' : 'errors'}
                  </span>
                </div>
              </div>

              <!-- Errors List -->
              <div class="divide-y divide-[var(--border)]">
                {#each fileErrors as err (err.id || `${err.filepath}-${err.line_number}-${error.message}`)}
                  <div class="p-4">
                    <!-- Error Header -->
                    <div class="flex items-center justify-between gap-4 mb-3">
                      <div class="flex items-center gap-3">
                        <span
                          class="text-xs px-2 py-1 rounded font-semibold"
                          class:bg-[var(--error-subtle)]={err.severity === 'error'}
                          class:text-[var(--error)]={err.severity === 'error'}
                          class:bg-[var(--warning-subtle)]={err.severity === 'warning'}
                          class:text-[var(--warning)]={err.severity === 'warning'}
                          class:bg-[var(--info-subtle)]={err.severity === 'info'}
                          class:text-[var(--info)]={err.severity === 'info'}
                        >
                          {err.severity?.toUpperCase() || 'UNKNOWN'}
                        </span>
                        <span class="text-sm font-mono text-[var(--muted)]">
                          Line {err.line_number}
                          {#if err.column_number}, Col {err.column_number}{/if}
                        </span>
                        {#if err.language}
                          <span class="text-xs px-2 py-1 bg-[var(--surface-2)] rounded font-mono">
                            {err.language}
                          </span>
                        {/if}
                      </div>
                      {#if err.timestamp}
                        <span class="text-xs text-[var(--muted)] font-mono">
                          {new Date(err.timestamp).toLocaleString()}
                        </span>
                      {/if}
                    </div>

                    <!-- Error Message -->
                    <div
                      class="px-3 py-2 bg-[var(--bg)] rounded text-sm text-[var(--text)] font-mono mb-3"
                    >
                      {err.message}
                    </div>

                    <!-- Code Snippet -->
                    {#if err.code_snippet}
                      <pre
                        class="px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded text-xs font-mono overflow-x-auto mb-3"><code
                          >{err.code_snippet}</code
                        ></pre>
                    {/if}

                    <!-- Action Buttons -->
                    <div class="flex gap-2 flex-wrap">
                      <button
                        onclick={() => openFile(err.filepath, err.line_number)}
                        class="px-3 py-1.5 bg-[var(--accent)] text-white rounded text-xs font-sans hover:opacity-90 transition-opacity"
                      >
                        📂 Open File
                      </button>
                      <button
                        onclick={() => copyError(err)}
                        class="px-3 py-1.5 bg-[var(--surface-2)] border border-[var(--border)] rounded text-xs font-sans hover:border-[var(--accent)] transition-colors"
                      >
                        📋 Copy
                      </button>
                      {#if err.id}
                        <button
                          onclick={() => resolveError(err.id)}
                          class="px-3 py-1.5 bg-[var(--success)] text-white rounded text-xs font-sans hover:opacity-90 transition-opacity"
                        >
                          ✓ Resolve
                        </button>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/each}
        </div>

        <!-- Load More Button -->
        {#if filteredErrors.length < errors.length}
          <div class="flex flex-col items-center gap-3 mt-6">
            <button
              onclick={loadMore}
              disabled={loadingMore}
              class="px-6 py-3 bg-[var(--accent)] text-white rounded-lg text-sm font-sans hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {#if loadingMore}
                Loading...
              {:else}
                Load More ({Math.min(30, errors.length - filteredErrors.length)} more)
              {/if}
            </button>
            <span class="text-sm text-[var(--muted)] font-sans">
              Showing {filteredErrors.length} of {errors.length} errors
            </span>
          </div>
        {:else}
          <div class="mt-4 text-base text-[var(--muted)] font-sans text-center">
            Showing {filteredErrors.length} of {errors.length} errors
          </div>
        {/if}
      {/if}
    {/if}
  </div>
</div>
