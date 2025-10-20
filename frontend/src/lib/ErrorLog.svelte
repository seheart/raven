<script>
  import { onMount, onDestroy } from 'svelte';
  import { fetchErrorLogs, fetchErrorStats, clearErrorLogs, logError } from './errorLogger.js';
  import { formatDateTime } from './timeFormat.js';
  import io from 'socket.io-client';

  let errors = [];
  let stats = { total: 0, by_severity: [], recent_count: 0 };
  let searchQuery = '';
  let severityFilter = 'all';
  let loading = true;
  let error = null;
  let selectedError = null;
  let socket = null;
  let loadErrorsTimeout = null;

  // Pagination
  let currentPage = 0;
  let pageSize = 50;
  let totalErrors = 0;
  let hasMore = false;

  // Stats breakdown
  let severityStats = {
    error: 0,
    warning: 0,
    info: 0
  };

  onMount(async () => {
    await loadErrors();
    await loadStats();
    setupWebSocket();
  });

  onDestroy(() => {
    if (socket) {
      socket.disconnect();
    }

    // Clean up pending timeout
    if (loadErrorsTimeout) {
      clearTimeout(loadErrorsTimeout);
    }
  });

  function setupWebSocket() {
    socket = io('http://localhost:3030');

    socket.on('connect', () => {
      console.log('🔌 Connected to error log WebSocket');
    });

    socket.on('error-logged', (errorData) => {
      console.log('📥 New error received:', errorData);
      // Debounce to prevent race conditions from rapid events
      clearTimeout(loadErrorsTimeout);
      loadErrorsTimeout = setTimeout(() => {
        loadErrors();
        loadStats();
      }, 300);
    });

    socket.on('disconnect', () => {
      console.log('🔌 Disconnected from error log WebSocket');
    });
  }

  async function loadErrors() {
    try {
      loading = true;
      error = null;

      const result = await fetchErrorLogs({
        limit: pageSize,
        offset: currentPage * pageSize,
        search: searchQuery,
        severity: severityFilter
      });

      errors = result.errors;
      totalErrors = result.total;
      hasMore = result.hasMore;
    } catch (err) {
      error = err.message;
      console.error('Failed to load errors:', err);
    } finally {
      loading = false;
    }
  }

  async function loadStats() {
    try {
      stats = await fetchErrorStats();

      // Build severity breakdown
      severityStats = {
        error: 0,
        warning: 0,
        info: 0
      };

      stats.by_severity?.forEach(s => {
        if (s.severity && severityStats.hasOwnProperty(s.severity)) {
          severityStats[s.severity] = s.count;
        }
      });
    } catch (err) {
      console.error('Failed to load error stats:', err);
    }
  }

  async function handleSearch() {
    currentPage = 0;
    await loadErrors();
  }

  async function handleSeverityFilter(severity) {
    severityFilter = severity;
    currentPage = 0;
    await loadErrors();
  }

  async function handleClearAll() {
    if (!confirm('Are you sure you want to clear all error logs?')) {
      return;
    }

    try {
      const result = await clearErrorLogs();
      alert(result.message);
      await loadErrors();
      await loadStats();
    } catch (err) {
      alert('Failed to clear error logs: ' + err.message);
    }
  }

  async function handleClearOld() {
    const days = prompt('Clear errors older than how many days?', '7');
    if (!days) return;

    try {
      const result = await clearErrorLogs(parseInt(days));
      alert(result.message);
      await loadErrors();
      await loadStats();
    } catch (err) {
      alert('Failed to clear old error logs: ' + err.message);
    }
  }

  function toggleError(err) {
    if (selectedError?.id === err.id) {
      selectedError = null;
    } else {
      selectedError = err;
    }
  }

  function nextPage() {
    if (hasMore) {
      currentPage++;
      loadErrors();
    }
  }

  function prevPage() {
    if (currentPage > 0) {
      currentPage--;
      loadErrors();
    }
  }

  function getSeverityColor(severity) {
    switch (severity) {
      case 'error': return 'var(--error)';
      case 'warning': return 'var(--warning)';
      case 'info': return 'var(--info)';
      default: return 'var(--muted)';
    }
  }

  function getSeverityIcon(severity) {
    switch (severity) {
      case 'error': return '❌';
      case 'warning': return '⚠️';
      case 'info': return 'ℹ️';
      default: return '📝';
    }
  }

  function formatTimestamp(timestamp) {
    return formatDateTime(timestamp);
  }

  function formatRelativeTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  }

  async function triggerTestError() {
    try {
      await logError(
        new Error('This is a test error from ErrorLog component'),
        'ErrorLog',
        { test: true, user_action: 'test_button_click' },
        'warning'
      );
      // Reload after a short delay to let the backend process it
      setTimeout(() => {
        loadErrors();
        loadStats();
      }, 200);
    } catch (err) {
      alert('Failed to log test error: ' + err.message);
    }
  }

  async function exportLog() {
    try {
      const result = await fetchErrorLogs({ limit: 10000 });
      const json = JSON.stringify(result.errors, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `raven-error-log-${Date.now()}.json`;
      a.click();

      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Export failed: ' + err.message);
    }
  }
</script>

<div class="error-log">
  <div class="log-header">
    <div class="header-title">
      <h1>⚠️ Error Log</h1>
      <p class="subtitle">Application errors and warnings</p>
    </div>
    <div class="header-actions">
      <button class="btn-test" on:click={triggerTestError}>
        🧪 Test Error
      </button>
      <button class="btn-export" on:click={exportLog}>
        💾 Export JSON
      </button>
    </div>
  </div>

  <!-- Stats Bar -->
  <div class="stats-bar">
    <div class="stat-item">
      <span class="stat-label">Total</span>
      <span class="stat-value">{stats.total}</span>
    </div>
    <div class="stat-item">
      <span class="stat-label">Last Hour</span>
      <span class="stat-value">{stats.recent_count}</span>
    </div>
    <div class="stat-item error">
      <span class="stat-label">Errors</span>
      <span class="stat-value">{severityStats.error}</span>
    </div>
    <div class="stat-item warning">
      <span class="stat-label">Warnings</span>
      <span class="stat-value">{severityStats.warning}</span>
    </div>
    <div class="stat-item info">
      <span class="stat-label">Info</span>
      <span class="stat-value">{severityStats.info}</span>
    </div>
  </div>

  <!-- Search and Filters -->
  <div class="controls">
    <div class="search-bar">
      <input
        type="text"
        placeholder="Search errors..."
        bind:value={searchQuery}
        on:keydown={(e) => e.key === 'Enter' && handleSearch()}
      />
      <button on:click={handleSearch}>🔍 Search</button>
    </div>

    <div class="filter-tabs">
      <button
        class="filter-tab"
        class:active={severityFilter === 'all'}
        on:click={() => handleSeverityFilter('all')}
      >
        All ({totalErrors})
      </button>
      <button
        class="filter-tab"
        class:active={severityFilter === 'error'}
        on:click={() => handleSeverityFilter('error')}
      >
        ❌ Errors ({severityStats.error})
      </button>
      <button
        class="filter-tab"
        class:active={severityFilter === 'warning'}
        on:click={() => handleSeverityFilter('warning')}
      >
        ⚠️ Warnings ({severityStats.warning})
      </button>
      <button
        class="filter-tab"
        class:active={severityFilter === 'info'}
        on:click={() => handleSeverityFilter('info')}
      >
        ℹ️ Info ({severityStats.info})
      </button>
    </div>

    <div class="action-buttons">
      <button on:click={handleClearOld}>🗑️ Clear Old</button>
      <button class="btn-danger" on:click={handleClearAll}>🗑️ Clear All</button>
    </div>
  </div>

  <!-- Error Timeline -->
  <div class="timeline">
    {#if loading && errors.length === 0}
      <div class="loading-state">
        <div class="spinner"></div>
        <p>Loading error log...</p>
      </div>
    {:else if error}
      <div class="error-state">
        <div class="error-icon">❌</div>
        <h2>Failed to Load Errors</h2>
        <p>{error}</p>
      </div>
    {:else if errors.length === 0}
      <div class="empty-state">
        <div class="empty-icon">✅</div>
        <h2>No Errors Found</h2>
        <p>Your application is running smoothly!</p>
      </div>
    {:else}
      {#each errors as err (err.id)}
        <div class="error-item" class:expanded={selectedError?.id === err.id}>
          <div class="error-header" on:click={() => toggleError(err)}>
            <div class="error-left">
              <span class="expand-arrow">{selectedError?.id === err.id ? '▼' : '▶'}</span>
              <span class="error-icon" style="color: {getSeverityColor(err.severity)}">
                {getSeverityIcon(err.severity)}
              </span>
              <div class="error-info">
                <div class="error-message">{err.message}</div>
                <div class="error-meta">
                  <span class="meta-item">{err.error_type}</span>
                  <span class="meta-separator">•</span>
                  <span class="meta-item">{err.component || 'Unknown'}</span>
                  <span class="meta-separator">•</span>
                  <span class="meta-item">{formatRelativeTime(err.timestamp)}</span>
                </div>
              </div>
            </div>
            <div class="error-right">
              <span class="error-time">{formatTimestamp(err.timestamp)}</span>
              <span class="error-severity" style="border-color: {getSeverityColor(err.severity)}; color: {getSeverityColor(err.severity)}">
                {err.severity}
              </span>
            </div>
          </div>

          {#if selectedError?.id === err.id}
            <div class="error-details">
              <div class="details-grid">
                <div class="detail-item">
                  <span class="detail-label">ID:</span>
                  <span class="detail-value">{err.id}</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">Type:</span>
                  <span class="detail-value">{err.error_type}</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">Severity:</span>
                  <span class="detail-value" style="color: {getSeverityColor(err.severity)}">{err.severity}</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">Component:</span>
                  <span class="detail-value">{err.component || 'Unknown'}</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">Timestamp:</span>
                  <span class="detail-value">{err.timestamp}</span>
                </div>
                {#if err.url}
                  <div class="detail-item">
                    <span class="detail-label">URL:</span>
                    <span class="detail-value url">{err.url}</span>
                  </div>
                {/if}
              </div>

              {#if err.stack}
                <div class="stack-section">
                  <h4>Stack Trace</h4>
                  <pre class="stack-code">{err.stack}</pre>
                </div>
              {/if}

              {#if err.metadata}
                <div class="metadata-section">
                  <h4>Metadata</h4>
                  <pre class="metadata-code">{JSON.stringify(err.metadata, null, 2)}</pre>
                </div>
              {/if}

              {#if err.user_agent}
                <div class="metadata-section">
                  <h4>User Agent</h4>
                  <pre class="metadata-code">{err.user_agent}</pre>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/each}

      <!-- Pagination -->
      <div class="pagination">
        <button on:click={prevPage} disabled={currentPage === 0}>← Previous</button>
        <span class="page-info">
          Page {currentPage + 1} • {currentPage * pageSize + 1}-{Math.min((currentPage + 1) * pageSize, totalErrors)} of {totalErrors}
        </span>
        <button on:click={nextPage} disabled={!hasMore}>Next →</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .error-log {
    padding: 24px;
    max-width: 1600px;
    margin: 0 auto;
  }

  .log-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 2px solid var(--border);
  }

  .header-title h1 {
    margin: 0 0 4px 0;
    font-size: 18px;
    color: var(--text);
  }

  .subtitle {
    margin: 0;
    font-size: 12px;
    color: var(--muted);
  }

  .header-actions {
    display: flex;
    gap: 12px;
  }

  .btn-export,
  .btn-test {
    padding: 10px 20px;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    transition: all 0.2s;
  }

  .btn-test {
    background: var(--warning);
    border-color: var(--warning);
    color: white;
  }

  .btn-export:hover,
  .btn-test:hover {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .btn-test:hover {
    background: color-mix(in srgb, var(--warning) 80%, black);
  }

  .stats-bar {
    display: flex;
    gap: 12px;
    margin-bottom: 24px;
  }

  .stat-item {
    flex: 1;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .stat-item.error {
    border-left: 3px solid var(--error);
  }

  .stat-item.warning {
    border-left: 3px solid var(--warning);
  }

  .stat-item.info {
    border-left: 3px solid var(--info);
  }

  .stat-label {
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
    font-weight: 600;
  }

  .stat-value {
    font-size: 13px;
    color: var(--text);
    font-family: var(--mono);
    font-weight: 700;
  }

  .controls {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-bottom: 24px;
    background: var(--surface);
    padding: 20px;
    border-radius: 8px;
    border: 1px solid var(--border);
  }

  .search-bar {
    display: flex;
    gap: 12px;
  }

  .search-bar input {
    flex: 1;
    padding: 10px 16px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    font-size: 12px;
    font-family: var(--mono);
  }

  .search-bar input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .search-bar button {
    padding: 10px 20px;
    background: var(--accent);
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    transition: all 0.2s;
  }

  .search-bar button:hover {
    background: color-mix(in srgb, var(--accent) 80%, black);
  }

  .filter-tabs {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .filter-tab {
    padding: 8px 16px;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    transition: all 0.2s;
  }

  .filter-tab:hover {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .filter-tab.active {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }

  .action-buttons {
    display: flex;
    gap: 8px;
  }

  .action-buttons button {
    padding: 8px 16px;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.2s;
  }

  .action-buttons button:hover {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .btn-danger {
    background: var(--error) !important;
    border-color: var(--error) !important;
    color: white !important;
  }

  .btn-danger:hover {
    background: color-mix(in srgb, var(--error) 80%, black) !important;
  }

  .timeline {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .loading-state,
  .error-state,
  .empty-state {
    text-align: center;
    padding: 60px 20px;
    color: var(--muted);
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 4px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 16px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .empty-icon,
  .error-icon {
    font-size: 13px;
    margin-bottom: 16px;
  }

  .empty-state h2,
  .error-state h2 {
    font-size: 18px;
    margin: 0 0 8px 0;
    color: var(--text);
  }

  .error-item {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
    transition: all 0.2s;
  }

  .error-item:hover {
    border-color: var(--accent);
    box-shadow: 0 2px 8px color-mix(in srgb, var(--accent) 20%, transparent);
  }

  .error-item.expanded {
    border-color: var(--accent);
  }

  .error-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    cursor: pointer;
    user-select: none;
  }

  .error-left {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
    min-width: 0;
  }

  .expand-arrow {
    font-size: 10px;
    color: var(--muted);
    width: 12px;
    flex-shrink: 0;
  }

  .error-icon {
    font-size: 13px;
    flex-shrink: 0;
  }

  .error-info {
    flex: 1;
    min-width: 0;
  }

  .error-message {
    font-size: 13px;
    color: var(--text);
    font-weight: 500;
    margin-bottom: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .error-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--muted);
  }

  .meta-item {
    font-family: var(--mono);
  }

  .meta-separator {
    color: var(--border);
  }

  .error-right {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }

  .error-time {
    font-size: 12px;
    color: var(--muted);
    font-family: var(--mono);
  }

  .error-severity {
    padding: 4px 10px;
    background: var(--bg);
    border: 1px solid;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
  }

  .error-details {
    padding: 0 20px 20px 20px;
    border-top: 1px solid var(--border);
  }

  .details-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 12px;
    padding: 16px 0;
  }

  .detail-item {
    display: flex;
    gap: 8px;
  }

  .detail-label {
    font-size: 11px;
    color: var(--muted);
    font-weight: 600;
    text-transform: uppercase;
  }

  .detail-value {
    font-size: 12px;
    color: var(--text);
    font-family: var(--mono);
    word-break: break-all;
  }

  .detail-value.url {
    word-break: break-all;
  }

  .stack-section,
  .metadata-section {
    margin-top: 16px;
  }

  .stack-section h4,
  .metadata-section h4 {
    margin: 0 0 8px 0;
    font-size: 14px;
    color: var(--muted);
    text-transform: uppercase;
  }

  .stack-code,
  .metadata-code {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 12px;
    font-size: 11px;
    font-family: var(--mono);
    color: var(--text);
    overflow-x: auto;
    margin: 0;
    max-height: 300px;
    overflow-y: auto;
  }

  .pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 20px;
    padding: 20px;
    background: var(--surface);
    border-radius: 8px;
    border: 1px solid var(--border);
  }

  .pagination button {
    padding: 10px 20px;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    transition: all 0.2s;
  }

  .pagination button:hover:not(:disabled) {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .pagination button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .page-info {
    font-size: 13px;
    color: var(--muted);
    font-family: var(--mono);
  }

  @media (max-width: 768px) {
    .error-log {
      padding: 16px;
    }

    .stats-bar {
      flex-direction: column;
    }

    .error-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
    }

    .error-right {
      width: 100%;
      justify-content: space-between;
    }

    .details-grid {
      grid-template-columns: 1fr;
    }

    .header-actions {
      flex-direction: column;
      width: 100%;
    }

    .btn-export,
    .btn-test {
      width: 100%;
    }
  }
</style>
