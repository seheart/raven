<script>
  /**
   * Raven App - Tailwind Version
   * Clean, simple application layout with Tailwind CSS
   */

  import { logger } from './lib/logger.js';
  import { api } from './lib/apiClient.js';
  import Header from './lib/components/layout/Header.svelte';
  import VitalsStrip from './lib/components/layout/VitalsStrip.svelte';
  import Footer from './lib/components/layout/Footer.svelte';
  // All pages lazy-loaded; eagerly importing AnalysisPage dragged chart.js
  // into the entry chunk (~150KB shell weight).
  import PlaceholderPage from './lib/components/ui/PlaceholderPage.svelte';
  import ToastContainer from './lib/components/ui/ToastContainer.svelte';
  import KeyboardShortcuts from './lib/KeyboardShortcuts.svelte';
  import { getPath, navigate } from './lib/utils/router.svelte.js';
  import { onMount } from 'svelte';
  import { dataService } from './lib/dataService.js';
  import { settings } from './lib/stores/settingsStore.js';
  import { websocketService } from './lib/services/websocket.js';

  // State
  let sessionId = $state('Loading...');
  let appVersion = $state('');
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
      const [sessionData, healthData] = await Promise.all([
        api.get('/session-id').catch(() => ({})),
        api.get('/health').catch(() => ({}))
      ]);
      sessionId = sessionData.session_id || 'Unknown';
      appVersion = healthData.version || '';
    } catch (error) {
      sessionId = 'Offline';
      logger.error('Failed to load session ID:', error);
    }
  }

  // Check for first-time user on mount
  onMount(() => {
    // Load session ID once on mount
    loadSessionId();

    // Prefetch all data in parallel for instant page loads
    dataService.prefetchAll().then(() => {
      // Start background refresh to keep data warm
      dataService.startBackgroundRefresh(15000);
    });

    // Auto-refresh when server restarts (WebSocket reconnects with new session)
    websocketService.onReconnect(() => {
      loadSessionId();
      dataService.prefetchAll();
    });

    // Apply saved theme on load. Class lives on <html> — see settingsStore.
    const savedTheme = settings.getValue().ui.theme;
    if (savedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
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
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
      dataService.stopBackgroundRefresh();
    };
  });


  function handleAboutClick() {
    navigate('/about');
  }

  function handleTechStackClick() {
    navigate('/system');
  }

  function handleDesignSystemClick() {
    navigate('/design-system');
  }

  function handleRoadmapClick() {
    navigate('/roadmap');
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
  <VitalsStrip />

  <!-- Main Content -->
  <main class="pb-16">
    <svelte:boundary>
      {#snippet failed(error, reset)}
        <div class="min-h-screen bg-[var(--bg)] p-6 pb-20 flex items-center justify-center">
          <div class="text-center max-w-[32rem]">
            <div class="text-4xl font-bold text-[var(--error)] mb-4 font-mono">Error</div>
            <h1 class="text-xl font-bold text-[var(--text-heading)] mb-2">Something went wrong</h1>
            <p class="text-sm text-[var(--muted)] font-sans mb-2">
              This page encountered an unexpected error.
            </p>
            <pre
              class="text-xs text-[var(--error)] bg-[var(--surface)] border border-[var(--border)] rounded p-3 mb-6 text-left overflow-auto max-h-32 font-mono">{error?.message ||
                'Unknown error'}</pre>
            <div class="flex gap-3 justify-center">
              <button
                onclick={reset}
                class="px-4 py-2 bg-[var(--accent)] text-canvas rounded text-sm font-sans hover:opacity-90 transition-opacity"
              >
                Try Again
              </button>
              <button
                onclick={() => navigate('/overview')}
                class="px-4 py-2 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      {/snippet}
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
      {:else if activeTab === 'insights'}
        {#await import('./lib/pages/InsightsPage.svelte')}
          <PlaceholderPage title="Insights" description="Loading..." />
        {:then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Insights" description="Failed to load" />
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
          <PlaceholderPage
            title="History - {activeSubTab}"
            description="This page is coming soon"
          />
        {/if}
      {:else if activeTab === 'analysis'}
        {#if !activeSubTab}
          {#await import('./lib/pages/AnalysisPage.svelte')}
            <PlaceholderPage title="Analysis" description="Loading..." />
          {:then { default: Component }}
            <Component />
          {:catch}
            <PlaceholderPage title="Analysis" description="Failed to load" />
          {/await}
        {:else if activeSubTab === 'costs'}
          {#await import('./lib/pages/CostsPage.svelte')}
            <PlaceholderPage title="Costs" description="Loading..." />
          {:then { default: Component }}
            <Component />
          {:catch}
            <PlaceholderPage title="Costs" description="Failed to load" />
          {/await}
        {:else if activeSubTab === 'subagents'}
          {#await import('./lib/pages/SubAgentTreePage.svelte')}
            <PlaceholderPage title="Sub-Agents" description="Loading..." />
          {:then { default: Component }}
            <Component />
          {:catch}
            <PlaceholderPage title="Sub-Agents" description="Failed to load" />
          {/await}
        {:else if activeSubTab === 'models'}
          {#await import('./lib/pages/ModelsPage.svelte')}
            <PlaceholderPage title="Models" description="Loading..." />
          {:then { default: Component }}
            <Component />
          {:catch}
            <PlaceholderPage title="Models" description="Failed to load" />
          {/await}
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
            <PlaceholderPage title="Agent Performance" description="Loading..." />
          {:then { default: Component }}
            <Component />
          {:catch}
            <PlaceholderPage title="Agent Performance" description="Failed to load" />
          {/await}
        {:else if activeSubTab === 'monitoring'}
          {#await import('./lib/pages/AgentMonitoringPage.svelte')}
            <PlaceholderPage title="Live Agents" description="Loading..." />
          {:then { default: Component }}
            <Component />
          {:catch}
            <PlaceholderPage title="Live Agents" description="Failed to load" />
          {/await}
        {:else if activeSubTab === 'conversations'}
          {#await import('./lib/pages/AgentConversationsPage.svelte')}
            <PlaceholderPage title="Agent Conversations" description="Loading..." />
          {:then { default: Component }}
            <Component />
          {:catch}
            <PlaceholderPage title="Agent Conversations" description="Failed to load" />
          {/await}
        {:else if activeSubTab === 'activity'}
          {#await import('./lib/pages/SessionActivityPage.svelte')}
            <PlaceholderPage title="Session Activity" description="Loading..." />
          {:then { default: Component }}
            <Component />
          {:catch}
            <PlaceholderPage title="Session Activity" description="Failed to load" />
          {/await}
        {:else if activeSubTab === 'network'}
          {#await import('./lib/pages/ProcessActivityPage.svelte')}
            <PlaceholderPage title="Network Activity" description="Loading..." />
          {:then { default: Component }}
            <Component />
          {:catch}
            <PlaceholderPage title="Network Activity" description="Failed to load" />
          {/await}
        {:else}
          <PlaceholderPage
            title="Analysis - {activeSubTab}"
            description="This page is coming soon"
          />
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
        {:else if activeSubTab === 'code-health'}
          {#await import('./lib/pages/CodeHealthPage.svelte')}
            <PlaceholderPage title="Code Health" description="Loading..." />
          {:then { default: Component }}
            <Component />
          {:catch}
            <PlaceholderPage title="Code Health" description="Failed to load" />
          {/await}
        {:else if activeSubTab === 'health-monitor'}
          {#await import('./lib/pages/SystemHealthMonitorPage.svelte')}
            <PlaceholderPage title="Health Monitor" description="Loading..." />
          {:then { default: Component }}
            <Component />
          {:catch}
            <PlaceholderPage title="Health Monitor" description="Failed to load" />
          {/await}
        {:else if activeSubTab === 'safety'}
          {#await import('./lib/pages/SafetyPage.svelte')}
            <PlaceholderPage title="Safety" description="Loading..." />
          {:then { default: Component }}
            <Component />
          {:catch}
            <PlaceholderPage title="Safety" description="Failed to load" />
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
        {:else if activeSubTab === 'storage'}
          {#await import('./lib/pages/SystemStoragePage.svelte')}
            <PlaceholderPage title="Storage" description="Loading..." />
          {:then { default: Component }}
            <Component />
          {:catch}
            <PlaceholderPage title="Storage" description="Failed to load" />
          {/await}
        {:else}
          <PlaceholderPage title="System - {activeSubTab}" description="This page is coming soon" />
        {/if}
      {:else if activeTab === 'settings'}
        {#await import('./lib/pages/SettingsPage.svelte')}
          <PlaceholderPage title="Settings" description="Loading..." />
        {:then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Settings" description="Failed to load" />
        {/await}
      {:else if activeTab === 'about'}
        {#await import('./lib/pages/AboutPage.svelte')}
          <PlaceholderPage title="About" description="Loading..." />
        {:then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="About" description="Failed to load" />
        {/await}
      {:else if activeTab === 'design-system'}
        {#await import('./lib/pages/DesignSystemPage.svelte')}
          <PlaceholderPage title="Design System" description="Loading..." />
        {:then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Design System" description="Failed to load" />
        {/await}
      {:else if activeTab === 'style-lab'}
        {#await import('./lib/pages/StyleLabPage.svelte')}
          <PlaceholderPage title="Style Lab" description="Loading..." />
        {:then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Style Lab" description="Failed to load" />
        {/await}
      {:else if activeTab === 'light-lab'}
        {#await import('./lib/pages/LightLabPage.svelte')}
          <PlaceholderPage title="Light Lab" description="Loading..." />
        {:then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Light Lab" description="Failed to load" />
        {/await}
      {:else if activeTab === 'pulse-lab'}
        {#await import('./lib/pages/PulseLabPage.svelte')}
          <PlaceholderPage title="Pulse Lab" description="Loading..." />
        {:then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Pulse Lab" description="Failed to load" />
        {/await}
      {:else if activeTab === 'llm-lab'}
        {#await import('./lib/pages/LlmLabPage.svelte')}
          <PlaceholderPage title="LLM Lab" description="Loading..." />
        {:then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="LLM Lab" description="Failed to load" />
        {/await}
      {:else if activeTab === 'roadmap'}
        {#await import('./lib/pages/RoadmapPage.svelte')}
          <PlaceholderPage title="Roadmap" description="Loading..." />
        {:then { default: Component }}
          <Component />
        {:catch}
          <PlaceholderPage title="Roadmap" description="Failed to load" />
        {/await}
      {:else}
        <div class="min-h-screen bg-[var(--bg)] p-6 pb-20 flex items-center justify-center">
          <div class="text-center max-w-[28rem]">
            <div class="text-6xl font-bold text-[var(--muted)] mb-4 font-mono">404</div>
            <h1 class="text-xl font-bold text-[var(--text-heading)] mb-2">Page Not Found</h1>
            <p class="text-sm text-[var(--muted)] font-sans mb-6">
              There's nothing at <span class="font-mono text-[var(--text)]">/{activeTab}</span>
            </p>
            <button
              onclick={() => navigate('/overview')}
              class="px-4 py-2 bg-[var(--accent)] text-canvas rounded text-sm font-sans hover:opacity-90 transition-opacity"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      {/if}
    </svelte:boundary>
  </main>

  <!-- Footer -->
  <Footer
    {sessionId}
    version={appVersion}
    onSessionClick={handleSessionClick}
    onAboutClick={handleAboutClick}
    onTechStackClick={handleTechStackClick}
    onDesignSystemClick={handleDesignSystemClick}
    onRoadmapClick={handleRoadmapClick}
  />

  <!-- Toast Notifications -->
  <ToastContainer />

  <!-- Keyboard Shortcuts Help -->
  <KeyboardShortcuts
    visible={showKeyboardShortcuts}
    onClose={() => (showKeyboardShortcuts = false)}
  />
</div>

