<script>
  /**
   * Bordered filter toggle button. Shows accent-subtle background when
   * active, muted surface when inactive. Used in groups for filter pills
   * (severity filters, mode toggles, auto-refresh switch).
   *
   * @typedef {Object} Props
   * @property {boolean} active
   * @property {() => void} onClick
   * @property {boolean} [disabled]
   * @property {import('svelte').Snippet} children
   */

  /** @type {Props} */
  let { active, onClick, disabled = false, children } = $props();
</script>

<button
  type="button"
  onclick={onClick}
  {disabled}
  class="px-3 py-1.5 border rounded text-sm font-sans transition-colors disabled:opacity-50 {active
    ? 'bg-accent-subtle border-accent text-accent'
    : 'bg-surface border-border text-muted hover:border-accent'}"
>
  {@render children?.()}
</button>
