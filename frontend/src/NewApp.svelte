<script>
  /**
   * Raven App - Tailwind Version
   * Clean, simple application layout with Tailwind CSS
   */

  import { logger } from './lib/logger.js';
  import { api } from './lib/apiClient.js';
  import Header from './lib/components/layout/Header.svelte';
  import Footer from './lib/components/layout/Footer.svelte';
  import OverviewPage from './lib/pages/OverviewPage.svelte';
  import ProjectsComparisonPage from './lib/pages/ProjectsComparisonPage.svelte';
  import MultiProjectHealthPage from './lib/pages/MultiProjectHealthPage.svelte';
  import SafetyPage from './lib/pages/SafetyPage.svelte';
  import SyntaxErrorsPage from './lib/pages/SyntaxErrorsPage.svelte';
  import SessionRollbackPage from './lib/pages/SessionRollbackPage.svelte';
  import RiskCorrelationPage from './lib/pages/RiskCorrelationPage.svelte';
  import PatternWarningsPage from './lib/pages/PatternWarningsPage.svelte';
  import RavenTestsPage from './lib/pages/RavenTestsPage.svelte';
  import AgentsPage from './lib/pages/AgentsPage.svelte';
  import AgentStatsPage from './lib/pages/AgentStatsPage.svelte';
  import AgentMonitoringPage from './lib/pages/AgentMonitoringPage.svelte';
  import AgentConversationsPage from './lib/pages/AgentConversationsPage.svelte';
  import AgentSetupPage from './lib/pages/AgentSetupPage.svelte';
  import AnalysisPage from './lib/pages/AnalysisPage.svelte';
  import AnalysisPerformancePage from './lib/pages/AnalysisPerformancePage.svelte';
  import AnalysisCustomMetricsPage from './lib/pages/AnalysisCustomMetricsPage.svelte';
  import AnalysisHistoricalTrendsPage from './lib/pages/AnalysisHistoricalTrendsPage.svelte';
  import AnalysisTriggersPage from './lib/pages/AnalysisTriggersPage.svelte';
  import AnalysisSessionReplayPage from './lib/pages/AnalysisSessionReplayPage.svelte';
  import AnalysisDeveloperInsightsPage from './lib/pages/AnalysisDeveloperInsightsPage.svelte';
  import SystemPage from './lib/pages/SystemPage.svelte';
  import SystemStatusPage from './lib/pages/SystemStatusPage.svelte';
  import SystemAnomalyAlertsPage from './lib/pages/SystemAnomalyAlertsPage.svelte';
  import SystemIntelligencePage from './lib/pages/SystemIntelligencePage.svelte';
  import SystemTier4Page from './lib/pages/SystemTier4Page.svelte';
  import SystemStoragePage from './lib/pages/SystemStoragePage.svelte';
  import SystemProjectsPage from './lib/pages/SystemProjectsPage.svelte';
  import SystemServerSyncPage from './lib/pages/SystemServerSyncPage.svelte';
  import SystemNotificationsPage from './lib/pages/SystemNotificationsPage.svelte';
  import SystemErrorsPage from './lib/pages/SystemErrorsPage.svelte';
  import SystemAPIHealthPage from './lib/pages/SystemAPIHealthPage.svelte';
  import SettingsPage from './lib/pages/SettingsPage.svelte';
  import AboutPage from './lib/pages/AboutPage.svelte';
  import ChangelogPage from './lib/pages/ChangelogPage.svelte';
  import DocsPage from './lib/pages/DocsPage.svelte';
  import PlaceholderPage from './lib/components/ui/PlaceholderPage.svelte';
  import NotificationPanel from './lib/components/ui/NotificationPanel.svelte';
  import WelcomeScreen from './lib/WelcomeScreen.svelte';
  import QuickStartWizard from './lib/QuickStartWizard.svelte';
  import KeyboardShortcuts from './lib/KeyboardShortcuts.svelte';
  import ConfirmDialog from './lib/ConfirmDialog.svelte';
  import { getPath, navigate } from './lib/utils/router.svelte.js';
  import { unreadCount } from './lib/stores/notificationHistory.js';
  import { onMount } from 'svelte';

  // State
  let theme = $state('tokyo-night');
  let username = $state('Seth');
  let role = $state('admin');
  let todayStats = $state({ modified: 12, added: 3, deleted: 1 });
  let showNotifications = $state(false);
  let sessionId = $state('Loading...');
  let showWelcome = $state(false);
  let showQuickStart = $state(false);
  let showKeyboardShortcuts = $state(false);

  // ConfirmDialog state
  let showConfirm = $state(false);
  let confirmTitle = $state('Confirm Action');
  let confirmMessage = $state('Are you sure?');
  let confirmType = $state('warning');
  let confirmCallback = $state(null);

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
      const data = await api.get('/session-id');
      sessionId = data.session_id || 'Unknown';
    } catch (error) {
      sessionId = 'Offline';
      logger.error('Failed to load session ID:', error);
    }
  }

  // Check for first-time user on mount
  onMount(() => {
    const welcomeSeen = localStorage.getItem('raven-welcome-seen');
    if (!welcomeSeen) {
      showWelcome = true;
    }

    // Add keyboard listener for ? key
    const handleKeyPress = (e) => {
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
      showQuickStart = true;
    }
  }

  function handleQuickStartComplete() {
    showQuickStart = false;
    localStorage.setItem('raven-quick-start-completed', 'true');
  }

  function handleQuickStartSkip() {
    showQuickStart = false;
    localStorage.setItem('raven-quick-start-completed', 'true');
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
    logger.debug('Theme changed to:', newTheme, 'CSS class:', themeClass);
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

  // ConfirmDialog functions
  function showConfirmDialog(options) {
    confirmTitle = options.title || 'Confirm Action';
    confirmMessage = options.message || 'Are you sure?';
    confirmType = options.type || 'warning';
    confirmCallback = options.onConfirm || null;
    showConfirm = true;
  }

  function handleConfirmYes() {
    if (confirmCallback) confirmCallback();
    showConfirm = false;
  }

  function handleConfirmNo() {
    showConfirm = false;
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
      {:else if activeSubTab === 'projects'}
        <ProjectsComparisonPage />
      {:else if activeSubTab === 'health'}
        <MultiProjectHealthPage />
      {:else}
        <PlaceholderPage title="Overview - {activeSubTab}" description="This page is coming soon" />
      {/if}
    {:else if activeTab === 'safety'}
      {#if !activeSubTab}
        <SafetyPage />
      {:else if activeSubTab === 'syntax'}
        <SyntaxErrorsPage />
      {:else if activeSubTab === 'rollback'}
        <SessionRollbackPage />
      {:else if activeSubTab === 'risk'}
        <RiskCorrelationPage />
      {:else if activeSubTab === 'patterns'}
        <PatternWarningsPage />
      {:else if activeSubTab === 'tests'}
        <RavenTestsPage />
      {:else}
        <PlaceholderPage title="Safety - {activeSubTab}" description="This page is coming soon" />
      {/if}
    {:else if activeTab === 'agents'}
      {#if !activeSubTab}
        <AgentsPage />
      {:else if activeSubTab === 'stats'}
        <AgentStatsPage />
      {:else if activeSubTab === 'monitoring'}
        <AgentMonitoringPage />
      {:else if activeSubTab === 'conversations'}
        <AgentConversationsPage />
      {:else if activeSubTab === 'setup'}
        <AgentSetupPage />
      {:else}
        <PlaceholderPage title="Agents - {activeSubTab}" description="This page is coming soon" />
      {/if}
    {:else if activeTab === 'activity'}
      {#if !activeSubTab}
        {#await import('./lib/pages/ActivityDashboardPage.svelte') then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Activity Overview" description="Loading..." />
        {/await}
      {:else if activeSubTab === 'activity-log'}
        {#await import('./lib/pages/ActivityOverviewPage.svelte') then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Activity Log" description="Loading..." />
        {/await}
      {:else if activeSubTab === 'code'}
        {#await import('./lib/pages/ActivityCodeChangesPage.svelte') then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Activity - Code Changes" description="Loading..." />
        {/await}
      {:else if activeSubTab === 'live'}
        {#await import('./lib/pages/ActivityLiveFeedPage.svelte') then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Activity - Live Feed" description="Loading..." />
        {/await}
      {:else if activeSubTab === 'events'}
        {#await import('./lib/pages/ActivityEventLogPage.svelte') then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Activity - Event Log" description="Loading..." />
        {/await}
      {:else if activeSubTab === 'files'}
        {#await import('./lib/pages/ActivityFileBrowserPage.svelte') then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Activity - File Browser" description="Loading..." />
        {/await}
      {:else if activeSubTab === 'timeline'}
        {#await import('./lib/pages/ActivityTimelinePage.svelte') then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Activity - Timeline" description="Loading..." />
        {/await}
      {:else if activeSubTab === 'search'}
        {#await import('./lib/pages/ActivitySearchPage.svelte') then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Activity - Search" description="Loading..." />
        {/await}
      {:else}
        <PlaceholderPage title="Activity - {activeSubTab}" description="This page is coming soon" />
      {/if}
    {:else if activeTab === 'analysis'}
      {#if !activeSubTab}
        <AnalysisPage />
      {:else if activeSubTab === 'performance'}
        <AnalysisPerformancePage />
      {:else if activeSubTab === 'custom-metrics'}
        <AnalysisCustomMetricsPage />
      {:else if activeSubTab === 'trends'}
        <AnalysisHistoricalTrendsPage />
      {:else if activeSubTab === 'triggers'}
        <AnalysisTriggersPage />
      {:else if activeSubTab === 'session-replay'}
        <AnalysisSessionReplayPage />
      {:else if activeSubTab === 'developer-insights'}
        <AnalysisDeveloperInsightsPage />
      {:else}
        <PlaceholderPage title="Analysis - {activeSubTab}" description="This page is coming soon" />
      {/if}
    {:else if activeTab === 'system'}
      {#if !activeSubTab}
        <SystemPage />
      {:else if activeSubTab === 'status'}
        <SystemStatusPage />
      {:else if activeSubTab === 'anomalies'}
        <SystemAnomalyAlertsPage />
      {:else if activeSubTab === 'intelligence'}
        <SystemIntelligencePage />
      {:else if activeSubTab === 'tier4'}
        <SystemTier4Page />
      {:else if activeSubTab === 'storage'}
        <SystemStoragePage />
      {:else if activeSubTab === 'projects'}
        <SystemProjectsPage />
      {:else if activeSubTab === 'sync'}
        <SystemServerSyncPage />
      {:else if activeSubTab === 'notifications'}
        <SystemNotificationsPage />
      {:else if activeSubTab === 'errors'}
        <SystemErrorsPage />
      {:else if activeSubTab === 'api'}
        <SystemAPIHealthPage />
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

  <!-- Welcome Screen (first-time users) -->
  {#if showWelcome}
    <WelcomeScreen on:close={handleWelcomeClose} />
  {/if}

  <!-- Quick Start Wizard -->
  {#if showQuickStart}
    <QuickStartWizard on:complete={handleQuickStartComplete} on:skip={handleQuickStartSkip} />
  {/if}

  <!-- Keyboard Shortcuts Help -->
  <KeyboardShortcuts visible={showKeyboardShortcuts} onClose={() => (showKeyboardShortcuts = false)} />

  <!-- Confirm Dialog -->
  <ConfirmDialog
    show={showConfirm}
    title={confirmTitle}
    message={confirmMessage}
    type={confirmType}
    on:confirm={handleConfirmYes}
    on:cancel={handleConfirmNo}
  />
</div>
