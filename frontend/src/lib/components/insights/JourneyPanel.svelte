<script>
  /**
   * JourneyPanel — "you've come a long way" before/after comparison.
   *
   * Pulls /api/journey/before-after, then renders the user's first
   * recorded week side-by-side with their current week. Skips itself
   * when Raven has been running less than two weeks (no meaningful
   * arc yet).
   *
   * @typedef {{
   *   start:string, end:string,
   *   events:number, files:number, projects:number,
   *   days_active:number, cost_usd:number, requests:number,
   *   top_project:string|null, top_model:string|null,
   *   longest_session_seconds:number
   * }} WindowStats
   */

  import { onMount, onDestroy } from 'svelte';
  import { createPageApi } from '../../apiClient.js';
  import { formatUsd } from '../../utils/formatUsd.js';

  const { api, abort } = createPageApi();

  /** @type {{ first_week: WindowStats|null, current_week: WindowStats, span_days:number, too_early:boolean }|null} */
  let payload = $state(null);
  let loading = $state(true);

  async function load() {
    try {
      const data = await api.get('/journey/before-after');
      payload = data;
    } catch {
      // Silent — supplementary panel.
    } finally {
      loading = false;
    }
  }

  onMount(load);
  onDestroy(() => abort());

  /** @param {number} n */
  function fmtInt(n) {
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString();
  }

  /** @param {number} n */
  function fmtUsd(n) {
    if (!n || n < 0.01) return n === 0 ? '$0' : '<$0.01';
    if (n < 100) return formatUsd(n);
    return formatUsd(n, { precision: 0 });
  }

  function fmtDuration(s) {
    if (!s) return '—';
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }

  /**
   * Compute a delta line: "from X to Y (+N · 3.4×)". Returns null when
   * the change isn't worth reporting (zero on both sides).
   */
  function deltaLine(before, after) {
    if (!before && !after) return null;
    if (!before) return `from 0 → ${fmtInt(after)} this week`;
    const diff = after - before;
    const ratio = before > 0 ? after / before : null;
    const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
    const tone = diff > 0 ? 'text-success' : diff < 0 ? 'text-warning' : 'text-muted';
    return { tone, arrow, before, after, diff, ratio };
  }
</script>

