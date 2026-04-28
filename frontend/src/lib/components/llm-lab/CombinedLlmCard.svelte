<script>
  /**
   * CombinedLlmCard — one tile fusing active model + GPU vitals into a
   * single card. For dashboard slots where vertical real estate is
   * scarce. Kept the same animations as the standalone cards.
   */
  import { onMount } from 'svelte';
  import { api } from '../../apiClient.js';
  import { websocketService } from '../../services/websocket.js';

  let models = $state([]);
  let gpu = $state(null);
  let now = $state(Date.now());
  let modelState = $state({});

  function ensure(name) {
    if (!modelState[name]) modelState[name] = { flashId: 0, tps: [] };
    return modelState[name];
  }
  function familyColor(f) {
    return ({ gemma3: 'var(--accent)', llama: 'var(--success)', qwen2: 'var(--warning)', qwen3: 'var(--warning)', 'nomic-bert': 'var(--muted)' })[f] || 'var(--accent)';
  }
  function tColor(c) { return c >= 85 ? 'var(--error)' : c >= 75 ? 'var(--warning)' : 'var(--success)'; }
  function vColor(p) { return p >= 95 ? 'var(--error)' : p >= 85 ? 'var(--warning)' : 'var(--accent)'; }
  function tpsColor(t) { return !t ? 'var(--muted)' : t >= 30 ? 'var(--success)' : t >= 10 ? 'var(--warning)' : 'var(--error)'; }
  function fmtExp(iso) {
    if (!iso) return '—';
    const ms = new Date(iso).getTime() - now;
    if (ms <= 0) return '0s';
    if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
    return `${Math.round(ms / 60_000)}m`;
  }
  function spark(values, w, h, max = null) {
    if (values.length < 2) return '';
    const M = max ?? Math.max(...values, 1);
    const m = max ? 0 : Math.min(...values, 0);
    const range = Math.max(M - m, 1);
    const step = w / Math.max(values.length - 1, 1);
    return 'M ' + values.map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - m) / range) * h).toFixed(1)}`).join(' L ');
  }

  async function refreshPs() {
    try {
      const data = await api.get('/ollama/ps');
      const seen = new Set();
      for (const m of data.models || []) { seen.add(m.name); ensure(m.name); }
      for (const k of Object.keys(modelState)) if (!seen.has(k)) delete modelState[k];
      models = data.models || [];
    } catch {}
  }
  let utilHistory = $state([]);
  async function refreshGpu() {
    try {
      const data = await api.get('/gpu');
      gpu = data.gpus?.[0] || null;
      if (gpu) utilHistory = [...utilHistory, gpu.gpu_util_pct].slice(-30);
    } catch {}
  }

  onMount(() => {
    refreshPs(); refreshGpu();
    const a = setInterval(refreshPs, 3000);
    const b = setInterval(refreshGpu, 2000);
    const c = setInterval(() => { now = Date.now(); }, 250);
    const onEvt = (d) => {
      if (d?.type !== 'inference' || !d.agent_name) return;
      const s = ensure(d.agent_name);
      s.flashId++;
      if (typeof d.gen_tps === 'number' && d.gen_tps > 0) s.tps = [...s.tps, d.gen_tps].slice(-15);
    };
    websocketService.on('agent-event', onEvt);
    return () => { clearInterval(a); clearInterval(b); clearInterval(c); websocketService.off('agent-event', onEvt); };
  });
</script>

<div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3">
  <div class="flex items-baseline justify-between mb-2">
    <h3 class="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wide">Local LLM</h3>
    {#if gpu}
      <span class="text-[9px] text-[var(--muted)] font-mono truncate ml-2">{gpu.name.replace('NVIDIA GeForce ', '')}</span>
    {/if}
  </div>

  <!-- Model section -->
  {#if models.length === 0}
    <div class="text-[11px] text-[var(--muted)] italic py-2 text-center">No models in VRAM</div>
  {:else}
    {#each models as m (m.name)}
      {@const s = modelState[m.name] || { flashId: 0, tps: [] }}
      {@const c = familyColor(m.family)}
      {@const last = s.tps[s.tps.length - 1]}
      <div class="combined-row relative pl-2 py-1 mb-2 rounded" style="border-left: 2px solid {c};">
        {#key s.flashId}
          {#if s.flashId > 0}<div class="pulse" style="background: {c};"></div>{/if}
        {/key}
        <div class="relative flex items-baseline gap-1.5">
          <span class="inline-block w-1.5 h-1.5 rounded-full hb flex-shrink-0" style="background: {c};"></span>
          <span class="font-mono text-[12px] text-[var(--text)] font-semibold truncate">{m.name}</span>
          <span class="text-[9px] text-[var(--muted)] font-mono">{m.parameter_size}</span>
        </div>
        <div class="relative flex items-center gap-2 mt-1">
          {#if s.tps.length > 1}
            <svg viewBox="0 0 50 14" class="w-12 h-3.5" preserveAspectRatio="none">
              <path d={spark(s.tps, 50, 14)} fill="none" stroke={tpsColor(last)} stroke-width="1.2" />
            </svg>
            <span class="text-[10px] font-mono font-semibold" style="color: {tpsColor(last)};">{last.toFixed(1)}<span class="text-[var(--muted)] font-normal">tps</span></span>
          {:else}
            <span class="text-[9px] font-mono text-[var(--muted)] italic">awaiting…</span>
          {/if}
          <span class="text-[10px] font-mono text-[var(--muted)] ml-auto">evicts {fmtExp(m.expires_at)}</span>
        </div>
      </div>
    {/each}
  {/if}

  <!-- Divider -->
  <div class="border-t border-[var(--border)] my-2"></div>

  <!-- GPU section -->
  {#if gpu}
    <div class="flex justify-between text-[10px] font-mono text-[var(--muted)] mb-1">
      <span>VRAM <span class="text-[var(--text)]">{(gpu.vram_used_mib / 1024).toFixed(1)}</span><span class="text-[var(--muted)]">/{(gpu.vram_total_mib / 1024).toFixed(1)}G</span></span>
      <span style="color: {vColor(gpu.vram_pct)}">{gpu.vram_pct}%</span>
    </div>
    <div class="h-1.5 bg-[var(--bg)] rounded overflow-hidden border border-[var(--border)] mb-2">
      <div class="h-full transition-all duration-500" style="width: {gpu.vram_pct}%; background: {vColor(gpu.vram_pct)}"></div>
    </div>
    <div class="flex items-baseline justify-between text-[11px] font-mono">
      <span><span class="text-[var(--muted)]">temp </span><span class="font-semibold" style="color: {tColor(gpu.temp_c)}">{gpu.temp_c}°</span></span>
      <span><span class="text-[var(--muted)]">util </span><span class="font-semibold text-[var(--text)]">{gpu.gpu_util_pct}%</span></span>
      <span><span class="text-[var(--muted)]">pwr </span><span class="font-semibold text-[var(--text)]">{gpu.power_draw_w.toFixed(0)}W</span></span>
    </div>
  {/if}
</div>

<style>
  .combined-row { overflow: hidden; }
  .pulse { position: absolute; inset: 0; opacity: 0.3; pointer-events: none; animation: fade 600ms ease-out forwards; }
  @keyframes fade { 0% { opacity: 0.3; } 100% { opacity: 0; } }
  .hb { animation: hb 2.4s ease-out infinite; }
  @keyframes hb {
    0%, 100% { transform: scale(1); }
    20%      { transform: scale(1.3); }
    40%      { transform: scale(1); }
  }
</style>
