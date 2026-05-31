<!-- design-system-skip: infrastructure component, not a user-facing primitive -->
<script>
  /**
   * ErrorBoundary — wraps a subtree so a render/effect crash only degrades
   * that subtree. Built on Svelte 5's native <svelte:boundary> (available
   * since 5.3). When children throw, we render a polite fallback card and
   * log the error to the backend; the rest of the app (header, nav, footer,
   * websocket, toasts, sibling tabs) stays alive.
   *
   * Usage:
   *   <ErrorBoundary name="Dashboard">
   *     <DashboardPage />
   *   </ErrorBoundary>
   *
   * @typedef {Object} Props
   * @property {import('svelte').Snippet} children
   * @property {string} [name]   Label for logs and the fallback heading context.
   */

  import { logError } from '../../errorLogger.js';
  import { logger } from '../../logger.js';

  /** @type {Props} */
  let { children, name = 'view' } = $props();

  /**
   * Forward render/effect errors to the same backend pipeline pages use for
   * data-fetch failures. Swallow logging errors — we already have a fallback
   * rendered, so a failed POST shouldn't escalate.
   * @param {unknown} error
   */
  function reportError(error) {
    try {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`[ErrorBoundary:${name}]`, err);
      logError(err, `ErrorBoundary:${name}`, {
        url: typeof window !== 'undefined' ? window.location.href : null
      });
    } catch (_) {
      // never throw from the error handler
    }
  }
</script>

<svelte:boundary onerror={reportError}>
  {@render children()}

  {#snippet failed(error, reset)}
    <div class="p-6">
      <div
        role="alert"
        class="bg-surface border border-border rounded-lg p-6 max-w-[48rem] mx-auto"
      >
        <h2 class="text-lg font-bold text-error font-mono mb-2">Something broke in this view.</h2>
        <p class="text-sm text-muted font-sans mb-4">
          The rest of Raven is still running — header, navigation, and other tabs should work. You
          can retry this view, or report it so we can fix the underlying bug.
        </p>

        <details class="mb-4">
          <summary
            class="cursor-pointer text-xs font-mono text-muted hover:text-text transition-colors"
          >
            Error details
          </summary>
          <pre
            class="mt-2 text-xs font-mono text-error bg-canvas border border-border rounded p-3 overflow-auto max-h-48 whitespace-pre-wrap break-words">{(error &&
              /** @type {Error} */ (error).message) ||
              String(error) ||
              'Unknown error'}{error && /** @type {Error} */ (error).stack
              ? '\n\n' + /** @type {Error} */ (error).stack
              : ''}</pre>
        </details>

        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            onclick={reset}
            class="px-3 py-1.5 bg-surface border border-border rounded text-sm font-sans hover:border-accent transition-colors"
          >
            Try again
          </button>
          <a
            href="https://github.com/seheart/raven/issues/new"
            target="_blank"
            rel="noopener noreferrer"
            class="px-3 py-1.5 bg-surface border border-border rounded text-sm font-sans hover:border-accent transition-colors inline-block"
          >
            Report this on GitHub
          </a>
        </div>
      </div>
    </div>
  {/snippet}
</svelte:boundary>
