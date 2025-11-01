<script>
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';
  import { notifications } from './notificationService.js';
  import { desktopNotifications } from './services/desktopNotifications.js';
  import { logger } from './logger.js';
  import { settings as settingsStore } from './settingsStore.js';
  import { formatNumber } from './numberFormat.js';
  import { formatDateTime } from './timeFormat.js';
  import LoadingSkeleton from './LoadingSkeleton.svelte';

  let errors = [];
  let loading = true;
  let errorCount = 0;
  let ws = null;
  let settings = {};
  let selectedProject = 'all';
  let projects = [];
  let limit = 30;
  let loadingMore = false;

  // Subscribe to settings to get editor preference
  const unsubscribeSettings = settingsStore.subscribe(value => {
    settings = value;
  });

  onDestroy(() => {
    if (unsubscribeSettings) unsubscribeSettings();
  });

  let error = null;

  // Fetch syntax errors
  async function fetchErrors(append = false) {
    try {
      if (append) {
        loadingMore = true;
      } else {
        loading = true;
        limit = 30; // Reset limit when fetching fresh
      }

      const response = await fetch(`/api/syntax-errors?limit=${limit}`);
      if (!response.ok) throw new Error('Failed to fetch syntax errors');

      const data = await response.json();
      errors = data.errors;
      errorCount = data.count;

      loading = false;
      loadingMore = false;
      error = null;
    } catch (err) {
      logger.error('Failed to fetch syntax errors:', err);
      notifications.error('Failed to load syntax errors');
      error = err.message || 'Failed to load syntax errors';
      loading = false;
      loadingMore = false;
    }
  }

  // Load more errors
  async function loadMore() {
    limit += 30;
    await fetchErrors(true);
  }

  // Resolve error
  async function resolveError(errorId) {
    try {
      const response = await fetch(`/api/syntax-errors/${errorId}/resolve`, {
        method: 'POST'
      });

      if (!response.ok) throw new Error('Failed to resolve error');

      notifications.success('Error marked as resolved');
      await fetchErrors();
    } catch (error) {
      logger.error('Failed to resolve error:', error);
      notifications.error('Failed to resolve error');
    }
  }

  // Open file in editor
  async function openFile(filepath, lineNumber) {
    try {
      const editor = settings.editor?.defaultEditor || 'auto';

      const response = await fetch('/api/open-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filepath,
          lineNumber,
          editor
        })
      });

      const result = await response.json();

      if (result.success) {
        const editorName = result.editor === 'auto' ? 'default editor' : result.editor;
        notifications.success(`Opening in ${editorName}...`);

        if (result.fallback) {
          notifications.info('Your configured editor was not found, opened with system default', {
            duration: 5000
          });
        }
      } else {
        throw new Error(result.message || 'Failed to open file');
      }
    } catch (error) {
      logger.error('Failed to open file:', error);
      notifications.error(`Failed to open file: ${error.message}`);

      // Auto-copy file path to clipboard
      try {
        const fileLocation = `${filepath}:${lineNumber}`;
        await navigator.clipboard.writeText(fileLocation);
        notifications.success(`File path copied: ${fileLocation}`, {
          duration: 7000,
          title: 'Paste this in your editor'
        });
      } catch (copyError) {
        // If clipboard fails, just show the path
        notifications.info(`File: ${filepath}:${lineNumber}`, {
          duration: 7000,
          title: 'Copy this path to open manually'
        });
      }

      // Also show help for configuring editor
      setTimeout(() => {
        notifications.info('Tip: Configure your default editor in Settings to use "Open File" feature', {
          duration: 8000
        });
      }, 1000);
    }
  }

  // Copy error details to clipboard
  async function copyError(error) {
    const errorText = `Syntax Error in ${error.filepath}

Project: ${error.project_name || 'N/A'}
Language: ${error.language}
Location: Line ${error.line_number}${error.column_number ? `, Column ${error.column_number}` : ''}
Severity: ${error.severity}
Message: ${error.message}

${error.code_snippet ? 'Code:\n' + error.code_snippet : ''}`;

    try {
      await navigator.clipboard.writeText(errorText);
      notifications.success('Error details copied to clipboard');
    } catch (err) {
      logger.error('Failed to copy to clipboard:', err);
      notifications.error('Failed to copy to clipboard');
    }
  }

  // Copy all errors to clipboard
  async function copyAllErrors() {
    if (errors.length === 0) {
      notifications.info('No errors to copy');
      return;
    }

    const allErrorsText = errors.map((error, index) => {
      return `[${index + 1}/${errors.length}] Syntax Error in ${error.filepath}

Project: ${error.project_name || 'N/A'}
Language: ${error.language}
Location: Line ${error.line_number}${error.column_number ? `, Column ${error.column_number}` : ''}
Severity: ${error.severity}
Message: ${error.message}

${error.code_snippet ? 'Code:\n' + error.code_snippet : ''}`;
    }).join('\n\n' + '='.repeat(80) + '\n\n');

    const finalText = `Syntax Errors Report
Generated: ${formatDateTime(new Date())}
Total Errors: ${errors.length}

${'='.repeat(80)}

${allErrorsText}`;

    try {
      await navigator.clipboard.writeText(finalText);
      notifications.success(`Copied ${formatNumber(errors.length)} errors to clipboard`);
    } catch (err) {
      logger.error('Failed to copy all errors:', err);
      notifications.error('Failed to copy to clipboard');
    }
  }

  // Clear all errors
  async function clearAllErrors() {
    if (errors.length === 0) {
      notifications.info('No errors to clear');
      return;
    }

    if (!confirm(`Are you sure you want to clear all ${formatNumber(errors.length)} syntax errors?`)) {
      return;
    }

    try {
      // Resolve all errors
      const promises = errors.map(error =>
        fetch(`/api/syntax-errors/${error.id}/resolve`, { method: 'POST' })
      );

      await Promise.all(promises);

      notifications.success(`Cleared ${formatNumber(errors.length)} syntax errors`);
      await fetchErrors();
    } catch (err) {
      logger.error('Failed to clear errors:', err);
      notifications.error('Failed to clear errors');
    }
  }

  // Subscribe to WebSocket for real-time updates
  function setupWebSocket() {
    ws = websocketService.subscribe('syntax-error', (data) => {
      logger.info('Syntax error detected:', data);

      // Show desktop notification for critical syntax errors
      if (data.errors && data.errors.length > 0) {
        const firstError = data.errors[0];
        desktopNotifications.alertSyntaxError(
          data.filepath,
          firstError.message
        );
      }

      // Refresh error list
      fetchErrors();
    });
  }

  onMount(() => {
    fetchErrors();
    setupWebSocket();
  });

  onDestroy(() => {
    if (ws) ws();
  });

  // Extract unique projects from all errors
  $: {
    const uniqueProjects = [...new Set(errors.map(e => e.project_name).filter(Boolean))];
    projects = uniqueProjects.sort();
  }

  // Filter errors by selected project
  $: filteredErrors = selectedProject === 'all'
    ? errors
    : errors.filter(e => e.project_name === selectedProject);

  // Group filtered errors by file
  $: errorsByFile = filteredErrors.reduce((acc, error) => {
    if (!acc[error.filepath]) {
      acc[error.filepath] = [];
    }
    acc[error.filepath].push(error);
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
    case 'error': return 'var(--error)';
    case 'warning': return 'var(--warning)';
    default: return 'var(--muted)';
    }
  }

  // Get language icon
  function getLanguageIcon(language) {
    const icons = {
      javascript: '🟨',
      typescript: '🔷',
      python: '🐍',
      json: '📋',
      yaml: '📄'
    };
    return icons[language] || '📝';
  }

  // Count filtered errors
  $: filteredCount = filteredErrors.length;
