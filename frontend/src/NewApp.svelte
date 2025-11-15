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
  import AboutPage from './lib/pages/AboutPage.svelte';
  import ChangelogPage from './lib/pages/ChangelogPage.svelte';
  import DocsPage from './lib/pages/DocsPage.svelte';
  import PlaceholderPage from './lib/components/ui/PlaceholderPage.svelte';
  import NotificationPanel from './lib/components/ui/NotificationPanel.svelte';
  import { getPath, navigate } from './lib/utils/router.svelte.js';
  import { unreadCount } from './lib/stores/notificationHistory.js';

  // State
  let theme = $state('tokyo-night');
  let username = $state('Seth');
  let role = $state('admin');
  let todayStats = $state({ modified: 12, added: 3, deleted: 1 });
  let showNotifications = $state(false);
  let sessionId = $state('Loading...');

  // Get current path from router
  const currentPath = $derived(getPath());

  // Parse path to extract tab and subTab
  const pathParts = $derived(() => {
    const parts = currentPath.split('/').filter(Boolean);
    return {
      tab: parts[0] || 'overview',
      subTab: parts[1] || ''
    };
  });

  const activeTab = $derived(pathParts().tab);
  const activeSubTab = $derived(pathParts().subTab);

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

  // Load session ID on mount
  $effect(() => {
    loadSessionId();
  });

  async function loadSessionId() {
    try {
      const response = await fetch('http://localhost:3030/api/session-id');
      const data = await response.json();
      sessionId = data.session_id || 'Unknown';
    } catch (error) {
      sessionId = 'Offline';
      console.error('Failed to load session ID:', error);
    }
  }

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
    navigate('/about');
  }

  function handleChangelogClick() {
    navigate('/changelog');
  }

  function handleDocsClick() {
    navigate('/docs');
  }

  function handleSettingsClick() {
    navigate('/settings');
  }

  function handleLogoutClick() {
    console.log('Logout clicked');
    // TODO: Implement logout logic
  }

  function handleSessionClick() {
    console.log('Session clicked:', sessionId);
    // TODO: Navigate to session details page or show modal
  }
</script>

<div class="min-h-screen bg-[var(--bg)]">
  <!-- Header -->
  <Header
    {activeTab}
    {activeSubTab}
    {username}
    {role}
    {todayStats}
    unreadCount={$unreadCount}
    onNotificationsClick={handleNotificationsClick}
    onSettingsClick={handleSettingsClick}
    onLogoutClick={handleLogoutClick}
  />

  <!-- Main Content -->
  <main class="pb-16">
    {#if activeTab === 'overview'}
      {#if !activeSubTab}
        <OverviewPage />
      {:else}
        <PlaceholderPage
          title={activeSubTab === 'projects' ? 'Projects Comparison' : 'Project Health'}
          description="This page is coming soon"
        />
      {/if}
    {:else if activeTab === 'safety'}
      {#if !activeSubTab}
        <SafetyPage />
      {:else}
        <PlaceholderPage title="Safety - {activeSubTab}" description="This page is coming soon" />
      {/if}
    {:else if activeTab === 'agents'}
      {#if !activeSubTab}
        <AgentsPage />
      {:else}
        <PlaceholderPage title="Agents - {activeSubTab}" description="This page is coming soon" />
      {/if}
    {:else if activeTab === 'activity'}
      {#if !activeSubTab}
        <ActivityPage />
      {:else}
        <PlaceholderPage title="Activity - {activeSubTab}" description="This page is coming soon" />
      {/if}
    {:else if activeTab === 'analysis'}
      {#if !activeSubTab}
        <AnalysisPage />
      {:else}
        <PlaceholderPage title="Analysis - {activeSubTab}" description="This page is coming soon" />
      {/if}
    {:else if activeTab === 'system'}
      {#if !activeSubTab}
        <SystemPage />
      {:else}
        <PlaceholderPage title="System - {activeSubTab}" description="This page is coming soon" />
      {/if}
    {:else if activeTab === 'settings'}
      <SettingsPage />
    {:else if activeTab === 'about'}
      <AboutPage />
    {:else if activeTab === 'changelog'}
      <ChangelogPage />
    {:else if activeTab === 'docs'}
      <DocsPage />
    {:else}
      <div class="p-6 text-center">
        <h1 class="text-2xl font-bold text-[var(--text-heading)]">Page Not Found</h1>
        <p class="text-[var(--text)] mt-2">Unknown tab: {activeTab}</p>
      </div>
    {/if}
  </main>

  <!-- Footer -->
  <Footer
    {theme}
    {sessionId}
    version="2.0.1-corvus"
    onThemeChange={handleThemeChange}
    onSessionClick={handleSessionClick}
    onAboutClick={handleAboutClick}
    onChangelogClick={handleChangelogClick}
    onDocsClick={handleDocsClick}
  />

  <!-- Notification Panel Sidebar -->
  <NotificationPanel visible={showNotifications} onClose={() => (showNotifications = false)} />
</div>
