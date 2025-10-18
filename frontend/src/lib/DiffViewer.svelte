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
    const lines = diffText.split('\n');
    diffLines = lines.map(line => {
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

<div class="diff-modal-overlay" on:click={onClose}>
  <div class="diff-modal-content" on:click|stopPropagation>
    <div class="diff-header">
      <h2>📊 Diff Viewer</h2>
      <button class="close-btn" on:click={onClose}>×</button>
    </div>

    {#if diffLines.length > 0}
      <!-- Unified diff view -->
      <div class="unified-diff">
        <pre class="diff-content">{#each diffLines as line}
<span class="diff-line {getLineClass(line.type)}">{line.content}
</span>{/each}</pre>
      </div>
    {:else if leftLines.length > 0 || rightLines.length > 0}
      <!-- Side-by-side view -->
      <div class="side-by-side">
        <div class="diff-pane">
          <div class="pane-header">Before</div>
          <div class="pane-content">
            {#each leftLines as line}
              <div class="code-line {getLineClass(line.type)}">
                <span class="line-num">{line.lineNum}</span>
                <span class="line-content">{line.content || ' '}</span>
              </div>
            {/each}
          </div>
        </div>

        <div class="diff-divider"></div>

        <div class="diff-pane">
          <div class="pane-header">After</div>
          <div class="pane-content">
            {#each rightLines as line}
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
    background: rgba(0, 0, 0, 0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
  }

  .diff-modal-content {
    background: #1a1a1a;
    border: 1px solid #333;
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
    padding: 1.5rem;
    border-bottom: 2px solid #646cff;
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

  .unified-diff {
    flex: 1;
    overflow: auto;
    padding: 1rem;
  }

  .diff-content {
    font-family: 'Courier New', monospace;
    font-size: 0.9rem;
    margin: 0;
    white-space: pre;
  }

  .diff-line {
    display: block;
    padding: 2px 8px;
  }

  .diff-line.line-add {
    background: #1a3a1a;
    color: #4ade80;
  }

  .diff-line.line-remove {
    background: #3a1a1a;
    color: #ef4444;
  }

  .diff-line.line-context {
    color: #ddd;
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
    background: #2a2a2a;
    padding: 0.75rem 1rem;
    font-weight: 600;
    color: #fff;
    border-bottom: 1px solid #333;
  }

  .pane-content {
    flex: 1;
    overflow: auto;
    font-family: 'Courier New', monospace;
    font-size: 0.9rem;
  }

  .diff-divider {
    width: 2px;
    background: #333;
  }

  .code-line {
    display: flex;
    padding: 2px 0;
    min-height: 20px;
  }

  .code-line.line-add {
    background: #1a3a1a;
  }

  .code-line.line-remove {
    background: #3a1a1a;
  }

  .line-num {
    display: inline-block;
    width: 50px;
    text-align: right;
    padding-right: 1rem;
    color: #666;
    user-select: none;
    flex-shrink: 0;
  }

  .line-content {
    flex: 1;
    color: #ddd;
    white-space: pre;
    padding-right: 1rem;
  }

  .code-line.line-add .line-content {
    color: #4ade80;
  }

  .code-line.line-remove .line-content {
    color: #ef4444;
  }

  .empty {
    text-align: center;
    padding: 3rem;
    color: #888;
  }
</style>
