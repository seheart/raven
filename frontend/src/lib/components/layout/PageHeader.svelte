<script>
  /**
   * Canonical page header. One per page, top of <PageLayout>.
   * Renders the h1 + description pattern; an optional actions snippet sits
   * to the right (filters, refresh button, etc.).
   *
   * size="default"  — text-2xl heading (most pages)
   * size="compact"  — text-sm heading for dense dashboard pages (e.g.
   *                   ProcessActivity's network monitor)
   *
   * @typedef {Object} Props
   * @property {string} title
   * @property {string} [description]
   * @property {'default' | 'compact'} [size]
   * @property {import('svelte').Snippet} [actions]
   */

  /** @type {Props} */
  let { title, description, size = 'default', actions } = $props();
</script>

{#if size === 'compact'}
  <header class="flex items-center justify-between gap-4">
    <div class="min-w-0 flex-1">
      <h1 class="text-sm font-semibold text-body">{title}</h1>
      {#if description}
        <p class="text-[10px] text-muted mt-0.5">{description}</p>
      {/if}
    </div>
    {#if actions}
      <div class="flex-shrink-0">{@render actions()}</div>
    {/if}
  </header>
{:else}
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
{/if}
