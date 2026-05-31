<script>
  /**
   * Light Lab — 10 daytime accent variants on top of the existing
   * light base. Phosphor green on cream reads "wellness/eco brand"
   * during the day; this page tests non-green options that lean
   * "serious technical reference."
   *
   * Each demo card forces the light base palette via .light-variant-base
   * (so it renders in light mode regardless of the user's current theme)
   * and then layers a single .light-variant-Lxx scope to swap accent +
   * button + link tokens. Fonts, spacing, and structural patterns stay
   * identical — this is a color-only review.
   */
  import { PageLayout, PageHeader, PageSection } from '../components/layout/index.js';

  // Same demo content as StyleLab so apples-to-apples comparison.
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
    {
      id: 'L01',
      cls: 'light-variant-L01',
      name: 'Ink Black',
      tag: 'monochromatic · Linear / NYT serious'
    },
    { id: 'L02', cls: 'light-variant-L02', name: 'Press Vermilion', tag: 'WSJ / FT masthead red' },
    {
      id: 'L03',
      cls: 'light-variant-L03',
      name: 'Stripe Navy',
      tag: 'deep ledger blue · finance gravitas'
    },
    { id: 'L04', cls: 'light-variant-L04', name: 'Espresso', tag: "printer's ink on aged paper" },
    {
      id: 'L05',
      cls: 'light-variant-L05',
      name: 'Iron Charcoal',
      tag: 'warm dark grey · letterpress'
    },
    {
      id: 'L06',
      cls: 'light-variant-L06',
      name: 'Slate Steel',
      tag: 'cool blue-grey · technical manual'
    },
    { id: 'L07', cls: 'light-variant-L07', name: 'Crimson Wax', tag: 'archival · wax-seal red' },
    { id: 'L08', cls: 'light-variant-L08', name: 'Royal Indigo', tag: 'academic / scholarly ink' },
    {
      id: 'L09',
      cls: 'light-variant-L09',
      name: 'Forest Ink',
      tag: 'law-library leather · NOT phosphor'
    },
    {
      id: 'L10',
      cls: 'light-variant-L10',
      name: 'Plum Vellum',
      tag: 'vintage publishing · warmer paper'
    }
  ];
</script>

