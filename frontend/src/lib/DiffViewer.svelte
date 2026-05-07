<script>
  /**
   * DiffViewer
   *
   * Renders a unified or side-by-side diff. Optionally surfaces inline
   * risk annotations (per-line + file-level) supplied by the caller —
   * typically fetched from `/api/diffs/:event_id`. Annotations render as
   * gutter pills with hover tooltips and a header severity badge.
   *
   * @typedef {{ line_number:number, severity:'critical'|'warning'|'info', rule_id:string, rule_name:string, message:string, match_text?:string|null }} Annotation
   */

  export let diff = '';
  export let oldContent = '';
  export let newContent = '';
  export let onClose = () => {};
  /** @type {Annotation[]} */
  export let annotations = [];

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

  // Index annotations by new-file line number. Line 0 is reserved for
  // file-level findings (e.g. "this is an .env edit").
  $: annotationsByLine = (() => {
    const m = new Map();
    for (const a of annotations || []) {
      const arr = m.get(a.line_number) || [];
      arr.push(a);
      m.set(a.line_number, arr);
    }
    return m;
  })();

  $: fileLevel = annotationsByLine.get(0) || [];

  // Highest severity across all annotations — drives the header badge.
  $: highestSeverity = (() => {
    let best = null;
    for (const a of annotations || []) {
      if (a.severity === 'critical') return 'critical';
      if (a.severity === 'warning') best = best === 'critical' ? best : 'warning';
      else if (!best && a.severity === 'info') best = 'info';
    }
    return best;
  })();

  $: severityCounts = (() => {
    const c = { critical: 0, warning: 0, info: 0 };
    for (const a of annotations || []) {
      if (a.severity in c) c[a.severity]++;
    }
    return c;
  })();

  function parseDiff(diffText) {
    const lines = (diffText || '').split('\n');
    let newLineNo = 0;
    diffLines = lines
      .filter(line => line != null)
      .map(line => {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          newLineNo++;
          return { type: 'add', content: line.substring(1), newLineNo };
        }
        if (line.startsWith('-') && !line.startsWith('---'))
          return { type: 'remove', content: line.substring(1), newLineNo: null };
        if (line.startsWith(' ')) {
          newLineNo++;
          return { type: 'context', content: line.substring(1), newLineNo };
        }
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

  /** @param {string} sev */
  function severityClass(sev) {
    switch (sev) {
      case 'critical': return 'bg-[var(--error)]/15 text-[var(--error)] border-[var(--error)]/30';
      case 'warning': return 'bg-[var(--warning)]/15 text-[var(--warning)] border-[var(--warning)]/30';
      case 'info': return 'bg-[var(--info)]/15 text-[var(--info)] border-[var(--info)]/30';
      default: return 'bg-[var(--surface-2)] text-[var(--muted)] border-[var(--border)]';
    }
  }

  /** @param {string} sev */
  function severityGlyph(sev) {
    switch (sev) {
      case 'critical': return '!';
      case 'warning': return '⚠';
      case 'info': return 'i';
      default: return '·';
    }
  }
</script>

<div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
  <div
    class="flex justify-between items-center gap-3 px-4 py-2 border-b border-[var(--border)] bg-[var(--bg)]"
  >
    <div class="flex items-center gap-3 min-w-0">
      <span class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Diff</span>
      {#if highestSeverity}
        <span
          class="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold px-2 py-0.5 rounded border {severityClass(highestSeverity)}"
          title="{annotations.length} risk annotation{annotations.length === 1 ? '' : 's'} on this diff"
        >
          <span aria-hidden="true">{severityGlyph(highestSeverity)}</span>
          <span class="uppercase tracking-wide">{highestSeverity}</span>
          <span class="font-normal opacity-80">
            {#if severityCounts.critical}{severityCounts.critical}c{/if}{#if severityCounts.warning}{severityCounts.critical ? ' ' : ''}{severityCounts.warning}w{/if}{#if severityCounts.info}{severityCounts.critical || severityCounts.warning ? ' ' : ''}{severityCounts.info}i{/if}
          </span>
        </span>
      {/if}
    </div>
    <button onclick={onClose} class="text-xs text-[var(--accent)] hover:underline">Close</button>
  </div>

  {#if fileLevel.length > 0}
    <div class="px-4 py-2 border-b border-[var(--border)] space-y-1 bg-[var(--bg)]/40">
      {#each fileLevel as a (a.rule_id + a.message)}
        <div class="flex items-start gap-2 text-xs font-sans">
          <span
            class="inline-flex items-center justify-center w-4 h-4 rounded text-[10px] font-bold border flex-shrink-0 {severityClass(a.severity)}"
            aria-hidden="true">{severityGlyph(a.severity)}</span>
          <span class="text-[var(--text)]"><span class="font-semibold">{a.rule_name}:</span> {a.message}</span>
        </div>
      {/each}
    </div>
  {/if}

  {#if diffLines.length > 0}
    <pre
      class="text-xs font-mono p-0 overflow-auto max-h-96 m-0">{#each diffLines as line, idx (idx)}{@const ann = line.newLineNo ? annotationsByLine.get(line.newLineNo) : null}<span
          class={(line.type === 'add'
            ? 'flex bg-[var(--success-subtle)] text-[var(--success)]'
            : line.type === 'remove'
              ? 'flex bg-[var(--error-subtle)] text-[var(--error)]'
              : 'flex text-[var(--text)]') + (ann ? ' annotated' : '')}
        ><span class="inline-block w-7 flex-shrink-0 text-right pr-2 text-[var(--muted)] select-none">{line.newLineNo ?? ''}</span><span class="inline-block w-5 flex-shrink-0 text-center">{#if ann}<span
              class="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold border {severityClass(ann[0].severity)}"
              title={ann.map(x => `${x.rule_name}: ${x.message}`).join('\n')}
              aria-label="{ann.length} risk annotation{ann.length === 1 ? '' : 's'}: {ann.map(x => x.rule_name).join(', ')}"
              >{severityGlyph(ann[0].severity)}</span>{/if}</span><span class="flex-1 px-2 whitespace-pre-wrap">{line.content}</span></span>
{/each}</pre>
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
          {@const ann = annotationsByLine.get(line.lineNum)}
          <div
            class="px-3 py-0.5 flex items-baseline gap-1 {line.type === 'add'
              ? 'bg-[var(--success-subtle)] text-[var(--success)]'
              : 'text-[var(--text)]'}"
          >
            <span class="text-[var(--muted)] inline-block w-8 text-right">{line.lineNum}</span>
            <span class="inline-block w-5 text-center">
              {#if ann}
                <span
                  class="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold border {severityClass(ann[0].severity)}"
                  title={ann.map(x => `${x.rule_name}: ${x.message}`).join('\n')}
                  aria-label="risk: {ann.map(x => x.rule_name).join(', ')}"
                >{severityGlyph(ann[0].severity)}</span>
              {/if}
            </span>
            <span class="flex-1 whitespace-pre-wrap">{line.content}</span>
          </div>
        {/each}
      </div>
    </div>
  {:else}
    <div class="p-6 text-center text-sm text-[var(--muted)]">No diff available</div>
  {/if}
</div>
