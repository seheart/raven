<script>
  /**
   * Canonical section heading. Use inside <PageLayout> for grouping content.
   * The h2 is the small uppercase label SystemPage uses; pass `meta` for
   * the trailing dim text (e.g. "· live (14 endpoints)").
   *
   * Pass an `actions` snippet for a right-aligned control on the heading row
   * (a Show/Hide toggle, a count badge, a RefreshButton) — so a section that
   * needs an inline action doesn't have to fall back to a hand-rolled header.
   *
   * @typedef {Object} Props
   * @property {string} [title]
   * @property {string} [meta]
   * @property {import('svelte').Snippet} [actions]
   * @property {import('svelte').Snippet} children
   */

  /** @type {Props} */
  let { title, meta, actions, children } = $props();
</script>

<section>
  {#if title}
    <div class="flex items-baseline justify-between gap-3 mb-3">
      <h2 class="text-xs font-semibold text-muted uppercase tracking-wide">
        {title}
        {#if meta}<span class="text-muted/60 font-normal">· {meta}</span>{/if}
      </h2>
      {#if actions}<div class="flex items-center gap-2 shrink-0">{@render actions()}</div>{/if}
    </div>
  {/if}
  {@render children()}
</section>
