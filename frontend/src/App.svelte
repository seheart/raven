<script>
  import { onMount, onDestroy } from 'svelte';
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
  import BreakAlert from './lib/BreakAlert.svelte';
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
    } catch (_) {}
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
  let activeTab = 'overview'; // New consolidated tabs: overview, agents, activity, analysis, system, about, changelog, docs
  let currentSubView = ''; // For sub-views within tabs
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
    activeTab = newTab;
    currentSubView = '';
    localStorage.setItem('raven-active-tab', newTab);
  }

  function handleOpenSettings() {
    activeTab = 'settings';
    currentSubView = '';
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
    activeTab = 'system';
    currentSubView = 'errors'; // Navigate to Error Log specifically

    // Log for debugging
    logger.info('Navigating to Error Log from notification:', notification.message);

    // Store the notification message to highlight in error log
    sessionStorage.setItem('highlightError', notification.message);
  }

  // Helper function to wait for backend to be ready
  async function waitForBackend() {
    const maxRetries = 30; // 30 seconds max
    const retryDelay = 1000; // 1 second between retries

    for (let i = 0; i < maxRetries; i++) {
      try {
        loadingMessage = `Connecting to backend server... (${i + 1}/${maxRetries})`;
        const response = await fetch(API_CONFIG.ENDPOINTS.HEALTH, {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
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
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }

    // Backend didn't come up in time
    loadingMessage = 'Backend server unavailable - please check if it\'s running';
    return false;
  }

  onMount(async () => {
    // Start loading sequence with progress updates
    loadingMessage = 'Loading configuration...';
    loadingProgress = 10;

    // Load saved theme from localStorage
    theme = localStorage.getItem('raven-theme') || 'theme--night';
    document.body.className = theme;

    // Always start at Overview tab on fresh load
    activeTab = 'overview';

    loadingMessage = 'Connecting to server...';
    loadingProgress = 20;

    // Wait for backend to be ready before proceeding
    const backendReady = await waitForBackend();
    if (!backendReady) {
      // Backend not available - stay on loading screen with error
      loadingProgress = 0;
      isInitialLoading = true; // Keep loading screen visible
      return;
    }

    loadingProgress = 30;

    // Load session ID
    loadSessionId();

    // Start uptime tracking
    updateUptime();
    uptimeInterval = setInterval(updateUptime, 1000);

    loadingMessage = 'Initializing services...';
    loadingProgress = 40;

    // Setup global error handler
    setupGlobalErrorHandler();

    loadingMessage = 'Establishing WebSocket connection...';
    loadingProgress = 50;

    // Initialize WebSocket connection (but don't set up notification listeners yet)
    websocketService.connect();

    loadingMessage = 'Preloading dashboard data...';
    loadingProgress = 60;

    // Preload all initial data - this prevents duplicate API calls
    const dataLoaded = await dataService.preloadInitialData();

    if (dataLoaded) {
      loadingProgress = 85;
      loadingMessage = 'Finalizing...';
    } else {
      loadingProgress = 75;
      loadingMessage = 'Loading completed with some errors...';
    }

    // Fetch today's activity stats
    await fetchTodayActivity();

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

    loadingProgress = 95;

    // Register keyboard shortcuts
    keyboard.register('?', () => showHelp = !showHelp);
    keyboard.register('Escape', () => {
      showHelp = false;
      showWelcome = false;
    });

    // Register tab shortcuts (1-5)
    tabs.forEach(tab => {
      keyboard.register(tab.shortcut, () => handleTabChange(tab.id));
    });

    loadingProgress = 100;
    loadingMessage = 'Ready!';

    // Small delay to show 100% completion
    await new Promise(resolve => setTimeout(resolve, 300));

    // Hide loading screen
    isInitialLoading = false;

    // NOW set up notification listeners (after loading screen is gone)
    // This prevents startup warnings from showing on the loading screen
    setupNotificationListeners();

    // Kick off background prefetch of common panels
    try { prefetchPanels(); } catch (_) {}

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
  <header>
    <div class="header-content">
      <button class="header-left header-home-button" on:click={() => handleTabChange('overview')} aria-label="Go to Overview">
        <RavenLogo size={32} />
        <h1>Raven</h1>
      </button>

      <nav id="main-navigation" class="header-nav" aria-label="Main navigation">
        {#each tabs as tab (tab.id)}
          <button
            class="nav-tab"
            class:active={activeTab === tab.id}
            on:click={() => handleTabChange(tab.id)}
            on:mouseenter={() => preloadByTab(tab.id)}
            aria-current={activeTab === tab.id ? 'page' : undefined}
            aria-label="{tab.label} - Press {tab.shortcut} for shortcut"
          >
            <span class="tab-icon" aria-hidden="true">{tab.icon}</span>
            <span class="tab-label">{tab.label}</span>
            <span class="tab-shortcut" aria-label="Shortcut key {tab.shortcut}">{tab.shortcut}</span>
          </button>
        {/each}
      </nav>

      <div id="theme-switcher" class="header-right">
        <!-- Today's Activity -->
        <div class="today-activity-header" role="region" aria-label="Today's coding activity">
          <span class="activity-title">TODAY:</span>
          <div class="activity-stat" role="status" aria-label="{todayStats.modified} files modified today">
            <span class="stat-value">{todayStats.modified}</span>
            <span class="stat-label">modified</span>
          </div>
          <div class="activity-divider" aria-hidden="true">|</div>
          <div class="activity-stat" role="status" aria-label="{todayStats.added} files added today">
            <span class="stat-value">+{todayStats.added}</span>
            <span class="stat-label">added</span>
          </div>
          <div class="activity-divider" aria-hidden="true">|</div>
          <div class="activity-stat" role="status" aria-label="{todayStats.deleted} files deleted today">
            <span class="stat-value">-{todayStats.deleted}</span>
            <span class="stat-label">deleted</span>
          </div>
        </div>
        <UserMenu on:openSettings={handleOpenSettings} />
        <button
          class="help-button"
          on:click={() => showHelp = !showHelp}
          aria-label="Show keyboard shortcuts"
        >
          ?
        </button>
      </div>
    </div>
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
            on:click={() => currentSubView = ''}
          >
            Dashboard
          </button>
          <button
            class="sub-tab"
            class:active={currentSubView === 'projects'}
            on:click={() => currentSubView = 'projects'}
          >
            Projects Comparison
          </button>
          <button
            class="sub-tab"
            class:active={currentSubView === 'health'}
            on:click={() => currentSubView = 'health'}
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
            on:click={() => currentSubView = ''}
          >
            🔍 Syntax Errors
          </button>
          <button
            class="sub-tab"
            class:active={currentSubView === 'rollback'}
            on:click={() => currentSubView = 'rollback'}
          >
            ⏪ Session Rollback
          </button>
          <button
            class="sub-tab"
            class:active={currentSubView === 'patterns'}
            on:click={() => currentSubView = 'patterns'}
          >
            ⚠️ Pattern Warnings
          </button>
          <button
            class="sub-tab"
            class:active={currentSubView === 'tests'}
            on:click={() => currentSubView = 'tests'}
          >
            🩺 Self-Diagnosis
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
            on:click={() => currentSubView = ''}
          >
            Agent Stats
          </button>
          <button
            class="sub-tab"
            class:active={currentSubView === 'conversations'}
            on:click={() => currentSubView = 'conversations'}
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
            on:click={() => currentSubView = ''}
          >
            Live Feed
          </button>
          <button
            class="sub-tab"
            class:active={currentSubView === 'events'}
            on:click={() => currentSubView = 'events'}
          >
            Event Log
          </button>
          <button
            class="sub-tab"
            class:active={currentSubView === 'activity'}
            on:click={() => currentSubView = 'activity'}
          >
            Activity Log
          </button>
          <button
            class="sub-tab"
            class:active={currentSubView === 'files'}
            on:click={() => currentSubView = 'files'}
          >
            File Browser
          </button>
          <button
            class="sub-tab"
            class:active={currentSubView === 'search'}
            on:click={() => currentSubView = 'search'}
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
            on:click={() => currentSubView = ''}
          >
            Performance
          </button>
          <button
            class="sub-tab"
            class:active={currentSubView === 'metrics'}
            on:click={() => currentSubView = 'metrics'}
          >
            Custom Metrics
          </button>
          <button
            class="sub-tab"
            class:active={currentSubView === 'trends'}
            on:click={() => currentSubView = 'trends'}
          >
            Historical Trends
          </button>
          <button
            class="sub-tab"
            class:active={currentSubView === 'triggers'}
            on:click={() => currentSubView = 'triggers'}
          >
            Triggers
          </button>
          <button
            class="sub-tab"
            class:active={currentSubView === 'replay'}
            on:click={() => currentSubView = 'replay'}
          >
            Session Replay
          </button>
          <button
            class="sub-tab"
            class:active={currentSubView === 'insights'}
            on:click={() => currentSubView = 'insights'}
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
            on:click={() => currentSubView = ''}
          >
            Status
          </button>
          <button
            class="sub-tab"
            class:active={currentSubView === 'anomalies'}
            on:click={() => currentSubView = 'anomalies'}
          >
            Anomaly Alerts
          </button>
          <button
            class="sub-tab"
            class:active={currentSubView === 'storage'}
            on:click={() => currentSubView = 'storage'}
          >
            Storage
          </button>
          <button
            class="sub-tab"
            class:active={currentSubView === 'projects'}
            on:click={() => currentSubView = 'projects'}
          >
            Projects
          </button>
          <button
            class="sub-tab"
            class:active={currentSubView === 'sync'}
            on:click={() => currentSubView = 'sync'}
          >
            Server Sync
          </button>
          <button
            class="sub-tab"
            class:active={currentSubView === 'notifications'}
            on:click={() => currentSubView = 'notifications'}
          >
            Notifications
          </button>
          <button
            class="sub-tab"
            class:active={currentSubView === 'errors'}
            on:click={() => currentSubView = 'errors'}
          >
            Errors
          </button>
          <button
            class="sub-tab"
            class:active={currentSubView === 'api'}
            on:click={() => currentSubView = 'api'}
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
        <svelte:component this={M.default} on:close={() => activeTab = 'overview'} />
      {:catch _}
        <div style="min-height:200px" role="status">Loading…</div>
      {/await}
    {:else if activeTab === 'changelog'}
      <!-- Changelog Page -->
      {#await import('./lib/ChangelogPage.svelte') then M}
        <svelte:component this={M.default} on:close={() => activeTab = 'overview'} />
      {:catch _}
        <div style="min-height:200px" role="status">Loading…</div>
      {/await}
    {:else if activeTab === 'docs'}
      <!-- Docs Page -->
      {#await import('./lib/DocsViewer.svelte') then M}
        <svelte:component this={M.default} on:close={() => activeTab = 'overview'} />
      {:catch _}
        <div style="min-height:200px" role="status">Loading…</div>
      {/await}
    {/if}
  </div></main>

<!-- Toast Notifications (hidden during loading) -->
{#if !isInitialLoading}
  <Toast onErrorClick={handleErrorClick} />

  <!-- Break Recommendation Alert -->
  <BreakAlert />
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
  onThemeChange={switchTheme}
  onAboutClick={() => activeTab = 'about'}
  onChangelogClick={() => activeTab = 'changelog'}
  onDocsClick={() => activeTab = 'docs'}
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

  header {
    padding: var(--space-lg) var(--space-2xl);
    border-bottom: 1px solid var(--border);
    background: var(--surface);
    position: sticky;
    top: 0;
    z-index: 1000;
    box-shadow: var(--shadow-sm);
  }

  .header-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    gap: var(--space-lg);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  .header-home-button {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    transition: opacity 0.2s ease, transform 0.2s ease;
  }

  .header-home-button:hover {
    opacity: 0.8;
    transform: scale(1.02);
  }

  .header-home-button:active {
    transform: scale(0.98);
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  h1 {
    font-family: var(--sans);
    font-size: var(--text-xl);
    font-weight: var(--weight-bold);
    margin: 0;
    background: linear-gradient(135deg, var(--accent) 0%, var(--accent-2, var(--accent)) 100%);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  /* (removed unused theme switcher styles) */

  /* Today's Activity in Header */
  .today-activity-header {
    display: flex;
    align-items: baseline;
    gap: 12px;
    padding: 6px 16px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font-family: var(--mono);
  }

  .activity-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--accent);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    line-height: 1;
  }

  .activity-stat {
    display: flex;
    align-items: baseline;
    gap: 4px;
  }

  .activity-stat .stat-value {
    font-size: 14px;
    font-weight: 700;
    color: var(--text);
  }

  .activity-stat .stat-label {
    font-size: 11px;
    color: var(--muted);
    font-weight: 500;
  }

  .activity-divider {
    color: var(--muted);
    font-size: 12px;
  }

  .help-button {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text);
    font-family: var(--sans);
    font-size: var(--text-base);
    font-weight: var(--weight-semibold);
    cursor: pointer;
    transition: all var(--duration-fast) var(--ease-out-expo);
  }

  .help-button:hover {
    background: var(--accent);
    color: white;
    transform: scale(1.1);
    box-shadow: var(--shadow-md);
  }

  .help-button:active {
    transform: scale(0.95);
  }

  .help-button:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  /* Inline Navigation Tabs */
  .header-nav {
    display: flex;
    gap: var(--space-xs);
    align-items: center;
    flex: 1;
    justify-content: center;
    max-width: 700px;
  }

  .nav-tab {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius);
    color: var(--muted);
    font-family: var(--sans);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    cursor: pointer;
    transition: all var(--duration-fast) var(--ease-out-expo);
    position: relative;
    white-space: nowrap;
  }

  .nav-tab:hover {
    background: var(--surface-2);
    color: var(--text);
    transform: translateY(-2px);
    box-shadow: var(--shadow-sm);
  }

  .nav-tab:active {
    transform: translateY(0);
  }

  .nav-tab:focus {
    outline: none;
    box-shadow: 0 0 0 2px var(--accent);
  }

  .nav-tab.active {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
    box-shadow: var(--shadow-md);
  }

  .nav-tab.active:hover {
    background: var(--accent-2, var(--accent));
    transform: translateY(-1px);
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
    font-size: 9px;
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

  .sub-navigation {
    display: flex;
    gap: var(--space-sm);
    padding: var(--space-lg) var(--space-2xl);
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    flex-wrap: wrap;
  }

  .sub-tab {
    padding: var(--space-sm) var(--space-md);
    background: transparent;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--muted);
    font-family: var(--sans);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    cursor: pointer;
    transition: all var(--duration-fast) var(--ease-out-expo);
  }

  .sub-tab:hover {
    background: var(--surface-2);
    color: var(--text);
    transform: translateY(-1px);
    box-shadow: var(--shadow-sm);
  }

  .sub-tab:active {
    transform: translateY(0);
  }

  .sub-tab.active {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
    box-shadow: var(--shadow-sm);
  }

  .sub-tab:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
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
    header {
      padding: 8px 12px;
    }

    h1 {
      font-size: 14px;
    }

    .header-nav {
      gap: 2px;
      overflow-x: auto;
      max-width: none;
    }

    .nav-tab {
      padding: 6px 10px;
      gap: 4px;
    }

    .tab-label {
      display: none;
    }

    .tab-icon {
      font-size: 16px;
    }

    .tab-shortcut {
      display: none;
    }

    .help-button {
      width: 28px;
      height: 28px;
      font-size: 12px;
    }

    .sub-navigation {
      padding: 12px 16px;
      overflow-x: auto;
    }

    .sub-tab {
      white-space: nowrap;
    }
  }

  /* (removed unused settings modal styles) */
</style>
