<script>
  import { invoke } from '@tauri-apps/api/core';
  import { onMount, onDestroy } from 'svelte';
  import EventFeed from './lib/EventFeed.svelte';
  import MetricsPanel from './lib/MetricsPanel.svelte';
  import FileBrowser from './lib/FileBrowser.svelte';
  import KeyboardShortcuts from './lib/KeyboardShortcuts.svelte';
  import { keyboard } from './lib/keyboardService.js';

  let greetMsg = '';
  let name = 'Claude';
  let sessionId = 'Loading...';
  let showShortcuts = false;

  async function greet() {
    try {
      greetMsg = await invoke('greet', { name });
    } catch (error) {
      greetMsg = 'Backend not connected (running in browser mode)';
      console.error(error);
    }
  }

  async function loadSessionId() {
    try {
      sessionId = await invoke('get_session_id');
    } catch (error) {
      sessionId = 'Browser Mode';
      console.error(error);
    }
  }

  function toggleShortcuts() {
    showShortcuts = !showShortcuts;
  }

  onMount(() => {
    loadSessionId();

    // Register global keyboard shortcuts
    keyboard.register('?', toggleShortcuts, { shiftKey: true });
    keyboard.register('Escape', () => {
      showShortcuts = false;
    });
  });

  onDestroy(() => {
    keyboard.clear();
  });
</script>

<main>
  <header>
    <div class="header-content">
      <div class="header-left">
        <h1>🦅 Raven</h1>
        <div class="header-info">
          <p class="subtitle">AI Agent Monitor - Phase 3</p>
          <p class="session-id">Session: {sessionId}</p>
        </div>
      </div>
      <button class="help-btn" on:click={toggleShortcuts} title="Keyboard shortcuts (?)">
        ⌨️ Shortcuts
      </button>
    </div>
  </header>

  <div class="test-section">
    <input bind:value={name} placeholder="Enter name..." />
    <button on:click={greet}>Test Connection</button>
    {#if greetMsg}
      <p class="greeting">{greetMsg}</p>
    {/if}
  </div>

  <div class="dashboard">
    <div class="panel">
      <h2>System Metrics</h2>
      <MetricsPanel />
    </div>

    <div class="panel main-panel">
      <h2>Event Feed</h2>
      <EventFeed />
    </div>

    <div class="panel files-panel">
      <h2>Time Travel</h2>
      <FileBrowser />
    </div>
  </div>
</main>

<KeyboardShortcuts visible={showShortcuts} onClose={() => showShortcuts = false} />

<style>
  main {
    padding: 2rem;
    max-width: 1400px;
    margin: 0 auto;
  }

  header {
    margin-bottom: 2rem;
  }

  .header-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
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
    font-size: 3rem;
    margin: 0;
    color: #646cff;
  }

  .subtitle {
    color: #888;
    margin: 0.25rem 0;
    font-size: 1rem;
  }

  .session-id {
    color: #646cff;
    font-size: 0.85rem;
    margin: 0.25rem 0;
    font-family: 'Courier New', monospace;
  }

  .help-btn {
    padding: 0.75rem 1.5rem;
    font-size: 0.95rem;
    background: #2a2a2a;
    color: #fff;
    border: 1px solid #646cff;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .help-btn:hover {
    background: #646cff;
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(100, 108, 255, 0.3);
  }

  .test-section {
    background: #1a1a1a;
    padding: 1.5rem;
    border-radius: 8px;
    margin-bottom: 2rem;
    text-align: center;
  }

  input {
    padding: 0.5rem 1rem;
    font-size: 1rem;
    border: 1px solid #646cff;
    border-radius: 4px;
    background: #2a2a2a;
    color: white;
    margin-right: 0.5rem;
  }

  button {
    padding: 0.5rem 1.5rem;
    font-size: 1rem;
    background: #646cff;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  button:hover {
    background: #535bf2;
  }

  .greeting {
    margin-top: 1rem;
    color: #4ade80;
    font-weight: bold;
  }

  .dashboard {
    display: grid;
    grid-template-columns: 300px 1fr 300px;
    grid-template-areas:
      "metrics events files";
    gap: 1.5rem;
  }

  .panel {
    background: #1a1a1a;
    padding: 1.5rem;
    border-radius: 8px;
    border: 1px solid #333;
  }

  .panel:nth-child(1) {
    grid-area: metrics;
  }

  .main-panel {
    grid-area: events;
    min-height: 500px;
  }

  .files-panel {
    grid-area: files;
    min-height: 500px;
  }

  @media (max-width: 1200px) {
    .dashboard {
      grid-template-columns: 1fr;
      grid-template-areas:
        "metrics"
        "events"
        "files";
    }
  }

  h2 {
    margin-top: 0;
    color: #fff;
    font-size: 1.2rem;
    border-bottom: 2px solid #646cff;
    padding-bottom: 0.5rem;
  }
</style>
