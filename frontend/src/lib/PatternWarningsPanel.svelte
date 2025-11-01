<script>
  import { logger } from './logger.js';
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';
  import { notifications } from './notificationService.js';
  import { desktopNotifications } from './services/desktopNotifications.js';
  import { formatNumber } from './numberFormat.js';
  import { formatDateTime } from './timeFormat.js';
  import LoadingSkeleton from './LoadingSkeleton.svelte';

  let warnings = [];
  let loading = true;
  let warningCount = 0;
  let ws = null;
  let selectedCategory = 'all';
  let selectedProject = 'all';
  let projects = [];
  let limit = 30;
  let loadingMore = false;
  let showExportDropdown = false;

  const categories = [
    { id: 'all', label: 'All', icon: '🔍' },
    { id: 'security', label: 'Security', icon: '🔒' },
    { id: 'quality', label: 'Quality', icon: '✨' },
    { id: 'maintenance', label: 'Maintenance', icon: '🔧' },
    { id: 'performance', label: 'Performance', icon: '⚡' }
  ];

  // Fetch warnings
  async function fetchWarnings(append = false) {
    try {
      if (append) {
        loadingMore = true;
      } else {
        loading = true;
        limit = 30; // Reset limit when fetching fresh
      }

      const url = selectedCategory === 'all'
        ? `/api/pattern-warnings?limit=${limit}`
        : `/api/pattern-warnings/category/${selectedCategory}?limit=${limit}`;

      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch warnings');

      const data = await response.json();

      if (append) {
        warnings = data.warnings;
      } else {
        warnings = data.warnings;
      }
      warningCount = data.count;

      loading = false;
      loadingMore = false;
    } catch (error) {
      logger.error('Failed to fetch pattern warnings:', error);
      notifications.error('Failed to load pattern warnings');
      loading = false;
      loadingMore = false;
    }
  }

  // Load more warnings
  async function loadMore() {
    limit += 30;
    await fetchWarnings(true);
  }

  // Resolve warning
  async function resolveWarning(warningId) {
    try {
      const response = await fetch(`/api/pattern-warnings/${warningId}/resolve`, {
        method: 'POST'
      });

      if (!response.ok) throw new Error('Failed to resolve warning');

      notifications.success('Warning marked as resolved');
      await fetchWarnings();
    } catch (error) {
      logger.error('Failed to resolve warning:', error);
      notifications.error('Failed to resolve warning');
    }
  }

  // Resolve all warnings
  async function resolveAllWarnings() {
    if (!confirm(`Are you sure you want to resolve all ${warningCount} pattern warnings?`)) {
      return;
    }

    try {
      const url = selectedCategory === 'all'
        ? '/api/pattern-warnings/resolve-all'
        : `/api/pattern-warnings/resolve-all?category=${selectedCategory}`;

      const response = await fetch(url, { method: 'POST' });
      if (!response.ok) throw new Error('Failed to resolve all warnings');

      const data = await response.json();
      notifications.success(data.message || 'All warnings resolved');
      await fetchWarnings();
    } catch (error) {
      logger.error('Failed to resolve all warnings:', error);
      notifications.error('Failed to resolve all warnings');
    }
  }

  // Export warnings
  async function exportWarnings(format = 'csv') {
    try {
      const categoryParam = selectedCategory === 'all' ? '' : `&category=${selectedCategory}`;
      const url = `/api/pattern-warnings/export?format=${format}${categoryParam}`;

      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to export warnings');

      // Get filename from Content-Disposition header or generate one
      const contentDisposition = response.headers.get('Content-Disposition');
      const filename = contentDisposition
        ? contentDisposition.split('filename=')[1].replace(/"/g, '')
        : `pattern-warnings-${Date.now()}.${format}`;

      // Download file
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);

      notifications.success(`Exported ${warningCount} warning(s) as ${format.toUpperCase()}`);
      showExportDropdown = false;
    } catch (error) {
      logger.error('Failed to export warnings:', error);
      notifications.error('Failed to export warnings');
      showExportDropdown = false;
    }
  }

  // Toggle export dropdown
  function toggleExportDropdown() {
    showExportDropdown = !showExportDropdown;
  }

  // Subscribe to WebSocket for real-time updates
  function setupWebSocket() {
    ws = websocketService.subscribe('pattern-warning', (data) => {
      logger.info('Pattern warning detected:', data);

      // Show desktop notification for critical patterns
      if (data.warnings && data.warnings.length > 0) {
        const criticalWarnings = data.warnings.filter(w => w.severity === 'critical');
        if (criticalWarnings.length > 0) {
          desktopNotifications.show({
            title: 'Critical Pattern Detected',
            body: `${criticalWarnings.length} critical issue(s) in ${data.filepath}`,
            severity: 'critical',
            requireInteraction: true
          });
        }
      }

      // Refresh warning list
      fetchWarnings();
    });
  }

  onMount(() => {
    fetchWarnings();
    setupWebSocket();
  });

  onDestroy(() => {
    if (ws) ws();
  });

  // Watch category changes (project filtering is client-side only)
  $: if (selectedCategory !== undefined) {
    fetchWarnings();
  }

  // Extract unique projects from all warnings
  $: {
    const uniqueProjects = [...new Set(warnings.map(w => w.project_name).filter(Boolean))];
    projects = uniqueProjects.sort();
  }

  // Filter warnings by selected project
  $: filteredWarnings = selectedProject === 'all'
    ? warnings
    : warnings.filter(w => w.project_name === selectedProject);

  // Group filtered warnings by file
  $: warningsByFile = filteredWarnings.reduce((acc, warning) => {
    if (!acc[warning.filepath]) {
      acc[warning.filepath] = [];
    }
    acc[warning.filepath].push(warning);
    return acc;
  }, {});

  // Shorten file path for display
  function shortenPath(filepath) {
    if (!filepath) return '';
    // Remove home directory prefix
    let shortened = filepath.replace(/^\/home\/[^/]+\/Projects\//, '');
    // If still too long, show just filename with parent dir
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
    case 'critical': return 'var(--error)';
    case 'warning': return 'var(--warning)';
    case 'info': return 'var(--info)';
    default: return 'var(--muted)';
    }
  }

  // Get category icon
  function getCategoryIcon(category) {
    const cat = categories.find(c => c.id === category);
    return cat ? cat.icon : '📋';
  }

  // Get severity stats from filtered warnings
  $: severityStats = filteredWarnings.reduce((acc, warning) => {
    acc[warning.severity] = (acc[warning.severity] || 0) + 1;
    return acc;
  }, {});

  // Count filtered warnings
  $: filteredCount = filteredWarnings.length;
