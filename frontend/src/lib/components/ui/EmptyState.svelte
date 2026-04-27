<script>
  /**
   * Centered empty/no-data card. Use when a section or page has nothing to
   * show. Replaces the duplicated pattern:
   *   <div class="bg-surface border border-border rounded-lg p-12 text-center">…</div>
   *
   * @typedef {Object} Props
   * @property {string} title
   * @property {string} [description]
   * @property {string} [icon]                 — emoji or single glyph; rendered at 4xl size
   * @property {'default' | 'compact'} [size]  — compact uses p-8 instead of p-12
   * @property {import('svelte').Snippet} [actions]
   */

  /** @type {Props} */
  let { title, description, icon, size = 'default', actions } = $props();

  const padding = $derived(size === 'compact' ? 'p-8' : 'p-12');
</script>

<div class="bg-surface border border-border rounded-lg {padding} text-center">
  {#if icon}
    <div class="text-4xl mb-4 opacity-30">{icon}</div>
  {/if}
  {#if title}
    <h3 class="text-lg font-bold text-heading mb-2">{title}</h3>
  {/if}
  {#if description}
    <p class="text-sm text-muted font-sans">{description}</p>
  {/if}
  {#if actions}
    <div class="mt-6">{@render actions()}</div>
  {/if}
</div>
