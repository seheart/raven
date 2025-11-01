<script>
  import { onMount, onDestroy } from 'svelte';
  import { logger } from './logger.js';
  import { logError } from './errorLogger.js';
  import { formatDateTime } from './timeFormat.js';

  export let fallback = null; // Optional custom error UI

  let hasError = false;
  let errorDetails = null;
  let errorCount = 0;
  let errorTimestamp = null;

  // Error handler for unhandled errors
  function handleError(event) {
    hasError = true;
    errorCount++;
    errorTimestamp = new Date().toISOString();

    errorDetails = {
      message: event.error?.message || event.message || 'Unknown error',
      stack: event.error?.stack || null,
      filename: event.filename || null,
      lineno: event.lineno || null,
      colno: event.colno || null,
      type: event.type || 'error'
    };

    // Log with structured error details for better debugging
    logger.error('ErrorBoundary caught error:', {
      message: errorDetails.message,
      stack: errorDetails.stack,
      filename: errorDetails.filename,
      line: errorDetails.lineno,
      column: errorDetails.colno,
      type: errorDetails.type
    });

    // Also log raw error object for debugging
    if (event.error) {
      logger.error('Raw error object:', event.error);
    }

    // Log to backend error_log table
    const error = event.error || new Error(errorDetails.message);
    logError(error, 'ErrorBoundary', {
      filename: errorDetails.filename,
      lineno: errorDetails.lineno,
      colno: errorDetails.colno
    }, 'error');

    // Prevent default browser error handling
    event.preventDefault();
  }

  // Handle unhandled promise rejections
  function handleRejection(event) {
    hasError = true;
    errorCount++;
    errorTimestamp = new Date().toISOString();

    errorDetails = {
      message: event.reason?.message || String(event.reason) || 'Unhandled promise rejection',
      stack: event.reason?.stack || null,
      type: 'unhandledrejection'
    };

    // Log with structured error details for better debugging
    logger.error('ErrorBoundary caught promise rejection:', {
      message: errorDetails.message,
      stack: errorDetails.stack,
      type: errorDetails.type
    });

    // Also log raw reason object for debugging
    if (event.reason) {
      logger.error('Raw rejection reason:', event.reason);
    }

    // Log to backend error_log table
    const error = event.reason instanceof Error ? event.reason : new Error(errorDetails.message);
    logError(error, 'ErrorBoundary', {
      type: 'unhandled_rejection'
    }, 'error');

    // Prevent default browser handling
    event.preventDefault();
  }

  function resetError() {
    hasError = false;
    errorDetails = null;

    // Reload the page to recover
    window.location.reload();
  }

  function copyErrorToClipboard() {
    const errorText = JSON.stringify(errorDetails, null, 2);
    navigator.clipboard.writeText(errorText).then(() => {
      alert('Error details copied to clipboard');
    });
  }

  onMount(() => {
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
  });

  onDestroy(() => {
    window.removeEventListener('error', handleError);
    window.removeEventListener('unhandledrejection', handleRejection);
  });
</script>

