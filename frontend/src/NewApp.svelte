<script>
  /**
   * Raven App - Tailwind Version
   * Clean, simple application layout with Tailwind CSS
   */

  import { logger } from './lib/logger.js';
  import { api } from './lib/apiClient.js';
  import Header from './lib/components/layout/Header.svelte';
  import Footer from './lib/components/layout/Footer.svelte';
  // All page components now use dynamic imports for code splitting
  import PlaceholderPage from './lib/components/ui/PlaceholderPage.svelte';
  import NotificationPanel from './lib/components/ui/NotificationPanel.svelte';
  import ToastContainer from './lib/components/ui/ToastContainer.svelte';
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

  // ConfirmDialog functions (reserved for future use)
  // function showConfirmDialog(options) {
  //   confirmTitle = options.title || 'Confirm Action';
  //   confirmMessage = options.message || 'Are you sure?';
  //   confirmType = options.type || 'warning';
  //   confirmCallback = options.onConfirm || null;
  //   showConfirm = true;
  // }

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
        {#await import('./lib/pages/OverviewPage.svelte') then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Overview" description="Loading..." />
        {/await}
      {:else if activeSubTab === 'projects'}
        {#await import('./lib/pages/ProjectsComparisonPage.svelte') then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Projects Comparison" description="Loading..." />
        {/await}
      {:else if activeSubTab === 'health'}
        {#await import('./lib/pages/OverviewHealthPage.svelte') then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Project Health" description="Loading..." />
        {/await}
      {:else}
        <PlaceholderPage title="Overview - {activeSubTab}" description="This page is coming soon" />
      {/if}
    {:else if activeTab === 'safety'}
      {#if !activeSubTab}
        {#await import('./lib/pages/SafetyPage.svelte') then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Safety" description="Loading..." />
        {/await}
      {:else if activeSubTab === 'syntax'}
        {#await import('./lib/pages/SyntaxErrorsPage.svelte') then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Syntax Errors" description="Loading..." />
        {/await}
      {:else if activeSubTab === 'rollback'}
        {#await import('./lib/pages/SessionRollbackPage.svelte') then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Session Rollback" description="Loading..." />
        {/await}
      {:else if activeSubTab === 'risk'}
        {#await import('./lib/pages/RiskCorrelationPage.svelte') then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Risk Correlation" description="Loading..." />
        {/await}
      {:else if activeSubTab === 'patterns'}
        {#await import('./lib/pages/PatternWarningsPage.svelte') then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Pattern Warnings" description="Loading..." />
        {/await}
      {:else if activeSubTab === 'tests'}
        {#await import('./lib/pages/RavenTestsPage.svelte') then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Raven Tests" description="Loading..." />
        {/await}
      {:else}
        <PlaceholderPage title="Safety - {activeSubTab}" description="This page is coming soon" />
      {/if}
    {:else if activeTab === 'agents'}
      {#if !activeSubTab}
        {#await import('./lib/pages/AgentsPage.svelte') then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Agents" description="Loading..." />
        {/await}
      {:else if activeSubTab === 'stats'}
        {#await import('./lib/pages/AgentStatsPage.svelte') then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Agent Stats" description="Loading..." />
        {/await}
      {:else if activeSubTab === 'monitoring'}
        {#await import('./lib/pages/AgentMonitoringPage.svelte') then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Agent Monitoring" description="Loading..." />
        {/await}
      {:else if activeSubTab === 'conversations'}
        {#await import('./lib/pages/AgentConversationsPage.svelte') then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Agent Conversations" description="Loading..." />
        {/await}
      {:else if activeSubTab === 'setup'}
        {#await import('./lib/pages/AgentSetupPage.svelte') then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Agent Setup" description="Loading..." />
        {/await}
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
        {#await import('./lib/pages/AnalysisPage.svelte') then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Analysis" description="Loading..." />
        {/await}
      {:else if activeSubTab === 'performance'}
        {#await import('./lib/pages/AnalysisPerformancePage.svelte') then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Performance Analysis" description="Loading..." />
        {/await}
      {:else if activeSubTab === 'custom-metrics'}
        {#await import('./lib/pages/AnalysisCustomMetricsPage.svelte') then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Custom Metrics" description="Loading..." />
        {/await}
      {:else if activeSubTab === 'trends'}
        {#await import('./lib/pages/AnalysisHistoricalTrendsPage.svelte') then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Historical Trends" description="Loading..." />
        {/await}
      {:else if activeSubTab === 'triggers'}
        {#await import('./lib/pages/AnalysisTriggersPage.svelte') then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Triggers" description="Loading..." />
        {/await}
      {:else if activeSubTab === 'session-replay'}
        {#await import('./lib/pages/AnalysisSessionReplayPage.svelte') then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Session Replay" description="Loading..." />
        {/await}
      {:else if activeSubTab === 'developer-insights'}
        {#await import('./lib/pages/AnalysisDeveloperInsightsPage.svelte') then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Developer Insights" description="Loading..." />
        {/await}
      {:else}
        <PlaceholderPage title="Analysis - {activeSubTab}" description="This page is coming soon" />
      {/if}
    {:else if activeTab === 'system'}
      {#if !activeSubTab}
        {#await import('./lib/pages/SystemPage.svelte') then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="System" description="Loading..." />
        {/await}
      {:else if activeSubTab === 'status'}
        {#await import('./lib/pages/SystemStatusPage.svelte') then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="System Status" description="Loading..." />
        {/await}
      {:else if activeSubTab === 'anomalies'}
        {#await import('./lib/pages/SystemAnomalyAlertsPage.svelte') then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Anomaly Alerts" description="Loading..." />
        {/await}
      {:else if activeSubTab === 'intelligence'}
        {#await import('./lib/pages/SystemIntelligencePage.svelte') then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Intelligence" description="Loading..." />
        {/await}
      {:else if activeSubTab === 'integrations'}
        {#await import('./lib/pages/SystemIntegrationsPage.svelte') then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Integrations" description="Loading..." />
        {/await}
      {:else if activeSubTab === 'exports'}
        {#await import('./lib/pages/SystemExportsPage.svelte') then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Exports" description="Loading..." />
        {/await}
      {:else if activeSubTab === 'storage'}
        {#await import('./lib/pages/SystemStoragePage.svelte') then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Storage" description="Loading..." />
        {/await}
      {:else if activeSubTab === 'projects'}
        {#await import('./lib/pages/SystemProjectsPage.svelte') then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Projects" description="Loading..." />
        {/await}
      {:else if activeSubTab === 'sync'}
        {#await import('./lib/pages/SystemServerSyncPage.svelte') then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Server Sync" description="Loading..." />
        {/await}
      {:else if activeSubTab === 'notifications'}
        {#await import('./lib/pages/SystemNotificationsPage.svelte') then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Notifications" description="Loading..." />
        {/await}
      {:else if activeSubTab === 'errors'}
        {#await import('./lib/pages/SystemErrorsPage.svelte') then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Errors" description="Loading..." />
        {/await}
      {:else if activeSubTab === 'api'}
        {#await import('./lib/pages/SystemAPIHealthPage.svelte') then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="API Health" description="Loading..." />
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
    {:else if activeTab === 'changelog'}
      {#await import('./lib/pages/ChangelogPage.svelte') then { default: Component }}
        <Component />
      {:catch}
        <PlaceholderPage title="Changelog" description="Loading..." />
      {/await}
    {:else if activeTab === 'docs'}
      {#await import('./lib/pages/DocsPage.svelte') then { default: Component }}
        <Component />
      {:catch}
        <PlaceholderPage title="Docs" description="Loading..." />
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
