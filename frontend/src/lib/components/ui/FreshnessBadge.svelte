<script>
  /**
   * Freshness badge — tells the user, at a glance, what flavor of data
   * they're looking at on this page:
   *
   *   mode="live"        WebSocket-driven, updates in real time as events
   *                      land. Pulsing dot.
   *   mode="polled"      Snapshot loaded on mount/refresh. Shows
   *                      "Updated Xm ago" so you can see staleness.
   *   mode="historical"  Archive across your entire timeline; not a
   *                      "now" view. Static label, warm tint.
   *
   * Drop into any PageHeader's `actions` snippet:
   *
   *   <FreshnessBadge mode="live" />
   *   <FreshnessBadge mode="polled" since={lastUpdated} />
   *   <FreshnessBadge mode="historical" label="All time" />
   *
   * @typedef {Object} Props
   * @property {'live' | 'polled' | 'historical'} mode
   * @property {Date | string | null} [since]  For 'polled': last fetch time
   * @property {string} [label]                Override the default label
   */

  /** @type {Props} */
  let { mode = 'live', since = null, label = '' } = $props();

  // Tick every 10s so "Updated 2m ago" stays accurate visually without
  // re-fetching anything. Effect cleans up on unmount.
  let tick = $state(0);
  $effect(() => {
    if (mode !== 'polled') return;
    const id = setInterval(() => (tick += 1), 10_000);
    return () => clearInterval(id);
  });

  function formatAgo(t) {
    if (!t) return '';
    const ms = Date.now() - new Date(t).getTime();
    if (ms < 10_000) return 'just now';
    if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
    if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
    if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
    return `${Math.floor(ms / 86_400_000)}d ago`;
  }

  const display = $derived.by(() => {
    void tick;
    if (label) return label;
    if (mode === 'live') return 'Live';
    if (mode === 'polled') return since ? `Updated ${formatAgo(since)}` : 'Snapshot';
    if (mode === 'historical') return 'All time';
    return '';
  });

  const tipText = $derived(
    mode === 'live'
      ? 'This page updates in real time as new events arrive. No refresh needed.'
      : mode === 'polled'
        ? 'Snapshot of the data when you last loaded or refreshed. Use the refresh button to update.'
        : 'Historical archive — shows your full recorded timeline, not just recent activity.'
  );
</script>

<span class="freshness-badge {mode}" title={tipText} aria-label="Data freshness: {display}">
  {#if mode === 'live'}
    <span class="dot pulse" aria-hidden="true"></span>
  {:else if mode === 'polled'}
    <span class="dot" aria-hidden="true"></span>
  {/if}
  <span class="label">{display}</span>
</span>

<style>
  .freshness-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;
    border-radius: 999px;
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border: 1px solid var(--border);
    background: var(--surface);
    line-height: 1;
    cursor: help;
    user-select: none;
  }
  .freshness-badge.live {
    color: var(--success);
    border-color: color-mix(in oklab, var(--success) 50%, var(--border));
  }
  .freshness-badge.polled {
    color: var(--muted);
  }
  .freshness-badge.historical {
    color: var(--chart-1);
    border-color: color-mix(in oklab, var(--chart-1) 45%, var(--border));
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    flex-shrink: 0;
  }
  .dot.pulse {
    animation: freshness-pulse 1.6s infinite;
  }

  @keyframes freshness-pulse {
    0% {
      box-shadow: 0 0 0 0 currentColor;
      opacity: 1;
    }
    70% {
      box-shadow: 0 0 0 6px transparent;
      opacity: 0.45;
    }
    100% {
      box-shadow: 0 0 0 0 transparent;
      opacity: 1;
    }
  }
</style>
