<script>
  /**
   * Storage Page - Database size and retention management
   */
  import { onMount } from 'svelte';

  let storage = $state({ size: 0, events: 0, retention_days: 30 });

  onMount(async () => {
    try {
      const res = await fetch('http://localhost:3030/api/storage-stats');
      storage = await res.json();
    } catch (e) {
      console.error(e);
    }
  });

  function formatBytes(bytes) {
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-7xl mx-auto">
    <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">💾 Storage Management</h1>
    <p class="text-base text-[var(--muted)] font-sans mb-6">Database size and retention policies</p>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
        <div class="text-2xl mb-2">💾</div>
        <div class="text-2xl font-bold text-[var(--text-heading)] font-mono">
          {formatBytes(storage.size)}
        </div>
        <div class="text-sm text-[var(--muted)] font-sans">Database Size</div>
      </div>

      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
        <div class="text-2xl mb-2">📊</div>
        <div class="text-2xl font-bold text-[var(--text-heading)] font-mono">
          {storage.events?.toLocaleString() || 0}
        </div>
        <div class="text-sm text-[var(--muted)] font-sans">Total Events</div>
      </div>

      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
        <div class="text-2xl mb-2">📅</div>
        <div class="text-2xl font-bold text-[var(--text-heading)] font-mono">
          {storage.retention_days || 30}
        </div>
        <div class="text-sm text-[var(--muted)] font-sans">Retention Days</div>
      </div>
    </div>
  </div>
</div>