{#if hasError}
  {#if fallback}
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html fallback}
  {:else}
    <div class="error-boundary" role="alert" aria-live="assertive">
      <div class="error-container" role="document">
        <div class="error-icon" aria-hidden="true">⚠️</div>
        <h1 id="error-heading">Something went wrong</h1>
        <p class="error-message">
          The application encountered an unexpected error and needs to restart.
        </p>

        <div class="error-details" role="region" aria-labelledby="error-heading">
          <div class="error-summary">
            <strong>Error:</strong> {errorDetails.message}
          </div>

          {#if errorDetails.stack}
            <details class="stack-trace">
              <summary>Technical Details (click to expand)</summary>
              <pre role="code">{errorDetails.stack}</pre>
            </details>
          {/if}

          <div class="error-meta" role="status">
            <div>Error Count: {errorCount}</div>
            <div>Time: {formatDateTime(errorTimestamp)}</div>
            {#if errorDetails.filename}
              <div>File: {errorDetails.filename}:{errorDetails.lineno}:{errorDetails.colno}</div>
            {/if}
          </div>
        </div>

        <div class="error-actions" role="group" aria-label="Error recovery actions">
          <button class="btn-primary" on:click={resetError} aria-label="Reload application to recover">
            <span aria-hidden="true">🔄</span> Reload Application
          </button>
          <button class="btn-secondary" on:click={copyErrorToClipboard} aria-label="Copy error details to clipboard">
            <span aria-hidden="true">📋</span> Copy Error Details
          </button>
        </div>

        <div class="error-help" role="complementary" aria-label="Help information">
          <p>If this error persists:</p>
          <ul>
            <li>Check the browser console for additional details</li>
            <li>Try clearing your browser cache and reloading</li>
            <li>Check if the Raven backend is running on http://localhost:3030</li>
            <li>Report the issue with the error details above</li>
          </ul>
        </div>
      </div>
    </div>
  {/if}
{:else}
  <slot />
{/if}

<style>
  .error-boundary {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: var(--bg, #1a1b26);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    padding: 8px;
    overflow-y: auto;
  }

  .error-container {
    max-width: 800px;
    width: 100%;
    background: var(--surface-2, #24283b);
    border: 2px solid var(--error, #f7768e);
    border-radius: 3px;
    padding: 40px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
  }

  .error-icon {
    font-size: 11px;
    text-align: center;
    margin-bottom: 8px;
  }

  h1 {
    color: var(--error, #f7768e);
    font-size: 11px;
    margin: 0 0 8px 0;
    text-align: center;
    font-family: var(--mono, monospace);
  }

  .error-message {
    color: var(--text, #c0caf5);
    font-size: 11px;
    text-align: center;
    margin-bottom: 30px;
    line-height: 1.6;
  }

  .error-details {
    background: var(--surface, #1a1b26);
    border: 1px solid var(--border, #414868);
    border-radius: 4px;
    padding: 8px;
    margin-bottom: 30px;
  }

  .error-summary {
    color: var(--text, #c0caf5);
    margin-bottom: 6px;
    word-break: break-word;
  }

  .error-summary strong {
    color: var(--error, #f7768e);
  }

  .stack-trace {
    margin: 16px 0;
  }

  .stack-trace summary {
    color: var(--muted, #565f89);
    cursor: pointer;
    user-select: none;
    padding: 8px;
    background: var(--surface-2, #24283b);
    border-radius: 4px;
  }

  .stack-trace summary:hover {
    color: var(--text, #c0caf5);
    background: var(--surface, #1a1b26);
  }

  .stack-trace pre {
    margin: 12px 0 0 0;
    padding: 16px;
    background: var(--surface, #1a1b26);
    border: 1px solid var(--border, #414868);
    border-radius: 4px;
    overflow-x: auto;
    color: var(--muted, #565f89);
    font-size: 12px;
    line-height: 1.5;
    font-family: var(--mono, monospace);
  }

  .error-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--border, #414868);
    font-size: 13px;
    color: var(--muted, #565f89);
  }

  .error-actions {
    display: flex;
    gap: 12px;
    justify-content: center;
    margin-bottom: 30px;
  }

  .btn-primary,
  .btn-secondary {
    padding: 6px 12px;
    border: none;
    border-radius: 3px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    font-family: var(--mono, monospace);
  }

  .btn-primary {
    background: var(--accent, #7aa2f7);
    color: white;
  }

  .btn-primary:hover {
    background: var(--accent-hover, #5c7fcf);
    transform: translateY(-2px);
  }

  .btn-secondary {
    background: var(--surface, #1a1b26);
    color: var(--text, #c0caf5);
    border: 1px solid var(--border, #414868);
  }

  .btn-primary:focus,
  .btn-secondary:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .btn-secondary:hover {
    background: var(--surface-2, #24283b);
    border-color: var(--accent, #7aa2f7);
  }

  .error-help {
    background: var(--surface, #1a1b26);
    border: 1px solid var(--border, #414868);
    border-radius: 4px;
    padding: 8px;
    color: var(--muted, #565f89);
    font-size: 11px;
  }

  .error-help p {
    margin: 0 0 6px 0;
    font-weight: 600;
    color: var(--text, #c0caf5);
  }

  .error-help ul {
    margin: 0;
    padding-left: 24px;
    line-height: 1.8;
  }

  .error-help li {
    margin-bottom: 8px;
  }
</style>
