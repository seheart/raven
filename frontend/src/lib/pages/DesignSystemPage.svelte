<script>
  /**
   * Design System page — 10 numbered sections matching the rhythm of About
   * and System. Static data lives in lib/content/design.js; this file is
   * markup, live demos, and iteration over those arrays.
   */
  import { onMount } from 'svelte';
  import { PageLayout, PageHeader, PageSection, ProseBlock } from '../components/layout/index.js';
  import {
    EmptyState,
    LoadingState,
    RefreshButton,
    ToolbarButton,
    FilterToggle,
    TabButton
  } from '../components/ui/index.js';
  import { websocketService } from '../services/websocket.js';
  import {
    HERO,
    TOC,
    INTENT,
    PATTERN_SUBGROUPS,
    PRIMITIVES,
    PAGE_ZONES,
    PAGE_SKELETON,
    STATES,
    PHOSPHOR_RATIONALE,
    BRAND_COLORS,
    BRAND_COLORS_RULE,
    SURFACE_TOKENS,
    TEXT_TOKENS,
    SEMANTIC_TOKENS,
    SUBTLE_TOKENS,
    TYPE_SCALE,
    TYPE_WEIGHTS,
    TYPE_FAMILIES,
    SPACING_SCALE,
    RADIUS_SCALE,
    MOTION_TOKENS,
    CALLOUTS,
    PRINCIPLES
  } from '../content/design.js';

  let websocketConnected = $state(false);
  let activeSlug = $state(TOC[0]?.slug ?? 'intent');

  onMount(() => {
    websocketConnected = websocketService.isConnected();
    const updateStatus = () => { websocketConnected = websocketService.isConnected(); };
    websocketService.on('connect', updateStatus);
    websocketService.on('disconnect', updateStatus);

    // Track which section is in view — drives the sticky jump-nav highlight.
    // rootMargin shrinks the observer's "viewport" to a thin band near the
    // top of the screen so the active link advances as you cross each
    // section heading rather than when a section's bottom comes into view.
    const observer = new IntersectionObserver(entries => {
      const visible = entries
        .filter(e => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible.length > 0) {
        activeSlug = visible[0].target.id.replace('sect-', '');
      }
    }, {
      rootMargin: '-80px 0px -70% 0px',
      threshold: 0
    });

    for (const t of TOC) {
      const el = document.getElementById(`sect-${t.slug}`);
      if (el) observer.observe(el);
    }

    return () => {
      websocketService.off('connect', updateStatus);
      websocketService.off('disconnect', updateStatus);
      observer.disconnect();
    };
  });

  // Map callout tone → border + text class so the "color: var(--{tone})"
  // pattern stays in the design system rather than inline styles.
  const TONE_CLASS = {
    warning: { border: 'border-warning', tint: 'bg-warning/10', text: 'text-warning' },
    success: { border: 'border-success', tint: 'bg-success/10', text: 'text-success' },
    info: { border: 'border-info', tint: 'bg-info/10', text: 'text-info' },
    error: { border: 'border-error', tint: 'bg-error/10', text: 'text-error' }
  };
  function toneClasses(tone) {
    return TONE_CLASS[tone] || TONE_CLASS.info;
  }
</script>

