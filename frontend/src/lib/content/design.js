/**
 * Static content for the Design System page. Same pattern as content/about.js
 * and content/system.js — data lives here, the .svelte file iterates.
 *
 * Live demos (forms, buttons, tables, badges) stay in the page itself
 * because they exercise real DOM/components.
 */

// === Hero ===
export const HERO = {
  title: 'Design System',
  lede: 'The reference for everything Raven looks like and how to build new screens that fit. Read Intent first, then Composed Patterns to see the vocabulary in use. Every section below is itself built from the patterns it documents.',
  meta: [
    { k: 'Sections', v: '10 · scroll to browse' },
    { k: 'Aesthetic', v: 'Quiet · dense · technical · live' },
    { k: 'Brand', v: 'Ink black on cream by day · phosphor green on raven black by night' },
    { k: 'Theme', v: 'Light · Dark · toggle in footer' }
  ],
  badges: [
    {
      label: 'LOCAL-FIRST',
      items: ['No tracker pixels', 'No CDN webfonts (after first paint)', 'Built to render offline']
    }
  ]
};

// === 00 Intent ===
export const INTENT = {
  manifesto:
    "Raven looks like the data it shows — terse, technical, dense. Every screen is a tail of facts, not a pitch deck. Decoration is a cost paid against legibility, so we don't pay it. New screens should feel like a continuation of the System page, not a riff on it.",

  adjectives: ['Terse', 'Dense', 'Technical', 'Quiet', 'Live'],

  // Pairs lock the visual register: what to do, what to avoid.
  tension: [
    { do: 'Mono for technical content', not: 'Mono for prose' },
    {
      do: 'Label + value rows (value fills, or right-aligns when short)',
      not: 'Dotted leaders that shove the value to mid-screen'
    },
    { do: 'Pulsing dot for live state', not: 'Spinners' },
    { do: 'One bordered card per logical group', not: 'Shadowed elevation' },
    { do: 'Numbered dividers (01 // …)', not: '"Section 1: …" prose headings' },
    { do: 'Border-l-4 for severity callouts', not: 'Full-color background flood' },
    { do: 'Tinted-bg pills for status', not: 'Solid blocks of color' },
    { do: 'PageSection for grouping', not: 'Hand-rolled headings' }
  ],

  // Vocabulary the system uses for itself. Use the left column. Avoid the right.
  tone: [
    { use: 'event', not: 'record', why: 'events are append-only; record implies mutability' },
    { use: 'agent', not: 'bot', why: 'these are AI coding agents, not chatbots' },
    { use: 'session', not: 'run', why: 'a session is bounded by an agent lifecycle' },
    { use: 'project', not: 'workspace', why: 'workspace implies multi-user' },
    { use: 'watcher', not: 'listener', why: "watchers don't react; they observe" },
    { use: 'captured', not: 'logged', why: 'logged implies a side effect; captured is passive' },
    { use: 'live', not: 'real-time', why: 'real-time is overloaded; live is unambiguous' },
    { use: 'observe', not: 'monitor', why: 'monitor implies action; observe is passive' },
    { use: 'diff', not: 'change', why: 'a diff is the artifact; change is what you do to it' },
    { use: 'inference', not: 'call', why: 'inference is what an LLM does; call is what code does' }
  ],

  // References for finding inspiration in the right corner of style space.
  touchstones: [
    {
      name: 'Bloomberg Terminal',
      body: 'Dense, mono, every cell carries information. Not pretty — informative. The benchmark for "I came here to read data, not be marketed to."'
    },
    {
      name: 'Datadog APM',
      body: 'Calm operational chrome with a live indicator that never overwhelms the data. Demonstrates that "live" can be ambient, not anxious.'
    },
    {
      name: 'Linear',
      body: 'Bracketed actions, calm dark UI, Inter + JetBrains Mono pairing. Proves that minimal can still feel polished.'
    },
    {
      name: 'Palantir Foundry / Sightline',
      body: "Strict typographic hierarchy with semantic color discipline — the rigor we keep. (Raven shipped a Foundry-violet draft early on; it's now phosphor green on black, but the typographic discipline is unchanged.)"
    }
  ],

  // Folder convention. Find a file, find the layer.
  folders: [
    {
      path: 'lib/components/layout/',
      what: 'Page chrome — PageLayout, PageHeader, PageSection. The five-zone shell every page wears.'
    },
    {
      path: 'lib/components/ui/',
      what: 'Small reusable primitives — RefreshButton, ToolbarButton, FilterToggle, TabButton, EmptyState, LoadingState. Coverage enforced by validate:design-coverage.'
    },
    {
      path: 'lib/pages/',
      what: 'One Svelte file per route. Iterates over content/, never holds large data inline.'
    },
    {
      path: 'lib/content/',
      what: 'Data-only modules — about.js, system.js, design.js. Pages iterate over these arrays.'
    },
    {
      path: 'lib/utils/',
      what: 'Pure helpers — chartUtils, formatUtils, numberFormat, createPageApi. No DOM, no side effects beyond what the name implies.'
    },
    {
      path: 'lib/styles/',
      what: 'Global stylesheets only — animations, livepage chrome, the style-lab variant scopes. Page-level <style> blocks are forbidden by validate:patterns on migrated pages.'
    }
  ]
};

