<script>
  /**
   * Settings Page - Application settings and preferences
   */
</script>

<div class="p-6 space-y-6">
  <div>
    <h1 class="text-3xl font-bold text-gray-900 mb-2">Settings</h1>
    <p class="text-gray-600">Configure your Raven monitoring preferences</p>
  </div>

  <!-- Settings Sections -->
  <div class="space-y-4">
    <!-- General Settings -->
    <div class="bg-white border border-gray-200 rounded-lg p-6">
      <h2 class="text-lg font-semibold text-gray-900 mb-4">General</h2>
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <div class="font-medium text-gray-900">Auto-save session</div>
            <div class="text-sm text-gray-500">Automatically save session data</div>
          </div>
          <button class="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">
            Enabled
          </button>
        </div>
        <div class="flex items-center justify-between">
          <div>
            <div class="font-medium text-gray-900">Real-time monitoring</div>
            <div class="text-sm text-gray-500">Monitor file changes in real-time</div>
          </div>
          <button class="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">
            Enabled
          </button>
        </div>
      </div>
    </div>

    <!-- Notification Settings -->
    <div class="bg-white border border-gray-200 rounded-lg p-6">
      <h2 class="text-lg font-semibold text-gray-900 mb-4">Notifications</h2>
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <div class="font-medium text-gray-900">Error notifications</div>
            <div class="text-sm text-gray-500">Alert on syntax errors and crashes</div>
          </div>
          <button class="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">
            Enabled
          </button>
        </div>
        <div class="flex items-center justify-between">
          <div>
            <div class="font-medium text-gray-900">Performance alerts</div>
            <div class="text-sm text-gray-500">Notify on performance degradation</div>
          </div>
          <button class="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300">
            Disabled
          </button>
        </div>
      </div>
    </div>
  </div>
</div>