<PageLayout>
  <div class="space-y-8">
    <!-- Status bar -->
    <div
      class="flex items-center justify-between text-xs font-mono text-muted border-b border-border pb-2"
    >
      <div class="flex items-center gap-2">
        <span class="text-accent font-semibold">RAVEN.SYSTEM</span>
        <span aria-hidden="true">::</span>
        <span class="uppercase tracking-wide">Light Lab — Daytime Accents</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-muted">10 accents · same content · cream base</span>
      </div>
    </div>

    <!-- Single-column doc layout (variant jump-nav aside removed). -->
    <div>
      <main class="max-w-[64rem] space-y-12">
        <!-- Hero -->
        <section>
          <PageHeader title="Light Lab — Daytime Accents" />

          <p class="mt-4 text-base text-body font-sans leading-relaxed">
            Phosphor green works in dark mode (CRT, Bloomberg, "the system is on"), but on a cream
            daytime background it reads "wellness brand" instead of "serious raven." Below are ten
            non-green accent options on the same light base. Same fonts, same spacing, same demo
            content — just the brand color shifts.
          </p>

          <div class="mt-4 bg-warning/10 border-l-4 border-warning rounded-r p-4">
            <div class="text-xs font-mono uppercase tracking-wide text-warning mb-1">
              ! Read in daylight
            </div>
            <div class="text-sm text-body font-sans">
              Each card below is forced to the light palette so you can compare side by side
              regardless of your current theme. Pick the one that says "serious technical reference"
              most clearly.
            </div>
          </div>
        </section>

        <!-- 10 variants -->
        {#each VARIANTS as v (v.id)}
          <div id="variant-{v.id}"></div>
          <PageSection title="{v.id} // {v.name}" meta={v.tag}>
            <div class="light-variant-base {v.cls}">
              <div
                class="rounded-lg p-6 border"
                style="background: var(--color-canvas); border-color: var(--color-border);"
              >
                <!-- Mini status bar -->
                <div
                  class="flex items-center justify-between text-xs font-mono text-muted border-b border-border pb-2 mb-5"
                >
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
                <div class="text-xs font-mono text-muted uppercase tracking-wide mb-2">
                  {DEMO.label}
                </div>
                <div class="text-2xl font-bold text-heading mb-2" role="heading" aria-level="3">
                  {DEMO.title}
                </div>
                <p class="text-base text-body font-sans leading-relaxed mb-5">{DEMO.lede}</p>

                <div class="space-y-1 text-sm font-mono mb-6 max-w-[28rem]">
                  {#each DEMO.meta as m (m.k)}
                    <div class="flex items-baseline justify-between gap-3">
                      <span class="text-muted w-32 flex-shrink-0">{m.k}</span>
                      <span class="text-body">{m.v}</span>
                    </div>
                  {/each}
                </div>

                <!-- CTAs — the spot the user said feels "nature site" today -->
                <div class="flex flex-wrap gap-2 mb-6">
                  <button
                    class="px-3 py-1.5 bg-accent text-canvas border border-accent rounded text-sm font-sans hover:opacity-90 transition-colors"
                    >[ Primary action → ]</button
                  >
                  <button
                    class="px-3 py-1.5 bg-surface border border-border rounded text-sm font-sans hover:border-accent transition-colors"
                    >[ Secondary ]</button
                  >
                  <button
                    class="px-3 py-1.5 bg-accent-subtle text-accent rounded text-sm font-sans hover:opacity-90 transition-colors"
                    >[ Tertiary ]</button
                  >
                </div>

                <!-- Recent activity -->
                <div
                  class="text-xs font-semibold text-muted uppercase tracking-wide mb-3"
                  role="heading"
                  aria-level="3"
                >
                  01 // Recent Activity
                </div>
                <div class="space-y-2 mb-6">
                  {#each DEMO.events as e (e.what)}
                    <div class="bg-surface border border-border rounded p-3 text-sm font-mono">
                      <span class="text-accent font-semibold">{e.agent}</span>
                      <span class="text-muted">·</span>
                      <span class="text-body">{e.project}</span>
                      <span class="text-muted">·</span>
                      <span class="text-muted">{e.when}</span>
                      <div class="text-muted text-xs mt-1">{e.what}</div>
                    </div>
                  {/each}
                </div>

                <!-- States — accent next to functional state colors -->
                <div
                  class="text-xs font-semibold text-muted uppercase tracking-wide mb-3"
                  role="heading"
                  aria-level="3"
                >
                  02 // States <span class="text-muted/60 font-normal normal-case"
                    >— state colors stay constant; accent shifts</span
                  >
                </div>
                <div class="flex flex-wrap gap-2 mb-6">
                  <span
                    class="px-2 py-0.5 text-xs font-mono bg-accent-subtle text-accent rounded uppercase tracking-wide"
                    >accent</span
                  >
                  <span
                    class="px-2 py-0.5 text-xs font-mono bg-success/15 text-success rounded uppercase tracking-wide"
                    >success</span
                  >
                  <span
                    class="px-2 py-0.5 text-xs font-mono bg-warning/15 text-warning rounded uppercase tracking-wide"
                    >warning</span
                  >
                  <span
                    class="px-2 py-0.5 text-xs font-mono bg-error/15 text-error rounded uppercase tracking-wide"
                    >error</span
                  >
                  <span
                    class="px-2 py-0.5 text-xs font-mono bg-info/15 text-info rounded uppercase tracking-wide"
                    >info</span
                  >
                </div>

                <!-- Health -->
                <div
                  class="text-xs font-semibold text-muted uppercase tracking-wide mb-3"
                  role="heading"
                  aria-level="3"
                >
                  03 // Health
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {#each DEMO.health as h (h.label)}
                    <div class="bg-surface border border-border rounded p-3">
                      <div class="text-xs text-muted uppercase tracking-wide mb-1">{h.label}</div>
                      <div class="text-base font-mono font-bold text-body">{h.value}</div>
                    </div>
                  {/each}
                </div>
              </div>
            </div>
          </PageSection>
        {/each}

        <PageSection title="11 // Pick one">
          <p class="text-base text-body font-sans leading-relaxed">
            Tell me which light accent you want to lock in (e.g. "L03"). Dark mode keeps phosphor
            green — the daytime variant is independent. The base bg/surface/text stays
            cream-and-black across all ten unless noted (L06 cools the paper, L10 warms it).
          </p>
        </PageSection>
      </main>
    </div>
  </div>
</PageLayout>
