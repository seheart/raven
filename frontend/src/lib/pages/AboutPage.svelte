<script>
  import { onMount } from 'svelte';
  import { logger } from '../logger.js';
  import { createPageApi } from '../apiClient.js';
  import { PageLayout, PageHeader, PageSection, ProseBlock } from '../components/layout/index.js';
  import { websocketService } from '../services/websocket.js';
  import MermaidDiagram from '../components/MermaidDiagram.svelte';
  import {
    HERO,
    PERSONAS,
    NOT_FOR,
    QUICKSTART,
    WHY,
    DIFFERENTIATORS,
    ARCHITECTURE_DIAGRAM,
    ROLES,
    OPERATION_STEPS,
    RESOLVED_DECISIONS,
    STILL_OPEN,
    PRINCIPLES,
    MANIFEST
  } from '../content/about.js';

  const { api, abort: abortRequests } = createPageApi();

  /** @type {{platform_label?:string, agent_count?:number, table_count?:number, endpoint_count?:number, uptime_seconds?:number}|null} */
  let intro = $state(null);
  let websocketConnected = $state(false);

  /** @param {number|null|undefined} s */
  function fmtUptime(s) {
    if (s == null) return '—';
    const sec = Math.floor(s);
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  function copyCode(text, evt) {
    if (!navigator?.clipboard) return;
    navigator.clipboard.writeText(text).then(() => {
      const btn = evt?.currentTarget;
      if (!btn) return;
      const prev = btn.textContent;
      btn.textContent = 'copied';
      setTimeout(() => { btn.textContent = prev; }, 1200);
    }).catch(() => {});
  }

  // semantic color → border + accent text class for role/diff cards
  const COLOR_CLASS = {
    accent: 'border-l-accent text-accent',
    success: 'border-l-success text-success',
    warning: 'border-l-warning text-warning',
    info: 'border-l-info text-info'
  };
  function colorClass(c) { return COLOR_CLASS[c] || COLOR_CLASS.accent; }

  async function loadAll() {
    try {
      intro = await api.get('/system/introspection');
    } catch (err) {
      logger.error('About page failed to load:', err);
    }
  }

  onMount(() => {
    loadAll();
    websocketConnected = websocketService.isConnected();
    const updateStatus = () => { websocketConnected = websocketService.isConnected(); };
    websocketService.on('connect', updateStatus);
    websocketService.on('disconnect', updateStatus);
    return () => {
      abortRequests();
      websocketService.off('connect', updateStatus);
      websocketService.off('disconnect', updateStatus);
    };
  });
</script>

<PageLayout>
  <div class="space-y-12">

    <!-- Status bar -->
    <div class="flex items-center justify-between text-xs font-mono text-muted border-b border-border pb-2">
      <div class="flex items-center gap-2">
        <span class="text-accent font-semibold">RAVEN.SYSTEM</span>
        <span aria-hidden="true">::</span>
        <span class="uppercase tracking-wide">v{MANIFEST.find(m => m.k === 'Version')?.v} · {MANIFEST.find(m => m.k === 'License')?.v} · local-first</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="w-1.5 h-1.5 rounded-full {websocketConnected ? 'bg-success animate-pulse' : 'bg-warning'}"></span>
        <span class="uppercase tracking-wide {websocketConnected ? 'text-success' : 'text-warning'}">
          {websocketConnected ? 'Operational' : 'Disconnected'}
        </span>
      </div>
    </div>

    <!-- Hero — two-column: prose-heavy main + actions aside -->
    <section class="flex flex-col lg:flex-row gap-8">
      <!-- Main column -->
      <div class="flex-1 min-w-0 max-w-[48rem]">
        <PageHeader title="Raven" description={HERO.title} />

        <p class="mt-4 text-base text-body font-sans leading-relaxed">{HERO.lede}</p>

        <div class="mt-6 space-y-1.5 text-sm font-mono">
          <div class="flex items-baseline gap-2">
            <span class="text-muted w-32 flex-shrink-0">What it is</span>
            <span class="flex-1 border-b border-dotted border-border mb-0.5"></span>
            <span class="text-body flex-1 min-w-0">{HERO.whatItIs}</span>
          </div>
          <div class="flex items-baseline gap-2">
            <span class="text-muted w-32 flex-shrink-0">What it does</span>
            <span class="flex-1 border-b border-dotted border-border mb-0.5"></span>
            <span class="text-body flex-1 min-w-0">{HERO.whatItDoes}</span>
          </div>
        </div>

        <div class="mt-4 bg-warning/10 border-l-4 border-warning rounded-r p-4">
          <div class="text-xs font-mono uppercase tracking-wide text-warning mb-1">! What it doesn't do</div>
          <div class="text-sm text-body font-sans">{HERO.whatItDoesnt}</div>
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
      </div>

      <!-- Aside: quick actions -->
      <aside class="lg:w-72 lg:flex-shrink-0">
        <div class="bg-surface border border-border rounded-lg p-4 lg:sticky lg:top-20">
          <div class="text-xs font-mono uppercase tracking-wide text-muted mb-3">Get started</div>
          <div class="flex flex-col gap-1.5">
            <a href="/overview" class="text-sm font-sans px-3 py-2 bg-accent text-canvas rounded text-center hover:opacity-90 transition-opacity">Open dashboard →</a>
            <a href="#sect-quickstart" class="text-sm font-sans px-3 py-2 bg-canvas border border-border rounded text-center hover:border-accent transition-colors">Quick start</a>
            <a href="/system" class="text-sm font-sans px-3 py-2 bg-canvas border border-border rounded text-center hover:border-accent transition-colors">System diagnostics</a>
            <a href="https://github.com/seheart/raven" target="_blank" rel="noopener noreferrer" class="text-sm font-sans px-3 py-2 bg-canvas border border-border rounded text-center hover:border-accent transition-colors">★ GitHub</a>
          </div>
          <div class="mt-4 pt-4 border-t border-border text-xs font-mono text-muted leading-relaxed">
            MIT · single repo<br/>
            no agreement to sign
          </div>
        </div>
      </aside>
    </section>

    <!-- 01 // Who this is for -->
    <PageSection title="01 // Who this is for">
      <ProseBlock>
        <p class="text-sm text-muted font-sans mb-4">Four people we built this for. If you're one of them, you'll know in two paragraphs.</p>
      </ProseBlock>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        {#each PERSONAS as p (p.tag)}
          <div class="bg-surface border border-border rounded-lg p-4">
            <div class="text-xs font-mono uppercase tracking-wide text-accent mb-2">{p.tag}</div>
            <h3 class="text-sm font-semibold text-heading mb-2">{p.headline}</h3>
            <p class="text-sm text-body font-sans leading-relaxed mb-3">{p.body}</p>
            <ul class="text-xs font-mono text-muted space-y-1 list-none">
              {#each p.fits as f (f)}
                <li class="pl-3 relative before:content-['→'] before:absolute before:left-0 before:text-accent">{f}</li>
              {/each}
            </ul>
          </div>
        {/each}
      </div>
    </PageSection>

    <!-- 02 // Who this isn't for -->
    <PageSection title="02 // Who this isn't for" meta="filter early — save us both time">
      <ProseBlock>
        <p class="text-sm text-body font-sans mb-4">Honest filter. Raven optimizes hard for the personas above and that means real trade-offs against everyone else.</p>
      </ProseBlock>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        {#each NOT_FOR as n (n.who)}
          <div class="bg-surface border border-dashed border-border rounded-lg p-4">
            <div class="text-xs font-mono uppercase tracking-wide text-muted mb-1">Not for</div>
            <h3 class="text-sm font-semibold text-heading mb-2">{n.who}</h3>
            <p class="text-sm text-body font-sans leading-relaxed">{n.why}</p>
          </div>
        {/each}
      </div>
    </PageSection>

    <!-- 03 // Quick start -->
    <PageSection title="03 // Quick start" meta="three commands · under 2 minutes">
      <div id="sect-quickstart" class="space-y-3">
        {#each QUICKSTART as s (s.step)}
          <div class="bg-surface border border-border rounded-lg p-4 flex gap-4">
            <div class="font-mono text-2xl font-bold text-accent w-12 flex-shrink-0">{s.step}</div>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-semibold text-heading mb-1">{s.title}</div>
              <p class="text-sm text-body font-sans leading-relaxed mb-3">{s.body}</p>
              <div class="relative">
                <pre class="bg-canvas border border-border rounded p-3 text-xs font-mono text-body overflow-x-auto"><code>{s.code}</code></pre>
                <button
                  type="button"
                  onclick={(e) => copyCode(s.code, e)}
                  class="absolute top-2 right-2 px-2 py-0.5 text-xs font-mono text-muted hover:text-accent bg-surface border border-border rounded"
                  aria-label="Copy command"
                >copy</button>
              </div>
            </div>
          </div>
        {/each}
      </div>
    </PageSection>

    <!-- 04 // Why this exists -->
    <PageSection title="04 // Why this exists">
      <ProseBlock>
        <div class="space-y-3 text-sm text-body font-sans leading-relaxed">
          {#each WHY as p, i (i)}
            <p class={i === 0 ? 'text-base' : ''}>{p}</p>
          {/each}
        </div>
      </ProseBlock>
    </PageSection>

    <!-- 05 // What makes it different -->
    <PageSection title="05 // What makes it different">
      <ProseBlock>
        <p class="text-sm text-body font-sans mb-4">Five things that set Raven apart from generic monitoring tools. Each maps to a load-bearing architectural choice.</p>
      </ProseBlock>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        {#each DIFFERENTIATORS as d, i (d.name)}
          <div class="bg-surface border border-border rounded-lg p-4">
            <div class="flex items-baseline justify-between gap-3 mb-2">
              <span class="text-sm font-semibold text-accent">{d.name}</span>
              <span class="text-xs font-mono text-muted">{String(i + 1).padStart(2, '0')}/0{DIFFERENTIATORS.length}</span>
            </div>
            <p class="text-sm text-body font-sans leading-relaxed">{d.body}</p>
          </div>
        {/each}
      </div>
    </PageSection>

    <!-- 06 // Architecture -->
    <PageSection title="06 // Architecture">
      <ProseBlock>
        <p class="text-sm text-muted font-sans mb-4">One pass through the system. Watchers observe, the database accumulates, the trigger and insights tiers analyze, the broadcaster pushes to the dashboard.</p>
      </ProseBlock>

      <div class="bg-surface border border-border rounded-lg p-6 mb-6">
        <MermaidDiagram source={ARCHITECTURE_DIAGRAM} ariaLabel="Raven architecture flow">
          {#snippet fallback()}
            <p class="text-sm text-muted font-sans">
              Diagram failed to render. Flow: Claude / Codex / Ollama session logs and your working tree feed the watcher tier; watchers write into SQLite; the trigger engine and (optional) insights service read events and emit warnings; the Socket.IO broadcaster pushes updates to the Svelte dashboard at <code class="text-body">:9000</code>.
            </p>
          {/snippet}
        </MermaidDiagram>
      </div>

      <ProseBlock>
        <h3 class="text-sm font-semibold text-heading mb-3">Roles</h3>
        <p class="text-sm text-muted font-sans mb-4">Each tier has one job. Watchers don't know about the database; the trigger engine doesn't know about the dashboard.</p>
      </ProseBlock>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        {#each ROLES as r (r.role)}
          <div class="bg-surface border border-border border-l-4 {colorClass(r.color).split(' ')[0]} rounded-r-lg p-4">
            <div class="flex items-baseline justify-between gap-3 mb-1">
              <span class="text-sm font-semibold {colorClass(r.color).split(' ')[1]}">{r.role}</span>
              <span class="text-xs font-mono text-muted">{r.tagline}</span>
            </div>
            <div class="text-xs font-mono text-muted mb-3"><code>{r.impl}</code></div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <div class="text-xs font-mono uppercase tracking-wide text-success mb-1">Does</div>
                <ul class="text-sm font-sans text-body space-y-1 list-none">
                  {#each r.does as d (d)}
                    <li class="pl-3 relative before:content-['+'] before:absolute before:left-0 before:text-success">{d}</li>
                  {/each}
                </ul>
              </div>
              <div>
                <div class="text-xs font-mono uppercase tracking-wide text-error mb-1">Doesn't</div>
                <ul class="text-sm font-sans text-muted space-y-1 list-none">
                  {#each r.doesNot as d (d)}
                    <li class="pl-3 relative before:content-['−'] before:absolute before:left-0 before:text-error">{d}</li>
                  {/each}
                </ul>
              </div>
            </div>
          </div>
        {/each}
      </div>
    </PageSection>

    <!-- 07 // How it operates -->
    <PageSection title="07 // How it operates">
      <div class="space-y-4">
        {#each OPERATION_STEPS as step, i (step.title)}
          <div class="flex gap-4">
            <div class="font-mono text-2xl font-bold text-accent w-12 flex-shrink-0">{String(i + 1).padStart(2, '0')}</div>
            <div class="flex-1 pt-1">
              <div class="text-sm font-semibold text-heading mb-1">{step.title}</div>
              <p class="text-sm text-body font-sans leading-relaxed">{step.body}</p>
            </div>
          </div>
        {/each}
      </div>
    </PageSection>

    <!-- 08 // System Telemetry -->
    <PageSection title="08 // System Telemetry" meta="live · this instance">
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {#each [
          { label: 'Agents tracked', value: intro?.agent_count },
          { label: 'DB tables', value: intro?.table_count },
          { label: 'API endpoints', value: intro?.endpoint_count },
          { label: 'Uptime', value: fmtUptime(intro?.uptime_seconds) }
        ] as stat (stat.label)}
          <div class="bg-surface border border-border rounded-lg p-4">
            <div class="text-xs text-muted uppercase tracking-wide mb-2">{stat.label}</div>
            <div class="font-mono text-2xl font-bold text-body">{stat.value ?? '—'}</div>
          </div>
        {/each}
      </div>
      {#if intro?.platform_label}
        <p class="mt-3 text-xs font-mono text-muted">Running on {intro.platform_label}</p>
      {/if}
    </PageSection>

    <!-- 09 // Decisions -->
    <PageSection title="09 // Decisions" meta="an audit trail of architectural choices">
      <ProseBlock>
        <h3 class="text-sm font-semibold text-heading mb-2">Decisions made</h3>
        <p class="text-sm text-muted font-sans mb-4">The questions we walked through and the calls we made. Preserved as an audit trail — if a decision turns out wrong later, the original framing is still here.</p>
      </ProseBlock>
      <div class="space-y-3 mb-8">
        {#each RESOLVED_DECISIONS as d, i (d.q)}
          <div class="bg-surface border border-border rounded-lg p-4">
            <div class="text-sm font-semibold text-accent mb-2">{i + 1}. {d.q}</div>
            <p class="text-sm text-body font-sans leading-relaxed mb-2">{d.decision}</p>
            {#if d.alternatives}
              <p class="text-sm font-sans text-muted mb-2"><span class="font-semibold">Alternatives considered:</span> {d.alternatives}</p>
            {/if}
            <div class="text-xs font-mono text-muted">Lives at <code class="text-body">{d.livesAt}</code></div>
          </div>
        {/each}
      </div>

      <ProseBlock>
        <h3 class="text-sm font-semibold text-heading mb-2">Still open</h3>
        <p class="text-sm text-muted font-sans mb-4">Items intentionally parked. Each has a clear shape and a reason for the deferral.</p>
      </ProseBlock>
      <div class="space-y-3">
        {#each STILL_OPEN as q (q.q)}
          <div class="bg-surface border border-dashed border-border rounded-lg p-4">
            <div class="text-sm font-semibold text-heading mb-1">{q.q}</div>
            <p class="text-sm text-body font-sans leading-relaxed">{q.note}</p>
          </div>
        {/each}
      </div>
    </PageSection>

    <!-- 10 // Principles -->
    <PageSection title="10 // Principles">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        {#each PRINCIPLES as p, i (p.name)}
          <div class="bg-surface border border-border rounded-lg p-4">
            <div class="flex items-baseline justify-between gap-3 mb-2">
              <span class="text-sm font-semibold text-accent">{p.name}</span>
              <span class="text-xs font-mono text-muted">{String(i + 1).padStart(2, '0')}/0{PRINCIPLES.length}</span>
            </div>
            <p class="text-sm text-body font-sans leading-relaxed">{p.body}</p>
          </div>
        {/each}
      </div>
    </PageSection>

    <!-- 11 // Try it -->
    <PageSection title="11 // Try it">
      <ProseBlock>
        <p class="text-base text-body font-sans leading-relaxed mb-4">If you got this far and any of the four personas above sounded like you — clone it, run it, see what it catches on a project you've forgotten about. <a href="https://github.com/seheart/raven" target="_blank" rel="noopener noreferrer" class="text-accent hover:underline">github.com/seheart/raven</a> — MIT, single repo, no agreement to sign.</p>
      </ProseBlock>
      <div class="flex flex-wrap gap-2">
        <a href="https://github.com/seheart/raven" target="_blank" rel="noopener noreferrer" class="px-3 py-1.5 bg-accent text-canvas border border-accent rounded text-sm font-sans hover:opacity-90 transition-colors">[ ★ Star on GitHub ]</a>
        <a href="#sect-quickstart" class="px-3 py-1.5 bg-surface border border-border rounded text-sm font-sans hover:border-accent transition-colors">[ Quick start ↑ ]</a>
        <a href="/overview" class="px-3 py-1.5 bg-surface border border-border rounded text-sm font-sans hover:border-accent transition-colors">[ Live dashboard → ]</a>
        <a href="/system" class="px-3 py-1.5 bg-surface border border-border rounded text-sm font-sans hover:border-accent transition-colors">[ System ]</a>
      </div>
    </PageSection>

    <!-- 12 // Manifest -->
    <PageSection title="12 // Manifest">
      <ProseBlock>
        <div class="space-y-1.5 text-sm font-mono">
          {#each MANIFEST as row (row.k)}
            <div class="flex items-baseline gap-2">
              <span class="text-muted w-24 flex-shrink-0">{row.k}</span>
              <span class="flex-1 border-b border-dotted border-border mb-0.5"></span>
              {#if row.link}
                <a href={row.link} target="_blank" rel="noopener noreferrer" class="text-accent hover:underline">{row.v}</a>
              {:else}
                <span class="text-body">{row.v}</span>
              {/if}
            </div>
          {/each}
        </div>
      </ProseBlock>
    </PageSection>

  </div>
</PageLayout>
