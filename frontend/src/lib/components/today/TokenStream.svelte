<script>
  /**
   * TokenStream — paired companion to the cost ticker hero.
   *
   * Subscribes to the backend's `token-usage` WebSocket events. Each
   * event is one inference resolving — model, input/output token
   * counts, and the dollar amount that just landed. Renders them as a
   * flowing list of bursts so a new user can *see* what a token costs.
   *
   * The educational moment: side-by-side with the dollar ticker, the
   * stream makes "this many tokens just cost you that much" visceral
   * in 30 seconds without docs.
   */

  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from '../../services/websocket.js';
  import { formatUsd } from '../../utils/formatUsd.js';

  /**
   * @typedef {{
   *   id: number,
   *   timestamp: string,
   *   model: string,
   *   input_tokens: number,
   *   output_tokens: number,
   *   cache_read_tokens: number,
   *   estimated_cost_usd: number,
   *   project_name?: string|null,
   *   arrived_at: number
   * }} TokenEvent
   */

  /** @type {TokenEvent[]} */
  let events = $state([]);
  let connected = $state(false);
  let totalThisSession = $state({ events: 0, output: 0, input: 0, cost: 0 });
  /** Animation tick — re-derive relative time labels. */
  let now = $state(Date.now());

  let nextId = 1;
  const MAX_EVENTS = 30;
  const FADE_AFTER_MS = 45_000;

  /** @type {ReturnType<typeof setInterval>|null} */
  let tick = null;

  function handleTokenUsage(payload) {
    if (!payload) return;
    const ev = {
      id: nextId++,
      timestamp: payload.timestamp || new Date().toISOString(),
      model: String(payload.model || 'unknown'),
      input_tokens: Number(payload.input_tokens) || 0,
      output_tokens: Number(payload.output_tokens) || 0,
      cache_read_tokens: Number(payload.cache_read_tokens) || 0,
      estimated_cost_usd: Number(payload.estimated_cost_usd) || 0,
      project_name: payload.project_name || null,
      arrived_at: Date.now()
    };
    // Newest at top. Keep only the freshest MAX_EVENTS.
    events = [ev, ...events].slice(0, MAX_EVENTS);
    totalThisSession = {
      events: totalThisSession.events + 1,
      input: totalThisSession.input + ev.input_tokens,
      output: totalThisSession.output + ev.output_tokens,
      cost: totalThisSession.cost + ev.estimated_cost_usd
    };
  }

  function fmtTokens(n) {
    if (n == null) return '0';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return String(n);
  }

  // Per-event costs use 4-decimal precision because individual API
  // requests are typically pennies. Uses the canonical formatter so
  // larger session totals get thousands separators.
  function fmtUsd(n) {
    if (!n || n < 0.0001) return '$0';
    if (n < 0.01) return '<$0.01';
    return formatUsd(n, { precision: 4 });
  }

  function relAge(ms) {
    const s = Math.floor(ms / 1000);
    if (s < 1) return 'now';
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m`;
  }

  /** Soft, deterministic per-model accent so the eye groups bursts. */
  function modelHue(model) {
    let h = 0;
    for (let i = 0; i < model.length; i++) h = (h * 31 + model.charCodeAt(i)) >>> 0;
    return h % 360;
  }

  function shortModel(model) {
    return model.replace(/^claude-/, '').replace(/-\d{8}$/, '');
  }

  // Output-token "burst" sized roughly to log scale so a 50-token burst
  // still has presence and a 5000-token one doesn't dominate.
  function burstWidth(outputTokens) {
    if (outputTokens <= 0) return 0;
    const w = Math.min(100, Math.log10(outputTokens + 1) * 30);
    return Math.max(6, w);
  }

  const handleConnect = () => {
    connected = true;
  };
  const handleDisconnect = () => {
    connected = false;
  };

  onMount(() => {
    connected = websocketService.isConnected();
    websocketService.on('connect', handleConnect);
    websocketService.on('disconnect', handleDisconnect);
    websocketService.on('token-usage', handleTokenUsage);

    tick = setInterval(() => {
      now = Date.now();
      // Drop events older than FADE_AFTER_MS so the panel never grows
      // into an audit trail; that's what /analysis/costs is for.
      events = events.filter(e => now - e.arrived_at < FADE_AFTER_MS);
    }, 1000);
  });

  onDestroy(() => {
    if (tick) clearInterval(tick);
    websocketService.off?.('token-usage', handleTokenUsage);
    websocketService.off?.('connect', handleConnect);
    websocketService.off?.('disconnect', handleDisconnect);
  });
</script>

<section class="bg-surface border border-border rounded-lg p-5 relative overflow-hidden">
  <header class="flex items-baseline justify-between gap-3 mb-3">
    <div>
      <div class="text-xs font-mono uppercase tracking-wide text-muted">Token stream · live</div>
      <p class="text-xs font-sans text-muted/80 mt-1 max-w-[28rem] leading-relaxed">
        Each row is one inference resolving — what was sent, what came back, what it cost. Watch
        alongside the cost number above to feel the unit price of an answer.
      </p>
    </div>
    <span
      class="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wide flex-shrink-0"
    >
      <span
        class="w-1.5 h-1.5 rounded-full {connected ? 'bg-success animate-pulse' : 'bg-warning'}"
        aria-hidden="true"
      ></span>
      <span class={connected ? 'text-success' : 'text-warning'}>
        {connected ? 'connected' : 'offline'}
      </span>
    </span>
  </header>

  {#if events.length === 0}
    <div class="py-6 text-center text-sm text-muted font-sans italic">
      Waiting for the next inference… every Claude or Ollama call lands here.
    </div>
  {:else}
    <ul class="space-y-1.5">
      {#each events as ev (ev.id)}
        {@const age = now - ev.arrived_at}
        {@const opacity = Math.max(0.35, 1 - age / FADE_AFTER_MS)}
        {@const hue = modelHue(ev.model)}
        <li
          class="flex items-baseline gap-3 text-xs font-mono transition-opacity"
          style="opacity:{opacity}"
        >
          <span class="text-muted w-8 flex-shrink-0">{relAge(age)}</span>
          <span
            class="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide flex-shrink-0"
            style="background:hsla({hue}, 70%, 35%, 0.18);color:hsl({hue}, 80%, 70%)"
            title={ev.model}>{shortModel(ev.model)}</span
          >

          <!-- Input → output flow visualization -->
          <span class="flex items-center gap-1 flex-1 min-w-0">
            <span class="text-muted">{fmtTokens(ev.input_tokens)}↑</span>
            <span class="inline-flex items-center gap-0.5">
              <span class="text-muted">→</span>
              <span
                class="inline-block h-1.5 rounded-full"
                style="width:{burstWidth(ev.output_tokens)}px;background:hsl({hue}, 80%, 60%)"
                aria-hidden="true"
              ></span>
            </span>
            <span class="text-body font-semibold">{fmtTokens(ev.output_tokens)}↓</span>
            {#if ev.cache_read_tokens >= 1000}
              <span class="text-muted/70" title="Cached input tokens (cheap)">
                · {fmtTokens(ev.cache_read_tokens)} cached
              </span>
            {/if}
          </span>

          <span class="text-success font-semibold w-20 text-right tabular-nums flex-shrink-0">
            {fmtUsd(ev.estimated_cost_usd)}
          </span>
        </li>
      {/each}
    </ul>
  {/if}

  {#if totalThisSession.events > 0}
    <footer
      class="mt-3 pt-3 border-t border-border text-[10px] font-mono text-muted/70 flex items-baseline justify-between gap-2 flex-wrap"
    >
      <span
        >This session: {totalThisSession.events}
        {totalThisSession.events === 1 ? 'inference' : 'inferences'}</span
      >
      <span class="tabular-nums">
        {fmtTokens(totalThisSession.input)}↑ /
        {fmtTokens(totalThisSession.output)}↓ ·
        <span class="text-success">{fmtUsd(totalThisSession.cost)}</span>
      </span>
    </footer>
  {/if}
</section>