{#if !loading && payload}
  {#if payload.too_early}
    <section class="bg-surface border border-border rounded-lg p-5">
      <div class="text-xs font-mono uppercase tracking-wide text-muted mb-2">Your journey</div>
      <p class="text-sm text-body font-sans leading-relaxed">
        Still your first stretch with Raven. Come back after about two weeks and this section will
        show how far you've come — events, files, spend, and the model mix for your first week vs.
        now.
      </p>
    </section>
  {:else if payload.first_week}
    {@const a = payload.first_week}
    {@const b = payload.current_week}
    {@const evD = deltaLine(a.events, b.events)}
    {@const fD = deltaLine(a.files, b.files)}
    {@const dD = deltaLine(a.days_active, b.days_active)}
    {@const cD = a.cost_usd > 0 || b.cost_usd > 0}
    <section class="bg-surface border border-border rounded-lg p-5">
      <div class="flex items-baseline justify-between gap-3 flex-wrap mb-4">
        <div>
          <div class="text-xs font-mono uppercase tracking-wide text-muted mb-1">
            You've come a long way
          </div>
          <h3 class="text-lg font-bold text-heading">A first week, and now.</h3>
        </div>
        <span class="text-[11px] font-mono text-muted">
          {payload.span_days}
          {payload.span_days === 1 ? 'day' : 'days'} on Raven
        </span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- First week column -->
        <div class="bg-canvas border border-dashed border-border rounded p-4">
          <div class="text-[10px] font-mono uppercase tracking-wide text-muted mb-2">
            First week
          </div>
          <ul class="space-y-1.5 text-sm font-sans">
            <li>
              <span class="text-muted">Events</span>
              <span class="text-body font-mono float-right tabular-nums">{fmtInt(a.events)}</span>
            </li>
            <li>
              <span class="text-muted">Files touched</span>
              <span class="text-body font-mono float-right tabular-nums">{fmtInt(a.files)}</span>
            </li>
            <li>
              <span class="text-muted">Projects</span>
              <span class="text-body font-mono float-right tabular-nums">{fmtInt(a.projects)}</span>
            </li>
            <li>
              <span class="text-muted">Active days</span>
              <span class="text-body font-mono float-right tabular-nums"
                >{fmtInt(a.days_active)} / 7</span
              >
            </li>
            {#if cD}
              <li>
                <span class="text-muted">Spent</span>
                <span class="text-body font-mono float-right tabular-nums"
                  >{fmtUsd(a.cost_usd)}</span
                >
              </li>
            {/if}
            <li>
              <span class="text-muted">Top project</span>
              <span class="text-body font-mono float-right truncate">{a.top_project || '—'}</span>
            </li>
            <li>
              <span class="text-muted">Top model</span>
              <span class="text-body font-mono float-right truncate">{a.top_model || '—'}</span>
            </li>
            <li>
              <span class="text-muted">Longest stretch</span>
              <span class="text-body font-mono float-right"
                >{fmtDuration(a.longest_session_seconds)}</span
              >
            </li>
          </ul>
        </div>

        <!-- Current week column -->
        <div class="bg-canvas border border-border rounded p-4">
          <div class="text-[10px] font-mono uppercase tracking-wide text-accent mb-2">
            This week
          </div>
          <ul class="space-y-1.5 text-sm font-sans">
            <li>
              <span class="text-muted">Events</span>
              <span class="text-body font-mono font-semibold float-right tabular-nums"
                >{fmtInt(b.events)}</span
              >
            </li>
            <li>
              <span class="text-muted">Files touched</span>
              <span class="text-body font-mono font-semibold float-right tabular-nums"
                >{fmtInt(b.files)}</span
              >
            </li>
            <li>
              <span class="text-muted">Projects</span>
              <span class="text-body font-mono font-semibold float-right tabular-nums"
                >{fmtInt(b.projects)}</span
              >
            </li>
            <li>
              <span class="text-muted">Active days</span>
              <span class="text-body font-mono font-semibold float-right tabular-nums"
                >{fmtInt(b.days_active)} / 7</span
              >
            </li>
            {#if cD}
              <li>
                <span class="text-muted">Spent</span>
                <span class="text-body font-mono font-semibold float-right tabular-nums"
                  >{fmtUsd(b.cost_usd)}</span
                >
              </li>
            {/if}
            <li>
              <span class="text-muted">Top project</span>
              <span class="text-body font-mono font-semibold float-right truncate"
                >{b.top_project || '—'}</span
              >
            </li>
            <li>
              <span class="text-muted">Top model</span>
              <span class="text-body font-mono font-semibold float-right truncate"
                >{b.top_model || '—'}</span
              >
            </li>
            <li>
              <span class="text-muted">Longest stretch</span>
              <span class="text-body font-mono font-semibold float-right"
                >{fmtDuration(b.longest_session_seconds)}</span
              >
            </li>
          </ul>
        </div>
      </div>

      <!-- Headline deltas -->
      {#if evD || fD || dD}
        <div class="mt-4 pt-4 border-t border-border space-y-1.5 text-sm font-sans">
          {#if evD}
            {#if typeof evD === 'string'}
              <p class="text-muted">{evD}</p>
            {:else}
              <p>
                <span class="font-mono {evD.tone}">{evD.arrow}</span>
                <span class="text-body"
                  >Events: {fmtInt(evD.before)} →
                  <span class="font-semibold">{fmtInt(evD.after)}</span></span
                >
                {#if evD.ratio && evD.ratio >= 1.1}
                  <span class="text-muted">— {evD.ratio.toFixed(1)}× more this week</span>
                {:else if evD.ratio && evD.ratio < 0.9}
                  <span class="text-muted">— {(evD.ratio * 100).toFixed(0)}% of week-1 pace</span>
                {/if}
              </p>
            {/if}
          {/if}
          {#if fD && typeof fD !== 'string'}
            <p>
              <span class="font-mono {fD.tone}">{fD.arrow}</span>
              <span class="text-body"
                >Files touched: {fmtInt(fD.before)} →
                <span class="font-semibold">{fmtInt(fD.after)}</span></span
              >
            </p>
          {/if}
          {#if dD && typeof dD !== 'string' && dD.diff !== 0}
            <p>
              <span class="font-mono {dD.tone}">{dD.arrow}</span>
              <span class="text-body"
                >Active days: {fmtInt(dD.before)} →
                <span class="font-semibold">{fmtInt(dD.after)}</span></span
              >
            </p>
          {/if}
        </div>
      {/if}
    </section>
  {/if}
{/if}
