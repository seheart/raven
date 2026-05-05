<script>
  /**
   * ActiveModelCard — what's resident in VRAM right now, made alive:
   *   • left-border family color
   *   • pulse animation when an inference fires for this model
   *   • inline sparkline of recent gen-tps
   *   • smoothly draining eviction bar (sub-second)
   */
  import { onMount } from 'svelte';
  import { dataService } from '../../dataService.js';
  import { websocketService } from '../../services/websocket.js';

  let models = $state([]);
  let lastFetch = $state(null);
  let error = $state(null);
  let ollamaOffline = $state(false);
  let offlineDetail = $state('');
  let now = $state(Date.now());

  // Per-model state, keyed by model name.
  //   flashId    — bumps on each new inference (re-triggers CSS animation)
  //   tpsHistory — last 20 gen_tps values for the sparkline
  //   loadedAt   — when we first saw the model resident (for the
  //                "evicts in" vs "in for" calculation)
  const modelState = $state({});

  function ensureState(name) {
    if (!modelState[name]) {
      modelState[name] = { flashId: 0, tpsHistory: [], loadedAt: Date.now(), lastProject: null };
    }
    return modelState[name];
  }

  function familyColor(family) {
    const map = {
      gemma3: 'var(--accent)',
      llama: 'var(--success)',
      qwen2: 'var(--warning)',
      qwen3: 'var(--warning)',
      'nomic-bert': 'var(--muted)'
    };
    return map[family] || 'var(--accent)';
  }

  function formatBytes(b) {
    if (!b) return '—';
    const gb = b / 1e9;
    return gb >= 1 ? `${gb.toFixed(2)} GB` : `${(b / 1e6).toFixed(0)} MB`;
  }

  function formatExpiry(iso) {
    if (!iso) return '—';
    const ms = new Date(iso).getTime() - now;
    if (ms <= 0) return 'expiring';
    if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
    return `${(ms / 3_600_000).toFixed(1)}h`;
  }

  // % of TTL remaining — used by the draining eviction bar. Fixed
  // 5min ceiling: if expires_at is more than 5min away the bar is full;
  // matches Ollama's typical default keep-alive.
  function evictionPct(iso) {
    if (!iso) return 0;
    const ms = new Date(iso).getTime() - now;
    const ceiling = 5 * 60 * 1000;
    return Math.max(0, Math.min(100, (ms / ceiling) * 100));
  }

  function evictionColor(pct) {
    if (pct < 15) return 'var(--error)';
    if (pct < 40) return 'var(--warning)';
    return 'var(--success)';
  }

  function tpsColor(tps) {
    if (!tps) return 'var(--muted)';
    if (tps >= 30) return 'var(--success)';
    if (tps >= 10) return 'var(--warning)';
    return 'var(--error)';
  }

  function sparklinePath(values, w, h) {
    if (values.length < 2) return '';
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const range = Math.max(max - min, 1);
    const step = w / Math.max(values.length - 1, 1);
    const points = values.map((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return `M ${points.join(' L ')}`;
  }

  async function refresh() {
    try {
      // Shared /ollama/ps cache via dataService (3s TTL == poll interval)
      // — CompactActiveModel + CombinedLlmCard + this card all share one
      // network round-trip when on screen together.
      const data = await dataService.fetch('/ollama/ps', { ttl: 3000 });
      ollamaOffline = data.ollama_status === 'offline';
      offlineDetail = data.detail || '';
      const seenNames = new Set();
      for (const m of data.models || []) {
        seenNames.add(m.name);
        const s = ensureState(m.name);
        // Seed lastProject from history so the chip shows on page load.
        // Live websocket events overwrite this with newer values.
        if (!s.lastProject && m.last_project) s.lastProject = m.last_project;
        if (m.last_loaded_by) s.loadedBy = m.last_loaded_by;
      }
      // Drop state for models that are no longer resident.
      for (const k of Object.keys(modelState)) {
        if (!seenNames.has(k)) delete modelState[k];
      }
      models = data.models || [];
      lastFetch = Date.now();
      error = null;
    } catch (e) {
      error = e.message || 'fetch failed';
    }
  }

  onMount(() => {
    refresh();
    const refreshTimer = setInterval(refresh, 3000);
    // Tick `now` 4× per second for smooth eviction-bar drain.
    const tickTimer = setInterval(() => { now = Date.now(); }, 250);

    const onAgentEvent = (data) => {
      if (data?.type !== 'inference') return;
      const name = data.agent_name;
      if (!name) return;
      const s = ensureState(name);
      s.flashId++;
      const tps = typeof data.gen_tps === 'number' ? data.gen_tps : 0;
      if (tps > 0) {
        s.tpsHistory = [...s.tpsHistory, tps].slice(-20);
      }
      if (data.project) s.lastProject = data.project;
    };
    websocketService.on('agent-event', onAgentEvent);

    return () => {
      clearInterval(refreshTimer);
      clearInterval(tickTimer);
      websocketService.off('agent-event', onAgentEvent);
    };
  });
</script>

<div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3">
  <div class="flex items-baseline justify-between mb-2">
    <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Active Models</h3>
    <span class="text-[10px] text-[var(--muted)] font-mono" title="/api/ps">
      {#if lastFetch}
        {@const ageS = Math.max(0, Math.floor((now - lastFetch) / 1000))}
        Updated {ageS}s ago
      {:else}
        /api/ps
      {/if}
    </span>
  </div>

  {#if error}
    <div class="text-xs text-[var(--error)] font-mono">{error}</div>
  {:else if ollamaOffline}
    <div class="text-xs text-[var(--warning)] py-4 text-center">
      <div class="font-semibold">Ollama not reachable</div>
      {#if offlineDetail}
        <div class="text-[10px] text-[var(--muted)] font-mono mt-1">{offlineDetail}</div>
      {/if}
    </div>
  {:else if models.length === 0}
    <div class="text-xs text-[var(--muted)] italic py-4 text-center">
      No models resident in VRAM
    </div>
  {:else}
    <!-- Auto-compact when 3+ models are loaded — single stats line, smaller
         padding so a busy multi-model setup stays readable without scroll. -->
    {@const dense = models.length >= 3}
    <div class="{dense ? 'space-y-1' : 'space-y-2'}">
      {#each models as m (m.name)}
        {@const s = modelState[m.name] || { flashId: 0, tpsHistory: [] }}
        {@const color = familyColor(m.family)}
        {@const lastTps = s.tpsHistory[s.tpsHistory.length - 1]}
        {@const evPct = evictionPct(m.expires_at)}
        <div
          class="model-row relative pl-3 py-1 rounded transition-colors"
          style="border-left: 3px solid {color}; --pulse-color: {color};"
        >
          <!-- Pulse layer — re-keyed on each inference to retrigger animation -->
          {#key s.flashId}
            {#if s.flashId > 0}
              <div class="pulse-overlay" style="background: {color};"></div>
            {/if}
          {/key}

          <!-- Heading row -->
          <div class="relative flex items-baseline justify-between gap-2">
            <div class="flex items-baseline gap-2 flex-wrap min-w-0">
              <span
                class="inline-block w-2 h-2 rounded-full heartbeat flex-shrink-0"
                style="background: {color};"
                title="Resident"
              ></span>
              <span class="font-mono text-sm text-[var(--text)] font-semibold truncate">{m.name}</span>
              <span class="text-[10px] text-[var(--muted)] font-mono">{m.parameter_size}</span>
              <span class="text-[10px] text-[var(--muted)] font-mono">{m.quantization}</span>
              {#if s.lastProject}
                <span
                  class="text-[10px] font-mono px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--bg)] text-[var(--text)]"
                  title={s.loadedBy
                    ? `Last used by '${s.lastProject}'\nLoaded by: ${s.loadedBy.project ?? s.loadedBy.cmd ?? s.loadedBy.cwd ?? 'unknown'}`
                    : `Last used by '${s.lastProject}'`}
                >
                  {s.lastProject}
                </span>
              {:else if s.loadedBy && (s.loadedBy.project || s.loadedBy.cwd)}
                <span
                  class="text-[10px] font-mono px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--bg)] text-[var(--muted)]"
                  title={`Loaded by ${s.loadedBy.cmd ?? s.loadedBy.cwd ?? 'unknown'} — no inference yet`}
                >
                  loaded by {s.loadedBy.project ?? s.loadedBy.cwd?.split('/').pop() ?? '?'}
                </span>
              {/if}
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
              {#if s.tpsHistory.length > 1}
                <svg viewBox="0 0 80 20" class="w-20 h-5" preserveAspectRatio="none">
                  <path
                    d={sparklinePath(s.tpsHistory, 80, 20)}
                    fill="none"
                    stroke={tpsColor(lastTps)}
                    stroke-width="1.4"
                    stroke-linejoin="round"
                  />
                </svg>
                <span
                  class="text-[11px] font-mono font-semibold tabular-nums"
                  style="color: {tpsColor(lastTps)};"
                >
                  {lastTps.toFixed(1)}<span class="text-[var(--muted)] font-normal"> tps</span>
                </span>
              {:else}
                <span class="text-[10px] font-mono text-[var(--muted)] italic">awaiting inference</span>
              {/if}
            </div>
          </div>

          <!-- Stats row — single line in dense mode, multi-stat in normal mode.
               Disk + GPU offload available via title tooltip when dense. -->
          <div
            class="relative mt-1 text-[11px] font-mono text-[var(--muted)] flex flex-wrap items-baseline gap-x-3 gap-y-0.5"
            title={dense ? `Disk ${formatBytes(m.size)} · GPU offload ${m.vram_pct_of_model}%` : undefined}
          >
            <span>VRAM <span class="text-[var(--text)]">{formatBytes(m.size_vram)}</span></span>
            {#if !dense}
              <span>Disk <span class="text-[var(--text)]">{formatBytes(m.size)}</span></span>
              <span>GPU <span class="text-[var(--text)]">{m.vram_pct_of_model}%</span></span>
            {/if}
            <span class="ml-auto">Evicts <span style="color: {evictionColor(evPct)};">{formatExpiry(m.expires_at)}</span></span>
          </div>
          <div class="relative {dense ? 'h-0.5' : 'h-1'} bg-[var(--bg)] rounded overflow-hidden border border-[var(--border)] mt-1">
            <div
              class="h-full transition-all duration-300 ease-linear"
              style="width: {evPct}%; background: {evictionColor(evPct)};"
            ></div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .model-row {
    overflow: hidden;
  }

  .pulse-overlay {
    position: absolute;
    inset: 0;
    opacity: 0.35;
    pointer-events: none;
    animation: pulse-fade 700ms ease-out forwards;
  }

  @keyframes pulse-fade {
    0% { opacity: 0.35; transform: scale(0.985); }
    100% { opacity: 0; transform: scale(1); }
  }

  .heartbeat {
    box-shadow: 0 0 0 0 var(--pulse-color, var(--accent));
    animation: heartbeat 2.4s ease-out infinite;
  }

  @keyframes heartbeat {
    0%, 100% { box-shadow: 0 0 0 0 transparent; transform: scale(1); }
    20%      { box-shadow: 0 0 0 4px transparent; transform: scale(1.15); }
    40%      { transform: scale(1); }
  }
</style>
