<script>
  /**
   * Tech Stack Page - What Raven is built with
   * Mirrors SystemPage styling (the gold standard).
   */

  const sections = [
    {
      title: 'Frontend',
      items: [
        {
          name: 'Svelte 5',
          role: 'UI framework with runes-based reactivity',
          url: 'https://svelte.dev'
        },
        {
          name: 'Vite',
          role: 'Dev server and build tool',
          url: 'https://vitejs.dev'
        },
        {
          name: 'Tailwind CSS 4',
          role: 'Utility-first styling, layered on CSS variable design tokens',
          url: 'https://tailwindcss.com'
        },
        {
          name: 'Chart.js',
          role: 'Time-series and breakdown charts on the dashboard',
          url: 'https://www.chartjs.org'
        },
        {
          name: 'socket.io-client',
          role: 'Realtime updates from the backend',
          url: 'https://socket.io'
        },
        {
          name: 'DOMPurify',
          role: 'Sanitizes any rendered HTML before it touches the DOM',
          url: 'https://github.com/cure53/DOMPurify'
        }
      ]
    },
    {
      title: 'Backend',
      items: [
        {
          name: 'Node.js + TypeScript',
          role: 'Runtime and type-checked source for the API server'
        },
        {
          name: 'Express',
          role: 'HTTP routing and middleware',
          url: 'https://expressjs.com'
        },
        {
          name: 'Socket.IO',
          role: 'WebSocket transport pushing live events to the UI',
          url: 'https://socket.io'
        },
        {
          name: 'better-sqlite3',
          role: 'Synchronous SQLite driver — Raven stores everything locally',
          url: 'https://github.com/WiseLibs/better-sqlite3'
        },
        {
          name: 'chokidar',
          role: 'File watcher that picks up Claude session logs as they change',
          url: 'https://github.com/paulmillr/chokidar'
        },
        {
          name: 'simple-git',
          role: 'Reads branch and status info shown in the footer and overview',
          url: 'https://github.com/steveukx/git-js'
        },
        {
          name: 'systeminformation',
          role: 'Powers the system metrics panel',
          url: 'https://systeminformation.io'
        },
        {
          name: 'winston',
          role: 'Structured server logs',
          url: 'https://github.com/winstonjs/winston'
        }
      ]
    },
    {
      title: 'Security & API',
      items: [
        {
          name: 'helmet',
          role: 'Sets safe-by-default HTTP headers',
          url: 'https://helmetjs.github.io'
        },
        {
          name: 'express-rate-limit',
          role: 'Per-route request limiting'
        },
        {
          name: 'cors / compression',
          role: 'Cross-origin handling and gzip on responses'
        },
        {
          name: 'joi',
          role: 'Request payload validation',
          url: 'https://joi.dev'
        },
        {
          name: 'jsonwebtoken + bcryptjs',
          role: 'Token signing and password hashing primitives'
        },
        {
          name: 'Swagger UI',
          role: 'Interactive API docs from JSDoc-annotated routes'
        },
        {
          name: 'prom-client',
          role: 'Prometheus-compatible metrics endpoint'
        }
      ]
    },
    {
      title: 'Testing & Quality',
      items: [
        {
          name: 'Vitest',
          role: 'Frontend unit tests',
          url: 'https://vitest.dev'
        },
        {
          name: 'Playwright',
          role: 'End-to-end browser tests',
          url: 'https://playwright.dev'
        },
        {
          name: 'Jest + Supertest',
          role: 'Backend unit and HTTP integration tests'
        },
        {
          name: 'Storybook',
          role: 'Component workshop and visual regression sandbox',
          url: 'https://storybook.js.org'
        },
        {
          name: 'ESLint + Prettier',
          role: 'Linting and formatting across JS, TS, and Svelte'
        },
        {
          name: 'Stylelint + html-validate',
          role: 'Catches CSS and markup issues before they ship'
        },
        {
          name: 'svelte-check + tsc',
          role: 'Type-checking for Svelte components and backend TypeScript'
        }
      ]
    }
  ];
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-6xl mx-auto">
    <!-- Header -->
    <div class="flex justify-between items-start mb-6 flex-wrap gap-4">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">Tech Stack</h1>
        <p class="text-sm text-[var(--muted)] font-sans">
          What Raven is built with — frontend, backend, and the tooling that keeps it all honest.
        </p>
      </div>
    </div>

    <!-- Sections -->
    <div class="space-y-6">
      {#each sections as section (section.title)}
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
          <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-4">
            {section.title}
          </h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {#each section.items as item (item.name)}
              <div
                class="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 border-b border-[var(--border)] pb-2 last:border-b-0 last:pb-0"
              >
                <div class="font-mono text-[var(--text)] sm:w-44 sm:flex-shrink-0">
                  {#if item.url}
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-[var(--accent)] hover:underline"
                    >
                      {item.name}
                    </a>
                  {:else}
                    {item.name}
                  {/if}
                </div>
                <div class="text-[var(--muted)] font-sans flex-1">
                  {item.role}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>
