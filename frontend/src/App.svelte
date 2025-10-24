<script>
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  // New consolidated components
  import ErrorBoundary from './lib/ErrorBoundary.svelte';
  import OverviewPanel from './lib/OverviewPanel.svelte';
  import ToastContainer from './lib/ToastContainer.svelte';
  import LoadingSkeleton from './lib/LoadingSkeleton.svelte';
  import ConfirmDialog from './lib/ConfirmDialog.svelte';
  import WelcomeScreen from './lib/WelcomeScreen.svelte';

  // Existing components for consolidated views
  import Dashboard from './lib/Dashboard.svelte';
  import SessionReplay from './lib/SessionReplay.svelte';
  import PerformancePanel from './lib/PerformancePanel.svelte';
  import TriggersPanel from './lib/TriggersPanel.svelte';
  import AgentsPanel from './lib/AgentsPanel.svelte';
  import StatusPanel from './lib/StatusPanel.svelte';
  import APIHealthMonitor from './lib/APIHealthMonitor.svelte';
  import LiveCodeFeed from './lib/LiveCodeFeed.svelte';
  import ActivityLog from './lib/ActivityLog.svelte';
  import EventFeed from './lib/EventFeed.svelte';
  import Footer from './lib/Footer.svelte';
  import AboutPage from './lib/AboutPage.svelte';
  import ChangelogPage from './lib/ChangelogPage.svelte';
  import DocsViewer from './lib/DocsViewer.svelte';
  import RavenLogo from './lib/RavenLogo.svelte';
  import ErrorLog from './lib/ErrorLog.svelte';
  import NotificationsPanel from './lib/NotificationsPanel.svelte';
  import StoragePanel from './lib/StoragePanel.svelte';
  import ServerSyncPanel from './lib/ServerSyncPanel.svelte';
  import SettingsPanel from './lib/SettingsPanel.svelte';
  import KeyboardShortcuts from './lib/KeyboardShortcuts.svelte';
  import { keyboard } from './lib/keyboardService.js';
  import { setupGlobalErrorHandler } from './lib/errorLogger.js';
  import { toasts } from './lib/toastStore.js';
  import { notifications } from './lib/notificationService.js';
  import { setupNotificationListeners } from './lib/notificationListener.js';
  import { websocketService } from './lib/websocket.js';
  import { checkServerHealth } from './lib/apiClient.js';

  const API_BASE = 'http://localhost:3030/api';

  // Main navigation tabs
  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📊', shortcut: '1' },
    { id: 'agents', label: 'Agents', icon: '🤖', shortcut: '2' },
    { id: 'activity', label: 'Activity', icon: '⚡️', shortcut: '3' },
    { id: 'analysis', label: 'Analysis', icon: '📈', shortcut: '4' },
    { id: 'system', label: 'System', icon: '⚙️', shortcut: '5' }
  ];

  let sessionId = 'Loading...';
  let sessionUptime = '0s';
  let activeTab = 'overview'; // New consolidated tabs: overview, agents, activity, analysis, system, about, changelog, docs
  let currentSubView = ''; // For sub-views within tabs
  let theme = 'theme--night'; // Default theme: Day (Gruvbox), Dusk (Ristretto), Night (Tokyo Night)
  let showHelp = false;
  let showWelcome = false;

  const startTime = Date.now();
  let uptimeInterval;
  let healthCheckInterval;

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
      console.error('Failed to load session ID:', error);
    }
  }


  function handleTabChange(newTab) {
    activeTab = newTab;
    currentSubView = '';
    localStorage.setItem('raven-active-tab', newTab);
    notifications.info(`Switched to ${newTab} view`);
  }

  function switchTheme(newTheme) {
    theme = newTheme;
    document.body.className = theme;
    localStorage.setItem('raven-theme', theme);
    notifications.success(`Theme changed to ${newTheme.replace('theme--', '')}`);
  }

  onMount(() => {
    loadSessionId();

    // Start uptime tracking
    updateUptime();
    uptimeInterval = setInterval(updateUptime, 1000);

    // Load saved theme from localStorage
    theme = localStorage.getItem('raven-theme') || 'theme--night';
    document.body.className = theme;

    // Load saved tab from localStorage
    activeTab = localStorage.getItem('raven-active-tab') || 'overview';

    // Setup global error handler
    setupGlobalErrorHandler();

    // Initialize WebSocket connection and notification listeners
    websocketService.connect();
    setupNotificationListeners();

    // Start periodic health checks (every 60 seconds)
    checkServerHealth(); // Initial check
    healthCheckInterval = setInterval(checkServerHealth, 60000);

    // Check health on WebSocket reconnect
    websocketService.onReconnect(() => {
      checkServerHealth();
    });

    // Register help shortcut
    keyboard.register('?', () => showHelp = !showHelp);
    keyboard.register('Escape', () => {
      showHelp = false;
      showWelcome = false;
    });

    // Register tab shortcuts (1-5)
    tabs.forEach(tab => {
      keyboard.register(tab.shortcut, () => handleTabChange(tab.id));
    });

    // Show welcome screen for first-time users
    if (!localStorage.getItem('raven-welcome-seen')) {
      showWelcome = true;
    } else if (!localStorage.getItem('raven-visited')) {
      // Show notification for returning users who haven't seen the new UI
      setTimeout(() => {
        notifications.info('Welcome back! Press ? for keyboard shortcuts', {
          title: 'Welcome',
          duration: 5000
        });
        localStorage.setItem('raven-visited', 'true');
      }, 1000);
    }
  });

  onDestroy(() => {
    keyboard.clear();
    if (uptimeInterval) clearInterval(uptimeInterval);
    if (healthCheckInterval) clearInterval(healthCheckInterval);
    websocketService.disconnect();
  });
