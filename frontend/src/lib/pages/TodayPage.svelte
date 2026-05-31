<script>
  /**
   * Today — first-run landing view. Lightweight, narrative-first.
   * Built for new Claude Code users to understand what's happening
   * without docs: cost so far, plain-English activity, files touched,
   * a one-sentence summary narrated by the local model.
   */
  import { onMount, onDestroy } from 'svelte';
  import { logger } from '../logger.js';
  import { PageLayout, PageSection } from '../components/layout/index.js';
  import { formatUsd } from '../utils/formatUsd.js';
  import TokenStream from '../components/today/TokenStream.svelte';
  import AnomalyBanner from '../components/today/AnomalyBanner.svelte';
  import MilestonesPanel from '../components/today/MilestonesPanel.svelte';
  import WeekRecap from '../components/today/WeekRecap.svelte';
  import DailyDigest from '../components/today/DailyDigest.svelte';
  import PersonaCard from '../components/today/PersonaCard.svelte';
  import { createPageApi } from '../apiClient.js';
  import { websocketService } from '../services/websocket.js';

  const { api, abort } = createPageApi();

  /** @type {{ total_cost_usd?: number, total_requests?: number, total_input_tokens?: number, total_output_tokens?: number, total_cache_read_tokens?: number } | null} */
  let costs = $state(null);
  /** @type {Array<{timestamp:string,type:string,content:string,metadata?:Record<string,any>}>} */
  let activity = $state([]);
  /** @type {Array<{id:number,timestamp:string,filepath:string,change_type:string,project_name?:string|null}>} */
  let events = $state([]);
  /** @type {string|null} */
  let summary = $state(null);
  let summaryLoading = $state(false);
  /** @type {string|null} */
  let summaryError = $state(null);
  let summaryDisabled = $state(false);

  /** @type {Array<{bucket:string, cost_usd:number, requests:number}>} */
  let costTimeline = $state([]);
  /** Previous spend value, used to flash the hero number when it ticks up. */
  let lastSpend = $state(0);
  let spendDelta = $state(0);

  let websocketConnected = $state(false);
  /** @type {string|null} */
  let loadError = $state(null);

  /** @type {ReturnType<typeof setInterval>|null} */
  let costTicker = null;
  /** @type {ReturnType<typeof setInterval>|null} */
  let timelineTicker = null;
  /** @type {ReturnType<typeof setTimeout>|null} */
  let spendDeltaTimer = null;
  // Lifecycle guard for async loops (loadSummary polling). Flipped false in
  // onDestroy so a long poll stops re-issuing requests after navigation.
  let mounted = true;

  // ── Date helpers ───────────────────────────────────────────────
  // "Today" = local midnight onward. Convert to ISO for the API.
  function todayStartIso() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }

  /** @param {string} iso */
  function isToday(iso) {
    const d = new Date(iso);
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  }

  /** @param {string} iso */
  function relativeTime(iso) {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const sec = Math.floor((now - then) / 1000);
    if (sec < 5) return 'just now';
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    return `${Math.floor(hr / 24)}d ago`;
  }

  /** @param {number|null|undefined} n */
  function fmtUsd(n) {
    if (n == null) return '$—';
    return formatUsd(n);
  }

  /** @param {number|null|undefined} n */
  function fmtInt(n) {
    if (n == null) return '—';
    return n.toLocaleString();
  }

  /** @param {number|null|undefined} n */
  function fmtTokens(n) {
    if (n == null) return '—';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return String(n);
  }

  /** Today's date as a friendly string for the header. */
  const todayLabel = $derived.by(() => {
    const d = new Date();
    return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  });

  // ── Plain-English activity formatting ──────────────────────────
  /** @param {{type:string,content:string,metadata?:Record<string,any>}} entry */
  function describeActivity(entry) {
    const m = entry.metadata || {};
    switch (entry.type) {
      case 'user':
        return { lead: 'You', verb: 'asked', detail: trimContent(entry.content, 120) };
      case 'assistant':
        return { lead: 'Claude', verb: 'responded', detail: trimContent(entry.content, 120) };
      case 'tool': {
        const tool = m.tool || 'a tool';
        return { lead: 'Claude', verb: `used ${tool}`, detail: trimContent(entry.content, 120) };
      }
      case 'subagent': {
        const t = m.subagentType || 'agent';
        return {
          lead: 'Claude',
          verb: `delegated to ${t}`,
          detail: trimContent(entry.content, 120)
        };
      }
      default:
        return { lead: 'Activity', verb: entry.type, detail: trimContent(entry.content, 120) };
    }
  }

  /** @param {string|null|undefined} s @param {number} max */
  function trimContent(s, max) {
    if (!s) return '';
    const flat = String(s).replace(/\s+/g, ' ').trim();
    return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
  }

  /** @param {string} type */
  function activityToneClass(type) {
    switch (type) {
      case 'user':
        return 'text-info';
      case 'assistant':
        return 'text-accent';
      case 'tool':
        return 'text-success';
      case 'subagent':
        return 'text-warning';
      default:
        return 'text-muted';
    }
  }

  /** @param {string} kind */
  function changeBadgeClass(kind) {
    switch (kind) {
      case 'add':
      case 'create':
        return 'bg-success/15 text-success';
      case 'unlink':
      case 'delete':
        return 'bg-error/15 text-error';
      case 'change':
      case 'modify':
        return 'bg-info/15 text-info';
      default:
        return 'bg-surface-2 text-muted';
    }
  }

  // Compress long paths for display: keep tail, ellipsize middle.
  /** @param {string} fp */
  function shortPath(fp) {
    if (!fp) return '';
    if (fp.length <= 56) return fp;
    const parts = fp.split('/');
    if (parts.length <= 3) return fp;
    return `${parts[0]}/…/${parts.slice(-2).join('/')}`;
  }

  // ── Files-touched derivation ───────────────────────────────────
  // Dedupe events by filepath (keep the most-recent one), filter to today.
  // The list is rendered top-10 for screen real estate, but the count and
  // any totals derive from the full deduped set — earlier this page sliced
  // first and then counted, silently capping the "X unique" label at 10
  // even on busy days with thousands of distinct files.
  const filesTodayAll = $derived.by(() => {
    /** @type {Map<string, typeof events[number]>} */
    const seen = new Map();
    for (const e of events) {
      if (!isToday(e.timestamp)) continue;
      if (!seen.has(e.filepath)) seen.set(e.filepath, e);
    }
    return Array.from(seen.values());
  });

  const filesToday = $derived(filesTodayAll.slice(0, 10));
  const filesTodayCount = $derived(filesTodayAll.length);

  const eventsTodayCount = $derived(events.filter(e => isToday(e.timestamp)).length);

  // ── Loaders ────────────────────────────────────────────────────
  async function loadCosts() {
    try {
      const data = await api.get(`/costs/summary?start=${encodeURIComponent(todayStartIso())}`);
      const newSpend = Number(data?.total_cost_usd) || 0;
      // Track delta so the hero can flash when the meter ticks up.
      if (lastSpend > 0 && newSpend > lastSpend) {
        spendDelta = newSpend - lastSpend;
        // Auto-clear the delta marker after 4s — keeps it from sticking.
        // Tracked so onDestroy can clear it (was leaking on unmount).
        if (spendDeltaTimer) clearTimeout(spendDeltaTimer);
        spendDeltaTimer = setTimeout(() => {
          spendDelta = 0;
        }, 4000);
      }
      lastSpend = newSpend;
      costs = data;
    } catch (err) {
      // Silent — keep prior value rather than blanking the ticker.
      if (err?.name !== 'AbortError') {
        logger.warn('costs/summary failed:', err);
      }
    }
  }

  async function loadCostTimeline() {
    try {
      const start = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
      const data = await api.get(`/costs/timeline?bucket=hour&start=${encodeURIComponent(start)}`);
      costTimeline = Array.isArray(data) ? data : [];
    } catch (err) {
      if (err?.name !== 'AbortError') logger.warn('costs/timeline failed:', err);
    }
  }

  // Sparkline path for the hero cost band — last 12 hours of spend.
  // Returns null when there isn't enough variation to draw something useful.
  const sparkPath = $derived.by(() => {
    if (!costTimeline || costTimeline.length < 2) return null;
    const w = 600,
      h = 36,
      pad = 2;
    const max = Math.max(...costTimeline.map(t => Number(t.cost_usd) || 0));
    if (max <= 0) return null;
    const stepX = (w - pad * 2) / (costTimeline.length - 1);
    return costTimeline
      .map((t, i) => {
        const x = pad + i * stepX;
        const y = h - pad - ((Number(t.cost_usd) || 0) / max) * (h - pad * 2);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  });

  // Filled-area version of the same path, anchored to the bottom edge so the
  // sparkline reads as a small "weight of spend" silhouette rather than a line.
  const sparkAreaPath = $derived.by(() => {
    if (!sparkPath) return null;
    const w = 600,
      h = 36;
    return `${sparkPath} L${w - 2},${h - 2} L2,${h - 2} Z`;
  });

  async function loadActivity() {
    try {
      const data = await api.get('/session-activity?limit=12');
      activity = Array.isArray(data?.entries) ? data.entries : [];
    } catch (err) {
      if (err?.name !== 'AbortError') logger.warn('session-activity failed:', err);
    }
  }

  async function loadEvents() {
    try {
      const data = await api.get('/events/recent?limit=200');
      events = Array.isArray(data) ? data : [];
    } catch (err) {
      if (err?.name !== 'AbortError') logger.warn('events/recent failed:', err);
    }
  }

  // ── Summary loading ────────────────────────────────────────────
  // Strategy: try a fresh recent summary first. If none, request generation.
  // The backend may return 200 with content, or 202 if a generation is already
  // queued — in that case we poll /insights/latest until a fresh one lands.
  /** @param {string|null|undefined} iso */
  function isFresh(iso) {
    if (!iso) return false;
    return Date.now() - new Date(iso).getTime() < 10 * 60 * 1000; // 10 min
  }

  /**
   * Sleep that resolves early once the component unmounts, so a polling loop
   * doesn't keep waiting (and re-issuing requests) after navigation.
   * @param {number} ms
   */
  function sleep(ms) {
    return new Promise(r => {
      const id = setTimeout(r, ms);
      // Poll the mounted flag cheaply; clears its own timers on unmount.
      const check = setInterval(() => {
        if (!mounted) {
          clearTimeout(id);
          clearInterval(check);
          r(undefined);
        }
      }, 250);
      setTimeout(() => clearInterval(check), ms);
    });
  }

  // The insights service returns a multi-paragraph markdown summary; the Today
  // hero wants a single sentence. Strip headers + bold-prefix labels and grab
  // the first real sentence.
  /** @param {string|null|undefined} content */
  function extractLeadSentence(content) {
    if (!content) return '';
    const lines = content
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);
    for (const raw of lines) {
      if (/^#+\s/.test(raw)) continue; // skip markdown headers
      // strip a leading "**Label:** " prefix like "**What happened:** ..."
      const cleaned = raw.replace(/^\*\*[^*]+\*\*:?\s*/, '').trim();
      if (cleaned.length < 12) continue;
      const firstSentence = cleaned.split(/(?<=[.!?])\s+/)[0];
      return firstSentence.length > 220 ? `${firstSentence.slice(0, 219)}…` : firstSentence;
    }
    return content.length > 220 ? `${content.slice(0, 219)}…` : content;
  }

  async function loadSummary() {
    if (summaryLoading) return;
    summaryLoading = true;
    summaryError = null;
    try {
      // 1. Check for a recently-generated summary (cheap, no Ollama call).
      const latest = await api
        .get('/insights/latest?type=session_summary', { silent: true })
        .catch(() => null);
      if (latest && latest.content && isFresh(latest.timestamp)) {
        summary = extractLeadSentence(latest.content);
        summaryDisabled = false;
        return;
      }

      // 2. Request a fresh generation. 200 = content; 202 = queued/in-flight.
      const data = await api.post(
        '/insights/generate/summary',
        { windowMinutes: 1440 },
        // silent=true: TodayPage renders its own "summaries are off" / error UI,
        // and a 503 here is expected when RAVEN_INSIGHTS_DISABLED=1.
        { timeout: 120000, silent: true }
      );
      if (data?.content) {
        summary = extractLeadSentence(data.content);
        summaryDisabled = false;
        return;
      }

      // 3. 202 path — poll /insights/latest until a fresh result lands.
      // Ollama narration on a small window typically returns in 5–30s.
      const baseline = latest?.timestamp || null;
      for (let i = 0; i < 20; i++) {
        await sleep(3000);
        // Bail if the page unmounted while we were waiting — stops the loop
        // from re-issuing /insights/latest requests after navigation.
        if (!mounted) return;
        const poll = await api
          .get('/insights/latest?type=session_summary', { silent: true })
          .catch(() => null);
        if (poll?.content && poll.timestamp !== baseline) {
          summary = extractLeadSentence(poll.content);
          summaryDisabled = false;
          return;
        }
      }
      // Timed out without a fresh result.
      summaryError = 'Summary still generating — try again in a moment.';
    } catch (err) {
      const e = /** @type {{ name?: string, message?: string }} */ (err);
      if (e?.name === 'AbortError') {
        // Don't surface — page is unmounting.
      } else {
        const msg = e?.message || String(err);
        if (msg.includes('disabled') || msg.includes('503')) {
          summaryDisabled = true;
        } else {
          summaryError = msg;
        }
      }
    } finally {
      summaryLoading = false;
    }
  }

  onMount(() => {
    Promise.allSettled([loadCosts(), loadCostTimeline(), loadActivity(), loadEvents()]).then(
      results => {
        const firstFail = results.find(r => r.status === 'rejected');
        if (firstFail && firstFail.reason?.name !== 'AbortError') {
          loadError = firstFail.reason?.message || 'Failed to load Today data';
        }
      }
    );

    // Fire the LLM summary in parallel — it's slow and not blocking.
    loadSummary();

    // Cost ticker: 60s cadence — billing windows are hourly, so refreshing
    // every 5s was just thrashing. Timeline stays on its own 60s cadence.
    costTicker = setInterval(loadCosts, 60_000);
    timelineTicker = setInterval(loadCostTimeline, 60000);

    websocketConnected = websocketService.isConnected();
    const updateStatus = () => {
      websocketConnected = websocketService.isConnected();
    };
    websocketService.on('connect', updateStatus);
    websocketService.on('disconnect', updateStatus);

    return () => {
      websocketService.off('connect', updateStatus);
      websocketService.off('disconnect', updateStatus);
    };
  });

  onDestroy(() => {
    mounted = false;
    if (costTicker) clearInterval(costTicker);
    if (timelineTicker) clearInterval(timelineTicker);
    if (spendDeltaTimer) clearTimeout(spendDeltaTimer);
    abort();
  });
</script>

<PageLayout>
  <!-- Negative top margin pulls the hero up against the sub-nav. The
       canonical PageLayout p-6 (24px) plus the sub-nav's bottom border
       was leaving an awkward dead band before any content; this is a
       narrative landing page, not a dashboard, so a tight top reads
       more "magazine cover" than "settings panel". -->
  <div class="-mt-4 space-y-8">
    <!-- Top line — presence pill (doubling as live-connection indicator)
         on the left, today's date on the right. Slim, so the persona hero
         below lands as the first real content. -->
    <div class="flex items-center justify-between gap-3 flex-wrap">
      <div
        class="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-surface border border-border text-[10px] font-mono uppercase tracking-wide text-muted"
        title={websocketConnected
          ? 'Connected — live updates flowing'
          : 'Disconnected from live updates'}
      >
        <span
          class="w-1.5 h-1.5 rounded-full {websocketConnected
            ? 'bg-success animate-pulse'
            : 'bg-warning'}"
          aria-hidden="true"
        ></span>
        <span>Always perched · your AI's steady companion</span>
      </div>
      <p class="hidden sm:block text-[11px] font-mono uppercase tracking-wide text-muted/80">
        {todayLabel}
      </p>
    </div>

    <!-- Persona hero — Raven's read on who you are at the keyboard. The
         relationship anchor: a deterministic, data-derived profile that
         makes the page feel like Raven has been paying attention. -->
    <PersonaCard />

    <!-- Raven's note — the optional LLM-narrated line. Supplemental color
         under the persona, never load-bearing; quietly hidden when the
         local model is disabled so the disabled state never dominates. -->
    {#if summary || summaryLoading || summaryError}
      <div class="max-w-[48rem]">
        {#if summaryLoading && !summary}
          <div class="space-y-2 animate-pulse" aria-label="Generating narrated summary">
            <div class="h-4 bg-surface-2 rounded w-3/4"></div>
            <div class="h-4 bg-surface-2 rounded w-1/2"></div>
          </div>
        {:else if summary}
          <div class="text-[10px] font-mono uppercase tracking-wide text-muted mb-1.5">
            Raven's note
          </div>
          <p class="text-base text-muted font-sans italic leading-relaxed">
            <span aria-hidden="true" class="text-accent mr-1">“</span>{summary}<span
              aria-hidden="true"
              class="text-accent ml-1">”</span
            >
          </p>
          <button
            type="button"
            onclick={loadSummary}
            disabled={summaryLoading}
            class="mt-2 text-[11px] font-mono uppercase tracking-wide text-muted hover:text-accent transition-colors disabled:opacity-50"
          >
            {summaryLoading ? 'Refreshing…' : '↻ Re-narrate'}
          </button>
        {:else if summaryError}
          <p class="text-xs text-muted font-sans">
            Narration unavailable: {summaryError}
            <button
              type="button"
              onclick={loadSummary}
              class="ml-2 underline hover:text-accent transition-colors">try again</button
            >
          </p>
        {/if}
      </div>
    {/if}

    {#if loadError}
      <div class="bg-error/10 border-l-4 border-error text-error rounded-r p-3 text-sm">
        {loadError}
      </div>
    {/if}

    <!-- Anomaly banner — only renders when an agent is drifting. Sits
         right under the hero so a real problem can interrupt before the
         user reads anything else. -->
    <AnomalyBanner />

    <!-- Milestone card — moved up from the bottom so a celebration ("you
         crossed 1,000 events!") lands as a "today's moment" inline with
         the narrative, not as an orphaned strip far below. Self-renders
         only when there's an unviewed milestone. -->
    <MilestonesPanel />

    <!-- Digests — today and this week, side by side. The daily recap
         narrates the day against your recent baseline; the weekly is the
         Mon-anchored ISO-week digest. Both deterministic, both inline. -->
    <section class="grid grid-cols-1 xl:grid-cols-2 gap-6 items-stretch">
      <DailyDigest />
      <WeekRecap />
    </section>

    <!-- Cost ticker — the hero. The single most educational visualization
         for someone new to AI. Big number, ticking up in real time as
         inferences resolve. Cost anxiety is the #1 felt pain — answer it
         before they ask. -->
    <section class="bg-surface border border-border rounded-lg p-6 relative overflow-hidden">
      <div class="flex items-baseline justify-between gap-4 flex-wrap">
        <div class="min-w-0">
          <div class="text-xs font-mono uppercase tracking-wide text-muted mb-2">
            Spent so far today
          </div>
          <div class="flex items-baseline gap-3 flex-wrap">
            <div
              class="text-5xl font-bold text-heading tracking-[-0.04em] tabular-nums transition-all"
            >
              {fmtUsd(costs?.total_cost_usd)}
            </div>
            {#if spendDelta > 0}
              <span
                class="text-success font-mono text-sm tabular-nums animate-pulse"
                title="Spend ticked up since last refresh"
              >
                +{fmtUsd(spendDelta)}
              </span>
            {/if}
          </div>
          <div class="mt-2 text-sm font-mono text-muted">
            {fmtInt(costs?.total_requests)} requests ·
            {fmtTokens(costs?.total_input_tokens)}↑ /
            {fmtTokens(costs?.total_output_tokens)}↓
          </div>
        </div>
      </div>

      {#if sparkPath}
        <div class="mt-4">
          <svg
            class="w-full block"
            height="36"
            viewBox="0 0 600 36"
            preserveAspectRatio="none"
            aria-label="Cost over the last 12 hours"
          >
            <path d={sparkAreaPath} fill="var(--accent)" fill-opacity="0.12" />
            <path
              d={sparkPath}
              fill="none"
              stroke="var(--accent)"
              stroke-width="1.5"
              stroke-linejoin="round"
            />
          </svg>
          <div class="mt-1 text-[10px] font-mono text-muted/70 flex justify-between">
            <span>12 hours ago</span>
            <span>now</span>
          </div>
        </div>
      {/if}
    </section>

    <!-- Token stream — paired with the cost hero above so the user can
         feel the unit cost of an inference in real time. -->
    <TokenStream />

    <!-- Secondary stats — files + cache. Cost lives above as the hero. -->
    <section class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="bg-surface border border-border rounded-lg p-5">
        <div class="text-xs font-mono uppercase tracking-wide text-muted mb-2">
          Files Claude touched
        </div>
        <div class="text-4xl font-bold text-heading tracking-[-0.025em] tabular-nums">
          {filesTodayCount}
        </div>
        <div class="mt-2 text-xs font-mono text-muted">
          {fmtInt(eventsTodayCount)} file events today
        </div>
      </div>

      <div class="bg-surface border border-border rounded-lg p-5">
        <div class="text-xs font-mono uppercase tracking-wide text-muted mb-2">Cache reads</div>
        <div class="text-4xl font-bold text-heading tracking-[-0.025em] tabular-nums">
          {fmtTokens(costs?.total_cache_read_tokens)}
        </div>
        <div class="mt-2 text-xs font-mono text-muted">
          tokens served from cache (skipped re-reading)
        </div>
      </div>
    </section>

    <!-- Two columns: activity + files. Stacks single-column below xl
         (matches Dashboard design center — half-screen views never sit
         in cramped side-by-side lists). -->
    <section class="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <!-- Recent activity -->
      <PageSection
        title="Recent activity"
        meta={activity.length ? `last ${Math.min(activity.length, 7)}` : ''}
      >
        <!-- Bounded scroll on the list, not the card — Bloomberg-terminal
             pattern. Card stays short and dense; the user scrolls within. -->
        <div class="bg-surface border border-border rounded-lg p-1 max-h-[400px] overflow-y-auto">
          {#if activity.length === 0}
            <div class="p-4 text-sm text-muted italic">
              No recent activity. Start a Claude Code session and a green dot will light up here.
            </div>
          {:else}
            <ul class="divide-y divide-border">
              {#each activity.slice(0, 7) as entry, i (entry.timestamp + i)}
                {@const desc = describeActivity(entry)}
                <li class="p-3 flex gap-3 items-baseline">
                  <span class="text-[11px] font-mono text-muted w-16 flex-shrink-0"
                    >{relativeTime(entry.timestamp)}</span
                  >
                  <div class="flex-1 min-w-0">
                    <div class="text-sm">
                      <span class="font-semibold {activityToneClass(entry.type)}">{desc.lead}</span>
                      <span class="text-body"> {desc.verb}</span>
                    </div>
                    {#if desc.detail}
                      <div class="text-sm text-muted font-sans mt-0.5 truncate">{desc.detail}</div>
                    {/if}
                  </div>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </PageSection>

      <!-- Files touched today -->
      <PageSection title="Files Claude touched today" meta="{filesTodayCount} unique">
        <div class="bg-surface border border-border rounded-lg p-1 max-h-[400px] overflow-y-auto">
          {#if filesToday.length === 0}
            <div class="p-4 text-sm text-muted italic">
              No file edits yet today. As Claude edits files, they'll show up here.
            </div>
          {:else}
            <ul class="divide-y divide-border">
              {#each filesToday as e (e.id)}
                <li class="p-3 flex gap-3 items-baseline">
                  <span class="text-[11px] font-mono text-muted w-16 flex-shrink-0"
                    >{relativeTime(e.timestamp)}</span
                  >
                  <div class="flex-1 min-w-0">
                    <div class="font-mono text-sm text-body truncate" title={e.filepath}>
                      {shortPath(e.filepath)}
                    </div>
                    {#if e.project_name}
                      <div class="text-xs text-muted font-mono mt-0.5">{e.project_name}</div>
                    {/if}
                  </div>
                  <span
                    class="inline-block text-[10px] font-mono font-bold px-1.5 py-0.5 rounded {changeBadgeClass(
                      e.change_type
                    )} flex-shrink-0"
                  >
                    {e.change_type}
                  </span>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </PageSection>
    </section>
  </div>
</PageLayout>
