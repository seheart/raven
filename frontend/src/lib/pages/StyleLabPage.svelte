<script>
  /**
   * Style Lab — six color variants on top of V01 Terminal // (black base).
   * Each variant overrides --accent and friends via a wrapper class
   * defined in lib/styles/style-lab.css. The base palette stays black
   * across all six; only the brand accent shifts.
   */
  import { PageLayout, PageHeader, PageSection } from '../components/layout/index.js';

  const DEMO = {
    label: 'Live · last 6 minutes',
    title: 'Active Sessions',
    lede: 'Three agents running across two projects. Raven is observing.',
    meta: [
      { k: 'Agents', v: '3' },
      { k: 'Projects', v: '2' },
      { k: 'Events / min', v: '12' },
      { k: 'Open warnings', v: '1' }
    ],
    events: [
      { agent: 'claude-code', project: 'raven', when: '2m ago', what: 'edited backend/server.ts' },
      { agent: 'codex', project: 'ant', when: '4m ago', what: 'edited tests/visual/about.spec.ts' },
      { agent: 'ollama', project: 'raven', when: '6m ago', what: 'scored diff · 3/10 risk' }
    ],
    health: [
      { label: 'CPU', value: '18%' },
      { label: 'RAM', value: '8.2 GB' },
      { label: 'GPU free', value: '12.5 GB' },
      { label: 'Disk free', value: '430 GB' }
    ]
  };

  const VARIANTS = [
    { id: '1c', cls: 'variant-1c', name: 'Phosphor Green', tag: '★ current Raven baseline · Bloomberg · CRT' },
    { id: '1a', cls: 'variant-1a', name: 'Pure Mono', tag: 'no accent · falls back to grey' },
    { id: '1b', cls: 'variant-1b', name: 'Steel Iridescence', tag: 'cool blue-grey · raven-feather realistic' },
    { id: '1d', cls: 'variant-1d', name: 'Amber Terminal', tag: 'BBS warmth · VT100 nostalgia' },
    { id: '1e', cls: 'variant-1e', name: 'Restrained Violet', tag: 'Foundry callback · dialed down' },
    { id: '1f', cls: 'variant-1f', name: 'Crimson Wax', tag: 'single dramatic red · used sparingly' }
  ];
</script>

