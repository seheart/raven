<script>
  import { invoke } from '@tauri-apps/api/core';
  import { onMount } from 'svelte';
  import { formatDateTime } from './timeFormat.js';
  import DiffViewer from './DiffViewer.svelte';

  export let onClose = () => {};
  export let filepath = '';

  let history = [];
  let loading = true;
  let selectedEvent = null;
  let snapshotContent = '';
  let showSnapshot = false;
  let showDiff = false;
  let diffContent = '';

  onMount(async () => {
    await loadHistory();
  });

  async function loadHistory() {
    try {
      loading = true;
      history = await invoke('get_file_history', { filepath });
      loading = false;
    } catch (error) {
      console.error('Failed to load file history:', error);
      loading = false;
    }
  }

  async function viewSnapshot(event) {
    selectedEvent = event;
    showSnapshot = true;

    try {
      const filename = filepath?.split('/')?.pop() || '';
      snapshotContent = await invoke('get_snapshot', {
        eventId: event.id,
        filename
      });
    } catch (error) {
      console.error('Failed to load snapshot:', error);
      snapshotContent = `Error loading snapshot: ${error}`;
    }
  }

  async function restoreToEvent(event) {
    if (!confirm(`Restore ${filepath} to state at ${formatTime(event.timestamp)}?`)) {
      return;
    }

    try {
      const result = await invoke('restore_file', {
        eventId: event.id,
        targetPath: filepath
      });
      alert(result);
      onClose();
    } catch (error) {
      alert(`Failed to restore: ${error}`);
    }
  }

  function viewDiff(event) {
    if (event.diff) {
      diffContent = event.diff;
      showDiff = true;
    } else {
      alert('No diff available for this event');
    }
  }

  function formatTime(timestamp) {
    return formatDateTime(timestamp);
  }

  function getChangeClass(type) {
    return {
      'modified': 'change-modified',
      'created': 'change-created',
      'deleted': 'change-deleted'
    }[type] || '';
  }
</script>

