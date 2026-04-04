<script>
  /**
   * Agents Section Sub-Navigation
   * Provides tabbed navigation for agent-related pages
   */
  import { navigate, getPath } from '../../utils/router.svelte.js';

  const tabs = [
    { id: 'overview', label: 'Overview', icon: '', path: '/agents' },
    { id: 'activity', label: 'Recent Activity', icon: '', path: '/agents/monitoring' },
    { id: 'stats', label: 'Agent Stats', icon: '', path: '/agents/stats' },
    { id: 'conversations', label: 'Conversations', icon: '', path: '/agents/conversations' },
    { id: 'setup', label: 'Setup Guide', icon: '', path: '/agents/setup' }
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
        <span class="mr-2">{tab.icon}</span>
        {tab.label}
      </button>
    {/each}
  </div>
</nav>
