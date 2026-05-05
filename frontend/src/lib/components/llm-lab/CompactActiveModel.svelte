<script>
  /**
   * CompactActiveModel — denser treatment of ActiveModelCard for the
   * dashboard's narrow column. Drops disk size + GPU-offload %, keeps
   * the live pulse, sparkline, and eviction bar.
   */
  import { onMount } from 'svelte';
  import { dataService } from '../../dataService.js';
  import { websocketService } from '../../services/websocket.js';

  let models = $state([]);
  let now = $state(Date.now());
  const modelState = $state({});

  function ensure(name) {
    if (!modelState[name]) modelState[name] = { flashId: 0, tps: [] };
    return modelState[name];
  }

  function familyColor(f) {
    return ({ gemma3: 'var(--accent)', llama: 'var(--success)', qwen2: 'var(--warning)', qwen3: 'var(--warning)', 'nomic-bert': 'var(--muted)' })[f] || 'var(--accent)';
  }

  function fmtBytes(b) {
    return b ? `${(b / 1e9).toFixed(1)}G` : '—';
  }

  function fmtExp(iso) {
    if (!iso) return '—';
    const ms = new Date(iso).getTime() - now;
    if (ms <= 0) return '0s';
    if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
    return `${Math.round(ms / 60_000)}m`;
  }

  function evPct(iso) {
    if (!iso) return 0;
    const ms = new Date(iso).getTime() - now;
    return Math.max(0, Math.min(100, (ms / 300_000) * 100));
  }

  function tpsColor(t) {
    if (!t) return 'var(--muted)';
    if (t >= 30) return 'var(--success)';
    if (t >= 10) return 'var(--warning)';
    return 'var(--error)';
  }

  function spark(values, w, h) {
    if (values.length < 2) return '';
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const range = Math.max(max - min, 1);
    const step = w / Math.max(values.length - 1, 1);
    return 'M ' + values.map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`).join(' L ');
  }

  async function refresh() {
    try {
      // Shared /ollama/ps cache via dataService (3s TTL == poll interval).
      const data = await dataService.fetch('/ollama/ps', { ttl: 3000 });
      const seen = new Set();
      for (const m of data.models || []) { seen.add(m.name); ensure(m.name); }
      for (const k of Object.keys(modelState)) if (!seen.has(k)) delete modelState[k];
      models = data.models || [];
    } catch {}
  }

  onMount(() => {
    refresh();
    const r = setInterval(refresh, 3000);
    const t = setInterval(() => { now = Date.now(); }, 250);
    const onEvt = (d) => {
      if (d?.type !== 'inference' || !d.agent_name) return;
      const s = ensure(d.agent_name);
      s.flashId++;
      if (typeof d.gen_tps === 'number' && d.gen_tps > 0) s.tps = [...s.tps, d.gen_tps].slice(-15);
    };
    websocketService.on('agent-event', onEvt);
    return () => { clearInterval(r); clearInterval(t); websocketService.off('agent-event', onEvt); };
  });
</script>

<div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3">
  <div class="flex items-baseline justify-between mb-2">
    <h3 class="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wide">Active</h3>
    <span class="text-[9px] text-[var(--muted)] font-mono">{models.length}</span>
  </div>

  {#if models.length === 0}
    <div class="text-[11px] text-[var(--muted)] italic py-3 text-center">No models in VRAM</div>
  {:else}
    <div class="space-y-2">
      {#each models as m (m.name)}
        {@const s = modelState[m.name] || { flashId: 0, tps: [] }}
        {@const c = familyColor(m.family)}
        {@const last = s.tps[s.tps.length - 1]}
        {@const ev = evPct(m.expires_at)}
        <div class="compact-row relative pl-2 py-1 rounded" style="border-left: 2px solid {c}; --pc: {c};">
          {#key s.flashId}
            {#if s.flashId > 0}
              <div class="pulse" style="background: {c};"></div>
            {/if}
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
            <span class="text-[10px] font-mono text-[var(--muted)] ml-auto">{fmtBytes(m.size_vram)} · {fmtExp(m.expires_at)}</span>
          </div>
          <div class="relative h-0.5 bg-[var(--bg)] rounded mt-1 overflow-hidden border border-[var(--border)]">
            <div class="h-full transition-all duration-300 ease-linear" style="width: {ev}%; background: {c};"></div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .compact-row { overflow: hidden; }
  .pulse { position: absolute; inset: 0; opacity: 0.3; pointer-events: none; animation: fade 600ms ease-out forwards; }
  @keyframes fade { 0% { opacity: 0.3; } 100% { opacity: 0; } }
  .hb { animation: hb 2.4s ease-out infinite; }
  @keyframes hb {
    0%, 100% { transform: scale(1); }
    20%      { transform: scale(1.3); }
    40%      { transform: scale(1); }
  }
</style>
