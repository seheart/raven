<script>
  /**
   * MilestonesPanel — inline replacement for MilestoneModal.
   *
   * Shows the most-recent unviewed milestone as a card on Today.
   * Dismiss writes to localStorage so the entry doesn't reappear; if
   * there's a queue, the next one slides in. No popup, no backdrop.
   *
   * @typedef {{
   *   id:string, kind:string, reached_at:string,
   *   title:string, body:string, project:string|null,
   *   stats: Record<string, number|string>
   * }} Milestone
   */

  import { onMount, onDestroy } from 'svelte';
  import { createPageApi } from '../../apiClient.js';

  const { api, abort } = createPageApi();

  /** @type {Milestone|null} */
  let visible = $state(null);
  /** @type {Milestone[]} */
  let queue = $state([]);

  const STORAGE_PREFIX = 'raven.milestone.dismissed';
  const dismissKey = id => `${STORAGE_PREFIX}.${id}`;

  function readStorage(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* private mode */
    }
  }

  function fmtDate(iso) {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  function kindLabel(kind) {
    switch (kind) {
      case 'first_session':
        return 'First session';
      case 'seven_days':
        return 'Week one';
      case 'thirty_days':
        return 'One month';
      case 'hundred_edits':
        return '100 events';
      case 'thousand_edits':
        return '1,000 events';
      case 'anniversary':
        return 'Anniversary';
      case 'project_first_month':
        return 'Project month one';
      default:
        return 'Milestone';
    }
  }

  async function load() {
    try {
      const data = await api.get('/milestones');
      const all = Array.isArray(data) ? data : [];
      queue = all.filter(m => m && m.title && !readStorage(dismissKey(m.id)));
      pump();
    } catch {
      /* silent — supplementary surface */
    }
  }

  function pump() {
    if (visible || queue.length === 0) return;
    visible = queue[0];
    queue = queue.slice(1);
  }

  function dismiss() {
    if (visible) writeStorage(dismissKey(visible.id), new Date().toISOString());
    visible = null;
    setTimeout(pump, 150);
  }

  onMount(load);
  onDestroy(() => abort());
</script>

{#if visible && visible.title}
  <section
    class="bg-surface border border-border rounded-lg overflow-hidden"
    aria-labelledby="milestone-inline-title"
  >
    <header class="px-5 pt-4 pb-2 flex items-baseline justify-between gap-3">
      <div class="flex items-baseline gap-3 min-w-0">
        <span class="text-[10px] font-mono uppercase tracking-wide text-accent flex-shrink-0">
          {kindLabel(visible.kind)}
        </span>
        <span class="text-[10px] font-mono text-muted">{fmtDate(visible.reached_at)}</span>
      </div>
      <button
        type="button"
        onclick={dismiss}
        class="text-muted hover:text-body text-base leading-none px-2 py-1 -mr-1 -mt-1 bg-transparent border-0 cursor-pointer flex-shrink-0"
        aria-label="Dismiss this milestone"
        title="Dismiss">×</button
      >
    </header>
    <div class="px-5 pb-4">
      <h3
        id="milestone-inline-title"
        class="text-lg font-bold text-heading tracking-[-0.015em] mb-2"
      >
        {visible.title}
      </h3>
      <p class="text-sm text-body font-sans leading-relaxed">{visible.body}</p>
      {#if visible.stats && Object.keys(visible.stats).length > 0}
        <dl class="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-mono">
          {#each Object.entries(visible.stats) as [k, v] (k)}
            <div class="bg-canvas border border-border rounded px-3 py-2">
              <dt class="text-[9px] uppercase tracking-wide text-muted mb-0.5">
                {k.replace(/_/g, ' ')}
              </dt>
              <dd class="text-sm text-body font-bold tabular-nums">
                {typeof v === 'number' ? v.toLocaleString() : v}
              </dd>
            </div>
          {/each}
        </dl>
      {/if}
    </div>
  </section>
{/if}
