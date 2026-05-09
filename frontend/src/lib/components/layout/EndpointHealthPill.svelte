<script>
  /**
   * Endpoint health pill — always-on warning when any /system page's
   * primary GET is failing. The backend runs HealthChecker.runAll() every
   * 5 minutes and emits an `endpoint-health` WebSocket event. When checks
   * fail, this pill turns red and shows the count; click → /system/diagnostic.
   *
   * Hidden when everything is healthy. The "no silent failures" tell.
   */
  import { onMount } from 'svelte';
  import { websocketService } from '../../services/websocket.js';
  import { navigate } from '../../utils/router.svelte.js';

  /** @type {{ healthy:boolean, failed:number, criticalFailed:number, total:number,
   *           failures:Array<{name:string, error:string, critical:boolean}>,
   *           checked_at:string } | null} */
  let report = $state(null);

  function onReport(data) {
    report = data;
  }

  onMount(() => {
    websocketService.on('endpoint-health', onReport);
    return () => {
      websocketService.off('endpoint-health', onReport);
    };
  });

  const failed = $derived(report?.failed ?? 0);
  const criticalFailed = $derived(report?.criticalFailed ?? 0);
  const tone = $derived(criticalFailed > 0 ? 'critical' : failed > 0 ? 'warning' : 'healthy');

  function tooltipText(r) {
    if (!r || r.failed === 0) return 'All system endpoints healthy';
    const lines = [`${r.failed}/${r.total} system endpoints failing — click for details`];
    for (const f of (r.failures || []).slice(0, 5)) {
      lines.push(`• ${f.name}${f.critical ? ' (critical)' : ''}: ${f.error || 'failed'}`);
    }
    if ((r.failures || []).length > 5) lines.push(`… and ${r.failures.length - 5} more`);
    return lines.join('\n');
  }
</script>

{#if failed > 0}
  <button
    type="button"
    onclick={() => navigate('/system/diagnostic')}
    title={tooltipText(report)}
    class="flex items-center gap-1.5 px-2 py-1 rounded border text-[11px] font-mono cursor-pointer transition-colors {tone ===
    'critical'
      ? 'bg-error-subtle border-error text-error hover:bg-error/15'
      : 'bg-warning-subtle border-warning text-warning hover:bg-warning/15'}"
    aria-label="{failed} endpoint check{failed === 1 ? '' : 's'} failing"
  >
    <span
      class="w-1.5 h-1.5 rounded-full {tone === 'critical'
        ? 'bg-error animate-pulse'
        : 'bg-warning'}"
      aria-hidden="true"
    ></span>
    <span class="font-semibold">{failed}</span>
    <span class="hidden xl:inline opacity-80">
      {failed === 1 ? 'check failing' : 'checks failing'}
    </span>
  </button>
{/if}