<PageLayout>
  <div class="space-y-8">

    <!-- Status bar — full width across canvas -->
    <div class="flex items-center justify-between text-xs font-mono text-muted border-b border-border pb-2">
      <div class="flex items-center gap-2">
        <span class="text-accent font-semibold">RAVEN.SYSTEM</span>
        <span aria-hidden="true">::</span>
        <span class="uppercase tracking-wide">Design Reference</span>
      </div>
      <div class="flex items-center gap-3">
        <a
          href="/src/app.css"
          target="_blank"
          rel="noopener noreferrer"
          class="text-muted hover:text-accent transition-colors"
        >[ View app.css ]</a>
        <span class="flex items-center gap-2">
          <span class="w-1.5 h-1.5 rounded-full {websocketConnected ? 'bg-success animate-pulse' : 'bg-warning'}"></span>
          <span class="uppercase tracking-wide {websocketConnected ? 'text-success' : 'text-warning'}">
            {websocketConnected ? 'Operational' : 'Disconnected'}
          </span>
        </span>
      </div>
    </div>

    <!-- Two-column doc layout: scrolling main + sticky on-this-page aside -->
    <div class="flex flex-col lg:flex-row gap-8">
      <main class="flex-1 min-w-0 max-w-[64rem] space-y-12">

        <!-- Hero -->
        <section>
          <PageHeader title={HERO.title} />

          <p class="mt-4 text-base text-body font-sans leading-relaxed">{HERO.lede}</p>

          <div class="mt-4 space-y-1.5 text-sm font-mono">
            {#each HERO.meta as row (row.k)}
              <div class="flex items-baseline gap-2">
                <span class="text-muted w-32 flex-shrink-0">{row.k}</span>
                <span class="flex-1 border-b border-dotted border-border mb-0.5"></span>
                <span class="text-body">{row.v}</span>
              </div>
            {/each}
          </div>

          <div class="mt-4 bg-warning/10 border-l-4 border-warning rounded-r p-4">
            <div class="text-xs font-mono uppercase tracking-wide text-warning mb-1">! You are here</div>
            <div class="text-sm text-body font-sans">
              This page is itself built from the patterns it documents. The jump-nav on the right follows you as you scroll.
            </div>
          </div>

          <div class="mt-4 flex flex-wrap items-center gap-2 text-xs font-mono text-muted">
            {#each HERO.badges as badge (badge.label)}
              <span class="px-2 py-0.5 bg-accent-subtle text-accent rounded font-semibold tracking-wide">{badge.label}</span>
              {#each badge.items as item, i (item)}
                <span>{item}</span>
                {#if i < badge.items.length - 1}<span class="text-muted/40">·</span>{/if}
              {/each}
            {/each}
          </div>
        </section>

    <!-- 00 // Intent -->
    <div id="sect-intent"></div>
    <PageSection title="00 // Intent" meta="read this before building a new screen">
      <ProseBlock>
        <p class="text-base text-body font-sans leading-relaxed mb-6">{INTENT.manifesto}</p>
      </ProseBlock>

      <ProseBlock>
        <h3 class="text-sm font-semibold text-heading mb-3">Adjectives</h3>
        <p class="text-sm text-muted font-sans mb-3">An instant emotional read. If a new screen doesn't feel like these five words, it doesn't belong.</p>
      </ProseBlock>
      <div class="mb-6 flex flex-wrap items-center gap-2">
        {#each INTENT.adjectives as adj, i (adj)}
          <span class="text-base font-semibold text-accent">{adj}</span>
          {#if i < INTENT.adjectives.length - 1}
            <span class="text-muted/40" aria-hidden="true">·</span>
          {/if}
        {/each}
      </div>

      <ProseBlock>
        <h3 class="text-sm font-semibold text-heading mb-3">Visual tension</h3>
        <p class="text-sm text-muted font-sans mb-3">Lock the register. Each pair: what to do, what to avoid.</p>
      </ProseBlock>
      <ul class="mb-6 space-y-2 list-none">
        {#each INTENT.tension as t (t.do)}
          <li class="flex items-baseline gap-2 flex-wrap text-sm">
            <span class="text-success font-mono">+</span>
            <span class="text-body font-semibold">{t.do}</span>
            <span class="text-muted text-xs uppercase tracking-wide">not</span>
            <span class="text-muted italic">{t.not}</span>
          </li>
        {/each}
      </ul>

      <ProseBlock>
        <h3 class="text-sm font-semibold text-heading mb-3">Tone of voice</h3>
        <p class="text-sm text-muted font-sans mb-3">The vocabulary the system uses for itself. Use the left column. Avoid the right.</p>
      </ProseBlock>
      <div class="mb-6 bg-surface border border-border rounded-lg overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-canvas">
            <tr class="text-xs text-muted uppercase tracking-wide">
              <th class="text-left font-semibold px-3 py-2 w-32">Use</th>
              <th class="text-left font-semibold px-3 py-2 w-32">Not</th>
              <th class="text-left font-semibold px-3 py-2">Why</th>
            </tr>
          </thead>
          <tbody>
            {#each INTENT.tone as g (g.use)}
              <tr class="border-t border-border align-top">
                <td class="px-3 py-2 font-mono text-success"><code>{g.use}</code></td>
                <td class="px-3 py-2 font-mono text-error/70 line-through"><code>{g.not}</code></td>
                <td class="px-3 py-2 text-muted font-sans">{g.why}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <ProseBlock>
        <h3 class="text-sm font-semibold text-heading mb-3">Touchstones</h3>
        <p class="text-sm text-muted font-sans mb-3">References for finding inspiration in the right corner of style space.</p>
      </ProseBlock>
      <div class="mb-6 grid grid-cols-1 md:grid-cols-2 gap-3">
        {#each INTENT.touchstones as t (t.name)}
          <div class="bg-surface border border-border rounded-lg p-4">
            <div class="text-sm font-semibold text-accent mb-1">{t.name}</div>
            <p class="text-sm text-body font-sans leading-relaxed">{t.body}</p>
          </div>
        {/each}
      </div>

      <ProseBlock>
        <h3 class="text-sm font-semibold text-heading mb-3">Folder convention</h3>
        <p class="text-sm text-muted font-sans mb-3">Find a file, find the layer. Every page-level concern lives under exactly one of these.</p>
      </ProseBlock>
      <div class="bg-surface border border-border rounded-lg overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-canvas">
            <tr class="text-xs text-muted uppercase tracking-wide">
              <th class="text-left font-semibold px-3 py-2">Folder</th>
              <th class="text-left font-semibold px-3 py-2">What lives there</th>
            </tr>
          </thead>
          <tbody>
            {#each INTENT.folders as f (f.path)}
              <tr class="border-t border-border align-top">
                <td class="px-3 py-2 font-mono text-accent"><code>{f.path}</code></td>
                <td class="px-3 py-2 text-body font-sans">{f.what}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </PageSection>

    <!-- 01 // Composed Patterns -->
    <div id="sect-patterns"></div>
    <PageSection title="01 // Composed Patterns" meta="the actual UI vocabulary you'll reach for">
      <ProseBlock>
        <p class="text-sm text-body font-sans mb-6">Reusable component shapes. Reach for these before inventing something new — every screen on Raven is assembled from this kit. Grouped into four sub-systems.</p>
      </ProseBlock>

      <!-- Subgroup index -->
      <div class="mb-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {#each PATTERN_SUBGROUPS as g (g.tag)}
          <div class="bg-surface border border-border rounded-lg p-3">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-xs font-mono font-bold text-accent w-5 h-5 inline-flex items-center justify-center bg-accent-subtle rounded">{g.tag}</span>
              <span class="text-sm font-semibold text-heading">{g.name}</span>
            </div>
            <p class="text-xs text-muted font-sans">{g.desc}</p>
          </div>
        {/each}
      </div>

      <!-- Subgroup A: Chrome -->
      <ProseBlock>
        <h3 class="text-sm font-semibold text-heading mb-3 flex items-center gap-2">
          <span class="text-xs font-mono font-bold text-accent w-5 h-5 inline-flex items-center justify-center bg-accent-subtle rounded">A</span>
          Chrome
        </h3>
        <p class="text-sm text-muted font-sans mb-4">Page frame: status bar, hero, sections, callouts. Every content page wears this.</p>
      </ProseBlock>

      <!-- Status bar demo -->
      <h4 class="text-xs font-mono text-muted uppercase tracking-wide mb-2">Status bar</h4>
      <div class="mb-4 bg-surface border border-border rounded-lg p-3">
        <div class="flex items-center justify-between text-xs font-mono text-muted">
          <div class="flex items-center gap-2">
            <span class="text-accent font-semibold">RAVEN.SYSTEM</span>
            <span aria-hidden="true">::</span>
            <span class="uppercase tracking-wide">Sample page</span>
          </div>
          <span class="flex items-center gap-2">
            <span class="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></span>
            <span class="uppercase tracking-wide text-success">Operational</span>
          </span>
        </div>
      </div>

      <!-- Hero meta block demo — constrained to ~30rem to mimic the
           hero's main column where this pattern lives in the wild. -->
      <h4 class="text-xs font-mono text-muted uppercase tracking-wide mb-2">Hero meta block <span class="text-muted/60 normal-case font-normal">· lives in hero main column at ~48rem</span></h4>
      <div class="mb-4 bg-surface border border-border rounded-lg p-4 max-w-[30rem]">
        <div class="space-y-1.5 text-sm font-mono">
          <div class="flex items-baseline gap-2">
            <span class="text-muted w-24 flex-shrink-0">Status</span>
            <span class="flex-1 border-b border-dotted border-border mb-0.5"></span>
            <span class="text-body">Operational</span>
          </div>
          <div class="flex items-baseline gap-2">
            <span class="text-muted w-24 flex-shrink-0">Open</span>
            <span class="flex-1 border-b border-dotted border-border mb-0.5"></span>
            <span class="text-body">4</span>
          </div>
          <div class="flex items-baseline gap-2">
            <span class="text-muted w-24 flex-shrink-0">Severity</span>
            <span class="flex-1 border-b border-dotted border-border mb-0.5"></span>
            <span class="text-body flex items-center gap-1">
              <span class="inline-block px-1.5 py-0.5 text-xs font-mono bg-error/15 text-error rounded">high 1</span>
              <span class="inline-block px-1.5 py-0.5 text-xs font-mono bg-warning/15 text-warning rounded">med 3</span>
              <span class="inline-block px-1.5 py-0.5 text-xs font-mono bg-info/15 text-info rounded">low 12</span>
            </span>
          </div>
        </div>
      </div>

      <!-- Section divider demo -->
      <h4 class="text-xs font-mono text-muted uppercase tracking-wide mb-2">Section heading (PageSection)</h4>
      <div class="mb-6 bg-surface border border-border rounded-lg p-4">
        <h2 class="text-xs font-semibold text-muted uppercase tracking-wide mb-3">
          0N // Section Title
          <span class="text-muted/60 font-normal">· N matching · brief context</span>
        </h2>
        <p class="text-sm text-body font-sans">The section body. Mix tables, callouts, action rows, whatever the section needs.</p>
      </div>

      <!-- Subgroup B: Data -->
      <ProseBlock>
        <h3 class="text-sm font-semibold text-heading mb-3 flex items-center gap-2 mt-8">
          <span class="text-xs font-mono font-bold text-accent w-5 h-5 inline-flex items-center justify-center bg-accent-subtle rounded">B</span>
          Data
        </h3>
        <p class="text-sm text-muted font-sans mb-4">Tables, forms, badges, cards, status pills.</p>
      </ProseBlock>

      <!-- Buttons -->
      <h4 class="text-xs font-mono text-muted uppercase tracking-wide mb-2">Buttons</h4>
      <div class="mb-4 bg-surface border border-border rounded-lg p-4">
        <div class="flex flex-wrap gap-2 items-center">
          <button class="btn btn-primary" type="button">Primary</button>
          <button class="btn btn-primary" type="button" disabled>Disabled</button>
          <button class="btn btn-secondary" type="button">Secondary</button>
          <button class="btn btn-ghost" type="button">Ghost</button>
          <button class="btn btn-danger" type="button">Danger</button>
          <button class="btn" type="button">Default</button>
        </div>
        <div class="flex flex-wrap gap-2 items-center mt-3">
          <button class="btn btn-sm btn-primary" type="button">Small</button>
          <button class="btn btn-primary" type="button">Default size</button>
          <button class="btn btn-lg btn-primary" type="button">Large</button>
        </div>
      </div>

      <!-- Badges & Pills -->
      <h4 class="text-xs font-mono text-muted uppercase tracking-wide mb-2">Badges &amp; pills</h4>
      <div class="mb-4 bg-surface border border-border rounded-lg p-4">
        <div class="flex flex-wrap gap-2 items-center mb-3">
          <span class="badge badge-success">Success</span>
          <span class="badge badge-error">Error</span>
          <span class="badge badge-warning">Warning</span>
          <span class="badge badge-info">Info</span>
        </div>
        <div class="flex flex-wrap gap-2 items-center">
          <span class="pill add">Add</span>
          <span class="pill del">Del</span>
          <span class="pill mod">Mod</span>
        </div>
      </div>

      <!-- Forms -->
      <h4 class="text-xs font-mono text-muted uppercase tracking-wide mb-2">Forms</h4>
      <div class="mb-4 bg-surface border border-border rounded-lg p-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-mono text-muted uppercase tracking-wide mb-1.5" for="ds-text">Text input</label>
            <input
              id="ds-text"
              type="text"
              placeholder="e.g. /home/seth/Projects/raven"
              class="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm font-mono text-body placeholder:text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label class="block text-xs font-mono text-muted uppercase tracking-wide mb-1.5" for="ds-search">Search</label>
            <input
              id="ds-search"
              type="search"
              placeholder="Search events..."
              class="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm font-sans text-body placeholder:text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label class="block text-xs font-mono text-muted uppercase tracking-wide mb-1.5" for="ds-select">Select</label>
            <select
              id="ds-select"
              class="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm font-sans text-body focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            >
              <option>Last 24 hours</option>
              <option>Last 7 days</option>
              <option>Last 30 days</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-mono text-muted uppercase tracking-wide mb-1.5" for="ds-disabled">Disabled</label>
            <input
              id="ds-disabled"
              type="text"
              value="read-only"
              disabled
              class="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm font-mono text-muted opacity-60 cursor-not-allowed"
            />
          </div>
          <div class="md:col-span-2">
            <label class="block text-xs font-mono text-muted uppercase tracking-wide mb-1.5" for="ds-textarea">Textarea</label>
            <textarea
              id="ds-textarea"
              rows="2"
              placeholder="Notes or commit message..."
              class="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm font-mono text-body placeholder:text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            ></textarea>
          </div>
          <div class="md:col-span-2 flex flex-wrap items-center gap-6 pt-1">
            <label class="flex items-center gap-2 text-sm text-body cursor-pointer">
              <input type="checkbox" checked class="accent-accent" />
              <span>Pause monitoring</span>
            </label>
            <label class="flex items-center gap-2 text-sm text-body cursor-pointer">
              <input type="checkbox" class="accent-accent" />
              <span>Auto-refresh</span>
            </label>
            <label class="flex items-center gap-2 text-sm text-body cursor-pointer">
              <input type="radio" name="ds-radio" checked class="accent-accent" />
              <span>Subscription</span>
            </label>
            <label class="flex items-center gap-2 text-sm text-body cursor-pointer">
              <input type="radio" name="ds-radio" class="accent-accent" />
              <span>API metering</span>
            </label>
          </div>
        </div>
      </div>

      <!-- Tables -->
      <h4 class="text-xs font-mono text-muted uppercase tracking-wide mb-2">Dense data table</h4>
      <div class="mb-4 bg-surface border border-border rounded-lg overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-canvas">
            <tr class="text-xs text-muted uppercase tracking-wide">
              <th class="text-left font-semibold px-4 py-2">Agent</th>
              <th class="text-left font-semibold px-4 py-2">Project</th>
              <th class="text-left font-semibold px-4 py-2">Events</th>
              <th class="text-right font-semibold px-4 py-2">Cost</th>
            </tr>
          </thead>
          <tbody>
            {#each [
              { agent: 'claude-code', project: 'raven', events: 1248, cost: '$0.42' },
              { agent: 'codex', project: 'ant', events: 304, cost: '$0.11' },
              { agent: 'ollama', project: 'sonar', events: 96, cost: '—' }
            ] as row (row.agent)}
              <tr class="border-t border-border">
                <td class="px-4 py-2 font-mono text-body">{row.agent}</td>
                <td class="px-4 py-2 text-body">{row.project}</td>
                <td class="px-4 py-2 font-mono text-muted">{row.events.toLocaleString()}</td>
                <td class="px-4 py-2 font-mono text-body text-right">{row.cost}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <!-- Subgroup C: Live -->
      <ProseBlock>
        <h3 class="text-sm font-semibold text-heading mb-3 flex items-center gap-2 mt-8">
          <span class="text-xs font-mono font-bold text-accent w-5 h-5 inline-flex items-center justify-center bg-accent-subtle rounded">C</span>
          Live
        </h3>
        <p class="text-sm text-muted font-sans mb-4">Things that breathe — pulsing dots, websocket status, idle indicators.</p>
      </ProseBlock>

      <div class="mb-4 bg-surface border border-border rounded-lg p-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div class="flex items-center gap-2 text-sm">
            <span class="w-2 h-2 rounded-full bg-success"></span>
            <span class="font-mono text-body">Online</span>
          </div>
          <div class="flex items-center gap-2 text-sm">
            <span class="w-2 h-2 rounded-full bg-success animate-pulse"></span>
            <span class="font-mono text-body">Active</span>
          </div>
          <div class="flex items-center gap-2 text-sm">
            <span class="w-2 h-2 rounded-full bg-warning"></span>
            <span class="font-mono text-body">Warning</span>
          </div>
          <div class="flex items-center gap-2 text-sm">
            <span class="w-2 h-2 rounded-full bg-error"></span>
            <span class="font-mono text-body">Offline</span>
          </div>
        </div>
      </div>

      <!-- Subgroup D: Utilities -->
      <ProseBlock>
        <h3 class="text-sm font-semibold text-heading mb-3 flex items-center gap-2 mt-8">
          <span class="text-xs font-mono font-bold text-accent w-5 h-5 inline-flex items-center justify-center bg-accent-subtle rounded">D</span>
          Utilities
        </h3>
        <p class="text-sm text-muted font-sans mb-2">
          The DRY layer — primitives in <code class="font-mono text-xs bg-surface-2 px-1.5 py-0.5 rounded">lib/components/ui/</code>.
        </p>
        <p class="text-xs font-mono text-muted mb-4">
          Coverage of every <code>ui/</code> primitive against this page is enforced by
          <code class="text-accent">npm run validate:design-coverage</code>.
        </p>
      </ProseBlock>

      <!-- Live demos of each primitive — each name must appear literally
           somewhere in this file for validate:design-coverage to pass. -->
      <div class="space-y-4">
        <!-- RefreshButton -->
        <div class="bg-surface border border-border rounded-lg p-4">
          <div class="flex items-baseline justify-between gap-3 mb-3">
            <code class="font-mono text-sm text-accent">&lt;RefreshButton&gt;</code>
            <span class="text-xs font-mono text-muted">(props: onClick, loading, label)</span>
          </div>
          <div class="flex flex-wrap gap-3 mb-3">
            <RefreshButton onClick={() => {}} />
            <RefreshButton onClick={() => {}} loading={true} />
            <RefreshButton onClick={() => {}} label="Reload" />
          </div>
          <p class="text-sm text-muted font-sans">Canonical refresh button used in 23+ page headers. Built-in loading state.</p>
        </div>

        <!-- ToolbarButton -->
        <div class="bg-surface border border-border rounded-lg p-4">
          <div class="flex items-baseline justify-between gap-3 mb-3">
            <code class="font-mono text-sm text-accent">&lt;ToolbarButton&gt;</code>
            <span class="text-xs font-mono text-muted">variant: default · primary · danger</span>
          </div>
          <div class="flex flex-wrap gap-2 mb-3">
            <ToolbarButton onClick={() => {}}>Export</ToolbarButton>
            <ToolbarButton onClick={() => {}} variant="primary">Run now</ToolbarButton>
            <ToolbarButton onClick={() => {}} variant="danger">Clear all</ToolbarButton>
            <ToolbarButton onClick={() => {}} disabled={true}>Disabled</ToolbarButton>
          </div>
          <p class="text-sm text-muted font-sans">Secondary toolbar action (Export, Auto-refresh, filter toggles). One styling source for all toolbar buttons.</p>
        </div>

        <!-- FilterToggle -->
        <div class="bg-surface border border-border rounded-lg p-4">
          <div class="flex items-baseline justify-between gap-3 mb-3">
            <code class="font-mono text-sm text-accent">&lt;FilterToggle&gt;</code>
            <span class="text-xs font-mono text-muted">(props: active, onClick)</span>
          </div>
          <div class="flex flex-wrap gap-2 mb-3">
            <FilterToggle active={true} onClick={() => {}}>High</FilterToggle>
            <FilterToggle active={false} onClick={() => {}}>Medium</FilterToggle>
            <FilterToggle active={false} onClick={() => {}}>Low</FilterToggle>
          </div>
          <p class="text-sm text-muted font-sans">Bordered active/inactive filter pill — severity filters, search-type toggles.</p>
        </div>

        <!-- TabButton -->
        <div class="bg-surface border border-border rounded-lg p-4">
          <div class="flex items-baseline justify-between gap-3 mb-3">
            <code class="font-mono text-sm text-accent">&lt;TabButton&gt;</code>
            <span class="text-xs font-mono text-muted">(props: active, onClick)</span>
          </div>
          <div class="inline-flex">
            <TabButton active={false} onClick={() => {}}>Today</TabButton>
            <TabButton active={true} onClick={() => {}}>7d</TabButton>
            <TabButton active={false} onClick={() => {}}>30d</TabButton>
            <TabButton active={false} onClick={() => {}}>All</TabButton>
          </div>
          <p class="text-sm text-muted font-sans mt-3">Connected tab segment for time-range pickers.</p>
        </div>

        <!-- Reference table for the rest — name + variants + use line -->
        <div class="bg-surface border border-border rounded-lg p-5">
          <h4 class="text-xs font-mono text-muted uppercase tracking-wide mb-3">All primitives</h4>
          <div class="space-y-3">
            {#each PRIMITIVES as p (p.name)}
              <div class="grid grid-cols-1 sm:grid-cols-[180px_1fr_2fr] gap-3 items-baseline border-b border-border pb-3 last:border-b-0 last:pb-0">
                <code class="font-mono text-sm text-accent">&lt;{p.name}&gt;</code>
                <div class="flex flex-wrap gap-1.5">
                  {#each p.variants as v (v)}
                    <code class="font-mono text-[10px] bg-surface-2 px-1.5 py-0.5 rounded text-muted">{v}</code>
                  {/each}
                </div>
                <span class="text-sm text-muted font-sans">{p.use}</span>
              </div>
            {/each}
          </div>
        </div>
      </div>
    </PageSection>

    <!-- 02 // Page Architecture -->
    <div id="sect-architecture"></div>
    <PageSection title="02 // Page Architecture" meta="the rhythm every content page follows">
      <ProseBlock>
        <p class="text-sm text-body font-sans mb-6">Every Raven content page settles into the same five-zone rhythm. Build a new page by walking down this list — status bar, hero, numbered sections, sub-blocks, footer — and you'll match the rest of the system without thinking about it.</p>
      </ProseBlock>

      <div class="mb-6 space-y-3">
        {#each PAGE_ZONES as zone (zone.tag)}
          <div class="bg-surface border border-border rounded-lg p-4 flex gap-4">
            <div class="font-mono text-sm font-bold text-accent w-8 flex-shrink-0">{zone.tag}</div>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-semibold text-heading mb-1">
                <code class="font-mono text-accent">{zone.name}</code>
                <span class="text-muted font-sans font-normal">— {zone.purpose}</span>
              </div>
              <p class="text-sm text-body font-sans leading-relaxed">{zone.body}</p>
            </div>
          </div>
        {/each}
      </div>

      <ProseBlock>
        <h3 class="text-sm font-semibold text-heading mb-3">Reference: a typical render order</h3>
        <p class="text-sm text-muted font-sans mb-3">Copy this skeleton when starting a new page. Add the inline-script theme bootstrap to <code class="font-mono text-xs bg-surface-2 px-1.5 py-0.5 rounded">index.html</code> only — it's already there.</p>
      </ProseBlock>
      <pre class="bg-canvas border border-border rounded p-4 text-xs font-mono text-body overflow-x-auto leading-relaxed">{PAGE_SKELETON}</pre>
    </PageSection>

    <!-- 03 // States -->
    <div id="sect-states"></div>
    <PageSection title="03 // States" meta="empty · live · error · action · loading · missing">
      <ProseBlock>
        <p class="text-sm text-body font-sans mb-6">Universal state patterns. Empty states are direct (icon + title + description, no decorative illustrations). Errors show the raw message in mono. Live state is signaled by motion — a pulsing dot, never a spinner. Action confirmations live in callouts after a redirect, not as toast notifications.</p>
      </ProseBlock>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        {#each STATES as s (s.tag)}
          <div class="bg-surface border border-border rounded-lg p-4">
            <div class="flex items-baseline justify-between gap-3 mb-3">
              <span class="text-xs font-mono font-bold text-accent uppercase tracking-wide">{s.tag}</span>
              <code class="text-xs font-mono text-muted">{s.primitive}</code>
            </div>

            <div class="mb-3 bg-canvas border border-border rounded p-3 min-h-[110px] flex items-center justify-center">
              {#if s.demo.kind === 'empty'}
                <EmptyState
                  icon="📭"
                  title="No matches"
                  description="No events match those filters. Try clearing them."
                  size="compact"
                />
              {:else if s.demo.kind === 'live'}
                <div class="flex items-center gap-3 text-sm">
                  <span class="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></span>
                  <span class="font-mono text-success uppercase tracking-wide text-xs">Reviewing</span>
                  <span class="text-body"><strong>claude-code</strong> on <strong>raven</strong> · elapsed <strong>42s</strong></span>
                </div>
              {:else if s.demo.kind === 'loading'}
                <LoadingState message="Loading sessions…" />
              {:else if s.demo.kind === 'error'}
                <div class="bg-error/10 border-l-4 border-error rounded-r p-3 w-full">
                  <div class="text-xs font-mono uppercase tracking-wide text-error mb-1">✗ Error 503</div>
                  <code class="block text-sm font-mono text-body">Ollama unavailable</code>
                  <code class="block text-xs font-mono text-muted mt-1">$ systemctl --user status ollama</code>
                </div>
              {:else if s.demo.kind === 'action'}
                <div class="bg-success/10 border-l-4 border-success rounded-r p-3 w-full">
                  <div class="text-xs font-mono uppercase tracking-wide text-success mb-1">✓ Updated</div>
                  <div class="text-sm text-body font-sans"><code class="font-mono text-accent">retention.event_days</code> changed to <code class="font-mono text-accent">14</code>.</div>
                </div>
              {:else if s.demo.kind === 'missing'}
                <div class="bg-error/10 border-l-4 border-error rounded-r p-3 w-full">
                  <div class="flex items-center gap-3">
                    <strong class="text-body line-through">/home/seth/Projects/gone</strong>
                    <span class="inline-block px-2 py-0.5 text-xs font-mono bg-error/15 text-error rounded uppercase tracking-wide">missing</span>
                  </div>
                </div>
              {/if}
            </div>

            <p class="text-sm text-muted font-sans leading-relaxed">{s.desc}</p>
          </div>
        {/each}
      </div>
    </PageSection>

    <!-- 04 // Colors -->
    <div id="sect-colors"></div>
    <PageSection title="04 // Colors" meta="theme-aware tokens · flip on :root.dark">

      <!-- Why phosphor — the rationale before any swatch.
           No inner ProseBlock; the main column already constrains. -->
      <div class="bg-surface border border-border rounded-lg p-5 mb-8">
        <div class="flex items-baseline gap-3 mb-3">
          <span class="w-3 h-3 rounded-full bg-accent flex-shrink-0"></span>
          <h3 class="text-base font-semibold text-heading">{PHOSPHOR_RATIONALE.headline}</h3>
        </div>
        <p class="text-sm text-body font-sans leading-relaxed mb-3">{PHOSPHOR_RATIONALE.body}</p>
        <ul class="text-xs font-mono text-muted space-y-1 list-none pl-0">
          {#each PHOSPHOR_RATIONALE.rules as r (r)}
            <li class="pl-3 relative before:content-['→'] before:absolute before:left-0 before:text-accent">{r}</li>
          {/each}
        </ul>
      </div>

      <ProseBlock>
        <h3 class="text-sm font-semibold text-heading mb-3">Surfaces</h3>
        <p class="text-sm text-muted font-sans mb-4">Background and border tokens. These swap automatically between light and dark themes.</p>
      </ProseBlock>
      <div class="mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {#each SURFACE_TOKENS as t (t.name)}
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded border border-border flex-shrink-0" style="background: var({t.name});"></div>
            <div class="flex flex-col gap-0.5 min-w-0">
              <code class="font-mono text-xs text-accent">{t.utility}</code>
              <code class="font-mono text-[10px] text-muted">{t.name}</code>
              <span class="text-sm text-muted font-sans">{t.role}</span>
            </div>
          </div>
        {/each}
      </div>

      <ProseBlock>
        <h3 class="text-sm font-semibold text-heading mb-3">Text</h3>
        <p class="text-sm text-muted font-sans mb-4">Live samples — toggle the theme via the footer to see them shift.</p>
      </ProseBlock>
      <div class="mb-6 bg-surface border border-border rounded-lg p-5 space-y-3">
        {#each TEXT_TOKENS as t (t.name)}
          <div class="grid grid-cols-1 sm:grid-cols-[1fr_180px_1fr] gap-3 items-baseline border-b border-border pb-3 last:border-b-0 last:pb-0">
            <span class="text-base font-sans" style="color: var({t.name});">The quick brown fox jumps over the lazy dog</span>
            <div class="flex flex-col gap-0.5">
              <code class="font-mono text-xs text-accent">{t.utility}</code>
              <code class="font-mono text-[10px] text-muted">{t.name}</code>
            </div>
            <span class="text-sm text-muted font-sans">{t.role}</span>
          </div>
        {/each}
      </div>

      <ProseBlock>
        <h3 class="text-sm font-semibold text-heading mb-3">Semantic</h3>
        <p class="text-sm text-muted font-sans mb-4">Outcome-driven. Each color has one job. Don't reuse them for decoration.</p>
      </ProseBlock>
      <div class="mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {#each SEMANTIC_TOKENS as t (t.name)}
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded flex-shrink-0" style="background: var({t.name});"></div>
            <div class="flex flex-col gap-0.5 min-w-0">
              <code class="font-mono text-xs text-accent">{t.utility}</code>
              <code class="font-mono text-[10px] text-muted">{t.name}</code>
              <span class="text-sm text-muted font-sans">{t.role}</span>
            </div>
          </div>
        {/each}
      </div>

      <ProseBlock>
        <h3 class="text-sm font-semibold text-heading mb-3">Subtle tints</h3>
        <p class="text-sm text-muted font-sans mb-4">Low-saturation backgrounds. Pair with the matching semantic color for text.</p>
      </ProseBlock>
      <div class="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {#each SUBTLE_TOKENS as t (t.name)}
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded border border-border flex-shrink-0" style="background: var({t.name});"></div>
            <div class="flex flex-col gap-0.5 min-w-0">
              <code class="font-mono text-xs text-accent">{t.utility}</code>
              <code class="font-mono text-[10px] text-muted">{t.name}</code>
              <span class="text-sm text-muted font-sans">{t.role}</span>
            </div>
          </div>
        {/each}
      </div>

      <ProseBlock>
        <h3 class="text-sm font-semibold text-heading mb-3">Callouts</h3>
        <p class="text-sm text-muted font-sans mb-4">Inline notices. Left bar carries the semantic; pair with a label glyph (<code class="font-mono text-xs bg-surface-2 px-1.5 py-0.5 rounded">!</code>, <code class="font-mono text-xs bg-surface-2 px-1.5 py-0.5 rounded">✓</code>, <code class="font-mono text-xs bg-surface-2 px-1.5 py-0.5 rounded">i</code>, <code class="font-mono text-xs bg-surface-2 px-1.5 py-0.5 rounded">✗</code>).</p>
      </ProseBlock>
      <ProseBlock width="wide">
        <div class="space-y-3 mb-8">
          {#each CALLOUTS as c (c.tone)}
            {@const cls = toneClasses(c.tone)}
            <div class="rounded-r p-4 border-l-4 {cls.border} {cls.tint}">
              <div class="text-xs font-mono uppercase tracking-wide mb-1 {cls.text}">{c.label}</div>
              <div class="text-sm text-body font-sans">{c.body}</div>
            </div>
          {/each}
        </div>
      </ProseBlock>

      <ProseBlock>
        <h3 class="text-sm font-semibold text-heading mb-3">Brand colors <span class="text-xs font-mono text-muted ml-2 normal-case font-normal">vendor identities · per-agent</span></h3>
        <p class="text-sm text-muted font-sans mb-4">{BRAND_COLORS_RULE}</p>
      </ProseBlock>
      <div class="bg-surface border border-border rounded-lg overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-canvas">
            <tr class="text-xs text-muted uppercase tracking-wide">
              <th class="text-left font-semibold px-3 py-2 w-16">Swatch</th>
              <th class="text-left font-semibold px-3 py-2">Agent</th>
              <th class="text-left font-semibold px-3 py-2 hidden md:table-cell w-24">Hex</th>
              <th class="text-left font-semibold px-3 py-2">Used for</th>
            </tr>
          </thead>
          <tbody>
            {#each BRAND_COLORS as b (b.name)}
              <tr class="border-t border-border align-top">
                <td class="px-3 py-2"><div class="w-6 h-6 rounded border border-border" style="background: {b.color};"></div></td>
                <td class="px-3 py-2 text-body font-sans font-semibold">{b.name}</td>
                <td class="px-3 py-2 hidden md:table-cell"><code class="font-mono text-xs text-muted">{b.color}</code></td>
                <td class="px-3 py-2 text-muted font-sans">{b.use}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </PageSection>

    <!-- 05 // Typography -->
    <div id="sect-type"></div>
    <PageSection title="05 // Typography">
      <ProseBlock>
        <p class="text-sm text-body font-sans mb-6">Two families: <strong>Inter</strong> for prose, <strong>JetBrains Mono</strong> for technical content. Mono is reserved for things that must align character-for-character — IDs, paths, durations, code, model names.</p>
      </ProseBlock>

      <h3 class="text-sm font-semibold text-heading mb-3">Scale</h3>
      <div class="mb-6 bg-surface border border-border rounded-lg p-5 space-y-3">
        {#each TYPE_SCALE as t (t.name)}
          <div class="grid grid-cols-[140px_60px_1fr] gap-3 items-baseline border-b border-border pb-3 last:border-b-0 last:pb-0">
            <code class="font-mono text-xs text-muted">{t.name}</code>
            <span class="font-mono text-xs text-muted">{t.size}</span>
            <span class="text-body font-sans" style="font-size: var({t.name});">{t.sample}</span>
          </div>
        {/each}
      </div>

      <h3 class="text-sm font-semibold text-heading mb-3">Weights</h3>
      <div class="mb-6 bg-surface border border-border rounded-lg p-5 space-y-3">
        {#each TYPE_WEIGHTS as w (w.name)}
          <div class="grid grid-cols-[180px_60px_1fr] gap-3 items-baseline border-b border-border pb-3 last:border-b-0 last:pb-0">
            <code class="font-mono text-xs text-accent">{w.name}</code>
            <span class="font-mono text-xs text-muted">{w.value}</span>
            <span class="text-body font-sans text-base" style="font-weight: {w.value};">{w.sample}</span>
          </div>
        {/each}
      </div>

      <h3 class="text-sm font-semibold text-heading mb-3">Families</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        {#each TYPE_FAMILIES as f (f.name)}
          <div class="bg-surface border border-border rounded-lg p-5">
            <div class="text-sm font-semibold text-heading mb-1">{f.name}</div>
            <code class="font-mono text-xs text-accent">{f.cssVar}</code>
            <p class="text-sm text-muted font-sans mt-2 mb-3">{f.use}</p>
            <p class="text-base" style="font-family: var({f.cssVar});">{f.sample}</p>
          </div>
        {/each}
      </div>
    </PageSection>

    <!-- 06 // Spacing -->
    <div id="sect-spacing"></div>
    <PageSection title="06 // Spacing scale">
      <ProseBlock>
        <p class="text-sm text-muted font-sans mb-4">Eight steps. Always reference the token, never raw px.</p>
      </ProseBlock>
      <div class="bg-surface border border-border rounded-lg p-5 space-y-2">
        {#each SPACING_SCALE as s (s.name)}
          <div class="grid grid-cols-[140px_1fr_60px] gap-3 items-center">
            <code class="font-mono text-xs text-body">{s.name}</code>
            <div class="flex items-center">
              <div class="h-3 bg-accent rounded-sm" style="width: var({s.name});"></div>
            </div>
            <span class="font-mono text-xs text-muted">{s.value}px</span>
          </div>
        {/each}
      </div>
    </PageSection>

    <!-- 07 // Radius -->
    <div id="sect-radius"></div>
    <PageSection title="07 // Radius scale">
      <div class="bg-surface border border-border rounded-lg p-5 space-y-3">
        {#each RADIUS_SCALE as r (r.name)}
          <div class="grid grid-cols-[60px_140px_1fr] gap-3 items-center">
            <div class="w-9 h-9 bg-accent" style="border-radius: var({r.name});"></div>
            <code class="font-mono text-xs text-body">{r.name}</code>
            <span class="text-sm text-muted font-sans">
              <span class="font-mono text-body">{r.value}</span> · {r.use}
            </span>
          </div>
        {/each}
      </div>
    </PageSection>

    <!-- 08 // Motion -->
    <div id="sect-motion"></div>
    <PageSection title="08 // Motion">
      <ProseBlock>
        <p class="text-sm text-muted font-sans mb-4">
          Hover the swatch to feel each duration. Easing is symmetric by default; reach for
          <code class="font-mono text-xs bg-surface-2 px-1.5 py-0.5 rounded">--ease-out-expo</code>
          when something should land decisively (toasts, drawers).
        </p>
      </ProseBlock>
      <div class="bg-surface border border-border rounded-lg p-5 space-y-3">
        {#each MOTION_TOKENS as t (t.name)}
          <div class="grid grid-cols-1 sm:grid-cols-[60px_180px_1fr] gap-3 items-center border-b border-border pb-3 last:border-b-0 last:pb-0">
            <div
              class="motion-demo w-9 h-9 bg-accent rounded"
              style="transition: transform var({t.name}) var(--ease-smooth);"
            ></div>
            <code class="font-mono text-xs text-body">{t.name}</code>
            <span class="text-sm text-muted font-sans">
              <span class="font-mono text-body">{t.value}</span> · {t.use}
            </span>
          </div>
        {/each}
      </div>
    </PageSection>

    <!-- 09 // Principles -->
    <div id="sect-principles"></div>
    <PageSection title="09 // Compliance principles">
      <ProseBlock width="wide">
        <ol class="list-decimal pl-5 space-y-2 text-sm text-body font-sans leading-relaxed">
          {#each PRINCIPLES as p (p)}
            <!-- eslint-disable-next-line svelte/no-at-html-tags -- principles is a hard-coded static array; values are author-controlled markup, never user input -->
            <li>{@html p}</li>
          {/each}
        </ol>

        <div class="mt-6">
          <a href="#sect-intent" class="inline-block px-3 py-1.5 bg-surface border border-border rounded text-sm font-sans hover:border-accent transition-colors">[ ↑ back to top ]</a>
        </div>
      </ProseBlock>
    </PageSection>

      </main>

      <!-- Persistent jump-nav: sticky throughout page scroll -->
      <aside class="lg:w-72 lg:flex-shrink-0 w-full">
        <div class="bg-surface border border-border rounded-lg p-4 lg:sticky lg:top-16">
          <div class="text-xs font-mono uppercase tracking-wide text-muted mb-3">On this page</div>
          <nav class="flex flex-col gap-0.5" aria-label="Jump to section">
            {#each TOC as t (t.slug)}
              {@const active = activeSlug === t.slug}
              <a
                href="#sect-{t.slug}"
                class={`text-xs font-mono px-2 py-1.5 rounded transition-colors flex items-baseline gap-2 ${
                  active
                    ? 'text-accent bg-canvas font-semibold'
                    : 'text-body hover:text-accent hover:bg-canvas'
                }`}
                aria-current={active ? 'location' : undefined}
              >
                <span class={active ? 'text-accent' : 'text-muted'}>→</span>
                <span>{t.label}</span>
              </a>
            {/each}
          </nav>
        </div>
      </aside>
    </div>

  </div>
</PageLayout>

<style>
  /* Inline code chips inside the principles list — keep them visible */
  ol :global(code) {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    background: var(--surface-2);
    padding: 1px 6px;
    border-radius: var(--radius-sm);
    color: var(--text);
  }

  /* Hover the motion swatch to feel each duration token */
  .motion-demo:hover {
    transform: translateX(40px);
  }
</style>
