<script>
  import { logger } from './logger.js';
  import { onMount } from 'svelte';
  import { notifications } from './notificationService.js';
  import { formatDateTime } from './timeFormat.js';
  import LoadingSkeleton from './LoadingSkeleton.svelte';

  let sessions = [];
  let loading = true;
  let selectedSession = null;
  let selectedSessionData = null;
  let previewData = null;
  let previewing = false;
  let rollingback = false;
  let showConfirmDialog = false;
  let confirmCheckbox = false;
  let triggerButton = null;
  let modalElement = null;
  let error = null;

  // Fetch sessions
  async function fetchSessions() {
    try {
      loading = true;
      const response = await fetch('/api/sessions');
      if (!response.ok) throw new Error('Failed to fetch sessions');

      const data = await response.json();
      sessions = data.sessions;
      loading = false;
      error = null;
    } catch (err) {
      logger.error('Failed to fetch sessions:', err);
      notifications.error('Failed to load sessions');
      error = err.message || 'Failed to load sessions';
      loading = false;
    }
  }

  // Preview rollback
  async function previewRollback(session) {
    try {
      previewing = true;
      selectedSession = session.id;
      selectedSessionData = session;

      const response = await fetch(`/api/sessions/${session.id}/preview`);
      if (!response.ok) throw new Error('Failed to preview rollback');

      previewData = await response.json();
      previewing = false;
    } catch (error) {
      logger.error('Failed to preview rollback:', error);
      notifications.error('Failed to preview rollback');
      previewing = false;
    }
  }

  // Show confirmation dialog
  function showRollbackConfirmation(event) {
    if (!selectedSession || !previewData?.canRollback) return;
    triggerButton = event?.target;
    showConfirmDialog = true;
    confirmCheckbox = false;
  }

  // Close confirmation dialog
  function closeConfirmDialog() {
    showConfirmDialog = false;
    confirmCheckbox = false;
    // Return focus to trigger button
    if (triggerButton) {
      triggerButton.focus();
      triggerButton = null;
    }
  }

  // Focus trap for modal
  function handleModalKeydown(event) {
    if (event.key === 'Escape') {
      closeConfirmDialog();
      return;
    }

    // Focus trap
    if (event.key === 'Tab' && modalElement) {
      const focusableElements = modalElement.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }
  }

  // Execute rollback (after confirmation)
  async function executeRollback() {
    if (!selectedSession || !previewData?.canRollback || !confirmCheckbox) return;

    const returnFocusElement = triggerButton;
    showConfirmDialog = false;
    triggerButton = null;

    try {
      rollingback = true;

      const response = await fetch(`/api/sessions/${selectedSession}/rollback`, {
        method: 'POST'
      });

      if (!response.ok) throw new Error('Failed to execute rollback');

      const result = await response.json();

      notifications.success(`Successfully rolled back ${result.restoredFiles.length} file(s)`);

      if (result.failedFiles.length > 0) {
        notifications.warning(`Failed to rollback ${result.failedFiles.length} file(s)`);
      }

      // Reset state
      selectedSession = null;
      selectedSessionData = null;
      previewData = null;
      rollingback = false;

      // Refresh sessions
      await fetchSessions();

      // Return focus after operation completes
      if (returnFocusElement) {
        returnFocusElement.focus();
      }
    } catch (error) {
      logger.error('Failed to execute rollback:', error);
      notifications.error('Failed to execute rollback');
      rollingback = false;

      // Return focus even on error
      if (returnFocusElement) {
        returnFocusElement.focus();
      }
    }
  }

  // Cancel preview
  function cancelPreview() {
    selectedSession = null;
    selectedSessionData = null;
    previewData = null;
  }

  onMount(() => {
    fetchSessions();
  });

  // Format date
  function formatDate(dateString) {
    return formatDateTime(dateString);
  }

  // Format duration
  function formatDuration(startTime, endTime) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const duration = (end - start) / 1000; // seconds

    if (duration < 60) return `${Math.floor(duration)}s`;
    if (duration < 3600) return `${Math.floor(duration / 60)}m`;
    return `${Math.floor(duration / 3600)}h ${Math.floor((duration % 3600) / 60)}m`;
  }

  // Get time ago
  function timeAgo(dateString) {
    const date = new Date(dateString);
    const seconds = Math.floor((new Date() - date) / 1000);

    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }
</script>

