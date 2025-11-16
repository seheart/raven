<script>
  /**
   * Errors Page - System error log and tracking
   */
  import { onMount } from 'svelte';

  let errors = $state([]);
  let stats = $state({ total: 0, critical: 0, warning: 0 });
  let loading = $state(true);

  onMount(async () => {
    try {
      const [errorsRes, statsRes] = await Promise.all([
        fetch('http://localhost:3030/api/errors?limit=50'),
        fetch('http://localhost:3030/api/errors/stats')
      ]);
      errors = await errorsRes.json();
      stats = await statsRes.json();
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  });

  function formatTime(timestamp) {
    return new Date(timestamp).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function getSeverityColor(severity) {
    return severity === 'critical' ? '#ef4444' : severity === 'warning' ? '#f59e0b' : '#3b82f6';
  }
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-7xl mx-auto">
    <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">🐛 Error Log</h1>
    <p class="text-base text-[var(--muted)] font-sans mb-6">
      System error tracking and diagnostics
    </p>

    <!-- Stats -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
        <div class="text-2xl mb-2">📊</div>
        <div class="text-2xl font-bold text-[var(--text-heading)] font-mono">
          {stats.total || 0}
        </div>
        <div class="text-sm text-[var(--muted)] font-sans">Total Errors</div>
      </div>

      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
        <div class="text-2xl mb-2">🔴</div>
        <div class="text-2xl font-bold font-mono" style="color: #ef4444">{stats.critical || 0}</div>
        <div class="text-sm text-[var(--muted)] font-sans">Critical</div>
      </div>

      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
        <div class="text-2xl mb-2">⚠️</div>
        <div class="text-2xl font-bold font-mono" style="color: #f59e0b">{stats.warning || 0}</div>
        <div class="text-sm text-[var(--muted)] font-sans">Warnings</div>
      </div>
    </div>

    <!-- Errors List -->
    {#if loading}
      <div class="space-y-3">
        {#each Array(5) as _, i (i)}
          <div
            class="h-24 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-pulse"
          ></div>
        {/each}
      </div>
    {:else if errors.length === 0}
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-8 text-center">
        <div class="text-4xl mb-3">✅</div>
        <p class="text-[var(--text)] font-sans mb-2">No errors logged</p>
        <p class="text-sm text-[var(--muted)] font-sans">System is running smoothly!</p>
      </div>
    {:else}
      <div class="space-y-3">
        {#each errors as error, i (error.id || i)}
          {@const severityColor = getSeverityColor(error.severity || 'info')}
          <div
            class="bg-[var(--surface)] border-l-4 border-r border-t border-b border-[var(--border)] rounded-lg p-4"
            style="border-left-color: {severityColor}"
          >
            <div class="flex items-start gap-3">
              <div class="text-2xl">
                {error.severity === 'critical' ? '🔴' : error.severity === 'warning' ? '⚠️' : 'ℹ️'}
              </div>
              <div class="flex-1">
                <div class="font-semibold text-[var(--text)] font-sans text-sm mb-1">
                  {error.message || error.error || 'Error'}
                </div>
                {#if error.stack}
                  <div
                    class="text-xs text-[var(--muted)] font-mono mt-2 bg-[var(--bg)] p-2 rounded overflow-x-auto"
                  >
                    {error.stack}
                  </div>
                {/if}
                <div class="flex gap-4 mt-2 text-xs text-[var(--muted)]">
                  <span>{formatTime(error.timestamp)}</span>
                  {#if error.source}
                    <span>Source: {error.source}</span>
                  {/if}
                </div>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
