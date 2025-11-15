<script>
  /**
   * User Menu Component
   * Dropdown menu for user account actions
   */

  let {
    username = 'User',
    role = 'user',
    onSettingsClick = () => {},
    onLogoutClick = () => {}
  } = $props();

  let showMenu = $state(false);

  function toggleMenu() {
    showMenu = !showMenu;
  }

  function handleSettings() {
    showMenu = false;
    onSettingsClick();
  }

  function handleLogout() {
    showMenu = false;
    onLogoutClick();
  }

  function handleClickOutside(event) {
    if (showMenu && !event.target.closest('.user-menu-container')) {
      showMenu = false;
    }
  }

  function getRoleBadge(role) {
    const badges = {
      admin: { emoji: '👑', label: 'Admin' },
      user: { emoji: '👤', label: 'User' },
      viewer: { emoji: '👁️', label: 'Viewer' }
    };
    return badges[role] || badges.user;
  }

  const userInitial = $derived(username?.[0]?.toUpperCase() || 'U');
  const roleBadge = $derived(getRoleBadge(role));
</script>

<svelte:window onclick={handleClickOutside} />

<div class="user-menu-container relative">
  <button
    onclick={toggleMenu}
    class="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-100 transition-colors font-sans"
    aria-label="User menu for {username}"
    aria-expanded={showMenu}
    aria-haspopup="menu"
  >
    <span
      class="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold text-xs"
    >
      {userInitial}
    </span>
    <span class="text-xs font-medium text-gray-700">{username}</span>
    <span class="text-[10px] text-gray-400">{showMenu ? '▲' : '▼'}</span>
  </button>

  {#if showMenu}
    <div
      class="absolute top-full right-0 mt-2 min-w-[240px] bg-white border border-gray-200 rounded-lg shadow-lg z-[10000] animate-slideDown"
      role="menu"
      aria-label="User account menu"
    >
      <!-- User Info Section -->
      <div class="flex items-center gap-3 p-4">
        <div
          class="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold text-sm"
        >
          {userInitial}
        </div>
        <div class="flex-1">
          <div class="text-xs font-semibold text-gray-900 font-mono mb-1">{username}</div>
          <div class="flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded w-fit">
            <span class="text-xs">{roleBadge.emoji}</span>
            <span class="text-xs font-medium text-gray-600 font-mono">{roleBadge.label}</span>
          </div>
        </div>
      </div>

      <div class="h-px bg-gray-200 mx-3"></div>

      <!-- Menu Items -->
      <button
        onclick={handleSettings}
        class="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-gray-50 transition-colors"
        role="menuitem"
      >
        <span class="text-sm">⚙️</span>
        <span class="text-xs font-medium text-gray-700">Settings</span>
      </button>

      <button
        onclick={handleLogout}
        class="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-gray-50 transition-colors"
        role="menuitem"
      >
        <span class="text-sm">🚪</span>
        <span class="text-xs font-medium text-gray-700">Logout</span>
      </button>
    </div>
  {/if}
</div>

<style>
  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .animate-slideDown {
    animation: slideDown 0.2s ease-out;
  }
</style>
