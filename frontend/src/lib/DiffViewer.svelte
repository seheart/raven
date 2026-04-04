<script>
  export let diff = '';
  export let oldContent = '';
  export let newContent = '';
  export let onClose = () => {};

  let diffLines = [];
  let leftLines = [];
  let rightLines = [];

  $: {
    if (diff) {
      parseDiff(diff);
    } else if (oldContent || newContent) {
      parseContents(oldContent, newContent);
    }
  }

  function parseDiff(diffText) {
    const lines = (diffText || '').split('\n');
    diffLines = lines
      .filter(line => line != null)
      .map(line => {
        if (line.startsWith('+') && !line.startsWith('+++'))
          return { type: 'add', content: line.substring(1) };
        if (line.startsWith('-') && !line.startsWith('---'))
          return { type: 'remove', content: line.substring(1) };
        if (line.startsWith(' ')) return { type: 'context', content: line.substring(1) };
        return { type: 'meta', content: line };
      })
      .filter(line => line.type !== 'meta');
  }

  function parseContents(old, newText) {
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
        if (oldLine) leftLines.push({ type: 'remove', content: oldLine, lineNum: i + 1 });
        if (newLine) rightLines.push({ type: 'add', content: newLine, lineNum: i + 1 });
      }
    }
  }
</script>

<div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
  <div
    class="flex justify-between items-center px-4 py-2 border-b border-[var(--border)] bg-[var(--bg)]"
  >
    <span class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Diff</span>
    <button onclick={onClose} class="text-xs text-[var(--accent)] hover:underline">Close</button>
  </div>

  {#if diffLines.length > 0}
    <pre
      class="text-xs font-mono p-3 overflow-auto max-h-96 m-0">{#each diffLines as line (line.content)}<span
          class={line.type === 'add'
            ? 'block bg-[var(--success-subtle)] text-[var(--success)]'
            : line.type === 'remove'
              ? 'block bg-[var(--error-subtle)] text-[var(--error)]'
              : 'block text-[var(--text)]'}
          >{line.content}
</span>{/each}</pre>
  {:else if leftLines.length > 0}
    <div
      class="grid grid-cols-2 divide-x divide-[var(--border)] text-xs font-mono overflow-auto max-h-96"
    >
      <div>
        {#each leftLines as line (line.lineNum)}
          <div
            class="px-3 py-0.5 {line.type === 'remove'
              ? 'bg-[var(--error-subtle)] text-[var(--error)]'
              : 'text-[var(--text)]'}"
          >
            <span class="text-[var(--muted)] inline-block w-8 text-right mr-2">{line.lineNum}</span
            >{line.content}
          </div>
        {/each}
      </div>
      <div>
        {#each rightLines as line (line.lineNum)}
          <div
            class="px-3 py-0.5 {line.type === 'add'
              ? 'bg-[var(--success-subtle)] text-[var(--success)]'
              : 'text-[var(--text)]'}"
          >
            <span class="text-[var(--muted)] inline-block w-8 text-right mr-2">{line.lineNum}</span
            >{line.content}
          </div>
        {/each}
      </div>
    </div>
  {:else}
    <div class="p-6 text-center text-sm text-[var(--muted)]">No diff available</div>
  {/if}
</div>
