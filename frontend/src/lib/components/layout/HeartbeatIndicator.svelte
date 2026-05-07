<script>
  /**
   * HeartbeatIndicator — global presence element. A single always-
   * visible dot in the header that breathes when idle, pulses slowly
   * when an agent is thinking, ticks sharply when one is executing.
   *
   * Aggregates from /api/process-activity. State priority is:
   *   executing > thinking > (active but unspecified) > idle > offline
   *
   * The discipline: honest stillness when nothing is happening — never
   * fake motion. If no agents have a recent heartbeat, the dot dims
   * and the rhythm slows to "almost still".
   */

  import { onMount, onDestroy } from 'svelte';
  import { api } from '../../apiClient.js';

  /**
   * @typedef {{ agent_name:string, activity_state?:string, timestamp?:string, network_connections?:number }} Process
   */

  /** @type {'executing'|'thinking'|'active'|'idle'|'offline'} */
  let state = $state('offline');
  let recentName = $state('');
  /** @type {ReturnType<typeof setInterval>|null} */
  let poll = null;

  const FRESH_MS = 30_000;

  function pickState(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return { state: 'offline', name: '' };
    const now = Date.now();
    const fresh = rows.filter(r => {
      const ts = r.timestamp ? new Date(r.timestamp).getTime() : 0;
      return now - ts < FRESH_MS;
    });
    if (fresh.length === 0) return { state: 'offline', name: '' };

    /** @type {Record<string, number>} */
    const priority = { executing: 4, thinking: 3, active: 2, idle: 1 };
    let best = { state: 'idle', score: priority.idle, name: fresh[0].agent_name };
    for (const r of fresh) {
      const s = (r.activity_state || '').toLowerCase();
      const norm = s === 'executing' ? 'executing'
        : s === 'thinking' ? 'thinking'
        : (r.network_connections || 0) > 0 ? 'active'
        : 'idle';
      const score = priority[norm] ?? 0;
      if (score > best.score) {
        best = { state: norm, score, name: r.agent_name };
      }
    }
    return { state: best.state, name: best.name };
  }

  async function load() {
    try {
      const data = await api.get('/process-activity');
      const picked = pickState(data);
      state = picked.state;
      recentName = picked.name;
    } catch {
      state = 'offline';
    }
  }

  onMount(() => {
    load();
    poll = setInterval(load, 4_000);
  });
  onDestroy(() => {
    if (poll) clearInterval(poll);
  });

  const stateLabel = $derived.by(() => {
    switch (state) {
      case 'executing': return 'Executing';
      case 'thinking':  return 'Thinking';
      case 'active':    return 'Active';
      case 'idle':      return 'Idle';
      default:          return 'No agent';
    }
  });

  const stateColor = $derived.by(() => {
    switch (state) {
      case 'executing': return 'var(--success)';
      case 'thinking':  return 'var(--warning)';
      case 'active':    return 'var(--accent)';
      case 'idle':      return 'var(--muted)';
      default:          return 'var(--muted)';
    }
  });

  const tooltip = $derived(
    state === 'offline'
      ? 'No agents detected in the last 30s'
      : recentName
        ? `${stateLabel} — ${recentName}`
        : stateLabel
  );
</script>

<div
  class="hidden lg:flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wide pl-2 lg:pl-3 border-l border-[var(--border)] shrink-0"
  title={tooltip}
  aria-label={tooltip}
>
  <span
    class="hb hb-{state} flex-shrink-0"
    style="--hb-color: {stateColor};"
    aria-hidden="true"
  ></span>
  <span class="text-[var(--muted)]">{stateLabel}</span>
</div>

<style>
  .hb {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 9999px;
    background: var(--hb-color, var(--muted));
    box-shadow: 0 0 0 0 var(--hb-color, var(--muted));
  }
  /* Sharper, faster cadence when an agent is actively running tools. */
  .hb-executing {
    animation: hb-tick 0.55s steps(1, end) infinite;
  }
  @keyframes hb-tick {
    0%   { box-shadow: 0 0 0 0 var(--hb-color); transform: scale(1); }
    20%  { box-shadow: 0 0 0 3px transparent; transform: scale(1.45); }
    40%  { transform: scale(1); }
    100% { transform: scale(1); }
  }
  /* Slow breath while reasoning. */
  .hb-thinking {
    animation: hb-breath 1.6s ease-in-out infinite;
  }
  @keyframes hb-breath {
    0%, 100% { box-shadow: 0 0 0 0 var(--hb-color); transform: scale(1); }
    50%      { box-shadow: 0 0 0 5px transparent; transform: scale(1.25); }
  }
  /* "Active" — somewhere between thinking and idle. Gentle. */
  .hb-active {
    animation: hb-pulse 2.4s ease-out infinite;
  }
  @keyframes hb-pulse {
    0%, 100% { box-shadow: 0 0 0 0 transparent; transform: scale(1); }
    20%      { box-shadow: 0 0 0 4px transparent; transform: scale(1.15); }
    40%      { transform: scale(1); }
  }
  /* Honest stillness — a barely-perceptible breath, lower opacity. */
  .hb-idle {
    animation: hb-still 5.2s ease-in-out infinite;
    opacity: 0.65;
  }
  @keyframes hb-still {
    0%, 100% { transform: scale(1); }
    50%      { transform: scale(1.08); }
  }
  /* Offline — completely still + dim, but never invisible. */
  .hb-offline {
    opacity: 0.35;
  }
</style>
