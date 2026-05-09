<script>
  /**
   * Roadmap — phased plan toward public launch and beyond.
   * Hand-curated. Edit this file as the project evolves.
   *
   * Phases reflect priority order:
   *   00 — what blocks public release
   *   01 — make AI felt (presence/feel design)
   *   02 — recaps & reflection (the retention loop)
   *   03 — power-user depth (carried from prior roadmap)
   *   04 — open questions
   *   05 — recently shipped
   *
   * Within each phase, items are listed in priority order (top = highest).
   */
  import { PageLayout, PageHeader } from '../components/layout/index.js';

  // 00 // Public Launch — must ship before going public.
  // Theme: zero-friction install + a first-run experience that lands new
  // Claude Code users on something they immediately understand.
  const publicLaunch = [
    {
      title: 'Landing screencast',
      detail:
        'Record a 10–15s animated GIF or MP4 of the Today view in motion: cost ticker climbing, narrative beats rendering, heartbeat breathing. Drop it at the top of the README under the tagline. README copy + Pages table + What-you-get list are already refreshed; the screencast is the last thing standing between Raven and a public-ready GitHub page.',
      size: 'S'
    }
  ];

  // 01 // Presence & Feel — make AI felt, not just observed.
  // Theme: turn invisible inference into a sensory companion. Pulse
  // already gestures here; this phase invests in it deeply.
  const presence = [
    // Phase 01 cleared in May 2026 — see Recently Shipped.
  ];

  // 02 // Reflect & Reward — the retention loop.
  // Theme: reflect the user's growth back to them. Spotify Wrapped /
  // Strava / GitHub year-in-review pattern, applied to AI coding.
  // Milestones first because they land at the moment of decision
  // (week-1, day-30) when retention is most fragile.
  const reflect = [
    // Phase 02 cleared in May 2026 — see Recently Shipped.
  ];

  // 03 // Power-User Depth — for after public launch.
  // Theme: the existing roadmap items, all of which serve the
  // power-user audience that Raven was first built for. They stay
  // important; they just stop blocking the launch.
  const powerUser = [
    // Multi-machine 2–4 demoted to Open Questions until a real user asks for it.
  ];

  // 04 // Open Questions — bigger calls that need a design pass.
  const open = [
    {
      title: 'Multi-machine roll-up — finish Phases 2–4?',
      note: 'Phase 1 shipped dormant (host_id + /api/sync/export gated on .raven/peers.json). Remaining work would be aggregator mode, a Peers sub-tab with per-host narrative beats, and optional push notifications. Parked until a real user asks for it — building a week-long initiative for ~0 current users is gold-plating. The capability is dormant by default, so cost of waiting is zero.',
      added: '2026-05'
    }
  ];

  const recentlyShipped = [
    // ── May 2026 — Phase 00 closeout ───────────────────────────
    {
      label: 'Daily tally beat on Today',
      detail:
        "Resolves the 'recap cadence' open question. Today view now opens with a one-line summary — \"Today you've spent $X on {project} across N requests\" — fired only when activity + cost data both load, no modal/notification. Weekly digest + milestone modals already cover the longer-cadence reflection; this fills the daily slot at the lowest possible fidelity."
    },
    {
      label: 'README rewrite for public launch',
      detail:
        'Quick-start now leads with `npx raven-monitor` (zero-friction try-it path); git-clone demoted to "from source." What-you-get refreshed for May ships: persistent agent heartbeat, inline diff risk scoring, anomaly detection, milestone/weekly/Wrapped reflection loops, plugin sandbox. Pages table adds Wrapped, About, Roadmap, plus plugins/projects under System. CODE_OF_CONDUCT linked from Contributing.'
    },
    {
      label: 'Pre-launch polish sweep',
      detail:
        'Playwright across 20 routes × 3 viewports surfaced 5 mobile horizontal overflows (/history toolbar, /system terminal-table wrappers missing overflow-x-auto, /system/projects per-row controls, /system/plugins right-side actions) plus a runtime ReferenceError on /history (dead `_recentActivity` loader writing to a renamed state). Re-sweep clean except a 3px /design-system overflow (negligible). Browsable at every breakpoint.'
    },
    {
      label: 'CODE_OF_CONDUCT.md',
      detail:
        'Standard Contributor Covenant 2.1, fetched verbatim from EthicalSource. Contact email set, linked from CONTRIBUTING + README.'
    },
    // ── May 2026 — Phase 00 launch-blocker batch ───────────────
    {
      label: 'One-command install (npx raven-monitor)',
      detail:
        'Single-port mode now works end-to-end: paths resolve dynamically via a new utils/paths.ts (dev mode walks up for .raven/, npx mode defaults to ~/.raven and watches cwd), root package.json hoists backend deps and declares files, the launcher drops the npm-install hack, and `prepublishOnly` runs build:all. Smoke-tested via npm pack into a clean install dir. Bonus fix: gitMonitor was pointed at the wrong dir and silently failing.'
    },
    {
      label: 'Local-first trust messaging',
      detail:
        'Footer trust line now visible at every breakpoint with an animated success dot, and a "Local-first · nothing leaves your machine" pill renders above the Today PageHeader so the privacy story is the first thing a new user reads.'
    },
    {
      label: 'Teaching empty-states across high-traffic pages',
      detail:
        'Replaced cold "No data" copy with action-oriented text on CompactActiveModel, CombinedLlmCard, ActiveModelCard, LibraryCard, ModelsPage, OverviewPage (Live activity / Agents / Latest Change), and AgentMonitoring. Each one names the next command (`ollama run llama3`, `claude`) so a new user knows exactly what action makes the panel light up.'
    },
    {
      label: 'Multi-machine roll-up — Phase 1',
      detail:
        'host_id auto-written to .raven/host.json on first start (host_name overridable via RAVEN_HOST_NAME). New /api/sync/export streams NDJSON of events / agent_events / token_usage / api_latency keyed by row id, with Bearer auth against .raven/peers.json (5s cache). Dormant by default — returns 503 until peers are configured. Identity also surfaces on /api/health and /api/sync/identity.'
    },
    // ── May 2026 batch — Phase 01, 02, and most of 03 ──────────
    {
      label: 'Year-end Raven Wrapped',
      detail:
        '/wrapped renders a Spotify-Wrapped-style scrollable card stack (top model, top project, total spend, longest streak, biggest day, peak hour). Backend wrapped-service aggregates a 12-month window in a single query.'
    },
    {
      label: 'Auto-derived decisions from git history',
      detail:
        'Backend mines git log for BREAKING / Decision: / feat(arch) / substantial refactor commits and surfaces them on the About page alongside the hand-curated DECISIONS.md trail.'
    },
    {
      label: 'Milestone recap modals',
      detail:
        'First session, week-one, month-one, 100th and 1,000th file event, anniversaries, per-project month-one. One modal at a time, dismissed permanently per id via localStorage.'
    },
    {
      label: 'Persistent agent heartbeat',
      detail:
        'Always-visible dot in the header. Sharp tick when executing tools, slow breath while thinking, gentle pulse when active, near-still when idle, fully still when offline. Picks the most-active agent from /api/process-activity.'
    },
    {
      label: 'Per-agent baselining + anomaly scoring',
      detail:
        '7-day rolling p50/p95 per model for latency, cost, output_tokens. Anomaly endpoint flags any model whose 30-min stats are ≥ 2× baseline. AnomalyBanner on Today renders only when something is drifting.'
    },
    {
      label: 'Plugin surface for custom triggers',
      detail:
        'User-authored JS rules in .raven/plugins/*.js, loaded into a node:vm sandbox with no require / fs / process / network. raven.on(event), raven.trigger(name, payload), 50ms time budget per handler. System → Plugins page lists, enables/disables, and shows source.'
    },
    {
      label: 'Inline diff scoring & risk annotations',
      detail:
        'New diff_annotations table + service runs hardcoded-credential / token-prefix / eval / --no-verify / .env-edit / PEM-key rules over each diff. Diff viewer renders gutter pills + hover tooltips + file-level severity badge. Code Changes list gains per-row risk badge.'
    },
    {
      label: 'Weekly digest with Monday modal',
      detail:
        'Mon-anchored ISO-week aggregation finds a lead "moment" (returning project / streak / focus / cost surge / top project) and 3–5 supporting beats. Modal auto-shows on Monday or after a week-quiet streak. Snooze + dismiss persisted in localStorage.'
    },
    {
      label: '"You\'ve come a long way" before/after panel',
      detail:
        "Insights page surfaces the user's first 7 days vs the most-recent 7 days side-by-side, with deltas and ratios. Renders too-early state if Raven's been running < 14 days."
    },
    {
      label: 'Live token stream paired with cost ticker',
      detail:
        'Today page now shows each inference resolving in real time beside the dollar number. Color-coded model badges, log-scaled output bursts, dollar amount per inference. Subscribes to the existing token-usage WebSocket event.'
    },
    {
      label: 'Context window vessel',
      detail:
        "Per-session context-size bar in the Today aside, polling /api/context/current. Color shifts ok → warm → tight → overflow as token usage approaches the model's configured context limit."
    },
    {
      label: 'Per-state activity rhythms',
      detail:
        'Heartbeat dot on agent rows now has a different cadence per state: slow breath while thinking, sharp tick when executing, very-low-amplitude breath when idle.'
    },
    {
      label: 'Decisions audit trail in DECISIONS.md',
      detail:
        'Backend service parses DECISIONS.md and exposes /api/decisions; About page falls back to the static arrays when the endpoint is unreachable. The audit trail is now editable without touching Svelte.'
    },
    {
      label: 'Today narrative beats + cost hero + Today landing',
      detail:
        "/today is the new root landing — local-LLM narrated lead sentence, second-person beats from /api/today/narrative, full-width cost hero with hourly sparkline, plain-English activity, files Claude touched today. Header strip rescoped to today's activity. Settings moved to a footer gear."
    },
    {
      label: 'OSS hygiene — README rewrite + CONTRIBUTING.md',
      detail:
        'README leads with the value prop, install steps, and a "what you get" list aligned with what shipped. CONTRIBUTING covers dev setup, test commands, conventional-commit convention, PR scope. License remains MIT.'
    },
    {
      label: 'Trust messaging in footer',
      detail:
        '"● Local-first · nothing leaves your machine" line in the global Footer between version and session ID. Visible on every page load.'
    },
    {
      label: 'Retention manual run + docs',
      detail:
        'POST /api/storage/retention/run fires the cleanup on demand and returns per-table row counts. RETENTION_EVENT_DAYS / RETENTION_METRICS_DAYS / RETENTION_SNAPSHOT_DAYS env vars documented in README.'
    },
    {
      label: 'Empty-states + text-xs polish sweep',
      detail:
        'Cold "No data" / "Try adjusting filters" rewritten as teaching copy on SystemErrors / ActivitySearch / ActivityTimeline / AnalysisTriggers. Body-copy text-xs bumped to text-sm where readability matters (TodayPage activity detail, AboutPage decision lists, DesignSystemPage primitive descriptions, SystemPage tool-catalog).'
    },
    {
      label: 'Tier 4 endpoint suppression retired',
      detail:
        'apiClient stopped guessing 404 suppression from path prefixes (/drift/, /productivity/, /gamification/…). Replaced with a `silent: true` opt-in flag for callers that render their own graceful empty state.'
    },

    // ── Earlier work ──────────────────────────────────────────
    {
      label: 'API agents in Active Models card',
      detail:
        'Claude Code (and Codex when present) now render alongside Ollama models, with brand color, live activity_state from /api/process-activity, network connection count, and the most-recent observed model from /api/api-latency. Card is no longer empty when only API agents are working.'
    },
    {
      label: 'Backend architecture refactor',
      detail:
        'server.ts split 4,282 → 755 lines (routes/ + services/ extraction). db.ts split 1,523 → 441 lines into 15 repositories. Repository pattern enforced via dependency-cruiser.'
    },
    {
      label: 'Route validation + OpenAPI codegen',
      detail:
        'zod boundary validation on 11 routes; openapi-typescript pipeline (npm run openapi:dump + openapi:gen). Frontend consumes via JSDoc-imported types in src/lib/typedApi.js.'
    },
    {
      label: 'Governance tooling in CI',
      detail:
        'Knip (dead-code detection), dependency-cruiser (architectural rules), type-coverage --ignore-catch ratchet. Backend coverage 88.23% → 91.57%.'
    },
    {
      label: 'Frontend component test growth',
      detail:
        '22 test files / 148 tests (was 7/82). ui/ primitives, layout primitives, Header chrome, llm-lab cards. Patterns: vi.hoisted for forward-ref mocks, jsdom getAnimations stub for Svelte transitions.'
    },
    {
      label: 'Post-extraction cleanup',
      detail:
        'Dashboard aggregators moved to dashboard-repository. Prepared statements cached at factory init in errors-, pattern-warnings-, agent-events-, dashboard-repository. routes/metrics.ts standardized on `error instanceof Error` pattern. ESLint guard against db.db.prepare() in routes/.'
    },
    {
      label: '--text-* tokens in @theme',
      detail:
        "Moved from :root into Tailwind v4 @theme. Tailwind utilities (text-sm, text-base) now read raven's scale, so future tweaks cascade automatically."
    },
    {
      label: 'Container.svelte cleanup',
      detail:
        'Removed the unused max-w-* container component; full-width is the default everywhere.'
    },
    {
      label: 'System page port',
      detail:
        'Live data model, API routes, hardware capacity, installed Ollama models, provisioning roadmap.'
    },
    {
      label: 'About page port',
      detail:
        'Hero, overview, operation steps, telemetry, decisions audit trail, principles, manifest.'
    },
    {
      label: 'Design page additions',
      detail: 'Motion tokens, form patterns, tables, callouts.'
    },
    {
      label: 'Width + typography pass',
      detail:
        "All content pages now full-width (max-w-none); typography tokens bumped to ant's scale (body 14px, etc.)."
    },
    {
      label: 'Footer cleanup',
      detail: 'Tech Stack → System, Design System → Design, GitHub link replaced with Octocat SVG.'
    },
    {
      label: 'start.sh hang fix',
      detail:
        'Cache-warming step now bounds each curl with --max-time 5; can no longer hang on a stuck endpoint.'
    },
    {
      label: 'Backend /api/system/* family',
      detail: 'introspection, tables, routes, hardware, models — all live, no background polling.'
    }
  ];

  /** @param {string} size */
  function sizeBadgeClass(size) {
    switch (size) {
      case 'XS':
      case 'S':
        return 'bg-success/15 text-success';
      case 'M':
        return 'bg-info/15 text-info';
      case 'L':
      case 'XL':
        return 'bg-warning/15 text-warning';
      default:
        return 'bg-surface-2 text-muted';
    }
  }

  // Phase header rendering — kept inline (not a component) so the
  // page reads like a single document.
  const phases = [
    {
      num: '00',
      title: 'Public Launch',
      tone: 'accent',
      label: 'Blocks public release',
      blurb:
        'What must ship before raven goes out the door. Theme: zero-friction install + a first-run experience a brand-new Claude Code user immediately understands.',
      items: publicLaunch
    },
    {
      num: '01',
      title: 'Presence & Feel',
      tone: 'info',
      label: 'Make AI felt',
      blurb:
        'Turn invisible inference into a sensory companion. New users develop intuition by feeling the weight of what AI does, not by reading docs about it.',
      items: presence
    },
    {
      num: '02',
      title: 'Reflect & Reward',
      tone: 'success',
      label: 'The retention loop',
      blurb:
        "Reflect the user's growth back to them. Milestones land at exactly the moments retention is fragile (week-1, day-30, anniversaries). The killer feature for democratization.",
      items: reflect
    },
    {
      num: '03',
      title: 'Power-User Depth',
      tone: 'warning',
      label: 'Post-launch',
      blurb:
        'Carried from the previous roadmap. The audience Raven was first built for stays important — these items just stop blocking the public launch.',
      items: powerUser
    }
  ];

  function toneClass(tone) {
    switch (tone) {
      case 'accent':
        return 'text-accent';
      case 'info':
        return 'text-info';
      case 'success':
        return 'text-success';
      case 'warning':
        return 'text-warning';
      default:
        return 'text-muted';
    }
  }

  const totalQueued = publicLaunch.length + presence.length + reflect.length + powerUser.length;

  // Hide phases whose items list is empty — once shipped, the section header
  // is just visual noise. Items move to Recently Shipped instead.
  const activePhases = phases.filter(p => p.items.length > 0);
