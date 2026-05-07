<script>
  /**
   * Weekly Digest Modal — Monday-morning recap of the previous week.
   *
   * Auto-shows when:
   *  - it is Monday OR > 7 days since the user last viewed any digest
   *  - the current week's digest exists and has events to report
   *  - user hasn't dismissed THIS week's digest (localStorage)
   *
   * Three actions: "View Insights", "Snooze" (close, re-show next
   * session), "Dismiss this week" (suppress until next week).
   *
   * @typedef {{glyph:string, tone:string, text:string}} Beat
   * @typedef {{kind:string, text:string}} Lead
   * @typedef {{week_key:string, week_start:string, week_end:string, lead:Lead, beats:Beat[], stats:Record<string,any>}} Digest
   */

  import { onMount } from 'svelte';
  import { api } from '../../apiClient.js';
  import { navigate } from '../../utils/router.svelte.js';

  let visible = $state(false);
  /** @type {Digest|null} */
  let digest = $state(null);
  let loading = $state(false);

  const STORAGE_PREFIX = 'raven.weekly_digest';
  const DISMISS_KEY = (weekKey) => `${STORAGE_PREFIX}.dismissed.${weekKey}`;
  const LAST_SEEN_KEY = `${STORAGE_PREFIX}.last_seen_iso`;

  /** ISO 8601 week key for a given local date — matches backend's. */
  function isoWeekKey(date) {
    const t = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dayNum = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  }

  function isMondayLocal() {
    return new Date().getDay() === 1;
  }

  function readStorage(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  function writeStorage(key, value) {
    try { localStorage.setItem(key, value); } catch { /* private mode etc */ }
  }

  /** @param {string} iso */
  function fmtDate(iso) {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric'
    });
  }

  /** @param {string} tone */
  function toneClass(tone) {
    switch (tone) {
      case 'accent': return 'text-accent';
      case 'success': return 'text-success';
      case 'info': return 'text-info';
      case 'warning': return 'text-warning';
      default: return 'text-muted';
    }
  }

  async function loadAndDecide() {
    loading = true;
    try {
      const data = await api.get('/digests/weekly');
      if (!data || !data.week_key) return;
      // Don't fire on a totally quiet week — there's nothing to celebrate.
      if (!data.stats || data.stats.events === 0) return;
      // Already dismissed?
      if (readStorage(DISMISS_KEY(data.week_key))) return;
      // Cadence: show on Monday, OR if the last view was >= 7 days ago,
      // OR if the user has never seen any digest before.
      const lastSeen = readStorage(LAST_SEEN_KEY);
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      const overdue = !lastSeen || Date.now() - new Date(lastSeen).getTime() >= sevenDaysMs;
      if (!isMondayLocal() && !overdue) return;
      digest = data;
      visible = true;
    } catch {
      // Silent — digest is supplementary; never block the app on it.
    } finally {
      loading = false;
    }
  }

  function snooze() {
    // Don't write a dismiss flag — this just hides the modal for the
    // current session. It will re-evaluate on the next cold load.
    visible = false;
  }

  function dismissThisWeek() {
    if (digest?.week_key) {
      writeStorage(DISMISS_KEY(digest.week_key), new Date().toISOString());
    }
    writeStorage(LAST_SEEN_KEY, new Date().toISOString());
    visible = false;
  }

  function viewInsights() {
    writeStorage(LAST_SEEN_KEY, new Date().toISOString());
    visible = false;
    navigate('/insights');
  }

  /** Close on Escape — but only "snooze" semantics, not dismissal. */
  function onKey(e) {
    if (e.key === 'Escape' && visible) {
      e.preventDefault();
      snooze();
    }
  }

  onMount(() => {
    // Slight delay so the modal doesn't pop in front of the very first
    // render of the page; lets the Today landing settle first.
    const t = setTimeout(loadAndDecide, 1500);
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  });
</script>

{#if visible && digest}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
    aria-labelledby="digest-title"
    onclick={snooze}
  >
    <!-- Card — stop propagation so clicks inside don't snooze -->
    <div
      class="bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-2xl w-full max-w-lg overflow-hidden"
      role="document"
      onclick={(e) => e.stopPropagation()}
    >
      <header class="px-6 pt-6 pb-3">
        <div class="text-xs font-mono uppercase tracking-wide text-muted mb-1">
          Your week · {fmtDate(digest.week_start)} – {fmtDate(digest.week_end)}
        </div>
        <h2 id="digest-title" class="text-2xl font-bold text-heading tracking-[-0.025em]">
          {digest.lead.text}
        </h2>
      </header>

      {#if digest.beats?.length}
        <ul class="px-6 pb-5 space-y-2">
          {#each digest.beats as beat (beat.text)}
            <li class="flex items-start gap-3 text-sm">
              <span class="text-base leading-none {toneClass(beat.tone)} flex-shrink-0 select-none w-4 text-center" aria-hidden="true">{beat.glyph}</span>
              <span class="text-body font-sans leading-relaxed">{beat.text}</span>
            </li>
          {/each}
        </ul>
      {/if}

      <footer class="border-t border-[var(--border)] bg-[var(--bg)]/40 px-6 py-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onclick={snooze}
          class="px-3 py-1.5 text-sm text-muted hover:text-body transition-colors bg-transparent border-0 cursor-pointer"
        >Snooze</button>
        <button
          type="button"
          onclick={dismissThisWeek}
          class="px-3 py-1.5 text-sm text-muted hover:text-body transition-colors bg-transparent border border-[var(--border)] rounded cursor-pointer"
        >Dismiss this week</button>
        <button
          type="button"
          onclick={viewInsights}
          class="px-3 py-1.5 text-sm bg-accent text-canvas rounded cursor-pointer hover:opacity-90 transition-opacity font-semibold"
        >View Insights →</button>
      </footer>
    </div>
  </div>
{/if}
