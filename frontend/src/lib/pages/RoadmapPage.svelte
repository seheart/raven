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
      title: 'One-command install',
      detail:
        'Eliminate git clone + npm install. Ship as `npx raven`, a Homebrew formula, or a single static binary. Public adoption dies on multi-step setup. Whichever path is shortest wins. Auto-detect Claude Code on first run; no project registration required.',
      size: 'XL'
    },
    {
      title: 'First-run "Today" landing view',
      detail:
        "New users shouldn't land on the power dashboard. Build a lightweight Today page: cost so far, recent activity in plain English, files Claude touched, and a single sentence summarizing the session. Push Overview / Active Models / Vitals behind a nav tab. The current Overview becomes the second click, not the first.",
      size: 'L'
    },
    {
      title: 'Prominent live cost ticker',
      detail:
        "The single most educational visualization for someone new to AI. Big number, tickling upward in real time as inferences resolve through /api/api-latency. Hover for breakdown by model. Cost anxiety is the #1 felt pain — answer it before they ask.",
      size: 'M'
    },
    {
      title: 'README + landing screencast',
      detail:
        'GitHub is the first-impression surface. Needs a sub-3-second value prop, an animated GIF or screencast of the Today view + heartbeat, and a one-line install. The README is the actual product page until raven.dev exists.',
      size: 'M'
    },
    {
      title: 'Trust messaging: local-first, nothing leaves your machine',
      detail:
        'Persistent banner or footer line that earns trust on first launch. The unique advantage over Langfuse / Helicone / etc. is local-first — say it loud. Privacy-conscious developers are exactly the audience most likely to evangelize.',
      size: 'XS'
    },
    {
      title: 'Onboarding empty-states that teach',
      detail:
        "Every empty card should say more than 'No data.' Use empty states to translate jargon: 'No models in VRAM. Run `ollama run llama3` and a green dot will appear here.' Tooltips that explain VRAM / tokens / context. Treat the UI as a tour.",
      size: 'M'
    },
    {
      title: 'OSS hygiene: LICENSE + CONTRIBUTING + CODE_OF_CONDUCT',
      detail:
        'Pick a license (MIT or Apache 2.0 are the safe defaults). Write a short CONTRIBUTING.md pointing at start.sh + the test commands. CODE_OF_CONDUCT boilerplate. None of this is glamorous; all of it is a yellow flag if missing on launch day.',
      size: 'S'
    },
    {
      title: 'Pre-launch polish sweep',
      detail:
        "Carry-over from the prior roadmap's full-page audit + text-xs cleanup. Walk every page at full / half / mobile widths, fix overflow, fix any text-xs body copy still misused. Anything visibly broken on the demo screencast must die first.",
      size: 'M'
    }
  ];

  // 01 // Presence & Feel — make AI felt, not just observed.
  // Theme: turn invisible inference into a sensory companion. Pulse
  // already gestures here; this phase invests in it deeply.
  const presence = [
    {
      title: 'Token stream + cost ticker, paired',
      detail:
        "Watch tokens render in real time, with the dollar number ticking up beside them. Two visualizations next to each other teach what a token is and what it costs in 30 seconds, no docs needed. This is the single most educational moment in the entire app.",
      size: 'L'
    },
    {
      title: 'Context window vessel',
      detail:
        "A bar (or literal vessel shape) that fills as the conversation grows. Color shifts as it nears the model's limit. New users have zero mental model for 'context' until they see one — this gives them a physical sense of it without a tutorial.",
      size: 'M'
    },
    {
      title: 'Agent heartbeat — persistent presence element',
      detail:
        'One always-visible element that breathes when the agent is idle, pulses when thinking, sharpens when executing tools. Becomes the kind of thing you glance at the way you glance at a candle. The discipline: honest stillness when nothing is happening — never fake motion.',
      size: 'M'
    },
    {
      title: 'Per-state activity rhythms',
      detail:
        "Today the inference pulse is the same regardless of what the agent is doing. Differentiate visually: thinking has a slow breathing rhythm, executing has a sharper tick, file-write flashes the affected file. Build on the existing pulse-overlay infra in ActiveModelCard / NebulaActivity.",
      size: 'S'
    }
  ];

  // 02 // Reflect & Reward — the retention loop.
  // Theme: reflect the user's growth back to them. Spotify Wrapped /
  // Strava / GitHub year-in-review pattern, applied to AI coding.
  // Milestones first because they land at the moment of decision
  // (week-1, day-30) when retention is most fragile.
  const reflect = [
    {
      title: 'Milestone recaps (the emotional core)',
      detail:
        "Auto-show modals at: first commit with Raven running, 7 days, 30 days, 100th commit, project anniversary. 'You've been using Claude Code for 30 days — here's what you built.' Milestones land at the exact moment new users are deciding whether to keep the tool. Catch them there.",
      size: 'M'
    },
    {
      title: 'Local-LLM narrated recap sentence',
      detail:
        "The lead sentence ('Today you killed it on the active-models refactor') is generated by a local Ollama model — qwen2.5-coder is already loaded. Zero data leaves the machine. Local-first + LLM-narrated reflection is uniquely Raven's; no SaaS observability tool can offer it.",
      size: 'M'
    },
    {
      title: '"You\'ve come a long way" before/after comparison',
      detail:
        "Pull the first-ever commit message and the latest side by side. Compare current-week aggregates vs first-week aggregates: 'A month ago this kind of refactor took you 8 prompts. This week it took 3.' That's the real democratization payoff — the user sees themselves growing.",
      size: 'S'
    },
    {
      title: 'Weekly digest',
      detail:
        "Monday morning in-app modal. Lead with the moment (largest commit, biggest debugging win, longest streak), not the metric. Reference the before. Forward gesture: 'You have 2 PRs still open from Tuesday.' Specific beats canned. Daily would be noise; weekly is the sweet spot.",
      size: 'L'
    },
    {
      title: 'Year-end Raven Wrapped',
      detail:
        'December. Designed to be shared. Top model, top project, total spend, longest streak, biggest commit, the arc of the year. The cultural template is Spotify Wrapped — people screenshot and post. Best free distribution Raven will ever get.',
      size: 'L'
    }
  ];

  // 03 // Power-User Depth — for after public launch.
  // Theme: the existing roadmap items, all of which serve the
  // power-user audience that Raven was first built for. They stay
  // important; they just stop blocking the launch.
  const powerUser = [
    {
      title: 'Inline diff scoring & risk annotations',
      detail:
        'Per-file scoring with per-line callouts in the diff viewer. Hooks into the existing pattern detector and self-analysis service. Surfaces risk inline rather than in a separate report.',
      size: 'L'
    },
    {
      title: 'Plugin surface for custom triggers',
      detail:
        'User-authored JS rules with a sandbox. Today triggers are config-only; this opens up arbitrary expressions over the event stream while keeping execution bounded.',
      size: 'M'
    },
    {
      title: 'Per-agent baselining for anomaly scoring',
      detail:
        'Trigger rules cover the obvious cases. Learned thresholds per-agent would catch slow drift (a worker that suddenly takes 3× longer, a model that starts looping). Question: how much state should Raven hold?',
      size: 'M'
    },
    {
      title: 'Multi-machine roll-up',
      detail:
        'Each Raven instance is single-host today. A central aggregator lets you see sessions across hosts in one view. Tradeoff space (push vs pull, schema versioning, auth) needs a design pass before code.',
      size: 'L',
      blocking: 'Needs a design doc before implementation.'
    },
    {
      title: 'Decision audit-trail backend',
      detail:
        'The Decisions section on About is hardcoded today. Build a small DECISIONS.md parser (or a SQLite table) so the audit trail is editable without touching Svelte. Open questions live in the same doc.',
      size: 'S'
    }
  ];

  // 04 // Open Questions — bigger calls that need a design pass.
  const open = [
    {
      title: 'Recap cadence — daily, weekly, or both?',
      note:
        "Daily risks becoming noise: most days don't have a story worth telling. Weekly digests + milestone modals may be enough. But a low-fidelity daily 'one-line summary' on the Today view (no modal, no notification) might thread the needle. Worth a small experiment.",
      added: '2026-05'
    },
    {
      title: 'Where is the line between presence and gimmick?',
      note:
        "Pulse + sparkline + animation everywhere becomes noise. Pick 2–3 channels (heartbeat / cost / context vessel) and invest in them masterfully. Need a UX-discipline rule before the team adds 'one more pulse.' Honest stillness is what gives motion meaning.",
      added: '2026-05'
    },
    {
      title: 'Optional sound cues — opt-in only?',
      note:
        'A single soft tone on inference can be transformative for embodying the AI. Most users will hate it; the right users will love it forever. Off by default, opt-in via Settings. Decide whether this fits Raven\'s aesthetic at all before building.',
      added: '2026-05'
    },
    {
      title: 'Auto-detect projects vs explicit registration?',
      note:
        "For new users, any setup beyond 'open Raven' kills adoption. Auto-detect from Claude Code's CWD on each session. Power users may still want explicit project registration. Default to auto, allow override.",
      added: '2026-05'
    },
    {
      title: 'Should Raven adopt a "terminal" variant for some pages?',
      note:
        "ant uses a phosphor-green terminal aesthetic; raven is modern. We deliberately kept raven's tokens, but Monitoring / System views could justify a denser, more terminal-like skin if it actually helps comprehension. Not a no, not a yes — needs prototyping."
    },
    {
      title: 'Auto-derive decisions from git history?',
      note:
        'The Decisions section on About is hand-curated. We could mine commit messages and PR descriptions for an "auto-decisions" track, but signal quality is unproven. Worth a small experiment before committing.'
    },
    {
      title: 'Tier 4 experimental endpoints — keep or kill?',
      note:
        'apiClient.js suppresses 404s on /drift/, /productivity/, /personality/, /growth/, /integrations/, /gamification/, /easter-eggs, /social/ — these are placeholders for features that haven\'t shipped. Decide which ones are real intent vs. drift.'
    },
    {
      title: 'Retention policy for events table',
      note:
        "Currently unbounded with manual prune. At our event rate that's fine for months, but eventually someone will hit a wall. Hard prune at N days? Soft archive to a parquet file? Up to the user via Settings?"
    }
  ];

  const recentlyShipped = [
    {
      label: 'API agents in Active Models card',
      detail:
        "Claude Code (and Codex when present) now render alongside Ollama models, with brand color, live activity_state from /api/process-activity, network connection count, and the most-recent observed model from /api/api-latency. Card is no longer empty when only API agents are working."
    },
    {
      label: 'Backend architecture refactor',
      detail: 'server.ts split 4,282 → 755 lines (routes/ + services/ extraction). db.ts split 1,523 → 441 lines into 15 repositories. Repository pattern enforced via dependency-cruiser.'
    },
    {
      label: 'Route validation + OpenAPI codegen',
      detail: 'zod boundary validation on 11 routes; openapi-typescript pipeline (npm run openapi:dump + openapi:gen). Frontend consumes via JSDoc-imported types in src/lib/typedApi.js.'
    },
    {
      label: 'Governance tooling in CI',
      detail: 'Knip (dead-code detection), dependency-cruiser (architectural rules), type-coverage --ignore-catch ratchet. Backend coverage 88.23% → 91.57%.'
    },
    {
      label: 'Frontend component test growth',
      detail: '22 test files / 148 tests (was 7/82). ui/ primitives, layout primitives, Header chrome, llm-lab cards. Patterns: vi.hoisted for forward-ref mocks, jsdom getAnimations stub for Svelte transitions.'
    },
    {
      label: 'Post-extraction cleanup',
      detail: 'Dashboard aggregators moved to dashboard-repository. Prepared statements cached at factory init in errors-, pattern-warnings-, agent-events-, dashboard-repository. routes/metrics.ts standardized on `error instanceof Error` pattern. ESLint guard against db.db.prepare() in routes/.'
    },
    {
      label: '--text-* tokens in @theme',
      detail: "Moved from :root into Tailwind v4 @theme. Tailwind utilities (text-sm, text-base) now read raven's scale, so future tweaks cascade automatically."
    },
    {
      label: 'Container.svelte cleanup',
      detail: 'Removed the unused max-w-* container component; full-width is the default everywhere.'
    },
    {
      label: 'System page port',
      detail: 'Live data model, API routes, hardware capacity, installed Ollama models, provisioning roadmap.'
    },
    {
      label: 'About page port',
      detail: 'Hero, overview, operation steps, telemetry, decisions audit trail, principles, manifest.'
    },
    {
      label: 'Design page additions',
      detail: 'Motion tokens, form patterns, tables, callouts.'
    },
    {
      label: 'Width + typography pass',
      detail: "All content pages now full-width (max-w-none); typography tokens bumped to ant's scale (body 14px, etc.)."
    },
    {
      label: 'Footer cleanup',
      detail: 'Tech Stack → System, Design System → Design, GitHub link replaced with Octocat SVG.'
    },
    {
      label: 'start.sh hang fix',
      detail: 'Cache-warming step now bounds each curl with --max-time 5; can no longer hang on a stuck endpoint.'
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
      blurb: 'What must ship before raven goes out the door. Theme: zero-friction install + a first-run experience a brand-new Claude Code user immediately understands.',
      items: publicLaunch
    },
    {
      num: '01',
      title: 'Presence & Feel',
      tone: 'info',
      label: 'Make AI felt',
      blurb: 'Turn invisible inference into a sensory companion. New users develop intuition by feeling the weight of what AI does, not by reading docs about it.',
      items: presence
    },
    {
      num: '02',
      title: 'Reflect & Reward',
      tone: 'success',
      label: 'The retention loop',
      blurb: 'Reflect the user\'s growth back to them. Milestones land at exactly the moments retention is fragile (week-1, day-30, anniversaries). The killer feature for democratization.',
      items: reflect
    },
    {
      num: '03',
      title: 'Power-User Depth',
      tone: 'warning',
      label: 'Post-launch',
      blurb: 'Carried from the previous roadmap. The audience Raven was first built for stays important — these items just stop blocking the public launch.',
      items: powerUser
    }
  ];

  function toneClass(tone) {
    switch (tone) {
      case 'accent': return 'text-accent';
      case 'info': return 'text-info';
      case 'success': return 'text-success';
      case 'warning': return 'text-warning';
      default: return 'text-muted';
    }
  }

  const totalQueued = publicLaunch.length + presence.length + reflect.length + powerUser.length;
