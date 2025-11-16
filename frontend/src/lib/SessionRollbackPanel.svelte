<script>
  import { logger } from './logger.js';
  import { onMount, onDestroy } from 'svelte';
  import { notifications } from './notificationService.js';
  import { formatDateTime } from './timeFormat.js';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import { Chart, registerables } from 'chart.js';
  import { initializeCharts, setupChartThemeObserver, getChartThemeColors } from './utils/chartHelpers.js';

  Chart.register(...registerables);

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
  let showCharts = false;

  // Charts
  let charts = {};
  let themeObserver;

  // Fetch sessions
  async function fetchSessions() {
    try {
      loading = true;
      const response = await fetch('/api/sessions');

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

  onMount(async () => {
    await fetchSessions();

    // Initialize charts after data loads
    initializeCharts(createCharts, {
      data: sessions,
      enabled: showCharts
    });

    // Setup theme observer for charts
    themeObserver = setupChartThemeObserver(createCharts, {
      enabled: showCharts
    });
  });

  onDestroy(() => {
    // Destroy charts
    Object.values(charts).forEach(chart => chart?.destroy());

    // Disconnect theme observer
    themeObserver?.disconnect();
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

  // Chart Functions
  function createCharts() {
    // Destroy existing charts
    Object.values(charts).forEach(chart => chart?.destroy());
    charts = {};

    if (!showCharts || sessions.length === 0) return;

    const colors = getChartThemeColors();

    // Get top 10 sessions by duration
    const sessionsWithDuration = sessions
      .filter(s => s.start_time && s.end_time)
      .map(s => {
        const start = new Date(s.start_time);
        const end = new Date(s.end_time);
        const durationSeconds = (end - start) / 1000;
        return { ...s, durationSeconds };
      })
      .sort((a, b) => b.durationSeconds - a.durationSeconds)
      .slice(0, 10);

    // Chart 1: Bar Chart - Session Duration Comparison (Top 10)
    const durationCanvas = document.getElementById('chart-session-duration');
    if (durationCanvas && sessionsWithDuration.length > 0) {
      const labels = sessionsWithDuration.map((s, i) =>
        s.project_name ? `${s.project_name} #${i + 1}` : `Session #${i + 1}`
      );
      const durations = sessionsWithDuration.map(s => s.durationSeconds / 60); // Convert to minutes

      charts.durationChart = new Chart(durationCanvas, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Duration (minutes)',
            data: durations,
            backgroundColor: colors.accent,
            borderColor: colors.accent,
            borderWidth: 2,
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                color: colors.muted,
                font: { size: 10, family: 'var(--mono)' }
              },
              grid: {
                color: colors.grid
              }
            },
            x: {
              ticks: {
                color: colors.muted,
                font: { size: 10, family: 'var(--mono)' },
                maxRotation: 45,
                minRotation: 45
              },
              grid: {
                color: colors.grid
              }
            }
          }
        }
      });
    }

    // Chart 2: Bar Chart - Events Per Session (Top 10)
    const eventsCanvas = document.getElementById('chart-events-per-session');
    if (eventsCanvas) {
      const top10ByEvents = [...sessions]
        .filter(s => s.event_count > 0)
        .sort((a, b) => b.event_count - a.event_count)
        .slice(0, 10);

      if (top10ByEvents.length > 0) {
        const labels = top10ByEvents.map((s, i) =>
          s.project_name ? `${s.project_name} #${i + 1}` : `Session #${i + 1}`
        );
        const eventCounts = top10ByEvents.map(s => s.event_count);

        charts.eventsChart = new Chart(eventsCanvas, {
          type: 'bar',
          data: {
            labels: labels,
            datasets: [{
              label: 'Events',
              data: eventCounts,
              backgroundColor: colors.info,
              borderColor: colors.info,
              borderWidth: 2,
              borderRadius: 4
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: false
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                ticks: {
                  color: colors.muted,
                  font: { size: 10, family: 'var(--mono)' }
                },
                grid: {
                  color: colors.grid
                }
              },
              x: {
                ticks: {
                  color: colors.muted,
                  font: { size: 10, family: 'var(--mono)' },
                  maxRotation: 45,
                  minRotation: 45
                },
                grid: {
                  color: colors.grid
                }
              }
            }
          }
        });
      }
    }
  }

  function updateCharts() {
    if (showCharts) {
      setTimeout(createCharts, 100);
    }
  }

  // Update charts when sessions change
  $: if (showCharts && sessions) {
    updateCharts();
  }
