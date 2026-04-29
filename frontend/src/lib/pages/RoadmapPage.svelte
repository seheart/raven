<script>
  /**
   * Roadmap — what's in flight, what's queued, what's parked.
   * Hand-curated. Edit this file as the project evolves.
   */
  import { PageLayout, PageHeader } from '../components/layout/index.js';

  const now = [
    {
      title: 'Full-page audit',
      detail:
        'Walk every page at full-width, half-width, and mobile breakpoints. Catch overflowing tables, charts that don\'t resize, sidebars that get cramped, and text-xs body copy still left on pages I haven\'t touched. Output: a per-page punch list with concrete fixes.',
      size: 'M'
    },
    {
      title: 'Decision audit-trail backend',
      detail:
        'The Decisions section on About is hardcoded today. Build a small DECISIONS.md parser (or a SQLite table) so the audit trail is editable without touching Svelte. Open questions live in the same doc.',
      size: 'S'
    }
  ];

  const next = [
    {
      title: 'Inline diff scoring & risk annotations',
      detail:
        'Per-file scoring with per-line callouts in the diff viewer. Hooks into the existing pattern detector and self-analysis service. Surfaces risk inline rather than in a separate report.',
      size: 'L'
    },
    {
      title: 'Multi-machine roll-up',
      detail:
        'Each Raven instance is single-host today. A central aggregator lets you see sessions across hosts in one view. Tradeoff space (push vs pull, schema versioning, auth) needs a design pass before code.',
      size: 'L',
      blocking: 'Needs a design doc before implementation.'
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
      title: 'Cleanup: text-xs audit on remaining pages',
      detail:
        'About / System / Design got the text-xs → text-sm body-copy audit. The other 23 pages didn\'t. Sweep the rest for cases where text-xs is being used for prose rather than chrome.',
      size: 'S',
      blocking: 'Falls out naturally from the full-page audit.'
    }
  ];

  const open = [
    {
      title: 'Should Raven adopt a "terminal" variant for some pages?',
      note:
        'ant uses a phosphor-green terminal aesthetic; raven is modern. We deliberately kept raven\'s tokens, but Monitoring / System views could justify a denser, more terminal-like skin if it actually helps comprehension. Not a no, not a yes — needs prototyping.'
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
        'Currently unbounded with manual prune. At our event rate that\'s fine for months, but eventually someone will hit a wall. Hard prune at N days? Soft archive to a parquet file? Up to the user via Settings?'
    }
  ];

  const recentlyShipped = [
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
      detail: 'Moved from :root into Tailwind v4 @theme. Tailwind utilities (text-sm, text-base) now read raven\'s scale, so future tweaks cascade automatically.'
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
      detail: 'All content pages now full-width (max-w-none); typography tokens bumped to ant\'s scale (body 14px, etc.).'
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
</script>

<PageLayout>
  <div class="space-y-10">
    <!-- Status bar -->
    <div class="flex items-center justify-between text-xs font-mono text-muted border-b border-border pb-2">
      <div class="flex items-center gap-2">
        <span class="text-accent font-semibold">RAVEN.ROADMAP</span>
        <span>::</span>
        <span class="uppercase tracking-wide">Hand-curated · Edit RoadmapPage.svelte</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="uppercase tracking-wide">{now.length} now · {next.length} next · {open.length} open</span>
      </div>
    </div>

    <!-- Hero — two-column: prose main + size legend aside -->
    <div class="flex flex-col lg:flex-row gap-8">
      <div class="flex-1 min-w-0 max-w-[48rem]">
        <PageHeader
          title="Roadmap"
          description="What's in flight, what's queued, and what's parked. Sized in t-shirts (XS / S / M / L / XL). Open questions are bigger calls that need a design pass before they become work."
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
        </div>
      </aside>
    </div>

    <!-- 01 // Now -->
    <section>
      <div class="text-xs font-mono text-muted uppercase tracking-widest mb-3 flex items-center gap-3">
        <span>01 // Now</span>
        <span class="flex-1 border-t border-dashed border-border"></span>
        <span class="text-accent normal-case">In flight</span>
      </div>
      <div class="space-y-3">
        {#each now as item (item.title)}
          <div class="bg-surface border border-border rounded-lg p-4">
            <div class="flex items-baseline justify-between gap-3 mb-2">
              <h3 class="text-base font-semibold text-heading">{item.title}</h3>
              <span class="inline-block text-xs font-mono font-bold px-2 py-0.5 rounded {sizeBadgeClass(item.size)}">{item.size}</span>
            </div>
            <p class="text-sm text-body font-sans leading-relaxed">{item.detail}</p>
          </div>
        {/each}
      </div>
    </section>

    <!-- 02 // Next -->
    <section>
      <div class="text-xs font-mono text-muted uppercase tracking-widest mb-3 flex items-center gap-3">
        <span>02 // Next</span>
        <span class="flex-1 border-t border-dashed border-border"></span>
        <span class="text-info normal-case">Queued</span>
      </div>
      <div class="space-y-3">
        {#each next as item, i (item.title)}
          <div class="bg-surface border border-border rounded-lg p-4">
            <div class="flex items-baseline justify-between gap-3 mb-2">
              <h3 class="text-base font-semibold text-heading">
                <span class="text-muted font-mono mr-2">{String(i + 1).padStart(2, '0')}</span>
                {item.title}
              </h3>
              <span class="inline-block text-xs font-mono font-bold px-2 py-0.5 rounded {sizeBadgeClass(item.size)}">{item.size}</span>
            </div>
            <p class="text-sm text-body font-sans leading-relaxed mb-2">{item.detail}</p>
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

    <!-- 03 // Open Questions -->
    <section>
      <div class="text-xs font-mono text-muted uppercase tracking-widest mb-3 flex items-center gap-3">
        <span>03 // Open Questions</span>
        <span class="flex-1 border-t border-dashed border-border"></span>
        <span class="text-warning normal-case">Parked</span>
      </div>
      <div class="space-y-3">
        {#each open as q (q.title)}
          <div class="bg-surface border border-dashed border-border rounded-lg p-4">
            <h3 class="text-base font-semibold text-heading mb-2">{q.title}</h3>
            <p class="text-sm text-body font-sans leading-relaxed">{q.note}</p>
          </div>
        {/each}
      </div>
    </section>

    <!-- 04 // Recently Shipped -->
    <section>
      <div class="text-xs font-mono text-muted uppercase tracking-widest mb-3 flex items-center gap-3">
        <span>04 // Recently Shipped</span>
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
