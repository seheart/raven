<script>
  /**
   * WrappedPage — Spotify-Wrapped-style year-in-review.
   *
   * Story flow: 10 cards (opener → 8 stats → closing). Each card is one
   * full viewport tall and scroll-snaps so the next slides in cleanly.
   *
   * Key design choices, learned from the previous version:
   *
   *  1. Scroll-snap on the page itself (NOT a nested overflow:auto
   *     container). The earlier version's nested container fought with
   *     document scroll and the wheel events frequently went nowhere —
   *     "scroll doesn't even work" in the user's words.
   *
   *  2. Page indicators on the right edge. Each dot is a clickable
   *     anchor that smooth-scrolls to its card. Keyboard ↑/↓ arrows also
   *     advance one card at a time.
   *
   *  3. Card backgrounds use the warm Anthropic chart palette via
   *     bg-[var(--chart-N)]/X tokens — same family as the graphs, so the
   *     whole app feels cohesive.
   *
   *  4. Cards lazy-fade-in via IntersectionObserver to avoid the
   *     "everything is mounted at full opacity" flat feel; even on a
   *     slow box this stays cheap because each card just toggles a class.
   */

  import { onMount, onDestroy } from 'svelte';
  import { createPageApi } from '../apiClient.js';
  import { DataFetchError } from '../components/ui/index.js';
  import { settings } from '../stores/settingsStore.js';
  import { get } from 'svelte/store';

  const { api, abort } = createPageApi();

  /** @type {{
   *   window_start:string, window_end:string, span_days:number,
   *   cards: Array<{id:string,label:string,headline:string,stat:string,support:string|null,tone:string}>,
   *   stats: Record<string, any>
   * }|null} */
  let payload = $state(null);
  let loading = $state(true);
  /** @type {string|null} */
  let loadError = $state(null);
  let activeIdx = $state(0);
  // Subscription-aware framing for the spend card. Backend returns
  // neutral copy ("That much thinking, valued at $X at API rates");
  // here we relabel it on top of that for Claude Max users so the
  // giant dollar figure doesn't read as "money you spent."
  let billingMode = $state(get(settings)?.billing?.mode || 'subscription');
  let planName = $state(get(settings)?.billing?.planName || 'Claude Max');
  const unsubBilling = settings.subscribe(s => {
    billingMode = s?.billing?.mode || 'subscription';
    planName = s?.billing?.planName || 'Claude Max';
  });
  /** Cards that have ever been intersected — drives the fade-in class.
   *  Tracked in state (instead of imperatively setting a class on the
   *  DOM node) so Svelte's scoped CSS sees the selector and keeps it. */
  let seenCards = $state(new Set());
  /** @type {HTMLElement|null} */
  let stackEl = $state(null);

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

  function scrollToCard(idx) {
    const card = stackEl?.querySelectorAll?.('section[data-card]')?.[idx];
    if (card && typeof card.scrollIntoView === 'function') {
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function onKey(e) {
    // Bail if there are no cards — a brand-new install with no activity can
    // return an empty deck, and `cards.length - 1` would be -1 (scrollToCard
    // would no-op but the preventDefault still hijacks keys for nothing).
    if (!payload?.cards?.length) return;
    const last = payload.cards.length - 1;
    if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
      e.preventDefault();
      scrollToCard(Math.min(activeIdx + 1, last));
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault();
      scrollToCard(Math.max(activeIdx - 1, 0));
    } else if (e.key === 'Home') {
      e.preventDefault();
      scrollToCard(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      scrollToCard(last);
    }
  }

  /** @type {IntersectionObserver|null} */
  let observer = null;
  $effect(() => {
    if (!payload || !stackEl) return;
    if (observer) observer.disconnect();
    // 60% threshold so the indicator only flips when the next card is
    // mostly on-screen — avoids flicker mid-scroll on slower phones.
    observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = Number(entry.target.getAttribute('data-card'));
            if (!Number.isFinite(idx)) continue;
            activeIdx = idx;
            // Reactive Set update so the class binding re-evaluates.
            // Svelte's scoped CSS won't pick up classes added via
            // classList.add(), which previously left every card stuck
            // at opacity:0 because .card.is-visible got compiled out
            // as an "unused selector".
            if (!seenCards.has(idx)) {
              seenCards = new Set([...seenCards, idx]);
            }
          }
        }
      },
      { threshold: [0.6] }
    );
    const sections = stackEl.querySelectorAll('section[data-card]');
    sections.forEach(s => observer.observe(s));
    return () => observer?.disconnect();
  });

  onMount(() => {
    load();
    window.addEventListener('keydown', onKey);
  });

  onDestroy(() => {
    abort();
    observer?.disconnect();
    window.removeEventListener('keydown', onKey);
    unsubBilling();
  });

  // Subscription-aware overrides on top of the backend's neutral copy.
  // Backend says "valued at $X at API rates" already; on subscription
  // we add the explicit "you didn't pay this" reassurance.
  function massageCard(card) {
    if (card.id !== 'spend' || billingMode === 'api') return card;
    return {
      ...card,
      label: 'Compute used',
      headline: card.headline,
      support: `Your ${planName} subscription covered all of this — that dollar figure is the API-rate equivalent. ${card.support}`
    };
  }

  // Tone → CSS variable. Pulls from the new --chart-N palette so cards
  // use the same warm rust / peach / amber / coral / teal sequence as the
  // graphs. Three tones recycle through the palette so a 10-card stack
  // doesn't repeat hues back-to-back.
  function toneStyle(tone, idx) {
    const seq = [
      '--chart-1', // rust
      '--chart-3', // amber
      '--chart-2', // peach
      '--chart-6', // teal (contrast break)
      '--chart-4', // coral
      '--chart-5', // sienna
      '--chart-7', // violet
      '--chart-1', // rust again for the home stretch
      '--chart-3',
      '--chart-6'
    ];
    const colorVar = seq[idx % seq.length];
    return `--card-color: var(${colorVar});`;
  }

  /** @param {string} iso */
  function fmtDate(iso) {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function spanLabel(p) {
    if (!p) return '';
    const d = p.span_days;
    if (d >= 350) return `your year with Raven`;
    if (d >= 28) return `your last ${d} days`;
    if (d > 1) return `your first ${d} days`;
    return `your first day`;
  }
</script>

<svelte:head>
  <title>Looking Back · Raven</title>
</svelte:head>

<div class="wrapped-root" bind:this={stackEl}>
  {#if loading}
    <div class="loading-state">
      <div class="pulse-dot"></div>
      <span>Looking back through the year…</span>
    </div>
  {:else if loadError}
    <div class="error-wrap">
      <DataFetchError
        endpoint="/api/wrapped"
        message="Failed to load Looking Back"
        hint={loadError}
        onRetry={load}
      />
    </div>
  {:else if payload && !payload.cards?.length}
    <!-- Empty deck: a fresh install with no activity yet. Without this the
         rail counter reads "01 / 00" and the keyboard nav has nothing to
         move through. -->
    <div class="empty-wrap">
      <h2 class="empty-title">Nothing to look back on yet</h2>
      <p class="empty-body">
        Once you've spent some time working with Raven, this is where your year-in-review will live
        — the projects you lived in, the tools that carried you, the shape of your months. Come back
        after a few sessions.
      </p>
    </div>
  {:else if payload}
    <!-- Side rail: window label + dot indicators. Fixed so it floats on
         every card. Each dot is a focusable button so keyboard users can
         tab to it; click smooth-scrolls to that card. -->
    <aside class="rail" aria-label="Looking Back navigation">
      <div class="rail-window">
        <span class="rail-window-label">{spanLabel(payload)}</span>
        <span class="rail-window-range"
          >{fmtDate(payload.window_start)} – {fmtDate(payload.window_end)}</span
        >
      </div>
      <div class="rail-dots" role="tablist">
        {#each payload.cards as card, i (card.id)}
          <button
            type="button"
            role="tab"
            aria-selected={activeIdx === i}
            aria-label="Go to {card.label}"
            class="rail-dot"
            class:is-active={activeIdx === i}
            onclick={() => scrollToCard(i)}
          ></button>
        {/each}
      </div>
      <div class="rail-counter">
        <span class="rail-counter-num">{String(activeIdx + 1).padStart(2, '0')}</span>
        <span class="rail-counter-sep">/</span>
        <span class="rail-counter-tot">{String(payload.cards.length).padStart(2, '0')}</span>
      </div>
      <!-- Discoverability: the global keydown handler hijacks space / arrows
           to advance cards, so tell the user that's possible. -->
      <div class="rail-hint">space / ↑ ↓ to move</div>
    </aside>

    <!-- Narrow-width progress strip — sticky to the top of the scroll
         region. Replaces the side rail (which is hidden below xl) so
         users still see where they are in the card sequence. -->
    <!-- Below xl the side rail (the accessible position indicator) is
         display:none, so this strip is the ONLY position cue. Make it a
         polite live region with a spoken label so SR users at narrow widths
         still hear where they are as cards advance. -->
    <div
      class="narrow-progress xl:hidden"
      role="status"
      aria-live="polite"
      aria-label="Card {activeIdx + 1} of {payload.cards.length}. Use space or arrow keys to move."
    >
      <span class="narrow-progress-num" aria-hidden="true"
        >{String(activeIdx + 1).padStart(2, '0')}</span
      >
      <span class="narrow-progress-sep" aria-hidden="true">/</span>
      <span class="narrow-progress-tot" aria-hidden="true"
        >{String(payload.cards.length).padStart(2, '0')}</span
      >
      <span class="narrow-progress-bar" aria-hidden="true">
        <span
          class="narrow-progress-bar-fill"
          style="width: {((activeIdx + 1) / payload.cards.length) * 100}%"
        ></span>
      </span>
      <span class="narrow-progress-hint" aria-hidden="true">space / arrows</span>
    </div>

    {#each payload.cards as rawCard, i (rawCard.id)}
      {@const card = massageCard(rawCard)}
      <section
        data-card={i}
        class="card"
        class:is-visible={seenCards.has(i) || i === 0}
        class:is-opener={i === 0}
        class:is-closing={i === payload.cards.length - 1}
        style={toneStyle(card.tone, i)}
        aria-label={card.label}
      >
        <div class="card-inner">
          <div class="card-label">{card.label}</div>
          <h2 class="card-headline">{card.headline}</h2>
          <div class="card-stat">{card.stat}</div>
          {#if card.support}
            <p class="card-support">{card.support}</p>
          {/if}
          {#if i < payload.cards.length - 1}
            <button
              type="button"
              class="card-next"
              aria-label="Next slide"
              onclick={() => scrollToCard(i + 1)}
            >
              ↓ next
            </button>
          {/if}
        </div>
      </section>
    {/each}
  {/if}
</div>

<style>
  /* Page-level scroll-snap — works on the document scroll, not a nested
     container, so the user's wheel events always do the right thing.
     Earlier nested-overflow approach intermittently swallowed the scroll
     because the outer body and inner div both wanted to be scrollable. */
  .wrapped-root {
    scroll-snap-type: y mandatory;
    /* Fallback: contain layout/paint to keep snap behavior cheap. */
    contain: layout paint;
  }

  .loading-state {
    min-height: 70vh;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    color: var(--muted);
    font-family: var(--font-mono, monospace);
    font-size: 0.85rem;
  }
  .pulse-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--chart-1);
    /* Token-derived so the pulse halo adapts between light/dark instead of
       being pinned to the light-mode --chart-1 literal. */
    box-shadow: 0 0 0 0 color-mix(in oklab, var(--chart-1) 50%, transparent);
    animation: pulse 1.6s infinite;
  }

  @keyframes pulse {
    0% {
      box-shadow: 0 0 0 0 color-mix(in oklab, var(--chart-1) 40%, transparent);
    }
    70% {
      box-shadow: 0 0 0 14px color-mix(in oklab, var(--chart-1) 0%, transparent);
    }
    100% {
      box-shadow: 0 0 0 0 color-mix(in oklab, var(--chart-1) 0%, transparent);
    }
  }

  .error-wrap {
    max-width: 36rem;
    margin: 4rem auto;
    padding: 0 1.5rem;
  }

  .empty-wrap {
    max-width: 36rem;
    margin: 6rem auto;
    padding: 0 1.5rem;
    text-align: center;
  }
  .empty-title {
    font-size: clamp(1.5rem, 3vw, 2rem);
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--text-heading);
    margin: 0 0 1rem 0;
  }
  .empty-body {
    color: var(--muted);
    font-family: var(--font-sans, system-ui);
    font-size: 1rem;
    line-height: 1.6;
    margin: 0;
  }

  /* Side rail. Fixed positioning + a small responsive breakpoint hide on
     narrow screens (the dots become a top progress strip if we ever want
     mobile, but for now we just keep them inline at the right). */
  .rail {
    position: fixed;
    right: 1.5rem;
    top: 50%;
    transform: translateY(-50%);
    z-index: 30;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 1rem;
    pointer-events: none;
  }
  .rail > * {
    pointer-events: auto;
  }
  .rail-window {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    text-align: right;
    gap: 0.15rem;
    font-family: var(--font-mono, monospace);
    font-size: 10px;
  }
  .rail-window-label {
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text);
    font-weight: 600;
  }
  .rail-window-range {
    color: var(--muted);
  }
  .rail-dots {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .rail-dot {
    appearance: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1px solid var(--border);
    background: transparent;
    padding: 0;
    cursor: pointer;
    transition:
      background 0.18s ease,
      border-color 0.18s ease,
      transform 0.18s ease;
  }
  .rail-dot:hover {
    border-color: var(--chart-1);
  }
  .rail-dot.is-active {
    background: var(--chart-1);
    border-color: var(--chart-1);
    transform: scale(1.3);
  }
  .rail-counter {
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    color: var(--muted);
    letter-spacing: 0.04em;
  }
  .rail-counter-num {
    color: var(--chart-1);
    font-weight: 600;
  }
  .rail-hint {
    font-family: var(--font-mono, monospace);
    font-size: 9px;
    letter-spacing: 0.04em;
    color: var(--muted);
    text-align: right;
    max-width: 7rem;
  }

  /* Hide rail below xl (1280px) — at half-screen / tablet widths the
     fixed rail overlaps the card-inner content. Cards already scroll-snap
     so the dots are decorative; users can wheel/swipe between cards
     without them. */
  @media (max-width: 1279px) {
    .rail {
      display: none;
    }
  }

  /* Card. One per viewport. The tone CSS variable on the section sets a
     subtle radial wash up top, then a soft vertical gradient toward the
     canvas color, so successive cards feel atmospherically distinct
     without losing the page's overall warm-cream / dark calm. */
  .card {
    scroll-snap-align: start;
    scroll-snap-stop: always; /* don't skip cards on a fast wheel flick */
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4rem 2rem;
    background:
      radial-gradient(
        1200px 600px at 30% -10%,
        color-mix(in oklab, var(--card-color) 24%, transparent) 0%,
        transparent 60%
      ),
      linear-gradient(
        180deg,
        color-mix(in oklab, var(--card-color) 6%, var(--bg)) 0%,
        var(--bg) 80%
      );
    opacity: 0;
    transform: translateY(16px);
    transition:
      opacity 0.55s ease-out,
      transform 0.55s ease-out;
  }
  .card.is-visible {
    opacity: 1;
    transform: translateY(0);
  }
  .card-inner {
    max-width: 56rem;
    width: 100%;
  }
  .card-label {
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--card-color);
    margin-bottom: 1.5rem;
    font-weight: 600;
  }
  .card-headline {
    font-size: clamp(1.75rem, 4vw, 3.25rem);
    font-weight: 700;
    line-height: 1.05;
    letter-spacing: -0.02em;
    color: var(--text-heading);
    margin: 0 0 2rem 0;
    max-width: 42rem;
  }
  .card-stat {
    font-family: var(--font-mono, monospace);
    font-weight: 700;
    font-size: clamp(2.25rem, 7vw, 5.5rem);
    line-height: 1;
    letter-spacing: -0.03em;
    color: var(--card-color);
    margin-bottom: 1.5rem;
    word-break: break-word;
    /* No text-shadow glow — RULE-1 ("legit but with the nebula") keeps the
       atmospheric radial/gradient card wash but drops decorative glow on
       every element. The card background already supplies the depth. */
  }
  .card-support {
    color: var(--text);
    font-family: var(--font-sans, system-ui);
    font-size: clamp(1rem, 1.6vw, 1.15rem);
    line-height: 1.6;
    max-width: 36rem;
    margin: 0;
  }
  .card-next {
    appearance: none;
    background: transparent;
    border: 1px solid color-mix(in oklab, var(--card-color) 40%, transparent);
    color: var(--card-color);
    padding: 0.4rem 0.9rem;
    border-radius: 999px;
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: lowercase;
    cursor: pointer;
    margin-top: 2rem;
    transition:
      background 0.18s ease,
      transform 0.18s ease;
  }
  .card-next:hover {
    background: color-mix(in oklab, var(--card-color) 12%, transparent);
    transform: translateY(-1px);
  }

  /* Narrow-width progress strip — replaces the side rail below xl.
     Sticky to the top of the snap container so users always see where
     they are in the card sequence. */
  .narrow-progress {
    position: sticky;
    top: 0;
    z-index: 30;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 1rem;
    background: color-mix(in oklab, var(--bg) 92%, transparent);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--border);
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--muted);
  }
  .narrow-progress-num {
    color: var(--text);
    font-weight: 600;
  }
  .narrow-progress-sep,
  .narrow-progress-tot {
    color: var(--muted);
  }
  .narrow-progress-bar {
    flex: 1;
    height: 2px;
    background: var(--border);
    border-radius: 2px;
    overflow: hidden;
  }
  .narrow-progress-bar-fill {
    display: block;
    height: 100%;
    background: var(--accent);
    transition: width 0.3s ease;
  }
  .narrow-progress-hint {
    font-size: 9px;
    letter-spacing: 0.04em;
    color: var(--muted);
    white-space: nowrap;
  }
</style>
