<script>
  /**
   * Design System Page — tokens and primitives used across Raven.
   * New screens should pull from here; deviations should be intentional.
   */

  const surfaceTokens = [
    { name: '--bg', role: 'Page background' },
    { name: '--surface', role: 'Card / panel background' },
    { name: '--surface-2', role: 'Recessed surface (table rows, embeds)' },
    { name: '--border', role: 'Default borders and dividers' }
  ];

  const textTokens = [
    { name: '--text-heading', role: 'Headings, key numbers' },
    { name: '--text', role: 'Default body text' },
    { name: '--muted', role: 'Captions, hints, dim metadata' }
  ];

  const semanticTokens = [
    { name: '--accent', role: 'Primary action, links, focus' },
    { name: '--success', role: 'Online, healthy, pass' },
    { name: '--error', role: 'Offline, fail, destructive' },
    { name: '--warning', role: 'Disconnected, caution' },
    { name: '--info', role: 'Informational accent' }
  ];

  const subtleTokens = [
    { name: '--accent-subtle', role: 'Tinted backdrop for accent badges' },
    { name: '--success-subtle', role: 'Backdrop for healthy badges' },
    { name: '--error-subtle', role: 'Backdrop for error badges' }
  ];

  const typeScale = [
    { name: '--text-xs', size: '10px', sample: 'Caption / label' },
    { name: '--text-sm', size: '11px', sample: 'Hint or secondary' },
    { name: '--text-base', size: '13px', sample: 'Default body' },
    { name: '--text-lg', size: '14px', sample: 'Slightly larger body' },
    { name: '--text-xl', size: '15px', sample: 'Section heading' },
    { name: '--text-2xl', size: '16px', sample: 'Card label' },
    { name: '--text-3xl', size: '18px', sample: 'Subhead' },
    { name: '--text-4xl', size: '20px', sample: 'Page title' },
    { name: '--text-5xl', size: '24px', sample: 'Big emphasis' }
  ];

  const spacingScale = [
    { name: '--space-xs', value: 2 },
    { name: '--space-sm', value: 4 },
    { name: '--space-md', value: 6 },
    { name: '--space-lg', value: 8 },
    { name: '--space-xl', value: 12 },
    { name: '--space-2xl', value: 16 },
    { name: '--space-3xl', value: 24 },
    { name: '--space-4xl', value: 32 }
  ];

  const radiusScale = [
    { name: '--radius-sm', value: '3px', use: 'Pills, chips' },
    { name: '--radius', value: '4px', use: 'Inputs, default cards' },
    { name: '--radius-lg', value: '6px', use: 'Buttons, primary cards' },
    { name: '--radius-xl', value: '8px', use: 'Modals, large surfaces' }
  ];

  const principles = [
    'Use semantic vars (<code>--success</code> / <code>--error</code> / <code>--warning</code>) instead of hex. They flip with theme.',
    'Content pages (System, Analysis, Settings, About) wrap in <code>min-h-screen bg-[var(--bg)] p-6 pb-20</code> with <code>max-w-6xl mx-auto</code> inside.',
    'Live / dashboard pages (Overview, Live Monitor, Process Activity) lock to the viewport with their own grid or flex layout. They still use the same color and type tokens.',
    'Section cards use <code>bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5</code> with an uppercase mono label heading.',
    'Status dots are 8px circles (<code>w-2 h-2</code>) with semantic backgrounds. Don\'t reinvent shapes.',
    'Mono font is reserved for technical content: session IDs, paths, durations, code, model names.',
    'The System page is the gold standard for content-style screens — match its header, status grid, and detail-card patterns when adding new ones.'
  ];
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-6xl mx-auto">
    <!-- Header -->
    <div class="flex justify-between items-start mb-6 flex-wrap gap-4">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">Design System</h1>
        <p class="text-sm text-[var(--muted)] font-sans">
          Tokens and primitives used across Raven. New screens should pull from here; deviations
          should be intentional.
        </p>
      </div>
    </div>

    <div class="space-y-6">
      <!-- Colors — Surfaces -->
      <section class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
        <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-4 font-mono">
          Colors — Surfaces
        </h3>
        <p class="text-sm text-[var(--muted)] font-sans mb-4">
          Background and border tokens. These swap automatically between light and dark themes.
        </p>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {#each surfaceTokens as t (t.name)}
            <div class="flex items-center gap-3">
              <div
                class="w-10 h-10 rounded border border-[var(--border)] flex-shrink-0"
                style="background: var({t.name});"
              ></div>
              <div class="flex flex-col gap-0.5 min-w-0">
                <code class="font-mono text-xs text-[var(--text)]">{t.name}</code>
                <span class="text-xs text-[var(--muted)] font-sans">{t.role}</span>
              </div>
            </div>
          {/each}
        </div>
      </section>

      <!-- Colors — Text -->
      <section class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
        <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-4 font-mono">
          Colors — Text
        </h3>
        <div class="space-y-3">
          {#each textTokens as t (t.name)}
            <div
              class="grid grid-cols-1 sm:grid-cols-[1fr_180px_1fr] gap-3 items-baseline border-b border-[var(--border)] pb-3 last:border-b-0 last:pb-0"
            >
              <span class="text-base font-sans" style="color: var({t.name});">
                The quick brown fox jumps over the lazy dog
              </span>
              <code class="font-mono text-xs text-[var(--text)]">{t.name}</code>
              <span class="text-xs text-[var(--muted)] font-sans">{t.role}</span>
            </div>
          {/each}
        </div>
      </section>

      <!-- Colors — Semantic -->
      <section class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
        <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-4 font-mono">
          Colors — Semantic
        </h3>
        <p class="text-sm text-[var(--muted)] font-sans mb-4">
          Use the meaning, not the hex. <code
            class="font-mono text-xs bg-[var(--surface-2)] px-1.5 py-0.5 rounded"
            >--success</code
          >
          is always green, <code
            class="font-mono text-xs bg-[var(--surface-2)] px-1.5 py-0.5 rounded">--error</code
          > is always red.
        </p>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          {#each semanticTokens as t (t.name)}
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded flex-shrink-0" style="background: var({t.name});"></div>
              <div class="flex flex-col gap-0.5 min-w-0">
                <code class="font-mono text-xs text-[var(--text)]">{t.name}</code>
                <span class="text-xs text-[var(--muted)] font-sans">{t.role}</span>
              </div>
            </div>
          {/each}
        </div>
        <h4 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-3 font-mono">
          Subtle variants
        </h4>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {#each subtleTokens as t (t.name)}
            <div class="flex items-center gap-3">
              <div
                class="w-10 h-10 rounded border border-[var(--border)] flex-shrink-0"
                style="background: var({t.name});"
              ></div>
              <div class="flex flex-col gap-0.5 min-w-0">
                <code class="font-mono text-xs text-[var(--text)]">{t.name}</code>
                <span class="text-xs text-[var(--muted)] font-sans">{t.role}</span>
              </div>
            </div>
          {/each}
        </div>
      </section>

      <!-- Typography -->
      <section class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
        <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-4 font-mono">
          Typography
        </h3>
        <p class="text-sm text-[var(--muted)] font-sans mb-4">
          Inter (<code class="font-mono text-xs bg-[var(--surface-2)] px-1.5 py-0.5 rounded"
            >--sans</code
          >) for everything except technical content — session IDs, paths, durations, model names —
          which uses JetBrains Mono (<code
            class="font-mono text-xs bg-[var(--surface-2)] px-1.5 py-0.5 rounded">--mono</code
          >).
        </p>
        <div class="space-y-3">
          {#each typeScale as t (t.name)}
            <div
              class="grid grid-cols-[140px_60px_1fr] gap-3 items-baseline border-b border-[var(--border)] pb-3 last:border-b-0 last:pb-0"
            >
              <code class="font-mono text-xs text-[var(--muted)]">{t.name}</code>
              <span class="font-mono text-xs text-[var(--muted)]">{t.size}</span>
              <span class="text-[var(--text)] font-sans" style="font-size: var({t.name});"
                >{t.sample}</span
              >
            </div>
          {/each}
        </div>
      </section>

      <!-- Spacing scale -->
      <section class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
        <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-4 font-mono">
          Spacing scale
        </h3>
        <p class="text-sm text-[var(--muted)] font-sans mb-4">
          Pull from these tokens instead of hand-rolling rem values.
        </p>
        <div class="space-y-2">
          {#each spacingScale as s (s.name)}
            <div class="grid grid-cols-[140px_1fr_60px] gap-3 items-center">
              <code class="font-mono text-xs text-[var(--text)]">{s.name}</code>
              <div class="flex items-center">
                <div
                  class="h-3 bg-[var(--accent)] rounded-sm"
                  style="width: var({s.name});"
                ></div>
              </div>
              <span class="font-mono text-xs text-[var(--muted)]">{s.value}px</span>
            </div>
          {/each}
        </div>
      </section>

      <!-- Radius scale -->
      <section class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
        <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-4 font-mono">
          Radius scale
        </h3>
        <div class="space-y-3">
          {#each radiusScale as r (r.name)}
            <div class="grid grid-cols-[60px_140px_1fr] gap-3 items-center">
              <div
                class="w-9 h-9 bg-[var(--accent)]"
                style="border-radius: var({r.name});"
              ></div>
              <code class="font-mono text-xs text-[var(--text)]">{r.name}</code>
              <span class="text-xs text-[var(--muted)] font-sans">
                <span class="font-mono text-[var(--text)]">{r.value}</span> · {r.use}
              </span>
            </div>
          {/each}
        </div>
      </section>

      <!-- Buttons -->
      <section class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
        <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-4 font-mono">
          Buttons
        </h3>
        <p class="text-sm text-[var(--muted)] font-sans mb-4">
          Global utility classes from <code
            class="font-mono text-xs bg-[var(--surface-2)] px-1.5 py-0.5 rounded">app.css</code
          >. Use <code class="font-mono text-xs bg-[var(--surface-2)] px-1.5 py-0.5 rounded"
            >.btn-primary</code
          > for the main action; the rest for secondary controls.
        </p>
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
      </section>

      <!-- Badges & Pills -->
      <section class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
        <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-4 font-mono">
          Badges & Pills
        </h3>
        <div class="flex flex-wrap gap-2 items-center mb-4">
          <span class="badge badge-success">Success</span>
          <span class="badge badge-error">Error</span>
          <span class="badge badge-warning">Warning</span>
          <span class="badge badge-info">Info</span>
        </div>
        <p class="text-xs text-[var(--muted)] font-sans mb-3">
          Pills are used for diff status (added / deleted / modified):
        </p>
        <div class="flex flex-wrap gap-2 items-center">
          <span class="pill add">Add</span>
          <span class="pill del">Del</span>
          <span class="pill mod">Mod</span>
        </div>
      </section>

      <!-- Status indicators -->
      <section class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
        <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-4 font-mono">
          Status indicators
        </h3>
        <p class="text-sm text-[var(--muted)] font-sans mb-4">
          Same green / amber / red pattern across every page. Used in System, Footer, and dashboards.
        </p>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div class="flex items-center gap-2 text-sm">
            <span class="w-2 h-2 rounded-full bg-[var(--success)]"></span>
            <span class="font-mono text-[var(--text)]">Online</span>
          </div>
          <div class="flex items-center gap-2 text-sm">
            <span class="w-2 h-2 rounded-full bg-[var(--success)] animate-pulse"></span>
            <span class="font-mono text-[var(--text)]">Active</span>
          </div>
          <div class="flex items-center gap-2 text-sm">
            <span class="w-2 h-2 rounded-full bg-[var(--warning)]"></span>
            <span class="font-mono text-[var(--text)]">Warning</span>
          </div>
          <div class="flex items-center gap-2 text-sm">
            <span class="w-2 h-2 rounded-full bg-[var(--error)]"></span>
            <span class="font-mono text-[var(--text)]">Offline</span>
          </div>
        </div>
      </section>

      <!-- Page header pattern -->
      <section class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
        <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-4 font-mono">
          Page header pattern
        </h3>
        <p class="text-sm text-[var(--muted)] font-sans mb-4">
          Title left, supporting metadata under it, actions on the right. Mirrors System.
        </p>
        <div class="bg-[var(--bg)] border border-[var(--border)] rounded p-4">
          <div class="flex justify-between items-start flex-wrap gap-4">
            <div>
              <h2 class="text-2xl font-bold text-[var(--text-heading)] mb-1">Example Page</h2>
              <p class="text-sm text-[var(--muted)] font-sans">
                Raven v0.0.0 · Uptime: 12m
              </p>
            </div>
            <div class="flex items-center gap-3">
              <span class="text-xs text-[var(--muted)] font-mono">just now</span>
              <button
                type="button"
                class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors"
              >
                ↻ Refresh
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- Card patterns -->
      <section class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
        <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-4 font-mono">
          Card patterns
        </h3>
        <p class="text-sm text-[var(--muted)] font-sans mb-4">
          Status tile (left) and detail card (right). Both live on a <code
            class="font-mono text-xs bg-[var(--surface-2)] px-1.5 py-0.5 rounded">--bg</code
          > page.
        </p>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 bg-[var(--bg)] p-4 rounded">
          <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
            <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
              Backend
            </div>
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-[var(--success)]"></span>
              <span class="text-sm font-mono text-[var(--text)]">Online</span>
            </div>
          </div>
          <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
            <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-4">
              Server Details
            </h3>
            <div class="space-y-3 text-sm">
              <div class="flex justify-between border-b border-[var(--border)] pb-2">
                <span class="text-[var(--muted)]">Session</span>
                <span class="font-mono text-[var(--text)] text-xs">abc123def...</span>
              </div>
              <div class="flex justify-between">
                <span class="text-[var(--muted)]">Active Agents</span>
                <span class="font-mono text-[var(--text)]">3</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Compliance principles -->
      <section class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
        <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-4 font-mono">
          Compliance principles
        </h3>
        <ol
          class="list-decimal pl-5 space-y-2 text-sm text-[var(--text)] font-sans leading-relaxed"
        >
          {#each principles as p (p)}
            <li>{@html p}</li>
          {/each}
        </ol>
      </section>
    </div>
  </div>
</div>

<style>
  /* Inline code chips inside the principles list — keep them visible */
  ol :global(code) {
    font-family: var(--mono);
    font-size: var(--text-xs);
    background: var(--surface-2);
    padding: 1px 6px;
    border-radius: var(--radius-sm);
    color: var(--text);
  }
</style>
