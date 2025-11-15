<script>
  /**
   * Raven App - Tailwind Version
   * Clean, simple application layout with Tailwind CSS
   */

  import Header from './lib/components/layout/Header.svelte';
  import Footer from './lib/components/layout/Footer.svelte';
  import OverviewPage from './lib/pages/OverviewPage.svelte';
  import SafetyPage from './lib/pages/SafetyPage.svelte';
  import AgentsPage from './lib/pages/AgentsPage.svelte';
  import ActivityPage from './lib/pages/ActivityPage.svelte';
  import AnalysisPage from './lib/pages/AnalysisPage.svelte';
  import SystemPage from './lib/pages/SystemPage.svelte';
  import SettingsPage from './lib/pages/SettingsPage.svelte';
  import { getPath, navigate } from './lib/utils/router.svelte.js';

  // State
  let theme = $state('tokyo-night');
  let username = $state('Seth');
  let role = $state('admin');
  let todayStats = $state({ modified: 12, added: 3, deleted: 1 });
  let unreadCount = $state(2);
  let showNotifications = $state(false);

  // Get current path from router
  const currentPath = $derived(getPath());

  // Map paths to tab IDs
  const pathToTab = {
    '/': 'overview',
    '/overview': 'overview',
    '/safety': 'safety',
    '/agents': 'agents',
    '/activity': 'activity',
    '/analysis': 'analysis',
    '/system': 'system',
    '/settings': 'settings'
  };

  const activeTab = $derived(pathToTab[currentPath] || 'overview');

  // Initialize route on mount
  $effect(() => {
    // If on root path, redirect to /overview
    if (currentPath === '/') {
      navigate('/overview');
    }
  });

  // Apply initial theme on mount
  $effect(() => {
    handleThemeChange(theme);
  });

  function handleThemeChange(newTheme) {
    theme = newTheme;

    // Map theme IDs to CSS class names
    const themeClassMap = {
      'tokyo-night': 'theme--night',
      catppuccin: 'theme--catppuccin',
      everforest: 'theme--everforest',
      gruvbox: 'theme--gruvbox',
      'gruvbox-light': 'theme--day',
      'osaka-jade': 'theme--osaka',
      kanagawa: 'theme--kanagawa',
      nord: 'theme--nord',
      'matte-black': 'theme--matte',
      ristretto: 'theme--dusk',
      'flexoki-light': 'theme--flexoki',
      'rose-pine': 'theme--rose',
      'catppuccin-latte': 'theme--latte'
    };

    // Remove all theme classes
    const classesToRemove = Array.from(document.body.classList).filter(className =>
      className.startsWith('theme--')
    );
    classesToRemove.forEach(className => {
      document.body.classList.remove(className);
    });

    // Add new theme class
    const themeClass = themeClassMap[newTheme] || 'theme--night';
    document.body.classList.add(themeClass);
    console.log('Theme changed to:', newTheme, 'CSS class:', themeClass);
  }

  function handleNotificationsClick() {
    showNotifications = !showNotifications;
  }

  function handleAboutClick() {
    console.log('About clicked');
  }

  function handleChangelogClick() {
    console.log('Changelog clicked');
  }

  function handleDocsClick() {
    console.log('Docs clicked');
  }

  function handleSettingsClick() {
    navigate('/settings');
  }

  function handleLogoutClick() {
    console.log('Logout clicked');
    // TODO: Implement logout logic
  }
</script>

<div class="min-h-screen bg-[var(--bg)]">
  <!-- Header -->
  <Header
    {activeTab}
    {username}
    {role}
    {todayStats}
    {unreadCount}
    onNotificationsClick={handleNotificationsClick}
    onSettingsClick={handleSettingsClick}
    onLogoutClick={handleLogoutClick}
  />

  <!-- Main Content -->
  <main class="pb-16">
    {#if activeTab === 'overview'}
      <OverviewPage />
    {:else if activeTab === 'safety'}
      <SafetyPage />
    {:else if activeTab === 'agents'}
      <AgentsPage />
    {:else if activeTab === 'activity'}
      <ActivityPage />
    {:else if activeTab === 'analysis'}
      <AnalysisPage />
    {:else if activeTab === 'system'}
      <SystemPage />
    {:else if activeTab === 'settings'}
      <SettingsPage />
    {:else}
      <div class="p-6 text-center">
        <h1 class="text-2xl font-bold text-gray-900">Page Not Found</h1>
        <p class="text-gray-600 mt-2">Unknown tab: {activeTab}</p>
      </div>
    {/if}
  </main>

  <!-- Footer -->
  <Footer
    {theme}
    version="2.0.1-corvus"
    onThemeChange={handleThemeChange}
    onAboutClick={handleAboutClick}
    onChangelogClick={handleChangelogClick}
    onDocsClick={handleDocsClick}
  />

  <!-- Notifications Panel (if needed) -->
  {#if showNotifications}
    <div
      class="fixed top-12 right-4 w-80 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-lg p-4 z-50"
    >
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-semibold text-[var(--text-heading)] text-sm">Notifications</h3>
        <button
          onclick={() => (showNotifications = false)}
          class="text-[var(--muted)] hover:text-[var(--text)] border-0 bg-transparent cursor-pointer text-lg leading-none p-1"
        >
          ✕
        </button>
      </div>
      <div class="space-y-2 text-sm text-[var(--text)]">
        <div class="p-2 bg-[var(--accent-subtle)] text-[var(--accent)] rounded">
          System health check passed
        </div>
        <div class="p-2 bg-[var(--success-subtle)] text-[var(--success)] rounded">
          Build completed successfully
        </div>
      </div>
    </div>
  {/if}
</div>
