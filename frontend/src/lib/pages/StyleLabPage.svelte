<script>
  /**
   * Style Lab — six different aesthetic treatments applied to the same
   * demo content. Built bigger (ANT-feel sizing) so it's actually legible.
   * Pick one, hate one, mix them — this is just the lab.
   */
  import { PageLayout, PageHeader, PageSection } from '../components/layout/index.js';

  // Same demo content rendered six different ways below.
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

  // Variant index — used for the TOC chip-row and the section anchors.
  const VARIANTS = [
    { id: 'terminal', n: '01', name: 'Terminal //', tag: 'numbered slash · current Raven' },
    { id: 'bracketed', n: '02', name: '[ Bracketed ]', tag: 'BBS amber · Bloomberg phosphor' },
    { id: 'outline', n: '03', name: '§ Outline', tag: 'engineering blueprint · ICS cyan' }
  ];
</script>

<PageLayout>
  <div class="space-y-12">

    <!-- Status bar -->
    <div class="flex items-center justify-between text-[12px] font-mono text-muted border-b border-border pb-2">
      <div class="flex items-center gap-2">
        <span class="text-accent font-semibold">RAVEN.SYSTEM</span>
        <span aria-hidden="true">::</span>
        <span class="uppercase tracking-wide">Style Lab</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-muted">Three vibes · same content · ANT-sized</span>
      </div>
    </div>

    <!-- Hero -->
    <section>
      <PageHeader title="Style Lab" />

      <p class="mt-4 text-[16px] text-body font-sans leading-relaxed">
        Three aesthetic treatments applied to the same dashboard. Variant 01 is current Raven; 02 and 03 are alternative directions. Everything below is built bigger than the rest of Raven on purpose — read first, optimize density later.
      </p>

      <div class="mt-6 flex flex-wrap gap-1.5">
        {#each VARIANTS as v (v.id)}
          <a
            href="#variant-{v.id}"
            class="px-3 py-1.5 text-[13px] font-mono bg-surface border border-border rounded hover:border-accent transition-colors"
          ><span class="text-accent">{v.n}</span> · {v.name}</a>
        {/each}
      </div>
    </section>

    <!-- =========================================================== -->
    <!-- VARIANT 01 — Terminal // (current Raven, for reference) -->
    <!-- =========================================================== -->
    <div id="variant-terminal"></div>
    <PageSection title="01 // Variant — Terminal //" meta="numbered slash · current Raven · for reference">

      <div class="bg-canvas border border-border rounded-lg p-6">
        <!-- Hero -->
        <div class="text-[11px] font-mono text-muted uppercase tracking-wide mb-2">{DEMO.label}</div>
        <div class="text-[20px] font-bold text-heading mb-2" role="heading" aria-level="3">{DEMO.title}</div>
        <p class="text-[14px] text-body font-sans leading-relaxed mb-6">{DEMO.lede}</p>

        <div class="space-y-1 text-[12px] font-mono mb-8 max-w-[28rem]">
          {#each DEMO.meta as m (m.k)}
            <div class="flex items-baseline gap-2">
              <span class="text-muted w-32 flex-shrink-0">{m.k}</span>
              <span class="flex-1 border-b border-dotted border-border mb-0.5"></span>
              <span class="text-body">{m.v}</span>
            </div>
          {/each}
        </div>

        <!-- Section: Recent Activity -->
        <div class="text-[11px] font-semibold text-muted uppercase tracking-wide mb-3" role="heading" aria-level="3">
          01 // Recent Activity
        </div>
        <div class="space-y-2 mb-8">
          {#each DEMO.events as e, i (i)}
            <div class="bg-surface border border-border rounded p-3 text-[13px] font-mono">
              <span class="text-accent">{e.agent}</span>
              <span class="text-muted">·</span>
              <span class="text-body">{e.project}</span>
              <span class="text-muted">·</span>
              <span class="text-muted">{e.when}</span>
              <div class="text-muted text-[12px] mt-1">{e.what}</div>
            </div>
          {/each}
        </div>

        <!-- Section: Health -->
        <div class="text-[11px] font-semibold text-muted uppercase tracking-wide mb-3" role="heading" aria-level="3">
          02 // Health
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {#each DEMO.health as h (h.label)}
            <div class="bg-surface border border-border rounded p-3">
              <div class="text-[10px] text-muted uppercase tracking-wide mb-1">{h.label}</div>
              <div class="text-[16px] font-mono font-bold text-body">{h.value}</div>
            </div>
          {/each}
        </div>
      </div>

    </PageSection>

    <!-- =========================================================== -->
    <!-- VARIANT 02 — Bracketed Console (Bloomberg / BBS amber) -->
    <!-- design-system-allow: hex (StyleLab is a sandbox; near-black phosphor
         canvas is intrinsic to this variant and not a Raven design token) -->
    <!-- =========================================================== -->
    <div id="variant-bracketed"></div>
    <PageSection title="02 // Variant — [ Bracketed Console ]" meta="BBS amber · Bloomberg terminal · phosphor">

      <div class="bg-[#0a0805] border border-warning/40 rounded-lg p-6">
        <!-- Hero -->
        <div class="text-[12px] font-mono text-warning/70 uppercase tracking-[0.2em] mb-2">{`[ ${DEMO.label.toUpperCase()} ]`}</div>
        <div class="text-[28px] font-mono font-bold text-warning uppercase tracking-wider mb-2" role="heading" aria-level="3">
          {DEMO.title}
        </div>
        <p class="text-[15px] font-mono text-warning/80 leading-relaxed mb-6">&gt; {DEMO.lede}</p>

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {#each DEMO.meta as m (m.k)}
            <div class="border border-warning/20 p-3">
              <div class="text-[11px] font-mono text-warning/60 uppercase tracking-widest">{m.k}</div>
              <div class="text-[20px] font-mono text-warning font-bold">{m.v}</div>
            </div>
          {/each}
        </div>

        <!-- Section: Recent Activity -->
        <div class="text-[14px] font-mono font-bold text-warning uppercase tracking-[0.2em] mb-3" role="heading" aria-level="3">
          [ 01 ]&nbsp;&nbsp;RECENT ACTIVITY
        </div>
        <div class="border border-warning/30 mb-8">
          {#each DEMO.events as e, i (i)}
            <div class="px-3 py-2 text-[14px] font-mono text-warning {i < DEMO.events.length - 1 ? 'border-b border-warning/20' : ''}">
              <span class="text-warning/60 uppercase">[{String(i + 1).padStart(2, '0')}]</span>
              <span class="ml-2 text-warning font-bold uppercase">{e.agent}</span>
              <span class="text-warning/40 mx-2">»</span>
              <span class="text-warning uppercase">{e.project}</span>
              <span class="text-warning/40 mx-2">·</span>
              <span class="text-warning/60">{e.when.toUpperCase()}</span>
              <div class="text-warning/70 text-[13px] mt-1 ml-9">{e.what}</div>
            </div>
          {/each}
        </div>

        <!-- Section: Health -->
        <div class="text-[14px] font-mono font-bold text-warning uppercase tracking-[0.2em] mb-3" role="heading" aria-level="3">
          [ 02 ]&nbsp;&nbsp;HEALTH
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {#each DEMO.health as h (h.label)}
            <div class="border border-warning/30 p-3">
              <div class="text-[11px] font-mono text-warning/60 uppercase tracking-widest mb-1">{h.label}</div>
              <div class="text-[22px] font-mono font-bold text-warning">{h.value}</div>
            </div>
          {/each}
        </div>
      </div>

    </PageSection>

    <!-- =========================================================== -->
    <!-- VARIANT 03 — § Outline (engineering blueprint) -->
    <!-- =========================================================== -->
    <div id="variant-outline"></div>
    <PageSection title="03 // Variant — § Outline" meta="engineering blueprint · ICS cyan · technical doc">

      <div class="bg-canvas border-l-2 border-info p-6">
        <!-- Hero -->
        <div class="flex items-center gap-3 mb-3">
          <span class="text-[14px] font-mono text-info">§ 00.0</span>
          <div class="flex-1 h-px bg-info/30"></div>
          <span class="text-[12px] font-mono text-info/60 uppercase tracking-wide">Overview</span>
        </div>
        <div class="text-[26px] font-mono text-heading mb-2" role="heading" aria-level="3">{DEMO.title}</div>
        <p class="text-[15px] font-mono text-body leading-relaxed mb-6">{DEMO.lede}</p>

        <table class="text-[14px] font-mono mb-8 w-full max-w-[32rem]">
          <tbody>
            {#each DEMO.meta as m (m.k)}
              <tr class="border-b border-info/15">
                <td class="text-info/70 py-2 pr-4 w-32">{m.k.toLowerCase()}</td>
                <td class="text-body py-2">{m.v}</td>
              </tr>
            {/each}
          </tbody>
        </table>

        <!-- Section: Recent Activity -->
        <div class="flex items-center gap-3 mb-4">
          <span class="text-[14px] font-mono text-info">§ 01.0</span>
          <div class="flex-1 h-px bg-info/30"></div>
          <span class="text-[14px] font-mono text-info uppercase tracking-wide">Recent Activity</span>
        </div>
        <table class="w-full text-[14px] font-mono mb-8 border-collapse">
          <thead>
            <tr class="border-b-2 border-info/40 text-info/70 text-left">
              <th class="py-2 pr-4 font-normal text-[12px] uppercase tracking-wider">§</th>
              <th class="py-2 pr-4 font-normal text-[12px] uppercase tracking-wider">Agent</th>
              <th class="py-2 pr-4 font-normal text-[12px] uppercase tracking-wider">Project</th>
              <th class="py-2 pr-4 font-normal text-[12px] uppercase tracking-wider">When</th>
              <th class="py-2 font-normal text-[12px] uppercase tracking-wider">Action</th>
            </tr>
          </thead>
          <tbody>
            {#each DEMO.events as e, i (i)}
              <tr class="border-b border-info/15">
                <td class="py-2 pr-4 text-info/60">01.{i + 1}</td>
                <td class="py-2 pr-4 text-heading">{e.agent}</td>
                <td class="py-2 pr-4 text-body">{e.project}</td>
                <td class="py-2 pr-4 text-muted">{e.when}</td>
                <td class="py-2 text-body">{e.what}</td>
              </tr>
            {/each}
          </tbody>
        </table>

        <!-- Section: Health -->
        <div class="flex items-center gap-3 mb-4">
          <span class="text-[14px] font-mono text-info">§ 02.0</span>
          <div class="flex-1 h-px bg-info/30"></div>
          <span class="text-[14px] font-mono text-info uppercase tracking-wide">Health</span>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {#each DEMO.health as h, i (h.label)}
            <div class="border-l-2 border-info p-3 bg-surface-2/30">
              <div class="text-[11px] font-mono text-info/70 uppercase tracking-widest mb-1">§ 02.{i + 1} {h.label}</div>
              <div class="text-[24px] font-mono text-body">{h.value}</div>
            </div>
          {/each}
        </div>
      </div>

    </PageSection>


    <!-- Footer note -->
    <PageSection title="04 // Pick one">
      <p class="text-[15px] text-body font-sans leading-relaxed">
        Variant 01 is current Raven. Variants 02 and 03 are the two alternative directions still on the table — tell me which one you want me to expand across a real page (Overview, System, Activity) so we can see it at full scale. The winner becomes the new Raven baseline; the runner-up could land as an opt-in theme variant in <code class="font-mono text-[13px] bg-surface-2 px-1.5 py-0.5 rounded">Settings</code>.
      </p>
    </PageSection>

  </div>
</PageLayout>
