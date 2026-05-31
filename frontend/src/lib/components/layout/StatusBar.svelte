<script>
  /**
   * StatusBar — the canonical top-of-page chrome strip.
   *
   *   RAVEN.SYSTEM :: PAGE LABEL                         ● Operational
   *
   * Single source of truth for the brand prompt + live websocket dot that
   * every content page wears (PAGE_ZONES zone 01). Self-wires the
   * connection state so pages don't each re-implement it.
   *
   * Props:
   *   label    — the part after `::` (e.g. "Activity", "Architecture · Stack").
   *   prompt   — brand prompt before `::` (default "RAVEN.SYSTEM").
   *   actions  — optional snippet rendered left of the status dot (e.g. a
   *              "[ View source ]" link). Omit for the plain dot.
   */
  import { onMount } from 'svelte';
  import { websocketService } from '../../services/websocket.js';

  /** @type {{ label: string, prompt?: string, actions?: import('svelte').Snippet }} */
  let { label, prompt = 'RAVEN.SYSTEM', actions } = $props();

  let connected = $state(false);

  onMount(() => {
    connected = websocketService.isConnected();
    const update = () => {
      connected = websocketService.isConnected();
    };
    websocketService.on('connect', update);
    websocketService.on('disconnect', update);
    return () => {
      websocketService.off('connect', update);
      websocketService.off('disconnect', update);
    };
  });
</script>

<div
  class="flex items-center justify-between gap-3 text-xs font-mono text-muted border-b border-border pb-2"
>
  <div class="flex items-center gap-2 min-w-0">
    <span class="text-accent font-semibold">{prompt}</span>
    <span aria-hidden="true">::</span>
    <span class="uppercase tracking-wide truncate">{label}</span>
  </div>
  <div class="flex items-center gap-3 shrink-0">
    {#if actions}{@render actions()}{/if}
    <span
      class="flex items-center gap-2"
      role="status"
      aria-label={connected ? 'Live — monitoring active' : 'Disconnected'}
    >
      <span class="w-1.5 h-1.5 rounded-full {connected ? 'bg-success animate-pulse' : 'bg-warning'}"
      ></span>
      <span class="uppercase tracking-wide {connected ? 'text-success' : 'text-warning'}">
        {connected ? 'Operational' : 'Disconnected'}
      </span>
    </span>
  </div>
</div>
