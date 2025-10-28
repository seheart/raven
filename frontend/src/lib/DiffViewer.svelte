<script>
  export let diff = '';
  export let oldContent = '';
  export let newContent = '';
  export let onClose = () => {};

  let leftLines = [];
  let rightLines = [];
  let diffLines = [];

  $: {
    if (diff) {
      parseDiff(diff);
    } else if (oldContent || newContent) {
      parseContents(oldContent, newContent);
    }
  }

  function parseDiff(diffText) {
    // Parse unified diff format
    const lines = (diffText || '').split('\n');
    diffLines = lines.filter(line => line != null).map(line => {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        return { type: 'add', content: line.substring(1) };
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        return { type: 'remove', content: line.substring(1) };
      } else if (line.startsWith(' ')) {
        return { type: 'context', content: line.substring(1) };
      } else {
        return { type: 'meta', content: line };
      }
    }).filter(line => line.type !== 'meta');
  }

  function parseContents(old, newText) {
    // Simple line-by-line comparison
    const oldLines = (old || '').split('\n');
    const newLines = (newText || '').split('\n');
    const maxLines = Math.max(oldLines.length, newLines.length);

    leftLines = [];
    rightLines = [];

    for (let i = 0; i < maxLines; i++) {
      const oldLine = oldLines[i] !== undefined ? oldLines[i] : '';
      const newLine = newLines[i] !== undefined ? newLines[i] : '';

      if (oldLine === newLine) {
        leftLines.push({ type: 'context', content: oldLine, lineNum: i + 1 });
        rightLines.push({ type: 'context', content: newLine, lineNum: i + 1 });
      } else {
        if (oldLine) {
          leftLines.push({ type: 'remove', content: oldLine, lineNum: i + 1 });
        }
        if (newLine) {
          rightLines.push({ type: 'add', content: newLine, lineNum: i + 1 });
        }
      }
    }
  }

  function getLineClass(type) {
    return {
      'add': 'line-add',
      'remove': 'line-remove',
      'context': 'line-context'
    }[type] || '';
  }
</script>

<div
  class="diff-modal-overlay"
  on:click={onClose}
  on:keydown={(e) => e.key === 'Escape' && onClose()}
  role="dialog"
  aria-modal="true"
  aria-labelledby="diff-title"
  tabindex="-1"
>
  <div class="diff-modal-content" on:click|stopPropagation role="document">
    <div class="diff-header">
      <h2 id="diff-title"><span aria-hidden="true">📊</span> Diff Viewer</h2>
      <button class="close-btn" on:click={onClose} aria-label="Close diff viewer">×</button>
    </div>

    {#if diffLines.length > 0}
      <!-- Unified diff view -->
      <div class="unified-diff" role="region" aria-label="Unified diff view">
        <pre class="diff-content" aria-label="Code differences">{#each diffLines || [] as line (line.lineNum)}
<span class="diff-line {getLineClass(line.type)}">{line.content}
</span>{/each}</pre>
      </div>
    {:else if leftLines.length > 0 || rightLines.length > 0}
      <!-- Side-by-side view -->
      <div class="side-by-side">
        <div class="diff-pane" role="region" aria-label="Before changes">
          <div class="pane-header">Before</div>
          <div class="pane-content">
            {#each leftLines || [] as line (line.lineNum)}
              <div class="code-line {getLineClass(line.type)}">
                <span class="line-num">{line.lineNum}</span>
                <span class="line-content">{line.content || ' '}</span>
              </div>
            {/each}
          </div>
        </div>

        <div class="diff-divider" aria-hidden="true"></div>

        <div class="diff-pane" role="region" aria-label="After changes">
          <div class="pane-header">After</div>
          <div class="pane-content">
            {#each rightLines || [] as line (line.lineNum)}
              <div class="code-line {getLineClass(line.type)}">
                <span class="line-num">{line.lineNum}</span>
                <span class="line-content">{line.content || ' '}</span>
              </div>
            {/each}
          </div>
        </div>
      </div>
    {:else}
      <div class="empty">No diff available</div>
    {/if}
  </div>
</div>

<style>
  .diff-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: color-mix(in srgb, var(--bg) 90%, black);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
  }

  .diff-modal-content {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    width: 95%;
    max-width: 1400px;
    max-height: 90vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .diff-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    border-bottom: 2px solid var(--info);
  }

  .diff-header {
    padding: 0 8px;
  }

  h2 {
    margin: 0;
    color: var(--text);
    font-size: 18px;
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

  .close-btn:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .unified-diff {
    flex: 1;
    overflow: auto;
    padding: 10px;
  }

  .diff-content {
    font-family: 'Courier New', monospace;
    font-size: 12px;
    margin: 0;
    white-space: pre;
  }

  .diff-line {
    display: block;
    padding: 2px 8px;
  }

  .diff-line.line-add {
    background: color-mix(in srgb, var(--success) 15%, var(--surface));
    color: var(--success);
  }

  .diff-line.line-remove {
    background: color-mix(in srgb, var(--error) 15%, var(--surface));
    color: var(--error);
  }

  .diff-line.line-context {
    color: var(--text);
  }

  .side-by-side {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .diff-pane {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .pane-header {
    background: var(--surface-2);
    padding: 8px 1rem;
    font-weight: 600;
    color: var(--text);
    border-bottom: 1px solid var(--border);
  }

  .pane-content {
    flex: 1;
    overflow: auto;
    font-family: 'Courier New', monospace;
    font-size: 12px;
  }

  .diff-divider {
    width: 2px;
    background: var(--surface-2);
  }

  .code-line {
    display: flex;
    padding: 2px 0;
    min-height: 20px;
  }

  .code-line.line-add {
    background: color-mix(in srgb, var(--success) 15%, var(--surface));
  }

  .code-line.line-remove {
    background: color-mix(in srgb, var(--error) 15%, var(--surface));
  }

  .line-num {
    display: inline-block;
    width: 50px;
    text-align: right;
    padding-right: 1rem;
    color: var(--muted);
    user-select: none;
    flex-shrink: 0;
  }

  .line-content {
    flex: 1;
    color: var(--text);
    white-space: pre;
    padding-right: 1rem;
  }

  .code-line.line-add .line-content {
    color: var(--success);
  }

  .code-line.line-remove .line-content {
    color: var(--error);
  }

  .empty {
    text-align: center;
    padding: 16px;
    color: var(--muted);
  }
</style>