// === 01 Composed Patterns — subgroups ===
export const PATTERN_SUBGROUPS = [
  { tag: 'A', name: 'Chrome', desc: 'Page frame: status bar, hero, sections, callouts' },
  { tag: 'B', name: 'Data', desc: 'Tables, forms, badges, cards, status pills' },
  { tag: 'C', name: 'Live', desc: 'Things that breathe — pulsing dots, websocket status' },
  { tag: 'D', name: 'Utilities', desc: 'The DRY layer — primitives in lib/components/ui/' }
];

// Named primitive list — used in subgroup D.
export const PRIMITIVES = [
  {
    name: 'PageLayout',
    variants: ['default', 'dashboard'],
    use: 'Canonical shell. Default for content pages, dashboard for full-bleed live pages.'
  },
  {
    name: 'PageHeader',
    variants: ['(props: title, description, actions)'],
    use: 'h1 + description + optional actions snippet.'
  },
  {
    name: 'PageSection',
    variants: ['(props: title, meta)'],
    use: 'Numbered uppercase muted label + slotted body.'
  },
  {
    name: 'ProseBlock',
    variants: ['default (42rem)', 'wide (48rem)'],
    use: 'Reading-width container. Wrap prose-heavy units (heros, manifestos, principle bodies) inside otherwise full-bleed pages. Data UI — tables, grids, charts — stays full width.'
  },
  {
    name: 'RefreshButton',
    variants: ['(props: onClick, loading, label)'],
    use: 'Canonical refresh button used in most page headers. Has built-in loading state.'
  },
  {
    name: 'ToolbarButton',
    variants: ['default', 'primary', 'danger'],
    use: 'Secondary toolbar action (Export, Auto-refresh, Filter). One styling source for all toolbar buttons.'
  },
  {
    name: 'FilterToggle',
    variants: ['(props: active, onClick)'],
    use: 'Bordered active/inactive filter pill — severity filters, search-type toggles.'
  },
  {
    name: 'TabButton',
    variants: ['(props: active, onClick)'],
    use: 'Connected tab segment for time-range pickers (Today / 7d / 30d / All).'
  },
  {
    name: 'EmptyState',
    variants: ['default', 'compact'],
    use: 'Centered no-data card. Use for "no events match these filters" — never silently filtered out.'
  },
  {
    name: 'LoadingState',
    variants: ['(props: message)'],
    use: 'Centered spinner card while initial data loads. Same shell as EmptyState; semantically distinct.'
  },
  {
    name: 'DataFetchError',
    variants: ['(props: endpoint, message, hint, onRetry)'],
    use: 'Inline error card for a failed fetch. Names the endpoint, shows the raw error as a hint, and offers a retry — replaces a silent empty state when a request fails.'
  },
  {
    name: 'FreshnessBadge',
    variants: ['live', 'polled'],
    use: 'Small "updated Ns ago / live" indicator for data surfaces, so the user can tell streaming data from a periodic poll.'
  },
  {
    name: 'LinkButton',
    variants: ['default', 'primary', '(props: href, external)'],
    use: 'Anchor styled as a button — internal routes or external links. Used for hero action rows (About "Get started").'
  }
];

