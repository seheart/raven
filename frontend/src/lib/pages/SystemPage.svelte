<script>
  /**
   * System Page - System status and configuration
   */
</script>

<div class="p-6 space-y-6">
  <div>
    <h1 class="text-3xl font-bold text-gray-900 mb-2">System</h1>
    <p class="text-gray-600">System status, health monitoring, and configuration</p>
  </div>

  <!-- System Health -->
  <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
    <div class="bg-white border border-gray-200 rounded-lg p-6">
      <div class="flex items-center gap-3 mb-3">
        <span class="text-2xl">💚</span>
        <h3 class="text-lg font-semibold text-gray-900">API Health</h3>
      </div>
      <div class="text-2xl font-bold text-green-600">Healthy</div>
      <div class="text-sm text-gray-500 mt-1">All endpoints responding</div>
    </div>

    <div class="bg-white border border-gray-200 rounded-lg p-6">
      <div class="flex items-center gap-3 mb-3">
        <span class="text-2xl">💾</span>
        <h3 class="text-lg font-semibold text-gray-900">Storage</h3>
      </div>
      <div class="text-2xl font-bold text-gray-900">2.4 GB</div>
      <div class="text-sm text-gray-500 mt-1">12% of quota used</div>
    </div>

    <div class="bg-white border border-gray-200 rounded-lg p-6">
      <div class="flex items-center gap-3 mb-3">
        <span class="text-2xl">🔄</span>
        <h3 class="text-lg font-semibold text-gray-900">Sync Status</h3>
      </div>
      <div class="text-2xl font-bold text-green-600">Synced</div>
      <div class="text-sm text-gray-500 mt-1">Last sync: 2m ago</div>
    </div>
  </div>

  <!-- System Info -->
  <div class="bg-white border border-gray-200 rounded-lg p-6">
    <h2 class="text-xl font-semibold text-gray-900 mb-4">System Information</h2>
    <div class="grid grid-cols-2 gap-4 text-sm">
      <div>
        <span class="text-gray-500">Platform:</span>
        <span class="ml-2 text-gray-900 font-medium">Linux</span>
      </div>
      <div>
        <span class="text-gray-500">Node Version:</span>
        <span class="ml-2 text-gray-900 font-medium">v20.11.0</span>
      </div>
      <div>
        <span class="text-gray-500">Backend:</span>
        <span class="ml-2 text-green-600 font-medium">Connected</span>
      </div>
      <div>
        <span class="text-gray-500">WebSocket:</span>
        <span class="ml-2 text-green-600 font-medium">Active</span>
      </div>
    </div>
  </div>
</div>
