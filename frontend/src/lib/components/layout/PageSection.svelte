<script>
  /**
   * Canonical section heading. Use inside <PageLayout> for grouping content.
   * The h2 is the small uppercase label SystemPage uses; pass `meta` for
   * the trailing dim text (e.g. "· live (14 endpoints)").
   *
   * @typedef {Object} Props
   * @property {string} [title]
   * @property {string} [meta]
   * @property {import('svelte').Snippet} children
   */

  /** @type {Props} */
  let { title, meta, children } = $props();
</script>

<section>
  {#if title}
    <h2 class="text-xs font-semibold text-muted uppercase tracking-wide mb-3">
      {title}
      {#if meta}<span class="text-muted/60 font-normal">· {meta}</span>{/if}
    </h2>
  {/if}
  {@render children()}
</section>
