<script>
  /**
   * HealthIndicator — tiny chrome glyph for the self-analysis result.
   *
   * Polls /api/analysis/code-health every 60s, surfaces the worst-case
   * status (fail > warn > pass > unknown) as a colored dot. Click jumps
   * to /system/code-health. Tooltip carries the headline counts and
   * last-run timestamp.
   *
   * Built so a degrading codebase tells you, instead of you having to
   * remember to navigate to a page to check.
   */

  import { onMount } from 'svelte';
  import { api } from '../apiClient.js';
  import { navigate } from '../utils/router.svelte.js';

  /**
   * @type {'pass' | 'warn' | 'fail' | 'unknown' | 'running'}
   */
  let status = $state('unknown');
  let passed = $state(0);
  let warned = $state(0);
  let failed = $state(0);
  let totalChecks = $state(0);
  let lastRunTimestamp = $state('');

  function statusColor(s) {
    switch (s) {
      case 'fail':
        return 'var(--error)';
      case 'warn':
        return 'var(--warning)';
      case 'pass':
        return 'var(--success)';
      case 'running':
        return 'var(--accent)';
      default:
        return 'var(--muted)';
    }
  }

  function statusLabel(s) {
    switch (s) {
      case 'fail':
        return `Health: ${failed} failing`;
      case 'warn':
        return `Health: ${warned} warning${warned === 1 ? '' : 's'}`;
      case 'pass':
        return `Health: ${passed}/${totalChecks} passing`;
      case 'running':
        return 'Health: analysis running';
      default:
        return 'Health: no data yet';
    }
  }

  function relTime(ts) {
    if (!ts) return '';
    const diff = Date.now() - new Date(ts).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    return `${Math.floor(hr / 24)}d ago`;
  }

  async function refresh() {
    try {
      const data = await api.get('/analysis/code-health').catch(() => null);
      if (!data) return;

      if (data.is_running) {
        status = 'running';
        return;
      }

      const latest = data.latest;
      if (!latest) {
        status = 'unknown';
        return;
      }

      passed = latest.passed_checks ?? 0;
      warned = latest.warned_checks ?? 0;
      failed = latest.failed_checks ?? 0;
      totalChecks = latest.total_checks ?? 0;
      lastRunTimestamp = latest.timestamp ?? '';

      // Worst-case wins: any failure → fail, any warning → warn, else pass.
      // Mirrors how a reader actually scans the dashboard — bad news first.
      if (failed > 0) status = 'fail';
      else if (warned > 0) status = 'warn';
      else status = 'pass';
    } catch {
      // Silent — indicator stays at last known state
    }
  }

  function handleClick() {
    navigate('/system/code-health');
  }

  onMount(() => {
    refresh();
    const t = setInterval(refresh, 60000);
    return () => clearInterval(t);
  });
</script>

<button
  type="button"
  onclick={handleClick}
  title="{statusLabel(status)}{lastRunTimestamp ? ' · ' + relTime(lastRunTimestamp) : ''} · click for Code Health"
  class="flex items-center gap-1.5 px-2 py-1 text-xs text-[var(--muted)] hover:text-[var(--text)] transition-colors bg-transparent border-0 cursor-pointer shrink-0"
  aria-label={statusLabel(status)}
>
  <span
    class="inline-block w-2 h-2 rounded-full transition-colors"
    style="background: {statusColor(status)}"
    class:animate-pulse={status === 'running' || status === 'fail'}
  ></span>
  <span class="hidden lg:inline font-mono uppercase tracking-wide text-[10px]">health</span>
</button>
