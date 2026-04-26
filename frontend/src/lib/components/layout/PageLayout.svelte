<script>
  /**
   * Canonical page shell. Every page should be wrapped in <PageLayout>.
   * variant="default"   — content pages (System, About, Settings, ...). Default padded shell.
   * variant="dashboard" — full-bleed pages that fill the viewport (Live, Overview, Agent Monitoring).
   *                       No outer padding; the page manages its own scroll regions.
   *
   * @typedef {Object} Props
   * @property {import('svelte').Snippet} children
   * @property {'default' | 'dashboard'} [variant]
   */

  /** @type {Props} */
  let { children, variant = 'default' } = $props();
</script>

{#if variant === 'dashboard'}
  <div class="min-h-screen bg-canvas">
    {@render children()}
  </div>
{:else}
  <div class="min-h-screen bg-canvas p-6 pb-20">
    <div class="max-w-none space-y-8">
      {@render children()}
    </div>
  </div>
{/if}
