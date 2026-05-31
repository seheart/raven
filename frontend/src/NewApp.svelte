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
  import ErrorBoundary from './lib/components/ui/ErrorBoundary.svelte';
  import ToastContainer from './lib/components/ui/ToastContainer.svelte';
  import { getPath, navigate } from './lib/utils/router.svelte.js';
  import { onMount } from 'svelte';
  import { dataService } from './lib/dataService.js';
  import { settings } from './lib/stores/settingsStore.js';
  import { websocketService } from './lib/services/websocket.js';
  import { toasts } from './lib/toastStore.js';

  // State
  let appVersion = $state('');

  // Get current path from router
  const currentPath = $derived(getPath());

  // Parse path to extract tab and subTab
  const pathParts = $derived.by(() => {
    const parts = currentPath.split('/').filter(Boolean);
    return {
      tab: parts[0] || 'today',
      subTab: parts[1] || ''
    };
  });

  const activeTab = $derived(pathParts.tab);
  const activeSubTab = $derived(pathParts.subTab);

  // Initialize route on mount
  $effect(() => {
    // Root path lands on Today (the lightweight first-run view).
    if (currentPath === '/') {
      navigate('/today');
    }
  });

  // Load app version on mount (footer pill).
  async function loadAppVersion() {
    try {
      const healthData = await api.get('/health').catch(() => ({}));
      appVersion = healthData.version || '';
    } catch (error) {
      logger.error('Failed to load app version:', error);
    }
  }

  // Check for first-time user on mount
  onMount(() => {
    loadAppVersion();

    // Prefetch all data in parallel for instant page loads
    dataService.prefetchAll().then(() => {
      // Start background refresh to keep data warm
      dataService.startBackgroundRefresh(15000);
    });

    // Auto-refresh when server restarts (WebSocket reconnects with new session)
    websocketService.onReconnect(() => {
      loadAppVersion();
      dataService.prefetchAll();
    });

    // Surface model loads as toasts so the user notices when a new local
    // model becomes resident. Backend's local-model-callbacks emits 'model-loaded'.
    const onModelLoaded = data => {
      const model = data?.model || data?.name || 'unknown';
      const project = data?.project || data?.cwd?.split('/').pop();
      toasts.info(project ? `Model loaded: ${model} (by ${project})` : `Model loaded: ${model}`);
    };
    websocketService.on('model-loaded', onModelLoaded);

    // Apply saved theme on load. Class lives on <html> — see settingsStore.
    const savedTheme = settings.getValue().ui.theme;
    if (savedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    return () => {
      dataService.stopBackgroundRefresh();
    };
  });

  function handleAboutClick() {
    navigate('/about');
  }

  function handleDesignSystemClick() {
    navigate('/design-system');
  }

  function handleRoadmapClick() {
    navigate('/roadmap');
  }

  function handleDiagnosticClick() {
    navigate('/diagnostic');
  }

  function handleSettingsClick() {
    navigate('/settings');
  }
</script>

<div class="min-h-screen bg-[var(--bg)]">
  <!-- Header -->
  <Header {activeTab} {activeSubTab} />
  <!-- Dashboard already renders its own vitals; the global strip is for
       the deeper pages where you want at-a-glance numbers in the header. -->
  {#if activeTab !== 'today'}
    <VitalsStrip />
  {/if}

  <!-- Main Content -->
  <!-- overflow-x:clip stops dense data pages from pushing the document
       wider than the viewport on mobile. Pages that need internal
       horizontal scroll wrap the offending element with overflow-x-auto. -->
  <!--
    Footer is hidden below `lg` (the half-screen design center) so no
    bottom padding is needed there. At lg+ the footer reappears and we
    add pb-20 (5rem) to clear its wrapped two-row height.
  -->
  <main class="pb-0 lg:pb-20 overflow-x-clip">
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
                class="px-4 py-2 bg-[var(--accent)] text-canvas rounded text-sm font-sans hover:bg-[var(--accent-2)] transition-colors"
              >
                Try Again
              </button>
              <button
                onclick={() => navigate('/today')}
                class="px-4 py-2 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      {/snippet}
      {#if activeTab === 'today'}
        <ErrorBoundary name="Dashboard">
          {#await import('./lib/pages/OverviewPage.svelte')}
            <PlaceholderPage title="Dashboard" description="Loading..." />
          {:then { default: Component }}
            <Component />
          {:catch}
            <PlaceholderPage title="Dashboard" description="Failed to load" />
          {/await}
        </ErrorBoundary>
      {:else if activeTab === 'narrative'}
        <ErrorBoundary name="Narrative">
          {#await import('./lib/pages/TodayPage.svelte')}
            <PlaceholderPage title="Narrative" description="Loading..." />
          {:then { default: Component }}
            <Component />
          {:catch}
            <PlaceholderPage title="Narrative" description="Failed to load" />
          {/await}
        </ErrorBoundary>
      {:else if activeTab === 'activity'}
        <ErrorBoundary name="Activity">
          {#if !activeSubTab}
            {#await import('./lib/pages/ActivityOverviewPage.svelte')}
              <PlaceholderPage title="Activity" description="Loading..." />
            {:then { default: Component }}
              <Component />
            {:catch}
              <PlaceholderPage title="Activity" description="Failed to load" />
            {/await}
          {:else if activeSubTab === 'live'}
            {#await import('./lib/pages/LivePage.svelte')}
              <PlaceholderPage title="Live" description="Loading..." />
            {:then { default: Component }}
              <Component />
            {:catch}
              <PlaceholderPage title="Live" description="Failed to load" />
            {/await}
          {:else if activeSubTab === 'changes'}
            {#await import('./lib/pages/ActivityCodeChangesPage.svelte')}
              <PlaceholderPage title="Changes" description="Loading..." />
            {:then { default: Component }}
              <Component />
            {:catch}
              <PlaceholderPage title="Changes" description="Failed to load" />
            {/await}
          {:else if activeSubTab === 'timeline'}
            {#await import('./lib/pages/ActivityTimelinePage.svelte')}
              <PlaceholderPage title="Timeline" description="Loading..." />
            {:then { default: Component }}
              <Component />
            {:catch}
              <PlaceholderPage title="Timeline" description="Failed to load" />
            {/await}
          {:else if activeSubTab === 'files'}
            {#await import('./lib/pages/ActivityFileBrowserPage.svelte')}
              <PlaceholderPage title="Files" description="Loading..." />
            {:then { default: Component }}
              <Component />
            {:catch}
              <PlaceholderPage title="Files" description="Failed to load" />
            {/await}
          {:else if activeSubTab === 'projects'}
            {#await import('./lib/pages/ProjectsComparisonPage.svelte')}
              <PlaceholderPage title="Projects" description="Loading..." />
            {:then { default: Component }}
              <Component />
            {:catch}
              <PlaceholderPage title="Projects" description="Failed to load" />
            {/await}
          {:else if activeSubTab === 'health'}
            {#await import('./lib/pages/OverviewHealthPage.svelte')}
              <PlaceholderPage title="Health" description="Loading..." />
            {:then { default: Component }}
              <Component />
            {:catch}
              <PlaceholderPage title="Health" description="Failed to load" />
            {/await}
          {:else if activeSubTab === 'search'}
            {#await import('./lib/pages/ActivitySearchPage.svelte')}
              <PlaceholderPage title="Search" description="Loading..." />
            {:then { default: Component }}
              <Component />
            {:catch}
              <PlaceholderPage title="Search" description="Failed to load" />
            {/await}
          {:else}
            <PlaceholderPage
              title="Activity - {activeSubTab}"
              description="This page is coming soon"
            />
          {/if}
        </ErrorBoundary>
      {:else if activeTab === 'agents'}
        <ErrorBoundary name="Agents">
          {#if !activeSubTab}
            {#await import('./lib/pages/AgentMonitoringPage.svelte')}
              <PlaceholderPage title="Agents" description="Loading..." />
            {:then { default: Component }}
              <Component />
            {:catch}
              <PlaceholderPage title="Agents" description="Failed to load" />
            {/await}
          {:else if activeSubTab === 'stats'}
            {#await import('./lib/pages/AgentStatsPage.svelte')}
              <PlaceholderPage title="Stats" description="Loading..." />
            {:then { default: Component }}
              <Component />
            {:catch}
              <PlaceholderPage title="Stats" description="Failed to load" />
            {/await}
          {:else if activeSubTab === 'convos'}
            {#await import('./lib/pages/AgentConversationsPage.svelte')}
              <PlaceholderPage title="Conversations" description="Loading..." />
            {:then { default: Component }}
              <Component />
            {:catch}
              <PlaceholderPage title="Conversations" description="Failed to load" />
            {/await}
          {:else if activeSubTab === 'sub-agents'}
            {#await import('./lib/pages/SubAgentTreePage.svelte')}
              <PlaceholderPage title="Sub-Agents" description="Loading..." />
            {:then { default: Component }}
              <Component />
            {:catch}
              <PlaceholderPage title="Sub-Agents" description="Failed to load" />
            {/await}
          {:else if activeSubTab === 'sessions'}
            {#await import('./lib/pages/SessionActivityPage.svelte')}
              <PlaceholderPage title="Sessions" description="Loading..." />
            {:then { default: Component }}
              <Component />
            {:catch}
              <PlaceholderPage title="Sessions" description="Failed to load" />
            {/await}
          {:else if activeSubTab === 'network'}
            {#await import('./lib/pages/ProcessActivityPage.svelte')}
              <PlaceholderPage title="Network" description="Loading..." />
            {:then { default: Component }}
              <Component />
            {:catch}
              <PlaceholderPage title="Network" description="Failed to load" />
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
          {:else}
            <PlaceholderPage
              title="Agents - {activeSubTab}"
              description="This page is coming soon"
            />
          {/if}
        </ErrorBoundary>
      {:else if activeTab === 'insights'}
        <ErrorBoundary name="Insights">
          {#if !activeSubTab}
            {#await import('./lib/pages/InsightsPage.svelte')}
              <PlaceholderPage title="Insights" description="Loading..." />
            {:then { default: Component }}
              <Component />
            {:catch}
              <PlaceholderPage title="Insights" description="Failed to load" />
            {/await}
          {:else if activeSubTab === 'costs'}
            {#await import('./lib/pages/CostsPage.svelte')}
              <PlaceholderPage title="Costs" description="Loading..." />
            {:then { default: Component }}
              <Component />
            {:catch}
              <PlaceholderPage title="Costs" description="Failed to load" />
            {/await}
          {:else if activeSubTab === 'trends'}
            {#await import('./lib/pages/AnalysisHistoricalTrendsPage.svelte')}
              <PlaceholderPage title="Trends" description="Loading..." />
            {:then { default: Component }}
              <Component />
            {:catch}
              <PlaceholderPage title="Trends" description="Failed to load" />
            {/await}
          {:else if activeSubTab === 'wrapped'}
            {#await import('./lib/pages/WrappedPage.svelte')}
              <PlaceholderPage title="Wrapped" description="Loading..." />
            {:then { default: Component }}
              <Component />
            {:catch}
              <PlaceholderPage title="Wrapped" description="Failed to load" />
            {/await}
          {:else}
            <PlaceholderPage
              title="Insights - {activeSubTab}"
              description="This page is coming soon"
            />
          {/if}
        </ErrorBoundary>
      {:else if activeTab === 'system'}
        <ErrorBoundary name="System">
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
          {:else if activeSubTab === 'plugins'}
            {#await import('./lib/pages/SystemPluginsPage.svelte')}
              <PlaceholderPage title="Plugins" description="Loading..." />
            {:then { default: Component }}
              <Component />
            {:catch}
              <PlaceholderPage title="Plugins" description="Failed to load" />
            {/await}
          {:else if activeSubTab === 'triggers'}
            {#await import('./lib/pages/AnalysisTriggersPage.svelte')}
              <PlaceholderPage title="Triggers" description="Loading..." />
            {:then { default: Component }}
              <Component />
            {:catch}
              <PlaceholderPage title="Triggers" description="Failed to load" />
            {/await}
          {:else}
            <PlaceholderPage
              title="System - {activeSubTab}"
              description="This page is coming soon"
            />
          {/if}
        </ErrorBoundary>
      {:else if activeTab === 'settings'}
        <ErrorBoundary name="Settings">
          {#await import('./lib/pages/SettingsPage.svelte')}
            <PlaceholderPage title="Settings" description="Loading..." />
          {:then { default: Component }}
            <Component />
          {:catch}
            <PlaceholderPage title="Settings" description="Failed to load" />
          {/await}
        </ErrorBoundary>
      {:else if activeTab === 'about'}
        <ErrorBoundary name="About">
          {#await import('./lib/pages/AboutPage.svelte')}
            <PlaceholderPage title="About" description="Loading..." />
          {:then { default: Component }}
            <Component />
          {:catch}
            <PlaceholderPage title="About" description="Failed to load" />
          {/await}
        </ErrorBoundary>
      {:else if activeTab === 'design-system'}
        <ErrorBoundary name="Design System">
          {#await import('./lib/pages/DesignSystemPage.svelte')}
            <PlaceholderPage title="Design System" description="Loading..." />
          {:then { default: Component }}
            <Component />
          {:catch}
            <PlaceholderPage title="Design System" description="Failed to load" />
          {/await}
        </ErrorBoundary>
      {:else if activeTab === 'style-lab' && import.meta.env.DEV}
        <ErrorBoundary name="Style Lab">
          {#await import('./lib/pages/StyleLabPage.svelte')}
            <PlaceholderPage title="Style Lab" description="Loading..." />
          {:then { default: Component }}
            <Component />
          {:catch}
            <PlaceholderPage title="Style Lab" description="Failed to load" />
          {/await}
        </ErrorBoundary>
      {:else if activeTab === 'light-lab' && import.meta.env.DEV}
        <ErrorBoundary name="Light Lab">
          {#await import('./lib/pages/LightLabPage.svelte')}
            <PlaceholderPage title="Light Lab" description="Loading..." />
          {:then { default: Component }}
            <Component />
          {:catch}
            <PlaceholderPage title="Light Lab" description="Failed to load" />
          {/await}
        </ErrorBoundary>
      {:else if activeTab === 'pulse-lab' && import.meta.env.DEV}
        <ErrorBoundary name="Pulse Lab">
          {#await import('./lib/pages/PulseLabPage.svelte')}
            <PlaceholderPage title="Pulse Lab" description="Loading..." />
          {:then { default: Component }}
            <Component />
          {:catch}
            <PlaceholderPage title="Pulse Lab" description="Failed to load" />
          {/await}
        </ErrorBoundary>
      {:else if activeTab === 'llm-lab' && import.meta.env.DEV}
        <ErrorBoundary name="LLM Lab">
          {#await import('./lib/pages/LlmLabPage.svelte')}
            <PlaceholderPage title="LLM Lab" description="Loading..." />
          {:then { default: Component }}
            <Component />
          {:catch}
            <PlaceholderPage title="LLM Lab" description="Failed to load" />
          {/await}
        </ErrorBoundary>
      {:else if activeTab === 'roadmap'}
        <ErrorBoundary name="Roadmap">
          {#await import('./lib/pages/RoadmapPage.svelte')}
            <PlaceholderPage title="Roadmap" description="Loading..." />
          {:then { default: Component }}
            <Component />
          {:catch}
            <PlaceholderPage title="Roadmap" description="Failed to load" />
          {/await}
        </ErrorBoundary>
      {:else if activeTab === 'diagnostic'}
        <ErrorBoundary name="Diagnostic">
          {#await import('./lib/pages/DiagnosticPage.svelte')}
            <PlaceholderPage title="Diagnostic" description="Loading..." />
          {:then { default: Component }}
            <Component />
          {:catch}
            <PlaceholderPage title="Diagnostic" description="Failed to load" />
          {/await}
        </ErrorBoundary>
      {:else}
        <div class="min-h-screen bg-[var(--bg)] p-6 pb-20 flex items-center justify-center">
          <div class="text-center max-w-[28rem]">
            <div class="text-6xl font-bold text-[var(--muted)] mb-4 font-mono">404</div>
            <h1 class="text-xl font-bold text-[var(--text-heading)] mb-2">Page Not Found</h1>
            <p class="text-sm text-[var(--muted)] font-sans mb-6">
              There's nothing at <span class="font-mono text-[var(--text)]">/{activeTab}</span>
            </p>
            <button
              onclick={() => navigate('/today')}
              class="px-4 py-2 bg-[var(--accent)] text-canvas rounded text-sm font-sans hover:opacity-90 transition-opacity"
            >
              Back to Today
            </button>
          </div>
        </div>
      {/if}
    </svelte:boundary>
  </main>

  <!-- Footer -->
  <Footer
    version={appVersion}
    onAboutClick={handleAboutClick}
    onDesignSystemClick={handleDesignSystemClick}
    onRoadmapClick={handleRoadmapClick}
    onDiagnosticClick={handleDiagnosticClick}
    onSettingsClick={handleSettingsClick}
  />

  <!-- Toast Notifications -->
  <ToastContainer />
</div>