</script>

<ErrorBoundary>
<main>
  <header role="banner">
    <div class="header-content">
      <div class="header-left">
        <RavenLogo size={32} />
        <h1>Raven</h1>
      </div>

      <nav class="header-nav" role="navigation" aria-label="Main navigation">
        {#each tabs as tab}
          <button
            class="nav-tab"
            class:active={activeTab === tab.id}
            on:click={() => handleTabChange(tab.id)}
            aria-current={activeTab === tab.id ? 'page' : undefined}
            aria-label="{tab.label} - Press {tab.shortcut} for shortcut"
          >
            <span class="tab-icon">{tab.icon}</span>
            <span class="tab-label">{tab.label}</span>
            <span class="tab-shortcut">{tab.shortcut}</span>
          </button>
        {/each}
      </nav>

      <div class="header-right">
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
  <div class="view-container" role="main">
    {#if activeTab === 'overview'}
      <!-- Overview: Dashboard + Metrics + Git Status -->
      <OverviewPanel {sessionId} {sessionUptime} />
    {:else if activeTab === 'agents'}
      <!-- Agents: AI agent monitoring -->
      <AgentsPanel />
    {:else if activeTab === 'activity'}
      <!-- Activity: Events + Files + Live Code -->
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
        </div>
        {#if !currentSubView}
          <LiveCodeFeed />
        {:else if currentSubView === 'events'}
          <EventFeed />
        {:else if currentSubView === 'activity'}
          <ActivityLog />
        {/if}
      </div>
    {:else if activeTab === 'analysis'}
      <!-- Analysis: Performance + Triggers + Session Replay -->
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
        </div>
        {#if !currentSubView}
          <PerformancePanel />
        {:else if currentSubView === 'triggers'}
          <TriggersPanel />
        {:else if currentSubView === 'replay'}
          <SessionReplay />
        {/if}
      </div>
    {:else if activeTab === 'system'}
      <!-- System: Status + Storage + Notifications + Errors + API Health -->
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
            class:active={currentSubView === 'storage'}
            on:click={() => currentSubView = 'storage'}
          >
            Storage
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
          <button
            class="sub-tab"
            class:active={currentSubView === 'settings'}
            on:click={() => currentSubView = 'settings'}
          >
            Settings
          </button>
        </div>
        {#if !currentSubView}
          <StatusPanel />
        {:else if currentSubView === 'storage'}
          <StoragePanel />
        {:else if currentSubView === 'sync'}
          <ServerSyncPanel />
        {:else if currentSubView === 'notifications'}
          <NotificationsPanel />
        {:else if currentSubView === 'errors'}
          <ErrorLog />
        {:else if currentSubView === 'api'}
          <APIHealthMonitor />
        {:else if currentSubView === 'settings'}
          <SettingsPanel />
        {/if}
      </div>
    {:else if activeTab === 'about'}
      <!-- About Page -->
      <AboutPage on:close={() => activeTab = 'overview'} />
    {:else if activeTab === 'changelog'}
      <!-- Changelog Page -->
      <ChangelogPage on:close={() => activeTab = 'overview'} />
    {:else if activeTab === 'docs'}
      <!-- Docs Page -->
      <DocsViewer on:close={() => activeTab = 'overview'} />
    {/if}
  </div></main>

<!-- Toast Notifications -->
<ToastContainer />

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
    padding: 12px 24px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
    position: sticky;
    top: 0;
    z-index: 1000;
  }

  .header-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  h1 {
    font-family: var(--mono);
    font-size: 18px;
    font-weight: 600;
    margin: 0;
    background: linear-gradient(135deg, var(--accent) 0%, var(--accent-2, var(--accent)) 100%);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .help-button {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text);
    font-family: var(--mono);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .help-button:hover {
    background: var(--accent);
    color: white;
    transform: scale(1.1);
  }

  .help-button:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  /* Inline Navigation Tabs */
  .header-nav {
    display: flex;
    gap: 4px;
    align-items: center;
    flex: 1;
    justify-content: center;
    max-width: 600px;
  }

  .nav-tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
    color: var(--muted);
    font-family: var(--mono);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    position: relative;
    white-space: nowrap;
  }

  .nav-tab:hover {
    background: var(--surface-2);
    color: var(--text);
    transform: translateY(-1px);
  }

  .nav-tab:focus {
    outline: none;
    box-shadow: 0 0 0 2px var(--accent);
  }

  .nav-tab.active {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }

  .nav-tab.active:hover {
    background: var(--accent-2, var(--accent));
    transform: none;
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
    min-height: calc(100vh - 64px);
    padding-bottom: 60px; /* Space for fixed footer */
  }

  .tab-content {
    width: 100%;
  }

  .sub-navigation {
    display: flex;
    gap: 8px;
    padding: 16px 24px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }

  .sub-tab {
    padding: 8px 16px;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--muted);
    font-family: var(--mono);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .sub-tab:hover {
    background: var(--surface-2);
    color: var(--text);
  }

  .sub-tab.active {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }

  .sub-tab:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  /* Focus indicators for accessibility */
  *:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  button:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  /* Smooth transitions for alive feeling */
  * {
    transition: color 0.2s ease, background 0.2s ease, border-color 0.2s ease;
  }

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
</style>
