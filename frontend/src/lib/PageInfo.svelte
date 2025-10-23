<script>
  export let title = '';
  export let description = '';
  export let keyPoints = [];
  export let warnings = [];
  export let whenToCheck = '';

  let showModal = false;

  function toggleModal() {
    showModal = !showModal;
  }

  function handleKeydown(e) {
    if (e.key === 'Escape' && showModal) {
      showModal = false;
    }
  }

  // Simple markdown parser for basic formatting
  function parseMarkdown(text) {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')  // **bold**
      .replace(/\*(.+?)\*/g, '<em>$1</em>')              // *italic*
      .replace(/`(.+?)`/g, '<code>$1</code>')             // `code`
      .replace(/\n/g, '<br>');                            // newlines
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<button class="info-button" on:click={toggleModal} aria-label="Page information">
  ℹ️
</button>

{#if showModal}
  <div class="modal-overlay" on:click={toggleModal}>
    <div class="modal-content" on:click|stopPropagation>
      <div class="modal-header">
        <h2>{title}</h2>
        <button class="close-button" on:click={toggleModal} aria-label="Close">×</button>
      </div>

      <div class="modal-body">
        <section class="info-section">
          <h3>What this page is</h3>
          <p>{@html parseMarkdown(description)}</p>
        </section>

        {#if keyPoints.length > 0}
          <section class="info-section">
            <h3>What to look for</h3>
            <ul>
              {#each keyPoints as point}
                <li>{@html parseMarkdown(point)}</li>
              {/each}
            </ul>
          </section>
        {/if}

        {#if whenToCheck}
          <section class="info-section">
            <h3>When to check it</h3>
            <p>{@html parseMarkdown(whenToCheck)}</p>
          </section>
        {/if}

        {#if warnings.length > 0}
          <section class="info-section warning">
            <h3>⚠️ Warning signs</h3>
            <ul>
              {#each warnings as warning}
                <li>{@html parseMarkdown(warning)}</li>
              {/each}
            </ul>
          </section>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .info-button {
    position: fixed !important;
    top: 73px !important;
    right: 24px !important;
    width: 32px !important;
    height: 32px !important;
    border-radius: 50%;
    background: var(--surface-2);
    border: 1px solid var(--border);
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 150;
    opacity: 0.7;
  }

  .info-button:hover {
    background: var(--accent);
    transform: scale(1.1);
    opacity: 1;
  }

  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    padding: 20px;
  }

  .modal-content {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    max-width: 600px;
    width: 100%;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px;
    border-bottom: 1px solid var(--border);
  }

  .modal-header h2 {
    font-family: var(--mono);
    font-size: 18px;
    font-weight: 600;
    color: var(--text);
    margin: 0;
  }

  .close-button {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: transparent;
    border: none;
    color: var(--muted);
    font-size: 28px;
    line-height: 1;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .close-button:hover {
    background: var(--error);
    color: white;
  }

  .modal-body {
    padding: 24px;
  }

  .info-section {
    margin-bottom: 24px;
  }

  .info-section:last-child {
    margin-bottom: 0;
  }

  .info-section h3 {
    font-family: var(--mono);
    font-size: 14px;
    font-weight: 600;
    color: var(--accent);
    margin: 0 0 12px 0;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .info-section p {
    font-family: var(--sans);
    font-size: 14px;
    line-height: 1.6;
    color: var(--text);
    margin: 0;
  }

  .info-section ul {
    margin: 0;
    padding-left: 20px;
  }

  .info-section li {
    font-family: var(--sans);
    font-size: 14px;
    line-height: 1.8;
    color: var(--text);
    margin-bottom: 8px;
  }

  .info-section li:last-child {
    margin-bottom: 0;
  }

  .info-section strong {
    color: var(--accent);
    font-weight: 600;
  }

  .info-section code {
    background: var(--surface-2);
    padding: 2px 6px;
    border-radius: 3px;
    font-family: var(--mono);
    font-size: 13px;
    color: var(--accent);
  }

  .info-section.warning {
    background: var(--error-dim, rgba(255, 100, 100, 0.1));
    border: 1px solid var(--error);
    border-radius: 8px;
    padding: 16px;
  }

  .info-section.warning h3 {
    color: var(--error);
  }

  @media (max-width: 768px) {
    .modal-content {
      max-height: 90vh;
    }

    .modal-header {
      padding: 16px;
    }

    .modal-body {
      padding: 16px;
    }
  }
</style>
