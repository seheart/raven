<script>
  import { onMount } from 'svelte';
  import { dataService } from '../dataService.js';
  import { logger } from '../logger.js';
  import { formatDateOnly } from '../timeFormat.js';
  import { PageLayout, PageHeader } from '../components/layout/index.js';
  import { RefreshButton } from '../components/ui/index.js';

  let models = $state([]);
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

  async function loadData(force = false) {
    try {
      loading = true;
      const data = await dataService.fetch('/models', { ttl: 5000, forceRefresh: force });
      models = Array.isArray(data) ? data : [];
    } catch (err) {
      logger.error('Failed to load models:', err);
    } finally {
      loading = false;
    }
  }

  onMount(() => loadData());
</script>

<PageLayout>
  <PageHeader title="Models" description="AI models and tools tracked by Raven">
    {#snippet actions()}
      <RefreshButton onClick={() => loadData(true)} loading={loading} />
    {/snippet}
  </PageHeader>

    {#if loading && models.length === 0}
      <div class="space-y-4">
        {#each Array(3) as _, i (i)}
          <div
            class="bg-surface border border-border rounded-lg p-5 animate-pulse"
          >
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
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-surface border border-border rounded p-4">
          <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
            Models
          </div>
          <div class="text-sm font-mono text-body">{models.length}</div>
        </div>
        <div class="bg-surface border border-border rounded p-4">
          <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
            Running
          </div>
          <div class="text-sm font-mono text-success">{runningCount}</div>
        </div>
        <div class="bg-surface border border-border rounded p-4">
          <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
            Total Events
          </div>
          <div class="text-sm font-mono text-body">{formatNumber(totalEvents)}</div>
        </div>
        <div class="bg-surface border border-border rounded p-4">
          <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
            Inferences
          </div>
          <div class="text-sm font-mono text-body">{formatNumber(totalInferences)}</div>
        </div>
      </div>

      <!-- Model Cards -->
      {#if models.length === 0}
        <div class="bg-surface border border-border rounded-lg p-12 text-center">
          <p class="text-sm text-muted">No models detected yet</p>
          <p class="text-xs text-muted mt-2">
            Models appear when they're detected running locally or when events are logged via the
            telemetry API
          </p>
        </div>
      {:else}
        <div class="space-y-4">
          {#each models as model (model.name)}
            <div
              class="bg-surface border border-border rounded-lg overflow-hidden"
            >
              <!-- Model Header -->
              <div class="flex items-center gap-4 px-5 py-4 border-b border-border">
                <span
                  class="w-4 h-4 rounded-full flex-shrink-0 {model.is_running
                    ? 'animate-pulse'
                    : ''}"
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
              <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-px bg-border">
                <div class="bg-surface p-4 text-center">
                  <div class="text-lg font-bold font-mono text-accent">
                    {formatNumber(model.total_events)}
                  </div>
                  <div class="text-[10px] text-muted uppercase tracking-wide mt-1">
                    Events
                  </div>
                </div>
                <div class="bg-surface p-4 text-center">
                  <div class="text-lg font-bold font-mono text-body">
                    {formatNumber(model.inferences)}
                  </div>
                  <div class="text-[10px] text-muted uppercase tracking-wide mt-1">
                    Inferences
                  </div>
                </div>
                <div class="bg-surface p-4 text-center">
                  <div class="text-lg font-bold font-mono text-body">
                    {formatNumber(model.tool_calls)}
                  </div>
                  <div class="text-[10px] text-muted uppercase tracking-wide mt-1">
                    Tool Calls
                  </div>
                </div>
                <div class="bg-surface p-4 text-center">
                  <div class="text-lg font-bold font-mono text-body">
                    {formatNumber(model.responses)}
                  </div>
                  <div class="text-[10px] text-muted uppercase tracking-wide mt-1">
                    Responses
                  </div>
                </div>
                <div class="bg-surface p-4 text-center">
                  <div class="text-lg font-bold font-mono text-body">
                    {formatDuration(model.avg_duration_ms)}
                  </div>
                  <div class="text-[10px] text-muted uppercase tracking-wide mt-1">
                    Avg Duration
                  </div>
                </div>
                <div class="bg-surface p-4 text-center">
                  <div class="text-lg font-bold font-mono text-body">
                    {formatNumber(model.files_touched)}
                  </div>
                  <div class="text-[10px] text-muted uppercase tracking-wide mt-1">
                    Files Touched
                  </div>
                </div>
                <div class="bg-surface p-4 text-center">
                  <div class="text-lg font-bold font-mono text-body">
                    {formatNumber(model.file_changes)}
                  </div>
                  <div class="text-[10px] text-muted uppercase tracking-wide mt-1">
                    File Changes
                  </div>
                </div>
              </div>

              <!-- Timeline -->
              {#if model.first_seen}
                <div
                  class="px-5 py-3 bg-canvas text-xs text-muted font-mono flex justify-between"
                >
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