</script>

<PageLayout>
  <div class="space-y-10">
    <!-- Status bar -->
    <div
      class="flex items-center justify-between text-xs font-mono text-muted border-b border-border pb-2"
    >
      <div class="flex items-center gap-2">
        <span class="text-accent font-semibold">RAVEN.ROADMAP</span>
        <span>::</span>
        <span class="uppercase tracking-wide"
          >Phased toward public launch · Edit RoadmapPage.svelte</span
        >
      </div>
      <div class="flex items-center gap-2">
        <span class="uppercase tracking-wide">{totalQueued} queued · {open.length} open</span>
      </div>
    </div>

    <!-- Hero — two-column: prose main + size legend aside -->
    <div class="flex flex-col lg:flex-row gap-8">
      <div class="flex-1 min-w-0 max-w-[48rem]">
        <PageHeader
          title="Roadmap"
          description="Phased toward a public launch focused on new Claude Code users. Each section is a phase of work; sections only render while they have items left. Sizing is t-shirts (XS–XL); priority within a phase is top-down."
        />
      </div>

      <aside class="lg:w-72 lg:flex-shrink-0">
        <div class="bg-surface border border-border rounded-lg p-4">
          <div class="text-xs font-mono uppercase tracking-wide text-muted mb-3">Size legend</div>
          <dl class="space-y-1.5 text-sm font-mono">
            {#each [{ k: 'XS', v: 'typo · copy tweak' }, { k: 'S', v: '~1 day refactor' }, { k: 'M', v: '2–3 day feature' }, { k: 'L', v: 'week-long initiative' }, { k: 'XL', v: '2+ weeks · multi-phase' }] as row (row.k)}
              <div class="flex items-baseline gap-3">
                <dt class="text-accent w-7 flex-shrink-0">{row.k}</dt>
                <dd class="text-muted">{row.v}</dd>
              </div>
            {/each}
          </dl>
          <div
            class="mt-3 pt-3 border-t border-border text-[11px] font-mono text-muted leading-relaxed"
          >
            <span class="text-text">{totalQueued}</span>
            {totalQueued === 1 ? 'item' : 'items'} queued ·
            <span class="text-text">{publicLaunch.length}</span>
            {publicLaunch.length === 1 ? 'blocks' : 'block'} public launch
          </div>
        </div>
      </aside>
    </div>

    <!-- Phases 00 → 03 -->
    {#each activePhases as phase (phase.num)}
      <section>
        <div
          class="text-xs font-mono text-muted uppercase tracking-widest mb-3 flex items-center gap-3"
        >
          <span>{phase.num} // {phase.title}</span>
          <span class="flex-1 border-t border-dashed border-border"></span>
          <span class="{toneClass(phase.tone)} normal-case">{phase.label}</span>
        </div>
        <p class="text-sm text-body font-sans leading-relaxed mb-3 max-w-[60rem]">{phase.blurb}</p>
        <div class="space-y-3">
          {#each phase.items as item, i (item.title)}
            <div class="bg-surface border border-border rounded-lg p-4">
              <div class="flex items-baseline justify-between gap-3 mb-2">
                <h3 class="text-base font-semibold text-heading">
                  <span class="text-muted font-mono mr-2">{String(i + 1).padStart(2, '0')}</span>
                  {item.title}
                </h3>
                <span
                  class="inline-block text-xs font-mono font-bold px-2 py-0.5 rounded {sizeBadgeClass(
                    item.size
                  )}">{item.size}</span
                >
              </div>
              <p class="text-sm text-body font-sans leading-relaxed">{item.detail}</p>
              {#if item.blocking}
                <div class="text-xs font-mono text-warning mt-2 flex items-baseline gap-2">
                  <span class="font-bold uppercase tracking-wide">Blocked by</span>
                  <span class="font-sans text-muted">{item.blocking}</span>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </section>
    {/each}

    <!-- 04 // Open Questions -->
    <section>
      <div
        class="text-xs font-mono text-muted uppercase tracking-widest mb-3 flex items-center gap-3"
      >
        <span>04 // Open Questions</span>
        <span class="flex-1 border-t border-dashed border-border"></span>
        <span class="text-warning normal-case">Parked</span>
      </div>
      <div class="space-y-3">
        {#each open as q (q.title)}
          <div class="bg-surface border border-dashed border-border rounded-lg p-4">
            <h3 class="text-base font-semibold text-heading mb-2">
              {q.title}
              {#if q.added}
                <span class="text-[10px] font-mono text-muted ml-2 align-middle"
                  >added {q.added}</span
                >
              {/if}
            </h3>
            <p class="text-sm text-body font-sans leading-relaxed">{q.note}</p>
          </div>
        {/each}
      </div>
    </section>

    <!-- 05 // Recently Shipped -->
    <section>
      <div
        class="text-xs font-mono text-muted uppercase tracking-widest mb-3 flex items-center gap-3"
      >
        <span>05 // Recently Shipped</span>
        <span class="flex-1 border-t border-dashed border-border"></span>
        <span class="text-success normal-case">Done</span>
      </div>
      <div class="bg-surface border border-border rounded-lg p-4">
        <ul class="space-y-2.5">
          {#each recentlyShipped as item (item.label)}
            <li class="flex gap-3 items-baseline">
              <span class="text-success flex-shrink-0">✓</span>
              <div class="flex-1">
                <span class="text-sm font-semibold text-heading">{item.label}</span>
                <span class="text-sm text-body font-sans"> — {item.detail}</span>
              </div>
            </li>
          {/each}
        </ul>
      </div>
    </section>
  </div>
</PageLayout>
