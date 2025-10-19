<script>
  import { onMount, onDestroy } from 'svelte';
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
  import KeyboardShortcuts from './lib/KeyboardShortcuts.svelte';
  import Footer from './lib/Footer.svelte';
  import AboutPage from './lib/AboutPage.svelte';
  import ChangelogPage from './lib/ChangelogPage.svelte';
  import RavenLogo from './lib/RavenLogo.svelte';
  import ProjectSelector from './lib/ProjectSelector.svelte';
  import { keyboard } from './lib/keyboardService.js';

  const API_BASE = 'http://localhost:3030/api';

  let sessionId = 'Loading...';
  let showShortcuts = false;
  let currentView = 'dashboard'; // dashboard, git, replay, performance, triggers, agents, status, about, changelog
  let theme = 'theme--night'; // Default theme: Day (Gruvbox), Dusk (Ristretto), Night (Tokyo Night)

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

  function toggleShortcuts() {
    showShortcuts = !showShortcuts;
  }

  function switchView(view) {
    currentView = view;
  }

  function switchTheme(newTheme) {
    theme = newTheme;
    document.body.className = theme;
    localStorage.setItem('raven-theme', theme);
  }

  onMount(() => {
    loadSessionId();

    // Load saved theme from localStorage
    theme = localStorage.getItem('raven-theme') || 'theme--night';
    document.body.className = theme;

    // Register global keyboard shortcuts
    keyboard.register('?', toggleShortcuts, { shiftKey: true });
    keyboard.register('Escape', () => {
      showShortcuts = false;
    });

    // View switching shortcuts
    keyboard.register('1', () => switchView('dashboard'));
    keyboard.register('2', () => switchView('git'));
    keyboard.register('3', () => switchView('replay'));
    keyboard.register('4', () => switchView('performance'));
    keyboard.register('5', () => switchView('triggers'));
    keyboard.register('6', () => switchView('agents'));
    keyboard.register('7', () => switchView('status'));
  });

  onDestroy(() => {
    keyboard.clear();
  });
</script>

<main>
  <header>
    <div class="header-content">
      <div class="header-left">
        <div style="display: flex; align-items: center; gap: 12px;">
          <RavenLogo size={32} />
          <h1>Raven</h1>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 12px;">
        <ProjectSelector />
        <div class="theme-switch">
          <button
            class:is-active={theme === 'theme--day'}
            on:click={() => switchTheme('theme--day')}
          >
            Day
          </button>
          <button
            class:is-active={theme === 'theme--dusk'}
            on:click={() => switchTheme('theme--dusk')}
          >
            Dusk
          </button>
          <button
            class:is-active={theme === 'theme--night'}
            on:click={() => switchTheme('theme--night')}
          >
            Night
          </button>
        </div>
        <button class="help-btn" on:click={toggleShortcuts} title="Keyboard shortcuts (?)">
          ⌨️ Shortcuts
        </button>
      </div>
    </div>
  </header>

  <nav class="view-tabs">
    <button
      class="tab"
      class:active={currentView === 'dashboard'}
      on:click={() => switchView('dashboard')}
    >
      📊 Dashboard
    </button>
    <button
      class="tab"
      class:active={currentView === 'live-feed'}
      on:click={() => switchView('live-feed')}
    >
      🔴 Live Feed
    </button>
    <button
      class="tab"
      class:active={currentView === 'git'}
      on:click={() => switchView('git')}
    >
      🌳 Git
    </button>
    <button
      class="tab"
      class:active={currentView === 'replay'}
      on:click={() => switchView('replay')}
    >
      🎬 Session Replay
    </button>
    <button
      class="tab"
      class:active={currentView === 'performance'}
      on:click={() => switchView('performance')}
    >
      ⚡ Performance
    </button>
    <button
      class="tab"
      class:active={currentView === 'triggers'}
      on:click={() => switchView('triggers')}
    >
      🔔 Triggers
    </button>
    <button
      class="tab"
      class:active={currentView === 'agents'}
      on:click={() => switchView('agents')}
    >
      🤖 Agents
    </button>
    <button
      class="tab"
      class:active={currentView === 'status'}
      on:click={() => switchView('status')}
    >
      🏥 Status
    </button>
    <button
      class="tab"
      class:active={currentView === 'api-health'}
      on:click={() => switchView('api-health')}
    >
      🔌 API Health
    </button>
    <button
      class="tab"
      class:active={currentView === 'activity-log'}
      on:click={() => switchView('activity-log')}
    >
      📜 Activity Log
    </button>
  </nav>

  <div class="view-container">
    {#if currentView === 'dashboard'}
      <Dashboard />
    {:else if currentView === 'live-feed'}
      <LiveCodeFeed />
    {:else if currentView === 'git'}
      <GitPanel />
    {:else if currentView === 'replay'}
      <SessionReplay />
    {:else if currentView === 'performance'}
      <PerformancePanel />
    {:else if currentView === 'triggers'}
      <TriggersPanel />
    {:else if currentView === 'agents'}
      <AgentsPanel />
    {:else if currentView === 'status'}
      <StatusPanel />
    {:else if currentView === 'api-health'}
      <APIHealthMonitor />
    {:else if currentView === 'activity-log'}
      <ActivityLog />
    {:else if currentView === 'about'}
      <AboutPage />
    {:else if currentView === 'changelog'}
      <ChangelogPage />
    {/if}
  </div></main>

<KeyboardShortcuts visible={showShortcuts} onClose={() => showShortcuts = false} />
<Footer sessionId={sessionId} onAboutClick={() => switchView('about')} onChangelogClick={() => switchView('changelog')} />

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
    padding: 12px 2rem;
    border-bottom: 2px solid var(--border);
    background: var(--surface);
    position: relative;
    z-index: 10;
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

  .header-info {
    text-align: left;
  }

  h1 {
    font-size: 13px;
    margin: 0;
    background: linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .session-id {
    color: var(--accent);
    font-size: 11px;
    margin: 0.25rem 0;
    font-family: var(--mono);
  }

  .help-btn {
    padding: 8px 1.5rem;
    font-size: 12px;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .help-btn:hover {
    background: var(--surface-2);
    border-color: var(--accent);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px color-mix(in srgb, var(--accent) 30%, transparent);
  }

  .view-tabs {
    display: flex;
    gap: 0;
    padding: 0 2rem;
    background: var(--surface);
    border-bottom: 2px solid var(--border);
    overflow-x: auto;
    position: relative;
    z-index: 10;
  }

  .tab {
    padding: 10px 2rem;
    background: transparent;
    color: var(--muted);
    border: none;
    border-bottom: 3px solid transparent;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    white-space: nowrap;
    pointer-events: auto;
  }

  .tab:hover {
    color: var(--text);
    background: color-mix(in srgb, var(--accent) 5%, transparent);
  }

  .tab.active {
    color: var(--accent);
    border-bottom-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }

  .shortcut {
    display: inline-block;
    padding: 2px 6px;
    background: var(--surface-2);
    color: var(--muted);
    border-radius: var(--radius);
    font-size: 11px;
    font-family: var(--mono);
  }

  .tab.active .shortcut {
    background: color-mix(in srgb, var(--accent) 20%, transparent);
    color: var(--accent);
  }

  .view-container {
    padding: 0 0 80px 0;
    max-width: 100%;
    margin: 0;
    position: relative;
    z-index: 1;
  }

  @media (max-width: 768px) {
    h1 {
      font-size: 13px;
    }

    .view-tabs {
      padding: 0 1rem;
    }

    .tab {
      padding: 8px 1rem;
      font-size: 11px;
    }

    .shortcut {
      display: none;
    }
  }
</style>
