<script>
  import { onMount } from 'svelte';
  import { formatDateTime } from './timeFormat.js';
  import DiffViewer from './DiffViewer.svelte';
  import { api } from './apiClient.js';
  import { notifications } from './notificationService.js';
  import { logger } from './logger.js';

  export let onClose = () => {};
  export let filepath = '';
  export let inline = false;

  let history = [];
  let loading = true;
  let selectedEvent = null;
  let snapshotContent = '';
  let showSnapshot = false;
  let showDiff = false;
  let diffContent = '';
  let restoring = false;
  let comparisonMode = false;
  let selectedForComparison = [];
  let comparingSnapshots = false;
  let searchQuery = '';
  let filterChangeType = 'all';

  // Filtered history based on search and type filter
  $: filteredHistory = history.filter(event => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesTime = formatTime(event.timestamp).toLowerCase().includes(query);
      const matchesType = event.change_type?.toLowerCase().includes(query);
      const matchesId = `#${event.id}`.includes(query);
      if (!matchesTime && !matchesType && !matchesId) {
        return false;
      }
    }

    // Change type filter
    if (filterChangeType !== 'all' && event.change_type !== filterChangeType) {
      return false;
    }

    return true;
  });

  onMount(async () => {
    await loadHistory();
  });

  async function loadHistory() {
    try {
      loading = true;
      history = await api.get(`/files/${encodeURIComponent(filepath)}/history`);
      loading = false;
    } catch (error) {
      logger.error('Failed to load file history:', error);
      notifications.error(`Failed to load file history: ${error.message}`);
      loading = false;
    }
  }

  async function viewSnapshot(event) {
    selectedEvent = event;
    showSnapshot = true;

    try {
      const filename = filepath?.split('/')?.pop() || '';
      // Endpoint returns text; api.get already decodes it.
      snapshotContent = await api.get(`/snapshot/${event.id}/${encodeURIComponent(filename)}`);
    } catch (error) {
      logger.error('Failed to load snapshot:', error);
      snapshotContent = `Error loading snapshot: ${error.message}`;
      notifications.error(`Failed to load snapshot: ${error.message}`);
    }
  }

  async function restoreToEvent(event) {
    const confirmed = confirm(
      ` Restore ${filepath} to state at ${formatTime(event.timestamp)}?\n\n` +
        `This will overwrite the current file with the snapshot from Event #${event.id}.`
    );

    if (!confirmed) {
      return;
    }

    try {
      restoring = true;
      const result = await api.post('/restore', {
        eventId: event.id,
        targetPath: filepath
      });

      notifications.success(result.message || 'File restored successfully!', {
        title: ' Restoration Complete'
      });

      onClose();
    } catch (error) {
      logger.error('Failed to restore:', error);
      notifications.error(`Failed to restore file: ${error.message}`, {
        title: ' Restoration Failed'
      });
    } finally {
      restoring = false;
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
    return (
      {
        modified: 'change-modified',
        created: 'change-created',
        deleted: 'change-deleted'
      }[type] || ''
    );
  }

  function toggleComparisonMode() {
    comparisonMode = !comparisonMode;
    if (!comparisonMode) {
      selectedForComparison = [];
    }
  }

  function toggleEventSelection(event) {
    const index = selectedForComparison.findIndex(e => e.id === event.id);

    if (index > -1) {
      // Deselect
      selectedForComparison = selectedForComparison.filter(e => e.id !== event.id);
    } else {
      // Select (max 2)
      if (selectedForComparison.length < 2) {
        selectedForComparison = [...selectedForComparison, event];
      } else {
        notifications.warning('You can only compare 2 snapshots at a time. Deselect one first.');
      }
    }
  }

  function isSelectedForComparison(event) {
    return selectedForComparison.some(e => e.id === event.id);
  }

  async function compareSelectedSnapshots() {
    if (selectedForComparison.length !== 2) {
      notifications.warning('Please select exactly 2 snapshots to compare');
      return;
    }

    try {
      comparingSnapshots = true;

      // Get snapshots (oldest first, newest second)
      const [event1, event2] = selectedForComparison.sort(
        (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
      );

      // Fetch both snapshots
      const filename = filepath?.split('/')?.pop() || '';

      const [snapshot1Content, snapshot2Content] = await Promise.all([
        api.get(`/snapshot/${event1.id}/${encodeURIComponent(filename)}`),
        api.get(`/snapshot/${event2.id}/${encodeURIComponent(filename)}`)
      ]);

      // Generate unified diff
      diffContent = generateUnifiedDiff(snapshot1Content, snapshot2Content, event1, event2);
      showDiff = true;
      comparingSnapshots = false;
    } catch (error) {
      logger.error('Failed to compare snapshots:', error);
      notifications.error(`Failed to compare snapshots: ${error.message}`);
      comparingSnapshots = false;
    }
  }

  function generateUnifiedDiff(oldContent, newContent, oldEvent, newEvent) {
    // Simple line-by-line diff
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');

    let diff = `--- ${filepath} @ ${formatTime(oldEvent.timestamp)} (Event #${oldEvent.id})\n`;
    diff += `+++ ${filepath} @ ${formatTime(newEvent.timestamp)} (Event #${newEvent.id})\n`;

    // Simple diff algorithm (you could use a library for better diffs)
    const maxLen = Math.max(oldLines.length, newLines.length);

    for (let i = 0; i < maxLen; i++) {
      const oldLine = oldLines[i] || '';
      const newLine = newLines[i] || '';

      if (oldLine !== newLine) {
        if (oldLine) diff += `- ${oldLine}\n`;
        if (newLine) diff += `+ ${newLine}\n`;
      }
    }

    return diff;
  }
</script>

{#if inline}
  <div class="inline-content" role="region" aria-labelledby="file-history-heading">
    <div class="inline-header">
      <div class="header-actions" role="toolbar" aria-label="File history actions">
        <button
          class="btn btn-secondary btn-sm"
          class:active={comparisonMode}
          on:click={toggleComparisonMode}
          aria-pressed={comparisonMode}
          aria-label={comparisonMode ? 'Exit comparison mode' : 'Enter comparison mode'}
        >
          <span aria-hidden="true">{comparisonMode ? '' : ''}</span>
          {comparisonMode ? 'Comparison Mode' : 'Compare Snapshots'}
        </button>
        {#if comparisonMode && selectedForComparison.length === 2}
          <button
            class="btn btn-primary btn-sm"
            on:click={compareSelectedSnapshots}
            disabled={comparingSnapshots}
            aria-label={comparingSnapshots ? 'Comparing snapshots' : 'Compare selected snapshots'}
          >
            <span aria-hidden="true">{comparingSnapshots ? '' : ''}</span>
            {comparingSnapshots ? 'Comparing...' : 'Compare Selected'}
          </button>
        {/if}
      </div>
    </div>

    <!-- Inline mode content -->
    {#if comparisonMode}
      <div class="comparison-help">
        Select 2 snapshots to compare ({selectedForComparison.length}/2 selected)
      </div>
    {/if}

    {#if !loading && history.length > 0}
      <div class="filter-bar" role="search" aria-label="Filter file history">
        <div class="search-box">
          <input
            type="text"
            placeholder=" Search by time, type, or event #..."
            bind:value={searchQuery}
            aria-label="Search file history"
          />
        </div>
        <div class="type-filter">
          <select bind:value={filterChangeType} aria-label="Filter by change type">
            <option value="all">All Types ({history.length})</option>
            <option value="modified">Modified Only</option>
            <option value="created">Created Only</option>
            <option value="deleted">Deleted Only</option>
          </select>
        </div>
        <div class="filter-stats" role="status" aria-live="polite">
          Showing {filteredHistory.length} of {history.length} snapshots
        </div>
      </div>
    {/if}

    {#if loading}
      <div class="loading" role="status" aria-live="polite">Loading history...</div>
    {:else if history.length === 0}
      <div class="empty" role="status">No history found for this file</div>
    {:else if filteredHistory.length === 0}
      <div class="empty" role="status">No snapshots match your filters</div>
    {:else}
      <div class="timeline" role="feed" aria-label="File history timeline">
        {#each filteredHistory || [] as event (event.id)}
          <article
            class="timeline-event {getChangeClass(event.change_type)}"
            class:selected={isSelectedForComparison(event)}
            class:selectable={comparisonMode}
          >
            {#if comparisonMode}
              <div class="event-checkbox">
                <input
                  type="checkbox"
                  checked={isSelectedForComparison(event)}
                  on:change={() => toggleEventSelection(event)}
                  aria-label="Select event #{event.id} for comparison"
                />
              </div>
            {/if}
            <div class="event-marker" aria-hidden="true"></div>
            <div class="event-content">
              <div class="event-header">
                <span class="badge {event.change_type}">{event.change_type}</span>
                <time class="time" datetime={event.timestamp}>{formatTime(event.timestamp)}</time>
              </div>
              <div class="event-meta">
                <span class="metric">CPU: {(event.cpu ?? 0).toFixed(1)}%</span>
                <span class="metric">MEM: {(event.mem ?? 0).toFixed(1)}%</span>
                <span class="event-id">Event #{event.id}</span>
              </div>
              <div class="event-actions" role="group" aria-label="Event actions">
                <button
                  class="btn btn-secondary btn-sm"
                  on:click={() => viewSnapshot(event)}
                  aria-label="View snapshot for event #{event.id}"
                >
                  View Snapshot
                </button>
                {#if event.diff}
                  <button
                    class="btn btn-secondary btn-sm"
                    on:click={() => viewDiff(event)}
                    aria-label="View diff for event #{event.id}"
                  >
                    View Diff
                  </button>
                {/if}
                <button
                  class="btn btn-primary btn-sm"
                  on:click={() => restoreToEvent(event)}
                  disabled={restoring}
                  aria-label={restoring ? 'Restoring file' : 'Restore file to this snapshot'}
                >
                  <span aria-hidden="true"
                    >{#if restoring}{:else}{/if}</span
                  >
                  {#if restoring}Restoring...{:else}Undo Claude{/if}
                </button>
              </div>
            </div>
          </article>
        {/each}
      </div>
    {/if}

    {#if showSnapshot}
      <div class="snapshot-viewer" role="document" aria-labelledby="snapshot-heading">
        <div class="snapshot-header">
          <h3 id="snapshot-heading">Snapshot - Event #{selectedEvent?.id || 'N/A'}</h3>
          <button
            class="btn btn-ghost btn-sm"
            on:click={() => (showSnapshot = false)}
            aria-label="Close snapshot viewer">Close</button
          >
        </div>
        <pre
          class="snapshot-content"
          role="region"
          aria-label="Snapshot file content">{snapshotContent}</pre>
      </div>
    {/if}
  </div>
{:else}
  <div
    class="modal-overlay"
    on:click={onClose}
    on:keydown={e => e.key === 'Escape' && onClose()}
    role="presentation"
    tabindex="-1"
  >
    <div
      class="modal-content"
      on:click|stopPropagation
      on:keydown={e => e.stopPropagation()}
      role="dialog"
      tabindex="-1"
      aria-modal="true"
      aria-labelledby="file-history-heading"
    >
      <div class="modal-header">
        <h2 id="file-history-heading"><span aria-hidden="true"></span> File History</h2>
        <div class="header-actions" role="toolbar" aria-label="File history actions">
          <button
            class="btn btn-secondary btn-sm"
            class:active={comparisonMode}
            on:click={toggleComparisonMode}
            aria-pressed={comparisonMode}
            aria-label={comparisonMode ? 'Exit comparison mode' : 'Enter comparison mode'}
          >
            <span aria-hidden="true">{comparisonMode ? '' : ''}</span>
            {comparisonMode ? 'Comparison Mode' : 'Compare Snapshots'}
          </button>
          {#if comparisonMode && selectedForComparison.length === 2}
            <button
              class="btn btn-primary btn-sm"
              on:click={compareSelectedSnapshots}
              disabled={comparingSnapshots}
              aria-label={comparingSnapshots ? 'Comparing snapshots' : 'Compare selected snapshots'}
            >
              <span aria-hidden="true">{comparingSnapshots ? '' : ''}</span>
              {comparingSnapshots ? 'Comparing...' : 'Compare Selected'}
            </button>
          {/if}
        </div>
        <button
          class="btn btn-ghost btn-icon"
          on:click={onClose}
          aria-label="Close file history dialog">×</button
        >
      </div>

      <div class="file-path">{filepath}</div>

      <!-- Modal mode content -->
      {#if comparisonMode}
        <div class="comparison-help">
          Select 2 snapshots to compare ({selectedForComparison.length}/2 selected)
        </div>
      {/if}

      {#if !loading && history.length > 0}
        <div class="filter-bar" role="search" aria-label="Filter file history">
          <div class="search-box">
            <input
              type="text"
              placeholder=" Search by time, type, or event #..."
              bind:value={searchQuery}
              aria-label="Search file history"
            />
          </div>
          <div class="type-filter">
            <select bind:value={filterChangeType} aria-label="Filter by change type">
              <option value="all">All Types ({history.length})</option>
              <option value="modified">Modified Only</option>
              <option value="created">Created Only</option>
              <option value="deleted">Deleted Only</option>
            </select>
          </div>
          <div class="filter-stats" role="status" aria-live="polite">
            Showing {filteredHistory.length} of {history.length} snapshots
          </div>
        </div>
      {/if}

      {#if loading}
        <div class="loading" role="status" aria-live="polite">Loading history...</div>
      {:else if history.length === 0}
        <div class="empty" role="status">No history found for this file</div>
      {:else if filteredHistory.length === 0}
        <div class="empty" role="status">No snapshots match your filters</div>
      {:else}
        <div class="timeline" role="feed" aria-label="File history timeline">
          {#each filteredHistory || [] as event (event.id)}
            <article
              class="timeline-event {getChangeClass(event.change_type)}"
              class:selected={isSelectedForComparison(event)}
              class:selectable={comparisonMode}
            >
              {#if comparisonMode}
                <div class="event-checkbox">
                  <input
                    type="checkbox"
                    checked={isSelectedForComparison(event)}
                    on:change={() => toggleEventSelection(event)}
                    aria-label="Select event #{event.id} for comparison"
                  />
                </div>
              {/if}
              <div class="event-marker" aria-hidden="true"></div>
              <div class="event-content">
                <div class="event-header">
                  <span class="badge {event.change_type}">{event.change_type}</span>
                  <time class="time" datetime={event.timestamp}>{formatTime(event.timestamp)}</time>
                </div>
                <div class="event-meta">
                  <span class="metric">CPU: {(event.cpu ?? 0).toFixed(1)}%</span>
                  <span class="metric">MEM: {(event.mem ?? 0).toFixed(1)}%</span>
                  <span class="event-id">Event #{event.id}</span>
                </div>
                <div class="event-actions" role="group" aria-label="Event actions">
                  <button
                    class="btn btn-secondary btn-sm"
                    on:click={() => viewSnapshot(event)}
                    aria-label="View snapshot for event #{event.id}"
                  >
                    View Snapshot
                  </button>
                  {#if event.diff}
                    <button
                      class="btn btn-secondary btn-sm"
                      on:click={() => viewDiff(event)}
                      aria-label="View diff for event #{event.id}"
                    >
                      View Diff
                    </button>
                  {/if}
                  <button
                    class="btn btn-primary btn-sm"
                    on:click={() => restoreToEvent(event)}
                    disabled={restoring}
                    aria-label={restoring ? 'Restoring file' : 'Restore file to this snapshot'}
                  >
                    <span aria-hidden="true"
                      >{#if restoring}{:else}{/if}</span
                    >
                    {#if restoring}Restoring...{:else}Undo Claude{/if}
                  </button>
                </div>
              </div>
            </article>
          {/each}
        </div>
      {/if}

      {#if showSnapshot}
        <div class="snapshot-viewer" role="document" aria-labelledby="snapshot-heading">
          <div class="snapshot-header">
            <h3 id="snapshot-heading">Snapshot - Event #{selectedEvent?.id || 'N/A'}</h3>
            <button
              class="btn btn-ghost btn-sm"
              on:click={() => (showSnapshot = false)}
              aria-label="Close snapshot viewer">Close</button
            >
          </div>
          <pre
            class="snapshot-content"
            role="region"
            aria-label="Snapshot file content">{snapshotContent}</pre>
        </div>
      {/if}
    </div>
  </div>
{/if}

{#if showDiff}
  <DiffViewer diff={diffContent} onClose={() => (showDiff = false)} />
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
    cursor: pointer;
  }

  .modal-content {
    cursor: default;
  }

  .modal-content {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    width: 90%;
    max-width: 900px;
    max-height: 90vh;
    overflow-y: auto;
    padding: var(--space-xl);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-lg);
    padding-bottom: 1rem;
    border-bottom: 2px solid var(--info);
  }

  .modal-header {
    padding: 0 var(--space-lg);
  }

  h2 {
    margin: 0;
    color: var(--text);
    font-size: 12px;
  }

  .file-path {
    font-family: var(--mono);
    color: var(--info);
    margin-bottom: var(--space-lg);
    padding: var(--space-lg);
    background: var(--surface-2);
    border-radius: var(--radius);
  }

  .loading,
  .empty {
    text-align: center;
    padding: var(--space-2xl);
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
    margin-bottom: var(--space-lg);
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
    padding: var(--space-lg);
    border-radius: var(--radius-sm);
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
    padding: var(--space-sm) 0.5rem;
    font-size: 11px;
    border-radius: var(--radius-sm);
    text-transform: uppercase;
    font-weight: 600;
  }

  .badge.modified {
    background: var(--warning) 33;
    color: var(--warning);
  }

  .badge.created {
    background: var(--success) 33;
    color: var(--success);
  }

  .badge.deleted {
    background: var(--error) 33;
    color: var(--error);
  }

  .time {
    color: var(--muted);
    font-size: 12px;
  }

  .event-meta {
    display: flex;
    gap: var(--space-lg);
    margin-bottom: 0.75rem;
    font-size: 11px;
    color: var(--muted);
  }

  .event-id {
    color: var(--info);
  }

  .event-actions {
    display: flex;
    gap: var(--space-lg);
  }

  .snapshot-viewer {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-xl);
    max-width: 800px;
    max-height: 80vh;
    overflow-y: auto;
    z-index: 1001;
  }

  .snapshot-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-lg);
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border);
  }

  .snapshot-header h3 {
    margin: 0;
    color: var(--text);
    font-size: 12px;
  }

  .snapshot-content {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--text);
    background: var(--bg);
    padding: var(--space-lg);
    border-radius: var(--radius);
    overflow-x: auto;
    white-space: pre-wrap;
    max-height: 60vh;
  }

  /* Inline styles */
  .inline-content {
    background: transparent;
  }

  .inline-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-xl);
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border);
  }

  .inline-content .timeline {
    padding-left: 1.5rem;
  }

  .inline-content .timeline::before {
    left: 6px;
  }

  .inline-content .event-marker {
    left: -20px;
    width: 10px;
    height: 10px;
  }

  .inline-content .filter-bar {
    margin-bottom: var(--space-xl);
  }

  .inline-content .comparison-help {
    margin-bottom: var(--space-xl);
    padding: var(--space-lg);
    background: var(--surface-2);
    border-radius: var(--radius);
    font-size: 12px;
    color: var(--muted);
    text-align: center;
  }
</style>
