<script>
  import { onMount, onDestroy } from 'svelte';
  import { router, currentTab, currentSubTab } from './lib/router.js';
  // New consolidated components
  import ErrorBoundary from './lib/ErrorBoundary.svelte';
  import WelcomeScreen from './lib/WelcomeScreen.svelte';
  import AppLoadingScreen from './lib/AppLoadingScreen.svelte';
  import UserMenu from './lib/UserMenu.svelte';

  // Existing components for consolidated views (kept lightweight/static)
  import Footer from './lib/Footer.svelte';
  import RavenLogo from './lib/RavenLogo.svelte';
  import Toast from './lib/Toast.svelte';
  import KeyboardShortcuts from './lib/KeyboardShortcuts.svelte';
  import OverviewPanel from './lib/OverviewPanel.svelte';
  import ProjectsComparisonPanel from './lib/ProjectsComparisonPanel.svelte';
  import MultiProjectHealthPanel from './lib/MultiProjectHealthPanel.svelte';
  import SyntaxErrorPanel from './lib/SyntaxErrorPanel.svelte';
  import SessionRollbackPanel from './lib/SessionRollbackPanel.svelte';
  import PatternWarningsPanel from './lib/PatternWarningsPanel.svelte';
  import TestResultsPanel from './lib/TestResultsPanel.svelte';
  import QuickStartWizard from './lib/QuickStartWizard.svelte';

  // Heavy panels will be lazy-loaded via dynamic import when needed
  import { keyboard } from './lib/keyboardService.js';
  import { setupGlobalErrorHandler } from './lib/errorLogger.js';
  import { notifications } from './lib/notificationService.js';
  import { setupNotificationListeners } from './lib/notificationListener.js';
  import { websocketService } from './lib/websocket.js';
  import { checkServerHealth } from './lib/apiClient.js';
  import { dataService } from './lib/dataService.js';
  import { logger } from './lib/logger.js';
  import { API_CONFIG } from './config.js';

  const API_BASE = API_CONFIG.API_BASE;

  // Prefetch likely-next panels during idle to improve perceived performance
  function prefetchPanels() {
    const idle = typeof requestIdleCallback === 'function'
      ? requestIdleCallback
      : (fn) => setTimeout(fn, 300);
    idle(() => {
      // Use Vite preload hint to start fetching in background
      import(/* @vite-preload */ './lib/StatusPanel.svelte');
      import(/* @vite-preload */ './lib/EventFeed.svelte');
      import(/* @vite-preload */ './lib/AgentsPanel.svelte');
      import(/* @vite-preload */ './lib/FileBrowser.svelte');
      import(/* @vite-preload */ './lib/ConversationsPanel.svelte');
      import(/* @vite-preload */ './lib/APIHealthMonitor.svelte');
    });
  }

  // Preload by main tab intent (hover)
  function preloadByTab(tabId) {
    try {
      switch (tabId) {
      case 'agents':
        import(/* @vite-preload */ './lib/AgentsPanel.svelte');
        import(/* @vite-preload */ './lib/ConversationsPanel.svelte');
        break;
      case 'activity':
        import(/* @vite-preload */ './lib/LiveCodeFeed.svelte');
        import(/* @vite-preload */ './lib/LiveFeed.svelte');
        import(/* @vite-preload */ './lib/EventFeed.svelte');
        import(/* @vite-preload */ './lib/ActivityLog.svelte');
        import(/* @vite-preload */ './lib/FileBrowser.svelte');
        import(/* @vite-preload */ './lib/GlobalSearchPanel.svelte');
        break;
      case 'analysis':
        import(/* @vite-preload */ './lib/PerformancePanel.svelte');
        import(/* @vite-preload */ './lib/CustomMetricsPanel.svelte');
        import(/* @vite-preload */ './lib/HistoricalTrendsPanel.svelte');
        import(/* @vite-preload */ './lib/TriggersPanel.svelte');
        import(/* @vite-preload */ './lib/SessionReplay.svelte');
        import(/* @vite-preload */ './lib/DeveloperInsightsPanel.svelte');
        break;
      case 'system':
        import(/* @vite-preload */ './lib/StatusPanel.svelte');
        import(/* @vite-preload */ './lib/AnomalyAlertsPanel.svelte');
        import(/* @vite-preload */ './lib/StoragePanel.svelte');
        import(/* @vite-preload */ './lib/ProjectsConfigPanel.svelte');
        import(/* @vite-preload */ './lib/ServerSyncPanel.svelte');
        import(/* @vite-preload */ './lib/NotificationsPanel.svelte');
        import(/* @vite-preload */ './lib/ErrorLog.svelte');
        import(/* @vite-preload */ './lib/APIHealthMonitor.svelte');
        break;
      case 'settings':
        import(/* @vite-preload */ './lib/SettingsPanel.svelte');
        break;
      case 'about':
        import(/* @vite-preload */ './lib/AboutPage.svelte');
        break;
      case 'changelog':
        import(/* @vite-preload */ './lib/ChangelogPage.svelte');
        break;
      case 'docs':
        import(/* @vite-preload */ './lib/DocsViewer.svelte');
        break;
      }
    } catch {
      // Ignore preload errors - components will load on demand
    }
  }

  // Main navigation tabs
  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📊', shortcut: '1' },
    { id: 'safety', label: 'Safety', icon: '🛡️', shortcut: '2' },
    { id: 'agents', label: 'Agents', icon: '🤖', shortcut: '3' },
    { id: 'activity', label: 'Activity', icon: '⚡', shortcut: '4' },
    { id: 'analysis', label: 'Analysis', icon: '📈', shortcut: '5' },
    { id: 'system', label: 'System', icon: '⚙️', shortcut: '6' }
  ];

  let sessionId = 'Loading...';
  let sessionUptime = '0s';
  // Use router for navigation state (synced with URL hash)
  // Always ensure activeTab has a valid value, default to 'overview' if undefined
  $: activeTab = $currentTab || 'overview';
  $: currentSubView = $currentSubTab;

  // Debug logging
  $: {
    console.log('[App] activeTab:', activeTab, 'currentTab:', $currentTab, 'isInitialLoading:', isInitialLoading);
  }
  let theme = 'theme--night'; // Default theme: Day (Gruvbox), Dusk (Ristretto), Night (Tokyo Night)
  let showHelp = false;
  let showWelcome = false;
  let showQuickStart = false;

  // Today's Activity stats
  let todayStats = {
    modified: 0,
    added: 0,
    deleted: 0
  };

  // Initial loading state
  let isInitialLoading = true;
  let loadingProgress = 0;
  let loadingMessage = 'Initializing Raven...';

  // Failsafe: clear loading screen after max 3 seconds, even if onMount fails
  if (typeof window !== 'undefined') {
    setTimeout(() => {
      if (isInitialLoading) {
        console.warn('[App] Failsafe: Force clearing loading screen after timeout');
        isInitialLoading = false;
      }
    }, 3000);
  }

  const startTime = Date.now();
  let uptimeInterval;
  let healthCheckInterval;
  let reconnectCallback;

  function updateUptime() {
    const seconds = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      sessionUptime = `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      sessionUptime = `${minutes}m ${secs}s`;
    } else {
      sessionUptime = `${secs}s`;
    }
  }

  async function loadSessionId() {
    try {
      const response = await fetch(`${API_BASE}/session-id`);
      const data = await response.json();
      sessionId = data.session_id || 'Unknown';
    } catch (error) {
      sessionId = 'Offline';
      logger.error('Failed to load session ID:', error);
    }
  }

  async function fetchTodayActivity() {
    try {
      // Fetch all events from today (500 should be enough for a full day)
      const events = await dataService.fetchFileEvents(500);

      // Calculate today's metrics
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Track the most recent change type for each file
      const fileStates = new Map();

      events.forEach(event => {
        const eventDate = new Date(event.timestamp);

        if (eventDate >= today && event.filepath && event.change_type) {
          const existing = fileStates.get(event.filepath);
          // Only update if this event is more recent
          if (!existing || eventDate > existing.timestamp) {
            fileStates.set(event.filepath, {
              change_type: event.change_type,
              timestamp: eventDate
            });
          }
        }
      });

      // Count files by their final state
      let modified = 0;
      let added = 0;
      let deleted = 0;

      fileStates.forEach((state, filepath) => {
        // Skip temp files, test databases, and SQLite internals
        if (filepath.includes('.tmp.') ||
            filepath.includes('test-databases') ||
            filepath.endsWith('-wal') ||
            filepath.endsWith('-shm')) {
          return;
        }

        if (state.change_type === 'edit') {
          modified++;
        } else if (state.change_type === 'create') {
          added++;
        } else if (state.change_type === 'delete') {
          deleted++;
        }
      });

      todayStats = {
        modified,
        added,
        deleted
      };
    } catch (error) {
      logger.error('Failed to fetch today activity:', error);
    }
  }

  function handleTabChange(newTab) {
    router.navigate(newTab);
    localStorage.setItem('raven-active-tab', newTab);
  }

  function handleOpenSettings() {
    router.navigate('settings');
  }

  function switchTheme(newTheme) {
    theme = newTheme;
    document.body.className = theme;
    localStorage.setItem('raven-theme', theme);
    notifications.success(`Theme changed to ${newTheme.replace('theme--', '')}`);
  }

  // Handle error notification clicks - navigate to Error Log with details
  function handleErrorClick(notification) {
    // Navigate to System tab and Error Log sub-view
    router.navigate('system', 'errors');

    // Log for debugging
    logger.info('Navigating to Error Log from notification:', notification.message);

    // Store the notification message to highlight in error log
    sessionStorage.setItem('highlightError', notification.message);
  }

  // Helper function to wait for backend to be ready (quick check)
  async function waitForBackend() {
    const maxRetries = 3; // Only 3 quick attempts
    const retryDelay = 200; // 200ms between retries

    for (let i = 0; i < maxRetries; i++) {
      try {
        loadingMessage = 'Connecting to backend server...';
        const response = await fetch(API_CONFIG.ENDPOINTS.HEALTH, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(500) // 500ms timeout per request
        });

        if (response.ok) {
          const health = await response.json();
          if (health.status) {
            loadingMessage = 'Backend server connected!';
            return true;
          }
        }
      } catch (error) {
        // Backend not ready yet, will retry
        logger.debug(`Backend not ready (attempt ${i + 1}/${maxRetries}):`, error.message);
      }

      // Wait before next retry
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }

    // Backend didn't respond quickly, but continue anyway
    logger.warn('Backend health check timed out - continuing anyway');
    return true; // Don't block the UI
  }

  onMount(async () => {
    // Load saved theme from localStorage (instant)
    theme = localStorage.getItem('raven-theme') || 'theme--night';
    document.body.className = theme;

    // Setup global error handler (instant)
    setupGlobalErrorHandler();

    // Register keyboard shortcuts (instant)
    keyboard.register('?', () => showHelp = !showHelp);
    keyboard.register('Escape', () => {
      showHelp = false;
      showWelcome = false;
    });

    // Register tab shortcuts (instant)
    tabs.forEach(tab => {
      keyboard.register(tab.shortcut, () => handleTabChange(tab.id));
    });

    // Hide loading screen immediately - UI is now interactive!
    isInitialLoading = false;
    console.log('[App] Loading screen cleared, activeTab:', activeTab);

    // Everything else happens in background, non-blocking
    Promise.all([
      waitForBackend(),
      new Promise(resolve => {
        loadSessionId();
        resolve();
      })
    ]).then(() => {
      // Start uptime tracking
      updateUptime();
      uptimeInterval = setInterval(updateUptime, 1000);

      // Initialize WebSocket connection
      websocketService.connect();

      // Load data in background (non-blocking)
      Promise.all([
        dataService.preloadInitialData(),
        fetchTodayActivity()
      ]).catch(err => {
        logger.error('Background data loading error:', err);
      });

      // Listen for file changes to update today's activity
      websocketService.on('file-changed', () => {
        fetchTodayActivity();
      });

      // Start periodic health checks (every 60 seconds)
      checkServerHealth(); // Initial check
      healthCheckInterval = setInterval(checkServerHealth, 60000);

      // Check health on WebSocket reconnect
      // Store callback reference for cleanup
      reconnectCallback = () => {
        checkServerHealth();
        fetchTodayActivity();
      };
      websocketService.onReconnect(reconnectCallback);

      // NOW set up notification listeners (after loading screen is gone)
      // This prevents startup warnings from showing on the loading screen
      setupNotificationListeners();

      // Kick off background prefetch of common panels
      try { prefetchPanels(); } catch {
        // Ignore prefetch errors - panels will load on demand
      }

      // Show Quick Start Wizard for first-time users
      if (!localStorage.getItem('raven-quick-start-completed')) {
        showQuickStart = true;
      } else if (!localStorage.getItem('raven-welcome-seen')) {
        showWelcome = true;
      } else if (!localStorage.getItem('raven-visited')) {
        // Show notification for returning users who haven't seen the new UI
        setTimeout(() => {
          notifications.info('Welcome back! Press ? for keyboard shortcuts', {
            title: 'Welcome',
            duration: 5000
          });
          localStorage.setItem('raven-visited', 'true');
        }, 500);
      }
    }).catch(err => {
      logger.error('Initialization error:', err);
    });
  });

  onDestroy(() => {
    keyboard.clear();
    if (uptimeInterval) clearInterval(uptimeInterval);
    if (healthCheckInterval) clearInterval(healthCheckInterval);
    if (reconnectCallback) websocketService.offReconnect(reconnectCallback);
    websocketService.disconnect();
    dataService.destroy(); // Clean up dataService interval
  });
</script>

<ErrorBoundary>

<!-- Initial Loading Screen -->
{#if isInitialLoading}
  <AppLoadingScreen progress={loadingProgress} message={loadingMessage} />
{:else}

<!-- Skip Links for Keyboard Navigation -->
<div class="skip-links">
  <a href="#main-content" class="skip-link">Skip to main content</a>
  <a href="#main-navigation" class="skip-link">Skip to navigation</a>
  <a href="#theme-switcher" class="skip-link">Skip to theme switcher</a>
</div>

<!-- Authentication removed - app is always accessible -->
<main>
  <!-- COMPACT HEADER LAYOUT -->
  <header class="compact-header">
    <!-- Logo -->
    <button class="logo" on:click={() => handleTabChange('overview')} aria-label="Go to Overview">
      <RavenLogo size={16} />
      <span>Raven</span>
    </button>

    <!-- Main Navigation Tabs -->
    <nav class="main-tabs" aria-label="Main navigation">
      {#each tabs as tab (tab.id)}
        <button
          class="tab"
          class:active={activeTab === tab.id}
          on:click={() => handleTabChange(tab.id)}
          on:mouseenter={() => preloadByTab(tab.id)}
          aria-current={activeTab === tab.id ? 'page' : undefined}
          title="{tab.label} (Shortcut: {tab.shortcut})"
        >
          {tab.label}
        </button>
      {/each}
    </nav>

    <!-- Today's Activity Stats - Compact Pills -->
    <div class="today-stats" role="region" aria-label="Today's coding activity">
      <div class="stat-pill modified" role="status" aria-label="{todayStats.modified} files modified">
        {todayStats.modified} modified
      </div>
      <div class="stat-pill added" role="status" aria-label="{todayStats.added} files added">
        +{todayStats.added} added
      </div>
      <div class="stat-pill deleted" role="status" aria-label="{todayStats.deleted} files deleted">
        -{todayStats.deleted} deleted
      </div>
    </div>

    <!-- User Menu & Help -->
    <UserMenu on:openSettings={handleOpenSettings} />
    <button
      class="help-button"
      on:click={() => showHelp = !showHelp}
      aria-label="Show keyboard shortcuts"
      title="Keyboard Shortcuts"
    >
      ?
    </button>
  </header>

  <!-- Consolidated View Container -->
  <div id="main-content" class="view-container" role="main" tabindex="-1">
    {#if activeTab === 'overview'}
      <!-- Overview: Dashboard + Projects Comparison + Multi-Project Health -->
      <div class="tab-content">
        <div class="sub-navigation">
          <button
            class="sub-tab"
            class:active={!currentSubView}
            on:click={() => router.navigate(activeTab)}
          >
            Dashboard
          </button>
          <button
            class="sub-tab"
            class:active={currentSubView === 'projects'}
            on:click={() => router.navigate(activeTab, 'projects')}
          >
            Projects Comparison
          </button>
          <button
            class="sub-tab"
            class:active={currentSubView === 'health'}
            on:click={() => router.navigate(activeTab, 'health')}
          >
            Project Health
          </button>
        </div>
        {#if !currentSubView}
          <OverviewPanel {sessionId} {sessionUptime} />
        {:else if currentSubView === 'projects'}
          <ProjectsComparisonPanel />
        {:else if currentSubView === 'health'}
          <MultiProjectHealthPanel />
        {/if}
      </div>
    {:else if activeTab === 'safety'}
      <!-- Safety: Syntax Errors + Session Rollback + Pattern Warnings + Test Results -->
      <div class="tab-content">
        <div class="sub-navigation">
          <button
            class="sub-tab"
            class:active={!currentSubView}
            on:click={() => router.navigate(activeTab)}
          >
            🔍 Syntax Errors
          </button>
          <button
            class="sub-tab"
            class:active={currentSubView === 'rollback'}
            on:click={() => router.navigate(activeTab, 'rollback')}
          >
            ⏪ Session Rollback
          </button>
          <button
            class="sub-tab"
            class:active={currentSubView === 'patterns'}
            on:click={() => router.navigate(activeTab, 'patterns')}
          >
            ⚠️ Pattern Warnings
          </button>
          <button
            class="sub-tab"
            class:active={currentSubView === 'tests'}
            on:click={() => router.navigate(activeTab, 'tests')}
          >
            🧪 Raven Tests
          </button>
        </div>
        {#if !currentSubView}
          <SyntaxErrorPanel />
        {:else if currentSubView === 'rollback'}
          <SessionRollbackPanel />
        {:else if currentSubView === 'patterns'}
          <PatternWarningsPanel />
        {:else if currentSubView === 'tests'}
          <TestResultsPanel />
        {/if}
      </div>
    {:else if activeTab === 'agents'}
      <!-- Agents: AI agent monitoring + Conversations -->
      <div class="tab-content">
        <div class="sub-navigation">
          <button
            class="sub-tab"
            class:active={!currentSubView}
            on:click={() => router.navigate(activeTab)}
          >
            Agent Stats
          </button>
          <button
            class="sub-tab"
            class:active={currentSubView === 'conversations'}
            on:click={() => router.navigate(activeTab, 'conversations')}
          >
            Conversations
          </button>
        </div>
        {#if !currentSubView}
          {#await import('./lib/AgentsPanel.svelte') then M}
            <svelte:component this={M.default} />
          {:catch _}
            <div style="min-height:200px" role="status">Loading…</div>
          {/await}
        {:else if currentSubView === 'conversations'}
          {#await import('./lib/ConversationsPanel.svelte') then M}
            <svelte:component this={M.default} />
          {:catch _}
            <div style="min-height:200px" role="status">Loading…</div>
          {/await}
        {/if}
      </div>
    {:else if activeTab === 'activity'}
      <!-- Activity: Events + Files + Live Code + Global Search -->
      <div class="tab-content">
        <div class="sub-navigation">
          <button
            class="sub-tab"
            class:active={!currentSubView}
            on:click={() => router.navigate(activeTab)}
          >
            Code Changes
          </button>
          <button
            class="sub-tab"
            class:active={currentSubView === 'live'}
            on:click={() => router.navigate(activeTab, 'live')}
          >
            Live Feed
          </button>
          <button
            class="sub-tab"
            class:active={currentSubView === 'events'}
            on:click={() => router.navigate(activeTab, 'events')}
          >
            Event Log
          </button>
          <button
            class="sub-tab"
            class:active={currentSubView === 'activity'}
            on:click={() => router.navigate(activeTab, 'activity')}
          >
            Activity Log
          </button>
          <button
            class="sub-tab"
            class:active={currentSubView === 'files'}
            on:click={() => router.navigate(activeTab, 'files')}
          >
            File Browser
          </button>
          <button
            class="sub-tab"
            class:active={currentSubView === 'search'}
            on:click={() => router.navigate(activeTab, 'search')}
          >
            Global Search
          </button>
        </div>
        {#if !currentSubView}
          {#await import('./lib/LiveCodeFeed.svelte') then M}
            <svelte:component this={M.default} />
          {:catch _}
            <div style="min-height:240px" role="status">Loading…</div>
          {/await}
        {:else if currentSubView === 'live'}
          {#await import('./lib/LiveFeed.svelte') then M}
            <svelte:component this={M.default} />
          {:catch _}
            <div style="min-height:240px" role="status">Loading…</div>
          {/await}
        {:else if currentSubView === 'events'}
          {#await import('./lib/EventFeed.svelte') then M}
            <svelte:component this={M.default} />
          {:catch _}
            <div style="min-height:240px" role="status">Loading…</div>
          {/await}
        {:else if currentSubView === 'activity'}
          {#await import('./lib/ActivityLog.svelte') then M}
            <svelte:component this={M.default} />
          {:catch _}
            <div style="min-height:240px" role="status">Loading…</div>
          {/await}
        {:else if currentSubView === 'files'}
          {#await import('./lib/FileBrowser.svelte') then M}
            <svelte:component this={M.default} />
          {:catch _}
            <div style="min-height:240px" role="status">Loading…</div>
          {/await}
        {:else if currentSubView === 'search'}
          {#await import('./lib/GlobalSearchPanel.svelte') then M}
            <svelte:component this={M.default} />
          {:catch _}
            <div style="min-height:240px" role="status">Loading…</div>
          {/await}
        {/if}
      </div>
    {:else if activeTab === 'analysis'}
      <!-- Analysis: Performance + Triggers + Session Replay + Developer Insights + Historical Trends + Custom Metrics -->
      <div class="tab-content">
        <div class="sub-navigation">
          <button
            class="sub-tab"
            class:active={!currentSubView}
            on:click={() => router.navigate(activeTab)}
          >
            Performance
          </button>
          <button
            class="sub-tab"
            class:active={currentSubView === 'metrics'}
            on:click={() => router.navigate(activeTab, 'metrics')}
          >
            Custom Metrics
          </button>
          <button
            class="sub-tab"
            class:active={currentSubView === 'trends'}
            on:click={() => router.navigate(activeTab, 'trends')}
          >
            Historical Trends
          </button>
          <button
            class="sub-tab"
            class:active={currentSubView === 'triggers'}
            on:click={() => router.navigate(activeTab, 'triggers')}
          >
            Triggers
          </button>
          <button
            class="sub-tab"
            class:active={currentSubView === 'replay'}
            on:click={() => router.navigate(activeTab, 'replay')}
          >
            Session Replay
          </button>
          <button
            class="sub-tab"
            class:active={currentSubView === 'insights'}
            on:click={() => router.navigate(activeTab, 'insights')}
          >
            Developer Insights
          </button>
        </div>
        {#if !currentSubView}
          {#await import('./lib/PerformancePanel.svelte') then M}
            <svelte:component this={M.default} />
          {:catch _}
            <div style="min-height:240px" role="status">Loading…</div>
          {/await}
        {:else if currentSubView === 'metrics'}
          {#await import('./lib/CustomMetricsPanel.svelte') then M}
            <svelte:component this={M.default} />
          {:catch _}
            <div style="min-height:240px" role="status">Loading…</div>
          {/await}
        {:else if currentSubView === 'trends'}
          {#await import('./lib/HistoricalTrendsPanel.svelte') then M}
            <svelte:component this={M.default} />
          {:catch _}
            <div style="min-height:240px" role="status">Loading…</div>
          {/await}
        {:else if currentSubView === 'triggers'}
          {#await import('./lib/TriggersPanel.svelte') then M}
            <svelte:component this={M.default} />
          {:catch _}
            <div style="min-height:240px" role="status">Loading…</div>
          {/await}
        {:else if currentSubView === 'replay'}
          {#await import('./lib/SessionReplay.svelte') then M}
            <svelte:component this={M.default} />
          {:catch _}
            <div style="min-height:240px" role="status">Loading…</div>
          {/await}
        {:else if currentSubView === 'insights'}
          {#await import('./lib/DeveloperInsightsPanel.svelte') then M}
            <svelte:component this={M.default} />
          {:catch _}
            <div style="min-height:240px" role="status">Loading…</div>
          {/await}
        {/if}
      </div>
    {:else if activeTab === 'system'}
      <!-- System: Status + Storage + Notifications + Errors + API Health + Anomalies -->
      <div class="tab-content">
        <div class="sub-navigation">
          <button
            class="sub-tab"
            class:active={!currentSubView}
            on:click={() => router.navigate(activeTab)}
          >
            Status
          </button>
          <button
            class="sub-tab"
            class:active={currentSubView === 'anomalies'}
            on:click={() => router.navigate(activeTab, 'anomalies')}
          >
            Anomaly Alerts
          </button>
          <button
            class="sub-tab"
            class:active={currentSubView === 'storage'}
            on:click={() => router.navigate(activeTab, 'storage')}
          >
            Storage
          </button>
          <button
            class="sub-tab"
            class:active={currentSubView === 'projects'}
            on:click={() => router.navigate(activeTab, 'projects')}
          >
            Projects
          </button>
          <button
            class="sub-tab"
            class:active={currentSubView === 'sync'}
            on:click={() => router.navigate(activeTab, 'sync')}
          >
            Server Sync
          </button>
          <button
            class="sub-tab"
            class:active={currentSubView === 'notifications'}
            on:click={() => router.navigate(activeTab, 'notifications')}
          >
            Notifications
          </button>
          <button
            class="sub-tab"
            class:active={currentSubView === 'errors'}
            on:click={() => router.navigate(activeTab, 'errors')}
          >
            Errors
          </button>
          <button
            class="sub-tab"
            class:active={currentSubView === 'api'}
            on:click={() => router.navigate(activeTab, 'api')}
          >
            API Health
          </button>
        </div>
        {#if !currentSubView}
          {#await import('./lib/StatusPanel.svelte') then M}
            <svelte:component this={M.default} />
          {:catch _}
            <div style="min-height:200px" role="status">Loading…</div>
          {/await}
        {:else if currentSubView === 'anomalies'}
          {#await import('./lib/AnomalyAlertsPanel.svelte') then M}
            <svelte:component this={M.default} />
          {:catch _}
            <div style="min-height:200px" role="status">Loading…</div>
          {/await}
        {:else if currentSubView === 'storage'}
          {#await import('./lib/StoragePanel.svelte') then M}
            <svelte:component this={M.default} />
          {:catch _}
            <div style="min-height:200px" role="status">Loading…</div>
          {/await}
        {:else if currentSubView === 'projects'}
          {#await import('./lib/ProjectsConfigPanel.svelte') then M}
            <svelte:component this={M.default} />
          {:catch _}
            <div style="min-height:200px" role="status">Loading…</div>
          {/await}
        {:else if currentSubView === 'sync'}
          {#await import('./lib/ServerSyncPanel.svelte') then M}
            <svelte:component this={M.default} />
          {:catch _}
            <div style="min-height:200px" role="status">Loading…</div>
          {/await}
        {:else if currentSubView === 'notifications'}
          {#await import('./lib/NotificationsPanel.svelte') then M}
            <svelte:component this={M.default} />
          {:catch _}
            <div style="min-height:200px" role="status">Loading…</div>
          {/await}
        {:else if currentSubView === 'errors'}
          {#await import('./lib/ErrorLog.svelte') then M}
            <svelte:component this={M.default} />
          {:catch _}
            <div style="min-height:200px" role="status">Loading…</div>
          {/await}
        {:else if currentSubView === 'api'}
          {#await import('./lib/APIHealthMonitor.svelte') then M}
            <svelte:component this={M.default} />
          {:catch _}
            <div style="min-height:200px" role="status">Loading…</div>
          {/await}
        {/if}
      </div>
    {:else if activeTab === 'settings'}
      <!-- Settings Page -->
      {#await import('./lib/SettingsPanel.svelte') then M}
        <svelte:component this={M.default} />
      {:catch _}
        <div style="min-height:200px" role="status">Loading…</div>
      {/await}
    {:else if activeTab === 'about'}
      <!-- About Page -->
      {#await import('./lib/AboutPage.svelte') then M}
        <svelte:component this={M.default} on:close={() => router.navigate('overview')} />
      {:catch}
        <div style="min-height:200px" role="status">Loading…</div>
      {/await}
    {:else if activeTab === 'changelog'}
      <!-- Changelog Page -->
      {#await import('./lib/ChangelogPage.svelte') then M}
        <svelte:component this={M.default} on:close={() => router.navigate('overview')} />
      {:catch}
        <div style="min-height:200px" role="status">Loading…</div>
      {/await}
    {:else if activeTab === 'docs'}
      <!-- Docs Page -->
      {#await import('./lib/DocsViewer.svelte') then M}
        <svelte:component this={M.default} on:close={() => router.navigate('overview')} />
      {:catch}
        <div style="min-height:200px" role="status">Loading…</div>
      {/await}
    {:else}
      <!-- Fallback: Unknown tab or initialization issue -->
      <div class="empty-state" style="padding: 40px; text-align: center; color: var(--muted);">
        <div style="font-size: 48px; margin-bottom: 16px;">🤔</div>
        <h3 style="color: var(--text); margin-bottom: 12px;">Page Not Found</h3>
        <p style="margin-bottom: 24px;">The requested page doesn't exist or failed to load.</p>
        <button
          class="btn-primary"
          on:click={() => router.navigate('overview')}
          style="padding: 8px 16px; background: var(--accent); color: white; border: none; border-radius: 4px; cursor: pointer;"
        >
          Go to Overview
        </button>
        <p style="margin-top: 16px; font-size: 11px;">
          Current tab: <code style="background: var(--surface); padding: 2px 6px; border-radius: 3px;">{activeTab}</code>
        </p>
      </div>
    {/if}
  </div></main>

<!-- Toast Notifications (hidden during loading) -->
{#if !isInitialLoading}
  <Toast onErrorClick={handleErrorClick} />
{/if}

<!-- Quick Start Wizard for New Users -->
{#if showQuickStart}
  <QuickStartWizard
    on:complete={(_e) => {
      showQuickStart = false;
      notifications.success('Welcome to Raven! You\'re all set up and protected.');
    }}
    on:skip={() => {
      showQuickStart = false;
      notifications.info('You can run setup anytime from Settings');
    }}
  />
{/if}

<!-- Welcome Screen for First-Time Users -->
{#if showWelcome}
  <WelcomeScreen on:close={() => showWelcome = false} />
{/if}

<!-- Keyboard Shortcuts Help Modal -->
{#if showHelp}
  <KeyboardShortcuts visible={true} onClose={() => showHelp = false} />
{/if}

<Footer
  theme={theme}
  sessionId={sessionId}
  onThemeChange={switchTheme}
  onSessionClick={() => router.navigate('system')}
  onAboutClick={() => router.navigate('about')}
  onChangelogClick={() => router.navigate('changelog')}
  onDocsClick={() => router.navigate('docs')}
/>

{/if}
<!-- End of isInitialLoading conditional -->

</ErrorBoundary>

<style>
  main {
    padding: 0;
    width: 100%;
    max-width: 100vw;
    margin: 0;
    min-height: 100vh;
    background: var(--bg);
    overflow-x: hidden;
  }

  /* ========== COMPACT HEADER - Ultra-Dense Layout ========== */
  header.compact-header {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 6px 12px;
    display: flex;
    align-items: center;
    gap: 16px;
    height: 38px;
    position: sticky;
    top: 0;
    z-index: 1000;
  }

  /* Logo - compact */
  .logo {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
    color: var(--accent);
    font-size: 14px;
    font-family: var(--sans);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    transition: opacity 0.15s;
  }

  .logo:hover {
    opacity: 0.8;
  }

  /* Main tabs - more compact */
  .main-tabs {
    display: flex;
    gap: 4px;
    flex: 1;
  }

  .main-tabs .tab {
    background: none;
    border: none;
    color: var(--muted);
    padding: 4px 10px;
    cursor: pointer;
    border-radius: 4px;
    font-size: 12px;
    font-family: var(--sans);
    font-weight: 500;
    transition: all 0.15s;
  }

  .main-tabs .tab:hover {
    background: var(--surface-2);
    color: var(--text);
  }

  .main-tabs .tab.active {
    background: var(--accent);
    color: white;
    font-weight: 600;
  }

  /* Today stats - inline pills */
  .today-stats {
    display: flex;
    gap: 8px;
    font-size: 11px;
    padding: 0 12px;
    border-left: 1px solid var(--border);
    font-family: var(--mono);
  }

  .stat-pill {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 2px 8px;
    background: var(--surface-2);
    border-radius: 3px;
    font-weight: 500;
  }

  .stat-pill.modified { color: var(--info); }
  .stat-pill.added { color: var(--success); }
  .stat-pill.deleted { color: var(--error); }

  /* Help button - compact */
  .help-button {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--muted);
    font-family: var(--sans);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .help-button:hover {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }

  .help-button:active {
    transform: scale(0.95);
  }

  .help-button:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .tab-icon {
    font-size: 14px;
    line-height: 1;
  }

  .tab-label {
    font-weight: 600;
    font-size: 12px;
  }

  .tab-shortcut {
    position: absolute;
    top: 2px;
    right: 2px;
    font-size: 11px;
    padding: 1px 3px;
    background: var(--bg);
    border-radius: 2px;
    opacity: 0.4;
    line-height: 1;
  }

  .nav-tab:hover .tab-shortcut {
    opacity: 0.6;
  }

  .nav-tab.active .tab-shortcut {
    background: rgba(255, 255, 255, 0.2);
    opacity: 0.7;
  }

  .view-container {
    padding: 0;
    max-width: 100%;
    margin: 0;
    min-height: calc(100vh - 100px);
    padding-bottom: 60px; /* Space for fixed footer */
  }

  .tab-content {
    width: 100%;
    animation: fadeIn var(--duration-base) var(--ease-smooth);
  }

  /* Sub-navigation - compact */
  .sub-navigation {
    display: flex;
    gap: 6px;
    padding: 4px 12px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    flex-wrap: nowrap;
    overflow-x: auto;
    height: 32px;
    align-items: center;
  }

  .sub-tab {
    padding: 3px 10px;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    border-radius: 0;
    color: var(--muted);
    font-family: var(--sans);
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }

  .sub-tab:hover {
    background: var(--surface-2);
    color: var(--text);
    border-radius: 3px;
  }

  .sub-tab.active {
    background: none;
    color: var(--accent);
    border-bottom-color: var(--accent);
    font-weight: 600;
  }

  .sub-tab:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: 3px;
  }

  /* Focus indicators for accessibility */
  *:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  /* (removed unused auth-loading/spinner styles) */

  @media (max-width: 768px) {
    header.compact-header {
      padding: 4px 8px;
      gap: 8px;
    }

    .logo span {
      display: none;
    }

    .main-tabs {
      overflow-x: auto;
      gap: 2px;
    }

    .main-tabs .tab {
      padding: 4px 8px;
      font-size: 11px;
    }

    .today-stats {
      display: none;
    }

    .help-button {
      width: 20px;
      height: 20px;
      font-size: 11px;
    }

    .sub-navigation {
      padding: 4px 8px;
      overflow-x: auto;
    }

    .sub-tab {
      font-size: 11px;
      padding: 3px 8px;
    }
  }

  /* (removed unused settings modal styles) */
</style>
