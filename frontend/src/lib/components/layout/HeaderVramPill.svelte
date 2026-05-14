<script>
  /**
   * HeaderVramPill — narrow-width counterpart to HeaderLlmPill.
   *
   * At lg+ the LlmPill carries the LLM/VRAM/GPU stats inline in the
   * expanded header. At narrow widths that pill is hidden (it doesn't
   * fit), but VRAM % is the single most-watched signal — "is the model
   * about to OOM?" So this tiny pill keeps a VRAM% number + a sparkline
   * tail visible in the collapsed eyebrow strip.
   *
   * Click → /agents/models for the full view.
   */
  import { onMount, onDestroy } from 'svelte';
  import { dataService } from '../../dataService.js';
  import { navigate } from '../../utils/router.svelte.js';

  let gpu = $state(
    /** @type {{vram_pct:number,vram_used_mib:number,vram_total_mib:number}|null} */ (null)
  );
  /** Rolling VRAM% history. 60 samples * 5s = 5 minutes of tail. */
  let history = $state(/** @type {number[]} */ ([]));
  const HISTORY_LEN = 60;

  /** @param {number} pct */
  function vramColor(pct) {
    if (pct >= 95) return 'var(--error)';
    if (pct >= 85) return 'var(--warning)';
    return 'var(--text)';
  }

  /**
   * Build a sparkline path. y inverts so 100% is the top, 0% the bottom.
   * @param {number[]} values
   * @param {number} w
   * @param {number} h
   */
  function spark(values, w, h) {
    if (values.length < 2) return '';
    const step = w / (HISTORY_LEN - 1);
    // Right-align the line so a short history sits at the right edge.
    const offset = (HISTORY_LEN - values.length) * step;
    return (
      'M ' +
      values
        .map(
          (/** @type {number} */ v, /** @type {number} */ i) =>
            `${(offset + i * step).toFixed(1)},${(h - (v / 100) * h).toFixed(1)}`
        )
        .join(' L ')
    );
  }

  async function refresh() {
    try {
      const data = await dataService.fetch('/gpu', { ttl: 2000 });
      const g = data?.gpus?.[0];
      if (!g) {
        gpu = null;
        return;
      }
      gpu = g;
      history = [...history, g.vram_pct].slice(-HISTORY_LEN);
    } catch {
      gpu = null;
    }
  }

  /** @type {ReturnType<typeof setInterval>|null} */
  let timer = null;
  onMount(() => {
    refresh();
    timer = setInterval(refresh, 5000);
  });
  onDestroy(() => {
    if (timer) clearInterval(timer);
  });

  /** @param {Event} e */
  function goToModels(e) {
    e.preventDefault();
    navigate('/agents/models');
  }
</script>

{#if gpu}
  <button
    type="button"
    onclick={goToModels}
    class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-surface border border-border text-[10px] font-mono hover:border-accent transition-colors shrink-0 cursor-pointer"
    title="VRAM {gpu.vram_used_mib}/{gpu.vram_total_mib} MiB · click for the full Models view"
    aria-label="VRAM usage {gpu.vram_pct} percent"
  >
    <svg
      viewBox="0 0 60 12"
      class="w-[60px] h-3 flex-shrink-0"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={spark(history, 60, 12)} fill="none" stroke="var(--accent)" stroke-width="1" />
    </svg>
    <span style="color: {vramColor(gpu.vram_pct)}">{gpu.vram_pct}%</span>
  </button>
{/if}
