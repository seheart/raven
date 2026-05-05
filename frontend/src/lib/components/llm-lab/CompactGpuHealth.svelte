<script>
  /**
   * CompactGpuHealth — denser GPU view for the dashboard's narrow column.
   * Single line of stats, smaller VRAM bar, smaller sparkline.
   */
  import { onMount } from 'svelte';
  import { dataService } from '../../dataService.js';

  let gpu = $state(null);
  let history = $state([]);

  function tColor(c) { return c >= 85 ? 'var(--error)' : c >= 75 ? 'var(--warning)' : 'var(--success)'; }
  function vColor(p) { return p >= 95 ? 'var(--error)' : p >= 85 ? 'var(--warning)' : 'var(--accent)'; }

  function spark(values, w, h) {
    if (values.length < 2) return '';
    const step = w / 29;
    return 'M ' + values.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / 100) * h).toFixed(1)}`).join(' L ');
  }

  async function refresh() {
    try {
      // Route through dataService — multiple GPU components share the
      // same /gpu cache (2s TTL matches our poll interval). One network
      // round-trip serves whichever components are mounted at the time.
      const data = await dataService.fetch('/gpu', { ttl: 2000 });
      gpu = data.gpus?.[0] || null;
      if (gpu) history = [...history, gpu.gpu_util_pct].slice(-30);
    } catch {}
  }

  onMount(() => {
    refresh();
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  });
</script>

<div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3">
  <div class="flex items-baseline justify-between mb-2">
    <h3 class="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wide">GPU</h3>
    {#if gpu}
      <span class="text-[9px] text-[var(--muted)] font-mono truncate ml-2">{gpu.name.replace('NVIDIA GeForce ', '')}</span>
    {/if}
  </div>

  {#if gpu}
    <!-- VRAM bar with inline numbers -->
    <div class="mb-2">
      <div class="flex justify-between text-[10px] font-mono text-[var(--muted)] mb-1">
        <span>VRAM <span class="text-[var(--text)]">{(gpu.vram_used_mib / 1024).toFixed(1)}</span><span class="text-[var(--muted)]">/{(gpu.vram_total_mib / 1024).toFixed(1)}G</span></span>
        <span style="color: {vColor(gpu.vram_pct)}">{gpu.vram_pct}%</span>
      </div>
      <div class="h-1.5 bg-[var(--bg)] rounded overflow-hidden border border-[var(--border)]">
        <div class="h-full transition-all duration-500" style="width: {gpu.vram_pct}%; background: {vColor(gpu.vram_pct)}"></div>
      </div>
    </div>

    <!-- 3 stats inline -->
    <div class="flex items-baseline justify-between text-[11px] font-mono mb-2">
      <span>
        <span class="text-[var(--muted)]">temp</span>
        <span class="font-semibold" style="color: {tColor(gpu.temp_c)}">{gpu.temp_c}°</span>
      </span>
      <span>
        <span class="text-[var(--muted)]">util</span>
        <span class="font-semibold text-[var(--text)]">{gpu.gpu_util_pct}%</span>
      </span>
      <span>
        <span class="text-[var(--muted)]">pwr</span>
        <span class="font-semibold text-[var(--text)]">{gpu.power_draw_w.toFixed(0)}<span class="text-[var(--muted)] font-normal">/{gpu.power_limit_w.toFixed(0)}W</span></span>
      </span>
    </div>

    <!-- Tiny util sparkline -->
    <svg viewBox="0 0 200 16" class="w-full h-4" preserveAspectRatio="none">
      <path d={spark(history, 200, 16)} fill="none" stroke="var(--accent)" stroke-width="1.2" />
    </svg>
  {:else}
    <div class="text-[11px] text-[var(--muted)] italic py-3 text-center">No GPU</div>
  {/if}
</div>
