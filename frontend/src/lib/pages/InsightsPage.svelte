<script>
  /**
   * Insights — story-mode page for users who are learning AI.
   *
   * Reframed from a power-user control panel ("Local LLM-powered analysis"
   * with model/window dropdowns and four cryptic action buttons) to a
   * library of stories Raven can write about your activity. Each story
   * type gets a card explaining who it's for, how long it takes, and
   * what you'll get; technical knobs (model selector, window length)
   * sit behind a small "Advanced" disclosure so they're available without
   * intimidating first-timers.
   */

  import { onMount, onDestroy } from 'svelte';
  import { createPageApi } from '../apiClient.js';
  import { formatTimeOnly as formatTime, formatShortDateTime } from '../timeFormat.js';
  import { renderMarkdown } from '../utils/markdown.js';
  import { PageLayout, PageHeader } from '../components/layout/index.js';
  import JourneyPanel from '../components/insights/JourneyPanel.svelte';
  import { EmptyState, DataFetchError } from '../components/ui/index.js';
  const { api, abort: abortRequests } = createPageApi();

  let insights = $state([]);
  let status = $state({ available: false, generating: false, models: [] });
  let loading = $state(false);
  let generating = $state(null); // null | 'summary' | 'review' | 'digest' | 'agent-comparison'
  let selectedModel = $state('');
  let windowMinutes = $state(60);
  let filterType = $state('all');
  let advancedOpen = $state(false);
  let loadError = $state(null);

  const filteredInsights = $derived(
    filterType === 'all' ? insights : insights.filter(i => i.type === filterType)
  );

  // Story cards. Each one is a kind of report Raven can write.
  // `kind` matches the backend's insight type so the card knows which
  // generator to call AND which existing-insight type to filter for.
  const stories = [
    {
      kind: 'session_summary',
      label: 'Recent activity',
      blurb:
        'A quick recap of what just happened on your machine — file changes, AI tool turns, what got worked on.',
      bestFor: 'Catching up after a break.',
      time: '~30s–1 min',
      generate: 'summary'
    },
    {
      kind: 'code_review',
      label: 'Code review',
      blurb:
        'Raven looks at the changes your AI helpers shipped recently and tells you, in plain language, what changed and whether it looks right.',
      bestFor: "Trusting what an agent did while you weren't watching.",
      time: '~1 min',
      generate: 'review'
    },
    {
      kind: 'daily_digest',
      label: "Today's digest",
      blurb:
        'Everything you and your AI tools did today, summed up in a few paragraphs. The TL;DR of your workday.',
      bestFor: 'End-of-day reflection or a status update.',
      time: '~1–2 min',
      generate: 'digest'
    },
    {
      kind: 'agent_comparison',
      label: 'AI tools side by side',
      blurb:
        'Compare how Claude, Cursor, Codex, and other AI tools have been working for you — who shipped what, who took longest, where each shines.',
      bestFor: 'Figuring out which tool to reach for next time.',
      time: '~1–2 min',
      generate: 'agent-comparison'
    }
  ];

  async function loadInsights() {
    loading = true;
    loadError = null;
    try {
      const [insightsData, statusData] = await Promise.all([
        api.get('/insights?limit=50'),
        api.get('/insights/status')
      ]);
      insights = insightsData || [];
      status = statusData || { available: false, generating: false, models: [] };
      if (!selectedModel && status.models.length > 0) {
        selectedModel = status.models[0];
      }
    } catch (err) {
      loadError = err?.message || String(err);
    }
    loading = false;
  }

  async function generateStory(kind) {
    if (!status.available) return;
    generating = kind;
    try {
      if (selectedModel) await api.put('/insights/model', { model: selectedModel }).catch(() => {});
      const url = `/insights/generate/${kind}`;
      const body = kind === 'summary' ? { windowMinutes } : {};
      const result = await api.post(url, body, { timeout: 180_000 });
      if (result?.id) await loadInsights();
    } catch (err) {
      // Don't swallow: surface in load error banner so user sees it.
      loadError = `Couldn't write that story: ${err?.message || err}`;
    }
    generating = null;
  }

  function formatDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Today';
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return formatShortDateTime(ts);
  }

  function timeAgo(ts) {
    if (!ts) return '';
    const ms = Date.now() - new Date(ts).getTime();
    if (ms < 60_000) return 'just now';
    if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
    if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
    return `${Math.floor(ms / 86_400_000)}d ago`;
  }

  // Friendlier labels for the filter chips and insight cards. The backend
  // type names (session_summary, diff_risk, etc.) are jargon for power users;
  // here they become things a learner can scan.
  function typeLabel(type) {
    const labels = {
      session_summary: 'Recent activity',
      code_review: 'Code review',
      anomaly: 'Unusual activity',
      daily_digest: "Today's digest",
      diff_risk: 'Risky changes',
      agent_comparison: 'AI tools compared',
      project_health: 'Project health'
    };
    return labels[type] || type;
  }

  function typeColor(type) {
    const colors = {
      session_summary: 'var(--accent)',
      code_review: 'var(--success)',
      anomaly: 'var(--warning)',
      daily_digest: 'var(--accent)',
      diff_risk: 'var(--error)',
      agent_comparison: 'var(--success)',
      project_health: 'var(--accent)'
    };
    return colors[type] || 'var(--muted)';
  }

  // Filter chips — only show the kinds that have at least one entry,
  // plus "All". Avoids a wall of dead chips.
  const filterOptions = $derived.by(() => {
    const types = new Set(insights.map(i => i.type));
    const opts = [{ value: 'all', label: 'All stories' }];
    for (const t of [
      'session_summary',
      'daily_digest',
      'code_review',
      'agent_comparison',
      'project_health',
      'diff_risk',
      'anomaly'
    ]) {
      if (types.has(t)) opts.push({ value: t, label: typeLabel(t) });
    }
    return opts;
  });

  onMount(() => loadInsights());
  onDestroy(() => abortRequests());
