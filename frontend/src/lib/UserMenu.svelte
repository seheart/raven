<script>
  import { currentUser, authService } from './authStore.js';
  import { notifications } from './notificationService.js';

  let showMenu = false;

  function toggleMenu() {
    showMenu = !showMenu;
  }

  function handleLogout() {
    authService.logout();
    showMenu = false;
    // Trigger page reload to show login page
    window.location.reload();
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
</script>

<svelte:window on:click={handleClickOutside} />

<div class="user-menu-container">
  <button
    class="user-button"
    on:click|stopPropagation={toggleMenu}
    aria-label="User menu"
    aria-expanded={showMenu}
  >
    <span class="user-avatar">
      {$currentUser?.username?.[0]?.toUpperCase() || 'U'}
    </span>
    <span class="user-name">{$currentUser?.username || 'User'}</span>
    <span class="dropdown-arrow">{showMenu ? '▲' : '▼'}</span>
  </button>

  {#if showMenu}
    <div class="user-menu" role="menu">
      <div class="user-info">
        <div class="user-avatar-large">
          {$currentUser?.username?.[0]?.toUpperCase() || 'U'}
        </div>
        <div class="user-details">
          <div class="username">{$currentUser?.username}</div>
          <div class="role-badge">
            <span class="role-emoji">{getRoleBadge($currentUser?.role).emoji}</span>
            <span class="role-label">{getRoleBadge($currentUser?.role).label}</span>
          </div>
        </div>
      </div>

      <div class="menu-divider"></div>

      <button
        class="menu-item"
        on:click={handleLogout}
        role="menuitem"
      >
        <span class="menu-icon">🚪</span>
        <span class="menu-label">Logout</span>
      </button>
    </div>
  {/if}
</div>

<style>
  .user-menu-container {
    position: relative;
  }

  .user-button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text);
    font-family: var(--mono);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .user-button:hover {
    background: var(--surface);
    border-color: var(--accent);
  }

  .user-button:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .user-avatar {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--accent);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 11px;
  }

  .user-name {
    font-weight: 500;
  }

  .dropdown-arrow {
    font-size: 10px;
    opacity: 0.6;
  }

  .user-menu {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    min-width: 240px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
    z-index: 10000;
    animation: slideDown 0.2s ease-out;
  }

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

  .user-info {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
  }

  .user-avatar-large {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--accent);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 16px;
  }

  .user-details {
    flex: 1;
  }

  .username {
    font-family: var(--mono);
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
    margin-bottom: 4px;
  }

  .role-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    background: var(--surface-2);
    border-radius: 4px;
    width: fit-content;
  }

  .role-emoji {
    font-size: 12px;
  }

  .role-label {
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 500;
    color: var(--muted);
  }

  .menu-divider {
    height: 1px;
    background: var(--border);
    margin: 0 8px;
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 12px 16px;
    background: transparent;
    border: none;
    color: var(--text);
    font-family: var(--mono);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
  }

  .menu-item:hover {
    background: var(--surface-2);
  }

  .menu-item:focus {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .menu-icon {
    font-size: 16px;
  }

  .menu-label {
    font-weight: 500;
  }

  @media (max-width: 768px) {
    .user-name {
      display: none;
    }

    .user-button {
      padding: 6px;
    }
  }
</style>