</script>

<PageLayout>
  <div class="space-y-10">
    <!-- Status bar -->
    <div class="flex items-center justify-between text-xs font-mono text-muted border-b border-border pb-2">
      <div class="flex items-center gap-2">
        <span class="text-accent font-semibold">RAVEN.ROADMAP</span>
        <span>::</span>
        <span class="uppercase tracking-wide">Phased toward public launch · Edit RoadmapPage.svelte</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="uppercase tracking-wide">{publicLaunch.length} launch · {presence.length + reflect.length} v1 · {powerUser.length} post · {open.length} open</span>
      </div>
    </div>

    <!-- Hero — two-column: prose main + size legend aside -->
    <div class="flex flex-col lg:flex-row gap-8">
      <div class="flex-1 min-w-0 max-w-[48rem]">
        <PageHeader
          title="Roadmap"
          description="Phased toward a public launch focused on new Claude Code users. Phase 00 blocks release; Phases 01–02 define the first impression after install; Phase 03 carries the power-user depth Raven was first built for. Sized in t-shirts (XS–XL); priority is top-down within each phase."
        />
      </div>

      <aside class="lg:w-72 lg:flex-shrink-0">
        <div class="bg-surface border border-border rounded-lg p-4">
          <div class="text-xs font-mono uppercase tracking-wide text-muted mb-3">Size legend</div>
          <dl class="space-y-1.5 text-sm font-mono">
            {#each [
              { k: 'XS', v: 'typo · copy tweak' },
              { k: 'S', v: '~1 day refactor' },
              { k: 'M', v: '2–3 day feature' },
              { k: 'L', v: 'week-long initiative' },
              { k: 'XL', v: '2+ weeks · multi-phase' }
            ] as row (row.k)}
              <div class="flex items-baseline gap-3">
                <dt class="text-accent w-7 flex-shrink-0">{row.k}</dt>
                <dd class="text-muted">{row.v}</dd>
              </div>
            {/each}
          </dl>
          <div class="mt-3 pt-3 border-t border-border text-[11px] font-mono text-muted leading-relaxed">
            <span class="text-text">{totalQueued}</span> items across 4 phases ·
            <span class="text-text">{publicLaunch.length}</span> block public launch
          </div>
        </div>
      </aside>
    </div>

    <!-- Phases 00 → 03 -->
    {#each phases as phase (phase.num)}
      <section>
        <div class="text-xs font-mono text-muted uppercase tracking-widest mb-3 flex items-center gap-3">
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
                <span class="inline-block text-xs font-mono font-bold px-2 py-0.5 rounded {sizeBadgeClass(item.size)}">{item.size}</span>
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
      <div class="text-xs font-mono text-muted uppercase tracking-widest mb-3 flex items-center gap-3">
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
                <span class="text-[10px] font-mono text-muted ml-2 align-middle">added {q.added}</span>
              {/if}
            </h3>
            <p class="text-sm text-body font-sans leading-relaxed">{q.note}</p>
          </div>
        {/each}
      </div>
    </section>

    <!-- 05 // Recently Shipped -->
    <section>
      <div class="text-xs font-mono text-muted uppercase tracking-widest mb-3 flex items-center gap-3">
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
