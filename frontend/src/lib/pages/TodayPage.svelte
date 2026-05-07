<script>
  /**
   * Today — first-run landing view. Lightweight, narrative-first.
   * Built for new Claude Code users to understand what's happening
   * without docs: cost so far, plain-English activity, files touched,
   * a one-sentence summary narrated by the local model.
   */
  import { onMount, onDestroy } from 'svelte';
  import { PageLayout, PageHeader, PageSection } from '../components/layout/index.js';
  import { createPageApi } from '../apiClient.js';
  import { websocketService } from '../services/websocket.js';
  import { navigate } from '../utils/router.svelte.js';

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

  /**
   * @typedef {{events:number, files:number, projects:Array<{project:string,events:number,files:number,days_active?:number}>, top_project:string|null, longest_session_seconds:number}} NarrativeToday
   * @typedef {{events:number, files:number, projects:Array<{project:string,events:number,files:number,days_active:number}>, top_project:string|null, days_active:number}} NarrativeWeek
   * @typedef {{today:NarrativeToday, week:NarrativeWeek, returning:Array<{project:string,days_since_last_event:number}>}} Narrative
   */
  /** @type {Narrative|null} */
  let narrative = $state(null);

  let websocketConnected = $state(false);
  /** @type {string|null} */
  let loadError = $state(null);

  /** @type {ReturnType<typeof setInterval>|null} */
  let costTicker = null;

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
    return d.getFullYear() === now.getFullYear()
      && d.getMonth() === now.getMonth()
      && d.getDate() === now.getDate();
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
    if (n < 0.01) return '<$0.01';
    return `$${n.toFixed(2)}`;
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
        return { lead: 'Claude', verb: `delegated to ${t}`, detail: trimContent(entry.content, 120) };
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
      case 'user': return 'text-info';
      case 'assistant': return 'text-accent';
      case 'tool': return 'text-success';
      case 'subagent': return 'text-warning';
      default: return 'text-muted';
    }
  }

  /** @param {string} kind */
  function changeBadgeClass(kind) {
    switch (kind) {
      case 'add':
      case 'create': return 'bg-success/15 text-success';
      case 'unlink':
      case 'delete': return 'bg-error/15 text-error';
      case 'change':
      case 'modify': return 'bg-info/15 text-info';
      default: return 'bg-surface-2 text-muted';
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
  // Dedupe events by filepath (keep the most-recent one), filter to
  // today, return top 10.
  const filesToday = $derived.by(() => {
    /** @type {Map<string, typeof events[number]>} */
    const seen = new Map();
    for (const e of events) {
      if (!isToday(e.timestamp)) continue;
      if (!seen.has(e.filepath)) seen.set(e.filepath, e);
    }
    return Array.from(seen.values()).slice(0, 10);
  });

  const filesTodayCount = $derived(filesToday.length);

  const eventsTodayCount = $derived(events.filter(e => isToday(e.timestamp)).length);

  // ── Loaders ────────────────────────────────────────────────────
  async function loadCosts() {
    try {
      const data = await api.get(`/costs/summary?start=${encodeURIComponent(todayStartIso())}`);
      costs = data;
    } catch (err) {
      // Silent — keep prior value rather than blanking the ticker.
      if (err?.name !== 'AbortError') {
        console.warn('costs/summary failed:', err);
      }
    }
  }

  async function loadActivity() {
    try {
      const data = await api.get('/session-activity?limit=12');
      activity = Array.isArray(data?.entries) ? data.entries : [];
    } catch (err) {
      if (err?.name !== 'AbortError') console.warn('session-activity failed:', err);
    }
  }

  async function loadEvents() {
    try {
      const data = await api.get('/events/recent?limit=200');
      events = Array.isArray(data) ? data : [];
    } catch (err) {
      if (err?.name !== 'AbortError') console.warn('events/recent failed:', err);
    }
  }

  async function loadNarrative() {
    try {
      const data = await api.get('/today/narrative');
      narrative = data;
    } catch (err) {
      if (err?.name !== 'AbortError') console.warn('today/narrative failed:', err);
    }
  }

  // ── Narrative beats ────────────────────────────────────────────
  // Translate aggregated facts into second-person sentences. The
  // tone: specific, encouraging, never canned. Each beat is only
  // emitted when the data actually supports it — silence beats noise.
  /** @param {number} n @param {string} singular @param {string} plural */
  function plural(n, singular, plural) { return n === 1 ? singular : plural; }

  /** @param {number} seconds */
  function fmtDuration(seconds) {
    if (!seconds || seconds < 60) return null;
    const m = Math.floor(seconds / 60);
    if (m < 60) return `${m} ${plural(m, 'minute', 'minutes')}`;
    const h = Math.floor(m / 60);
    const remM = m % 60;
    if (remM === 0) return `${h} ${plural(h, 'hour', 'hours')}`;
    return `${h}h ${remM}m`;
  }

  /**
   * @typedef {{glyph:string, tone:'accent'|'success'|'info'|'warning'|'muted', text:string}} Beat
   */
  /** @returns {Beat[]} */
  function deriveBeats() {
    /** @type {Beat[]} */
    const beats = [];
    if (!narrative) return beats;
    const { today, week, returning } = narrative;

    // 1. Returning to a project — high relational value, leads.
    for (const r of returning.slice(0, 1)) {
      const days = r.days_since_last_event;
      const phrase = days >= 7
        ? `${days} ${plural(days, 'day', 'days')} away`
        : `${days} ${plural(days, 'day', 'days')}`;
      beats.push({
        glyph: '↩',
        tone: 'warning',
        text: `Back on ${r.project} after ${phrase} — welcome back.`
      });
    }

    // 2. Today's center of gravity.
    if (today.projects.length === 1 && today.events > 0) {
      const p = today.projects[0];
      beats.push({
        glyph: '◆',
        tone: 'accent',
        text: `Today you've been heads-down on ${p.project} — ${p.files} ${plural(p.files, 'file', 'files')}, ${p.events} ${plural(p.events, 'event', 'events')}.`
      });
    } else if (today.projects.length >= 2) {
      const [a, b] = today.projects;
      // If one clearly dominates (≥70%), call it out as focus.
      const dominance = a.events / (a.events + b.events);
      if (dominance >= 0.7) {
        beats.push({
          glyph: '◆',
          tone: 'accent',
          text: `Today you've been heads-down on ${a.project} (${a.events} of ${today.events} events).`
        });
      } else {
        beats.push({
          glyph: '◆',
          tone: 'accent',
          text: `Today you've moved between ${a.project} (${a.events}) and ${b.project} (${b.events}).`
        });
      }
    }

    // 3. The week's leader, when there's enough data to mean anything.
    if (week.top_project && week.events >= 50 && week.projects.length >= 2) {
      const lead = week.projects[0];
      const share = Math.round((lead.events / week.events) * 100);
      if (share >= 40) {
        beats.push({
          glyph: '★',
          tone: 'success',
          text: `This week, ${lead.project} has been your main focus — ${share}% of your activity, across ${lead.days_active} ${plural(lead.days_active, 'day', 'days')}.`
        });
      } else if (week.projects.length >= 3) {
        beats.push({
          glyph: '★',
          tone: 'info',
          text: `This week you've spread across ${week.projects.length} projects, ${week.days_active} ${plural(week.days_active, 'day', 'days')} active.`
        });
      }
    }

    // 4. Longest session today (only worth noting if substantial).
    const dur = fmtDuration(today.longest_session_seconds);
    if (dur && today.longest_session_seconds >= 30 * 60) {
      beats.push({
        glyph: '◐',
        tone: 'info',
        text: `Longest stretch today: ${dur}.`
      });
    }

    // 5. First-day fallback when nothing else fired and there's no data.
    if (beats.length === 0 && today.events === 0 && week.events === 0) {
      beats.push({
        glyph: '✶',
        tone: 'muted',
        text: 'No activity yet — your first session with Raven watching will fill this in.'
      });
    }

    return beats.slice(0, 4);
  }

  const beats = $derived(deriveBeats());

  /** @param {Beat['tone']} t */
  function beatToneClass(t) {
    switch (t) {
      case 'accent': return 'text-accent';
      case 'success': return 'text-success';
      case 'info': return 'text-info';
      case 'warning': return 'text-warning';
      default: return 'text-muted';
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

  /** @param {number} ms */
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // The insights service returns a multi-paragraph markdown summary; the Today
  // hero wants a single sentence. Strip headers + bold-prefix labels and grab
  // the first real sentence.
  /** @param {string|null|undefined} content */
  function extractLeadSentence(content) {
    if (!content) return '';
    const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
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
      const latest = await api.get('/insights/latest?type=session_summary', { silent: true }).catch(() => null);
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
        const poll = await api.get('/insights/latest?type=session_summary', { silent: true }).catch(() => null);
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
    Promise.allSettled([loadCosts(), loadActivity(), loadEvents(), loadNarrative()]).then(results => {
      const firstFail = results.find(r => r.status === 'rejected');
      if (firstFail && firstFail.reason?.name !== 'AbortError') {
        loadError = firstFail.reason?.message || 'Failed to load Today data';
      }
    });

    // Fire the LLM summary in parallel — it's slow and not blocking.
    loadSummary();

    // Cost ticker: refresh every 5s so the dollar number visibly moves.
    costTicker = setInterval(loadCosts, 5000);

    websocketConnected = websocketService.isConnected();
    const updateStatus = () => { websocketConnected = websocketService.isConnected(); };
    websocketService.on('connect', updateStatus);
    websocketService.on('disconnect', updateStatus);

    return () => {
      websocketService.off('connect', updateStatus);
      websocketService.off('disconnect', updateStatus);
    };
  });

  onDestroy(() => {
    if (costTicker) clearInterval(costTicker);
    abort();
  });
</script>

<PageLayout>
  <div class="space-y-10">

    <!-- Status bar -->
    <div class="flex items-center justify-between text-xs font-mono text-muted border-b border-border pb-2">
      <div class="flex items-center gap-2">
        <span class="text-accent font-semibold">RAVEN.TODAY</span>
        <span aria-hidden="true">::</span>
        <span class="uppercase tracking-wide">{todayLabel}</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="w-1.5 h-1.5 rounded-full {websocketConnected ? 'bg-success animate-pulse' : 'bg-warning'}"></span>
        <span class="uppercase tracking-wide {websocketConnected ? 'text-success' : 'text-warning'}">
          {websocketConnected ? 'Live' : 'Disconnected'}
        </span>
      </div>
    </div>

    <!-- Hero — narrated summary -->
    <section class="flex flex-col lg:flex-row gap-8">
      <div class="flex-1 min-w-0 max-w-[48rem]">
        <PageHeader
          title="Today"
          description="A quick read of what's happened so far. Cost, files Claude touched, and the moments worth noticing."
        />

        <!-- Narrated sentence -->
        <div class="mt-5">
          {#if summaryLoading && !summary}
            <div class="space-y-2 animate-pulse" aria-label="Generating summary">
              <div class="h-4 bg-surface-2 rounded w-3/4"></div>
              <div class="h-4 bg-surface-2 rounded w-1/2"></div>
            </div>
          {:else if summary}
            <p class="text-lg text-body font-sans leading-relaxed">
              <span aria-hidden="true" class="text-accent mr-2">“</span>{summary}<span aria-hidden="true" class="text-accent ml-1">”</span>
            </p>
            <button
              type="button"
              onclick={loadSummary}
              disabled={summaryLoading}
              class="mt-2 text-xs font-mono uppercase tracking-wide text-muted hover:text-accent transition-colors disabled:opacity-50"
            >
              {summaryLoading ? 'Refreshing…' : '↻ Re-narrate'}
            </button>
          {:else if summaryDisabled}
            <p class="text-sm text-muted font-sans leading-relaxed italic">
              Local-LLM summaries are off. Restart Raven without
              <code class="font-mono text-body">RAVEN_INSIGHTS_DISABLED=1</code>
              to see a one-sentence narrative of today.
            </p>
          {:else if summaryError}
            <p class="text-sm text-warning font-sans leading-relaxed">
              Couldn't generate a summary: {summaryError}
              <button
                type="button"
                onclick={loadSummary}
                class="ml-2 underline hover:text-accent transition-colors"
              >try again</button>
            </p>
          {:else}
            <p class="text-sm text-muted font-sans italic">No summary yet — check back when there's been more activity.</p>
          {/if}
        </div>

        {#if loadError}
          <div class="mt-4 bg-error/10 border border-error/30 text-error rounded-lg p-3 text-sm">
            {loadError}
          </div>
        {/if}
      </div>

      <!-- Aside: jump links -->
      <aside class="lg:w-72 lg:flex-shrink-0">
        <div class="bg-surface border border-border rounded-lg p-4">
          <div class="text-xs font-mono uppercase tracking-wide text-muted mb-3">Want more detail?</div>
          <ul class="space-y-2 text-sm">
            <li>
              <button type="button" onclick={() => navigate('/overview')} class="text-accent hover:underline">→ Full dashboard</button>
            </li>
            <li>
              <button type="button" onclick={() => navigate('/analysis/costs')} class="text-accent hover:underline">→ Token usage breakdown</button>
            </li>
            <li>
              <button type="button" onclick={() => navigate('/live')} class="text-accent hover:underline">→ Live code changes</button>
            </li>
            <li>
              <button type="button" onclick={() => navigate('/insights')} class="text-accent hover:underline">→ All insights</button>
            </li>
          </ul>
          <div class="mt-3 pt-3 border-t border-border text-[11px] font-mono text-muted leading-relaxed">
            <span class="text-success">●</span> Local-first · nothing leaves your machine
          </div>
        </div>
      </aside>
    </section>

    <!-- Narrative beats — second-person, data-driven sentences. -->
    {#if beats.length > 0}
      <section aria-label="Narrative beats">
        <ul class="space-y-2">
          {#each beats as beat (beat.text)}
            <li class="flex items-start gap-3 bg-surface/60 border border-border rounded-lg px-4 py-3">
              <span class="text-lg leading-none {beatToneClass(beat.tone)} flex-shrink-0 select-none" aria-hidden="true">{beat.glyph}</span>
              <span class="text-sm text-body font-sans leading-relaxed">{beat.text}</span>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <!-- Big numbers strip -->
    <section class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <!-- Cost so far -->
      <div class="bg-surface border border-border rounded-lg p-5">
        <div class="text-xs font-mono uppercase tracking-wide text-muted mb-2">Spent so far today</div>
        <div class="text-4xl font-bold text-heading tracking-[-0.025em] tabular-nums transition-all">
          {fmtUsd(costs?.total_cost_usd)}
        </div>
        <div class="mt-2 text-xs font-mono text-muted">
          {fmtInt(costs?.total_requests)} requests ·
          {fmtTokens(costs?.total_input_tokens)}↑ /
          {fmtTokens(costs?.total_output_tokens)}↓
        </div>
      </div>

      <!-- Files touched -->
      <div class="bg-surface border border-border rounded-lg p-5">
        <div class="text-xs font-mono uppercase tracking-wide text-muted mb-2">Files Claude touched</div>
        <div class="text-4xl font-bold text-heading tracking-[-0.025em] tabular-nums">
          {filesTodayCount}
        </div>
        <div class="mt-2 text-xs font-mono text-muted">
          {fmtInt(eventsTodayCount)} file events today
        </div>
      </div>

      <!-- Cache savings (educational moment for new users) -->
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

    <!-- Two columns: activity + files -->
    <section class="grid grid-cols-1 lg:grid-cols-2 gap-6">

      <!-- Recent activity -->
      <PageSection title="Recent activity" meta={activity.length ? `last ${Math.min(activity.length, 7)}` : ''}>
        <div class="bg-surface border border-border rounded-lg p-1">
          {#if activity.length === 0}
            <div class="p-4 text-sm text-muted italic">
              No recent activity. Start a Claude Code session and a green dot will light up here.
            </div>
          {:else}
            <ul class="divide-y divide-border">
              {#each activity.slice(0, 7) as entry, i (entry.timestamp + i)}
                {@const desc = describeActivity(entry)}
                <li class="p-3 flex gap-3 items-baseline">
                  <span class="text-[11px] font-mono text-muted w-16 flex-shrink-0">{relativeTime(entry.timestamp)}</span>
                  <div class="flex-1 min-w-0">
                    <div class="text-sm">
                      <span class="font-semibold {activityToneClass(entry.type)}">{desc.lead}</span>
                      <span class="text-body"> {desc.verb}</span>
                    </div>
                    {#if desc.detail}
                      <div class="text-xs text-muted font-sans mt-0.5 truncate">{desc.detail}</div>
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
        <div class="bg-surface border border-border rounded-lg p-1">
          {#if filesToday.length === 0}
            <div class="p-4 text-sm text-muted italic">
              No file edits yet today. As Claude edits files, they'll show up here.
            </div>
          {:else}
            <ul class="divide-y divide-border">
              {#each filesToday as e (e.id)}
                <li class="p-3 flex gap-3 items-baseline">
                  <span class="text-[11px] font-mono text-muted w-16 flex-shrink-0">{relativeTime(e.timestamp)}</span>
                  <div class="flex-1 min-w-0">
                    <div class="font-mono text-sm text-body truncate" title={e.filepath}>{shortPath(e.filepath)}</div>
                    {#if e.project_name}
                      <div class="text-xs text-muted font-mono mt-0.5">{e.project_name}</div>
                    {/if}
                  </div>
                  <span class="inline-block text-[10px] font-mono font-bold px-1.5 py-0.5 rounded {changeBadgeClass(e.change_type)} flex-shrink-0">
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
