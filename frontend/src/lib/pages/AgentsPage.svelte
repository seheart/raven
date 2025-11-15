<script>
  /**
   * Agents Page - AI agent monitoring and conversations
   */
</script>

<div class="p-6 space-y-6">
  <div>
    <h1 class="text-3xl font-bold text-gray-900 mb-2">Agents</h1>
    <p class="text-gray-600">Monitor AI agent activity and conversations</p>
  </div>

  <!-- Active Agents -->
  <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
    {#each ['Claude', 'GPT-4', 'Copilot'] as agent (agent)}
      <div class="bg-white border border-gray-200 rounded-lg p-6">
        <div class="flex items-center gap-3 mb-3">
          <span class="text-2xl">🤖</span>
          <h3 class="text-lg font-semibold text-gray-900">{agent}</h3>
        </div>
        <div class="space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-gray-500">Status:</span>
            <span class="text-green-600 font-medium">Active</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">Requests:</span>
            <span class="text-gray-900 font-medium">127</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">Uptime:</span>
            <span class="text-gray-900 font-medium">2h 15m</span>
          </div>
        </div>
      </div>
    {/each}
  </div>

  <!-- Recent Conversations -->
  <div class="bg-white border border-gray-200 rounded-lg p-6">
    <h2 class="text-xl font-semibold text-gray-900 mb-4">Recent Conversations</h2>
    <div class="space-y-3">
      {#each Array(3) as _, i (i)}
        <div class="p-4 bg-gray-50 rounded border border-gray-200">
          <div class="flex items-center gap-2 mb-2">
            <span class="text-xs font-mono text-gray-500"
              >{new Date(Date.now() - i * 300000).toLocaleTimeString()}</span
            >
            <span class="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded">Claude</span>
          </div>
          <p class="text-sm text-gray-700">Help me refactor this component...</p>
        </div>
      {/each}
    </div>
  </div>
</div>
