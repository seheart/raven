<script>
  /**
   * The standard toolbar button used inside <PageHeader> actions and inside
   * pages alongside other controls. Replaces the duplicated
   *   <button class="px-3 py-1.5 bg-surface border border-border rounded
   *                  text-sm font-sans hover:border-accent transition-colors
   *                  disabled:opacity-50">…</button>
   * pattern.
   *
   * variant="default" — the canonical secondary action (Export, Auto-refresh,
   *                     filter toggles, etc.)
   * variant="primary" — accent-filled action (Run Now, + Add)
   * variant="danger"  — destructive action (Resolve All, Clear All, Delete)
   *
   * For the specific case of a refresh button (with the ...|↻ chrome and a
   * loading state), use <RefreshButton> instead — it's a specialization.
   *
   * @typedef {Object} Props
   * @property {() => void} [onClick]
   * @property {boolean} [disabled]
   * @property {'default' | 'primary' | 'danger'} [variant]
   * @property {string} [class]
   * @property {string} [title]
   * @property {import('svelte').Snippet} children
   */

  /** @type {Props} */
  let {
    onClick,
    disabled = false,
    variant = 'default',
    class: extraClass = '',
    title,
    children
  } = $props();

  const variantClass =
    variant === 'primary'
      ? 'bg-accent text-white border-accent hover:opacity-90'
      : variant === 'danger'
        ? 'bg-surface text-error border-error hover:bg-error-subtle'
        : 'bg-surface border-border hover:border-accent';
</script>

<button
  type="button"
  onclick={onClick}
  {disabled}
  {title}
  class="px-3 py-1.5 border rounded text-sm font-sans transition-colors disabled:opacity-50 {variantClass} {extraClass}"
>
  {@render children?.()}
</button>
