<script>
  /**
   * ContextVessel — visualizes how full each active conversation's
   * context window is. A bar per session, color shifting from green
   * (ok) → amber (warm) → red (tight/overflow) as the model approaches
   * its limit. Educational because most users have no felt sense of
   * what 200k tokens means until they see it fill.
   *
   * @typedef {{
   *   session_id: string,
   *   model: string,
   *   model_family: string,
   *   project_name: string|null,
   *   last_seen: string,
   *   context_tokens: number,
   *   context_limit: number,
   *   fraction: number,
   *   band: 'ok'|'warm'|'tight'|'overflow'
   * }} ContextWindow
   */

  import { onMount, onDestroy } from 'svelte';
  import { api } from '../../apiClient.js';
  import { websocketService } from '../../services/websocket.js';

  /** @type {ContextWindow[]} */
  let windows = $state([]);
  /** @type {ReturnType<typeof setInterval>|null} */
  let refresh = null;

  async function load() {
    try {
      const data = await api.get('/context/current?limit=4');
      windows = Array.isArray(data) ? data : [];
    } catch {
      // Silent — supplementary surface; never blocks the page.
    }
  }

  function fmtTokens(n) {
    if (!n) return '0';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
    return String(n);
  }

  /** @param {string} band */
  function bandClass(band) {
    switch (band) {
      case 'overflow': return 'bg-error';
      case 'tight':    return 'bg-error/80';
      case 'warm':     return 'bg-warning';
      case 'ok':       return 'bg-success';
      default:         return 'bg-muted';
    }
  }
  /** @param {string} band */
  function bandLabel(band) {
    switch (band) {
      case 'overflow': return 'over limit';
      case 'tight':    return 'nearly full';
      case 'warm':     return 'over half';
      case 'ok':       return 'plenty of room';
      default:         return '';
    }
  }

  function shortModel(model) {
    return model.replace(/^claude-/, '').replace(/-\d{8}$/, '').replace(/:.*$/, '');
  }

  onMount(() => {
    load();
    // Poll modestly — the right way is WS-driven from token-usage, but a
    // 12s poll is good enough for a vessel that fills slowly.
    refresh = setInterval(load, 12_000);
    // Also refresh as soon as a token-usage event lands so the bar moves
    // visibly the moment a request resolves.
    websocketService.on('token-usage', load);
  });
  onDestroy(() => {
    if (refresh) clearInterval(refresh);
    websocketService.off?.('token-usage', load);
  });
</script>

{#if windows.length > 0}
  <div class="bg-surface border border-border rounded-lg p-4">
    <div class="text-xs font-mono uppercase tracking-wide text-muted mb-3">Context windows</div>
    <ul class="space-y-3">
      {#each windows as w (w.session_id)}
        {@const widthPct = Math.min(100, w.fraction * 100)}
        <li>
          <div class="flex items-baseline justify-between gap-2 text-xs font-mono mb-1">
            <span class="text-body truncate" title={w.model}>{shortModel(w.model)}</span>
            <span class="text-muted tabular-nums">
              {fmtTokens(w.context_tokens)} / {fmtTokens(w.context_limit)}
            </span>
          </div>
          <div
            class="relative h-2 rounded-full overflow-hidden bg-canvas border border-border"
            title="{bandLabel(w.band)} — {Math.round(w.fraction * 100)}% of {fmtTokens(w.context_limit)} context"
          >
            <div
              class="absolute inset-y-0 left-0 {bandClass(w.band)} transition-all duration-500"
              style="width: {widthPct}%"
            ></div>
            {#if w.band === 'overflow'}
              <div
                class="absolute inset-y-0 right-0 w-1 bg-error/60 animate-pulse"
                aria-hidden="true"
              ></div>
            {/if}
          </div>
          <div class="mt-1 text-[10px] font-mono text-muted/70 flex justify-between">
            <span>{w.project_name || '—'}</span>
            <span class="uppercase tracking-wide">{bandLabel(w.band)}</span>
          </div>
        </li>
      {/each}
    </ul>
    <p class="mt-3 text-[11px] font-sans text-muted/80 leading-relaxed">
      Approximated from the latest turn's <code class="text-body">input + cache_read</code> tokens. The closer to full, the more you're paying per inference (and the closer Claude is to truncating).
    </p>
  </div>
{/if}
