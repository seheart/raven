<script>
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';
  import { notifications } from './notificationService.js';
  import { desktopNotifications } from './services/desktopNotifications.js';
  import { logger } from './logger.js';
  import { settings as settingsStore } from './settingsStore.js';

  let errors = [];
  let loading = true;
  let errorCount = 0;
  let ws = null;
  let settings = {};

  // Subscribe to settings to get editor preference
  const unsubscribeSettings = settingsStore.subscribe(value => {
    settings = value;
  });

  onDestroy(() => {
    if (unsubscribeSettings) unsubscribeSettings();
  });

  // Fetch syntax errors
  async function fetchErrors() {
    try {
      loading = true;
      const response = await fetch('/api/syntax-errors?limit=50');
      if (!response.ok) throw new Error('Failed to fetch syntax errors');

      const data = await response.json();
      errors = data.errors;
      errorCount = data.count;
      loading = false;
    } catch (error) {
      logger.error('Failed to fetch syntax errors:', error);
      notifications.error('Failed to load syntax errors');
      loading = false;
    }
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

      // Show file path as fallback
      notifications.info(`File: ${filepath}:${lineNumber}`, {
        duration: 7000,
        title: 'Copy this path to open manually'
      });
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
Generated: ${new Date().toLocaleString()}
Total Errors: ${errors.length}

${'='.repeat(80)}

${allErrorsText}`;

    try {
      await navigator.clipboard.writeText(finalText);
      notifications.success(`Copied ${errors.length} errors to clipboard`);
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

    if (!confirm(`Are you sure you want to clear all ${errors.length} syntax errors?`)) {
      return;
    }

    try {
      // Resolve all errors
      const promises = errors.map(error =>
        fetch(`/api/syntax-errors/${error.id}/resolve`, { method: 'POST' })
      );

      await Promise.all(promises);

      notifications.success(`Cleared ${errors.length} syntax errors`);
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

  // Group errors by file
  $: errorsByFile = errors.reduce((acc, error) => {
    if (!acc[error.filepath]) {
      acc[error.filepath] = [];
    }
    acc[error.filepath].push(error);
    return acc;
  }, {});

  // Get severity color
  function getSeverityColor(severity) {
    switch (severity) {
    case 'error': return '#ef4444';
    case 'warning': return '#f59e0b';
    default: return '#6b7280';
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
</script>

<div class="syntax-error-panel" role="region" aria-label="Syntax errors panel">
  <div class="panel-header">
    <h2 id="syntax-errors-heading">Syntax Errors</h2>
    {#if !loading}
      <span class="error-count" class:has-errors={errorCount > 0} role="status">
        {errorCount} {errorCount === 1 ? 'error' : 'errors'}
      </span>
    {/if}
    <div class="header-actions">
      {#if errorCount > 0}
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

  {#if loading}
    <div class="loading" role="status" aria-live="polite">
      <div class="spinner" aria-hidden="true"></div>
      <p>Loading syntax errors...</p>
    </div>
  {:else if errorCount === 0}
    <div class="empty-state" role="status">
      <div class="empty-icon" aria-hidden="true">✅</div>
      <h3>No Syntax Errors</h3>
      <p>All your code is syntactically correct!</p>
    </div>
  {:else}
    <div class="errors-list" role="region" aria-label="Syntax errors grouped by file" aria-labelledby="syntax-errors-heading">
      {#each Object.entries(errorsByFile) as [filepath, fileErrors] (filepath)}
        <section class="file-group" role="group" aria-label="Errors in {filepath}">
          <div class="file-header">
            <span class="file-icon" aria-hidden="true">📄</span>
            <span class="file-path">{filepath}</span>
            <span class="file-error-count" role="status">{fileErrors.length}</span>
          </div>

          <div class="errors" role="list" aria-label="Syntax errors in {filepath}">
            {#each fileErrors as error (error.id || error.name || error)}
              <article class="error-item" style="--severity-color: {getSeverityColor(error.severity)}" role="listitem">
                <div class="error-header">
                  <span class="language-icon" aria-hidden="true">{getLanguageIcon(error.language)}</span>
                  <span class="error-location">
                    Line {error.line_number}
                    {#if error.column_number}
                      , Col {error.column_number}
                    {/if}
                  </span>
                  {#if error.project_name}
                    <span class="project-badge" role="status">{error.project_name}</span>
                  {/if}
                  <span class="severity-badge" role="status">{error.severity}</span>
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
                  <time class="error-timestamp" datetime="{error.timestamp}">
                    {new Date(error.timestamp).toLocaleString()}
                  </time>
                  <button class="resolve-btn" on:click={() => resolveError(error.id)} aria-label="Mark error on line {error.line_number} as resolved">
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
  .syntax-error-panel {
    background: var(--surface);
    border-radius: var(--radius);
    padding: 20px;
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border);
  }

  .panel-header h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    color: var(--text);
    flex: 1;
  }

  .error-count {
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 13px;
    font-weight: 600;
    background: var(--surface-2);
    color: var(--muted);
  }

  .error-count.has-errors {
    background: #fef2f2;
    color: #ef4444;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
  }

  .action-btn {
    padding: 6px 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
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
    background: #ef4444;
    border-color: #ef4444;
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
    border-radius: 6px;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 18px;
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
    padding: 60px 20px;
    gap: 16px;
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
    padding: 60px 20px;
    text-align: center;
  }

  .empty-icon {
    font-size: 64px;
    margin-bottom: 16px;
  }

  .empty-state h3 {
    margin: 0 0 8px 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--text);
  }

  .empty-state p {
    margin: 0;
    font-size: 14px;
    color: var(--muted);
  }

  .errors-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .file-group {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
  }

  .file-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }

  .file-icon {
    font-size: 16px;
  }

  .file-path {
    flex: 1;
    font-family: var(--mono);
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }

  .file-error-count {
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 11px;
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
    gap: 8px;
    margin-bottom: 8px;
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
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    background: var(--severity-color);
    color: white;
  }

  .project-badge {
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    background: #3b82f6;
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
    flex-wrap: wrap;
  }

  .open-file-btn {
    padding: 6px 12px;
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
    gap: 4px;
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
    padding: 6px 12px;
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
    gap: 4px;
  }

  .copy-btn:hover {
    background: #6366f1;
    border-color: #6366f1;
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

  .error-timestamp {
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
