<script>
  /**
   * Header Component - Raven UI Library
   * Compact header with navigation, stats, and user menu
   */

  import RavenLogo from '../ui/RavenLogo.svelte';
  import UserMenu from '../ui/UserMenu.svelte';

  let {
    activeTab = 'overview',
    onTabChange = () => {},
    username = 'User',
    role = 'user',
    todayStats = { modified: 0, added: 0, deleted: 0 },
    unreadCount = 0,
    onNotificationsClick = () => {},
    onSettingsClick = () => {},
    onLogoutClick = () => {}
  } = $props();

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'safety', label: 'Safety' },
    { id: 'agents', label: 'Agents' },
    { id: 'activity', label: 'Activity' },
    { id: 'analysis', label: 'Analysis' },
    { id: 'system', label: 'System' }
  ];
</script>

<header class="sticky top-0 z-50 bg-white border-b border-gray-200 font-sans">
  <div class="flex items-center gap-4 px-3 py-2 h-12">
    <!-- Logo -->
    <button
      onclick={() => onTabChange('overview')}
      class="flex items-center gap-2 font-semibold text-blue-600 text-sm hover:text-blue-700 transition-colors font-sans"
      aria-label="Go to Overview"
    >
      <RavenLogo size={16} />
      <span>Raven</span>
    </button>

    <!-- Main Navigation Tabs -->
    <nav class="flex gap-1 flex-1 font-sans" aria-label="Main navigation">
      {#each tabs as tab (tab.id)}
        <button
          class={`px-3 py-1.5 rounded text-xs font-medium transition-colors font-sans ${
            activeTab === tab.id
              ? 'bg-blue-600 text-white'
              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
          }`}
          onclick={() => onTabChange(tab.id)}
          aria-current={activeTab === tab.id ? 'page' : undefined}
        >
          {tab.label}
        </button>
      {/each}
    </nav>

    <!-- Today's Activity Stats -->
    <div
      class="flex gap-2 text-xs font-mono pl-4 border-l border-gray-200"
      role="region"
      aria-label="Today's activity"
    >
      <span class="px-2 py-0.5 bg-blue-50 text-blue-700 rounded"
        >{todayStats.modified} modified</span
      >
      <span class="px-2 py-0.5 bg-green-50 text-green-700 rounded">+{todayStats.added} added</span>
      <span class="px-2 py-0.5 bg-red-50 text-red-700 rounded">-{todayStats.deleted} deleted</span>
    </div>

    <!-- Notifications Bell -->
    <button
      onclick={onNotificationsClick}
      class="relative p-2 text-gray-500 hover:bg-gray-100 hover:text-blue-600 rounded transition-all hover:scale-110"
      aria-label="Open notifications ({unreadCount} unread)"
    >
      🔔
      {#if unreadCount > 0}
        <span
          class="absolute top-0 right-0 flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full"
        >
          {unreadCount}
        </span>
      {/if}
    </button>

    <!-- User Menu -->
    <UserMenu {username} {role} {onSettingsClick} {onLogoutClick} />
  </div>
</header>
