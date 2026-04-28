<script>
  /**
   * RecentInferencesCard — live tail of inference events with full perf
   * detail (prompt-tps, gen-tps, tokens). Seeds from history then
   * follows the websocket stream.
   */
  import { onMount } from 'svelte';
  import { api } from '../../apiClient.js';
  import { websocketService } from '../../services/websocket.js';

  let events = $state([]);
  let error = $state(null);
  const MAX = 15;

  function fmtTime(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour12: false });
  }

  // Color the gen-tps cell by speed: very rough heuristic — green
  // > 30, amber 10-30, red < 10. Models vary, but extremes still
  // surface load issues.
  function tpsColor(tps) {
    if (!tps) return 'var(--muted)';
    if (tps >= 30) return 'var(--success)';
    if (tps >= 10) return 'var(--warning)';
    return 'var(--error)';
  }

  async function seedHistory() {
    try {
      const data = await api.get('/all-agent-events?limit=200');
      // /all-agent-events returns { events: [...] }; filter to inference,
      // then take newest first up to MAX.
      const inf = (data.events || data || [])
        .filter(e => e.event_type === 'inference')
        .slice(0, MAX);
      events = inf.map(e => {
        const meta = typeof e.metadata === 'string' ? safeParse(e.metadata) : e.metadata || {};
        return {
          timestamp: e.timestamp,
          model: e.agent,
          project: meta.project ?? e.project_name ?? null,
          ...meta,
          duration_ms: e.duration_ms
        };
      });
    } catch (e) {
      error = e.message || 'history fetch failed';
    }
  }

  function safeParse(s) {
    try { return JSON.parse(s); } catch { return {}; }
  }

  onMount(() => {
    seedHistory();
    const onEvent = (data) => {
      if (data?.type !== 'inference') return;
      events = [
        {
          timestamp: data.timestamp,
          model: data.agent_name,
          project: data.project ?? null,
          tokens: data.tokens,
          prompt_tokens: data.prompt_tokens,
          gen_tokens: data.gen_tokens,
          prompt_tps: data.prompt_tps,
          gen_tps: data.gen_tps,
          load_ms: data.load_ms,
          prompt_ms: data.prompt_ms,
          gen_ms: data.gen_ms,
          total_ms: data.total_ms,
          duration_ms: data.duration_ms
        },
        ...events
      ].slice(0, MAX);
    };
    websocketService.on('agent-event', onEvent);
    return () => websocketService.off('agent-event', onEvent);
  });
</script>

<div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
  <div class="flex items-baseline justify-between mb-3">
    <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Recent Inferences</h3>
    <span class="text-[10px] text-[var(--muted)] font-mono">live · {events.length}/{MAX}</span>
  </div>

  {#if error}
    <div class="text-xs text-[var(--error)] font-mono">{error}</div>
  {:else if events.length === 0}
    <div class="text-xs text-[var(--muted)] italic py-6 text-center">
      No inferences yet — try a chat with Ollama
    </div>
  {:else}
    <div class="space-y-1.5">
      {#each events as e (e.timestamp + e.model)}
        <div class="flex items-baseline gap-3 text-[11px] font-mono py-1 border-b border-[var(--border)] last:border-b-0">
          <span class="text-[var(--muted)] w-16 flex-shrink-0">{fmtTime(e.timestamp)}</span>
          <span class="text-[var(--text)] truncate min-w-[6rem]" title={e.model}>{e.model}</span>
          {#if e.project}
            <span
              class="text-[10px] font-mono px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] flex-shrink-0"
              title="Project: {e.project}"
            >{e.project}</span>
          {/if}
          <span class="flex-1"></span>
          <span class="text-[var(--muted)]">
            <span class="text-[var(--text)]">{e.tokens || '—'}</span> tok
          </span>
          <span style="color: {tpsColor(e.gen_tps)}" title="generation tokens/sec">
            <span class="font-semibold">{e.gen_tps?.toFixed(1) ?? '—'}</span> tps
          </span>
          <span class="text-[var(--muted)]" title="prompt processing tokens/sec">
            p:{e.prompt_tps?.toFixed(0) ?? '—'}
          </span>
          <span class="text-[var(--muted)]" title="total wall clock">
            {((e.total_ms || e.duration_ms || 0) / 1000).toFixed(2)}s
          </span>
        </div>
      {/each}
    </div>
  {/if}
</div>
