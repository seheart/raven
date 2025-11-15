<script>
  /**
   * Header Component - Raven UI Library
   * Compact header with navigation, stats, and user menu
   */

  import RavenLogo from '../ui/RavenLogo.svelte';
  import UserMenu from '../ui/UserMenu.svelte';
  import { navigate } from '../../utils/router.svelte.js';

  let {
    activeTab = 'overview',
    username = 'User',
    role = 'user',
    todayStats = { modified: 0, added: 0, deleted: 0 },
    unreadCount = 0,
    onNotificationsClick = () => {},
    onSettingsClick = () => {},
    onLogoutClick = () => {}
  } = $props();

  const tabs = [
    { id: 'overview', label: 'Overview', path: '/overview' },
    { id: 'safety', label: 'Safety', path: '/safety' },
    { id: 'agents', label: 'Agents', path: '/agents' },
    { id: 'activity', label: 'Activity', path: '/activity' },
    { id: 'analysis', label: 'Analysis', path: '/analysis' },
    { id: 'system', label: 'System', path: '/system' }
  ];

  function handleNavClick(event, path) {
    event.preventDefault();
    navigate(path);
  }
</script>

<header class="sticky top-0 z-50 bg-[var(--surface)] border-b border-[var(--border)] font-sans">
  <div class="flex items-center gap-4 px-3 py-2 h-12">
    <!-- Logo -->
    <button
      onclick={e => handleNavClick(e, '/overview')}
      class="flex items-center gap-2 font-semibold text-[var(--accent)] text-base hover:text-[var(--accent-2)] transition-colors font-sans bg-transparent border-0 cursor-pointer p-0"
      aria-label="Go to Overview"
    >
      <RavenLogo size={18} />
      <span>Raven</span>
    </button>

    <!-- Main Navigation Tabs -->
    <nav class="flex gap-1 flex-1 font-sans" aria-label="Main navigation">
      {#each tabs as tab (tab.id)}
        <button
          onclick={e => handleNavClick(e, tab.path)}
          class={`px-3 py-1.5 rounded text-sm transition-colors font-sans border-0 cursor-pointer ${
            activeTab === tab.id
              ? 'bg-[var(--accent)] text-[#ffffff] font-semibold'
              : 'bg-transparent text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] font-medium'
          }`}
          aria-current={activeTab === tab.id ? 'page' : undefined}
        >
          {tab.label}
        </button>
      {/each}
    </nav>

    <!-- Today's Activity Stats -->
    <div
      class="flex gap-2 text-sm font-mono pl-4 border-l border-[var(--border)]"
      role="region"
      aria-label="Today's activity"
    >
      <span class="px-2 py-0.5 bg-[var(--accent-subtle)] text-[var(--accent)] rounded"
        >{todayStats.modified} modified</span
      >
      <span class="px-2 py-0.5 bg-[var(--success-subtle)] text-[var(--success)] rounded"
        >+{todayStats.added} added</span
      >
      <span class="px-2 py-0.5 bg-[var(--error-subtle)] text-[var(--error)] rounded"
        >-{todayStats.deleted} deleted</span
      >
    </div>

    <!-- Notifications Bell -->
    <button
      onclick={onNotificationsClick}
      class="relative p-2 text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--accent)] rounded transition-all hover:scale-110"
      aria-label="Open notifications ({unreadCount} unread)"
    >
      🔔
      {#if unreadCount > 0}
        <span
          class="absolute top-0 right-0 flex items-center justify-center min-w-[20px] h-[20px] px-1 bg-[var(--error)] text-[#ffffff] text-[11px] font-bold rounded-full"
        >
          {unreadCount}
        </span>
      {/if}
    </button>

    <!-- User Menu -->
    <UserMenu {username} {role} {onSettingsClick} {onLogoutClick} />
  </div>
</header>
