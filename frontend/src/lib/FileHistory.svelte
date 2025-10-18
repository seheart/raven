<script>
  import { invoke } from '@tauri-apps/api/core';
  import { onMount } from 'svelte';
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
      const filename = filepath.split('/').pop();
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
    const date = new Date(timestamp);
    return date.toLocaleString();
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
        {#each history as event (event.id)}
          <div class="timeline-event {getChangeClass(event.change_type)}">
            <div class="event-marker"></div>
            <div class="event-content">
              <div class="event-header">
                <span class="badge {event.change_type}">{event.change_type}</span>
                <span class="time">{formatTime(event.timestamp)}</span>
              </div>
              <div class="event-meta">
                <span class="metric">CPU: {event.cpu.toFixed(1)}%</span>
                <span class="metric">MEM: {event.mem.toFixed(1)}%</span>
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
          <h3>Snapshot - Event #{selectedEvent.id}</h3>
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
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-content {
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 8px;
    width: 90%;
    max-width: 900px;
    max-height: 90vh;
    overflow-y: auto;
    padding: 2rem;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    padding-bottom: 1rem;
    border-bottom: 2px solid #646cff;
  }

  h2 {
    margin: 0;
    color: #fff;
    font-size: 1.5rem;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 2rem;
    color: #888;
    cursor: pointer;
    padding: 0;
    width: 32px;
    height: 32px;
  }

  .close-btn:hover {
    color: #fff;
  }

  .file-path {
    font-family: 'Courier New', monospace;
    color: #646cff;
    margin-bottom: 1.5rem;
    padding: 0.75rem;
    background: #2a2a2a;
    border-radius: 4px;
  }

  .loading, .empty {
    text-align: center;
    padding: 3rem;
    color: #888;
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
    background: #333;
  }

  .timeline-event {
    position: relative;
    margin-bottom: 2rem;
  }

  .event-marker {
    position: absolute;
    left: -26px;
    top: 8px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #646cff;
    border: 2px solid #1a1a1a;
  }

  .timeline-event.change-created .event-marker {
    background: #4ade80;
  }

  .timeline-event.change-modified .event-marker {
    background: #f59e0b;
  }

  .timeline-event.change-deleted .event-marker {
    background: #ef4444;
  }

  .event-content {
    background: #2a2a2a;
    padding: 1rem;
    border-radius: 6px;
    border-left: 3px solid #646cff;
  }

  .timeline-event.change-created .event-content {
    border-left-color: #4ade80;
  }

  .timeline-event.change-modified .event-content {
    border-left-color: #f59e0b;
  }

  .timeline-event.change-deleted .event-content {
    border-left-color: #ef4444;
  }

  .event-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .badge {
    padding: 0.2rem 0.5rem;
    font-size: 0.75rem;
    border-radius: 3px;
    text-transform: uppercase;
    font-weight: 600;
  }

  .badge.modified {
    background: #f59e0b33;
    color: #f59e0b;
  }

  .badge.created {
    background: #4ade8033;
    color: #4ade80;
  }

  .badge.deleted {
    background: #ef444433;
    color: #ef4444;
  }

  .time {
    color: #888;
    font-size: 0.9rem;
  }

  .event-meta {
    display: flex;
    gap: 1rem;
    margin-bottom: 0.75rem;
    font-size: 0.85rem;
    color: #666;
  }

  .event-id {
    color: #646cff;
  }

  .event-actions {
    display: flex;
    gap: 0.5rem;
  }

  .btn-view, .btn-diff, .btn-restore {
    padding: 0.5rem 1rem;
    font-size: 0.85rem;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
  }

  .btn-view {
    background: #2a2a2a;
    color: #646cff;
    border: 1px solid #646cff;
  }

  .btn-view:hover {
    background: #646cff;
    color: white;
  }

  .btn-diff {
    background: #2a2a2a;
    color: #f59e0b;
    border: 1px solid #f59e0b;
  }

  .btn-diff:hover {
    background: #f59e0b;
    color: #000;
  }

  .btn-restore {
    background: #4ade80;
    color: #000;
  }

  .btn-restore:hover {
    background: #22c55e;
  }

  .snapshot-viewer {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 8px;
    padding: 1.5rem;
    max-width: 800px;
    max-height: 80vh;
    overflow-y: auto;
    z-index: 1001;
  }

  .snapshot-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid #333;
  }

  .snapshot-header h3 {
    margin: 0;
    color: #fff;
  }

  .snapshot-header button {
    background: #2a2a2a;
    color: #888;
    border: 1px solid #444;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
  }

  .snapshot-header button:hover {
    background: #333;
    color: #fff;
  }

  .snapshot-content {
    font-family: 'Courier New', monospace;
    font-size: 0.9rem;
    color: #ddd;
    background: #0a0a0a;
    padding: 1rem;
    border-radius: 4px;
    overflow-x: auto;
    white-space: pre-wrap;
    max-height: 60vh;
  }
</style>