// === 02 Page Architecture ===
export const PAGE_ZONES = [
  {
    tag: '01',
    name: 'Status bar',
    purpose: 'Brand prompt + page label + live status',
    body: 'Top of every content page. RAVEN.SYSTEM :: PAGE LABEL on the left, websocket-connected dot on the right. Pulses when alive, dim when disconnected.'
  },
  {
    tag: '02',
    name: 'Hero',
    purpose: 'Single column: title, lede, meta rows, callouts',
    body: 'A constrained single column (`max-w-[48rem]`) holding PageHeader + lede + label/value meta rows + callouts + LOCAL-FIRST badge. Meta rows are a simple flex: a fixed-width `text-muted` label and a `flex-1` value that fills the line (or `justify-between` when the value is short). Anything that used to live in a right-rail aside — vital stats, quick actions, legends — now folds inline as a stat strip, an action row, or its own numbered section below. No side rail.'
  },
  {
    tag: '03',
    name: 'Numbered sections',
    purpose: 'PageSection per logical block',
    body: 'Each section gets a `01 // Title` heading via PageSection. Numbers run sequentially. Optional `meta` adds a one-line caveat or live count next to the title.'
  },
  {
    tag: '04',
    name: 'Sub-blocks',
    purpose: 'h3 for divisions inside a section',
    body: "Inside a PageSection, use h3 with `text-sm font-semibold text-heading mb-3` for sub-divisions. Don't hand-roll a second numbered scheme; sub-blocks are flat."
  },
  {
    tag: '04½',
    name: 'Reading width',
    purpose: 'Cap long-form text so lines stay legible',
    body: 'Long reference pages (Design, About, System) run a single scrolling column capped at `max-w-[64rem]`. Wrap prose paragraphs that would otherwise stretch past ~90 characters in `<ProseBlock>`; data UI (tables, grids, charts) stays full width. No sticky jump-nav or side rail — sections read top to bottom.'
  },
  {
    tag: '05',
    name: 'Footer',
    purpose: 'Global · lives in PageLayout',
    body: 'Footer is shared chrome — version, session ID, theme toggle, GitHub link, monitoring status. Pages do not render their own footer; it comes from the layout.'
  }
];

export const PAGE_SKELETON = `<PageLayout>
  <div class="space-y-8">

    <!-- 01 Status bar — full-width metadata strip -->
    <div class="flex items-center justify-between text-xs font-mono text-muted border-b border-border pb-2">
      <div class="flex items-center gap-2">
        <span class="text-accent font-semibold">RAVEN.SYSTEM</span>
        <span aria-hidden="true">::</span>
        <span class="uppercase tracking-wide">Page label</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></span>
        <span class="uppercase tracking-wide text-success">Operational</span>
      </div>
    </div>

    <!-- 02 Hero — single column, capped to a readable width -->
    <section class="max-w-[48rem]">
      <PageHeader title="Page" description="One-line description." />
      <!-- lede paragraph, label/value meta rows, callouts, badges go here.
           Anything that was a right-rail aside (stats, actions, legend)
           folds inline below as a strip, an action row, or its own
           numbered section. -->
    </section>

    <!-- 03 Numbered sections -->
    <PageSection title="01 // First section" meta="optional caveat">
      <!-- block content; wrap prose paragraphs in <ProseBlock> if they
           would otherwise stretch past ~90 characters -->
    </PageSection>

    <PageSection title="02 // Second section">
      <!-- ... -->
    </PageSection>

  </div>
</PageLayout>`;