</script>

<div class="pattern-warnings-panel" role="region" aria-label="Pattern warnings panel">
  <div class="panel-header">
    <div class="header-top">
      <h2 id="pattern-warnings-heading">Code Pattern Warnings</h2>
      <div class="header-actions">
        <button class="action-btn" on:click={fetchWarnings} aria-label="Refresh pattern warnings" title="Refresh">
          <span aria-hidden="true">↻</span>
        </button>
        {#if warningCount > 0}
          <div class="export-dropdown">
            <button
              class="action-btn export-btn"
              on:click={toggleExportDropdown}
              on:keydown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggleExportDropdown();
                }
                if (e.key === 'Escape' && showExportDropdown) {
                  showExportDropdown = false;
                }
              }}
              aria-label="Export warnings"
              aria-haspopup="menu"
              aria-expanded={showExportDropdown}
              title="Export"
            >
              <span aria-hidden="true">⬇</span>
            </button>
            {#if showExportDropdown}
              <div class="dropdown-menu" role="menu">
                <button
                  on:click={() => exportWarnings('csv')}
                  on:keydown={(e) => {
                    if (e.key === 'Escape') {
                      showExportDropdown = false;
                    }
                  }}
                  role="menuitem"
                  aria-label="Export as CSV"
                >
                  Export as CSV
                </button>
                <button
                  on:click={() => exportWarnings('json')}
                  on:keydown={(e) => {
                    if (e.key === 'Escape') {
                      showExportDropdown = false;
                    }
                  }}
                  role="menuitem"
                  aria-label="Export as JSON"
                >
                  Export as JSON
                </button>
              </div>
            {/if}
          </div>
          <button class="action-btn resolve-all-btn" on:click={resolveAllWarnings} aria-label="Resolve all warnings" title="Resolve All">
            <span aria-hidden="true">✓</span>
            <span class="btn-label">Resolve All</span>
          </button>
        {/if}
      </div>
    </div>
    <p class="panel-description">
      Automatic detection of problematic patterns: hardcoded secrets, debug statements, and code quality issues
    </p>
  </div>

  <!-- Filters -->
  <div class="filters-container">
    <!-- Category Filter -->
    <div class="filter-group">
      <label class="filter-label">Category:</label>
      <div class="category-filter" role="radiogroup" aria-label="Filter warnings by category">
        {#each categories as category (category)}
          <button
            class="category-btn"
            class:active={selectedCategory === category.id}
            on:click={() => selectedCategory = category.id}
            role="radio"
            aria-checked={selectedCategory === category.id}
            aria-label="{category.label} warnings filter"
          >
            <span class="category-icon" aria-hidden="true">{category.icon}</span>
            <span class="category-label">{category.label}</span>
          </button>
        {/each}
      </div>
    </div>

    <!-- Project Filter -->
    {#if projects.length > 0}
      <div class="filter-group">
        <label class="filter-label">Project:</label>
        <div class="project-filter">
          <button
            class="project-btn"
            class:active={selectedProject === 'all'}
            on:click={() => selectedProject = 'all'}
          >
            All Projects
          </button>
          {#each projects as project (project)}
            <button
              class="project-btn"
              class:active={selectedProject === project}
              on:click={() => selectedProject = project}
            >
              {project}
            </button>
          {/each}
        </div>
      </div>
    {/if}
  </div>

  <!-- Stats Bar -->
  {#if !loading && filteredCount > 0}
    <div class="stats-bar" role="region" aria-label="Warning statistics">
      <div class="stat-item">
        <span class="stat-label">Showing:</span>
        <span class="stat-value" role="status">{formatNumber(filteredCount)}</span>
        {#if filteredCount !== warningCount}
          <span class="stat-sublabel">of {formatNumber(warningCount)}</span>
        {/if}
      </div>
      {#if severityStats.critical}
        <div class="stat-item critical">
          <span class="stat-icon" aria-hidden="true">🚨</span>
          <span class="stat-value" role="status">{formatNumber(severityStats.critical)}</span>
          <span class="stat-label">Critical</span>
        </div>
      {/if}
      {#if severityStats.warning}
        <div class="stat-item warning">
          <span class="stat-icon" aria-hidden="true">⚠️</span>
          <span class="stat-value" role="status">{formatNumber(severityStats.warning)}</span>
          <span class="stat-label">Warning</span>
        </div>
      {/if}
      {#if severityStats.info}
        <div class="stat-item info">
          <span class="stat-icon" aria-hidden="true">ℹ️</span>
          <span class="stat-value" role="status">{formatNumber(severityStats.info)}</span>
          <span class="stat-label">Info</span>
        </div>
      {/if}
    </div>
  {/if}

  {#if loading}
    <LoadingSkeleton type="list" count={5} height="80px" />
  {:else if filteredCount === 0}
    <div class="empty-state" role="status">
      <div class="empty-icon" aria-hidden="true">✅</div>
      <h3>No Pattern Warnings</h3>
      <p>
        {#if warningCount === 0}
          No problematic patterns detected in your code!
        {:else if selectedProject !== 'all'}
          No warnings found for project "{selectedProject}".
        {:else if selectedCategory !== 'all'}
          No {selectedCategory} issues found.
        {:else}
          No warnings match your filters.
        {/if}
      </p>
    </div>
  {:else}
    <div class="warnings-list" role="region" aria-label="Pattern warnings grouped by file">
      {#each Object.entries(warningsByFile) as [filepath, fileWarnings] (filepath)}
        <section class="file-group" role="group" aria-label="Warnings in {filepath}">
          <div class="file-header">
            <div class="file-header-left">
              <span class="file-icon" aria-hidden="true">📄</span>
              <span class="file-path" title="{filepath}">{shortenPath(filepath)}</span>
            </div>
            <div class="file-badges">
              {#if fileWarnings[0]?.project_name}
                <span class="project-badge-file">{fileWarnings[0].project_name}</span>
              {/if}
              {#if fileWarnings.some(w => w.severity === 'critical')}
                <span class="severity-badge critical" role="status">CRITICAL</span>
              {/if}
              <span class="warning-count" role="status">{formatNumber(fileWarnings.length)}</span>
            </div>
          </div>

          <div class="warnings" role="list" aria-label="Warnings in {filepath}">
            {#each fileWarnings as warning (warning.id || warning.name || warning)}
              <article class="warning-item" style="--severity-color: {getSeverityColor(warning.severity)}" role="listitem">
                <div class="warning-header">
                  <div class="warning-title-group">
                    <span class="warning-name">{warning.pattern_name}</span>
                    <span class="severity-badge" style="background: {getSeverityColor(warning.severity)}" role="status">
                      {warning.severity}
                    </span>
                  </div>
                  <span class="line-number">Line {warning.line_number}</span>
                </div>

                <div class="warning-message">{warning.message || ''}</div>

                {#if warning.context || warning.match_text}
                  <div class="warning-code">
                    <code class="code-snippet">{warning.context || warning.match_text}</code>
                  </div>
                {/if}

                {#if warning.suggestion}
                  <div class="warning-suggestion">
                    <span class="suggestion-icon" aria-hidden="true">💡</span>
                    <span class="suggestion-text">{warning.suggestion}</span>
                  </div>
                {/if}
              </article>
            {/each}
          </div>
        </section>
      {/each}

      <!-- Load More Button -->
      {#if filteredCount > 0 && filteredCount < warningCount}
        <div class="load-more-container">
          <button class="load-more-btn" on:click={loadMore} disabled={loadingMore}>
            {#if loadingMore}
              <span class="spinner-small"></span> Loading...
            {:else}
              Load More ({formatNumber(Math.min(30, warningCount - filteredCount))} more)
            {/if}
          </button>
          <span class="load-more-info">Showing {formatNumber(filteredCount)} of {formatNumber(warningCount)}</span>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .pattern-warnings-panel {
    background: var(--surface);
    border-radius: var(--radius);
    padding: 8px;
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .panel-header {
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border);
  }

  .header-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .panel-header h2 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }

  .panel-description {
    margin: 0;
    font-size: 13px;
    color: var(--muted);
    line-height: 1.5;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .action-btn {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 3px;
    min-width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 10px;
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
    color: var(--text);
    transition: all 0.2s;
  }

  .action-btn:hover {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }

  .action-btn:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .action-btn:first-child:hover {
    transform: rotate(180deg);
  }

  .resolve-all-btn {
    background: #10b981;
    border-color: #10b981;
    color: white;
  }

  .resolve-all-btn:hover {
    background: #059669;
    border-color: #059669;
  }

  .btn-label {
    font-size: 13px;
  }

  /* Export Dropdown */
  .export-dropdown {
    position: relative;
  }

  .dropdown-menu {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 4px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 3px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    min-width: 140px;
    z-index: 1000;
    overflow: hidden;
  }

  .dropdown-menu button {
    width: 100%;
    padding: 10px 14px;
    background: transparent;
    border: none;
    text-align: left;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    color: var(--text);
    transition: background 0.2s;
  }

  .dropdown-menu button:hover {
    background: var(--surface-2);
  }

  .dropdown-menu button:not(:last-child) {
    border-bottom: 1px solid var(--border);
  }

  /* Filters */
  .filters-container {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .filter-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .filter-label {
    font-size: 12px;
    font-weight: 700;
    color: var(--text);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* Category Filter */
  .category-filter {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .category-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
    font-size: 13px;
    font-weight: 600;
    color: var(--muted);
  }

  .category-btn:hover {
    background: var(--surface);
    border-color: var(--accent);
  }

  .category-btn.active {
    background: var(--accent);
    border-color: var(--accent);
    color: white;
  }

  .category-btn:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .category-icon {
    font-size: 12px;
  }

  .category-label {
    font-size: 13px;
  }

  /* Project Filter */
  .project-filter {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .project-btn {
    padding: 8px 14px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
    font-size: 13px;
    font-weight: 600;
    color: var(--muted);
    font-family: var(--mono);
    text-transform: uppercase;
  }

  .project-btn:hover {
    background: var(--surface);
    border-color: var(--accent);
  }

  .project-btn.active {
    background: var(--accent);
    border-color: var(--accent);
    color: white;
  }

  .project-btn:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  /* Stats Bar */
  .stats-bar {
    display: flex;
    gap: 8px;
    padding: 6px 10px;
    background: var(--surface-2);
    border-radius: 4px;
    flex-wrap: wrap;
  }

  .stat-item {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .stat-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
  }

  .stat-value {
    font-size: 11px;
    font-weight: 700;
    font-family: var(--mono);
    color: var(--text);
  }

  .stat-item.critical .stat-value {
    color: var(--error);
  }

  .stat-item.warning .stat-value {
    color: var(--warning);
  }

  .stat-item.info .stat-value {
    color: var(--info);
  }

  .stat-icon {
    font-size: 12px;
  }

  .stat-sublabel {
    font-size: 11px;
    color: var(--muted);
    margin-left: 4px;
  }

  /* Loading & Empty States */
  .loading, .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 8px 12px;
    gap: 8px;
    text-align: center;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .empty-icon {
    font-size: 11px;
  }

  .empty-state h3 {
    margin: 0 0 8px 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
  }

  .empty-state p {
    margin: 0;
    font-size: 11px;
    color: var(--muted);
  }

  /* Warnings List */
  .warnings-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .file-group {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 4px;
    overflow: hidden;
  }

  .file-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 14px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }

  .file-header-left {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
    min-width: 0;
  }

  .file-icon {
    font-size: 14px;
    flex-shrink: 0;
  }

  .file-path {
    flex: 1;
    font-family: var(--mono);
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-badges {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .project-badge-file {
    padding: 3px 8px;
    border-radius: 3px;
    font-size: 11px;
    font-weight: 700;
    background: var(--accent);
    color: white;
    font-family: var(--mono);
    text-transform: uppercase;
  }

  .warning-count {
    padding: 3px 10px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 700;
    background: color-mix(in srgb, var(--error) 10%, var(--surface));
    color: var(--error);
  }

  .severity-badge {
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    color: white;
  }

  .severity-badge.critical {
    background: var(--error);
  }

  /* Warning Items */
  .warnings {
    display: flex;
    flex-direction: column;
  }

  .warning-item {
    padding: 14px 16px;
    border-bottom: 1px solid var(--border);
    border-left: 3px solid var(--severity-color);
  }

  .warning-item:last-child {
    border-bottom: none;
  }

  .warning-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 8px;
  }

  .warning-title-group {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
  }

  .warning-name {
    font-size: 13px;
    font-weight: 700;
    color: var(--text);
  }

  .line-number {
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
    font-family: var(--mono);
    white-space: nowrap;
  }

  .warning-message {
    font-size: 13px;
    color: var(--text);
    margin-bottom: 10px;
    line-height: 1.5;
  }

  .warning-code {
    margin-bottom: 10px;
  }

  .code-snippet {
    display: block;
    font-family: var(--mono);
    font-size: 13px;
    background: var(--surface);
    padding: 8px 12px;
    border-radius: 4px;
    color: var(--text);
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .warning-suggestion {
    display: flex;
    align-items: start;
    gap: 8px;
    padding: 10px 12px;
    background: color-mix(in srgb, var(--success) 10%, var(--surface));
    border-left: 3px solid var(--success);
    border-radius: 4px;
    font-size: 12px;
    color: var(--success);
    line-height: 1.5;
  }

  .suggestion-icon {
    font-size: 14px;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .suggestion-text {
    flex: 1;
  }

  /* Load More */
  .load-more-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 24px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 4px;
    margin-top: 8px;
  }

  .load-more-btn {
    padding: 12px 24px;
    background: var(--accent);
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .load-more-btn:hover:not(:disabled) {
    background: var(--accent-hover, var(--accent));
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  .load-more-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .load-more-info {
    font-size: 12px;
    color: var(--muted);
  }

  .spinner-small {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }
</style>