<div class="modal-overlay" on:click={onClose}>
  <div class="modal-content" on:click|stopPropagation>
    <div class="modal-header">
      <h2>📜 File History</h2>
      <button class="close-btn" on:click={onClose}>×</button>
    </div>

    <div class="file-path">{filepath}</div>

    {#if loading}
      <div class="loading">Loading history...</div>
    {:else if history.length === 0}
      <div class="empty">No history found for this file</div>
    {:else}
      <div class="timeline">
        {#each history || [] as event (event.id)}
          <div class="timeline-event {getChangeClass(event.change_type)}">
            <div class="event-marker"></div>
            <div class="event-content">
              <div class="event-header">
                <span class="badge {event.change_type}">{event.change_type}</span>
                <span class="time">{formatTime(event.timestamp)}</span>
              </div>
              <div class="event-meta">
                <span class="metric">CPU: {(event.cpu ?? 0).toFixed(1)}%</span>
                <span class="metric">MEM: {(event.mem ?? 0).toFixed(1)}%</span>
                <span class="event-id">Event #{event.id}</span>
              </div>
              <div class="event-actions">
                <button class="btn-view" on:click={() => viewSnapshot(event)}>
                  View Snapshot
                </button>
                {#if event.diff}
                  <button class="btn-diff" on:click={() => viewDiff(event)}>
                    View Diff
                  </button>
                {/if}
                <button class="btn-restore" on:click={() => restoreToEvent(event)}>
                  Restore to This Point
                </button>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}

    {#if showSnapshot}
      <div class="snapshot-viewer">
        <div class="snapshot-header">
          <h3>Snapshot - Event #{selectedEvent?.id || 'N/A'}</h3>
          <button on:click={() => showSnapshot = false}>Close</button>
        </div>
        <pre class="snapshot-content">{snapshotContent}</pre>
      </div>
    {/if}
  </div>
</div>

{#if showDiff}
  <DiffViewer diff={diffContent} onClose={() => showDiff = false} />
{/if}

<style>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: color-mix(in srgb, var(--bg) 80%, black);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-content {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    width: 90%;
    max-width: 900px;
    max-height: 90vh;
    overflow-y: auto;
    padding: 12px;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    padding-bottom: 1rem;
    border-bottom: 2px solid var(--info);
  }

  .modal-header {
    padding: 0 8px;
  }

  h2 {
    margin: 0;
    color: var(--text);
    font-size: 18px;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 13px;
    color: var(--muted);
    cursor: pointer;
    padding: 0;
    width: 32px;
    height: 32px;
  }

  .close-btn:hover {
    color: var(--text);
  }

  .file-path {
    font-family: 'Courier New', monospace;
    color: var(--info);
    margin-bottom: 10px;
    padding: 8px;
    background: var(--surface-2);
    border-radius: 4px;
  }

  .loading, .empty {
    text-align: center;
    padding: 16px;
    color: var(--muted);
  }

  .timeline {
    position: relative;
    padding-left: 2rem;
  }

  .timeline::before {
    content: '';
    position: absolute;
    left: 10px;
    top: 0;
    bottom: 0;
    width: 2px;
    background: var(--surface-2);
  }

  .timeline-event {
    position: relative;
    margin-bottom: 10px;
  }

  .event-marker {
    position: absolute;
    left: -26px;
    top: 8px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--info);
    border: 2px solid var(--surface);
  }

  .timeline-event.change-created .event-marker {
    background: var(--success);
  }

  .timeline-event.change-modified .event-marker {
    background: var(--warning);
  }

  .timeline-event.change-deleted .event-marker {
    background: var(--error);
  }

  .event-content {
    background: var(--surface-2);
    padding: 10px;
    border-radius: 6px;
    border-left: 3px solid var(--info);
  }

  .timeline-event.change-created .event-content {
    border-left-color: var(--success);
  }

  .timeline-event.change-modified .event-content {
    border-left-color: var(--warning);
  }

  .timeline-event.change-deleted .event-content {
    border-left-color: var(--error);
  }

  .event-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .badge {
    padding: 4px 0.5rem;
    font-size: 11px;
    border-radius: 3px;
    text-transform: uppercase;
    font-weight: 600;
  }

  .badge.modified {
    background: var(--warning)33;
    color: var(--warning);
  }

  .badge.created {
    background: var(--success)33;
    color: var(--success);
  }

  .badge.deleted {
    background: var(--error)33;
    color: var(--error);
  }

  .time {
    color: var(--muted);
    font-size: 12px;
  }

  .event-meta {
    display: flex;
    gap: 10px;
    margin-bottom: 0.75rem;
    font-size: 11px;
    color: var(--muted);
  }

  .event-id {
    color: var(--info);
  }

  .event-actions {
    display: flex;
    gap: 0.5rem;
  }

  .btn-view, .btn-diff, .btn-restore {
    padding: 6px 1rem;
    font-size: 11px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
  }

  .btn-view {
    background: var(--surface-2);
    color: var(--info);
    border: 1px solid var(--info);
  }

  .btn-view:hover {
    background: var(--info);
    color: white;
  }

  .btn-diff {
    background: var(--surface-2);
    color: var(--warning);
    border: 1px solid var(--warning);
  }

  .btn-diff:hover {
    background: var(--warning);
    color: var(--text-heading);
  }

  .btn-restore {
    background: var(--success);
    color: var(--text-heading);
  }

  .btn-restore:hover {
    background: var(--success);
  }

  .snapshot-viewer {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px;
    max-width: 800px;
    max-height: 80vh;
    overflow-y: auto;
    z-index: 1001;
  }

  .snapshot-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border);
  }

  .snapshot-header h3 {
    margin: 0;
    color: var(--text);
    font-size: 15px;
  }

  .snapshot-header button {
    background: var(--surface-2);
    color: var(--muted);
    border: 1px solid var(--border);
    padding: 6px 1rem;
    border-radius: 4px;
    cursor: pointer;
  }

  .snapshot-header button:hover {
    background: var(--surface-2);
    color: var(--text);
  }

  .snapshot-content {
    font-family: 'Courier New', monospace;
    font-size: 12px;
    color: var(--text);
    background: var(--bg);
    padding: 10px;
    border-radius: 4px;
    overflow-x: auto;
    white-space: pre-wrap;
    max-height: 60vh;
  }
</style>