// === 03 States ===
export const STATES = [
  {
    tag: 'EMPTY',
    primitive: '<EmptyState>',
    desc: 'Icon + title + description + optional actions snippet. Use for "no events match these filters" — direct, dignified, no decorative illustrations.',
    demo: { kind: 'empty' }
  },
  {
    tag: 'LIVE',
    primitive: 'pulsing dot + text',
    desc: 'A pulsing 6px circle (Tailwind w-1.5 h-1.5) on success-green. Reserved for "I\'m alive" — running agent, polling job, websocket connected. Never a spinner.',
    demo: { kind: 'live' }
  },
  {
    tag: 'LOADING',
    primitive: '<LoadingState>',
    desc: 'Centered spinner card while initial data loads. Same shell as EmptyState; semantically distinct so screen readers can tell them apart.',
    demo: { kind: 'loading' }
  },
  {
    tag: 'ERROR',
    primitive: 'border-l-4 callout',
    desc: 'Severity tag, raw error in mono, optional diagnostic command in dim mono. The operator should be able to copy and run.',
    demo: { kind: 'error' }
  },
  {
    tag: 'ACTION',
    primitive: 'border-l-4 callout',
    desc: 'After a successful POST, surface a confirmation callout at the top of the destination page. Replaces toast notifications — no global toast layer.',
    demo: { kind: 'action' }
  },
  {
    tag: 'MISSING',
    primitive: 'dim row + status pill',
    desc: "For things-that-should-be-there-but-aren't (a project whose path no longer exists, an agent whose model is gone). Never silently filtered out.",
    demo: { kind: 'missing' }
  }
];

// === 04 Colors ===

// Why the brand is what it is. Goes above the token tables so the
// reader sees the rationale before the swatches.
export const PHOSPHOR_RATIONALE = {
  headline: 'Two palettes, one identity — ink black by day, phosphor green by night',
  body: "A raven is mostly black, with one bright tell on the wing when light hits it. The two modes inherit that idea differently. Daytime is letterpress on cream paper — pure ink black is the brand, and the live tell is just typographic weight; phosphor green during the day reads 'wellness brand' instead of 'serious raven.' Nighttime is the CRT / Bloomberg / VT100 cockpit — black canvas, phosphor green for primary CTAs, links, brand prompt, live indicator. The structural palette is shared (same surfaces, same type, same spacing); only the accent shifts. Functional state colors (success / error / warning / info) stay constant across both modes so meaning never collapses into brand.",
  rules: [
    'Light mode: ink black accent. The brand reads as letterpress restraint; nothing chromatic competes with the data on the page.',
    'Dark mode: phosphor green accent (#4ade80). The CRT tell, reserved for actions and the brand prompt — never body text or decoration.',
    'Success stays a slightly cooler green than the dark-mode accent so a "healthy" pill never looks like a "click me" pill.'
  ]
};

// Per-agent brand colors — vendor identities used in charts, timeline
// rows, and agent name pills. Sourced from utils/agentBrand.js so this
// page mirrors the live mapping rather than duplicating it.
// design-system-allow: hex (vendor brand colors)
export const BRAND_COLORS = [
  {
    name: 'Claude / Claude Code',
    color: '#FF6B35',
    use: 'Anthropic orange — most common agent on the timeline'
  },
  { name: 'Codex', color: '#10A37F', use: 'OpenAI emerald — Codex CLI sessions' },
  {
    name: 'Ollama',
    color: '#06b6d4',
    use: 'Cyan — local Ollama inference (changed from amber to avoid colliding with Claude orange)'
  },
  { name: 'GPT / ChatGPT', color: '#10a37f', use: 'OpenAI emerald — same family as Codex' },
  { name: 'Cursor', color: '#10b981', use: 'Cursor brand green' },
  { name: 'Copilot', color: '#0ea5e9', use: 'GitHub Copilot blue' },
  { name: 'Aider', color: '#8b5cf6', use: 'Aider violet' },
  { name: 'Llama / CodeLlama', color: '#7C3AED', use: 'Meta-tier violet' },
  { name: 'Mistral', color: '#E11D48', use: 'Mistral red' },
  { name: 'Qwen', color: '#14B8A6', use: 'Qwen teal' },
  { name: 'DeepSeek', color: '#0EA5E9', use: 'DeepSeek blue' },
  { name: 'Manual', color: '#6b7280', use: 'Neutral grey for non-attributed activity' }
];

export const BRAND_COLORS_RULE =
  "Vendor brand colors are the only allowed exception to the no-raw-hex rule. They live in lib/utils/agentBrand.js as a single source of truth and are tagged design-system-allow: hex. Pages call getAgentColor(name) instead of hardcoding hex per page — that's how the recent Ollama swap (amber → cyan) propagated everywhere with one edit.";

