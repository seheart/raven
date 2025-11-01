<script>
  import { logger } from './logger.js';
  import { onMount } from 'svelte';
  import { notifications } from './notificationService.js';
  import { formatDateTime } from './timeFormat.js';

  let sessions = [];
  let loading = true;
  let selectedSession = null;
  let previewData = null;
  let previewing = false;
  let rollingback = false;

  // Fetch sessions
  async function fetchSessions() {
    try {
      loading = true;
      const response = await fetch('/api/sessions');
      if (!response.ok) throw new Error('Failed to fetch sessions');

      const data = await response.json();
      sessions = data.sessions;
      loading = false;
    } catch (error) {
      logger.error('Failed to fetch sessions:', error);
      notifications.error('Failed to load sessions');
      loading = false;
    }
  }

  // Preview rollback
  async function previewRollback(sessionId) {
    try {
      previewing = true;
      selectedSession = sessionId;

      const response = await fetch(`/api/sessions/${sessionId}/preview`);
      if (!response.ok) throw new Error('Failed to preview rollback');

      previewData = await response.json();
      previewing = false;
    } catch (error) {
      logger.error('Failed to preview rollback:', error);
      notifications.error('Failed to preview rollback');
      previewing = false;
    }
  }

  // Execute rollback
  async function executeRollback() {
    if (!selectedSession || !previewData?.canRollback) return;

    if (!confirm(`Are you sure you want to rollback ${previewData.fileCount} file(s)? This will restore them to their state before the session started.`)) {
      return;
    }

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
      previewData = null;
      rollingback = false;

      // Refresh sessions
      await fetchSessions();
    } catch (error) {
      logger.error('Failed to execute rollback:', error);
      notifications.error('Failed to execute rollback');
      rollingback = false;
    }
  }

  // Cancel preview
  function cancelPreview() {
    selectedSession = null;
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

  {#if loading}
    <div class="loading" role="status" aria-live="polite">
      <div class="spinner" aria-hidden="true"></div>
      <p>Loading sessions...</p>
    </div>
  {:else if selectedSession && previewData}
    <!-- Rollback Preview -->
    <div class="preview-container" role="dialog" aria-modal="true" aria-labelledby="preview-heading">
      <div class="preview-header">
        <h3 id="preview-heading">Rollback Preview</h3>
        <button class="close-btn" on:click={cancelPreview} aria-label="Close preview">
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      <div class="preview-info" role="region" aria-label="Rollback information">
        <div class="info-item">
          <span class="info-label">Session ID:</span>
          <span class="info-value mono">{selectedSession.slice(0, 8)}...</span>
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
          <button class="rollback-btn" on:click={executeRollback} disabled={rollingback} aria-label={rollingback ? 'Rolling back files' : 'Confirm and execute rollback'}>
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
              <div class="session-id mono">{session.session_id ? session.session_id.slice(0, 13) : session.id || 'Unknown'}...</div>
              <div class="session-time"><time datetime="{session.end_time || ''}">{session.end_time ? timeAgo(session.end_time) : 'N/A'}</time></div>
            </div>
          </div>

          <div class="session-stats" role="group" aria-label="Session statistics">
            <div class="stat">
              <span class="stat-icon" aria-hidden="true">📄</span>
              <span class="stat-value" role="status">{session.file_count || 0}</span>
              <span class="stat-label">files</span>
            </div>
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
          </div>

          <div class="session-details">
            <div class="detail-row">
              <span class="detail-label">Started:</span>
              <span class="detail-value">{session.start_time ? formatDate(session.start_time) : 'N/A'}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Ended:</span>
              <span class="detail-value">{session.end_time ? formatDate(session.end_time) : 'N/A'}</span>
            </div>
          </div>

          <button
            class="preview-btn"
            on:click={() => previewRollback(session.session_id || session.id)}
            disabled={previewing}
            aria-label={previewing && selectedSession === (session.session_id || session.id) ? 'Loading rollback preview' : 'Preview rollback for this session'}
          >
            {previewing && selectedSession === (session.session_id || session.id) ? 'Loading...' : 'Preview Rollback'}
          </button>
        </article>
      {/each}
    </div>
  {/if}
</div>

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

  .session-id {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }

  .session-time {
    font-size: 11px;
    color: var(--muted);
    margin-top: 2px;
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

  .session-details {
    margin-bottom: 6px;
    padding: 12px;
    background: var(--surface);
    border-radius: 3px;
  }

  .detail-row {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    padding: 4px 0;
  }

  .detail-label {
    color: var(--muted);
    font-weight: 600;
  }

  .detail-value {
    color: var(--text);
    font-family: var(--mono);
  }

  .preview-btn {
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
    background: #ef4444;
    border-color: #ef4444;
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
    background: #ef4444;
    border: none;
    color: white;
  }

  .rollback-btn:hover:not(:disabled) {
    background: #dc2626;
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
</style>
