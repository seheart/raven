<script>
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';
  import { notifications } from './notificationService.js';
  import { desktopNotifications } from './services/desktopNotifications.js';

  let errors = [];
  let loading = true;
  let errorCount = 0;
  let ws = null;

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
      console.error('Failed to fetch syntax errors:', error);
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
      console.error('Failed to resolve error:', error);
      notifications.error('Failed to resolve error');
    }
  }

  // Subscribe to WebSocket for real-time updates
  function setupWebSocket() {
    ws = websocketService.subscribe('syntax-error', (data) => {
      console.log('Syntax error detected:', data);

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

<div class="syntax-error-panel">
  <div class="panel-header">
    <h2>Syntax Errors</h2>
    {#if !loading}
      <span class="error-count" class:has-errors={errorCount > 0}>
        {errorCount} {errorCount === 1 ? 'error' : 'errors'}
      </span>
    {/if}
    <button class="refresh-btn" on:click={fetchErrors} title="Refresh">
      ↻
    </button>
  </div>

  {#if loading}
    <div class="loading">
      <div class="spinner"></div>
      <p>Loading syntax errors...</p>
    </div>
  {:else if errorCount === 0}
    <div class="empty-state">
      <div class="empty-icon">✅</div>
      <h3>No Syntax Errors</h3>
      <p>All your code is syntactically correct!</p>
    </div>
  {:else}
    <div class="errors-list">
      {#each Object.entries(errorsByFile) as [filepath, fileErrors]}
        <div class="file-group">
          <div class="file-header">
            <span class="file-icon">📄</span>
            <span class="file-path">{filepath}</span>
            <span class="file-error-count">{fileErrors.length}</span>
          </div>

          <div class="errors">
            {#each fileErrors as error}
              <div class="error-item" style="--severity-color: {getSeverityColor(error.severity)}">
                <div class="error-header">
                  <span class="language-icon">{getLanguageIcon(error.language)}</span>
                  <span class="error-location">
                    Line {error.line_number}
                    {#if error.column_number}
                      , Col {error.column_number}
                    {/if}
                  </span>
                  <span class="severity-badge">{error.severity}</span>
                </div>

                <div class="error-message">{error.message}</div>

                <div class="error-actions">
                  <span class="error-timestamp">
                    {new Date(error.timestamp).toLocaleString()}
                  </span>
                  <button class="resolve-btn" on:click={() => resolveError(error.id)}>
                    Mark as Resolved
                  </button>
                </div>
              </div>
            {/each}
          </div>
        </div>
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

  .error-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
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
</style>