</script>

<div class="session-rollback-panel" role="region" aria-label="Session rollback panel">
  <div class="panel-header">
    <h2 id="session-rollback-heading">Session Rollback</h2>
    <p class="panel-description">Undo entire AI coding sessions by rolling back all file changes</p>
    <div class="header-actions">
      <label class="toggle-label">
        <input type="checkbox" bind:checked={showCharts} on:change={updateCharts} aria-label="Show charts" />
        Show Charts
      </label>
      <button class="btn btn-secondary btn-sm" on:click={fetchSessions} aria-label="Refresh sessions">
        <span aria-hidden="true">↻</span>
      </button>
    </div>
  </div>

  <!-- Charts Section -->
  {#if showCharts && sessions.length > 0 && !selectedSession}
    <div class="charts-section" role="region" aria-label="Session charts">
      <div class="charts-grid">
        <div class="chart-container">
          <div class="chart-header">
            <h3>Session Duration (Top 10)</h3>
          </div>
          <div class="chart-canvas-wrapper">
            <canvas id="chart-session-duration"></canvas>
          </div>
        </div>

        <div class="chart-container">
          <div class="chart-header">
            <h3>Events Per Session (Top 10)</h3>
          </div>
          <div class="chart-canvas-wrapper">
            <canvas id="chart-events-per-session"></canvas>
          </div>
        </div>
      </div>
    </div>
  {/if}

  {#if error}
    <div class="error-state" role="alert">
      <p>Error: {error}</p>
      <button class="btn btn-danger btn-sm" on:click={fetchSessions} aria-label="Retry loading sessions">
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
        <button class="btn btn-ghost btn-icon" on:click={cancelPreview} aria-label="Close preview">
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
          <button class="btn btn-secondary btn-sm" on:click={cancelPreview} disabled={rollingback} aria-label="Cancel rollback">
            Cancel
          </button>
          <button class="btn btn-danger btn-sm" on:click={showRollbackConfirmation} disabled={rollingback} aria-label={rollingback ? 'Rolling back files' : 'Confirm and execute rollback'}>
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
            class="btn btn-primary btn-sm"
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
          class="btn btn-secondary btn-sm"
          on:click={closeConfirmDialog}
          aria-label="Cancel rollback"
        >
          Cancel
        </button>
        <button
          class="btn btn-danger btn-sm"
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
    padding: var(--space-lg);
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .panel-header {
    margin-bottom: var(--space-lg);
    padding-bottom: var(--space-2xl);
    border-bottom: 1px solid var(--border);
    position: relative;
  }

  .panel-header h2 {
    margin: 0 0 var(--space-lg) 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }

  .panel-description {
    margin: 0 0 var(--space-xl) 0;
    font-size: 13px;
    color: var(--muted);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: var(--space-xl);
  }

  .toggle-label {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    font-size: 11px;
    color: var(--text);
    cursor: pointer;
    user-select: none;
  }

  .toggle-label input[type="checkbox"] {
    width: var(--icon-xs);
    height: var(--icon-xs);
    cursor: pointer;
  }


  .loading, .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-lg) var(--space-xl);
    gap: var(--space-lg);
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

  .empty-icon {
    font-size: 11px;
    margin-bottom: var(--space-md);
  }

  .empty-state h3 {
    margin: 0 0 var(--space-lg) 0;
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
    gap: var(--space-lg);
  }

  .session-card {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-2xl);
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .session-card:hover {
    border-color: var(--accent);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .session-header {
    display: flex;
    align-items: center;
    gap: var(--space-xl);
    margin-bottom: var(--space-md);
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
    gap: var(--space-lg);
    margin-bottom: var(--space-sm);
  }

  .project-badge {
    display: inline-block;
    padding: var(--space-sm) var(--space-lg);
    background: var(--accent);
    color: white;
    border-radius: var(--radius-sm);
    font-size: 11px;
    font-weight: 700;
    font-family: var(--mono);
    text-transform: uppercase;
  }

  .project-badge-small {
    display: inline-block;
    padding: var(--space-xs) var(--space-md);
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
    gap: var(--space-lg);
    margin-bottom: var(--space-md);
    padding: var(--space-xl);
    background: var(--surface);
    border-radius: var(--radius-sm);
  }

  .stat {
    display: flex;
    align-items: center;
    gap: var(--space-md);
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

  .session-card .btn {
    margin-top: var(--space-md);
    width: 100%;
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
    margin-bottom: var(--space-lg);
  }

  .preview-header h3 {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
  }


  .preview-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
    margin-bottom: var(--space-lg);
    padding: var(--space-2xl);
    background: var(--surface-2);
    border-radius: var(--radius);
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
    color: var(--success);
    font-weight: 700;
  }

  .info-value.error {
    color: var(--error);
    font-weight: 700;
  }

  .mono {
    font-family: var(--mono);
  }

  .warning-box {
    padding: var(--space-2xl);
    background: color-mix(in srgb, var(--error) 5%, transparent);
    border: 1px solid color-mix(in srgb, var(--error) 20%, transparent);
    border-radius: var(--radius);
    display: flex;
    align-items: start;
    gap: var(--space-xl);
  }

  .warning-icon {
    font-size: 13px;
  }

  .warning-box p {
    margin: 0;
    font-size: 13px;
    color: var(--error);
    line-height: 1.6;
  }

  .changes-list {
    flex: 1;
    overflow-y: auto;
    margin-bottom: var(--space-lg);
  }

  .changes-list h4 {
    margin: 0 0 var(--space-md) 0;
    font-size: 11px;
    font-weight: 600;
    color: var(--text);
  }

  .change-item {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
    padding: var(--space-lg) var(--space-xl);
    margin-bottom: var(--space-sm);
    background: var(--surface-2);
    border-radius: var(--radius);
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
    padding: var(--space-xs) var(--space-lg);
    border-radius: var(--radius);
    font-size: 11px;
    font-weight: 700;
    background: color-mix(in srgb, var(--error) 5%, transparent);
    color: var(--error);
  }

  .preview-actions {
    display: flex;
    gap: var(--space-xl);
  }

  .preview-actions {
    display: flex;
    gap: var(--space-xl);
  }

  .preview-actions .btn {
    flex: 1;
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
    border-radius: var(--radius-xl);
    padding: var(--space-3xl);
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
    margin: 0 0 var(--space-2xl) 0;
    font-size: var(--icon-sm);
    color: var(--error);
    font-family: var(--mono);
  }

  .modal-body {
    margin-bottom: var(--space-3xl);
  }

  .warning-text {
    font-size: 14px;
    color: var(--text);
    margin: 0 0 var(--space-xl) 0;
    line-height: 1.5;
  }

  .warning-subtext {
    font-size: 13px;
    color: var(--muted);
    margin: 0 0 var(--space-3xl) 0;
    line-height: 1.5;
  }

  .confirm-checkbox {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
    padding: var(--space-xl);
    background: var(--bg);
    border: 2px solid var(--border);
    border-radius: var(--radius);
    cursor: pointer;
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .confirm-checkbox:hover {
    border-color: var(--accent);
  }

  .confirm-checkbox input[type="checkbox"] {
    width: var(--icon-sm);
    height: var(--icon-sm);
    cursor: pointer;
  }

  .confirm-checkbox span {
    font-size: 13px;
    color: var(--text);
    user-select: none;
  }

  .modal-actions {
    display: flex;
    gap: var(--space-xl);
    justify-content: flex-end;
  }

  .modal-actions {
    display: flex;
    gap: var(--space-xl);
    justify-content: flex-end;
  }

  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-xl);
    padding: var(--space-4xl) var(--space-2xl);
    background: color-mix(in srgb, var(--error) 5%, transparent);
    border: 1px solid color-mix(in srgb, var(--error) 20%, transparent);
    border-radius: var(--radius);
    text-align: center;
  }

  .error-state p {
    margin: 0;
    color: var(--error);
    font-size: 13px;
    font-weight: 500;
  }


  /* Charts Section */
  .charts-section {
    margin-bottom: var(--space-2xl);
  }

  .charts-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-xl);
  }

  .chart-container {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-xl);
    border-left: 3px solid var(--accent);
  }

  .chart-header {
    margin-bottom: var(--space-lg);
  }

  .chart-header h3 {
    font-size: 11px;
    font-weight: 600;
    color: var(--text);
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .chart-canvas-wrapper {
    position: relative;
    height: 250px;
  }

  /* Responsive Charts */
  @media (max-width: 768px) {
    .charts-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
