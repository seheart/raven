<script>
  import { onMount } from 'svelte';
  import { dataService } from '../dataService.js';
  import { logger } from '../logger.js';
  import { formatDateOnly } from '../timeFormat.js';
  import { PageLayout, PageHeader } from '../components/layout/index.js';
  import {
    RefreshButton,
    EmptyState,
    DataFetchError,
    FreshnessBadge
  } from '../components/ui/index.js';

  let models = $state([]);
  let latencyByModel = $state([]);
  let loading = $state(true);

  const totalEvents = $derived(models.reduce((sum, m) => sum + m.total_events, 0));
  const totalInferences = $derived(models.reduce((sum, m) => sum + m.inferences, 0));
  const runningCount = $derived(models.filter(m => m.is_running).length);

  function formatNumber(n) {
    return n?.toLocaleString() || '0';
  }

  function timeAgo(d) {
    if (!d) return 'Never';
    const diff = Date.now() - new Date(d).getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  }

  function formatDuration(ms) {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  /** @type {string|null} */
  let loadError = $state(null);

  async function loadData(force = false) {
    try {
      loading = true;
      loadError = null;
      const [data, latency] = await Promise.all([
        dataService.fetch('/models', { ttl: 5000, forceRefresh: force }),
        dataService
          .fetch('/latency-by-model?minutes=60', { ttl: 5000, forceRefresh: force })
          .catch(() => ({ models: [] }))
      ]);
      models = Array.isArray(data) ? data : [];
      latencyByModel = latency?.models || [];
    } catch (err) {
      // Was logger.error-only; failed loads left the user on a blank
      // grid with no signal. Latency sub-fetch keeps its silent fallback
      // (empty list) so a flaky latency endpoint doesn't blank the rest.
      logger.error('Failed to load models:', err);
      loadError = err?.message || String(err);
    } finally {
      loading = false;
    }
  }

  onMount(() => loadData());
</script>

<PageLayout>
  <PageHeader title="Models" description="AI models and tools tracked by Raven">
    {#snippet actions()}
      <div class="flex items-center gap-3">
        <FreshnessBadge mode="polled" />
        <RefreshButton onClick={() => loadData(true)} {loading} />
      </div>
    {/snippet}
  </PageHeader>

  {#if loadError}
    <DataFetchError
      endpoint="/api/models"
      message="Couldn't load model data"
      hint={loadError}
      onRetry={() => loadData(true)}
    />
  {/if}

  {#if loading && models.length === 0}
    <div class="space-y-4">
      {#each Array(3) as _, i (i)}
        <div class="bg-surface border border-border rounded-lg p-5 animate-pulse">
          <div class="h-5 bg-canvas rounded w-48 mb-3"></div>
          <div class="grid grid-cols-4 gap-4">
            <div class="h-10 bg-canvas rounded"></div>
            <div class="h-10 bg-canvas rounded"></div>
            <div class="h-10 bg-canvas rounded"></div>
            <div class="h-10 bg-canvas rounded"></div>
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <!-- Summary Stats -->
    <div class="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
      <div class="bg-surface border border-border rounded p-4">
        <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Models</div>
        <div class="text-sm font-mono text-body">{models.length}</div>
      </div>
      <div class="bg-surface border border-border rounded p-4">
        <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Running</div>
        <div class="text-sm font-mono text-success">{runningCount}</div>
      </div>
      <div class="bg-surface border border-border rounded p-4">
        <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
          Total Events
        </div>
        <div class="text-sm font-mono text-body">{formatNumber(totalEvents)}</div>
      </div>
      <div class="bg-surface border border-border rounded p-4">
        <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Inferences</div>
        <div class="text-sm font-mono text-body">{formatNumber(totalInferences)}</div>
      </div>
    </div>

    <!-- Per-model latency distribution (last hour). Combines Claude API
           latency from api_latency with Ollama duration_ms from agent_events
           so every observed model shows up in one panel. -->
    {#if latencyByModel.length > 0}
      <div class="bg-surface border border-border rounded-lg p-4 mb-6">
        <div class="flex items-baseline justify-between mb-2">
          <h3 class="text-xs font-semibold text-muted uppercase tracking-wide">
            Latency · last 60min
          </h3>
          <span class="text-[10px] text-muted font-mono">p50 / p95 / max (ms)</span>
        </div>
        <p class="text-[11px] text-muted font-sans mb-3 leading-snug">
          How long each model took to respond. <strong class="text-body">p50</strong> is the median
          (typical), <strong class="text-body">p95</strong> is the slow tail (1 in 20 calls were
          this slow or worse), and <strong class="text-body">max</strong> is the worst single call. Lower
          is better.
        </p>
        <div class="space-y-1 max-h-[400px] overflow-y-auto">
          {#each latencyByModel as l (l.model)}
            <div
              class="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 text-[11px] font-mono py-1 border-b border-border last:border-b-0"
            >
              <span class="text-body truncate" title={l.model}>{l.model}</span>
              <span class="text-muted text-right">{l.count}×</span>
              <span class="text-body text-right tabular-nums">{l.p50_ms}</span>
              <span class="text-warning text-right tabular-nums">{l.p95_ms}</span>
              <span class="text-error text-right tabular-nums">{l.max_ms}</span>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Model Cards -->
    {#if models.length === 0}
      <EmptyState
        title="No models detected yet"
        description="Run `ollama run llama3` (or any local model) and it'll appear here with live token rate, VRAM use, and request stats. Hosted models from Claude / OpenAI show up automatically when you call them via Claude Code."
      />
    {:else}
      <div class="space-y-4 max-h-[500px] overflow-y-auto">
        {#each models as model (model.name)}
          <div class="bg-surface border border-border rounded-lg overflow-hidden">
            <!-- Model Header -->
            <div class="flex items-center gap-4 px-5 py-4 border-b border-border">
              <span
                class="w-4 h-4 rounded-full flex-shrink-0 {model.is_running ? 'animate-pulse' : ''}"
                style="background: {model.color}"
              ></span>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-3">
                  <h3 class="text-lg font-bold text-body font-sans">{model.name}</h3>
                  <span
                    class="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded {model.is_running
                      ? 'bg-success text-white'
                      : 'bg-surface-2 text-muted'}"
                  >
                    {model.is_running ? 'Running' : 'Stopped'}
                  </span>
                  <span
                    class="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded bg-canvas text-muted border border-border"
                  >
                    {model.type}
                  </span>
                </div>
                {#if model.models_available?.length > 0}
                  <div class="flex gap-2 mt-1 flex-wrap">
                    {#each model.models_available as m (m)}
                      <span
                        class="px-2 py-0.5 text-xs font-mono bg-canvas border border-border rounded text-body"
                        >{m}</span
                      >
                    {/each}
                  </div>
                {/if}
              </div>
              <div class="text-right flex-shrink-0">
                <div class="text-xs text-muted">Last active</div>
                <div class="text-sm font-mono text-body">
                  {timeAgo(model.last_active)}
                </div>
              </div>
            </div>

            <!-- Stats Grid -->
            <div class="grid grid-cols-2 xl:grid-cols-7 gap-px bg-border">
              <div class="bg-surface p-4 text-center">
                <div class="text-lg font-bold font-mono text-accent">
                  {formatNumber(model.total_events)}
                </div>
                <div class="text-[10px] text-muted uppercase tracking-wide mt-1">Events</div>
              </div>
              <div class="bg-surface p-4 text-center">
                <div class="text-lg font-bold font-mono text-body">
                  {formatNumber(model.inferences)}
                </div>
                <div class="text-[10px] text-muted uppercase tracking-wide mt-1">Inferences</div>
              </div>
              <div class="bg-surface p-4 text-center">
                <div class="text-lg font-bold font-mono text-body">
                  {formatNumber(model.tool_calls)}
                </div>
                <div class="text-[10px] text-muted uppercase tracking-wide mt-1">Tool Calls</div>
              </div>
              <div class="bg-surface p-4 text-center">
                <div class="text-lg font-bold font-mono text-body">
                  {formatNumber(model.responses)}
                </div>
                <div class="text-[10px] text-muted uppercase tracking-wide mt-1">Responses</div>
              </div>
              <div class="bg-surface p-4 text-center">
                <div class="text-lg font-bold font-mono text-body">
                  {formatDuration(model.avg_duration_ms)}
                </div>
                <div class="text-[10px] text-muted uppercase tracking-wide mt-1">Avg Duration</div>
              </div>
              <div class="bg-surface p-4 text-center">
                <div class="text-lg font-bold font-mono text-body">
                  {formatNumber(model.files_touched)}
                </div>
                <div class="text-[10px] text-muted uppercase tracking-wide mt-1">Files Touched</div>
              </div>
              <div class="bg-surface p-4 text-center">
                <div class="text-lg font-bold font-mono text-body">
                  {formatNumber(model.file_changes)}
                </div>
                <div class="text-[10px] text-muted uppercase tracking-wide mt-1">File Changes</div>
              </div>
            </div>

            <!-- Timeline -->
            {#if model.first_seen}
              <div class="px-5 py-3 bg-canvas text-xs text-muted font-mono flex justify-between">
                <span>First seen: {formatDateOnly(model.first_seen)}</span>
                <span>Active for: {timeAgo(model.first_seen).replace(' ago', '')}</span>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</PageLayout>
