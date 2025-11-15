<script>
  /**
   * System Page - System status and configuration
   */
</script>

<div class="p-6 space-y-6">
  <div>
    <h1 class="text-3xl font-bold text-[var(--text-heading)] mb-2">System</h1>
    <p class="text-[var(--text)]">System status, health monitoring, and configuration</p>
  </div>

  <!-- System Health -->
  <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
    <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
      <div class="flex items-center gap-3 mb-3">
        <span class="text-2xl">💚</span>
        <h3 class="text-lg font-semibold text-[var(--text-heading)]">API Health</h3>
      </div>
      <div class="text-2xl font-bold text-[var(--success)]">Healthy</div>
      <div class="text-sm text-[var(--muted)] mt-1">All endpoints responding</div>
    </div>

    <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
      <div class="flex items-center gap-3 mb-3">
        <span class="text-2xl">💾</span>
        <h3 class="text-lg font-semibold text-[var(--text-heading)]">Storage</h3>
      </div>
      <div class="text-2xl font-bold text-[var(--text-heading)]">2.4 GB</div>
      <div class="text-sm text-[var(--muted)] mt-1">12% of quota used</div>
    </div>

    <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
      <div class="flex items-center gap-3 mb-3">
        <span class="text-2xl">🔄</span>
        <h3 class="text-lg font-semibold text-[var(--text-heading)]">Sync Status</h3>
      </div>
      <div class="text-2xl font-bold text-[var(--success)]">Synced</div>
      <div class="text-sm text-[var(--muted)] mt-1">Last sync: 2m ago</div>
    </div>
  </div>

  <!-- System Info -->
  <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
    <h2 class="text-xl font-semibold text-[var(--text-heading)] mb-4">System Information</h2>
    <div class="grid grid-cols-2 gap-4 text-sm">
      <div>
        <span class="text-[var(--muted)]">Platform:</span>
        <span class="ml-2 text-[var(--text-heading)] font-medium">Linux</span>
      </div>
      <div>
        <span class="text-[var(--muted)]">Node Version:</span>
        <span class="ml-2 text-[var(--text-heading)] font-medium">v20.11.0</span>
      </div>
      <div>
        <span class="text-[var(--muted)]">Backend:</span>
        <span class="ml-2 text-[var(--success)] font-medium">Connected</span>
      </div>
      <div>
        <span class="text-[var(--muted)]">WebSocket:</span>
        <span class="ml-2 text-[var(--success)] font-medium">Active</span>
      </div>
    </div>
  </div>
</div>