export const SURFACE_TOKENS = [
  { name: '--bg', utility: 'bg-canvas', role: 'Page background' },
  { name: '--surface', utility: 'bg-surface', role: 'Card / panel background' },
  {
    name: '--surface-2',
    utility: 'bg-surface-2',
    role: 'Recessed surface (table headers, inputs, embeds)'
  },
  { name: '--border', utility: 'border-border', role: 'Default borders and dividers' }
];

export const TEXT_TOKENS = [
  { name: '--text-heading', utility: 'text-heading', role: 'Headings, key numbers' },
  { name: '--text', utility: 'text-body', role: 'Default body text' },
  { name: '--muted', utility: 'text-muted', role: 'Captions, hints, dim metadata' }
];

export const SEMANTIC_TOKENS = [
  { name: '--accent', utility: 'text-accent / bg-accent', role: 'Primary action, links, focus' },
  { name: '--success', utility: 'text-success / bg-success', role: 'Online, healthy, pass' },
  { name: '--error', utility: 'text-error / bg-error', role: 'Offline, fail, destructive' },
  { name: '--warning', utility: 'text-warning / bg-warning', role: 'Disconnected, caution' },
  { name: '--info', utility: 'text-info / bg-info', role: 'Informational accent' }
];

export const SUBTLE_TOKENS = [
  {
    name: '--accent-subtle',
    utility: 'bg-accent-subtle',
    role: 'Tinted backdrop for accent badges'
  },
  { name: '--success-subtle', utility: 'bg-success-subtle', role: 'Backdrop for healthy badges' },
  { name: '--error-subtle', utility: 'bg-error-subtle', role: 'Backdrop for error badges' },
  { name: '--warning-subtle', utility: 'bg-warning-subtle', role: 'Backdrop for caution callouts' }
];

// === 05 Typography ===
export const TYPE_SCALE = [
  {
    name: '--text-xs',
    utility: 'text-xs',
    size: '12px',
    sample: 'Smallest label · meta · timestamps'
  },
  {
    name: '--text-sm',
    utility: 'text-sm',
    size: '13px',
    sample: 'Caption · dim metadata · table cells'
  },
  {
    name: '--text-base',
    utility: 'text-base',
    size: '14px',
    sample: 'Default body — most prose lives here'
  },
  {
    name: '--text-lg',
    utility: 'text-lg',
    size: '15px',
    sample: 'Slightly larger body for emphasis'
  },
  { name: '--text-xl', utility: 'text-xl', size: '16px', sample: 'Hero lede · dashboard h1' },
  {
    name: '--text-2xl',
    utility: 'text-2xl',
    size: '18px',
    sample: 'Page heading (PageHeader default)'
  },
  { name: '--text-3xl', utility: 'text-3xl', size: '20px', sample: 'Section title · subhead' },
  { name: '--text-4xl', utility: 'text-4xl', size: '24px', sample: 'Headline · big emphasis' },
  { name: '--text-5xl', utility: 'text-5xl', size: '28px', sample: 'Display · hero numerals' }
];

export const TYPE_WEIGHTS = [
  { name: 'font-normal', value: 400, sample: 'The quick brown fox' },
  { name: 'font-medium', value: 500, sample: 'The quick brown fox' },
  { name: 'font-semibold', value: 600, sample: 'The quick brown fox' },
  { name: 'font-bold', value: 700, sample: 'The quick brown fox' }
];

export const TYPE_FAMILIES = [
  {
    name: 'Sans — Inter',
    cssVar: '--font-sans',
    use: 'Default for prose, descriptions, labels, button text',
    sample: 'The quick brown fox jumps over the lazy dog · 0123456789'
  },
  {
    name: 'Mono — JetBrains Mono',
    cssVar: '--font-mono',
    use: 'Reserved for technical content: session IDs, paths, durations, code, model names, statuses',
    sample: 'event_id:abc123 · /api/dashboard · 4m 32s · qwen2.5-coder:14b'
  }
];

