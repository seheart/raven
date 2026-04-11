<script>
  import { onMount } from 'svelte';
  import { dataService } from '../dataService.js';
  import { logger } from '../logger.js';
  import { formatDateOnly } from '../timeFormat.js';

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

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-6xl mx-auto">
    <!-- Header -->
    <div class="flex justify-between items-start mb-6 flex-wrap gap-4">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">Models</h1>
        <p class="text-sm text-[var(--muted)] font-sans">AI models and tools tracked by Raven</p>
      </div>
      <button
        onclick={() => loadData(true)}
        disabled={loading}
        class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors disabled:opacity-50"
      >
        {loading ? '...' : '&#8635;'} Refresh
      </button>
    </div>

    {#if loading && models.length === 0}
      <div class="space-y-4">
        {#each Array(3) as _, i (i)}
          <div
            class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 animate-pulse"
          >
            <div class="h-5 bg-[var(--bg)] rounded w-48 mb-3"></div>
            <div class="grid grid-cols-4 gap-4">
              <div class="h-10 bg-[var(--bg)] rounded"></div>
              <div class="h-10 bg-[var(--bg)] rounded"></div>
              <div class="h-10 bg-[var(--bg)] rounded"></div>
              <div class="h-10 bg-[var(--bg)] rounded"></div>
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <!-- Summary Stats -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
          <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
            Models
          </div>
          <div class="text-sm font-mono text-[var(--text)]">{models.length}</div>
        </div>
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
          <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
            Running
          </div>
          <div class="text-sm font-mono text-[var(--success)]">{runningCount}</div>
        </div>
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
          <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
            Total Events
          </div>
          <div class="text-sm font-mono text-[var(--text)]">{formatNumber(totalEvents)}</div>
        </div>
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
          <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
            Inferences
          </div>
          <div class="text-sm font-mono text-[var(--text)]">{formatNumber(totalInferences)}</div>
        </div>
      </div>

      <!-- Model Cards -->
      {#if models.length === 0}
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center">
          <p class="text-sm text-[var(--muted)]">No models detected yet</p>
          <p class="text-xs text-[var(--muted)] mt-2">
            Models appear when they're detected running locally or when events are logged via the
            telemetry API
          </p>
        </div>
      {:else}
        <div class="space-y-4">
          {#each models as model (model.name)}
            <div
              class="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden"
            >
              <!-- Model Header -->
              <div class="flex items-center gap-4 px-5 py-4 border-b border-[var(--border)]">
                <span
                  class="w-4 h-4 rounded-full flex-shrink-0 {model.is_running
                    ? 'animate-pulse'
                    : ''}"
                  style="background: {model.color}"
                ></span>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-3">
                    <h3 class="text-lg font-bold text-[var(--text)] font-sans">{model.name}</h3>
                    <span
                      class="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded {model.is_running
                        ? 'bg-[var(--success)] text-white'
                        : 'bg-[var(--surface-2)] text-[var(--muted)]'}"
                    >
                      {model.is_running ? 'Running' : 'Stopped'}
                    </span>
                    <span
                      class="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded bg-[var(--bg)] text-[var(--muted)] border border-[var(--border)]"
                    >
                      {model.type}
                    </span>
                  </div>
                  {#if model.models_available?.length > 0}
                    <div class="flex gap-2 mt-1 flex-wrap">
                      {#each model.models_available as m (m)}
                        <span
                          class="px-2 py-0.5 text-xs font-mono bg-[var(--bg)] border border-[var(--border)] rounded text-[var(--text)]"
                          >{m}</span
                        >
                      {/each}
                    </div>
                  {/if}
                </div>
                <div class="text-right flex-shrink-0">
                  <div class="text-xs text-[var(--muted)]">Last active</div>
                  <div class="text-sm font-mono text-[var(--text)]">
                    {timeAgo(model.last_active)}
                  </div>
                </div>
              </div>

              <!-- Stats Grid -->
              <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-px bg-[var(--border)]">
                <div class="bg-[var(--surface)] p-4 text-center">
                  <div class="text-lg font-bold font-mono text-[var(--accent)]">
                    {formatNumber(model.total_events)}
                  </div>
                  <div class="text-[10px] text-[var(--muted)] uppercase tracking-wide mt-1">
                    Events
                  </div>
                </div>
                <div class="bg-[var(--surface)] p-4 text-center">
                  <div class="text-lg font-bold font-mono text-[var(--text)]">
                    {formatNumber(model.inferences)}
                  </div>
                  <div class="text-[10px] text-[var(--muted)] uppercase tracking-wide mt-1">
                    Inferences
                  </div>
                </div>
                <div class="bg-[var(--surface)] p-4 text-center">
                  <div class="text-lg font-bold font-mono text-[var(--text)]">
                    {formatNumber(model.tool_calls)}
                  </div>
                  <div class="text-[10px] text-[var(--muted)] uppercase tracking-wide mt-1">
                    Tool Calls
                  </div>
                </div>
                <div class="bg-[var(--surface)] p-4 text-center">
                  <div class="text-lg font-bold font-mono text-[var(--text)]">
                    {formatNumber(model.responses)}
                  </div>
                  <div class="text-[10px] text-[var(--muted)] uppercase tracking-wide mt-1">
                    Responses
                  </div>
                </div>
                <div class="bg-[var(--surface)] p-4 text-center">
                  <div class="text-lg font-bold font-mono text-[var(--text)]">
                    {formatDuration(model.avg_duration_ms)}
                  </div>
                  <div class="text-[10px] text-[var(--muted)] uppercase tracking-wide mt-1">
                    Avg Duration
                  </div>
                </div>
                <div class="bg-[var(--surface)] p-4 text-center">
                  <div class="text-lg font-bold font-mono text-[var(--text)]">
                    {formatNumber(model.files_touched)}
                  </div>
                  <div class="text-[10px] text-[var(--muted)] uppercase tracking-wide mt-1">
                    Files Touched
                  </div>
                </div>
                <div class="bg-[var(--surface)] p-4 text-center">
                  <div class="text-lg font-bold font-mono text-[var(--text)]">
                    {formatNumber(model.file_changes)}
                  </div>
                  <div class="text-[10px] text-[var(--muted)] uppercase tracking-wide mt-1">
                    File Changes
                  </div>
                </div>
              </div>

              <!-- Timeline -->
              {#if model.first_seen}
                <div
                  class="px-5 py-3 bg-[var(--bg)] text-xs text-[var(--muted)] font-mono flex justify-between"
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
  </div>
</div>
