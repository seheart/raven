<script>
  /**
   * MilestoneModal — auto-shows the most recent unviewed milestone.
   *
   * Pulls /api/milestones, filters out ones the user has already
   * dismissed (per localStorage), shows at most one at a time. The
   * weekly digest modal handles the recurring weekly story; this
   * modal handles the once-in-a-lifetime moments (first session,
   * 7d/30d marks, 100th edit, anniversaries).
   *
   * @typedef {{
   *   id:string, kind:string, reached_at:string,
   *   title:string, body:string, project:string|null,
   *   stats: Record<string, number|string>
   * }} Milestone
   */

  import { onMount, onDestroy } from 'svelte';
  import { api } from '../../apiClient.js';

  /** @type {Milestone|null} */
  let visible = $state(null);
  /** @type {Milestone[]} */
  let queue = $state([]);

  const STORAGE_PREFIX = 'raven.milestone.dismissed';
  const dismissKey = (id) => `${STORAGE_PREFIX}.${id}`;

  function readStorage(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  function writeStorage(key, value) {
    try { localStorage.setItem(key, value); } catch { /* private mode */ }
  }

  /** @param {string} iso */
  function fmtDate(iso) {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  function kindLabel(kind) {
    switch (kind) {
      case 'first_session':       return 'First session';
      case 'seven_days':          return 'Week one';
      case 'thirty_days':         return 'One month';
      case 'hundred_edits':       return '100 events';
      case 'thousand_edits':      return '1,000 events';
      case 'anniversary':         return 'Anniversary';
      case 'project_first_month': return 'Project month one';
      default:                    return 'Milestone';
    }
  }

  async function loadAndQueue() {
    try {
      const data = await api.get('/milestones');
      const all = Array.isArray(data) ? data : [];
      // Filter out dismissed; cap to most-recent 3 per session so we
      // don't overwhelm a returning user with stacked modals.
      queue = all.filter(m => !readStorage(dismissKey(m.id))).slice(0, 3);
      pump();
    } catch {
      // Silent — supplementary surface.
    }
  }

  function pump() {
    if (visible || queue.length === 0) return;
    const next = queue[0];
    queue = queue.slice(1);
    visible = next;
  }

  function dismiss() {
    if (visible) writeStorage(dismissKey(visible.id), new Date().toISOString());
    visible = null;
    // Brief delay before showing the next so the close animation can land.
    setTimeout(pump, 350);
  }

  /** @param {KeyboardEvent} e */
  function onKey(e) {
    if (e.key === 'Escape' && visible) {
      e.preventDefault();
      dismiss();
    }
  }

  onMount(() => {
    // Slight delay so the page renders first; let the digest modal pop
    // before milestones if both fire on the same load.
    const t = setTimeout(loadAndQueue, 2500);
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  });
</script>

{#if visible}
  <div
    class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
    aria-labelledby="milestone-title"
    onclick={dismiss}
  >
    <div
      class="bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-2xl w-full max-w-lg overflow-hidden"
      role="document"
      onclick={(e) => e.stopPropagation()}
    >
      <header class="px-6 pt-6 pb-3">
        <div class="flex items-baseline justify-between gap-3 mb-2">
          <span class="text-[10px] font-mono uppercase tracking-wide text-accent">
            {kindLabel(visible.kind)}
          </span>
          <span class="text-[10px] font-mono text-muted">{fmtDate(visible.reached_at)}</span>
        </div>
        <h2 id="milestone-title" class="text-2xl font-bold text-heading tracking-[-0.025em]">
          {visible.title}
        </h2>
      </header>

      <div class="px-6 pb-4">
        <p class="text-sm text-body font-sans leading-relaxed">{visible.body}</p>

        {#if Object.keys(visible.stats || {}).length > 0}
          <dl class="mt-4 grid grid-cols-2 gap-3 text-sm font-mono">
            {#each Object.entries(visible.stats) as [k, v] (k)}
              <div class="bg-canvas border border-border rounded p-3">
                <dt class="text-[10px] uppercase tracking-wide text-muted mb-1">{k.replace(/_/g, ' ')}</dt>
                <dd class="text-base text-body font-bold tabular-nums">{typeof v === 'number' ? v.toLocaleString() : v}</dd>
              </div>
            {/each}
          </dl>
        {/if}
      </div>

      <footer class="border-t border-[var(--border)] bg-[var(--bg)]/40 px-6 py-3 flex items-center justify-end">
        <button
          type="button"
          onclick={dismiss}
          class="px-3 py-1.5 text-sm bg-accent text-canvas rounded cursor-pointer hover:opacity-90 transition-opacity font-semibold"
        >Got it</button>
      </footer>
    </div>
  </div>
{/if}
