<script>
  /**
   * Anchor-styled CTA button. The link analogue of <ToolbarButton>.
   * Replaces the duplicated
   *   <a href="..." class="px-3 py-1.5 bg-surface border border-border rounded
   *                       text-sm font-sans hover:border-accent transition-colors">
   * pattern used for [ ★ Star on GitHub ], [ Send feedback ], sidebar
   * actions, and similar.
   *
   * variant="default" — outlined secondary action (most CTAs)
   * variant="primary" — accent-filled headline action
   *
   * size="md" (default) — sidebar buttons, py-2
   * size="sm"           — inline pill row, py-1.5
   *
   * Set external={true} for off-site links — adds target+rel automatically.
   *
   * @typedef {Object} Props
   * @property {string} href
   * @property {boolean} [external]
   * @property {'default' | 'primary'} [variant]
   * @property {'sm' | 'md'} [size]
   * @property {string} [class]
   * @property {string} [title]
   * @property {import('svelte').Snippet} children
   */

  /** @type {Props} */
  let {
    href,
    external = false,
    variant = 'default',
    size = 'md',
    class: extraClass = '',
    title,
    children
  } = $props();

  const variantClass = $derived(
    variant === 'primary'
      ? 'bg-accent text-canvas border-accent hover:bg-accent-strong hover:border-accent-strong'
      : 'bg-surface border-border hover:border-accent hover:text-accent'
  );
  const sizeClass = $derived(size === 'sm' ? 'px-3 py-1.5' : 'px-3 py-2');
</script>

<a
  {href}
  {title}
  target={external ? '_blank' : undefined}
  rel={external ? 'noopener noreferrer' : undefined}
  class="inline-block border rounded text-sm font-sans no-underline text-center transition-colors {sizeClass} {variantClass} {extraClass}"
  class:primary-glow={variant === 'primary'}
>
  {@render children?.()}
</a>

<style>
  /* Match ToolbarButton's phosphor-green bloom for parity. */
  :global(html.dark) .primary-glow {
    box-shadow:
      inset 0 0 0 1px rgba(74, 222, 128, 0.45),
      0 0 12px rgba(74, 222, 128, 0.15);
  }
  :global(html.dark) .primary-glow:hover {
    box-shadow:
      inset 0 0 0 1px rgba(74, 222, 128, 0.6),
      0 0 18px rgba(74, 222, 128, 0.25);
  }
</style>
