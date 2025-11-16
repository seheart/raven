<script>
  import { logger } from '../logger.js';
  import { api } from '../apiClient.js';
  /**
   * Session Rollback Page
   * View and manage rollback sessions
   */

  // State
  let sessions = $state([]);
  let loading = $state(true);
  let error = $state(null);
  let lastUpdated = $state(new Date());
  let searchQuery = $state('');
  let selectedSession = $state(null);
  let selectedSessionData = $state(null);
  let previewData = $state(null);
  let previewing = $state(false);
  let showRollbackConfirm = $state(false);
  let confirmCheckbox = $state(false);

  // Derived values
  const filteredSessions = $derived.by(() => {
    if (!searchQuery.trim()) return sessions;

    const query = searchQuery.toLowerCase();
    return sessions.filter(session => session.session_id?.toLowerCase().includes(query));
  });

  // Time since last update
  const timeSinceUpdate = $derived.by(() => {
    return Math.floor((new Date() - lastUpdated) / 1000);
  });

  // Calculate session duration
  function getSessionDuration(session) {
    if (!session.start_time || !session.end_time) return 'N/A';
    const start = new Date(session.start_time);
    const end = new Date(session.end_time);
    const durationMs = end - start;
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }

  // Format date
  function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleString();
  }

  // Load sessions data
  async function loadSessions() {
    try {
      loading = true;
      error = null;

      const data = await api.get('/sessions');
      sessions = data.sessions || [];

      lastUpdated = new Date();
      loading = false;
    } catch {
      logger.error('Failed to load sessions:', err);
      error = err.message;
      loading = false;
    }
  }

  // Preview rollback (step 1: preview what will change)
  async function previewRollback(session) {
    try {
      previewing = true;
      selectedSession = session.session_id;
      selectedSessionData = session;

      await fetch(`http://localhost:3030/api/sessions/${session.session_id}/preview`);
      previewData = await response.json();
      previewing = false;
    } catch {
      logger.error('Failed to preview rollback:', err);
      alert(`Failed to preview rollback: ${err.message}`);
      previewing = false;
      selectedSession = null;
      selectedSessionData = null;
    }
  }

  // Show confirmation dialog (step 2: after preview loaded)
  function showRollbackConfirmation() {
    if (!selectedSession || !previewData) return;
    showRollbackConfirm = true;
    confirmCheckbox = false;
  }

  // Execute rollback (step 3: after confirmation)
  async function confirmRollback() {
    if (!selectedSession || !previewData || !confirmCheckbox) return;

    try {
      await fetch(`http://localhost:3030/api/sessions/${selectedSession}/rollback`, {
        method: 'POST'
      });
      const result = await response.json();

      // Show success message
      if (result.restoredFiles?.length > 0) {
        alert(`Successfully rolled back ${result.restoredFiles.length} file(s)`);
      } else {
        alert('Rollback completed successfully');
      }

      // Reload sessions after successful rollback
      await loadSessions();

      // Reset state
      showRollbackConfirm = false;
      selectedSession = null;
      selectedSessionData = null;
      previewData = null;
      confirmCheckbox = false;
    } catch {
      logger.error('Failed to rollback session:', err);
      alert(`Rollback failed: ${err.message}`);
    }
  }

  // Cancel rollback
  function cancelRollback() {
    showRollbackConfirm = false;
    confirmCheckbox = false;
  }

  // Cancel preview
  function cancelPreview() {
    selectedSession = null;
    selectedSessionData = null;
    previewData = null;
    confirmCheckbox = false;
  }

  // Export to CSV
  function exportToCSV() {
    const headers = ['Session ID', 'Start Time', 'End Time', 'Duration', 'Total Events'];
    const rows = filteredSessions.map(session => [
      session.session_id || '',
      formatDate(session.start_time),
      formatDate(session.end_time),
      getSessionDuration(session),
      session.total_events || 0
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sessions-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Export to JSON
  function exportToJSON() {
    const json = JSON.stringify(filteredSessions, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sessions-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Load on mount
  $effect(() => {
    loadSessions();
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-7xl mx-auto">
    <!-- Header -->
    <div class="flex justify-between items-start mb-6">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">Session Rollback</h1>
        <p class="text-base text-[var(--muted)] font-sans">
          Restore your codebase to a previous session state
        </p>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-sm text-[var(--muted)] font-sans">Updated {timeSinceUpdate}s ago</span>
        <button
          onclick={loadSessions}
          disabled={loading}
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>
    </div>

    {#if error}
      <div
        class="bg-[var(--error-subtle)] border border-[var(--error)] rounded-lg p-4 mb-6 flex justify-between items-center"
      >
        <span class="text-sm text-[var(--error)] font-sans">Failed to load sessions: {error}</span>
        <button
          onclick={loadSessions}
          class="px-3 py-1.5 bg-[var(--error)] text-white rounded text-sm font-sans"
        >
          Retry
        </button>
      </div>
    {:else if loading}
      <!-- Loading skeleton -->
      <div class="space-y-4">
        <div
          class="h-24 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-pulse"
        ></div>
        <div
          class="h-96 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-pulse"
        ></div>
      </div>
    {:else}
      <!-- Stats Card -->
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 mb-6">
        <div class="text-base text-[var(--muted)] font-sans mb-1">Total Sessions Available</div>
        <div class="text-3xl font-bold text-[var(--text-heading)]">{sessions.length}</div>
      </div>

      <!-- Filters and Actions -->
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 mb-4">
        <div class="flex flex-wrap gap-4 items-center">
          <!-- Search -->
          <div class="flex-1 min-w-[200px]">
            <input
              type="text"
              bind:value={searchQuery}
              placeholder="Search by session ID..."
              class="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-base font-sans text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          <!-- Export Buttons -->
          <button
            onclick={exportToCSV}
            disabled={filteredSessions.length === 0}
            class="px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors disabled:opacity-50"
          >
            Export CSV
          </button>
          <button
            onclick={exportToJSON}
            disabled={filteredSessions.length === 0}
            class="px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors disabled:opacity-50"
          >
            Export JSON
          </button>
        </div>
      </div>

      <!-- Sessions Table -->
      {#if filteredSessions.length === 0}
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center">
          <div class="text-5xl mb-4">📋</div>
          <div class="text-xl font-semibold text-[var(--text-heading)] mb-2 font-sans">
            {searchQuery ? 'No matching sessions' : 'No sessions available'}
          </div>
          <div class="text-base text-[var(--muted)] font-sans">
            {searchQuery ? 'Try adjusting your search' : 'Sessions will appear here once created'}
          </div>
        </div>
      {:else}
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="bg-[var(--surface-2)] border-b border-[var(--border)]">
                <tr>
                  <th
                    class="px-4 py-3 text-left text-sm font-semibold text-[var(--muted)] font-sans"
                    >Session ID</th
                  >
                  <th
                    class="px-4 py-3 text-left text-sm font-semibold text-[var(--muted)] font-sans"
                    >Start Time</th
                  >
                  <th
                    class="px-4 py-3 text-left text-sm font-semibold text-[var(--muted)] font-sans"
                    >End Time</th
                  >
                  <th
                    class="px-4 py-3 text-left text-sm font-semibold text-[var(--muted)] font-sans"
                    >Duration</th
                  >
                  <th
                    class="px-4 py-3 text-left text-sm font-semibold text-[var(--muted)] font-sans"
                    >Events</th
                  >
                  <th
                    class="px-4 py-3 text-left text-sm font-semibold text-[var(--muted)] font-sans"
                    >Actions</th
                  >
                </tr>
              </thead>
              <tbody class="divide-y divide-[var(--border)]">
                {#each filteredSessions as session, index (session.session_id || `session-${index}`)}
                  <tr class="hover:bg-[var(--surface-2)] transition-colors">
                    <td class="px-4 py-3 text-base font-mono text-[var(--text)]">
                      {session.session_id || 'N/A'}
                    </td>
                    <td class="px-4 py-3 text-sm text-[var(--text)] font-mono">
                      {formatDate(session.start_time)}
                    </td>
                    <td class="px-4 py-3 text-sm text-[var(--text)] font-mono">
                      {formatDate(session.end_time)}
                    </td>
                    <td class="px-4 py-3 text-base text-[var(--text)] font-sans">
                      {getSessionDuration(session)}
                    </td>
                    <td class="px-4 py-3 text-base text-[var(--text)] font-sans">
                      {session.total_events || 0}
                    </td>
                    <td class="px-4 py-3">
                      <button
                        onclick={() => previewRollback(session)}
                        disabled={previewing}
                        class="px-3 py-1 bg-[var(--accent)] text-white rounded text-xs font-sans hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {previewing && selectedSession === session.session_id
                          ? 'Loading...'
                          : 'Preview Rollback'}
                      </button>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Results Count -->
        <div class="mt-4 text-base text-[var(--muted)] font-sans text-center">
          Showing {filteredSessions.length} of {sessions.length} sessions
        </div>
      {/if}

      <!-- Preview Section -->
      {#if previewData && selectedSessionData}
        <div class="mt-6 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
          <div class="flex justify-between items-start mb-4">
            <div>
              <h2 class="text-xl font-bold text-[var(--text-heading)] mb-2 font-sans">
                Rollback Preview
              </h2>
              <p class="text-sm text-[var(--muted)] font-sans">
                Session: <span class="font-mono text-[var(--accent)]"
                  >{selectedSessionData.session_id}</span
                >
              </p>
            </div>
            <button
              onclick={cancelPreview}
              class="px-3 py-1.5 bg-[var(--surface-2)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors"
            >
              Cancel
            </button>
          </div>

          <!-- Session Info -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div class="bg-[var(--bg)] rounded-lg p-3">
              <div class="text-xs text-[var(--muted)] mb-1">Start Time</div>
              <div class="text-sm font-mono text-[var(--text)]">
                {formatDate(selectedSessionData.start_time)}
              </div>
            </div>
            <div class="bg-[var(--bg)] rounded-lg p-3">
              <div class="text-xs text-[var(--muted)] mb-1">End Time</div>
              <div class="text-sm font-mono text-[var(--text)]">
                {formatDate(selectedSessionData.end_time)}
              </div>
            </div>
            <div class="bg-[var(--bg)] rounded-lg p-3">
              <div class="text-xs text-[var(--muted)] mb-1">Duration</div>
              <div class="text-sm font-mono text-[var(--text)]">
                {getSessionDuration(selectedSessionData)}
              </div>
            </div>
          </div>

          <!-- Files to be Rolled Back -->
          {#if previewData.files && previewData.files.length > 0}
            <div class="mb-6">
              <h3 class="text-base font-semibold text-[var(--text)] mb-3 font-sans">
                Files to be rolled back ({previewData.files.length})
              </h3>
              <div class="max-h-64 overflow-y-auto space-y-2">
                {#each previewData.files as file (file)}
                  <div
                    class="px-3 py-2 bg-[var(--bg)] rounded text-sm font-mono text-[var(--text)]"
                  >
                    📄 {file}
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          <!-- Warning Message -->
          <div
            class="bg-[var(--warning-subtle)] border border-[var(--warning)] rounded-lg p-4 mb-4"
          >
            <div class="flex items-start gap-3">
              <span class="text-2xl">⚠️</span>
              <div class="flex-1">
                <h4 class="text-sm font-semibold text-[var(--warning)] mb-1 font-sans">Warning</h4>
                <p class="text-sm text-[var(--text)] font-sans">
                  This action will restore all files to their state at the end of this session. Any
                  changes made after this session will be lost. Make sure you have committed or
                  backed up any important work.
                </p>
              </div>
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="flex gap-3">
            <button
              onclick={showRollbackConfirmation}
              class="px-4 py-2 bg-[var(--warning)] text-white rounded text-sm font-sans hover:opacity-90 transition-opacity"
            >
              Proceed to Rollback
            </button>
            <button
              onclick={cancelPreview}
              class="px-4 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      {/if}
    {/if}
  </div>
</div>

<!-- Rollback Confirmation Modal -->
{#if showRollbackConfirm}
  <div
    class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
    role="dialog"
    aria-modal="true"
    aria-labelledby="rollback-confirm-title"
    tabindex="-1"
    onclick={cancelRollback}
    onkeydown={e => e.key === 'Escape' && cancelRollback()}
  >
    <div
      class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6 max-w-md w-full mx-4"
      onclick={e => e.stopPropagation()}
      onkeydown={e => e.stopPropagation()}
      role="button"
      tabindex="0"
    >
      <h2
        id="rollback-confirm-title"
        class="text-xl font-bold text-[var(--text-heading)] mb-4 font-sans"
      >
        Final Confirmation Required
      </h2>
      <p class="text-base text-[var(--text)] font-sans mb-4">
        You are about to rollback to session
        <span class="font-mono text-[var(--accent)]">{selectedSessionData?.session_id}</span>.
      </p>

      <!-- Warning Box -->
      <div class="bg-[var(--error-subtle)] border border-[var(--error)] rounded-lg p-4 mb-4">
        <div class="flex items-start gap-2">
          <span class="text-lg">⚠️</span>
          <div class="flex-1">
            <p class="text-sm text-[var(--error)] font-semibold mb-2 font-sans">
              This action cannot be undone!
            </p>
            <p class="text-sm text-[var(--text)] font-sans">
              All changes made after this session will be permanently lost.
            </p>
          </div>
        </div>
      </div>

      <!-- Confirmation Checkbox -->
      <label class="flex items-start gap-3 mb-6 cursor-pointer">
        <input
          type="checkbox"
          bind:checked={confirmCheckbox}
          class="mt-1 w-4 h-4 accent-[var(--warning)]"
        />
        <span class="text-sm text-[var(--text)] font-sans">
          I understand that this action is irreversible and I want to proceed with the rollback.
        </span>
      </label>

      <!-- Action Buttons -->
      <div class="flex gap-3 justify-end">
        <button
          onclick={cancelRollback}
          class="px-4 py-2 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors"
        >
          Cancel
        </button>
        <button
          onclick={confirmRollback}
          disabled={!confirmCheckbox}
          class="px-4 py-2 bg-[var(--warning)] text-white rounded text-sm font-sans hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Execute Rollback
        </button>
      </div>
    </div>
  </div>
{/if}
