<script>
  /**
   * Activity Page - Code changes and file activity
   */
</script>

<div class="p-6 space-y-6">
  <div>
    <h1 class="text-3xl font-bold text-[var(--text-heading)] mb-2">Activity</h1>
    <p class="text-[var(--text)]">Track code changes and file modifications</p>
  </div>

  <!-- Activity Timeline -->
  <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
    <h2 class="text-xl font-semibold text-[var(--text-heading)] mb-4">Live Activity Feed</h2>
    <div class="space-y-4">
      {#each Array(8) as _, i (i)}
        <div class="flex items-start gap-4 pb-4 border-b border-[var(--border)] last:border-0">
          <span class="text-xs font-mono text-[var(--muted)] min-w-[60px]">
            {new Date(Date.now() - i * 120000).toLocaleTimeString()}
          </span>
          <div class="flex-1">
            <div class="text-sm font-medium text-[var(--text-heading)] mb-1">
              src/lib/components/Button.svelte
            </div>
            <div class="text-xs text-[var(--muted)]">Modified button styles</div>
          </div>
          <span
            class={`text-xs px-2 py-0.5 rounded ${
              i % 3 === 0
                ? 'bg-[var(--accent-subtle)] text-[var(--accent)]'
                : i % 3 === 1
                  ? 'bg-[var(--success-subtle)] text-[var(--success)]'
                  : 'bg-[var(--error-subtle)] text-[var(--error)]'
            }`}
          >
            {i % 3 === 0 ? 'edit' : i % 3 === 1 ? 'create' : 'delete'}
          </span>
        </div>
      {/each}
    </div>
  </div>
</div>
