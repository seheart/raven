<script>
  /**
   * Activity Page - Code changes and file activity
   */
</script>

<div class="p-6 space-y-6">
  <div>
    <h1 class="text-3xl font-bold text-gray-900 mb-2">Activity</h1>
    <p class="text-gray-600">Track code changes and file modifications</p>
  </div>

  <!-- Activity Timeline -->
  <div class="bg-white border border-gray-200 rounded-lg p-6">
    <h2 class="text-xl font-semibold text-gray-900 mb-4">Live Activity Feed</h2>
    <div class="space-y-4">
      {#each Array(8) as _, i (i)}
        <div class="flex items-start gap-4 pb-4 border-b border-gray-100 last:border-0">
          <span class="text-xs font-mono text-gray-500 min-w-[60px]">
            {new Date(Date.now() - i * 120000).toLocaleTimeString()}
          </span>
          <div class="flex-1">
            <div class="text-sm font-medium text-gray-900 mb-1">
              src/lib/components/Button.svelte
            </div>
            <div class="text-xs text-gray-500">Modified button styles</div>
          </div>
          <span
            class={`text-xs px-2 py-0.5 rounded ${
              i % 3 === 0
                ? 'bg-blue-50 text-blue-700'
                : i % 3 === 1
                  ? 'bg-green-50 text-green-700'
                  : 'bg-red-50 text-red-700'
            }`}
          >
            {i % 3 === 0 ? 'edit' : i % 3 === 1 ? 'create' : 'delete'}
          </span>
        </div>
      {/each}
    </div>
  </div>
</div>
