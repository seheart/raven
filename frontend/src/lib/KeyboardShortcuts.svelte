<script>
  import { onMount, onDestroy } from 'svelte';

  export let visible = false;
  export let onClose = () => {};

  const shortcuts = [
    {
      category: 'Global',
      items: [
        { keys: ['?'], description: 'Show/hide this help' },
        { keys: ['Esc'], description: 'Close modals and dialogs' }
      ]
    },
    {
      category: 'Navigation',
      items: [
        { keys: ['1'], description: 'Dashboard view' },
        { keys: ['2'], description: 'Session Replay view' },
        { keys: ['3'], description: 'Performance view' },
        { keys: ['4'], description: 'Triggers view' },
        { keys: ['5'], description: 'Agents view' },
        { keys: ['6'], description: 'Status view' }
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
  <div class="shortcuts-overlay" on:click={onClose} on:keydown={handleKeyPress} role="dialog" aria-modal="true" aria-labelledby="shortcuts-title" tabindex="-1">
    <div class="shortcuts-modal" on:click|stopPropagation on:keydown={(e) => e.stopPropagation()} role="document">
      <div class="shortcuts-header">
        <h2 id="shortcuts-title"><span aria-hidden="true">⌨️</span> Keyboard Shortcuts</h2>
        <button class="close-btn" on:click={onClose} aria-label="Close keyboard shortcuts dialog">×</button>
      </div>

      <div class="shortcuts-content">
        {#each shortcuts as section (section)}
          <section class="shortcuts-section" aria-labelledby="section-{section.category}">
            <h3 id="section-{section.category}">{section.category}</h3>
            <div class="shortcuts-list" role="list">
              {#each section.items as shortcut (shortcut)}
                <div class="shortcut-item" role="listitem">
                  <div class="shortcut-keys">
                    {#each shortcut.keys as key (key)}
                      <kbd class="key">{key}</kbd>
                    {/each}
                  </div>
                  <div class="shortcut-desc">{shortcut.description}</div>
                </div>
              {/each}
            </div>
          </section>
        {/each}
      </div>

      <div class="shortcuts-footer" role="contentinfo">
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
    background: color-mix(in srgb, var(--bg) 85%, black);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 3000;
  }

  .shortcuts-modal {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    width: 90%;
    max-width: 700px;
    max-height: 85vh;
    overflow-y: auto;
    box-shadow: none;
  }

  .shortcuts-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    border-bottom: 2px solid var(--info);
    position: sticky;
    top: 0;
    background: var(--surface);
    z-index: 1;
  }

  h2 {
    margin: 0;
    color: var(--text);
    font-size: 12px;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 13px;
    color: var(--muted);
    cursor: pointer;
    padding: 0;
    width: 32px;
    height: 32px;
  }

  .close-btn:hover {
    color: var(--text);
  }

  .shortcuts-content {
    padding: 12px;
  }

  .shortcuts-section {
    margin-bottom: 10px;
  }

  .shortcuts-section:last-child {
    margin-bottom: 0;
  }

  h3 {
    margin: 0 0 1rem 0;
    color: var(--info);
    font-size: 12px;
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
    padding: 8px;
    background: var(--surface-2);
    border-radius: 6px;
    transition: background 0.2s;
  }

  .shortcut-item:hover {
    background: var(--surface-2);
  }

  .shortcut-keys {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .key {
    display: inline-block;
    padding: 4px 0.6rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    font-weight: 600;
    color: var(--text);
    box-shadow: 0 2px 0 #222;
    min-width: 28px;
    text-align: center;
  }

  .shortcut-desc {
    color: var(--muted);
    font-size: 12px;
  }

  .shortcuts-footer {
    padding: 10px 1.5rem;
    border-top: 1px solid var(--border);
    text-align: center;
    color: var(--muted);
    font-size: 12px;
    background: var(--surface);
    position: sticky;
    bottom: 0;
  }
</style>