<PageLayout>
  <div class="space-y-12">

    <!-- Status bar -->
    <div class="flex items-center justify-between text-xs font-mono text-muted border-b border-border pb-2">
      <div class="flex items-center gap-2">
        <span class="text-accent font-semibold">RAVEN.SYSTEM</span>
        <span aria-hidden="true">::</span>
        <span class="uppercase tracking-wide">Style Lab — Color Variants</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-muted">Six accents · same content · black base</span>
      </div>
    </div>

    <!-- Hero — two-column: prose main + variant jump-nav aside -->
    <section class="flex flex-col lg:flex-row gap-8">
      <div class="flex-1 min-w-0 max-w-[48rem]">
        <PageHeader title="Style Lab — Color Variants" />
        <p class="mt-4 text-base text-body font-sans leading-relaxed">
          Six accent treatments on top of V01 Terminal //. The base palette (black canvas, grey surfaces, near-white headings) stays the same across all six — only the brand accent shifts. Toggle the theme to see how each behaves in light and dark.
        </p>
      </div>

      <aside class="lg:w-72 lg:flex-shrink-0">
        <div class="bg-surface border border-border rounded-lg p-4">
          <div class="text-xs font-mono uppercase tracking-wide text-muted mb-3">Variants</div>
          <nav class="flex flex-col gap-0.5" aria-label="Jump to variant">
            {#each VARIANTS as v (v.id)}
              <a
                href="#variant-{v.id}"
                class="text-xs font-mono text-body hover:text-accent hover:bg-canvas px-2 py-1.5 rounded transition-colors flex items-baseline gap-2"
              >
                <span class="text-accent">{v.id}</span>
                <span>{v.name}</span>
              </a>
            {/each}
          </nav>
        </div>
      </aside>
    </section>

    <!-- Variants — same demo, different accent -->
    {#each VARIANTS as v (v.id)}
      <div id="variant-{v.id}"></div>
      <PageSection title="{v.id} // {v.name}" meta={v.tag}>
        <div class={v.cls}>
          <div class="bg-surface border border-border rounded-lg p-6">

            <!-- Mini status bar showing the variant's accent -->
            <div class="flex items-center justify-between text-xs font-mono text-muted border-b border-border pb-2 mb-5">
              <div class="flex items-center gap-2">
                <span class="text-accent font-semibold">RAVEN.SYSTEM</span>
                <span aria-hidden="true">::</span>
                <span class="uppercase tracking-wide">{v.name}</span>
              </div>
              <span class="flex items-center gap-2">
                <span class="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></span>
                <span class="uppercase tracking-wide text-success">Operational</span>
              </span>
            </div>

            <!-- Hero -->
            <div class="text-xs font-mono text-muted uppercase tracking-wide mb-2">{DEMO.label}</div>
            <div class="text-2xl font-bold text-heading mb-2" role="heading" aria-level="3">{DEMO.title}</div>
            <p class="text-base text-body font-sans leading-relaxed mb-5">{DEMO.lede}</p>

            <div class="space-y-1 text-sm font-mono mb-6 max-w-[28rem]">
              {#each DEMO.meta as m (m.k)}
                <div class="flex items-baseline gap-2">
                  <span class="text-muted w-32 flex-shrink-0">{m.k}</span>
                  <span class="flex-1 border-b border-dotted border-border mb-0.5"></span>
                  <span class="text-body">{m.v}</span>
                </div>
              {/each}
            </div>

            <!-- CTAs -->
            <div class="flex flex-wrap gap-2 mb-6">
              <button class="px-3 py-1.5 bg-accent text-canvas border border-accent rounded text-sm font-sans hover:opacity-90 transition-colors">[ Primary action → ]</button>
              <button class="px-3 py-1.5 bg-surface border border-border rounded text-sm font-sans hover:border-accent transition-colors">[ Secondary ]</button>
              <button class="px-3 py-1.5 bg-accent-subtle text-accent rounded text-sm font-sans hover:opacity-90 transition-colors">[ Tertiary ]</button>
            </div>

            <!-- Section: Recent Activity -->
            <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-3" role="heading" aria-level="3">
              01 // Recent Activity
            </div>
            <div class="space-y-2 mb-6">
              {#each DEMO.events as e (e.what)}
                <div class="bg-canvas border border-border rounded p-3 text-sm font-mono">
                  <span class="text-accent font-semibold">{e.agent}</span>
                  <span class="text-muted">·</span>
                  <span class="text-body">{e.project}</span>
                  <span class="text-muted">·</span>
                  <span class="text-muted">{e.when}</span>
                  <div class="text-muted text-xs mt-1">{e.what}</div>
                </div>
              {/each}
            </div>

            <!-- Section: State pills (so you can see how variant accent sits next to functional state colors) -->
            <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-3" role="heading" aria-level="3">
              02 // States &nbsp;<span class="text-muted/60 font-normal normal-case">— state colors stay constant; accent shifts</span>
            </div>
            <div class="flex flex-wrap gap-2 mb-6">
              <span class="px-2 py-0.5 text-xs font-mono bg-accent-subtle text-accent rounded uppercase tracking-wide">accent</span>
              <span class="px-2 py-0.5 text-xs font-mono bg-success/15 text-success rounded uppercase tracking-wide">success</span>
              <span class="px-2 py-0.5 text-xs font-mono bg-warning/15 text-warning rounded uppercase tracking-wide">warning</span>
              <span class="px-2 py-0.5 text-xs font-mono bg-error/15 text-error rounded uppercase tracking-wide">error</span>
              <span class="px-2 py-0.5 text-xs font-mono bg-info/15 text-info rounded uppercase tracking-wide">info</span>
            </div>

            <!-- Section: Health -->
            <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-3" role="heading" aria-level="3">
              03 // Health
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {#each DEMO.health as h (h.label)}
                <div class="bg-canvas border border-border rounded p-3">
                  <div class="text-xs text-muted uppercase tracking-wide mb-1">{h.label}</div>
                  <div class="text-base font-mono font-bold text-body">{h.value}</div>
                </div>
              {/each}
            </div>

          </div>
        </div>
      </PageSection>
    {/each}

    <PageSection title="07 // Pick one">
      <p class="text-base text-body font-sans leading-relaxed">
        Tell me which accent you want to lock in. The base black palette stays either way; only the brand accent and primary CTAs change. <strong>1a</strong> stays where we are; <strong>1b</strong>–<strong>1f</strong> add a single distinguishing color without taking over.
      </p>
    </PageSection>

  </div>
</PageLayout>
