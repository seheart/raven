<script>
  /**
   * Server Sync Page - Remote synchronization status
   */
  import { onMount } from 'svelte';

  let syncStatus = $state({ connected: false, lastSync: null, pending: 0 });

  onMount(async () => {
    try {
      const res = await fetch('http://localhost:3030/api/sync-status');
      syncStatus = await res.json();
    } catch (e) {
      console.error(e);
    }
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-7xl mx-auto">
    <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">🔄 Server Sync</h1>
    <p class="text-base text-[var(--muted)] font-sans mb-6">Remote synchronization status</p>

    <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
      <div class="flex items-center gap-4 mb-6">
        <div class="text-4xl">🔄</div>
        <div>
          <h2 class="text-xl font-semibold text-[var(--text-heading)] font-sans">Sync Status</h2>
          <p class="text-sm text-[var(--muted)] font-sans">
            {syncStatus.connected ? 'Connected to remote server' : 'Not connected'}
          </p>
        </div>
      </div>

      <div class="space-y-3 text-sm">
        <div class="flex justify-between items-center py-2 border-b border-[var(--border)]">
          <span class="text-[var(--muted)] font-sans">Connection:</span>
          <span
            class="font-mono"
            class:text-[var(--success)]={syncStatus.connected}
            class:text-[var(--error)]={!syncStatus.connected}
          >
            {syncStatus.connected ? 'Connected ✓' : 'Disconnected ✗'}
          </span>
        </div>
        <div class="flex justify-between items-center py-2 border-b border-[var(--border)]">
          <span class="text-[var(--muted)] font-sans">Last Sync:</span>
          <span class="text-[var(--text)] font-mono">{syncStatus.lastSync || 'Never'}</span>
        </div>
        <div class="flex justify-between items-center py-2">
          <span class="text-[var(--muted)] font-sans">Pending Changes:</span>
          <span class="text-[var(--text)] font-mono">{syncStatus.pending || 0}</span>
        </div>
      </div>
    </div>
  </div>
</div>
