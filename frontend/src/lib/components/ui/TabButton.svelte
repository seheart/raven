<script>
  /**
   * Tab segment button for a connected tab group. Used inside a container
   * styled like:
   *   <div class="flex bg-surface border border-border rounded overflow-hidden">
   *     <TabButton active={…}>Today</TabButton>
   *     <TabButton active={…}>7 Days</TabButton>
   *     …
   *   </div>
   *
   * Active segment fills with accent; inactive segments are muted text.
   * No borders on the segments themselves — the parent container provides
   * the rounded outer border.
   *
   * @typedef {Object} Props
   * @property {boolean} active
   * @property {() => void} onClick
   * @property {import('svelte').Snippet} children
   */

  /** @type {Props} */
  let { active, onClick, children } = $props();
</script>

<button
  type="button"
  onclick={onClick}
  class="px-3 py-1.5 text-xs font-sans transition-colors border-0 cursor-pointer {active
    ? 'bg-accent text-canvas'
    : 'text-muted hover:text-body'}"
>
  {@render children?.()}
</button>
