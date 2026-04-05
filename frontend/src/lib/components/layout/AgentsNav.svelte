<script>
  /**
   * Agents Section Sub-Navigation
   * Provides tabbed navigation for agent-related pages
   */
  import { navigate, getPath } from '../../utils/router.svelte.js';

  const tabs = [
    { id: 'stats', label: 'Agent Stats', path: '/analysis/stats' },
    { id: 'monitoring', label: 'Monitoring', path: '/analysis/monitoring' },
    { id: 'conversations', label: 'Conversations', path: '/analysis/conversations' }
  ];

  const currentPath = $derived(getPath());

  function isActive(path) {
    return currentPath === path;
  }
</script>

<nav class="border-b border-[var(--border)] bg-[var(--surface)] mb-6">
  <div class="flex gap-1 px-6">
    {#each tabs as tab (tab.id)}
      <button
        onclick={() => navigate(tab.path)}
        class="px-4 py-3 text-sm font-medium transition-colors relative
          {isActive(tab.path)
          ? 'text-[var(--accent)] border-b-2 border-[var(--accent)]'
          : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]'}"
      >
        {tab.label}
      </button>
    {/each}
  </div>
</nav>
