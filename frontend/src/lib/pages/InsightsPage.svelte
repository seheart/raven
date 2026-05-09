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
  let preview = $state(null); // Real-data previews for the story cards.
  let loading = $state(false);
  let generating = $state(null); // null | 'summary' | 'review' | 'digest' | 'agent-comparison'
  let generatingLabel = $state(''); // Friendly story label, used in the banner.
  let generatingStartedAt = $state(0);
  let elapsedTick = $state(0); // Forces the banner to recompute its elapsed seconds every second.
  let highlightInsightId = $state(null); // Glow the freshly-written story for ~3s after it lands.
  let selectedModel = $state('');
  let windowMinutes = $state(60);
  let filterType = $state('all');
  let advancedOpen = $state(false);
  let loadError = $state(null);

  // The most recent story across all kinds — featured at the top when
  // it's fresh enough to be relevant. Cuts the page from "press a button
  // to get content" to "here's what Raven last wrote, want another?"
  const featuredInsight = $derived.by(() => {
    if (!insights.length) return null;
    const latest = insights[0]; // API returns newest-first
    const ageMs = Date.now() - new Date(latest.timestamp).getTime();
    // 24h freshness window. Older than that and it's not really telling
    // you about NOW, so we let it ride in the past-stories list instead.
    if (ageMs > 24 * 60 * 60_000) return null;
    return latest;
  });

  // The list below the featured story = everything OTHER than the featured.
  const pastInsights = $derived.by(() => {
    if (!featuredInsight) return filteredInsights;
    return filteredInsights.filter(i => i.id !== featuredInsight.id);
  });

  const elapsed = $derived.by(() => {
    void elapsedTick; // depend on the ticker
    if (!generatingStartedAt) return 0;
    return Math.max(0, Math.floor((Date.now() - generatingStartedAt) / 1000));
  });

  const filteredInsights = $derived(
    filterType === 'all' ? insights : insights.filter(i => i.type === filterType)
  );

  // Story cards. Each one is a kind of report Raven can write. The
  // `previewLine` function turns the live /insights/preview response
  // into a one-line "here's what's in your data right now" hook so the
  // card stops being an abstract menu item.
  const stories = [
    {
      kind: 'session_summary',
      label: 'Recent activity',
      blurb:
        'A quick recap of what just happened on your machine — file changes, AI tool turns, what got worked on.',
      bestFor: 'Catching up after a break.',
      time: '~30s–1 min',
      generate: 'summary',
      previewLine: p => {
        const r = p?.recent_activity;
        if (!r || (r.events === 0 && r.agent_events === 0)) {
          return "Quiet hour. Nothing's stirred — want a recap of when it does?";
        }
        const turns = r.agent_events;
        const proj = r.projects;
        if (turns > 0 && proj > 0) {
          return `You've been busy: ${turns.toLocaleString()} AI turn${turns === 1 ? '' : 's'} across ${proj} project${proj === 1 ? '' : 's'} in the last hour.`;
        }
        if (turns > 0)
          return `${turns.toLocaleString()} AI turn${turns === 1 ? '' : 's'} in the last hour. Want a recap?`;
        return `${r.events.toLocaleString()} file event${r.events === 1 ? '' : 's'} in the last hour.`;
      }
    },
    {
      kind: 'code_review',
      label: 'Code review',
      blurb:
        'Raven looks at the changes your AI helpers shipped recently and tells you, in plain language, what changed and whether it looks right.',
      bestFor: "Trusting what an agent did while you weren't watching.",
      time: '~1 min',
      generate: 'review',
      previewLine: p => {
        const r = p?.code_review;
        if (!r || r.changes === 0)
          return "Your agents haven't shipped anything in the last day. Quiet stretch.";
        return `Your AI helpers shipped ${r.changes.toLocaleString()} change${r.changes === 1 ? '' : 's'} in the last 24 hours. Want a read-through?`;
      }
    },
    {
      kind: 'daily_digest',
      label: "Today's digest",
      blurb:
        'Everything you and your AI tools did today, summed up in a few paragraphs. The TL;DR of your workday.',
      bestFor: 'End-of-day reflection or a status update.',
      time: '~1–2 min',
      generate: 'digest',
      previewLine: p => {
        const r = p?.today_digest;
        if (!r || (r.events === 0 && r.agent_events === 0)) {
          return "Today's still wide open. Come back at end of day for the wrap-up.";
        }
        const proj = r.projects;
        const files = r.files;
        if (files > 0 && proj > 0) {
          return `Pretty active day — ${files.toLocaleString()} file${files === 1 ? '' : 's'} across ${proj} project${proj === 1 ? '' : 's'} so far. Want the TL;DR?`;
        }
        return `${r.events.toLocaleString()} event${r.events === 1 ? '' : 's'} today. Want the TL;DR?`;
      }
    },
    {
      kind: 'agent_comparison',
      label: 'AI tools side by side',
      blurb:
        'Compare how Claude, Cursor, Codex, and other AI tools have been working for you — who shipped what, who took longest, where each shines.',
      bestFor: 'Figuring out which tool to reach for next time.',
      time: '~1–2 min',
      generate: 'agent-comparison',
      previewLine: p => {
        const r = p?.agent_comparison?.agents;
        if (!r?.length) return 'Your AI tools have been quiet for the last day.';
        if (r.length === 1) {
          return `${r[0].agent} carried the day — ${r[0].events.toLocaleString()} turn${r[0].events === 1 ? '' : 's'}. Curious how they compare to others?`;
        }
        const lead = r[0];
        return `${lead.agent} did most of the work today (${lead.events.toLocaleString()} turn${lead.events === 1 ? '' : 's'}), with ${r.length - 1} other tool${r.length - 1 === 1 ? '' : 's'} chipping in. See the lineup?`;
      }
    }
  ];

  async function loadInsights() {
    loading = true;
    loadError = null;
    try {
      const [insightsData, statusData, previewData] = await Promise.all([
        api.get('/insights?limit=50'),
        api.get('/insights/status'),
        api.get('/insights/preview').catch(() => null)
      ]);
      insights = insightsData || [];
      status = statusData || { available: false, generating: false, models: [] };
      preview = previewData;
      if (!selectedModel && status.models.length > 0) {
        selectedModel = status.models[0];
      }
    } catch (err) {
      loadError = err?.message || String(err);
    }
    loading = false;
  }

  let elapsedTimer = null;

  async function generateStory(kind) {
    if (!status.available) return;
    generating = kind;
    const story = stories.find(s => s.generate === kind);
    generatingLabel = story?.label || 'your story';
    generatingStartedAt = Date.now();
    elapsedTick = 0;
    elapsedTimer = setInterval(() => (elapsedTick += 1), 1000);
    try {
      if (selectedModel) await api.put('/insights/model', { model: selectedModel }).catch(() => {});
      const url = `/insights/generate/${kind}`;
      const body = kind === 'summary' ? { windowMinutes } : {};
      const result = await api.post(url, body, { timeout: 180_000 });
      if (result?.id) {
        await loadInsights();
        // Brief glow on the new story so the user can see "your thing
        // landed there" instead of just guessing it's somewhere in the
        // list. Cleared after 3s.
        highlightInsightId = result.id;
        setTimeout(() => {
          if (highlightInsightId === result.id) highlightInsightId = null;
        }, 3000);
        // Scroll the new story into view.
        requestAnimationFrame(() => {
          const el = document.getElementById(`insight-${result.id}`);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      }
    } catch (err) {
      loadError = `Couldn't write that story: ${err?.message || err}`;
    }
    if (elapsedTimer) {
      clearInterval(elapsedTimer);
      elapsedTimer = null;
    }
    generating = null;
    generatingLabel = '';
    generatingStartedAt = 0;
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

  // Personal hero. Time-aware greeting + a sentence built from the
  // right_now block of /insights/preview. Goal: make the page feel like
  // it knows you, instead of being a generic dashboard. The earlier
  // version skipped this opening narrative and went straight to story
  // cards — accurate but cold.
  const greeting = $derived.by(() => {
    const h = new Date().getHours();
    if (h < 5) return 'Late night';
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    if (h < 22) return 'Good evening';
    return 'Late night';
  });

  /** @returns {string|null} */
  function streakLine(rn) {
    if (!rn?.current_streak_days || rn.current_streak_days < 2) return null;
    const d = rn.current_streak_days;
    const proj = rn?.top_project_7d?.name;
    if (proj) {
      return `You're ${d} day${d === 1 ? '' : 's'} into a streak, mostly on ${proj}.`;
    }
    return `You're ${d} day${d === 1 ? '' : 's'} into a streak.`;
  }

  /** @returns {string|null} */
  function partnerLine(rn) {
    const ag = rn?.top_agent_7d?.name;
    const md = rn?.top_model_7d?.name;
    if (ag && md)
      return `${ag} has been your main partner this week, with ${md} doing the heavy thinking.`;
    if (ag) return `${ag} has been your main partner this week.`;
    if (md) return `${md} has been doing the heavy thinking.`;
    return null;
  }

  /** @returns {string|null} */
  function lastTouchedLine(rn) {
    const le = rn?.last_event;
    if (!le) return null;
    const ago = timeAgo(le.timestamp);
    const file = le.file ? le.file.split('/').pop() : null;
    if (file) {
      return `Last touched ${file} in ${le.project} — ${ago}.`;
    }
    return `Last touched ${le.project} — ${ago}.`;
  }

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

  {#if generating}
    <!-- Loud feedback while the local LLM is writing. Without this, the
         only sign anything was happening was small italic text inside one
         of the cards — easy to miss, especially during the 30-90s wait. -->
    <div
      class="bg-accent-subtle border border-accent rounded-lg p-4 mb-4 flex items-center gap-3"
      role="status"
      aria-live="polite"
    >
      <div class="flex-shrink-0 relative w-3 h-3">
        <span class="absolute inset-0 bg-accent rounded-full animate-ping opacity-60"></span>
        <span class="absolute inset-0 bg-accent rounded-full"></span>
      </div>
      <div class="flex-1 min-w-0">
        <div class="text-sm font-semibold text-accent">
          Raven is writing your <span class="font-mono">{generatingLabel}</span> story…
        </div>
        <div class="text-xs text-muted mt-0.5">
          Local AI is reading your recent activity. Usually 30 seconds to a minute, sometimes longer
          on the first run while the model loads. The story will appear below when it's ready.
        </div>
      </div>
      <div class="text-xs font-mono text-muted tabular-nums flex-shrink-0">
        {elapsed}s
      </div>
    </div>
  {/if}

  {#if loadError}
    <DataFetchError
      endpoint="/api/insights"
      message="Something went wrong"
      hint={loadError}
      onRetry={loadInsights}
    />
  {/if}

  {#if preview?.right_now}
    <!-- Personal hero. Time-aware greeting + 1-3 sentence observations
         pulled from the right_now block (current streak, top project,
         top AI partner, last touched). Goal: page should feel like it
         knows you, not like a generic dashboard. -->
    {@const rn = preview.right_now}
    {@const sLine = streakLine(rn)}
    {@const pLine = partnerLine(rn)}
    {@const lLine = lastTouchedLine(rn)}
    <div class="bg-surface border border-border rounded-lg p-6 mb-6">
      <div class="text-[11px] font-mono uppercase tracking-widest text-muted mb-2">
        {greeting}
      </div>
      <div class="text-base sm:text-lg text-body font-sans leading-relaxed space-y-1.5">
        {#if sLine}
          <p>{sLine}</p>
        {/if}
        {#if pLine}
          <p>{pLine}</p>
        {/if}
        {#if !sLine && !pLine}
          <p class="text-muted italic">
            Once you have a few days of activity, this is where Raven will tell you what it sees.
          </p>
        {/if}
        {#if lLine}
          <p class="text-sm text-muted">{lLine}</p>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Your journey: before/after stats. Skipped if too early. -->
  <div class="mb-6">
    <JourneyPanel />
  </div>

  {#if featuredInsight}
    <!-- Featured: the most recent story, prominent. The page used to bury
         this at the bottom under the cards, so on a return visit you had
         to scroll to see what Raven last wrote. Now it leads. -->
    <article
      class="bg-surface border border-border rounded-lg p-5 mb-6"
      id="insight-{featuredInsight.id}"
    >
      <header class="flex items-baseline justify-between gap-3 flex-wrap mb-3">
        <div class="flex items-center gap-2 min-w-0">
          <span
            class="px-1.5 py-0.5 text-[10px] font-bold rounded text-white uppercase tracking-wide"
            style="background: {typeColor(featuredInsight.type)}"
            >{typeLabel(featuredInsight.type)}</span
          >
          <span class="text-xs font-mono text-muted"
            >Latest · {timeAgo(featuredInsight.timestamp)}</span
          >
        </div>
        <button
          type="button"
          onclick={() =>
            generateStory(
              stories.find(s => s.kind === featuredInsight.type)?.generate || 'summary'
            )}
          disabled={!status.available || generating !== null}
          class="text-[11px] font-mono text-muted hover:text-accent transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          title="Ask Raven to write a fresh version"
        >
          ↻ rewrite
        </button>
      </header>
      <h2 class="text-lg font-semibold text-heading mb-3">{featuredInsight.title}</h2>
      <div class="text-base text-body font-sans leading-relaxed">
        <!-- eslint-disable-next-line svelte/no-at-html-tags -- Output sanitized via DOMPurify in renderMarkdown -->
        {@html renderMarkdown(featuredInsight.content)}
      </div>
    </article>
  {/if}

  <!-- Story cards. Each is a kind of report Raven can write. Big enough to
       read, small enough to scan four at a time. -->
  <div class="bg-surface border border-border rounded-lg p-5 mb-6">
    <header class="mb-4">
      <div class="flex items-baseline justify-between gap-3">
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
      <div class="text-sm text-muted mt-1 leading-snug">
        Four kinds of stories about your activity. Pick whichever sounds useful — Raven will read
        your recent events and write it for you.
      </div>
    </header>

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
        {@const previewLine = preview ? story.previewLine(preview) : null}
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
          {#if previewLine}
            <!-- Real-data preview, leads. The previous "blurb + best for"
                 was abstract — this tells you what's actually in your data
                 right now, before you click. -->
            <div class="text-sm text-accent font-sans font-medium mb-2">{previewLine}</div>
          {/if}
          <div class="text-xs text-muted font-sans leading-snug mb-3">
            {story.blurb}
          </div>
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
            <span class="text-xs text-accent font-mono">Write this →</span>
          {/if}
        </button>
      {/each}
    </div>
  </div>

  <!-- Past stories. Only render when there's something here BEYOND the
       featured one above — no point in showing an "Older stories" header
       with nothing under it on a fresh install. -->
  {#if pastInsights.length > 0 || (loading && insights.length === 0)}
    <div class="bg-surface border border-border rounded-lg overflow-hidden">
      <div
        class="px-5 py-3 border-b border-border flex items-baseline justify-between gap-3 flex-wrap"
      >
        <h3 class="text-xs font-semibold text-muted uppercase tracking-wide">
          {featuredInsight ? 'Older stories' : 'Stories Raven has told you'}
        </h3>
        {#if insights.length > 0}
          <span class="text-[10px] font-mono text-muted"
            >{pastInsights.length}
            {pastInsights.length === 1 ? 'story' : 'stories'}</span
          >
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
      {:else if pastInsights.length === 0}
        <EmptyState
          size="compact"
          title="Nothing here matches that filter"
          description="Try 'All stories' to see everything Raven has written."
        />
      {:else}
        <div class="divide-y divide-[var(--border)]">
          {#each pastInsights as insight (insight.id)}
            <article
              id="insight-{insight.id}"
              class="p-5 transition-colors {highlightInsightId === insight.id
                ? 'bg-accent-subtle'
                : ''}"
            >
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
  {/if}
</PageLayout>
