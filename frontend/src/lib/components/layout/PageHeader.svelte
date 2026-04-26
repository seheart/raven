<script>
  /**
   * Canonical page header. One per page, top of <PageLayout>.
   * Renders the h1 + description pattern; an optional actions snippet sits
   * to the right (filters, refresh button, etc.).
   *
   * @typedef {Object} Props
   * @property {string} title
   * @property {string} [description]
   * @property {import('svelte').Snippet} [actions]
   */

  /** @type {Props} */
  let { title, description, actions } = $props();
</script>

<header class="flex items-start justify-between gap-4">
  <div class="min-w-0 flex-1">
    <h1 class="text-2xl font-bold text-heading mb-1">{title}</h1>
    {#if description}
      <p class="text-sm text-muted font-sans">{description}</p>
    {/if}
  </div>
  {#if actions}
    <div class="flex-shrink-0">{@render actions()}</div>
  {/if}
</header>