// === 06 Spacing ===
export const SPACING_SCALE = [
  { name: '--spacing-xs', value: 2 },
  { name: '--spacing-sm', value: 4 },
  { name: '--spacing-md', value: 6 },
  { name: '--spacing-lg', value: 8 },
  { name: '--spacing-xl', value: 12 },
  { name: '--spacing-2xl', value: 16 },
  { name: '--spacing-3xl', value: 24 },
  { name: '--spacing-4xl', value: 32 }
];

// === 07 Radius ===
export const RADIUS_SCALE = [
  { name: '--radius-sm', value: '3px', use: 'Pills, chips' },
  { name: '--radius', value: '4px', use: 'Inputs, default cards' },
  { name: '--radius-lg', value: '6px', use: 'Buttons, primary cards' },
  { name: '--radius-xl', value: '8px', use: 'Modals, large surfaces' }
];

// === 08 Motion ===
export const MOTION_TOKENS = [
  { name: '--duration-fast', value: '150ms', use: 'Hover state changes, focus rings' },
  { name: '--duration-base', value: '200ms', use: 'Default transitions, fades, slides' },
  { name: '--duration-slow', value: '300ms', use: 'Drawers, modals, expand/collapse' },
  {
    name: '--ease-smooth',
    value: 'cubic-bezier(0.4, 0, 0.2, 1)',
    use: 'Default easing — symmetric in/out'
  },
  {
    name: '--ease-out-expo',
    value: 'cubic-bezier(0.16, 1, 0.3, 1)',
    use: 'Decisive arrivals — drawers, toasts'
  }
];

export const CALLOUTS = [
  {
    tone: 'warning',
    label: '! Security Model',
    body: 'Bind only to 127.0.0.1 unless every host on the bound network is trusted.'
  },
  {
    tone: 'success',
    label: '✓ Healthy',
    body: 'All probes returning within budget. No degraded subsystems.'
  },
  {
    tone: 'info',
    label: 'i Tip',
    body: 'You can press Cmd-K from any page to jump to the command palette.'
  },
  {
    tone: 'error',
    label: '✗ Failure',
    body: 'Migration 0042 cannot be applied — column already exists.'
  }
];

// === 09 Principles ===
// Author-controlled markup; rendered via {@html}.
export const PRINCIPLES = [
  'Use semantic utilities (<code>bg-surface</code>, <code>text-heading</code>, <code>text-accent</code>, <code>text-success</code>) instead of hex or arbitrary <code>text-[var(--…)]</code> tokens. They flip with theme.',
  'Every page wraps in <code>&lt;PageLayout&gt;</code> from <code>lib/components/layout</code>. Content pages use the default variant; dashboards (Overview, Live, Activity) use <code>variant="dashboard"</code>.',
  "The page <code>h1</code> + description belongs in <code>&lt;PageHeader title=… description=…&gt;</code>. The small uppercase section label belongs in <code>&lt;PageSection title=… meta=…&gt;</code>. Don't hand-roll these.",
  'Section cards inside a PageSection use <code>bg-surface border border-border rounded-lg p-5</code> with an uppercase mono label heading.',
  "Status dots are 6px circles (<code>w-1.5 h-1.5</code>) with semantic backgrounds. Don't reinvent shapes — the matching size across status bars is what makes the live indicator legible at a glance.",
  'Mono font is reserved for technical content: session IDs, paths, durations, code, model names.',
  'The System page is the gold standard for content-style screens — match its header, status grid, and detail-card patterns when adding new ones.',
  'Animations live in <code>lib/styles/animations.css</code>. Page-level <code>&lt;style&gt;</code> blocks are forbidden on migrated pages — lift to that file or compose with Tailwind utilities.',
  'Brand-identity hex colors (per-agent, per-vendor) are the only allowed exception to the no-raw-hex rule. Mark with a leader <code>// design-system-allow: hex</code> comment.',
  'Static page content (decisions, principles, tool catalogs, etc.) lives in <code>lib/content/</code>. Pages iterate; markup stays small.',
  "Rules are enforced by <code>npm run validate:patterns</code> (ratcheted — only applies to pages that import <code>PageLayout</code>, so legacy pages don't block CI but cannot regress once migrated). Coverage of the primitive library against this page is checked by <code>npm run validate:design-coverage</code>."
];
