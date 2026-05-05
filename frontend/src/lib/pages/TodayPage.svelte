<script>
  /**
   * TodayPage — the new homepage. Sentence-shaped daily digest of what
   * AI did across the fleet, oriented for the digital-services-builder
   * seat (PM/designer/contracts using AI to build, not the engineer
   * debugging it).
   *
   * Reads /api/digest/today and renders narrative, not metrics. The
   * old kitchen-sink Overview still exists at /overview/full for power
   * users who want every widget.
   */

  import { onMount } from 'svelte';
  import { createPageApi } from '../apiClient.js';
  import { navigate } from '../utils/router.svelte.js';
  import { PageLayout, PageHeader } from '../components/layout/index.js';
  import { settings } from '../stores/settingsStore.js';
  import { get } from 'svelte/store';

  const { api, abort } = createPageApi();

  let digest = $state(null);
  let loading = $state(true);
  let error = $state(null);
  let billingMode = $state(get(settings)?.billing?.mode || 'subscription');
  const unsubBilling = settings.subscribe(s => {
    billingMode = s?.billing?.mode || 'subscription';
  });

  async function load() {
    try {
      loading = true;
      digest = await api.get('/digest/today');
      error = null;
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  function fmtMoney(usd) {
    if (usd >= 100) return `$${usd.toFixed(0)}`;
    if (usd >= 10) return `$${usd.toFixed(1)}`;
    return `$${usd.toFixed(2)}`;
  }

  function fmtRelative(iso) {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    return `${Math.floor(hr / 24)}d ago`;
  }

  function fmtDateLong(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });
  }

  /**
   * Compose the headline sentence from the structured digest.
   * No template strings spread across the JSX — keep the narrative
   * logic in one place so the wording stays consistent if it changes.
   */
  function headlineSentence(d) {
    if (!d) return '';
    if (d.empty) return 'Quiet so far. Nebula lights up when AI starts working.';

    const n = d.totals.projects_touched;
    const projectsWord = n === 1 ? 'project' : 'projects';

    if (d.projects.length === 0) {
      return `Your AI logged ${d.totals.agent_events} activities today.`;
    }

    const top = d.projects[0];
    const topName = top.displayName || top.name;
    const topChanges = top.total_events;
    const topAgent = top.agents[0] || 'AI';

    if (n === 1) {
      return `Your AI focused on ${topName} today — ${topChanges} ${topChanges === 1 ? 'change' : 'changes'} via ${topAgent}.`;
    }

    return `Your AI worked across ${n} ${projectsWord} today. Most active: ${topName} (${topChanges} ${topChanges === 1 ? 'change' : 'changes'} via ${topAgent}).`;
  }

  function spendSentence(d) {
    if (!d || d.totals.cost_usd === 0) return '';
    const amount = fmtMoney(d.totals.cost_usd);
    if (billingMode === 'subscription') {
      return `Estimated API value today: ${amount} (you're on a subscription, so this is what it would have cost on the API).`;
    }
    return `Today's API spend: ${amount}.`;
  }

  onMount(() => {
    load();
    // Refresh every 60s — digest data shifts as agents work, but doesn't
    // need to be live the way the nebula does.
    const t = setInterval(load, 60_000);
    return () => {
      clearInterval(t);
      unsubBilling();
      abort();
    };
  });
</script>

<PageLayout>
  <PageHeader
    title={fmtDateLong(digest?.date) || 'Today'}
    description="A plain-language read on what your AI did across the fleet."
  >
    {#snippet actions()}
      <button
        type="button"
        onclick={() => navigate('/overview')}
        class="px-3 py-1.5 text-xs font-mono text-muted hover:text-body bg-transparent border border-border rounded hover:border-accent transition-colors cursor-pointer"
        title="Open the engineering view (every metric, every widget)"
      >
        Engineering view →
      </button>
    {/snippet}
  </PageHeader>

  {#if loading && !digest}
    <div class="space-y-4">
      <div class="h-6 bg-surface border border-border rounded animate-pulse"></div>
      <div class="h-20 bg-surface border border-border rounded animate-pulse"></div>
    </div>
  {:else if error}
    <div class="text-sm text-error border border-error rounded px-4 py-3">
      Failed to load digest: {error}
    </div>
  {:else if digest}
    <!-- Headline narrative -->
    <div class="bg-surface border border-border rounded-lg p-6 space-y-2 mb-6">
      <p class="text-base text-body leading-relaxed">{headlineSentence(digest)}</p>
      {#if spendSentence(digest)}
        <p class="text-sm text-muted leading-relaxed">{spendSentence(digest)}</p>
      {/if}
    </div>

    <!-- Worth-a-glance flags -->
    {#if digest.flagged.length > 0}
      <div class="mb-6">
        <h3 class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
          Worth a glance
        </h3>
        <div class="bg-surface border border-border rounded-lg divide-y divide-[var(--border)]">
          {#each digest.flagged as flag (flag.timestamp + flag.kind)}
            <div class="px-4 py-3 flex items-start gap-3">
              <span
                class="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0"
                style="background: {flag.severity === 'warning' ? 'var(--warning)' : 'var(--accent)'}"
              ></span>
              <div class="flex-1 min-w-0">
                <div class="text-sm text-body">
                  <span class="font-semibold">{flag.display_name}</span>
                  <span class="text-muted"> · {fmtRelative(flag.timestamp)}</span>
                </div>
                <div class="text-xs text-muted">{flag.details}</div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Per-project rows -->
    {#if digest.projects.length > 0}
      <div>
        <h3 class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
          Today by project
        </h3>
        <div class="bg-surface border border-border rounded-lg divide-y divide-[var(--border)]">
          {#each digest.projects as project (project.name)}
            <div class="px-4 py-3 flex items-start gap-4">
              <div class="flex-1 min-w-0">
                <div class="text-sm font-semibold text-body flex items-baseline gap-2">
                  <span>{project.displayName || project.name}</span>
                  {#if project.displayName && project.displayName !== project.name}
                    <span class="text-[10px] font-mono text-muted">{project.name}</span>
                  {/if}
                </div>
                {#if project.mission}
                  <div class="text-xs italic text-body opacity-75 truncate">
                    {project.mission}
                  </div>
                {/if}
                <div class="text-xs text-muted mt-1 font-mono">
                  {project.total_events} {project.total_events === 1 ? 'change' : 'changes'}
                  {#if project.adds > 0}<span class="text-success"> · +{project.adds}</span>{/if}
                  {#if project.deletes > 0}<span class="text-error"> · −{project.deletes}</span>{/if}
                  {#if project.agents.length > 0} · {project.agents.join(', ')}{/if}
                  {#if project.last_activity} · last {fmtRelative(project.last_activity)}{/if}
                </div>
              </div>
              {#if project.cost_usd > 0}
                <div class="text-xs font-mono text-muted flex-shrink-0 self-center">
                  {fmtMoney(project.cost_usd)}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</PageLayout>
