<script>
  import { logger } from '../logger.js';
  import { createPageApi } from '../apiClient.js';
  import { PageLayout, PageHeader, PageSection, StatusBar } from '../components/layout/index.js';
  import { formatUsd } from '../utils/formatUsd.js';
  import {
    RefreshButton,
    TabButton,
    DataFetchError,
    EmptyState,
    LoadingState,
    FreshnessBadge
  } from '../components/ui/index.js';
  const { api, abort: abortRequests } = createPageApi();
  import { onMount, tick } from 'svelte';
  import { websocketService } from '../services/websocket.js';
  import { Chart, registerables } from 'chart.js';
  import {
    createThemeObserver,
    getChartColors,
    getChartPalette,
    chartFill
  } from '../utils/chartUtils.js';
  import { settings } from '../stores/settingsStore.js';
  import { get } from 'svelte/store';

  Chart.register(...registerables);

  // Billing mode
  let billingMode = $state(get(settings)?.billing?.mode || 'subscription');
  let planName = $state(get(settings)?.billing?.planName || 'Claude Max');
  let planTier = $state(get(settings)?.billing?.planTier || 'max_5x');
  let planBudgetUsd = $state(get(settings)?.billing?.planBudgetUsd ?? null);
  let weeklyBudgetUsd = $state(get(settings)?.billing?.weeklyBudgetUsd ?? null);
  const isApi = $derived(billingMode === 'api');

  // Sync with settings store
  const unsubSettings = settings.subscribe(s => {
    billingMode = s?.billing?.mode || 'subscription';
    planName = s?.billing?.planName || 'Claude Max';
    planTier = s?.billing?.planTier || 'max_5x';
    planBudgetUsd = s?.billing?.planBudgetUsd ?? null;
    weeklyBudgetUsd = s?.billing?.weeklyBudgetUsd ?? null;
  });

  // State
  let summary = $state({
    total_requests: 0,
    total_input_tokens: 0,
    total_output_tokens: 0,
    total_cache_creation_tokens: 0,
    total_cache_read_tokens: 0,
    total_cost_usd: 0
  });
  let byProject = $state([]);
  let byModel = $state([]);
  let bySessions = $state([]);
  let timeline = $state([]);
  let loading = $state(true);
  let lastUpdated = $state(null);
  let timeRange = $state('today');

  // Charts
  let costChartCanvas = $state(null);
  let modelChartCanvas = $state(null);
  let costChart = null;
  let modelChart = null;
  let themeObserver = null;

  function getTimeRangeParams() {
    const now = new Date();
    let start;
    if (timeRange === 'today') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    } else if (timeRange === '7d') {
      start = new Date(now.getTime() - 7 * 86400000).toISOString();
    } else if (timeRange === '30d') {
      start = new Date(now.getTime() - 30 * 86400000).toISOString();
    } else {
      return '';
    }
    return `start=${encodeURIComponent(start)}`;
  }

  /** @type {string|null} */
  let loadError = $state(null);

  // Plan-limit burn-down (subscription plans only). Estimated budgets —
  // the backend labels the payload accordingly and Settings can override.
  let limits = $state(null);

  async function loadLimits() {
    if (isApi) {
      limits = null;
      return;
    }
    try {
      let q = `plan=${encodeURIComponent(planTier)}`;
      if (planBudgetUsd > 0) q += `&budget=${planBudgetUsd}`;
      if (weeklyBudgetUsd > 0) q += `&weekly_budget=${weeklyBudgetUsd}`;
      limits = await api.get(`/costs/limits?${q}`);
    } catch (err) {
      logger.error('Failed to load plan limits:', err);
      limits = null;
    }
  }

  function formatClock(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  async function loadData() {
    try {
      loading = true;
      loadError = null;
      const params = getTimeRangeParams();
      const bucket = timeRange === 'today' ? 'hour' : 'day';

      // Use the canonical summary endpoint as the "did anything load at
      // all?" probe — if the backend's offline, this is the one that'll
      // throw and we want a visible banner instead of blank tiles. The
      // sub-rollups (by-project, by-model, ...) tolerate empty arrays
      // independently so a partial outage still renders what works.
      const summaryData = await api.get(`/costs/summary?${params}`);
      // Guard against a null/empty summary so downstream reads
      // (summary.total_requests, etc.) never throw on a partial response.
      summary = summaryData || {};

      const [projectData, modelData, sessionData, timelineData] = await Promise.all([
        api.get(`/costs/by-project?${params}`).catch(() => []),
        api.get(`/costs/by-model?${params}`).catch(() => []),
        api.get(`/costs/by-session?${params}&limit=20`).catch(() => []),
        api.get(`/costs/timeline?${params}&bucket=${bucket}`).catch(() => [])
      ]);

      byProject = Array.isArray(projectData) ? projectData : [];
      byModel = Array.isArray(modelData) ? modelData : [];
      bySessions = Array.isArray(sessionData) ? sessionData : [];
      timeline = Array.isArray(timelineData) ? timelineData : [];

      lastUpdated = new Date();
      loadLimits();
    } catch (err) {
      // Surface the failure inline. Previously this was logger.error-only
      // and the page rendered blank summary tiles ("Requests" with no
      // value because summary.total_requests?.toLocaleString() was
      // undefined) with no signal to the user.
      logger.error('Failed to load cost data:', err);
      loadError = err?.message || String(err);
    } finally {
      loading = false;
      await tick();
      updateCharts();
    }
  }

  function updateCharts() {
    const colors = getChartColors();

    // Cost timeline chart
    if (costChartCanvas && timeline.length > 0) {
      if (costChart) costChart.destroy();
      costChart = new Chart(costChartCanvas, {
        type: 'bar',
        data: {
          labels: timeline.map(t => {
            if (timeRange === 'today') {
              const hour = t.bucket?.split('T')[1];
              return hour ? `${hour}:00` : t.bucket;
            }
            return t.bucket?.split('T')[0] || t.bucket;
          }),
          datasets: [
            {
              label: isApi ? 'Cost ($)' : 'Tokens',
              data: timeline.map(t => (isApi ? t.cost_usd : t.input_tokens + t.output_tokens)),
              // Brand gradient fill — warm rust top fading to transparent
              // bottom. Anchored to chartArea so it paints cleanly.
              backgroundColor: chartFill,
              borderColor: colors.primary,
              borderWidth: 0,
              borderRadius: 3,
              hoverBackgroundColor: chartFill
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: ctx =>
                  isApi ? formatCost(ctx.parsed.y) : `${formatTokens(ctx.parsed.y)} tokens`
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: v => (isApi ? formatCost(Number(v)) : formatTokens(Number(v))),
                color: colors.muted
              },
              grid: { color: colors.border }
            },
            x: {
              ticks: { color: colors.muted },
              grid: { display: false }
            }
          }
        }
      });
    }

    // Model breakdown donut. Uses the canonical warm palette so it matches
    // the rest of the app — no more rainbow vendor-brand swatches.
    if (modelChartCanvas && byModel.length > 0) {
      if (modelChart) modelChart.destroy();
      const palette = getChartPalette(byModel.length);
      modelChart = new Chart(modelChartCanvas, {
        type: 'doughnut',
        data: {
          labels: byModel.map(m => m.model_family || m.model),
          datasets: [
            {
              data: byModel.map(m => (isApi ? m.cost_usd : m.input_tokens + m.output_tokens)),
              backgroundColor: palette,
              borderColor: colors.bg,
              borderWidth: 2,
              hoverOffset: 6
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: colors.text, font: { size: 11 } }
            },
            tooltip: {
              callbacks: {
                label: ctx =>
                  isApi
                    ? `${ctx.label || 'Unknown'}: ${formatCost(ctx.parsed || 0)}`
                    : `${ctx.label || 'Unknown'}: ${formatTokens(ctx.parsed || 0)} tokens`
              }
            }
          }
        }
      });
    }
  }

  // formatCost: small values keep extra precision (so per-request micro-
  // costs are legible); $1+ uses the canonical comma formatter so $2206
  // doesn't read like a phone number.
  function formatCost(usd) {
    if (usd === 0) return '$0.00';
    if (usd < 0.01) return `$${usd.toFixed(4)}`;
    if (usd < 1) return `$${usd.toFixed(3)}`;
    return formatUsd(usd);
  }

  function formatTokens(n) {
    if (!n) return '0';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
  }

  function setTimeRange(range) {
    timeRange = range;
    loadData();
  }

  onMount(() => {
    websocketService.connect();
    loadData();

    // Debounce so an inference burst doesn't trigger N full-page reloads.
    let tokenUsageTimer = null;
    const onTokenUsage = () => {
      if (tokenUsageTimer) clearTimeout(tokenUsageTimer);
      tokenUsageTimer = setTimeout(() => {
        tokenUsageTimer = null;
        loadData();
      }, 1500);
    };
    websocketService.on('token-usage', onTokenUsage);

    themeObserver = createThemeObserver(() => updateCharts());

    return () => {
      abortRequests();
      unsubSettings();
      websocketService.off('token-usage', onTokenUsage);
      if (costChart) costChart.destroy();
      if (modelChart) modelChart.destroy();
      if (themeObserver) themeObserver.disconnect();
    };
  });
