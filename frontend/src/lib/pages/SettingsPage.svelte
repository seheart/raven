<script>
  /**
   * Settings Page - Application settings and preferences
   */
</script>

<div class="p-6 space-y-6">
  <div>
    <h1 class="text-3xl font-bold text-[var(--text-heading)] mb-2">Settings</h1>
    <p class="text-[var(--text)]">Configure your Raven monitoring preferences</p>
  </div>

  <!-- Settings Sections -->
  <div class="space-y-4">
    <!-- General Settings -->
    <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
      <h2 class="text-lg font-semibold text-[var(--text-heading)] mb-4">General</h2>
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <div class="font-medium text-[var(--text-heading)]">Auto-save session</div>
            <div class="text-sm text-[var(--muted)]">Automatically save session data</div>
          </div>
          <button
            class="px-4 py-2 bg-[var(--accent)] text-[#ffffff] text-sm rounded hover:bg-[var(--accent-2)] transition-colors border-0 cursor-pointer"
          >
            Enabled
          </button>
        </div>
        <div class="flex items-center justify-between">
          <div>
            <div class="font-medium text-[var(--text-heading)]">Real-time monitoring</div>
            <div class="text-sm text-[var(--muted)]">Monitor file changes in real-time</div>
          </div>
          <button
            class="px-4 py-2 bg-[var(--accent)] text-[#ffffff] text-sm rounded hover:bg-[var(--accent-2)] transition-colors border-0 cursor-pointer"
          >
            Enabled
          </button>
        </div>
      </div>
    </div>

    <!-- Notification Settings -->
    <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
      <h2 class="text-lg font-semibold text-[var(--text-heading)] mb-4">Notifications</h2>
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <div class="font-medium text-[var(--text-heading)]">Error notifications</div>
            <div class="text-sm text-[var(--muted)]">Alert on syntax errors and crashes</div>
          </div>
          <button
            class="px-4 py-2 bg-[var(--accent)] text-[#ffffff] text-sm rounded hover:bg-[var(--accent-2)] transition-colors border-0 cursor-pointer"
          >
            Enabled
          </button>
        </div>
        <div class="flex items-center justify-between">
          <div>
            <div class="font-medium text-[var(--text-heading)]">Performance alerts</div>
            <div class="text-sm text-[var(--muted)]">Notify on performance degradation</div>
          </div>
          <button
            class="px-4 py-2 bg-[var(--surface-2)] text-[var(--text)] text-sm rounded hover:bg-[var(--surface-3)] transition-colors border-0 cursor-pointer"
          >
            Disabled
          </button>
        </div>
      </div>
    </div>
  </div>
</div>
