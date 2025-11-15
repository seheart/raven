<script>
  /**
   * Agents Page - AI agent monitoring and conversations
   */
</script>

<div class="p-6 space-y-6">
  <div>
    <h1 class="text-3xl font-bold text-[var(--text-heading)] mb-2">Agents</h1>
    <p class="text-[var(--text)]">Monitor AI agent activity and conversations</p>
  </div>

  <!-- Active Agents -->
  <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
    {#each ['Claude', 'GPT-4', 'Copilot'] as agent (agent)}
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
        <div class="flex items-center gap-3 mb-3">
          <span class="text-2xl">🤖</span>
          <h3 class="text-lg font-semibold text-[var(--text-heading)]">{agent}</h3>
        </div>
        <div class="space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-[var(--muted)]">Status:</span>
            <span class="text-[var(--success)] font-medium">Active</span>
          </div>
          <div class="flex justify-between">
            <span class="text-[var(--muted)]">Requests:</span>
            <span class="text-[var(--text-heading)] font-medium">127</span>
          </div>
          <div class="flex justify-between">
            <span class="text-[var(--muted)]">Uptime:</span>
            <span class="text-[var(--text-heading)] font-medium">2h 15m</span>
          </div>
        </div>
      </div>
    {/each}
  </div>

  <!-- Recent Conversations -->
  <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
    <h2 class="text-xl font-semibold text-[var(--text-heading)] mb-4">Recent Conversations</h2>
    <div class="space-y-3">
      {#each Array(3) as _, i (i)}
        <div class="p-4 bg-[var(--surface-2)] rounded border border-[var(--border)]">
          <div class="flex items-center gap-2 mb-2">
            <span class="text-xs font-mono text-[var(--muted)]"
              >{new Date(Date.now() - i * 300000).toLocaleTimeString()}</span
            >
            <span class="text-xs px-2 py-0.5 bg-[var(--accent-subtle)] text-[var(--accent)] rounded"
              >Claude</span
            >
          </div>
          <p class="text-sm text-[var(--text)]">Help me refactor this component...</p>
        </div>
      {/each}
    </div>
  </div>
</div>
