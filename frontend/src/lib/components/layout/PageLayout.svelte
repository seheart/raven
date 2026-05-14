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
  <!--
    Narrow widths (footer hidden, <lg): trim outer padding to p-4 and drop the
    pb-20 footer compensation so dense pages don't waste a thumb of canvas on
    every edge. Wide widths keep the canonical p-6 / pb-20 footer clearance.
  -->
  <div class="min-h-screen bg-canvas p-4 lg:p-6 pb-6 lg:pb-20">
    <div class="max-w-none space-y-6 lg:space-y-8">
      {@render children()}
    </div>
  </div>
{/if}
