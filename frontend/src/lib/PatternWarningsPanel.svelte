<script>
  import { logger } from './logger.js';
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';
  import { notifications } from './notificationService.js';
  import { desktopNotifications } from './services/desktopNotifications.js';
  import { formatNumber } from './numberFormat.js';
  import { formatDateTime } from './timeFormat.js';

  let warnings = [];
  let loading = true;
  let warningCount = 0;
  let ws = null;
  let selectedCategory = 'all';

  const categories = [
    { id: 'all', label: 'All', icon: '🔍' },
    { id: 'security', label: 'Security', icon: '🔒' },
    { id: 'quality', label: 'Quality', icon: '✨' },
    { id: 'maintenance', label: 'Maintenance', icon: '🔧' },
    { id: 'performance', label: 'Performance', icon: '⚡' }
  ];

  // Fetch warnings
  async function fetchWarnings() {
    try {
      loading = true;
      const url = selectedCategory === 'all'
        ? '/api/pattern-warnings?limit=100'
        : `/api/pattern-warnings/category/${selectedCategory}`;

      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch warnings');

      const data = await response.json();
      warnings = data.warnings;
      warningCount = data.count;
      loading = false;
    } catch (error) {
      logger.error('Failed to fetch pattern warnings:', error);
      notifications.error('Failed to load pattern warnings');
      loading = false;
    }
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
    } catch (error) {
      logger.error('Failed to export warnings:', error);
      notifications.error('Failed to export warnings');
    }
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

  // Watch category changes
  $: if (selectedCategory !== undefined) {
    fetchWarnings();
  }

  // Group warnings by file
  $: warningsByFile = warnings.reduce((acc, warning) => {
    if (!acc[warning.filepath]) {
      acc[warning.filepath] = [];
    }
    acc[warning.filepath].push(warning);
    return acc;
  }, {});

  // Get severity color
  function getSeverityColor(severity) {
    switch (severity) {
    case 'critical': return '#ef4444';
    case 'warning': return '#f59e0b';
    case 'info': return '#3b82f6';
    default: return '#6b7280';
    }
  }

  // Get category icon
  function getCategoryIcon(category) {
    const cat = categories.find(c => c.id === category);
    return cat ? cat.icon : '📋';
  }

  // Get severity stats
  $: severityStats = warnings.reduce((acc, warning) => {
    acc[warning.severity] = (acc[warning.severity] || 0) + 1;
    return acc;
  }, {});
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
            <button class="action-btn export-btn" aria-label="Export warnings" title="Export">
              <span aria-hidden="true">⬇</span>
            </button>
            <div class="dropdown-menu">
              <button on:click={() => exportWarnings('csv')} aria-label="Export as CSV">
                Export as CSV
              </button>
              <button on:click={() => exportWarnings('json')} aria-label="Export as JSON">
                Export as JSON
              </button>
            </div>
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

  <!-- Category Filter -->
  <div class="category-filter" role="radiogroup" aria-label="Filter warnings by category" aria-labelledby="pattern-warnings-heading">
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

  <!-- Stats Bar -->
  {#if !loading && warningCount > 0}
    <div class="stats-bar" role="region" aria-label="Warning statistics">
      <div class="stat-item">
        <span class="stat-label">Total:</span>
        <span class="stat-value" role="status">{formatNumber(warningCount)}</span>
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
    <div class="loading" role="status" aria-live="polite">
      <div class="spinner" aria-hidden="true"></div>
      <p>Loading pattern warnings...</p>
    </div>
  {:else if warningCount === 0}
    <div class="empty-state" role="status">
      <div class="empty-icon" aria-hidden="true">✅</div>
      <h3>No Pattern Warnings</h3>
      <p>
        {#if selectedCategory === 'all'}
          No problematic patterns detected in your code!
        {:else}
          No {selectedCategory} issues found.
        {/if}
      </p>
    </div>
  {:else}
    <div class="warnings-list" role="region" aria-label="Pattern warnings grouped by file">
      {#each Object.entries(warningsByFile) as [filepath, fileWarnings] (filepath)}
        <section class="file-group" role="group" aria-label="Warnings in {filepath}">
          <div class="file-header">
            <span class="file-icon" aria-hidden="true">📄</span>
            <span class="file-path">{filepath}</span>
            <div class="file-badges">
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
                  <span class="category-icon" aria-hidden="true">{getCategoryIcon(warning.category)}</span>
                  <span class="warning-name">{warning.pattern_name}</span>
                  <span class="severity-badge" style="background: {getSeverityColor(warning.severity)}" role="status">
                    {warning.severity}
                  </span>
                </div>

                {#if warning.project_name}
                  <div class="warning-project">
                    <span class="project-label">Project:</span>
                    <span class="project-name">{warning.project_name}</span>
                  </div>
                {/if}

                <div class="warning-description">{warning.message || ''}</div>

                <div class="warning-location">
                  <span class="location-label">Line {warning.line_number}:</span>
                  <code class="warning-context">{warning.context || ''}</code>
                </div>

                {#if warning.match_text}
                  <div class="warning-match">
                    <span class="match-label">Matched:</span>
                    <code class="match-text">{warning.match_text}</code>
                  </div>
                {/if}

                <div class="warning-actions">
                  <time class="warning-timestamp" datetime="{warning.timestamp}">
                    {formatDateTime(warning.timestamp)}
                  </time>
                  <button class="resolve-btn" on:click={() => resolveWarning(warning.id)} aria-label="Mark {warning.pattern_name} as resolved">
                    Mark as Resolved
                  </button>
                </div>
              </article>
            {/each}
          </div>
        </section>
      {/each}
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

  .export-dropdown:hover .dropdown-menu {
    display: block;
  }

  .dropdown-menu {
    display: none;
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
    font-size: 11px;
  }

  .category-label {
    font-size: 13px;
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
    color: #ef4444;
  }

  .stat-item.warning .stat-value {
    color: #f59e0b;
  }

  .stat-item.info .stat-value {
    color: #3b82f6;
  }

  .stat-icon {
    font-size: 11px;
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
    gap: 8px;
    padding: 6px 10px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }

  .file-icon {
    font-size: 11px;
  }

  .file-path {
    flex: 1;
    font-family: var(--mono);
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }

  .file-badges {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .warning-count {
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
    background: #fef2f2;
    color: #ef4444;
  }

  .severity-badge {
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    color: white;
  }

  .severity-badge.critical {
    background: #ef4444;
  }

  /* Warning Items */
  .warnings {
    display: flex;
    flex-direction: column;
  }

  .warning-item {
    padding: 16px;
    border-bottom: 1px solid var(--border);
    border-left: 3px solid var(--severity-color);
  }

  .warning-item:last-child {
    border-bottom: none;
  }

  .warning-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .warning-name {
    flex: 1;
    font-size: 11px;
    font-weight: 600;
    color: var(--text);
  }

  .warning-project {
    margin-bottom: 8px;
    font-size: 12px;
  }

  .project-label {
    font-weight: 600;
    color: var(--muted);
    margin-right: 6px;
  }

  .project-name {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--accent);
    font-weight: 600;
  }

  .warning-description {
    font-size: 13px;
    color: var(--muted);
    margin-bottom: 12px;
    line-height: 1.5;
  }

  .warning-location, .warning-match {
    margin-bottom: 8px;
    font-size: 12px;
  }

  .location-label, .match-label {
    font-weight: 600;
    color: var(--muted);
    margin-right: 8px;
  }

  .warning-context, .match-text {
    font-family: var(--mono);
    font-size: 12px;
    background: var(--surface);
    padding: 4px 8px;
    border-radius: 4px;
    color: var(--text);
  }

  .match-text {
    color: var(--severity-color);
    font-weight: 600;
  }

  .warning-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 12px;
  }

  .warning-timestamp {
    font-size: 11px;
    color: var(--muted);
  }

  .resolve-btn {
    padding: 6px 12px;
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    transition: all 0.2s;
  }

  .resolve-btn:hover {
    background: #10b981;
    border-color: #10b981;
    color: white;
  }

  .resolve-btn:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