</script>

<div class="syntax-error-panel" role="region" aria-label="Syntax errors panel">
  <div class="panel-header">
    <div class="header-top">
      <h2 id="syntax-errors-heading">Syntax Errors</h2>
      {#if !loading}
        <span class="error-count" class:has-errors={filteredCount > 0} role="status">
          {formatNumber(filteredCount)} {filteredCount === 1 ? 'error' : 'errors'}
          {#if filteredCount !== errorCount}
            <span class="total-count">of {formatNumber(errorCount)}</span>
          {/if}
        </span>
      {/if}
      <div class="header-actions">
        {#if filteredCount > 0}
          <button class="action-btn copy-all-btn" on:click={copyAllErrors} aria-label="Copy all errors">
            <span aria-hidden="true">📋</span> Copy All
          </button>
          <button class="action-btn clear-all-btn" on:click={clearAllErrors} aria-label="Clear all errors">
            <span aria-hidden="true">🗑️</span> Clear All
          </button>
        {/if}
        <button class="refresh-btn" on:click={fetchErrors} aria-label="Refresh syntax errors">
          <span aria-hidden="true">↻</span>
        </button>
      </div>
    </div>

    <!-- Project Filter -->
    {#if projects.length > 0}
      <div class="filter-section">
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

  {#if error}
    <div class="error-state" role="alert">
      <p>Error: {error}</p>
      <button class="btn-retry" on:click={fetchErrors} aria-label="Retry loading syntax errors">
        Retry
      </button>
    </div>
  {:else if loading}
    <LoadingSkeleton type="list" count={5} height="80px" />
  {:else if filteredCount === 0}
    <div class="empty-state" role="status">
      <div class="empty-icon" aria-hidden="true">✅</div>
      <h3>No Syntax Errors</h3>
      <p>
        {#if errorCount === 0}
          All your code is syntactically correct!
        {:else if selectedProject !== 'all'}
          No errors found in project "{selectedProject}".
        {:else}
          No errors match your filters.
        {/if}
      </p>
    </div>
  {:else}
    <div class="errors-list" role="region" aria-label="Syntax errors grouped by file" aria-labelledby="syntax-errors-heading">
      {#each Object.entries(errorsByFile) as [filepath, fileErrors] (filepath)}
        <section class="file-group" role="group" aria-label="Errors in {filepath}">
          <div class="file-header">
            <div class="file-header-left">
              <span class="file-icon" aria-hidden="true">📄</span>
              <span class="file-path" title="{filepath}">{shortenPath(filepath)}</span>
            </div>
            <div class="file-badges">
              {#if fileErrors[0]?.project_name}
                <span class="project-badge-file">{fileErrors[0].project_name}</span>
              {/if}
              <span class="file-error-count" role="status">{formatNumber(fileErrors.length)}</span>
            </div>
          </div>

          <div class="errors" role="list" aria-label="Syntax errors in {filepath}">
            {#each fileErrors as error (error.id || error.name || error)}
              <article class="error-item" style="--severity-color: {getSeverityColor(error.severity)}" role="listitem">
                <div class="error-header">
                  <div class="error-title-group">
                    <span class="language-icon" aria-hidden="true">{getLanguageIcon(error.language)}</span>
                    <span class="severity-badge" role="status">{error.severity}</span>
                  </div>
                  <span class="error-location">
                    Line {error.line_number}
                    {#if error.column_number}, Col {error.column_number}{/if}
                  </span>
                </div>

                <div class="error-message">{error.message}</div>

                {#if error.code_snippet}
                  <pre class="code-snippet" aria-label="Code snippet showing error context"><code>{error.code_snippet}</code></pre>
                {/if}

                <div class="error-actions">
                  <button class="open-file-btn" on:click={() => openFile(error.filepath, error.line_number)} aria-label="Open {error.filepath} at line {error.line_number}">
                    📂 Open File
                  </button>
                  <button class="copy-btn" on:click={() => copyError(error)} aria-label="Copy error details">
                    📋 Copy
                  </button>
                </div>
              </article>
            {/each}
          </div>
        </section>
      {/each}

      <!-- Load More Button -->
      {#if filteredCount > 0 && filteredCount < errorCount}
        <div class="load-more-container">
          <button class="load-more-btn" on:click={loadMore} disabled={loadingMore}>
            {#if loadingMore}
              <span class="spinner-small"></span> Loading...
            {:else}
              Load More ({formatNumber(Math.min(30, errorCount - filteredCount))} more)
            {/if}
          </button>
          <span class="load-more-info">Showing {formatNumber(filteredCount)} of {formatNumber(errorCount)}</span>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .syntax-error-panel {
    background: var(--surface);
    border-radius: var(--radius);
    padding: 8px;
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .panel-header {
    margin-bottom: 8px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border);
  }

  .header-top {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }

  .panel-header h2 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
    flex: 1;
  }

  .error-count {
    padding: 4px 12px;
    border-radius: 3px;
    font-size: 13px;
    font-weight: 600;
    background: var(--surface-2);
    color: var(--muted);
  }

  .error-count.has-errors {
    background: #fef2f2;
    color: #ef4444;
  }

  .total-count {
    font-size: 12px;
    color: var(--muted);
    margin-left: 4px;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
  }

  /* Filter Section */
  .filter-section {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .filter-label {
    font-size: 12px;
    font-weight: 700;
    color: var(--text);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .project-filter {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .project-btn {
    padding: 6px 12px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
    font-size: 12px;
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

  .action-btn {
    padding: 6px 12px;
    border: 1px solid var(--border);
    border-radius: 3px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .copy-all-btn {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }

  .copy-all-btn:hover {
    background: var(--accent-hover, var(--accent));
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .clear-all-btn {
    background: var(--surface-2);
    color: var(--text);
  }

  .clear-all-btn:hover {
    background: var(--error);
    border-color: var(--error);
    color: white;
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .action-btn:active {
    transform: translateY(0);
  }

  .action-btn:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .refresh-btn {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 3px;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.2s;
  }

  .refresh-btn:hover {
    background: var(--accent);
    color: white;
    transform: rotate(180deg);
  }

  .refresh-btn:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 8px 12px;
    gap: 8px;
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

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 8px 12px;
    text-align: center;
  }

  .empty-icon {
    font-size: 11px;
    margin-bottom: 6px;
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

  .errors-list {
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

  .file-error-count {
    padding: 3px 10px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 700;
    background: #fef2f2;
    color: #ef4444;
  }

  .errors {
    display: flex;
    flex-direction: column;
  }

  .error-item {
    padding: 16px;
    border-bottom: 1px solid var(--border);
    border-left: 3px solid var(--severity-color);
  }

  .error-item:last-child {
    border-bottom: none;
  }

  .error-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
  }

  .error-title-group {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .language-icon {
    font-size: 14px;
  }

  .error-location {
    font-family: var(--mono);
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
  }

  .severity-badge {
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    background: var(--severity-color);
    color: white;
  }

  .error-message {
    font-family: var(--mono);
    font-size: 13px;
    color: var(--text);
    line-height: 1.6;
    margin-bottom: 12px;
    padding: 8px 12px;
    background: var(--surface);
    border-radius: 4px;
  }

  .code-snippet {
    font-family: var(--mono);
    font-size: 12px;
    line-height: 1.6;
    margin: 12px 0;
    padding: 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    overflow-x: auto;
    color: var(--text);
  }

  .code-snippet code {
    white-space: pre;
    display: block;
  }

  .error-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
  }

  .open-file-btn {
    padding: 8px 14px;
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    background: var(--accent);
    color: white;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .open-file-btn:hover {
    background: var(--accent-hover, var(--accent));
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .open-file-btn:active {
    transform: translateY(0);
  }

  .open-file-btn:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .copy-btn {
    padding: 8px 14px;
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .copy-btn:hover {
    background: var(--info);
    border-color: var(--info);
    color: white;
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .copy-btn:active {
    transform: translateY(0);
  }

  .copy-btn:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
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

  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 32px 16px;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 4px;
    text-align: center;
  }

  .error-state p {
    margin: 0;
    color: #991b1b;
    font-size: 13px;
    font-weight: 500;
  }

  .btn-retry {
    padding: 8px 16px;
    background: var(--error);
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .btn-retry:hover {
    background: #dc2626;
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .btn-retry:focus {
    outline: 2px solid var(--error);
    outline-offset: 2px;
  }
</style>
