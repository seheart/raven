<script>
  /**
   * GpuHealthCard — VRAM bar, temp, GPU util, power draw.
   * Polls /api/gpu every 2s. Util history kept for sparkline.
   */
  import { onMount } from 'svelte';
  import { dataService } from '../../dataService.js';

  let gpu = $state(null);
  let error = $state(null);
  let errorDetail = $state('');
  let utilHistory = $state([]); // last 30 samples for sparkline
  let lastFetch = $state(null);
  let now = $state(Date.now());
  const HISTORY_LEN = 30;

  function tempColor(c) {
    if (c >= 85) return 'var(--error)';
    if (c >= 75) return 'var(--warning)';
    return 'var(--success)';
  }

  function vramColor(pct) {
    if (pct >= 95) return 'var(--error)';
    if (pct >= 85) return 'var(--warning)';
    return 'var(--accent)';
  }

  function sparklinePath(values, w, h) {
    if (values.length < 2) return '';
    const max = 100; // util is 0-100
    const step = w / (HISTORY_LEN - 1);
    const points = values.map((v, i) => {
      const x = i * step;
      const y = h - (v / max) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return `M ${points.join(' L ')}`;
  }

  async function refresh() {
    try {
      // Shared /gpu cache via dataService (2s TTL == poll interval)
      // means VitalsStrip + CompactGpuHealth + CombinedLlmCard + this
      // card all share one network request when on screen together.
      const data = await dataService.fetch('/gpu', { ttl: 2000 });
      gpu = (data.gpus && data.gpus[0]) || null;
      // /api/gpu can return {error, detail, gpus:[]} when nvidia-smi is
      // missing or errored. Surface that instead of "no GPU detected".
      errorDetail = data.detail || data.error || '';
      error = null;
      if (gpu) {
        utilHistory = [...utilHistory, gpu.gpu_util_pct].slice(-HISTORY_LEN);
      }
      lastFetch = Date.now();
    } catch (e) {
      error = e.message || 'fetch failed';
    }
  }

  onMount(() => {
    refresh();
    const t = setInterval(refresh, 2000);
    const tickTimer = setInterval(() => { now = Date.now(); }, 1000);
    return () => {
      clearInterval(t);
      clearInterval(tickTimer);
    };
  });
</script>

<div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
  <div class="flex items-baseline justify-between mb-3">
    <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">GPU Health</h3>
    <span class="text-[10px] text-[var(--muted)] font-mono" title="nvidia-smi">
      {#if lastFetch}
        {@const ageS = Math.max(0, Math.floor((now - lastFetch) / 1000))}
        Updated {ageS}s ago
      {:else}
        nvidia-smi
      {/if}
    </span>
  </div>

  {#if error}
    <div class="text-xs text-[var(--error)] font-mono">{error}</div>
  {:else if !gpu}
    <div class="text-xs py-6 text-center">
      {#if errorDetail}
        <div class="text-[var(--warning)] font-semibold">nvidia-smi unavailable</div>
        <div class="text-[10px] text-[var(--muted)] font-mono mt-1">{errorDetail}</div>
      {:else}
        <div class="text-[var(--muted)] italic">No GPU detected</div>
      {/if}
    </div>
  {:else}
    <div class="text-sm font-mono text-[var(--text)] mb-2">{gpu.name}</div>

    <!-- VRAM bar -->
    <div class="mb-3">
      <div class="flex justify-between text-[11px] font-mono text-[var(--muted)] mb-1">
        <span>VRAM</span>
        <span>
          <span class="text-[var(--text)]">{(gpu.vram_used_mib / 1024).toFixed(1)}</span>
          / {(gpu.vram_total_mib / 1024).toFixed(1)} GB
          <span class="ml-2" style="color: {vramColor(gpu.vram_pct)}">{gpu.vram_pct}%</span>
        </span>
      </div>
      <div class="h-2 bg-[var(--bg)] rounded overflow-hidden border border-[var(--border)]">
        <div
          class="h-full transition-all duration-500"
          style="width: {gpu.vram_pct}%; background: {vramColor(gpu.vram_pct)}"
        ></div>
      </div>
    </div>

    <!-- Stats grid -->
    <div class="grid grid-cols-3 gap-3 text-[11px] font-mono mb-3">
      <div>
        <div class="text-[var(--muted)] mb-0.5">Temp</div>
        <div class="text-base font-semibold" style="color: {tempColor(gpu.temp_c)}">{gpu.temp_c}°C</div>
      </div>
      <div>
        <div class="text-[var(--muted)] mb-0.5">GPU util</div>
        <div class="text-base font-semibold text-[var(--text)]">{gpu.gpu_util_pct}%</div>
      </div>
      <div>
        <div class="text-[var(--muted)] mb-0.5">Power</div>
        <div class="text-base font-semibold text-[var(--text)]">
          {gpu.power_draw_w.toFixed(0)}<span class="text-[var(--muted)] text-xs">/{gpu.power_limit_w.toFixed(0)}W</span>
        </div>
      </div>
    </div>

    <!-- Util sparkline -->
    <div>
      <div class="text-[10px] font-mono text-[var(--muted)] mb-1">GPU util — last 60s</div>
      <svg viewBox="0 0 200 32" class="w-full h-8" preserveAspectRatio="none">
        <path
          d={sparklinePath(utilHistory, 200, 32)}
          fill="none"
          stroke="var(--accent)"
          stroke-width="1.5"
        />
      </svg>
    </div>
  {/if}
</div>
