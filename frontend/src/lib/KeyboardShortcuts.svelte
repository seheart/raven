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
  <div
    class="shortcuts-overlay"
    on:click={onClose}
    on:keydown={handleKeyPress}
    role="dialog"
    aria-modal="true"
    aria-labelledby="shortcuts-title"
    tabindex="-1"
  >
    <div
      class="shortcuts-modal"
      on:click|stopPropagation
      on:keydown={e => e.stopPropagation()}
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
    >
      <div class="shortcuts-header">
        <h2 id="shortcuts-title"><span aria-hidden="true">⌨</span> Keyboard Shortcuts</h2>
        <button
          class="btn btn-ghost btn-icon"
          on:click={onClose}
          aria-label="Close keyboard shortcuts dialog">×</button
        >
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
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.75);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    overflow: auto;
  }

  .shortcuts-modal {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    width: 90%;
    max-width: 700px;
    max-height: 85vh;
    overflow-y: auto;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
    margin: auto;
    position: relative;
  }

  .shortcuts-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-xl);
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

  .shortcuts-content {
    padding: var(--space-xl);
  }

  .shortcuts-section {
    margin-bottom: var(--space-lg);
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
    gap: var(--space-lg);
  }

  .shortcut-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-lg);
    background: var(--surface-2);
    border-radius: var(--radius-sm);
    transition: background var(--duration-base) var(--ease-smooth);
  }

  .shortcut-item:hover {
    background: var(--surface-2);
  }

  .shortcut-keys {
    display: flex;
    gap: var(--space-lg);
    align-items: center;
  }

  .key {
    display: inline-block;
    padding: var(--space-sm) 0.6rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 600;
    color: var(--text);
    box-shadow: 0 2px 0 #222;
    min-width: var(--icon-lg);
    text-align: center;
  }

  .shortcut-desc {
    color: var(--muted);
    font-size: 12px;
  }

  .shortcuts-footer {
    padding: var(--space-lg) 1.5rem;
    border-top: 1px solid var(--border);
    text-align: center;
    color: var(--muted);
    font-size: 12px;
    background: var(--surface);
    position: sticky;
    bottom: 0;
  }
</style>
