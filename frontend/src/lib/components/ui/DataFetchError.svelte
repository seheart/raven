<script>
  /**
   * Inline banner for failed data fetches. The "no silent failures" UX —
   * when a page's load() catches an error, render this instead of letting
   * the page go silently empty. Pair it with a retry button when the
   * caller has a reload handler.
   *
   * @typedef {Object} Props
   * @property {string} [endpoint]    The API path that failed, for the troubleshooting hint.
   * @property {string} [message]     The error message text. Optional; falls back to a generic line.
   * @property {() => void} [onRetry] If supplied, renders a Retry button.
   * @property {string} [hint]        Optional extra context shown below the message.
   */

  /** @type {Props} */
  let { endpoint, message, onRetry, hint } = $props();
</script>

<div
  role="alert"
  class="bg-error-subtle border border-error rounded p-3 mb-4 text-sm flex items-start gap-3"
>
  <span class="w-2 h-2 rounded-full bg-error flex-shrink-0 mt-1.5" aria-hidden="true"></span>
  <div class="flex-1 min-w-0">
    <div class="text-error font-mono">
      {message || 'Data fetch failed.'}
      {#if endpoint}
        <span class="text-muted ml-1">({endpoint})</span>
      {/if}
    </div>
    {#if hint}
      <div class="text-xs text-muted mt-1 leading-snug">{hint}</div>
    {/if}
  </div>
  {#if onRetry}
    <button
      type="button"
      onclick={onRetry}
      class="px-2 py-1 bg-surface border border-error rounded text-xs font-sans text-error hover:bg-error/10 transition-colors flex-shrink-0"
    >
      Retry
    </button>
  {/if}
</div>
