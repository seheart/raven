<script>
  /**
   * Centered card with a spinner + status message. Use when a section or
   * page is busy fetching its initial data. Same shell as <EmptyState> but
   * semantically different (data is coming, not absent).
   *
   * @typedef {Object} Props
   * @property {string} [message]
   */

  /** @type {Props} */
  let { message = 'Loading...' } = $props();
</script>

<div class="bg-surface border border-border rounded-lg p-12 text-center">
  <div class="w-12 h-12 border-4 border-border border-t-accent rounded-full animate-spin mx-auto mb-4"></div>
  <p class="text-sm text-muted font-sans">{message}</p>
</div>
