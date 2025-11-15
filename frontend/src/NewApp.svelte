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

  // State
  let activeTab = $state('overview');
  let theme = $state('light');
  let username = $state('Seth');
  let role = $state('admin');
  let todayStats = $state({ modified: 12, added: 3, deleted: 1 });
  let unreadCount = $state(2);
  let showNotifications = $state(false);

  // Handlers
  function handleTabChange(newTab) {
    activeTab = newTab;
  }

  function handleThemeChange(newTheme) {
    theme = newTheme;
    // TODO: Apply theme to document
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
    activeTab = 'settings';
  }

  function handleLogoutClick() {
    console.log('Logout clicked');
    // TODO: Implement logout logic
  }
</script>

<div class="min-h-screen bg-gray-50">
  <!-- Header -->
  <Header
    {activeTab}
    onTabChange={handleTabChange}
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
      class="fixed top-12 right-4 w-80 bg-white border border-gray-200 rounded-lg shadow-lg p-4 z-50"
    >
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-semibold text-gray-900">Notifications</h3>
        <button
          onclick={() => (showNotifications = false)}
          class="text-gray-500 hover:text-gray-700"
        >
          ✕
        </button>
      </div>
      <div class="space-y-2 text-sm text-gray-600">
        <div class="p-2 bg-blue-50 rounded">System health check passed</div>
        <div class="p-2 bg-green-50 rounded">Build completed successfully</div>
      </div>
    </div>
  {/if}
</div>