</script>

<PageLayout>
  <StatusBar prompt="RAVEN.INSIGHTS" label="Costs" />
  <PageHeader title="Costs">
    {#snippet actions()}
      <div class="flex items-center gap-3">
        <div class="flex bg-surface border border-border rounded overflow-hidden">
          {#each [['today', 'Today'], ['7d', '7 Days'], ['30d', '30 Days'], ['all', 'All']] as [value, label] (value)}
            <TabButton active={timeRange === value} onClick={() => setTimeRange(value)}
              >{label}</TabButton
            >
          {/each}
        </div>
        <FreshnessBadge mode="polled" since={lastUpdated} />
        <RefreshButton onClick={loadData} {loading} />
      </div>
    {/snippet}
  </PageHeader>
  <div class="flex items-center gap-2 -mt-4 flex-wrap">
    <span
      class="px-2 py-0.5 rounded text-[10px] font-semibold {isApi
        ? 'bg-warning/15 text-warning border border-warning/30'
        : 'bg-accent text-canvas'}">{isApi ? 'API Billing' : planName}</span
    >
    <p class="text-sm text-muted font-sans">
      {isApi
        ? 'Estimated API costs and token consumption.'
        : `Token consumption across sessions. You're on ${planName}, so the dollar figure below is what this usage WOULD cost at API rates — not money out of your wallet.`}
    </p>
  </div>

  {#if loadError}
    <DataFetchError
      endpoint="/api/costs/summary"
      message="Couldn't load cost data"
      hint={loadError}
      onRetry={loadData}
    />
  {/if}

  {#if loading && !summary.total_requests}
    <LoadingState message="Loading cost data…" />
  {:else}
    <!-- Summary Cards. Subscription users see the API-equivalent dollar
         figure as the headline (curiosity-relevant: "what would this
         cost on API?"), but it's labeled and subtitled so the user
         can't mistake it for actual spend. -->
    <div class="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
      {#if isApi}
        <div class="bg-surface border border-border rounded p-4">
          <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
            Est. Spend
          </div>
          <div class="text-2xl font-bold text-accent font-mono">
            {formatCost(summary.total_cost_usd)}
          </div>
        </div>
      {:else}
        <div
          class="bg-surface border border-border rounded p-4"
          title="What this usage would cost on per-token API billing. You're on {planName} so this is reference, not a bill."
        >
          <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
            API equivalent
          </div>
          <div class="text-2xl font-bold text-accent font-mono">
            {formatCost(summary.total_cost_usd)}
          </div>
          <div class="text-[10px] text-muted mt-1 italic">if billed per token</div>
        </div>
      {/if}
      <div class="bg-surface border border-border rounded p-4">
        <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Requests</div>
        <div class="text-2xl font-bold text-body font-mono">
          {summary.total_requests?.toLocaleString()}
        </div>
      </div>
      <div class="bg-surface border border-border rounded p-4">
        <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
          Input Tokens
        </div>
        <div class="text-2xl font-bold text-body font-mono">
          {formatTokens(summary.total_input_tokens)}
        </div>
        <div class="text-xs text-muted mt-1">
          + {formatTokens(summary.total_cache_read_tokens)} cached
        </div>
      </div>
      <div class="bg-surface border border-border rounded p-4">
        <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
          Output Tokens
        </div>
        <div class="text-2xl font-bold text-body font-mono">
          {formatTokens(summary.total_output_tokens)}
        </div>
      </div>
    </div>

    <!-- Plan-limit burn-down. Subscription plans meter in rolling 5h windows;
         budgets are community estimates (backend flags `estimated: true`),
         overridable in Settings once the user observes their real cap. -->
    {#if !isApi && limits?.window}
      {@const w = limits.window}
      {@const barPct = Math.min(100, w.pct_used)}
      {@const barColor =
        w.pct_used >= 90 ? 'bg-error/60' : w.on_pace_to_hit_cap ? 'bg-warning/60' : 'bg-accent/50'}
      <div class="bg-surface border border-border rounded p-4 mb-6">
        <div class="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div class="text-xs font-semibold text-muted uppercase tracking-wide">
            5-Hour Window · {planTier === 'pro'
              ? 'Pro'
              : planTier === 'max_20x'
                ? 'Max 20x'
                : 'Max 5x'}
          </div>
          <div
            class="text-[10px] text-muted italic"
            title="Budget is a community estimate in API-equivalent dollars. Set your observed cap in Settings → Billing."
          >
            estimated budget · adjustable in Settings
          </div>
        </div>
        {#if w.start}
          <div class="flex items-baseline gap-3 mb-2 font-mono">
            <span class="text-2xl font-bold text-body">{w.pct_used.toFixed(0)}%</span>
            <span class="text-sm text-muted">
              ${w.usage_usd.toFixed(2)} of ~${w.budget_usd} equivalent
            </span>
          </div>
          <div class="h-2 bg-canvas border border-border rounded overflow-hidden mb-3">
            <div class="h-full {barColor}" style="width: {barPct}%"></div>
          </div>
          <div class="flex flex-wrap gap-x-6 gap-y-1 text-xs font-mono text-muted">
            <span>burn ${w.burn_rate_usd_per_hour.toFixed(2)}/h</span>
            <span>window resets {formatClock(w.resets_at)}</span>
            {#if w.on_pace_to_hit_cap}
              <span class="text-warning font-semibold">
                on pace to hit the cap ~{formatClock(w.projected_exhaustion)}
              </span>
            {:else if w.projected_exhaustion}
              <span>would exhaust ~{formatClock(w.projected_exhaustion)} at this rate</span>
            {/if}
            <span
              >rolling 7d ${limits.weekly.usage_usd.toFixed(2)}{limits.weekly.pct_used !== null
                ? ` (${limits.weekly.pct_used.toFixed(0)}% of weekly)`
                : ''}</span
            >
          </div>
        {:else}
          <div class="text-sm text-muted font-mono">
            No usage in the last 5 hours — window closed. Rolling 7d: ${limits.weekly.usage_usd.toFixed(
              2
            )}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Prompt cache panel: hit ratio + estimated savings vs uncached input.
           Anthropic charges cache reads at 0.1× input rate, so 1 cached token
           saves 90% of the input cost. Cache writes cost 1.25× input — netted in. -->
    {#if isApi && (summary.total_cache_read_tokens || summary.total_cache_creation_tokens)}
      {@const cIn = summary.total_input_tokens || 0}
      {@const cCreate = summary.total_cache_creation_tokens || 0}
      {@const cRead = summary.total_cache_read_tokens || 0}
      {@const totalEffectiveInput = cIn + cCreate + cRead}
      {@const hitRatio = totalEffectiveInput > 0 ? (cRead / totalEffectiveInput) * 100 : 0}
      {@const ratioColor =
        hitRatio >= 60 ? 'text-success' : hitRatio >= 30 ? 'text-warning' : 'text-muted'}
      {@const savedTokenEquivalent = cRead * 0.9}
      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 mb-6">
        <div class="bg-surface border border-border rounded p-4">
          <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
            Cache Hit Ratio
          </div>
          <div class="text-2xl font-bold {ratioColor} font-mono">{hitRatio.toFixed(1)}%</div>
          <div class="text-xs text-muted mt-1">
            {formatTokens(cRead)} of {formatTokens(totalEffectiveInput)} input tokens served from cache
          </div>
        </div>
        <div class="bg-surface border border-border rounded p-4">
          <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
            Cache Writes
          </div>
          <div class="text-2xl font-bold text-warning font-mono">{formatTokens(cCreate)}</div>
          <div class="text-xs text-muted mt-1">First-time prompt caching (1.25× input rate)</div>
        </div>
        <div class="bg-surface border border-border rounded p-4">
          <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
            Equivalent Tokens Saved
          </div>
          <div class="text-2xl font-bold text-success font-mono">
            {formatTokens(savedTokenEquivalent)}
          </div>
          <div class="text-xs text-muted mt-1">
            vs. {formatTokens(cRead)} reads at full input rate
          </div>
        </div>
      </div>
    {/if}

    <!-- Charts Row -->
    <div class="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6">
      <div class="xl:col-span-2 bg-surface border border-border rounded p-4">
        <h3 class="text-sm font-semibold text-heading mb-3">
          {isApi ? 'Cost Over Time' : 'Tokens Over Time'}
        </h3>
        <div class="h-48 min-h-[200px]">
          {#if timeline.length > 0}
            <canvas bind:this={costChartCanvas}></canvas>
          {:else}
            <div
              class="flex items-center justify-center h-full text-sm text-muted text-center px-4"
            >
              No usage in this window yet — the chart fills in as requests come through.
            </div>
          {/if}
        </div>
      </div>
      <div class="bg-surface border border-border rounded p-4">
        <h3 class="text-sm font-semibold text-heading mb-3">By Model</h3>
        <div class="h-48 min-h-[200px]">
          {#if byModel.length > 0}
            <canvas bind:this={modelChartCanvas}></canvas>
          {:else}
            <div class="flex items-center justify-center h-full text-sm text-muted">
              No model data
            </div>
          {/if}
        </div>
      </div>
    </div>

    <!-- Model Breakdown -->
    {#if byModel.length > 0}
      <div class="mb-6">
        <PageSection title="01 // Usage by Model">
          <div class="border-t border-b border-border font-mono text-sm overflow-x-auto">
            <table class="w-full">
              <thead class="bg-canvas">
                <tr class="text-[11px] text-muted uppercase tracking-wide">
                  <th class="text-left font-semibold px-3 py-1">Model</th>
                  <th class="text-right font-semibold px-3 py-1">Requests</th>
                  <th class="text-right font-semibold px-3 py-1">Input</th>
                  <th class="text-right font-semibold px-3 py-1">Output</th>
                  {#if isApi}<th class="text-right font-semibold px-3 py-1">Est. Cost</th>{/if}
                </tr>
              </thead>
              <tbody>
                {#each byModel as model (model.model)}
                  <tr class="hover:bg-surface/40">
                    <td class="px-3 py-0.5 text-body">{model.model_family || model.model}</td>
                    <td class="px-3 py-0.5 text-right text-muted">{model.requests}</td>
                    <td class="px-3 py-0.5 text-right text-muted"
                      >{formatTokens(model.input_tokens)}</td
                    >
                    <td class="px-3 py-0.5 text-right text-accent font-semibold"
                      >{formatTokens(model.output_tokens)}</td
                    >
                    {#if isApi}<td class="px-3 py-0.5 text-right text-accent font-semibold"
                        >{formatCost(model.cost_usd)}</td
                      >{/if}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </PageSection>
      </div>
    {/if}

    <!-- Project Breakdown -->
    {#if byProject.length > 0}
      <div class="mb-6">
        <PageSection title="02 // Usage by Project">
          <div class="border-t border-b border-border font-mono text-sm overflow-x-auto">
            <table class="w-full">
              <thead class="bg-canvas">
                <tr class="text-[11px] text-muted uppercase tracking-wide">
                  <th class="text-left font-semibold px-3 py-1">Project</th>
                  <th class="text-right font-semibold px-3 py-1">Requests</th>
                  <th class="text-right font-semibold px-3 py-1">Input</th>
                  <th class="text-right font-semibold px-3 py-1">Output</th>
                  {#if isApi}<th class="text-right font-semibold px-3 py-1">Est. Cost</th>{/if}
                </tr>
              </thead>
              <tbody>
                {#each byProject as project (project.project_name)}
                  <tr class="hover:bg-surface/40">
                    <td class="px-3 py-0.5 text-body">{project.project_name || '(unknown)'}</td>
                    <td class="px-3 py-0.5 text-right text-muted">{project.requests}</td>
                    <td class="px-3 py-0.5 text-right text-muted"
                      >{formatTokens(project.input_tokens)}</td
                    >
                    <td class="px-3 py-0.5 text-right text-accent font-semibold"
                      >{formatTokens(project.output_tokens)}</td
                    >
                    {#if isApi}<td class="px-3 py-0.5 text-right text-accent font-semibold"
                        >{formatCost(project.cost_usd)}</td
                      >{/if}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </PageSection>
      </div>
    {/if}

    <!-- Recent Sessions -->
    {#if bySessions.length > 0}
      <div class="mb-6">
        <PageSection title="03 // Recent Sessions">
          <div class="border-t border-b border-border font-mono text-sm overflow-x-auto">
            <table class="w-full">
              <thead class="bg-canvas">
                <tr class="text-[11px] text-muted uppercase tracking-wide">
                  <th class="text-left font-semibold px-3 py-1">Session</th>
                  <th class="text-right font-semibold px-3 py-1">Requests</th>
                  <th class="text-right font-semibold px-3 py-1">Tokens</th>
                  {#if isApi}<th class="text-right font-semibold px-3 py-1">Est. Cost</th>{/if}
                </tr>
              </thead>
              <tbody>
                {#each bySessions as session (session.session_id)}
                  <tr class="hover:bg-surface/40">
                    <td class="px-3 py-0.5 text-body"
                      >{session.project_name || session.session_id?.slice(0, 8)}</td
                    >
                    <td class="px-3 py-0.5 text-right text-muted">{session.requests}</td>
                    <td class="px-3 py-0.5 text-right text-muted"
                      >{formatTokens(session.input_tokens + session.output_tokens)}</td
                    >
                    {#if isApi}<td class="px-3 py-0.5 text-right text-accent font-semibold"
                        >{formatCost(session.cost_usd)}</td
                      >{/if}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </PageSection>
      </div>
    {/if}

    {#if !loading && summary.total_requests === 0}
      <EmptyState
        title="No token usage in this window"
        description={timeRange === 'today'
          ? "Nothing's been billed today yet. Start a Claude Code session — every API call its model makes shows up here within a minute. Older sessions are imported from Claude's logs on startup."
          : timeRange === 'all'
            ? "Raven hasn't seen any API requests yet. Run a Claude Code session in a tracked project — usage is parsed from its session logs automatically."
            : "No requests in the selected window. Try a longer range or 'All' to see imported historical data."}
      />
    {/if}
  {/if}
</PageLayout>
