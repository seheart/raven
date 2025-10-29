<script>
  export let activeTab = 'overview';
  export let onTabChange = () => {};

  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📊', shortcut: '1' },
    { id: 'agents', label: 'Agents', icon: '🤖', shortcut: '2' },
    { id: 'activity', label: 'Activity', icon: '⚡', shortcut: '3' },
    { id: 'analysis', label: 'Analysis', icon: '📈', shortcut: '4' },
    { id: 'system', label: 'System', icon: '⚙️', shortcut: '5' }
  ];

  function handleTabClick(tabId) {
    activeTab = tabId;
    onTabChange(tabId);
  }

  function handleKeyDown(event) {
    // Support both clicking and keyboard shortcuts
    const key = event.key;
    const tab = tabs.find(t => t.shortcut === key);
    if (tab) {
      handleTabClick(tab.id);
    }
  }
</script>

<svelte:window on:keydown={handleKeyDown} />

<nav class="tab-navigation" aria-label="Main navigation">
  <div class="tabs-container" role="tablist" aria-label="Dashboard sections">
    {#each tabs as tab (tab)}
      <button
        class="tab-button"
        class:active={activeTab === tab.id}
        on:click={() => handleTabClick(tab.id)}
        role="tab"
        aria-selected={activeTab === tab.id}
        aria-controls="{tab.id}-panel"
        aria-label="{tab.label} (Keyboard shortcut: {tab.shortcut})"
        tabindex={activeTab === tab.id ? 0 : -1}
        id="{tab.id}-tab"
      >
        <span class="tab-icon" aria-hidden="true">{tab.icon}</span>
        <span class="tab-label">{tab.label}</span>
        <span class="tab-shortcut" aria-hidden="true">{tab.shortcut}</span>
      </button>
    {/each}
  </div>
</nav>

<style>
  .tab-navigation {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 0;
    position: sticky;
    top: 60px; /* Below header */
    z-index: 100;
  }

  .tabs-container {
    display: flex;
    gap: 4px;
    padding: 8px 16px;
    overflow-x: auto;
  }

  .tab-button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 8px;
    color: var(--muted);
    font-family: var(--mono);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    position: relative;
    min-width: 120px;
    justify-content: center;
  }

  .tab-button:hover {
    background: var(--surface-2);
    color: var(--text);
    transform: translateY(-1px);
  }

  .tab-button:focus {
    outline: none;
    box-shadow: 0 0 0 2px var(--accent);
  }

  .tab-button.active {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }

  .tab-button.active:hover {
    background: var(--accent-2, var(--accent));
    transform: none;
  }

  .tab-icon {
    font-size: 16px;
  }

  .tab-label {
    font-weight: 600;
  }

  .tab-shortcut {
    position: absolute;
    top: 4px;
    right: 4px;
    font-size: 10px;
    padding: 2px 4px;
    background: var(--bg);
    border-radius: 3px;
    opacity: 0.5;
  }

  .tab-button:hover .tab-shortcut {
    opacity: 0.8;
  }

  .tab-button.active .tab-shortcut {
    background: rgba(255, 255, 255, 0.2);
    opacity: 0.7;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .tab-label {
      display: none;
    }

    .tab-button {
      min-width: auto;
      padding: 10px 12px;
    }
  }

  /* Animation for tab switches */
  @keyframes tabPulse {
    0% { transform: scale(1); }
    50% { transform: scale(0.95); }
    100% { transform: scale(1); }
  }

  .tab-button.active {
    animation: tabPulse 0.2s ease-out;
  }
</style>
