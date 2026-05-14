<script>
  /**
   * HeaderLlmPill — global header companion to the activity strip.
   * Always-on at-a-glance answer to "what's the local LLM doing right
   * now?" — currently-loaded model name + size, VRAM headroom, GPU
   * temperature, total models in the library.
   *
   * Hidden under xl so the nav has room at typical laptop widths;
   * VitalsStrip carries the same vitals on smaller screens for the
   * power-user pages that mount it.
   *
   * Polls the same /ollama/ps and /gpu endpoints other LLM cards use,
   * via dataService's shared cache so no extra round-trips.
   */
  import { onMount, onDestroy } from 'svelte';
  import { dataService } from '../../dataService.js';
  import { websocketService } from '../../services/websocket.js';
  import { navigate } from '../../utils/router.svelte.js';

  /** @typedef {{name:string, size:number, parameter_size:string, family:string}} Model */

  /** @type {Model|null} */
  let activeModel = $state(null);
  /** Total models in the library (loaded + not loaded), for the right edge. */
  let libraryCount = $state(0);
  let gpu = $state(null);
  let ollamaOffline = $state(false);

  // Recent inference throughput (tokens-per-second) history. Powers the
  // tiny activity bar chart at the start of the pill — same source as
  // the LLM cards' per-model sparklines, but aggregated across whatever
  // model is currently loaded so the pill reads as "the LLM right now".
  /** @type {number[]} */
  let tpsHistory = $state([]);
  const TPS_HISTORY_LEN = 24;

  function fmtGB(bytes) {
    if (!bytes) return '—';
    return `${(bytes / 1e9).toFixed(1)} GB`;
  }

  function vramColor(pct) {
    if (pct >= 95) return 'var(--error)';
    if (pct >= 85) return 'var(--warning)';
    return 'var(--text)';
  }

  function tempColor(c) {
    if (c >= 85) return 'var(--error)';
    if (c >= 75) return 'var(--warning)';
    return 'var(--success)';
  }

  async function refreshOllama() {
    try {
      const data = await dataService.fetch('/ollama/ps', { ttl: 3000, timeout: 5000 });
      ollamaOffline = data?.ollama_status === 'offline';
      const loaded = Array.isArray(data?.models) ? data.models : [];
      // The "active" model is the one with the most recent activity. /ollama/ps
      // returns currently-resident models; pick the largest VRAM-resident one
      // as a stable "what's loaded" signal (a conversation-active model dominates).
      activeModel = loaded[0] || null;
    } catch {
      ollamaOffline = true;
    }
  }

  async function refreshLibrary() {
    try {
      // /api/ollama/library lists every Ollama-pulled model (not just
      // currently-resident ones). Cached server-side at 30s, so a 30s
      // client poll keeps the network layer dedup'd.
      const data = await dataService.fetch('/ollama/library', { ttl: 30000 });
      const list = Array.isArray(data?.models) ? data.models : Array.isArray(data) ? data : [];
      libraryCount = list.length;
    } catch {
      // Library count is supplementary — if it fails, just don't render that segment.
    }
  }

  async function refreshGpu() {
    try {
      const data = await dataService.fetch('/gpu', { ttl: 2000 });
      gpu = data?.gpus?.[0] || null;
    } catch {
      gpu = null;
    }
  }

  /** @type {ReturnType<typeof setInterval>[]} */
  const timers = [];
  /** @type {((data:any)=>void)|null} */
  let inferenceHandler = null;
  onMount(() => {
    refreshOllama();
    refreshLibrary();
    refreshGpu();
    timers.push(setInterval(refreshOllama, 8000));
    timers.push(setInterval(refreshLibrary, 30000));
    timers.push(setInterval(refreshGpu, 5000));

    // Listen for inference events to feed the activity bar chart. Each
    // completed turn carries a gen_tps reading; we keep the last 24
    // values and let the bars decay naturally as new ones push in.
    inferenceHandler = data => {
      if (data?.type !== 'inference') return;
      const tps = Number(data?.gen_tps);
      if (!isFinite(tps) || tps <= 0) return;
      tpsHistory = [...tpsHistory, tps].slice(-TPS_HISTORY_LEN);
    };
    websocketService.on('agent-event', inferenceHandler);
  });
  onDestroy(() => {
    timers.forEach(clearInterval);
    if (inferenceHandler) websocketService.off('agent-event', inferenceHandler);
  });

  function goToModels(e) {
    e.preventDefault();
    navigate('/agents/models');
  }
</script>

{#if activeModel || gpu}
  <button
    type="button"
    onclick={goToModels}
    class="hidden xl:inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface border border-border text-[11px] font-mono text-body hover:border-accent transition-colors shrink-0 cursor-pointer"
    title="Local LLM status — click for the full Models view"
  >
    {#if activeModel}
      <!-- Dot signals "a model is loaded"; the bars carry the live
           "is it doing anything right now?" signal. Model name + size
           live in ActiveModelCard on every dashboard page already, so
           repeating them here was just stuttering the same fact. -->
      <span
        class="w-1.5 h-1.5 rounded-full bg-success animate-pulse flex-shrink-0"
        aria-hidden="true"
      ></span>
      {#if tpsHistory.length > 0}
        {@const max = Math.max(...tpsHistory, 1)}
        <span
          class="inline-flex items-end gap-[1px] h-3 flex-shrink-0"
          aria-label="Recent inference throughput"
          title="Recent tokens-per-second across the last {tpsHistory.length} inference turns"
        >
          {#each tpsHistory as t, i (i)}
            <span
              class="w-[2px] bg-success rounded-sm"
              style="height: {Math.max(2, Math.round((t / max) * 12))}px; opacity: {0.35 +
                (i / Math.max(tpsHistory.length - 1, 1)) * 0.65}"
            ></span>
          {/each}
        </span>
      {/if}
    {:else if ollamaOffline}
      <span class="w-1.5 h-1.5 rounded-full bg-warning flex-shrink-0" aria-hidden="true"></span>
      <span class="text-[var(--muted)]">Ollama offline</span>
    {/if}
    {#if gpu}
      <!-- Pipe only renders when there's content to its left, so the
           pill doesn't open with a stray "| VRAM ..." when no model is
           loaded and Ollama isn't reporting offline. -->
      {#if activeModel || ollamaOffline}
        <span class="text-[var(--border)]" aria-hidden="true">|</span>
      {/if}
      <span class="text-[var(--muted)]">VRAM</span>
      <span style="color: {vramColor(gpu.vram_pct)}">
        {gpu.vram_used_mib}/{gpu.vram_total_mib} MiB
        <span class="text-[var(--muted)] font-normal">({gpu.vram_pct}%)</span>
      </span>
      <span class="text-[var(--border)]" aria-hidden="true">|</span>
      <span class="text-[var(--muted)]">GPU</span>
      <span style="color: {tempColor(gpu.temp_c)}">{gpu.temp_c}°C</span>
    {/if}
    {#if libraryCount > 0}
      <span class="text-[var(--border)]" aria-hidden="true">|</span>
      <span class="text-[var(--muted)]">Models</span>
      <span>{libraryCount}</span>
    {/if}
  </button>
{/if}
