<script>
  /**
   * Canonical refresh button — used in nearly every page's PageHeader actions
   * slot. Handles the standard "..." while loading + "↻" idle states. Use
   * this instead of hand-rolling a button so the visual style stays in one
   * place.
   *
   * @typedef {Object} Props
   * @property {() => void} onClick
   * @property {boolean} [loading]
   * @property {string} [label]
   * @property {string} [class] — extra classes for positioning overrides
   */

  /** @type {Props} */
  let { onClick, loading = false, label = 'Refresh', class: extraClass = '' } = $props();
</script>

<button
  onclick={onClick}
  disabled={loading}
  class="px-3 py-1.5 bg-surface border border-border rounded text-sm font-sans hover:border-accent transition-colors disabled:opacity-50 {extraClass}"
>
  {loading ? '...' : '↻'} {label}
</button>
