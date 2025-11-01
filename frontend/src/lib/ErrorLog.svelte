<script>
  import { logger } from './logger.js';
  import { onMount, onDestroy } from 'svelte';
  import { fetchErrorLogs, fetchErrorStats, clearErrorLogs, logError } from './errorLogger.js';
  import { formatDateTime, getTimeAgo } from './timeFormat.js';
  import { websocketService } from './websocket.js';
  import VirtualScroll from './VirtualScroll.svelte';
  import { debounceInput } from './utils/debounce.js';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import { API_CONFIG } from '../config.js';
  import { TimeoutManager } from './utils/TimeoutManager.js';

  let errors = [];
  let stats = { total: 0, by_severity: [], recent_count: 0 };
  let searchQuery = '';
  let severityFilter = 'all';
  let loading = true;
  let error = null;
  let selectedError = null;
  let loadErrorsTimeout = null;
  let virtualScroll; // Reference to virtual scroll component
  let lastUpdated = null;
  let isManualRefresh = false;

  // Timeout manager for cleanup
  const timeouts = new TimeoutManager();

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

    // Check if we should highlight a specific error (from notification click)
    const highlightMsg = sessionStorage.getItem('highlightError');
    if (highlightMsg) {
      // Find and select the error with matching message
      setTimeout(() => {
        const matchingError = errors.find(e => e.message && e.message.includes(highlightMsg));
        if (matchingError) {
          selectedError = matchingError;
          logger.info('Highlighted error from notification:', highlightMsg);
        }
        // Clear the session storage flag
        sessionStorage.removeItem('highlightError');
      }, 500);
    }
  });

  onDestroy(() => {
    // Remove WebSocket event listeners
    websocketService.off('error-logged', handleErrorLogged);

    // Clean up pending timeout
    if (loadErrorsTimeout) {
      clearTimeout(loadErrorsTimeout);
    }

    // Clean up all timeouts
    timeouts.cleanup();
  });

  // Handle error-logged WebSocket event
  function handleErrorLogged(errorData) {
    // Debounce to prevent race conditions from rapid events
    clearTimeout(loadErrorsTimeout);
    loadErrorsTimeout = setTimeout(() => {
      loadErrors();
      loadStats();
    }, 300);
  }

  function setupWebSocket() {
    // Connect to WebSocket and listen for error-logged events
    websocketService.connect();
    websocketService.on('error-logged', handleErrorLogged);
  }

  async function loadErrors(manual = false) {
    try {
      loading = true;
      isManualRefresh = manual;
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
      lastUpdated = new Date();
    } catch (err) {
      error = err.message;
      logger.error('Failed to load errors:', err);
    } finally {
      loading = false;
      isManualRefresh = false;
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
      logger.error('Failed to load error stats:', err);
    }
  }

  async function handleSearch() {
    currentPage = 0;
    await loadErrors();
  }

  // Debounced search handler
  async function handleDebouncedSearch(event) {
    searchQuery = event.detail;
    currentPage = 0;
    await loadErrors();
    // Reset scroll position when searching
    if (virtualScroll) {
      virtualScroll.scrollToItem(0);
    }
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

    const parsedDays = parseInt(days, 10);
    if (isNaN(parsedDays)) {
      alert('Invalid number of days');
      return;
    }

    try {
      const result = await clearErrorLogs(parsedDays);
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
      timeouts.add(() => {
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

  // Reactive "time ago" - updates when lastUpdated changes (no polling!)
  $: timeAgo = getTimeAgo(lastUpdated);
</script>

<div class="error-log" role="region" aria-label="Error Log">
  <div class="log-header">
    <div class="header-title">
      <h1 id="error-log-title"><span aria-hidden="true">⚠️</span> Error Log</h1>
      <p class="subtitle">Application errors and warnings</p>
    </div>
    <div class="header-actions" role="toolbar" aria-label="Error log actions">
      <span class="last-updated" role="status" aria-live="polite" aria-label="Last updated {timeAgo}">Updated: {timeAgo}</span>
      <button class="btn-test" on:click={triggerTestError} aria-label="Trigger test error">
        <span aria-hidden="true">🧪</span> Test Error
      </button>
      <button class="btn-export" on:click={exportLog} aria-label="Export error log to JSON file">
        <span aria-hidden="true">💾</span> Export JSON
      </button>
      <button class="btn-refresh" on:click={() => { currentPage = 0; loadErrors(true); loadStats(); }} disabled={loading} aria-label="Refresh error log">
        <span class="refresh-icon" class:spinning={isManualRefresh} aria-hidden="true">🔄</span>
        Refresh
      </button>
    </div>
  </div>

  <!-- Stats Bar -->
  <div class="stats-bar" role="region" aria-label="Error statistics">
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
        use:debounceInput={{ delay: 300 }}
        on:debounced={handleDebouncedSearch}
      />
      <button on:click={handleSearch}>🔍 Search</button>
    </div>

    <div class="filter-tabs">
      <button
        class="filter-tab"
        class:active={severityFilter === 'all'}
        on:click={() => handleSeverityFilter('all')}
      >
        All ({stats.total})
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
      <LoadingSkeleton count={8} height="100px" />
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
      <VirtualScroll
        bind:this={virtualScroll}
        items={errors}
        itemHeight={100}
        containerHeight={500}
        overscan={3}
        getKey={err => err.id}
        let:item
      >
        <!-- NOTE: itemHeight=100 works for collapsed errors. Expanded errors are taller
             but VirtualScroll handles this gracefully with overscan. For better accuracy,
             consider dynamic height calculation or disable VirtualScroll when expanded. -->
        <div class="error-item" class:expanded={selectedError?.id === item.id}>
          <button
            class="error-header"
            on:click={() => toggleError(item)}
            on:keydown={(e) => e.key === 'Enter' && toggleError(item)}
            aria-expanded={selectedError?.id === item.id}
            aria-label="Toggle error details for {item.message}"
            tabindex="0"
          >
            <div class="error-left">
              <span class="expand-arrow">{selectedError?.id === item.id ? '▼' : '▶'}</span>
              <span class="error-icon" style="color: {getSeverityColor(item.severity)}">
                {getSeverityIcon(item.severity)}
              </span>
              <div class="error-info">
                <div class="error-message">{item.message}</div>
                <div class="error-meta">
                  <span class="meta-item">{item.error_type}</span>
                  <span class="meta-separator">•</span>
                  <span class="meta-item">{item.component || 'Unknown'}</span>
                  <span class="meta-separator">•</span>
                  <span class="meta-item">{formatRelativeTime(item.timestamp)}</span>
                </div>
              </div>
            </div>
            <div class="error-right">
              <span class="error-time">{formatTimestamp(item.timestamp)}</span>
              <span class="error-severity" style="border-color: {getSeverityColor(item.severity)}; color: {getSeverityColor(item.severity)}">
                {item.severity}
              </span>
            </div>
          </button>

          {#if selectedError?.id === item.id}
            <div class="error-details">
              <div class="details-grid">
                <div class="detail-item">
                  <span class="detail-label">ID:</span>
                  <span class="detail-value">{item.id}</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">Type:</span>
                  <span class="detail-value">{item.error_type}</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">Severity:</span>
                  <span class="detail-value" style="color: {getSeverityColor(item.severity)}">{item.severity}</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">Component:</span>
                  <span class="detail-value">{item.component || 'Unknown'}</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">Timestamp:</span>
                  <span class="detail-value">{item.timestamp}</span>
                </div>
                {#if item.url}
                  <div class="detail-item">
                    <span class="detail-label">URL:</span>
                    <span class="detail-value url">{item.url}</span>
                  </div>
                {/if}
              </div>

              {#if item.stack}
                <div class="stack-section">
                  <h4>Stack Trace</h4>
                  <pre class="stack-code">{item.stack}</pre>
                </div>
              {/if}

              {#if item.metadata}
                <div class="metadata-section">
                  <h4>Metadata</h4>
                  <pre class="metadata-code">{JSON.stringify(item.metadata, null, 2)}</pre>
                </div>
              {/if}

              {#if item.user_agent}
                <div class="metadata-section">
                  <h4>User Agent</h4>
                  <pre class="metadata-code">{item.user_agent}</pre>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      </VirtualScroll>

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
    padding: 8px;
    position: relative;
    max-width: 1600px;
    margin: 0 auto;
  }

  .log-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    padding-bottom: 16px;
    border-bottom: 2px solid var(--border);
  }

  .header-title h1 {
    margin: 0 0 4px 0;
    font-size: 11px;
    color: var(--text);
  }

  .subtitle {
    margin: 0;
    font-size: 12px;
    color: var(--muted);
  }

  .header-actions {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .last-updated {
    font-size: 12px;
    color: var(--muted);
    font-family: var(--mono);
  }

  .btn-refresh {
    padding: 6px 10px;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 3px;
    cursor: pointer;
    font-size: 11px;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .btn-refresh:hover:not(:disabled) {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .btn-refresh:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .refresh-icon {
    display: inline-block;
    font-size: 11px;
  }

  .refresh-icon.spinning {
    /* Animation defined in global app.css */
  }

  .btn-export,
  .btn-test {
    padding: 6px 10px;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 3px;
    cursor: pointer;
    font-size: 11px;
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
    gap: 6px;
    margin-bottom: 8px;
  }

  .stat-item {
    flex: 1;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 6px;
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
    font-size: 11px;
    color: var(--text);
    font-family: var(--mono);
    font-weight: 700;
  }

  .controls {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 8px;
    background: var(--surface);
    padding: 8px;
    border-radius: 4px;
    border: 1px solid var(--border);
  }

  .search-bar {
    display: flex;
    gap: 6px;
  }

  .search-bar input {
    flex: 1;
    padding: 6px 10px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--text);
    font-size: 12px;
    font-family: var(--mono);
  }

  .search-bar input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .search-bar button {
    padding: 6px 10px;
    background: var(--accent);
    color: white;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    font-size: 11px;
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
    border-radius: 3px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    transition: all 0.2s;
  }

  .filter-tab:hover {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .filter-tab:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
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
    border-radius: 3px;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.2s;
  }

  .action-buttons button:hover {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .action-buttons button:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
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

  .error-state,
  .empty-state {
    text-align: center;
    padding: 8px 12px;
    color: var(--muted);
  }

  /* (removed unused spinner) */

  .empty-icon,
  .error-icon {
    font-size: 11px;
    margin-bottom: 8px;
  }

  .empty-state h2,
  .error-state h2 {
    font-size: 11px;
    margin: 0 0 8px 0;
    color: var(--text);
  }

  .error-item {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
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

  button.error-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 20px;
    cursor: pointer;
    width: 100%;
    background: none;
    border: none;
    text-align: left;
    font-family: inherit;
    user-select: none;
  }

  button.error-header:focus {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
    background: var(--surface-2);
  }

  .error-left {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;
  }

  .expand-arrow {
    font-size: 11px;
    color: var(--muted);
    width: 12px;
    flex-shrink: 0;
  }

  .error-icon {
    font-size: 11px;
    flex-shrink: 0;
  }

  .error-info {
    flex: 1;
    min-width: 0;
  }

  .error-message {
    font-size: 11px;
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
    gap: 6px;
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
    font-size: 11px;
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
    gap: 6px;
    padding: 6px 0;
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
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
  }

  .stack-code,
  .metadata-code {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 6px;
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
    gap: 8px;
    padding: 8px;
    background: var(--surface);
    border-radius: 4px;
    border: 1px solid var(--border);
  }

  .pagination button {
    padding: 6px 10px;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 3px;
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
    transition: all 0.2s;
  }

  .pagination button:hover:not(:disabled) {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .pagination button:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .pagination button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .page-info {
    font-size: 11px;
    color: var(--muted);
    font-family: var(--mono);
  }
</style>
