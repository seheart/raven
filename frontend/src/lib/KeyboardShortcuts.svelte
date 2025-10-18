<script>
  import { onMount, onDestroy } from 'svelte';

  export let visible = false;
  export let onClose = () => {};

  const shortcuts = [
    {
      category: 'Global',
      items: [
        { keys: ['?'], description: 'Show/hide this help' },
        { keys: ['Esc'], description: 'Close modals and dialogs' },
        { keys: ['Ctrl', 'K'], description: 'Focus search input' },
      ]
    },
    {
      category: 'Event Feed',
      items: [
        { keys: ['1'], description: 'Toggle Created filter' },
        { keys: ['2'], description: 'Toggle Modified filter' },
        { keys: ['3'], description: 'Toggle Deleted filter' },
        { keys: ['C'], description: 'Clear all events' },
        { keys: ['R'], description: 'Refresh events' },
      ]
    },
    {
      category: 'File Browser',
      items: [
        { keys: ['↑', '↓'], description: 'Navigate files' },
        { keys: ['Enter'], description: 'View file history' },
      ]
    },
    {
      category: 'File History',
      items: [
        { keys: ['V'], description: 'View snapshot' },
        { keys: ['D'], description: 'View diff' },
        { keys: ['Ctrl', 'R'], description: 'Restore to point' },
      ]
    }
  ];

  function handleKeyPress(e) {
    if (e.key === 'Escape' && visible) {
      onClose();
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeyPress);
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeyPress);
  });
</script>

{#if visible}
  <div class="shortcuts-overlay" on:click={onClose}>
    <div class="shortcuts-modal" on:click|stopPropagation>
      <div class="shortcuts-header">
        <h2>⌨️ Keyboard Shortcuts</h2>
        <button class="close-btn" on:click={onClose}>×</button>
      </div>

      <div class="shortcuts-content">
        {#each shortcuts as section}
          <div class="shortcuts-section">
            <h3>{section.category}</h3>
            <div class="shortcuts-list">
              {#each section.items as shortcut}
                <div class="shortcut-item">
                  <div class="shortcut-keys">
                    {#each shortcut.keys as key}
                      <kbd class="key">{key}</kbd>
                    {/each}
                  </div>
                  <div class="shortcut-desc">{shortcut.description}</div>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>

      <div class="shortcuts-footer">
        Press <kbd class="key">?</kbd> to toggle this help
      </div>
    </div>
  </div>
{/if}

<style>
  .shortcuts-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 3000;
  }

  .shortcuts-modal {
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 8px;
    width: 90%;
    max-width: 700px;
    max-height: 85vh;
    overflow-y: auto;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  }

  .shortcuts-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    border-bottom: 2px solid #646cff;
    position: sticky;
    top: 0;
    background: #1a1a1a;
    z-index: 1;
  }

  h2 {
    margin: 0;
    color: #fff;
    font-size: 1.5rem;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 2rem;
    color: #888;
    cursor: pointer;
    padding: 0;
    width: 32px;
    height: 32px;
  }

  .close-btn:hover {
    color: #fff;
  }

  .shortcuts-content {
    padding: 1.5rem;
  }

  .shortcuts-section {
    margin-bottom: 2rem;
  }

  .shortcuts-section:last-child {
    margin-bottom: 0;
  }

  h3 {
    margin: 0 0 1rem 0;
    color: #646cff;
    font-size: 1.1rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .shortcuts-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .shortcut-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    background: #2a2a2a;
    border-radius: 6px;
    transition: background 0.2s;
  }

  .shortcut-item:hover {
    background: #333;
  }

  .shortcut-keys {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .key {
    display: inline-block;
    padding: 0.25rem 0.6rem;
    background: #1a1a1a;
    border: 1px solid #444;
    border-radius: 4px;
    font-family: 'Courier New', monospace;
    font-size: 0.85rem;
    font-weight: 600;
    color: #fff;
    box-shadow: 0 2px 0 #222;
    min-width: 28px;
    text-align: center;
  }

  .shortcut-desc {
    color: #aaa;
    font-size: 0.9rem;
  }

  .shortcuts-footer {
    padding: 1rem 1.5rem;
    border-top: 1px solid #333;
    text-align: center;
    color: #888;
    font-size: 0.9rem;
    background: #1a1a1a;
    position: sticky;
    bottom: 0;
  }
</style>
