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
  // import LoginPage from './lib/LoginPage.svelte'; // Authentication removed
  import UserMenu from './lib/UserMenu.svelte';

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
  import Toast from './lib/Toast.svelte';
  import StoragePanel from './lib/StoragePanel.svelte';
  import ServerSyncPanel from './lib/ServerSyncPanel.svelte';
  import SettingsPanel from './lib/SettingsPanel.svelte';
  import ProjectsConfigPanel from './lib/ProjectsConfigPanel.svelte';
  import KeyboardShortcuts from './lib/KeyboardShortcuts.svelte';
  import PageInfo from './lib/PageInfo.svelte';
  import ConversationsPanel from './lib/ConversationsPanel.svelte';
  import DeveloperInsightsPanel from './lib/DeveloperInsightsPanel.svelte';
  import BreakAlert from './lib/BreakAlert.svelte';
  import ProjectsComparisonPanel from './lib/ProjectsComparisonPanel.svelte';
  import FileBrowser from './lib/FileBrowser.svelte';
  import HistoricalTrendsPanel from './lib/HistoricalTrendsPanel.svelte';
  import AnomalyAlertsPanel from './lib/AnomalyAlertsPanel.svelte';
  import MultiProjectHealthPanel from './lib/MultiProjectHealthPanel.svelte';
  import GlobalSearchPanel from './lib/GlobalSearchPanel.svelte';
  import CustomMetricsPanel from './lib/CustomMetricsPanel.svelte';
  import QuickStartWizard from './lib/QuickStartWizard.svelte';
  import SyntaxErrorPanel from './lib/SyntaxErrorPanel.svelte';
  import SessionRollbackPanel from './lib/SessionRollbackPanel.svelte';
  import PatternWarningsPanel from './lib/PatternWarningsPanel.svelte';
  import TestResultsPanel from './lib/TestResultsPanel.svelte';
  import { keyboard } from './lib/keyboardService.js';
  import { setupGlobalErrorHandler } from './lib/errorLogger.js';
  import { toasts } from './lib/toastStore.js';
  import { notifications } from './lib/notificationService.js';
  import { setupNotificationListeners } from './lib/notificationListener.js';
  import { websocketService } from './lib/websocket.js';
  import { checkServerHealth } from './lib/apiClient.js';
  // Authentication disabled
  // import { authService, isAuthenticated } from './lib/authStore.js';

  const API_BASE = 'http://localhost:3030/api';

  // Check if authentication is disabled on backend
  const AUTH_DISABLED = false; // Will be detected from backend

  // Main navigation tabs
  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📊', shortcut: '1' },
    { id: 'safety', label: 'Safety', icon: '🛡️', shortcut: '2' },
    { id: 'agents', label: 'Agents', icon: '🤖', shortcut: '3' },
    { id: 'activity', label: 'Activity', icon: '⚡️', shortcut: '4' },
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

  onMount(async () => {
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
      }, 1000);
    }
  });

  // Authentication removed
  // function handleLoginSuccess() {
  //   // Reload the page to initialize app with authentication
  //   window.location.reload();
  // }

  onDestroy(() => {
    keyboard.clear();
    if (uptimeInterval) clearInterval(uptimeInterval);
    if (healthCheckInterval) clearInterval(healthCheckInterval);
    websocketService.disconnect();
  });
</script>

<ErrorBoundary>

<!-- Authentication removed - app is always accessible -->
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
        <div class="theme-switcher">
          <button
            class="theme-btn"
            class:active={theme === 'theme--day'}
            on:click={() => switchTheme('theme--day')}
            aria-label="Day theme"
            title="Day (Gruvbox)"
          >
            ☀️
          </button>
          <button
            class="theme-btn"
            class:active={theme === 'theme--dusk'}
            on:click={() => switchTheme('theme--dusk')}
            aria-label="Dusk theme"
            title="Dusk (Ristretto)"
          >
            🌅
          </button>
          <button
            class="theme-btn"
            class:active={theme === 'theme--night'}
            on:click={() => switchTheme('theme--night')}
            aria-label="Night theme"
            title="Night (Tokyo Night)"
          >
            🌙
          </button>
        </div>
        <UserMenu />
        <button
          class="help-button"
          on:click={() => showHelp = !showHelp}
          aria-label="Show keyboard shortcuts"
        >
          ?
        </button>
        <PageInfo
          title="Raven Dashboard"
          description="Real-time monitoring and safety system for AI-assisted development"
          keyPoints={[
            'Monitor AI agent activity and performance in real-time',
            'Track code changes, errors, and system health',
            'Get alerts for potential issues before they cause problems',
            'Review historical trends and usage patterns'
          ]}
          whenToCheck="Check regularly during active development sessions to stay informed about system status"
          warnings={[
            'High error rates may indicate syntax or runtime issues',
            'Unusual agent activity patterns could signal configuration problems',
            'Performance degradation may require attention to optimize workflow'
          ]}
        />
      </div>
    </div>
  </header>

  <!-- Consolidated View Container -->
  <div class="view-container" role="main">
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
            🧪 Test Results
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
          <AgentsPanel />
        {:else if currentSubView === 'conversations'}
          <ConversationsPanel />
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
          <LiveCodeFeed />
        {:else if currentSubView === 'events'}
          <EventFeed />
        {:else if currentSubView === 'activity'}
          <ActivityLog />
        {:else if currentSubView === 'files'}
          <FileBrowser />
        {:else if currentSubView === 'search'}
          <GlobalSearchPanel />
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
          <PerformancePanel />
        {:else if currentSubView === 'metrics'}
          <CustomMetricsPanel />
        {:else if currentSubView === 'trends'}
          <HistoricalTrendsPanel />
        {:else if currentSubView === 'triggers'}
          <TriggersPanel />
        {:else if currentSubView === 'replay'}
          <SessionReplay />
        {:else if currentSubView === 'insights'}
          <DeveloperInsightsPanel />
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
        {:else if currentSubView === 'anomalies'}
          <AnomalyAlertsPanel />
        {:else if currentSubView === 'storage'}
          <StoragePanel />
        {:else if currentSubView === 'projects'}
          <ProjectsConfigPanel />
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
<Toast />

<!-- Break Recommendation Alert -->
<BreakAlert />

<!-- Quick Start Wizard for New Users -->
{#if showQuickStart}
  <QuickStartWizard
    on:complete={(e) => {
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

  /* Theme Switcher */
  .theme-switcher {
    display: flex;
    gap: var(--space-xs);
    padding: var(--space-xs);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .theme-btn {
    width: 36px;
    height: 36px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    font-size: 16px;
    cursor: pointer;
    transition: all var(--duration-fast) var(--ease-out-expo);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .theme-btn:hover {
    background: var(--surface);
    transform: scale(1.1);
  }

  .theme-btn:active {
    transform: scale(0.95);
  }

  .theme-btn.active {
    background: var(--accent);
    border-color: var(--accent);
    box-shadow: var(--shadow-sm);
  }

  .theme-btn:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
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

  .auth-loading {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: var(--bg);
    gap: 16px;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .auth-loading p {
    font-family: var(--mono);
    font-size: 14px;
    color: var(--muted);
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
