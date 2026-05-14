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
  import { getAgentBrand } from '../../utils/agentBrand.js';

  let models = $state([]);
  // API-based agents (Claude Code, Codex, …) — they don't sit in VRAM, but
  // they're "active models" from the user's POV. Sourced from
  // /api/process-activity + the live `process-activity` websocket event.
  let apiAgents = $state([]);
  let lastFetch = $state(null);
  let error = $state(null);
  let ollamaOffline = $state(false);
  let offlineDetail = $state('');
  let now = $state(Date.now());

  // An API agent is considered "active" if we've seen a heartbeat within
  // this window. Process-metrics tick ~every 5s, so 90s gives a couple
  // misses of headroom before the row disappears.
  const API_AGENT_TTL_MS = 90_000;

  // Per-model state, keyed by model name.
  //   flashId    — bumps on each new inference (re-triggers CSS animation)
  //   tpsHistory — last 20 gen_tps values for the sparkline
  //   loadedAt   — when we first saw the model resident (for the
  //                "evicts in" vs "in for" calculation)
  const modelState = $state({});

  function ensureState(name) {
    if (!modelState[name]) {
      modelState[name] = {
        flashId: 0,
        tpsHistory: [],
        loadedAt: Date.now(),
        lastProject: null,
        consumers: []
      };
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

  // process-activity rows keyed by raw process agent_name (e.g. "claude-code")
  let processByName = $state({});
  // Latest observed model name per agent_type (e.g. "claude-code" → "claude-opus-4-7"),
  // sourced from /api/api-latency. The Claude CLI process name doesn't carry this —
  // it only shows up on observed Anthropic API requests.
  let latestModelByAgent = $state({});

  function prettyModel(m) {
    if (!m) return null;
    const l = m.toLowerCase();
    if (l.includes('opus-4-7')) return 'Opus 4.7';
    if (l.includes('opus-4-6')) return 'Opus 4.6';
    if (l.includes('opus-4')) return 'Opus 4';
    if (l.includes('sonnet-4-7')) return 'Sonnet 4.7';
    if (l.includes('sonnet-4-6')) return 'Sonnet 4.6';
    if (l.includes('sonnet-4-5')) return 'Sonnet 4.5';
    if (l.includes('sonnet-4')) return 'Sonnet 4';
    if (l.includes('haiku-4-5')) return 'Haiku 4.5';
    if (l.includes('haiku-3-5')) return 'Haiku 3.5';
    return m;
  }

  async function refresh() {
    try {
      // Shared /ollama/ps cache via dataService (3s TTL == poll interval)
      // — CompactActiveModel + CombinedLlmCard + this card all share one
      // network round-trip when on screen together.
      // Backend upstream-fetches /api/ps with a 3s AbortSignal.timeout, so a
      // 5s client timeout is enough headroom and surfaces failure 3× faster
      // than the default 15s — important because three cards share this poll.
      const [data, agentsData, procData, apiLat] = await Promise.all([
        dataService.fetch('/ollama/ps', { ttl: 3000, timeout: 5000 }),
        dataService.fetch('/agents-status', { ttl: 3000, timeout: 5000 }).catch(() => []),
        dataService.fetch('/process-activity', { ttl: 3000, timeout: 5000 }).catch(() => []),
        dataService
          .fetch('/api-latency?limit=20', { ttl: 5000, timeout: 5000 })
          .catch(() => ({ recent: [] }))
      ]);
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
        s.consumers = Array.isArray(m.current_consumers) ? m.current_consumers : [];
      }
      // Drop state for models that are no longer resident.
      for (const k of Object.keys(modelState)) {
        if (!seenNames.has(k)) delete modelState[k];
      }
      models = data.models || [];

      // Replace the by-name map outright on each refresh so dropped processes
      // age out immediately rather than waiting on the cull timer.
      const next = {};
      for (const p of Array.isArray(procData) ? procData : []) {
        if (p?.agent_name) next[p.agent_name] = p;
      }
      processByName = next;
      apiAgents = filterFreshApiAgents(agentsData);

      // Map api-latency rows → most-recent model per agent_type. The repo
      // doesn't tag rows with agent_type, but in practice claude-* models
      // are Claude Code, gpt-* would be Codex, etc. Cheap heuristic that
      // covers the present use case.
      const recent = Array.isArray(apiLat?.recent) ? apiLat.recent : [];
      const modelMap = {};
      for (const row of recent) {
        const m = (row?.model || '').toLowerCase();
        if (!m) continue;
        if (m.includes('claude') && !modelMap['claude-code']) {
          modelMap['claude-code'] = row.model;
        } else if (
          (m.includes('gpt') || m.includes('o1') || m.includes('o3')) &&
          !modelMap['codex']
        ) {
          modelMap['codex'] = row.model;
        }
      }
      latestModelByAgent = modelMap;

      lastFetch = Date.now();
      error = null;
    } catch (e) {
      error = e.message || 'fetch failed';
    }
  }

  function filterFreshApiAgents(rows) {
    if (!Array.isArray(rows)) return [];
    const cutoff = Date.now() - API_AGENT_TTL_MS;
    // Only API-style agents — Ollama (umbrella) and its individual loaded
    // models (`ollama-model`) are rendered below as resident-model rows.
    // Including ollama-model here also collides keys (every loaded model
    // shares agent_type 'ollama-model'), crashing the keyed each block.
    return rows.filter(a => {
      if (!a?.is_running) return false;
      const type = (a.agent_type || '').toLowerCase();
      if (type === 'ollama' || type === 'ollama-model') return false;
      const ts = a.last_seen ? new Date(a.last_seen).getTime() : 0;
      return ts >= cutoff;
    });
  }

  // Match an agents-status row to its latest process-activity row.
  // agents-status uses display agent_type (e.g. "claude-code"); process metrics
  // key by raw process name (also "claude-code" now that the metrics
  // collector stopped lying with a hardcoded model label). Substring
  // match on the lowercased pair is enough to pair them.
  function processFor(agent) {
    const type = (agent?.agent_type || '').toLowerCase();
    if (!type) return null;
    const head = type.split('-')[0];
    for (const [name, row] of Object.entries(processByName)) {
      const lower = name.toLowerCase();
      if (lower.includes(type) || lower.includes(head)) return row;
    }
    return null;
  }

  function activityLabel(state, conns) {
    if (state === 'thinking') {
      return conns > 1 ? `API call (${conns})` : 'API call';
    }
    if (state === 'executing') return 'Executing';
    if (state === 'idle') return 'Idle';
    return state || 'unknown';
  }

  function activityColor(state) {
    if (state === 'thinking') return 'var(--warning)';
    if (state === 'executing') return 'var(--success)';
    return 'var(--muted)';
  }

  /**
   * Per-state pulse rhythm class — extends `heartbeat` with state-aware
   * cadence so users can tell at a glance whether an agent is breathing
   * (idle), thinking (slow inhale/exhale), or executing (sharp tick).
   * @param {string|null|undefined} state
   */
  function rhythmClass(state) {
    if (state === 'thinking') return 'heartbeat rhythm-thinking';
    if (state === 'executing') return 'heartbeat rhythm-executing';
    if (state === 'idle') return 'heartbeat rhythm-idle';
    return 'heartbeat';
  }

  function formatRelative(iso) {
    if (!iso) return '—';
    const ms = Math.max(0, now - new Date(iso).getTime());
    if (ms < 1500) return 'just now';
    if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
    if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
    return `${(ms / 3_600_000).toFixed(1)}h ago`;
  }

  onMount(() => {
    refresh();
    const refreshTimer = setInterval(refresh, 3000);
    // Tick `now` 4× per second for smooth eviction-bar drain.
    const tickTimer = setInterval(() => {
      now = Date.now();
    }, 250);

    const onAgentEvent = data => {
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

    const onProcessActivity = data => {
      if (!data?.agent_name) return;
      processByName = {
        ...processByName,
        [data.agent_name]: {
          timestamp: data.timestamp || new Date().toISOString(),
          agent_name: data.agent_name,
          activity_state: data.activity_state,
          api_connections: data.api_connections,
          network_connections: data.network_connections,
          cpu_usage: data.cpu_usage,
          memory_mb: data.memory_mb
        }
      };
    };
    websocketService.on('process-activity', onProcessActivity);

    // Cull stale API-agent rows on the same cadence as the time tick.
    const cullTimer = setInterval(() => {
      const fresh = filterFreshApiAgents(apiAgents);
      if (fresh.length !== apiAgents.length) apiAgents = fresh;
    }, 5000);

    return () => {
      clearInterval(refreshTimer);
      clearInterval(tickTimer);
      clearInterval(cullTimer);
      websocketService.off('agent-event', onAgentEvent);
      websocketService.off('process-activity', onProcessActivity);
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
  {:else if ollamaOffline && apiAgents.length === 0}
    <div class="text-xs text-[var(--warning)] py-4 text-center">
      <div class="font-semibold">Ollama not reachable</div>
      {#if offlineDetail}
        <div class="text-[10px] text-[var(--muted)] font-mono mt-1">{offlineDetail}</div>
      {/if}
    </div>
  {:else if models.length === 0 && apiAgents.length === 0}
    <div class="text-xs text-[var(--muted)] py-4 text-center leading-relaxed">
      <div class="font-semibold text-body">Nothing in VRAM yet</div>
      <div class="mt-1">VRAM is your GPU's working memory — models load here when running.</div>
      <div class="mt-2 text-[11px]">
        Try <code class="font-mono text-body">ollama run llama3</code> in a terminal and watch this card
        light up.
      </div>
    </div>
  {:else}
    {#if apiAgents.length > 0}
      <div class="space-y-1 mb-2">
        {#each apiAgents as a (a.agent_type || a.agent_name)}
          {@const proc = processFor(a)}
          {@const state = proc?.activity_state}
          {@const conns = proc?.network_connections ?? 0}
          {@const apiConns = proc?.api_connections ?? 0}
          {@const brandColor = a.color || getAgentBrand(a.agent_name).color}
          {@const stateColor = activityColor(state)}
          {@const modelRaw = latestModelByAgent[(a.agent_type || '').toLowerCase()]}
          {@const modelLabel = prettyModel(modelRaw)}
          <div
            class="model-row relative pl-3 py-1 rounded transition-colors"
            style="border-left: 3px solid {brandColor}; --pulse-color: {brandColor};"
            title="API agent — runs against a cloud model, not resident in VRAM."
          >
            <div class="relative flex items-baseline justify-between gap-2">
              <div class="flex items-baseline gap-2 flex-wrap min-w-0">
                <span
                  class="inline-block w-2 h-2 rounded-full {rhythmClass(state)} flex-shrink-0"
                  style="background: {brandColor};"
                  title={state ? `${state}` : 'Active'}
                ></span>
                <span class="font-mono text-sm text-[var(--text)] font-semibold truncate"
                  >{a.agent_name}</span
                >
                {#if modelLabel}
                  <span
                    class="text-[10px] font-mono px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--bg)] text-[var(--text)]"
                    title={`Latest model observed on /api/api-latency: ${modelRaw}`}
                  >
                    {modelLabel}
                  </span>
                {/if}
                {#if state}
                  <span class="text-[10px] font-mono" style="color: {stateColor};">
                    {activityLabel(state, apiConns)}
                  </span>
                {/if}
                {#if conns > 0}
                  <span class="text-[10px] text-[var(--muted)] font-mono">{conns} conn</span>
                {/if}
              </div>
              <div class="flex items-center gap-2 flex-shrink-0">
                <span class="text-[10px] text-[var(--muted)] font-mono"
                  >{formatRelative(a.last_seen)}</span
                >
              </div>
            </div>
            <div
              class="relative mt-1 text-[11px] font-mono text-[var(--muted)] flex flex-wrap items-baseline gap-x-3 gap-y-0.5"
            >
              {#if typeof proc?.cpu_usage === 'number'}
                <span>CPU <span class="text-[var(--text)]">{proc.cpu_usage.toFixed(1)}%</span></span
                >
              {/if}
              {#if proc?.memory_mb > 0}
                <span>RAM <span class="text-[var(--text)]">{proc.memory_mb} MB</span></span>
              {/if}
              {#if a.requests_handled > 0}
                <span
                  >Calls <span class="text-[var(--text)]"
                    >{a.requests_handled.toLocaleString()}</span
                  ></span
                >
              {/if}
              <span class="ml-auto text-[10px]">cloud API</span>
            </div>
          </div>
        {/each}
      </div>
    {/if}
    {#if models.length > 0}
      <!-- Auto-compact when 3+ models are loaded — single stats line, smaller
         padding so a busy multi-model setup stays readable without scroll. -->
      {@const dense = models.length >= 3}
      <div class={dense ? 'space-y-1' : 'space-y-2'}>
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
                <span class="font-mono text-sm text-[var(--text)] font-semibold truncate"
                  >{m.name}</span
                >
                <span class="text-[10px] text-[var(--muted)] font-mono">{m.parameter_size}</span>
                <span class="text-[10px] text-[var(--muted)] font-mono">{m.quantization}</span>
                {#if s.consumers && s.consumers.length > 0}
                  <!-- One chip per distinct caller in the last 5 minutes.
                       A model in VRAM is shareable — atf and sightline
                       can both be hitting gemma3:12b at the same time
                       and the user needs to see both, not just whoever
                       loaded it first. Each chip carries its own alive
                       check, so a project that's gone reads muted with
                       a "· gone" suffix while live ones stay solid. -->
                  <!-- Key combines pid + project because the backend groups
                       by both — the same PID can appear twice when some of
                       its rows have project attribution and others don't
                       (typical during the brief window after restart while
                       projects.json is loading). Falling back to index as
                       a final tiebreaker ensures we never collide. -->
                  {#each s.consumers as c, i (`${c.pid ?? ''}|${c.project ?? ''}|${i}`)}
                    {@const name = c.project ?? c.cwd?.split('/').pop() ?? `pid ${c.pid}`}
                    {@const gone = c.process_alive === false}
                    <span
                      class="text-[10px] font-mono px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] {gone
                        ? 'opacity-60'
                        : ''}"
                      title={`${gone ? 'Was using' : 'Using'} this model — ${c.request_count} ${c.request_count === 1 ? 'request' : 'requests'} in the last 5 min${c.cwd ? `\n${c.cwd}` : ''}`}
                    >
                      {name}{#if gone}<span class="ml-1 italic text-[var(--muted)]">· gone</span
                        >{/if}
                    </span>
                  {/each}
                {:else if s.loadedBy && (s.loadedBy.project || s.loadedBy.cwd)}
                  <!-- Fallback for models loaded but with no inference activity
                       in the recent window (e.g. just loaded, awaiting first
                       call). Keeps the original "loaded by X" treatment. -->
                  {@const loaderName =
                    s.loadedBy.project ?? s.loadedBy.cwd?.split('/').pop() ?? '?'}
                  {@const loaderGone = s.loadedBy.process_alive === false}
                  <span
                    class="text-[10px] font-mono px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] {loaderGone
                      ? 'opacity-60'
                      : ''}"
                    title={loaderGone
                      ? `Loaded by ${s.loadedBy.cmd ?? s.loadedBy.cwd ?? 'unknown'} — process is gone; model lingering until Ollama evicts`
                      : `Loaded by ${s.loadedBy.cmd ?? s.loadedBy.cwd ?? 'unknown'} — no inference yet`}
                  >
                    loaded by {loaderName}{#if loaderGone}<span class="ml-1 italic">· gone</span
                      >{/if}
                  </span>
                {/if}
              </div>
              <div class="flex items-center gap-2 flex-shrink-0">
                {#if s.tpsHistory.length > 1}
                  <svg
                    viewBox="0 0 80 20"
                    class="w-20 h-5"
                    preserveAspectRatio="none"
                    role="img"
                    aria-label="Recent token throughput sparkline"
                  >
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
                  <span class="text-[10px] font-mono text-[var(--muted)] italic"
                    >awaiting inference</span
                  >
                {/if}
              </div>
            </div>

            <!-- Stats row — single line in dense mode, multi-stat in normal mode.
               Disk + GPU offload available via title tooltip when dense. -->
            <div
              class="relative mt-1 text-[11px] font-mono text-[var(--muted)] flex flex-wrap items-baseline gap-x-3 gap-y-0.5"
              title={dense
                ? `Disk ${formatBytes(m.size)} · GPU offload ${m.vram_pct_of_model}%`
                : undefined}
            >
              <span>VRAM <span class="text-[var(--text)]">{formatBytes(m.size_vram)}</span></span>
              {#if !dense}
                <span>Disk <span class="text-[var(--text)]">{formatBytes(m.size)}</span></span>
                <span>GPU <span class="text-[var(--text)]">{m.vram_pct_of_model}%</span></span>
              {/if}
              <span class="ml-auto"
                >Evicts <span style="color: {evictionColor(evPct)};"
                  >{formatExpiry(m.expires_at)}</span
                ></span
              >
            </div>
            <div
              class="relative {dense
                ? 'h-0.5'
                : 'h-1'} bg-[var(--bg)] rounded overflow-hidden border border-[var(--border)] mt-1"
            >
              <div
                class="h-full transition-all duration-300 ease-linear"
                style="width: {evPct}%; background: {evictionColor(evPct)};"
              ></div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
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
    0% {
      opacity: 0.35;
      transform: scale(0.985);
    }
    100% {
      opacity: 0;
      transform: scale(1);
    }
  }

  .heartbeat {
    box-shadow: 0 0 0 0 var(--pulse-color, var(--accent));
    animation: heartbeat 2.4s ease-out infinite;
  }

  @keyframes heartbeat {
    0%,
    100% {
      box-shadow: 0 0 0 0 transparent;
      transform: scale(1);
    }
    20% {
      box-shadow: 0 0 0 4px transparent;
      transform: scale(1.15);
    }
    40% {
      transform: scale(1);
    }
  }

  /* Per-state rhythms — extend `heartbeat` with cadence that matches
     what the agent is doing. Honest stillness when idle (a slow
     breath); thoughtful breathing when thinking; sharp ticks when
     executing tools. Build on the existing infra rather than
     re-implementing. */
  .rhythm-thinking {
    animation: rhythm-thinking 1.6s ease-in-out infinite;
  }

  @keyframes rhythm-thinking {
    0%,
    100% {
      box-shadow: 0 0 0 0 var(--pulse-color, var(--accent));
      transform: scale(1);
    }
    50% {
      box-shadow: 0 0 0 6px transparent;
      transform: scale(1.25);
    }
  }

  .rhythm-executing {
    animation: rhythm-executing 0.55s steps(1, end) infinite;
  }

  @keyframes rhythm-executing {
    0% {
      box-shadow: 0 0 0 0 var(--pulse-color, var(--accent));
      transform: scale(1);
    }
    20% {
      box-shadow: 0 0 0 3px transparent;
      transform: scale(1.4);
    }
    40% {
      transform: scale(1);
    }
    100% {
      transform: scale(1);
    }
  }

  .rhythm-idle {
    /* Honest stillness — a very slow, low-amplitude breath, never zero
       motion (so the dot doesn't read as "frozen") but quiet enough
       not to compete for attention. */
    animation: rhythm-idle 5.2s ease-in-out infinite;
    opacity: 0.7;
  }

  @keyframes rhythm-idle {
    0%,
    100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.08);
    }
  }
</style>
