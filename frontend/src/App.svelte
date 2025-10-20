<script>
  import { onMount, onDestroy } from 'svelte';
  // New consolidated components
  import TabNavigation from './lib/TabNavigation.svelte';
  import OverviewPanel from './lib/OverviewPanel.svelte';
  import ToastContainer from './lib/ToastContainer.svelte';
  import LoadingSkeleton from './lib/LoadingSkeleton.svelte';
  import ConfirmDialog from './lib/ConfirmDialog.svelte';
  import WelcomeScreen from './lib/WelcomeScreen.svelte';

  // Existing components for consolidated views
  import Dashboard from './lib/Dashboard.svelte';
  import GitPanel from './lib/GitPanel.svelte';
  import SessionReplay from './lib/SessionReplay.svelte';
  import PerformancePanel from './lib/PerformancePanel.svelte';
  import TriggersPanel from './lib/TriggersPanel.svelte';
  import AgentsPanel from './lib/AgentsPanel.svelte';
  import StatusPanel from './lib/StatusPanel.svelte';
  import APIHealthMonitor from './lib/APIHealthMonitor.svelte';
  import LiveCodeFeed from './lib/LiveCodeFeed.svelte';
  import ActivityLog from './lib/ActivityLog.svelte';
  import EventFeed from './lib/EventFeed.svelte';
  import FileBrowser from './lib/FileBrowser.svelte';
  import Footer from './lib/Footer.svelte';
  import AboutPage from './lib/AboutPage.svelte';
  import ChangelogPage from './lib/ChangelogPage.svelte';
  import DocsViewer from './lib/DocsViewer.svelte';
  import RavenLogo from './lib/RavenLogo.svelte';
  import ProjectSelector from './lib/ProjectSelector.svelte';
  import ErrorLog from './lib/ErrorLog.svelte';
  import NotificationsPanel from './lib/NotificationsPanel.svelte';
  import StoragePanel from './lib/StoragePanel.svelte';
  import ServerSyncPanel from './lib/ServerSyncPanel.svelte';
  import KeyboardShortcuts from './lib/KeyboardShortcuts.svelte';
  import { keyboard } from './lib/keyboardService.js';
  import { setupGlobalErrorHandler } from './lib/errorLogger.js';
  import { toasts } from './lib/toastStore.js';

  const API_BASE = 'http://localhost:3030/api';

  let sessionId = 'Loading...';
  let sessionUptime = '0s';
  let activeTab = 'overview'; // New consolidated tabs: overview, agents, activity, analysis, system, about, changelog, docs
  let currentSubView = ''; // For sub-views within tabs
  let theme = 'theme--night'; // Default theme: Day (Gruvbox), Dusk (Ristretto), Night (Tokyo Night)
  let showHelp = false;
  let showWelcome = false;

  const startTime = Date.now();
  let uptimeInterval;

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
    toasts.info(`Switched to ${newTab} view`);
  }

  function switchTheme(newTheme) {
    theme = newTheme;
    document.body.className = theme;
    localStorage.setItem('raven-theme', theme);
    toasts.success(`Theme changed to ${newTheme.replace('theme--', '')}`);
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

    // Register help shortcut
    keyboard.register('?', () => showHelp = !showHelp);
    keyboard.register('Escape', () => {
      showHelp = false;
      showWelcome = false;
    });

    // Show welcome screen for first-time users
    if (!localStorage.getItem('raven-welcome-seen')) {
      showWelcome = true;
    } else if (!localStorage.getItem('raven-visited')) {
      // Show toast for returning users who haven't seen the new UI
      setTimeout(() => {
        toasts.info('Welcome back! Press ? for keyboard shortcuts', 5000);
        localStorage.setItem('raven-visited', 'true');
      }, 1000);
    }
  });

  onDestroy(() => {
    keyboard.clear();
    if (uptimeInterval) clearInterval(uptimeInterval);
  });
</script>

<main>
  <header role="banner">
    <div class="header-content">
      <div class="header-left">
        <div style="display: flex; align-items: center; gap: 12px;">
          <RavenLogo size={32} />
          <h1>Raven</h1>
        </div>
      </div>
      <div class="header-right">
        <ProjectSelector />
        <button
          class="help-button"
          on:click={() => showHelp = !showHelp}
          aria-label="Show keyboard shortcuts"
          tabindex="0"
        >
          ?
        </button>
      </div>
    </div>
  </header>

  <!-- New Tab Navigation -->
  <TabNavigation {activeTab} onTabChange={handleTabChange} />

  <!-- Consolidated View Container -->
  <div class="view-container" role="main">
    {#if activeTab === 'overview'}
      <!-- Overview: Dashboard + Metrics + Git Status -->
      <OverviewPanel {sessionId} {sessionUptime} />
    {:else if activeTab === 'agents'}
      <!-- Agents: All AI agent related views -->
      <div class="tab-content">
        <div class="sub-navigation">
          <button
            class="sub-tab"
            class:active={!currentSubView}
            on:click={() => currentSubView = ''}
          >
            Monitor
          </button>
          <button
            class="sub-tab"
            class:active={currentSubView === 'events'}
            on:click={() => currentSubView = 'events'}
          >
            Events
          </button>
        </div>
        {#if !currentSubView}
          <AgentsPanel />
        {:else if currentSubView === 'events'}
          <EventFeed agentFilter={true} />
        {/if}
      </div>
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
            class:active={currentSubView === 'files'}
            on:click={() => currentSubView = 'files'}
          >
            Files
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
        {:else if currentSubView === 'files'}
          <FileBrowser />
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
  <KeyboardShortcuts on:close={() => showHelp = false} />
{/if}

<Footer
  theme={theme}
  onThemeChange={switchTheme}
  onAboutClick={() => activeTab = 'about'}
  onChangelogClick={() => activeTab = 'changelog'}
  onDocsClick={() => activeTab = 'docs'}
/>

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

  .view-container {
    padding: 0;
    max-width: 100%;
    margin: 0;
    min-height: calc(100vh - 120px);
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
      padding: 8px 16px;
    }

    h1 {
      font-size: 16px;
    }

    .theme-switch {
      display: none;
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
