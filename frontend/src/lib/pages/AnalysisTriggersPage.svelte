<script>
  /**
   * Triggers page — alert rules from .raven/config.toml + plugin-fired
   * triggers, plus the recent-fires feed.
   *
   * Rules are defined in TOML, not via this UI; the page surfaces what's
   * loaded, when each fired, and how many times. The previous version had
   * a fake client-side enable/disable toggle and "Test Fire" button that
   * looked authoritative but did nothing real — both removed.
   */

  import { logger } from '../logger.js';
  import { onMount, onDestroy } from 'svelte';
  import { formatShortDateTime } from '../timeFormat.js';
  import { createPageApi } from '../apiClient.js';
  import { PageLayout, PageHeader } from '../components/layout/index.js';
  import { RefreshButton, EmptyState } from '../components/ui/index.js';
  import { websocketService } from '../services/websocket.js';
  import ProjectBadge from '../ProjectBadge.svelte';

  const { api, abort: abortRequests } = createPageApi();

  let triggers = $state([]);
  let triggeredEvents = $state([]);
  let stats = $state({ total_triggers: 0, active_triggers: 0, trigger_counts: {} });
  let loading = $state(false);
  let error = $state(null);
  let successMessage = $state(null);
  let copiedField = $state(null);
  let eventIdCounter = 0;
  let successTimers = [];

  const lastFireTs = $derived.by(() => {
    if (triggeredEvents.length === 0) return null;
    return Math.max(...triggeredEvents.map(e => e.timestamp || 0)) * 1000;
  });

  const fires24h = $derived.by(() => {
    const cutoff = Date.now() / 1000 - 86_400;
    return triggeredEvents.filter(e => (e.timestamp || 0) > cutoff).length;
  });

  // Per-rule firing roll-up so each card shows its real activity instead of
  // the misleading client-side "Enabled" pill.
  const fireSummary = $derived.by(() => {
    const out = {};
    for (const t of triggers) out[t.name] = { count: 0, last: null };
    for (const e of triggeredEvents) {
      const slot = (out[e.trigger_name] = out[e.trigger_name] || { count: 0, last: null });
      slot.count += 1;
      if (!slot.last || e.timestamp > slot.last) slot.last = e.timestamp;
    }
    // Pull authoritative totals from /trigger-stats when we have them — the
    // recent-events list is capped, so its count is a lower bound.
    for (const [name, c] of Object.entries(stats.trigger_counts || {})) {
      out[name] = { count: c, last: out[name]?.last ?? null };
    }
    return out;
  });

  const handleTriggerFired = event => {
    event.id = `event-${eventIdCounter++}`;
    triggeredEvents = [event, ...triggeredEvents].slice(0, 200);
  };

  const handleTriggerStats = newStats => {
    stats = newStats;
  };

  async function loadAllData() {
    loading = true;
    error = null;
    try {
      const [triggersData, events, statsData] = await Promise.all([
        api.get('/triggers-config'),
        api.get('/triggered-events?limit=100'),
        api.get('/trigger-stats')
      ]);
      triggers = triggersData.rules || triggersData || [];
      triggeredEvents = (Array.isArray(events) ? events : []).map(event => ({
        ...event,
        id: `event-${eventIdCounter++}`
      }));
      stats = statsData;
    } catch (err) {
      error = `Failed to load triggers data: ${err?.message || String(err)}`;
      logger.error(error);
    } finally {
      loading = false;
    }
  }

  async function reloadConfig() {
    try {
      const data = await api.post('/triggers-reload', {});
      error = null;
      flashSuccess(data.message || 'Reloaded config');
      await loadAllData();
    } catch (err) {
      error = `Failed to reload config: ${err?.message || String(err)}`;
    }
  }

  async function clearCooldowns() {
    try {
      const data = await api.post('/triggers-clear-cooldowns', {});
      error = null;
      flashSuccess(data.message || 'Cleared cooldowns');
      // Reload so the stats / fire summary reflect the cleared cooldown state.
      await loadAllData();
    } catch (err) {
      error = `Failed to clear cooldowns: ${err?.message || String(err)}`;
    }
  }

  function flashSuccess(msg) {
    successMessage = msg;
    successTimers.push(setTimeout(() => (successMessage = null), 2500));
  }

  async function copyText(label, value) {
    try {
      await navigator.clipboard.writeText(value);
      copiedField = label;
      setTimeout(() => {
        if (copiedField === label) copiedField = null;
      }, 1500);
    } catch {
      /* ignore */
    }
  }

  function formatTimestamp(timestamp) {
    return formatShortDateTime(new Date(timestamp * 1000));
  }

  function timeAgo(ts) {
    if (!ts) return null;
    const ms = Date.now() - (typeof ts === 'number' ? ts : new Date(ts).getTime());
    if (ms < 5_000) return 'just now';
    if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
    if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
    if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
    return `${Math.floor(ms / 86_400_000)}d ago`;
  }

  function formatNumber(n) {
    return (n ?? 0).toLocaleString();
  }

  function getConditionsList(trigger) {
    const c = [];
    if (trigger.file) c.push({ k: 'file', v: trigger.file });
    if (trigger.agent) c.push({ k: 'agent', v: trigger.agent });
    if (trigger.event_type) c.push({ k: 'event_type', v: trigger.event_type });
    if (trigger.lines_changed) c.push({ k: 'lines_changed', v: trigger.lines_changed });
    if (trigger.lines_deleted) c.push({ k: 'lines_deleted', v: trigger.lines_deleted });
    if (trigger.duration_ms) c.push({ k: 'duration_ms', v: trigger.duration_ms });
    if (trigger.cpu_percent) c.push({ k: 'cpu_percent', v: trigger.cpu_percent });
    if (trigger.memory_percent) c.push({ k: 'memory_percent', v: trigger.memory_percent });
    return c;
  }

  function actionToneClass(action) {
    switch (action) {
      case 'notify':
        return 'bg-accent-subtle text-accent border-accent';
      case 'command':
        return 'bg-warning-subtle text-warning border-warning';
      default:
        return 'bg-surface text-muted border-border';
    }
  }

  onMount(async () => {
    await loadAllData();
    websocketService.connect();
    websocketService.on('trigger-fired', handleTriggerFired);
    websocketService.on('trigger-stats', handleTriggerStats);
  });

  onDestroy(() => {
    abortRequests();
    websocketService.off('trigger-fired', handleTriggerFired);
    websocketService.off('trigger-stats', handleTriggerStats);
    successTimers.forEach(clearTimeout);
  });
