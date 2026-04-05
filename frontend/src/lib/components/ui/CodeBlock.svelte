<script>
  /**
   * CodeBlock Component - Raven UI Library
   * Display code snippets with syntax highlighting, line numbers, and copy functionality
   *
   * @component
   * @example
   * <CodeBlock
   *   code={`const hello = 'world';
   * console.log(hello);`}
   *   language="javascript"
   * />
   *
   * @example
   * <CodeBlock
   *   code={jsonData}
   *   language="json"
   *   showLineNumbers={true}
   *   copyable={true}
   * />
   */

  let {
    /** Code content to display */
    code = '',
    /** Programming language (for labeling) */
    language = '',
    /** Show line numbers */
    showLineNumbers = false,
    /** Enable copy button */
    copyable = true,
    /** Max height (scrollable) */
    maxHeight = undefined,
    /** Title/filename */
    title = '',
    /** Additional CSS classes */
    class: className = '',
    ...restProps
  } = $props();

  // Copy state
  let copied = $state(false);

  // Copy code to clipboard
  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      copied = true;
      setTimeout(() => {
        copied = false;
      }, 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  }

  // Split code into lines
  const lines = $derived(code.split('\n'));

  // Container classes
  const containerClasses = `bg-[var(--code-bg)] border border-[var(--code-border)] rounded-lg overflow-hidden font-mono ${className}`;

  // Pre classes with optional max height
  const preClasses = maxHeight
    ? `overflow-auto text-sm text-[var(--code-text)] p-4 ${maxHeight}`
    : 'overflow-auto text-sm text-[var(--code-text)] p-4';
</script>

<div class={containerClasses} {...restProps}>
  <!-- Header -->
  {#if title || language || copyable}
    <div
      class="flex items-center justify-between px-4 py-2 bg-[var(--surface-2)] border-b border-[var(--code-border)]"
    >
      <div class="flex items-center gap-2">
        {#if title}
          <span class="text-xs font-semibold text-[var(--text)] font-sans">{title}</span>
        {/if}
        {#if language}
          <span
            class="px-2 py-0.5 text-[10px] font-bold bg-[var(--accent)] bg-opacity-15 text-[var(--accent)] rounded uppercase tracking-wide"
          >
            {language}
          </span>
        {/if}
      </div>

      {#if copyable}
        <button
          onclick={copyCode}
          class="px-2 py-1 text-xs font-sans text-[var(--muted)] hover:text-[var(--accent)] transition-colors duration-150 rounded hover:bg-[var(--accent)] hover:bg-opacity-10"
          aria-label="Copy code"
        >
          {copied ? ' Copied' : ' Copy'}
        </button>
      {/if}
    </div>
  {/if}

  <!-- Code content -->
  <pre class={preClasses}><code
      >{#if showLineNumbers}<div class="flex">{#each lines as line, index (index)}<div
              class="flex-shrink-0 w-12 text-right pr-4 text-[var(--muted)] select-none user-select-none"
              aria-hidden="true">{index + 1}</div><div class="flex-1">{line}
</div>{/each}</div>{:else}{code}{/if}</code
    ></pre>
</div>

<style>
  /* Prevent line number selection */
  pre {
    tab-size: 2;
  }

  code {
    font-family: var(--mono);
    white-space: pre;
  }
</style>
