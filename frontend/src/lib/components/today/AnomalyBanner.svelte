<script>
  /**
   * AnomalyBanner — surfaces per-model drift detected by the
   * /api/agents/anomalies endpoint. Renders nothing when nothing is
   * drifting, so it's a quiet element on a typical day.
   *
   * @typedef {{
   *   model:string, latency_ratio:number|null, cost_ratio:number|null,
   *   output_ratio:number|null, worst_ratio:number|null,
   *   flagged: Array<'latency'|'cost'|'output'>, summary:string
   * }} Anomaly
   */

  import { onMount, onDestroy } from 'svelte';
  import { createPageApi } from '../../apiClient.js';

  const { api, abort } = createPageApi();

  /** @type {Anomaly[]} */
  let anomalies = $state([]);
  /** @type {ReturnType<typeof setInterval>|null} */
  let refresh = null;

  async function load() {
    try {
      const data = await api.get('/agents/anomalies');
      anomalies = (Array.isArray(data) ? data : []).filter(a => a.flagged.length > 0);
    } catch {
      // Silent — supplementary surface.
    }
  }

  onMount(() => {
    load();
    refresh = setInterval(load, 30_000);
  });
  onDestroy(() => {
    if (refresh) clearInterval(refresh);
    abort();
  });

  function shortModel(m) {
    return m.replace(/^claude-/, '').replace(/-\d{8}$/, '').replace(/:.*$/, '');
  }
</script>

{#if anomalies.length > 0}
  <section class="bg-warning/10 border border-warning/30 rounded-lg p-4">
    <div class="flex items-baseline gap-3 flex-wrap">
      <span
        class="inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold bg-warning/20 text-warning border border-warning/40 flex-shrink-0"
        aria-hidden="true"
      >⚠</span>
      <div class="flex-1 min-w-0">
        <div class="text-xs font-mono uppercase tracking-wide text-warning/80 mb-1">
          {anomalies.length} model{anomalies.length === 1 ? '' : 's'} drifting
        </div>
        <ul class="space-y-1 text-sm font-sans text-body">
          {#each anomalies.slice(0, 3) as a (a.model)}
            <li>
              <span class="font-mono font-semibold text-warning">{shortModel(a.model)}</span>
              <span>—</span>
              {#each a.flagged as kind, i (kind)}
                {#if i > 0}<span class="text-muted">, </span>{/if}
                <span class="font-mono text-body">
                  {kind} {kind === 'latency' && a.latency_ratio
                    ? `${a.latency_ratio.toFixed(1)}×`
                    : kind === 'cost' && a.cost_ratio
                    ? `${a.cost_ratio.toFixed(1)}×`
                    : kind === 'output' && a.output_ratio
                    ? `${a.output_ratio.toFixed(1)}×`
                    : 'over'}
                </span>
              {/each}
              <span class="text-muted">baseline (last 30m vs 7d).</span>
            </li>
          {/each}
        </ul>
        {#if anomalies.length > 3}
          <div class="mt-1 text-xs font-mono text-muted/80">
            …and {anomalies.length - 3} more.
          </div>
        {/if}
      </div>
    </div>
  </section>
{/if}
