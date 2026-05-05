<script>
  /**
   * VitalsStrip — slim full-width row sitting just below the main
   * Header. Surfaces machine vitals (CPU, MEM, GPU VRAM/temp/util/power)
   * with bars + numbers, persistent across every page. The bars are
   * the glanceable signal; the numbers are for when you need detail.
   *
   * Local-LLM devs need to spot machine pressure instantly — this is
   * always one glance away regardless of which page is open.
   */
  import { onMount } from 'svelte';
  import { api } from '../../apiClient.js';

  let cpu = $state(0);
  let memPct = $state(0);
  let memUsed = $state(0);
  let memTotal = $state(0);
  let gpu = $state(null);
  let gpuError = $state(false);
  let costToday = $state(0);
  let costRequests = $state(0);
  let costInputTokens = $state(0);
  let costOutputTokens = $state(0);

  function todayStartIso() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }

  function fmtCost(usd) {
    if (usd >= 100) return `$${usd.toFixed(0)}`;
    if (usd >= 10) return `$${usd.toFixed(1)}`;
    return `$${usd.toFixed(2)}`;
  }

  function fmtTokens(n) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return String(n);
  }

  function barColor(pct) {
    if (pct >= 95) return 'var(--error)';
    if (pct >= 85) return 'var(--warning)';
    return 'var(--accent)';
  }

  function tempColor(c) {
    if (c >= 85) return 'var(--error)';
    if (c >= 75) return 'var(--warning)';
    return 'var(--success)';
  }

  async function refresh() {
    try {
      const sys = await api.get('/system-metrics').catch(() => null);
      if (Array.isArray(sys) && sys[0]) {
        cpu = sys[0].cpu_percent || 0;
        memPct = sys[0].memory_percent || 0;
        memUsed = (sys[0].memory_used_mb || 0) / 1024;
        memTotal = (sys[0].memory_total_mb || 0) / 1024;
      }
    } catch {}
    try {
      const gpuData = await api.get('/gpu').catch(() => null);
      if (gpuData?.gpus?.[0]) {
        gpu = gpuData.gpus[0];
        gpuError = false;
      } else if (gpuData?.error) {
        gpuError = true;
      }
    } catch {
      gpuError = true;
    }
  }

  // Cost data refreshes less often than vitals — token usage events
  // arrive via the agent log watchers, not in real time, and the bill
  // doesn't change every 2 seconds.
  async function refreshCosts() {
    try {
      const start = todayStartIso();
      const summary = await api.get(`/costs/summary?start=${encodeURIComponent(start)}`).catch(() => null);
      if (summary) {
        costToday = summary.total_cost_usd || 0;
        costRequests = summary.total_requests || 0;
        costInputTokens = summary.total_input_tokens || 0;
        costOutputTokens = summary.total_output_tokens || 0;
      }
    } catch {}
  }

  onMount(() => {
    refresh();
    refreshCosts();
    const t = setInterval(refresh, 2000);
    const c = setInterval(refreshCosts, 15000);
    return () => {
      clearInterval(t);
      clearInterval(c);
    };
  });
</script>

<div
  class="border-b border-[var(--border)] bg-[var(--surface)] px-4 py-1.5 flex items-center gap-x-4 gap-y-1 text-[11px] font-mono flex-wrap"
>
  <!-- CPU -->
  <div class="flex items-center gap-1.5" title="CPU usage: {cpu.toFixed(1)}%">
    <span class="text-[var(--muted)] uppercase tracking-wide text-[10px]">CPU</span>
    <div class="w-16 h-1.5 bg-[var(--bg)] rounded overflow-hidden border border-[var(--border)]">
      <div
        class="h-full transition-all duration-500"
        style="width: {Math.min(100, cpu)}%; background: {barColor(cpu)}"
      ></div>
    </div>
    <span class="font-semibold text-[var(--text)] tabular-nums w-8 text-right">{cpu.toFixed(0)}%</span>
  </div>

  <!-- MEM -->
  <div
    class="flex items-center gap-1.5"
    title="Memory: {memUsed.toFixed(1)} / {memTotal.toFixed(1)} GB"
  >
    <span class="text-[var(--muted)] uppercase tracking-wide text-[10px]">MEM</span>
    <div class="w-16 h-1.5 bg-[var(--bg)] rounded overflow-hidden border border-[var(--border)]">
      <div
        class="h-full transition-all duration-500"
        style="width: {Math.min(100, memPct)}%; background: {barColor(memPct)}"
      ></div>
    </div>
    <span class="font-semibold text-[var(--text)] tabular-nums w-8 text-right">{memPct.toFixed(0)}%</span>
  </div>

  {#if gpu}
    <span class="text-[var(--border)]">|</span>

    <!-- GPU name — labels the GPU group, always inline -->
    <span class="text-[var(--text)] text-[10px] font-semibold tracking-wide" title={gpu.name}>
      {gpu.name.replace('NVIDIA GeForce ', '')}
    </span>

    <!-- GPU VRAM -->
    <div
      class="flex items-center gap-1.5"
      title="VRAM: {(gpu.vram_used_mib / 1024).toFixed(2)} / {(gpu.vram_total_mib / 1024).toFixed(2)} GB"
    >
      <span class="text-[var(--muted)] uppercase tracking-wide text-[10px]">VRAM</span>
      <div class="w-20 h-1.5 bg-[var(--bg)] rounded overflow-hidden border border-[var(--border)]">
        <div
          class="h-full transition-all duration-500"
          style="width: {Math.min(100, gpu.vram_pct)}%; background: {barColor(gpu.vram_pct)}"
        ></div>
      </div>
      <span class="font-semibold text-[var(--text)] tabular-nums w-8 text-right">{gpu.vram_pct}%</span>
    </div>

    <!-- GPU stats -->
    <span class="text-[var(--muted)]" title="GPU temperature">
      temp <span class="font-semibold" style="color: {tempColor(gpu.temp_c)};">{gpu.temp_c}°</span>
    </span>
    <span class="text-[var(--muted)]" title="GPU compute utilization">
      util <span class="font-semibold text-[var(--text)]">{gpu.gpu_util_pct}%</span>
    </span>
    <span class="text-[var(--muted)]" title="Power draw / limit (watts)">
      pwr <span class="font-semibold text-[var(--text)]">{gpu.power_draw_w.toFixed(0)}<span class="text-[var(--muted)] font-normal">/{gpu.power_limit_w.toFixed(0)}W</span></span>
    </span>
  {:else if gpuError}
    <span class="text-[var(--border)]">|</span>
    <span class="text-[10px] text-[var(--muted)] italic">no GPU</span>
  {/if}

  <span class="text-[var(--border)]">|</span>

  <!-- Today's API cost — running tally of Claude API spend since midnight.
       Always present so the bill is never out of sight. -->
  <div
    class="flex items-center gap-1.5"
    title="Today: {costRequests} requests · {fmtTokens(costInputTokens)} in · {fmtTokens(costOutputTokens)} out · ${costToday.toFixed(4)}"
  >
    <span class="text-[var(--muted)] uppercase tracking-wide text-[10px]">$ today</span>
    <span class="font-semibold text-[var(--text)] tabular-nums">{fmtCost(costToday)}</span>
    {#if costRequests > 0}
      <span class="text-[var(--muted)] text-[10px]">({costRequests})</span>
    {/if}
  </div>
</div>
