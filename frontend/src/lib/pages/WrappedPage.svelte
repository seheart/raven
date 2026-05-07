<script>
  /**
   * WrappedPage — Spotify-Wrapped-style year-in-review.
   *
   * Renders the full-bleed sequence of cards returned by /api/wrapped
   * as a vertical stack with snap-scroll for a slide-by-slide feel.
   * No image-export yet — that's a follow-up.
   *
   * @typedef {{
   *   id:string, label:string, headline:string, stat:string,
   *   support:string|null, tone:'accent'|'success'|'info'|'warning'|'muted'
   * }} Card
   * @typedef {{
   *   window_start:string, window_end:string, span_days:number,
   *   cards: Card[], stats: Record<string, any>
   * }} WrappedPayload
   */

  import { onMount, onDestroy } from 'svelte';
  import { PageLayout } from '../components/layout/index.js';
  import { createPageApi } from '../apiClient.js';

  const { api, abort } = createPageApi();

  /** @type {WrappedPayload|null} */
  let payload = $state(null);
  let loading = $state(true);
  /** @type {string|null} */
  let loadError = $state(null);

  async function load() {
    loading = true;
    try {
      const data = await api.get('/wrapped?days=365');
      payload = data;
      loadError = null;
    } catch (err) {
      loadError = err?.message || String(err);
    } finally {
      loading = false;
    }
  }

  onMount(load);
  onDestroy(() => abort());

  /** @param {string} tone */
  function toneAccent(tone) {
    switch (tone) {
      case 'accent':  return 'text-accent';
      case 'success': return 'text-success';
      case 'info':    return 'text-info';
      case 'warning': return 'text-warning';
      default:        return 'text-muted';
    }
  }
  /** @param {string} tone */
  function toneBg(tone) {
    switch (tone) {
      case 'accent':  return 'from-accent/10 via-canvas to-canvas';
      case 'success': return 'from-success/10 via-canvas to-canvas';
      case 'info':    return 'from-info/10 via-canvas to-canvas';
      case 'warning': return 'from-warning/10 via-canvas to-canvas';
      default:        return 'from-surface via-canvas to-canvas';
    }
  }

  /** @param {string} iso */
  function fmtDate(iso) {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
</script>

<PageLayout variant="dashboard">
  <div class="min-h-screen w-full">
    {#if loading}
      <div class="flex items-center justify-center min-h-[60vh] text-sm text-muted font-mono">
        Building your Wrapped…
      </div>
    {:else if loadError}
      <div class="max-w-xl mx-auto mt-12 bg-error/10 border border-error/30 text-error rounded-lg p-4 text-sm">
        Failed to load Wrapped: {loadError}
      </div>
    {:else if payload}
      <!-- Status bar at top — non-card chrome -->
      <div class="px-6 py-3 flex items-center justify-between text-xs font-mono text-muted border-b border-border">
        <div class="flex items-center gap-2">
          <span class="text-accent font-semibold">RAVEN.WRAPPED</span>
          <span aria-hidden="true">::</span>
          <span class="uppercase tracking-wide">
            {fmtDate(payload.window_start)} – {fmtDate(payload.window_end)} · {payload.span_days} {payload.span_days === 1 ? 'day' : 'days'} of data
          </span>
        </div>
        <span class="text-[10px] uppercase tracking-wide">scroll for the whole story</span>
      </div>

      <!-- Card stack with scroll-snap so each card lands cleanly. -->
      <div class="snap-y snap-mandatory overflow-y-auto" style="height: calc(100vh - 7rem);">
        {#each payload.cards as card (card.id)}
          <section
            class="snap-start min-h-[calc(100vh-7rem)] flex items-center justify-center px-6 py-12 bg-gradient-to-b {toneBg(card.tone)}"
            aria-label={card.label}
          >
            <div class="w-full max-w-3xl">
              <div class="text-xs font-mono uppercase tracking-widest mb-4 {toneAccent(card.tone)}">
                {card.label}
              </div>
              <h2 class="text-3xl md:text-5xl font-bold text-heading tracking-[-0.025em] leading-tight mb-6">
                {card.headline}
              </h2>
              <div class="text-5xl md:text-7xl font-mono font-bold tracking-tight {toneAccent(card.tone)} mb-4 break-words">
                {card.stat}
              </div>
              {#if card.support}
                <p class="text-base md:text-lg text-body font-sans leading-relaxed">
                  {card.support}
                </p>
              {/if}
            </div>
          </section>
        {/each}
      </div>
    {/if}
  </div>
</PageLayout>
