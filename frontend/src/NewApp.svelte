<script>
  /**
   * Raven App - Tailwind Version
   * Clean, simple application layout with Tailwind CSS
   */

  import { logger } from './lib/logger.js';
  import { api } from './lib/apiClient.js';
  import Header from './lib/components/layout/Header.svelte';
  import Footer from './lib/components/layout/Footer.svelte';
  // Eagerly import frequently visited pages, lazy-load the rest
  import AnalysisPage from './lib/pages/AnalysisPage.svelte';
  import PlaceholderPage from './lib/components/ui/PlaceholderPage.svelte';
  import ToastContainer from './lib/components/ui/ToastContainer.svelte';
  import WelcomeScreen from './lib/WelcomeScreen.svelte';
  import QuickStartWizard from './lib/QuickStartWizard.svelte';
  import KeyboardShortcuts from './lib/KeyboardShortcuts.svelte';
  import { getPath, navigate } from './lib/utils/router.svelte.js';
  import { onMount } from 'svelte';

  // State
  let sessionId = $state('Loading...');
  let showWelcome = $state(false);
  let showKeyboardShortcuts = $state(false);

  // Get current path from router
  const currentPath = $derived(getPath());

  // Parse path to extract tab and subTab
  const pathParts = $derived.by(() => {
    const parts = currentPath.split('/').filter(Boolean);
    return {
      tab: parts[0] || 'overview',
      subTab: parts[1] || ''
    };
  });

  const activeTab = $derived(pathParts.tab);
  const activeSubTab = $derived(pathParts.subTab);

  // Initialize route on mount
  $effect(() => {
    // If on root path, redirect to dashboard
    if (currentPath === '/') {
      navigate('/overview');
    }
  });

  // Load session ID on mount
  async function loadSessionId() {
    try {
      const data = await api.get('/session-id');
      sessionId = data.session_id || 'Unknown';
    } catch (error) {
      sessionId = 'Offline';
      logger.error('Failed to load session ID:', error);
    }
  }

  // Check for first-time user on mount
  onMount(() => {
    // Load session ID once on mount
    loadSessionId();
    const welcomeSeen = localStorage.getItem('raven-welcome-seen');
    if (!welcomeSeen) {
      showWelcome = true;
    }

    // Add keyboard listener for ? key
    const handleKeyPress = e => {
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Only show if not typing in an input
        const target = e.target;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          showKeyboardShortcuts = !showKeyboardShortcuts;
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  });

  function handleWelcomeClose() {
    showWelcome = false;
    localStorage.setItem('raven-welcome-seen', 'true');

    // Check if quick start wizard should be shown
    const quickStartCompleted = localStorage.getItem('raven-quick-start-completed');
    if (!quickStartCompleted) {
      navigate('/quickstart');
    }
  }

  function handleQuickStartComplete() {
    localStorage.setItem('raven-quick-start-completed', 'true');
    navigate('/welcome');
  }

  function handleQuickStartSkip() {
    localStorage.setItem('raven-quick-start-completed', 'true');
    navigate('/overview');
  }

  function handleAboutClick() {
    navigate('/about');
  }

  function handleSettingsClick() {
    navigate('/settings');
  }

  function handleLogoutClick() {
    logger.debug('Logout clicked');
    // Since Raven is a local tool, clear all local data and reload
    localStorage.clear();
    location.reload();
  }

  function handleSessionClick() {
    logger.debug('Session clicked:', sessionId);
    // Navigate to system page to view session details
    navigate('/system');
  }
</script>

<div class="min-h-screen bg-[var(--bg)]">
  <!-- Header -->
  <Header
    {activeTab}
    {activeSubTab}
    onSettingsClick={handleSettingsClick}
    onLogoutClick={handleLogoutClick}
  />

  <!-- Main Content -->
  <main class="pb-16">
    {#if activeTab === 'live'}
      {#await import('./lib/pages/LivePage.svelte')}
        <PlaceholderPage title="Live Monitor" description="Loading..." />
      {:then { default: Component }}
        <Component />
      {:catch}
        <PlaceholderPage title="Live Monitor" description="Failed to load" />
      {/await}
    {:else if activeTab === 'overview'}
      {#await import('./lib/pages/OverviewPage.svelte')}
        <PlaceholderPage title="Dashboard" description="Loading..." />
      {:then { default: Component }}
        <Component />
      {:catch}
        <PlaceholderPage title="Dashboard" description="Failed to load" />
      {/await}
    {:else if activeTab === 'history'}
      {#if !activeSubTab}
        {#await import('./lib/pages/ActivityOverviewPage.svelte')}
          <PlaceholderPage title="Activity Log" description="Loading..." />
        {:then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Activity Log" description="Failed to load" />
        {/await}
      {:else if activeSubTab === 'timeline'}
        {#await import('./lib/pages/ActivityTimelinePage.svelte')}
          <PlaceholderPage title="Timeline" description="Loading..." />
        {:then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Timeline" description="Failed to load" />
        {/await}
      {:else if activeSubTab === 'code'}
        {#await import('./lib/pages/ActivityCodeChangesPage.svelte')}
          <PlaceholderPage title="Code Changes" description="Loading..." />
        {:then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Code Changes" description="Failed to load" />
        {/await}
      {:else if activeSubTab === 'files'}
        {#await import('./lib/pages/ActivityFileBrowserPage.svelte')}
          <PlaceholderPage title="File Browser" description="Loading..." />
        {:then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="File Browser" description="Failed to load" />
        {/await}
      {:else if activeSubTab === 'projects'}
        {#await import('./lib/pages/ProjectsComparisonPage.svelte')}
          <PlaceholderPage title="Projects Comparison" description="Loading..." />
        {:then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Projects Comparison" description="Failed to load" />
        {/await}
      {:else if activeSubTab === 'health'}
        {#await import('./lib/pages/OverviewHealthPage.svelte')}
          <PlaceholderPage title="Project Health" description="Loading..." />
        {:then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Project Health" description="Failed to load" />
        {/await}
      {:else if activeSubTab === 'search'}
        {#await import('./lib/pages/ActivitySearchPage.svelte')}
          <PlaceholderPage title="Global Search" description="Loading..." />
        {:then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Global Search" description="Failed to load" />
        {/await}
      {:else}
        <PlaceholderPage title="History - {activeSubTab}" description="This page is coming soon" />
      {/if}
    {:else if activeTab === 'safety'}
      {#await import('./lib/pages/SafetyPage.svelte')}
        <PlaceholderPage title="Safety" description="Loading..." />
      {:then { default: Component }}
        <Component />
      {:catch}
        <PlaceholderPage title="Safety" description="Failed to load" />
      {/await}
    {:else if activeTab === 'analysis'}
      {#if !activeSubTab}
        <AnalysisPage />
      {:else if activeSubTab === 'performance'}
        {#await import('./lib/pages/AnalysisPerformancePage.svelte')}
          <PlaceholderPage title="Performance" description="Loading..." />
        {:then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Performance" description="Failed to load" />
        {/await}
      {:else if activeSubTab === 'trends'}
        {#await import('./lib/pages/AnalysisHistoricalTrendsPage.svelte')}
          <PlaceholderPage title="Historical Trends" description="Loading..." />
        {:then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Historical Trends" description="Failed to load" />
        {/await}
      {:else if activeSubTab === 'triggers'}
        {#await import('./lib/pages/AnalysisTriggersPage.svelte')}
          <PlaceholderPage title="Triggers" description="Loading..." />
        {:then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Triggers" description="Failed to load" />
        {/await}
      {:else if activeSubTab === 'stats'}
        {#await import('./lib/pages/AgentStatsPage.svelte')}
          <PlaceholderPage title="Agent Stats" description="Loading..." />
        {:then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Agent Stats" description="Failed to load" />
        {/await}
      {:else if activeSubTab === 'monitoring'}
        {#await import('./lib/pages/AgentMonitoringPage.svelte')}
          <PlaceholderPage title="Agent Monitoring" description="Loading..." />
        {:then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Agent Monitoring" description="Failed to load" />
        {/await}
      {:else if activeSubTab === 'conversations'}
        {#await import('./lib/pages/AgentConversationsPage.svelte')}
          <PlaceholderPage title="Agent Conversations" description="Loading..." />
        {:then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Agent Conversations" description="Failed to load" />
        {/await}
      {:else}
        <PlaceholderPage title="Analysis - {activeSubTab}" description="This page is coming soon" />
      {/if}
    {:else if activeTab === 'system'}
      {#if !activeSubTab}
        {#await import('./lib/pages/SystemPage.svelte')}
          <PlaceholderPage title="System" description="Loading..." />
        {:then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="System" description="Failed to load" />
        {/await}
      {:else if activeSubTab === 'health-monitor'}
        {#await import('./lib/pages/SystemHealthMonitorPage.svelte')}
          <PlaceholderPage title="Health Monitor" description="Loading..." />
        {:then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Health Monitor" description="Failed to load" />
        {/await}
      {:else if activeSubTab === 'projects'}
        {#await import('./lib/pages/SystemProjectsPage.svelte')}
          <PlaceholderPage title="Projects" description="Loading..." />
        {:then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Projects" description="Failed to load" />
        {/await}
      {:else if activeSubTab === 'errors'}
        {#await import('./lib/pages/SystemErrorsPage.svelte')}
          <PlaceholderPage title="Errors" description="Loading..." />
        {:then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Errors" description="Loading..." />
        {/await}
      {:else}
        <PlaceholderPage title="System - {activeSubTab}" description="This page is coming soon" />
      {/if}
    {:else if activeTab === 'settings'}
      {#await import('./lib/pages/SettingsPage.svelte') then { default: Component }}
        <Component />
      {:catch}
        <PlaceholderPage title="Settings" description="Loading..." />
      {/await}
    {:else if activeTab === 'about'}
      {#await import('./lib/pages/AboutPage.svelte') then { default: Component }}
        <Component />
      {:catch}
        <PlaceholderPage title="About" description="Loading..." />
      {/await}
    {:else if activeTab === 'quickstart'}
      <QuickStartWizard
        asPage={true}
        on:complete={handleQuickStartComplete}
        on:skip={handleQuickStartSkip}
      />
    {:else if activeTab === 'welcome'}
      {#await import('./lib/WelcomePage.svelte') then { default: Component }}
        <Component />
      {:catch}
        <PlaceholderPage title="Welcome" description="Loading..." />
      {/await}
    {:else}
      <div class="p-6 text-center">
        <h1 class="text-2xl font-bold text-[var(--text-heading)]">Page Not Found</h1>
        <p class="text-[var(--text)] mt-2">Unknown tab: {activeTab}</p>
      </div>
    {/if}
  </main>

  <!-- Footer -->
  <Footer
    {sessionId}
    version="2.0.1-corvus"
    onSessionClick={handleSessionClick}
    onAboutClick={handleAboutClick}
  />

  <!-- Toast Notifications -->
  <ToastContainer />

  <!-- Welcome Screen (first-time users) -->
  {#if showWelcome}
    <WelcomeScreen on:close={handleWelcomeClose} />
  {/if}

  <!-- Quick Start Wizard is now a route at /quickstart -->

  <!-- Keyboard Shortcuts Help -->
  <KeyboardShortcuts
    visible={showKeyboardShortcuts}
    onClose={() => (showKeyboardShortcuts = false)}
  />
</div>
