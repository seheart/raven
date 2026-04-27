<script>
  /**
   * Constrains body content to a comfortable reading width.
   * Use for prose-heavy units (heros, manifestos, principle bodies, callouts)
   * inside otherwise full-bleed pages. Data UI — tables, grids, charts,
   * cards — should stay full width.
   *
   * Centered horizontally by default so the empty canvas sits evenly on both
   * sides instead of piling up on the right (the "cut off" look). Pass
   * align="left" to anchor at the page's left edge instead.
   *
   * width="default" — 42rem / ~70ch, fits ~12 words per line
   * width="wide"    — 48rem, for prose mixed with inline code or quotes
   *
   * @typedef {Object} Props
   * @property {import('svelte').Snippet} children
   * @property {'default' | 'wide'} [width]
   * @property {'center' | 'left'} [align]
   * @property {string} [class]
   */

  /** @type {Props} */
  let { children, width = 'default', align = 'left', class: extra = '' } = $props();

  const widthClass = width === 'wide' ? 'max-w-[48rem]' : 'max-w-[42rem]';
  const alignClass = align === 'center' ? 'mx-auto' : '';
</script>

<div class="{widthClass} {alignClass} {extra}">
  {@render children()}
</div>