</script>

<PageLayout>
  <PageHeader
    title="Insights"
    description="Stories Raven can write about how you and your AI tools have been working together. Tap a card to ask for one. Stories are written by your local AI, so nothing leaves your machine."
  >
    {#snippet actions()}
      {#if status.available}
        <span
          class="flex items-center gap-1.5 text-xs text-success font-mono"
          title="Local AI is ready to write."
        >
          <span class="w-1.5 h-1.5 bg-success rounded-full"></span>
          AI ready
        </span>
      {:else}
        <span
          class="flex items-center gap-1.5 text-xs text-error font-mono"
          title="Raven can't reach the local AI right now. Check Ollama is running."
        >
          <span class="w-1.5 h-1.5 bg-error rounded-full"></span>
          AI unavailable
        </span>
      {/if}
    {/snippet}
  </PageHeader>

  {#if loadError}
    <DataFetchError
      endpoint="/api/insights"
      message="Something went wrong"
      hint={loadError}
      onRetry={loadInsights}
    />
  {/if}

  <!-- Your journey: before/after stats. Skipped if too early. -->
  <div class="mb-6">
    <JourneyPanel />
  </div>

  <!-- Story cards. Each is a kind of report Raven can write. Big enough to
       read, small enough to scan four at a time. -->
  <div class="bg-surface border border-border rounded-lg p-5 mb-6">
    <!-- Header: title + Advanced toggle on the same row, description as a
         normal block-level paragraph below. Earlier flex-based layout
         collapsed the description into one-word-per-line in the rendered
         DOM (flex-shrink edge case), so this swaps to plain block flow. -->
    <div class="mb-4">
      <div class="flex items-baseline justify-between gap-3 mb-1">
        <h3 class="text-xs font-semibold text-muted uppercase tracking-wide">
          What can Raven tell you?
        </h3>
        <button
          type="button"
          onclick={() => (advancedOpen = !advancedOpen)}
          class="text-[11px] font-mono text-muted hover:text-accent transition-colors cursor-pointer"
        >
          {advancedOpen ? '▾' : '▸'} Advanced
        </button>
      </div>
      <p class="text-sm text-muted leading-snug max-w-2xl">
        Four kinds of stories about your activity. Pick whichever sounds useful — Raven will read
        your recent events and write it for you.
      </p>
    </div>

    {#if advancedOpen}
      <!-- Advanced: model + window. Tucked away because most users
           don't need them, but power users hate when they're hidden
           entirely. -->
      <div
        class="bg-canvas border border-border rounded p-3 mb-4 flex flex-wrap items-center gap-4 text-xs"
      >
        <div class="flex items-center gap-2">
          <label class="text-muted font-sans" for="model-select">Model</label>
          <select
            id="model-select"
            bind:value={selectedModel}
            class="px-2 py-1 bg-surface border border-border rounded font-mono text-body"
          >
            {#each status.models as model (model)}
              <option value={model}>{model}</option>
            {/each}
          </select>
          <span class="text-muted/70">— bigger = smarter, slower.</span>
        </div>
        <div class="flex items-center gap-2">
          <label class="text-muted font-sans" for="window-select">"Recent" means</label>
          <select
            id="window-select"
            bind:value={windowMinutes}
            class="px-2 py-1 bg-surface border border-border rounded font-mono text-body"
          >
            <option value={15}>last 15 min</option>
            <option value={30}>last 30 min</option>
            <option value={60}>last hour</option>
            <option value={180}>last 3 hours</option>
            <option value={720}>last 12 hours</option>
            <option value={1440}>last 24 hours</option>
          </select>
          <span class="text-muted/70">— used for "Recent activity".</span>
        </div>
      </div>
    {/if}

    <div class="grid sm:grid-cols-2 gap-3">
      {#each stories as story (story.kind)}
        {@const isGenerating = generating === story.generate}
        {@const otherGenerating = generating !== null && !isGenerating}
        <button
          type="button"
          onclick={() => generateStory(story.generate)}
          disabled={!status.available || generating !== null}
          class="text-left bg-canvas border border-border rounded p-4 transition-colors hover:border-accent hover:bg-canvas/80 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:bg-canvas"
        >
          <div class="flex items-baseline justify-between gap-2 mb-2">
            <span class="text-sm font-semibold text-body">{story.label}</span>
            <span class="text-[10px] font-mono text-muted">{story.time}</span>
          </div>
          <p class="text-xs text-body/80 font-sans leading-snug mb-2">{story.blurb}</p>
          <p class="text-[11px] text-muted font-sans italic mb-3">Best for: {story.bestFor}</p>
          {#if isGenerating}
            <span class="inline-flex items-center gap-2 text-xs text-accent font-mono">
              <span class="w-1.5 h-1.5 bg-accent rounded-full animate-pulse"></span>
              Writing your story…
            </span>
          {:else if otherGenerating}
            <span class="text-xs text-muted font-mono">— wait, another story is being written</span>
          {:else if !status.available}
            <span class="text-xs text-error font-mono">— AI is offline</span>
          {:else}
            <span class="text-xs text-accent font-mono group-hover:underline">Write this →</span>
          {/if}
        </button>
      {/each}
    </div>
  </div>

  <!-- Stories Raven has told you. -->
  <div class="bg-surface border border-border rounded-lg overflow-hidden">
    <div
      class="px-5 py-3 border-b border-border flex items-baseline justify-between gap-3 flex-wrap"
    >
      <h3 class="text-xs font-semibold text-muted uppercase tracking-wide">
        Stories Raven has told you
      </h3>
      {#if insights.length > 0}
        <span class="text-[10px] font-mono text-muted">{insights.length} total · newest first</span>
      {/if}
    </div>

    {#if filterOptions.length > 1}
      <!-- Show the chips only when there's something to filter through. -->
      <div class="flex items-center gap-1 px-5 py-3 border-b border-border flex-wrap">
        {#each filterOptions as opt (opt.value)}
          <button
            type="button"
            onclick={() => (filterType = opt.value)}
            class="px-2.5 py-1 text-xs font-sans rounded transition-colors cursor-pointer {filterType ===
            opt.value
              ? 'bg-accent text-canvas'
              : 'text-muted hover:text-body hover:bg-canvas'}"
          >
            {opt.label}
          </button>
        {/each}
      </div>
    {/if}

    {#if loading && insights.length === 0}
      <div class="p-5 space-y-3">
        {#each Array(2) as _, i (i)}
          <div class="h-24 bg-canvas border border-border rounded animate-pulse"></div>
        {/each}
      </div>
    {:else if filteredInsights.length === 0}
      <EmptyState
        size="compact"
        title={insights.length === 0
          ? 'Raven hasn’t written you a story yet'
          : 'Nothing here matches that filter'}
        description={insights.length === 0
          ? 'Pick a card above and Raven will write the first one. It takes a minute or two — your local AI is reading through your recent activity.'
          : 'Try “All stories” to see everything Raven has written.'}
      />
    {:else}
      <div class="divide-y divide-[var(--border)]">
        {#each filteredInsights as insight (insight.id)}
          <article class="p-5">
            <header class="flex items-baseline justify-between gap-3 flex-wrap mb-3">
              <div class="flex items-center gap-2 min-w-0">
                <span
                  class="px-1.5 py-0.5 text-[10px] font-bold rounded text-white uppercase tracking-wide"
                  style="background: {typeColor(insight.type)}">{typeLabel(insight.type)}</span
                >
                <span class="text-sm font-semibold text-body font-sans truncate">
                  {insight.title}
                </span>
              </div>
              <div
                class="flex items-center gap-3 text-[10px] text-muted font-mono"
                title="Written by {insight.model} · took {(insight.duration_ms / 1000).toFixed(
                  1
                )}s · read {insight.context_events} events"
              >
                <span>{timeAgo(insight.timestamp)}</span>
                <span class="hidden sm:inline"
                  >· {formatDate(insight.timestamp)} {formatTime(insight.timestamp)}</span
                >
              </div>
            </header>
            <div class="text-base text-body font-sans leading-relaxed">
              <!-- eslint-disable-next-line svelte/no-at-html-tags -- Output sanitized via DOMPurify in renderMarkdown -->
              {@html renderMarkdown(insight.content)}
            </div>
          </article>
        {/each}
      </div>
    {/if}
  </div>
</PageLayout>