</script>

<PageLayout>
  <PageHeader
    title="Triggers"
    description="Alert rules over the live event stream. Defined in .raven/config.toml or fired by plugins via raven.trigger(). This page is read-only — edit the TOML to change rules."
  >
    {#snippet actions()}
      <div class="flex items-center gap-2">
        <button
          onclick={reloadConfig}
          class="px-3 py-1.5 bg-surface border border-border rounded text-sm font-sans text-body hover:border-accent hover:text-accent transition-colors"
          title="Re-read .raven/config.toml"
        >
          Reload config
        </button>
        <button
          onclick={clearCooldowns}
          class="px-3 py-1.5 bg-surface border border-border rounded text-sm font-sans text-body hover:border-accent hover:text-accent transition-colors"
          title="Reset per-rule cooldown timers so suppressed rules can fire immediately"
        >
          Clear cooldowns
        </button>
        <RefreshButton onClick={loadAllData} {loading} />
      </div>
    {/snippet}
  </PageHeader>

  {#if successMessage}
    <div class="bg-success-subtle border border-success rounded p-3 mb-4 text-sm text-success">
      {successMessage}
    </div>
  {/if}
  {#if error}
    <div class="bg-error-subtle border border-error rounded p-3 mb-4 text-sm text-error">
      {error}
    </div>
  {/if}

  <!-- Stats strip -->
  <div class="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
    <div class="bg-surface border border-border rounded p-4">
      <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Rules</div>
      <div class="text-sm font-mono text-body">{triggers.length}</div>
    </div>
    <div class="bg-surface border border-border rounded p-4">
      <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Total fires</div>
      <div class="text-sm font-mono text-body">{formatNumber(stats.total_triggers)}</div>
    </div>
    <div class="bg-surface border border-border rounded p-4">
      <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Last 24h</div>
      <div class="text-sm font-mono text-body">{formatNumber(fires24h)}</div>
    </div>
    <div class="bg-surface border border-border rounded p-4">
      <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Last fire</div>
      <div class="text-sm font-mono text-body">
        {lastFireTs ? timeAgo(lastFireTs) : '—'}
      </div>
    </div>
  </div>

  <!-- Rules section -->
  <div class="bg-surface border border-border rounded-lg mb-6">
    <div class="px-5 py-3 border-b border-border flex items-baseline justify-between">
      <h3 class="text-xs font-semibold text-muted uppercase tracking-wide">Configured rules</h3>
      <button
        type="button"
        onclick={() => copyText('config-path', '.raven/config.toml')}
        class="text-[10px] font-mono text-muted hover:text-accent transition-colors flex items-center gap-1 cursor-pointer"
        title="Copy config file path"
      >
        <span>.raven/config.toml</span>
        <span class="opacity-50">{copiedField === 'config-path' ? '✓' : '⎘'}</span>
      </button>
    </div>
    {#if loading && triggers.length === 0}
      <div class="p-5 space-y-3">
        {#each Array(2) as _, i (i)}
          <div class="h-20 bg-canvas border border-border rounded animate-pulse"></div>
        {/each}
      </div>
    {:else if triggers.length === 0}
      <EmptyState
        size="compact"
        title="No rules configured"
        description="Add a [triggers.<name>] table to .raven/config.toml and click Reload config above."
      />
    {:else}
      <div class="divide-y divide-[var(--border)] max-h-[500px] overflow-y-auto">
        {#each triggers as trigger (trigger.name)}
          {@const fire = fireSummary[trigger.name] || { count: 0, last: null }}
          <div class="px-5 py-4">
            <div class="flex items-baseline justify-between gap-3 flex-wrap mb-2">
              <div class="flex items-center gap-2 min-w-0">
                <span
                  class="w-2 h-2 rounded-full {fire.count > 0 ? 'bg-success' : 'bg-muted'}"
                  aria-label={fire.count > 0 ? 'fired' : 'never fired'}
                ></span>
                <span class="font-mono text-sm font-semibold text-body">{trigger.name}</span>
                <span
                  class="text-[10px] font-mono uppercase tracking-wide rounded px-1.5 py-0.5 border {actionToneClass(
                    trigger.action
                  )}"
                  title="action: {trigger.action}"
                >
                  {trigger.action}
                </span>
                {#if trigger.cooldown_seconds > 0}
                  <span class="text-[10px] font-mono text-muted">
                    cooldown {trigger.cooldown_seconds}s
                  </span>
                {/if}
              </div>
              <div class="flex items-center gap-4 text-xs font-mono text-muted">
                <span>
                  <span class="text-body tabular-nums">{formatNumber(fire.count)}</span>
                  fires
                </span>
                {#if fire.last}
                  <span>
                    last
                    <span class="text-body">{timeAgo(fire.last * 1000)}</span>
                  </span>
                {/if}
              </div>
            </div>

            <!-- Conditions: a single line per condition keeps the card compact
                 and matches terminal-density elsewhere on the site. -->
            <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono mb-2">
              {#each getConditionsList(trigger) as cond (cond.k)}
                <span>
                  <span class="text-muted">{cond.k}</span>
                  <span class="text-body ml-1">{cond.v}</span>
                </span>
              {/each}
            </div>

            {#if trigger.message}
              <div class="text-xs font-mono text-muted leading-snug">
                <span class="opacity-60">message:</span>
                <span class="text-body">{trigger.message}</span>
              </div>
            {/if}
            {#if trigger.command}
              <div class="text-xs font-mono mt-1">
                <span class="text-muted opacity-60">command:</span>
                <code class="ml-1 px-2 py-0.5 bg-canvas border border-border rounded text-warning"
                  >{trigger.command}</code
                >
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Recent fires -->
  <div class="bg-surface border border-border rounded-lg mb-6">
    <div class="px-5 py-3 border-b border-border flex items-baseline justify-between">
      <h3 class="text-xs font-semibold text-muted uppercase tracking-wide">Recent fires</h3>
      <span class="text-[10px] font-mono text-muted">live · last {triggeredEvents.length}</span>
    </div>
    {#if triggeredEvents.length === 0}
      <EmptyState
        size="compact"
        title="Nothing has fired yet"
        description="Triggered events stream in here in real time as conditions in your rules are met."
      />
    {:else}
      <ul class="divide-y divide-[var(--border)] max-h-[400px] overflow-y-auto">
        {#each triggeredEvents.slice(0, 50) as event (event.id)}
          <li class="px-5 py-2.5 flex items-baseline gap-3 text-xs font-mono">
            <span class="text-muted/70 w-20 flex-shrink-0">{formatTimestamp(event.timestamp)}</span>
            <span
              class="text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 border flex-shrink-0 {actionToneClass(
                event.action
              )}"
            >
              {event.action || 'log'}
            </span>
            <span class="font-semibold text-accent flex-shrink-0">{event.trigger_name}</span>
            {#if event.project}
              <ProjectBadge project={event.project} size="small" />
            {/if}
            <span class="text-body break-all flex-1">{event.message}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <!-- How to add a rule. Inline so the user doesn't have to leave the page. -->
  <div class="bg-surface border border-border rounded-lg p-5">
    <h3 class="text-xs font-semibold text-muted uppercase tracking-wide mb-4">Add a rule</h3>
    <div class="grid md:grid-cols-2 gap-5 text-sm font-sans text-body leading-relaxed">
      <div class="space-y-3">
        <p>
          Edit <code class="font-mono text-accent">.raven/config.toml</code> and add a
          <code class="font-mono">[triggers.&lt;name&gt;]</code>
          block. Click <span class="font-semibold">Reload config</span> above when you're done.
        </p>
        <ul class="text-xs space-y-1.5">
          <li>
            <span class="font-mono text-muted">match fields:</span>
            <code class="font-mono text-body"
              >file, agent, event_type, lines_changed, lines_deleted, duration_ms, cpu_percent,
              memory_percent</code
            >
          </li>
          <li>
            <span class="font-mono text-muted">numeric ops:</span>
            <code class="font-mono text-body">&gt;N, &lt;N, &gt;=N, &lt;=N, ==N</code>
          </li>
          <li>
            <span class="font-mono text-muted">actions:</span>
            <code class="font-mono text-body">log</code>,
            <code class="font-mono text-body">notify</code>,
            <code class="font-mono text-body">command</code>
          </li>
          <li>
            <span class="font-mono text-muted">cooldown_seconds</span>
            suppresses re-fires of the same rule for that many seconds.
          </li>
        </ul>
        <p class="text-xs text-muted">
          For richer conditions (counts over time windows, project-aware logic), write a
          <a href="/system/plugins" class="text-accent hover:underline">plugin</a> and call
          <code class="font-mono text-body">raven.trigger(name, payload)</code>.
        </p>
      </div>
      <pre
        class="text-xs font-mono p-3 bg-canvas border border-border rounded overflow-auto m-0 leading-relaxed">{`# .raven/config.toml

[triggers.large_edit]
file = "*.ts"
lines_changed = ">200"
action = "notify"
message = "Big edit: {file} ({lines_changed} lines)"
cooldown_seconds = 60

[triggers.slow_claude]
agent = "claude"
duration_ms = ">5000"
action = "log"
message = "Slow {agent}: {file} {duration_ms}ms"
cooldown_seconds = 120`}</pre>
    </div>
  </div>
</PageLayout>
