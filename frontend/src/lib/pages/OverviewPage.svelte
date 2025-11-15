<script>
  /**
   * Overview Page - Dashboard and project overview
   */
</script>

<div class="p-6 space-y-6">
  <div>
    <h1 class="text-3xl font-bold text-gray-900 mb-2">Overview</h1>
    <p class="text-gray-600">Real-time monitoring dashboard for your AI coding session</p>
  </div>

  <!-- Quick Stats -->
  <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
    <div class="bg-white border border-gray-200 rounded-lg p-6">
      <div class="text-sm font-medium text-gray-500 mb-1">Session Uptime</div>
      <div class="text-2xl font-bold text-gray-900">2h 15m</div>
    </div>
    <div class="bg-white border border-gray-200 rounded-lg p-6">
      <div class="text-sm font-medium text-gray-500 mb-1">Files Modified</div>
      <div class="text-2xl font-bold text-blue-600">47</div>
    </div>
    <div class="bg-white border border-gray-200 rounded-lg p-6">
      <div class="text-sm font-medium text-gray-500 mb-1">Active Agents</div>
      <div class="text-2xl font-bold text-green-600">3</div>
    </div>
  </div>

  <!-- Recent Activity -->
  <div class="bg-white border border-gray-200 rounded-lg p-6">
    <h2 class="text-xl font-semibold text-gray-900 mb-4">Recent Activity</h2>
    <div class="space-y-3">
      {#each Array(5) as _, i (i)}
        <div class="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
          <span class="text-xs font-mono text-gray-500"
            >{new Date(Date.now() - i * 60000).toLocaleTimeString()}</span
          >
          <span class="text-sm text-gray-700">Modified src/lib/components/Button.svelte</span>
          <span class="ml-auto text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded">edit</span>
        </div>
      {/each}
    </div>
  </div>
</div>