<div class="session-rollback-panel" role="region" aria-label="Session rollback panel">
  <div class="panel-header">
    <h2 id="session-rollback-heading">Session Rollback</h2>
    <p class="panel-description">Undo entire AI coding sessions by rolling back all file changes</p>
    <button class="refresh-btn" on:click={fetchSessions} aria-label="Refresh sessions">
      <span aria-hidden="true">↻</span>
    </button>
  </div>

  {#if error}
    <div class="error-state" role="alert">
      <p>Error: {error}</p>
      <button class="btn-retry" on:click={fetchSessions} aria-label="Retry loading sessions">
        Retry
      </button>
    </div>
  {:else if loading}
    <LoadingSkeleton type="list" count={5} height="80px" />
  {:else if selectedSession && previewData}
    <!-- Rollback Preview -->
    <div
      class="preview-container"
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-heading"
      on:keydown={(e) => {
        if (e.key === 'Escape') {
          cancelPreview();
        }
      }}
    >
      <div class="preview-header">
        <h3 id="preview-heading">Rollback Preview</h3>
        <button class="close-btn" on:click={cancelPreview} aria-label="Close preview">
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      <div class="preview-info" role="region" aria-label="Rollback information">
        {#if selectedSessionData?.project_name}
          <div class="info-item">
            <span class="info-label">Project:</span>
            <span class="info-value"><span class="project-badge-small">{selectedSessionData.project_name}</span></span>
          </div>
        {/if}
        <div class="info-item">
          <span class="info-label">Session ended:</span>
          <span class="info-value mono">{selectedSessionData?.end_time ? formatDate(selectedSessionData.end_time) : 'N/A'}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Changes made:</span>
          <span class="info-value" role="status">{selectedSessionData?.event_count || 0}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Files to restore:</span>
          <span class="info-value" role="status">{previewData.fileCount}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Can rollback:</span>
          <span class="info-value" class:success={previewData.canRollback} class:error={!previewData.canRollback} role="status">
            {previewData.canRollback ? 'Yes' : 'No'}
          </span>
        </div>
      </div>

      {#if !previewData.canRollback}
        <div class="warning-box" role="alert">
          <span class="warning-icon" aria-hidden="true">⚠️</span>
          <p>No backups available for this session. Files may have been created during this session without prior snapshots.</p>
        </div>
      {:else}
        <div class="changes-list" role="region" aria-labelledby="files-heading">
          <h4 id="files-heading">Files that will be restored:</h4>
          <div role="list" aria-label="Files to restore">
            {#each previewData.changes as change (change.id || change.name || change)}
              <div class="change-item" class:has-backup={change.hasBackup} role="listitem">
                <span class="change-icon" aria-hidden="true">{change.hasBackup ? '✅' : '❌'}</span>
                <span class="change-path">{change.filepath}</span>
                {#if !change.hasBackup}
                  <span class="no-backup-badge" role="status">No backup</span>
                {/if}
              </div>
            {/each}
          </div>
        </div>

        <div class="preview-actions" role="group" aria-label="Rollback actions">
          <button class="cancel-btn" on:click={cancelPreview} disabled={rollingback} aria-label="Cancel rollback">
            Cancel
          </button>
          <button class="rollback-btn" on:click={showRollbackConfirmation} disabled={rollingback} aria-label={rollingback ? 'Rolling back files' : 'Confirm and execute rollback'}>
            {rollingback ? 'Rolling back...' : 'Confirm Rollback'}
          </button>
        </div>
      {/if}
    </div>
  {:else if sessions.length === 0}
    <div class="empty-state" role="status">
      <div class="empty-icon" aria-hidden="true">📋</div>
      <h3>No Sessions Found</h3>
      <p>No coding sessions have been recorded yet. Sessions will appear here once files are modified.</p>
    </div>
  {:else}
    <!-- Sessions List -->
    <div class="sessions-list" role="list" aria-labelledby="session-rollback-heading">
      {#each sessions as session (session.id)}
        <article class="session-card" role="listitem">
          <div class="session-header">
            <div class="session-icon" aria-hidden="true">🔄</div>
            <div class="session-info">
              <div class="session-title">
                {#if session.project_name}
                  <span class="project-badge">{session.project_name}</span>
                {/if}
                <span class="session-time"><time datetime="{session.end_time || ''}">{session.end_time ? timeAgo(session.end_time) : 'N/A'}</time></span>
              </div>
              <div class="session-date">{session.end_time ? formatDate(session.end_time) : 'N/A'}</div>
            </div>
          </div>

          <div class="session-stats" role="group" aria-label="Session statistics">
            <div class="stat">
              <span class="stat-icon" aria-hidden="true">✏️</span>
              <span class="stat-value" role="status">{session.event_count || 0}</span>
              <span class="stat-label">changes</span>
            </div>
            <div class="stat">
              <span class="stat-icon" aria-hidden="true">⏱️</span>
              <span class="stat-value" role="status">{session.start_time && session.end_time ? formatDuration(session.start_time, session.end_time) : 'N/A'}</span>
              <span class="stat-label">duration</span>
            </div>
            {#if session.quality_score !== undefined && session.quality_score !== null}
              <div class="stat">
                <span class="stat-icon" aria-hidden="true">✨</span>
                <span class="stat-value" role="status">{session.quality_score}</span>
                <span class="stat-label">quality</span>
              </div>
            {/if}
          </div>

          <button
            class="preview-btn"
            on:click={() => previewRollback(session)}
            disabled={previewing}
            aria-label={previewing && selectedSession === session.id ? 'Loading rollback preview' : 'Preview rollback for this session'}
          >
            {previewing && selectedSession === session.id ? 'Loading...' : 'Preview Rollback'}
          </button>
        </article>
      {/each}
    </div>
  {/if}
</div>

<!-- Confirmation Dialog -->
{#if showConfirmDialog}
  <div
    class="modal-overlay"
    on:click={closeConfirmDialog}
    on:keydown={handleModalKeydown}
    role="dialog"
    aria-modal="true"
    aria-labelledby="confirm-dialog-title"
    tabindex="-1"
  >
    <div
      class="modal-content"
      on:click|stopPropagation
      on:keydown={handleModalKeydown}
      bind:this={modalElement}
      role="document"
      tabindex="-1"
    >
      <h3 id="confirm-dialog-title">⚠️ Confirm Rollback</h3>
      <div class="modal-body">
        <p class="warning-text">
          You are about to rollback <strong>{previewData?.fileCount || 0} file(s)</strong> to their state before this session started.
        </p>
        <p class="warning-subtext">
          This action will <strong>permanently overwrite</strong> the current contents of these files. Make sure you have committed any important changes.
        </p>

        <label class="confirm-checkbox">
          <input type="checkbox" bind:checked={confirmCheckbox} />
          <span>I understand this will restore {previewData?.fileCount || 0} file(s) and may lose current work</span>
        </label>
      </div>
      <div class="modal-actions">
        <button
          class="cancel-btn"
          on:click={closeConfirmDialog}
          aria-label="Cancel rollback"
        >
          Cancel
        </button>
        <button
          class="rollback-btn danger"
          on:click={executeRollback}
          disabled={!confirmCheckbox}
          aria-label="Execute rollback"
        >
          Confirm Rollback
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .session-rollback-panel {
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
    position: relative;
  }

  .panel-header h2 {
    margin: 0 0 8px 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }

  .panel-description {
    margin: 0;
    font-size: 13px;
    color: var(--muted);
  }

  .refresh-btn {
    position: absolute;
    top: 0;
    right: 0;
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

  .sessions-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .session-card {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 16px;
    transition: all 0.2s;
  }

  .session-card:hover {
    border-color: var(--accent);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .session-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 6px;
  }

  .session-icon {
    font-size: 11px;
  }

  .session-info {
    flex: 1;
  }

  .session-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }

  .project-badge {
    display: inline-block;
    padding: 3px 8px;
    background: var(--accent);
    color: white;
    border-radius: 3px;
    font-size: 11px;
    font-weight: 700;
    font-family: var(--mono);
    text-transform: uppercase;
  }

  .project-badge-small {
    display: inline-block;
    padding: 2px 6px;
    background: var(--accent);
    color: white;
    border-radius: 2px;
    font-size: 10px;
    font-weight: 700;
    font-family: var(--mono);
    text-transform: uppercase;
  }

  .session-time {
    font-size: 11px;
    font-weight: 600;
    color: var(--text);
  }

  .session-date {
    font-size: 11px;
    color: var(--muted);
    font-family: var(--mono);
  }

  .session-stats {
    display: flex;
    gap: 8px;
    margin-bottom: 6px;
    padding: 12px;
    background: var(--surface);
    border-radius: 3px;
  }

  .stat {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .stat-icon {
    font-size: 11px;
  }

  .stat-value {
    font-size: 11px;
    font-weight: 700;
    color: var(--text);
    font-family: var(--mono);
  }

  .stat-label {
    font-size: 11px;
    color: var(--muted);
  }

  .preview-btn {
    margin-top: 6px;
    width: 100%;
    padding: 10px;
    background: var(--accent);
    color: white;
    border: none;
    border-radius: 3px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .preview-btn:hover:not(:disabled) {
    background: var(--accent-dark, #6366f1);
    transform: translateY(-1px);
  }

  .preview-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Preview Container */
  .preview-container {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .preview-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .preview-header h3 {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
  }

  .close-btn {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 3px;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 11px;
    color: var(--muted);
    transition: all 0.2s;
  }

  .close-btn:hover {
    background: var(--error);
    border-color: var(--error);
    color: white;
  }

  .preview-info {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 8px;
    padding: 16px;
    background: var(--surface-2);
    border-radius: 4px;
  }

  .info-item {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
  }

  .info-label {
    font-weight: 600;
    color: var(--muted);
  }

  .info-value {
    color: var(--text);
  }

  .info-value.success {
    color: #10b981;
    font-weight: 700;
  }

  .info-value.error {
    color: #ef4444;
    font-weight: 700;
  }

  .mono {
    font-family: var(--mono);
  }

  .warning-box {
    padding: 16px;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 4px;
    display: flex;
    align-items: start;
    gap: 12px;
  }

  .warning-icon {
    font-size: 13px;
  }

  .warning-box p {
    margin: 0;
    font-size: 13px;
    color: #991b1b;
    line-height: 1.6;
  }

  .changes-list {
    flex: 1;
    overflow-y: auto;
    margin-bottom: 8px;
  }

  .changes-list h4 {
    margin: 0 0 6px 0;
    font-size: 11px;
    font-weight: 600;
    color: var(--text);
  }

  .change-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    margin-bottom: 4px;
    background: var(--surface-2);
    border-radius: 4px;
  }

  .change-item.has-backup {
    background: #f0fdf4;
  }

  .change-icon {
    font-size: 11px;
  }

  .change-path {
    flex: 1;
    font-family: var(--mono);
    font-size: 13px;
    color: var(--text);
  }

  .no-backup-badge {
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
    background: #fef2f2;
    color: #ef4444;
  }

  .preview-actions {
    display: flex;
    gap: 12px;
  }

  .cancel-btn, .rollback-btn {
    flex: 1;
    padding: 12px;
    border-radius: 3px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .cancel-btn {
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text);
  }

  .cancel-btn:hover:not(:disabled) {
    background: var(--surface);
  }

  .rollback-btn {
    background: var(--error);
    border: none;
    color: white;
  }

  .rollback-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--error) 90%, black);
    transform: translateY(-1px);
  }

  .cancel-btn:disabled, .rollback-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .refresh-btn:focus,
  .close-btn:focus,
  .cancel-btn:focus,
  .rollback-btn:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  /* Confirmation Modal Styles */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: color-mix(in srgb, var(--bg) 30%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    animation: fadeIn 0.2s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .modal-content {
    background: var(--surface);
    border: 2px solid var(--error);
    border-radius: 8px;
    padding: 24px;
    max-width: 500px;
    width: 90%;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
    animation: slideIn 0.2s ease;
  }

  @keyframes slideIn {
    from {
      transform: translateY(-20px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .modal-content h3 {
    margin: 0 0 16px 0;
    font-size: 18px;
    color: var(--error);
    font-family: var(--mono);
  }

  .modal-body {
    margin-bottom: 20px;
  }

  .warning-text {
    font-size: 14px;
    color: var(--text);
    margin: 0 0 12px 0;
    line-height: 1.5;
  }

  .warning-subtext {
    font-size: 13px;
    color: var(--muted);
    margin: 0 0 20px 0;
    line-height: 1.5;
  }

  .confirm-checkbox {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px;
    background: var(--bg);
    border: 2px solid var(--border);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .confirm-checkbox:hover {
    border-color: var(--accent);
  }

  .confirm-checkbox input[type="checkbox"] {
    width: 18px;
    height: 18px;
    cursor: pointer;
  }

  .confirm-checkbox span {
    font-size: 13px;
    color: var(--text);
    user-select: none;
  }

  .modal-actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  }

  .rollback-btn.danger {
    background: var(--error);
    color: white;
  }

  .rollback-btn.danger:hover:not(:disabled) {
    background: color-mix(in srgb, var(--error) 90%, black);
  }

  .rollback-btn.danger:disabled {
    opacity: 0.4;
    cursor: not-allowed;
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
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
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
