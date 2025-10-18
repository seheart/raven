<script>
  import { onMount, onDestroy } from 'svelte';
  import Dashboard from './lib/Dashboard.svelte';
  import SessionReplay from './lib/SessionReplay.svelte';
  import PerformancePanel from './lib/PerformancePanel.svelte';
  import TriggersPanel from './lib/TriggersPanel.svelte';
  import AgentsPanel from './lib/AgentsPanel.svelte';
  import StatusPanel from './lib/StatusPanel.svelte';
  import KeyboardShortcuts from './lib/KeyboardShortcuts.svelte';
  import Footer from './lib/Footer.svelte';
  import AboutPage from './lib/AboutPage.svelte';
  import ChangelogPage from './lib/ChangelogPage.svelte';
  import { keyboard } from './lib/keyboardService.js';

  const API_BASE = 'http://localhost:3030/api';

  let sessionId = 'Loading...';
  let showShortcuts = false;
  let currentView = 'dashboard'; // dashboard, replay, performance, triggers, agents, status, about, changelog

  async function loadSessionId() {
    try {
      const response = await fetch(`${API_BASE}/session-id`);
      sessionId = await response.json();
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

  onMount(() => {
    loadSessionId();

    // Register global keyboard shortcuts
    keyboard.register('?', toggleShortcuts, { shiftKey: true });
    keyboard.register('Escape', () => {
      showShortcuts = false;
    });

    // View switching shortcuts
    keyboard.register('1', () => switchView('dashboard'));
    keyboard.register('2', () => switchView('replay'));
    keyboard.register('3', () => switchView('performance'));
    keyboard.register('4', () => switchView('triggers'));
    keyboard.register('5', () => switchView('agents'));
    keyboard.register('6', () => switchView('status'));
    keyboard.register('7', () => switchView('about'));
  });

  onDestroy(() => {
    keyboard.clear();
  });
</script>

<main>
  <header>
    <div class="header-content">
      <div class="header-left">
        <h1>🐦‍⬛ Raven</h1>
        <div class="header-info">
          <p class="session-id">Session: {sessionId}</p>
        </div>
      </div>
      <button class="help-btn" on:click={toggleShortcuts} title="Keyboard shortcuts (?)">
        ⌨️ Shortcuts
      </button>
    </div>
  </header>

  <nav class="view-tabs">
    <button
      class="tab"
      class:active={currentView === 'dashboard'}
      on:click={() => switchView('dashboard')}
    >
      📊 Dashboard <span class="shortcut">1</span>
    </button>
    <button
      class="tab"
      class:active={currentView === 'replay'}
      on:click={() => switchView('replay')}
    >
      🎬 Session Replay <span class="shortcut">2</span>
    </button>
    <button
      class="tab"
      class:active={currentView === 'performance'}
      on:click={() => switchView('performance')}
    >
      ⚡ Performance <span class="shortcut">3</span>
    </button>
    <button
      class="tab"
      class:active={currentView === 'triggers'}
      on:click={() => switchView('triggers')}
    >
      🔔 Triggers <span class="shortcut">4</span>
    </button>
    <button
      class="tab"
      class:active={currentView === 'agents'}
      on:click={() => switchView('agents')}
    >
      🤖 Agents <span class="shortcut">5</span>
    </button>
    <button
      class="tab"
      class:active={currentView === 'status'}
      on:click={() => switchView('status')}
    >
      🏥 Status <span class="shortcut">6</span>
    </button>
    <button
      class="tab"
      class:active={currentView === 'about'}
      on:click={() => switchView('about')}
    >
      ℹ️ About <span class="shortcut">7</span>
    </button>
  </nav>

  <div class="view-container">
    {#key currentView}
      {#if currentView === 'dashboard'}
        <Dashboard />
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
      {:else if currentView === 'about'}
        <AboutPage />
      {:else if currentView === 'changelog'}
        <ChangelogPage />
      {/if}
    {/key}
  </div>
</main>

<KeyboardShortcuts visible={showShortcuts} onClose={() => showShortcuts = false} />
<Footer onAboutClick={() => switchView('about')} onChangelogClick={() => switchView('changelog')} />

<style>
  main {
    padding: 0;
    width: 100%;
    max-width: 100vw;
    margin: 0;
    min-height: 100vh;
    background: #0f0f0f;
    overflow-x: hidden;
  }

  header {
    padding: 1.5rem 2rem;
    border-bottom: 2px solid #1f1f1f;
    background: #1a1a1a;
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
    gap: 2rem;
  }

  .header-info {
    text-align: left;
  }

  h1 {
    font-size: 2.5rem;
    margin: 0;
    background: linear-gradient(135deg, #FF6B35 0%, #F7931A 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .subtitle {
    color: #9ca3af;
    margin: 0.25rem 0;
    font-size: 0.95rem;
    font-weight: 500;
  }

  .session-id {
    color: #4ECDC4;
    font-size: 0.85rem;
    margin: 0.25rem 0;
    font-family: 'Courier New', monospace;
  }

  .help-btn {
    padding: 0.75rem 1.5rem;
    font-size: 0.95rem;
    background: #1a1a1a;
    color: #e5e5e5;
    border: 1px solid #2a2a2a;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .help-btn:hover {
    background: #2a2a2a;
    border-color: #FF6B35;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(255, 107, 53, 0.3);
  }

  .view-tabs {
    display: flex;
    gap: 0;
    padding: 0 2rem;
    background: #1a1a1a;
    border-bottom: 2px solid #2a2a2a;
    overflow-x: auto;
    position: relative;
    z-index: 10;
  }

  .tab {
    padding: 1rem 2rem;
    background: transparent;
    color: #9ca3af;
    border: none;
    border-bottom: 3px solid transparent;
    cursor: pointer;
    font-size: 0.95rem;
    font-weight: 500;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    white-space: nowrap;
    pointer-events: auto;
  }

  .tab:hover {
    color: #e5e5e5;
    background: rgba(255, 107, 53, 0.05);
  }

  .tab.active {
    color: #FF6B35;
    border-bottom-color: #FF6B35;
    background: rgba(255, 107, 53, 0.1);
  }

  .shortcut {
    display: inline-block;
    padding: 2px 6px;
    background: #2a2a2a;
    color: #6b7280;
    border-radius: 4px;
    font-size: 0.75rem;
    font-family: 'Courier New', monospace;
  }

  .tab.active .shortcut {
    background: rgba(255, 107, 53, 0.2);
    color: #FF6B35;
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
      font-size: 2rem;
    }

    .view-tabs {
      padding: 0 1rem;
    }

    .tab {
      padding: 0.75rem 1rem;
      font-size: 0.85rem;
    }

    .shortcut {
      display: none;
    }
  }
</style>
