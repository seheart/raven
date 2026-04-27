# Layout primitives

Every page in `lib/pages/` should use these — they own the canonical page
chrome (shell, header, sections). Hand-rolling these patterns is the source
of wack-a-mole when typography or spacing changes need to ripple across the
app.

## Components

### `<PageLayout>`

The page shell — `min-h-screen` + canvas background + outer padding.

```svelte
<PageLayout>
  <PageHeader title="…" description="…" />
  <PageSection title="…">…</PageSection>
</PageLayout>
```

Variants:

- `default` (omitted) — standard padded shell for content pages
  (System, About, Settings, Activity, Analysis, …).
- `dashboard` — full-bleed shell with no outer padding, for pages that
  fill the viewport with their own grid (Live, Overview, Agent Monitoring).

### `<PageHeader>`

The h1 + description block. One per page, top of `<PageLayout>`.

```svelte
<PageHeader
  title="System"
  description="How Raven is built and …"
>
  {#snippet actions()}
    <Button>Refresh</Button>
  {/snippet}
</PageHeader>
```

### `<PageSection>`

The small uppercase label + content slot. Use to group related content
under a section heading. Pass `meta` for trailing dim text (e.g. live
counts).

```svelte
<PageSection title="Public API" meta="live ({routes.length} endpoints)">
  …content…
</PageSection>
```

## Governance rules (enforced by `npm run validate:patterns`)

The validator runs these rules on every page that imports `PageLayout`
(i.e. has migrated). Pre-migration pages are skipped — but they cannot
*new* features without migrating, because once a file imports the layout
primitive, every rule below is enforced.

| Rule | What it forbids |
|------|-----------------|
| 5 | Raw hex literals (`#aabbcc`) — use semantic tokens (`text-accent`, `bg-success`, etc.) |
| 6 | Arbitrary-token syntax (`text-[var(--…)]`) — use semantic utilities (`text-heading`, `bg-surface`) |
| 7 | Raw `<h1>` / `<h2>` — use `<PageHeader>` and `<PageSection>` |
| 8 | `<style>` blocks — lift styles to `lib/styles/animations.css` or use utility classes |

Brand/identity colors (per-agent identity hex) can be marked with
`/* design-system-allow: hex */` on the same line.

`DesignSystemPage.svelte` is allowlisted from rules 5–8 because it
intentionally renders example token names and example markup as strings.

## Page-action primitives (`lib/components/ui/`)

Use these in the `actions` snippet of `<PageHeader>` and alongside other
toolbar controls. They replace duplicated markup that used to live in
every page.

- **`<RefreshButton>`** — the standard `↻ Refresh` button with a `loading`
  state (`...` while loading, `↻` idle). Used in 23 places.
- **`<ToolbarButton>`** — the canonical secondary action (Export, filter
  toggles, etc.). Variants: `default`, `primary`, `danger`.
- **`<EmptyState>`** — centered no-data card with optional icon, title,
  description, and actions snippet. Replaces the duplicated
  `bg-surface border border-border rounded-lg p-12 text-center` block.

```svelte
<PageHeader title="Errors" description="…">
  {#snippet actions()}
    <ToolbarButton onClick={exportCSV}>Export CSV</ToolbarButton>
    <RefreshButton onClick={loadData} loading={loading} />
  {/snippet}
</PageHeader>

{#if items.length === 0}
  <EmptyState icon="📭" title="Nothing yet" description="…" />
{/if}
```

## Shared utility modules (`lib/utils/`)

- **`agentBrand.js`** — per-agent brand color + display name. Use
  `getAgentBrand(name)` or `getAgentColor(name)` instead of hand-rolling
  an `AGENT_CONFIG` table on each page.
- **`chartUtils.js`** — `getChartColors()` returns theme-aware colors for
  Chart.js (flips with dark mode). Use this instead of the
  `getComputedStyle(document.body).getPropertyValue('--accent') || '#…'`
  fallback pattern.

## Coverage check

Run `npm run validate:design-coverage` to see which `lib/components/ui/`
primitives are not yet shown in `DesignSystemPage.svelte`. Today the count
is high (~26) — the page currently shows pattern HTML inline (`<button>`)
instead of importing the actual primitive (`<Button>`). Closing this gap
is a separate effort; the tool is available so progress is visible.

Components that aren't user-facing primitives (logos, infrastructure
toast containers, etc.) opt out with a leading
`<!-- design-system-skip: ... -->` comment.

## Semantic utilities

Use these instead of `text-[var(--text-heading)]` etc:

| Utility | Token (CSS var) |
|---------|-----------------|
| `bg-canvas` | `--bg` (page background) |
| `bg-surface` | `--surface` (card/panel) |
| `bg-surface-2` | `--surface-2` (recessed) |
| `text-heading` | `--text-heading` |
| `text-body` | `--text` |
| `text-muted` | `--muted` |
| `text-accent` / `bg-accent` | `--accent` |
| `text-success` / `bg-success` | `--success` |
| `text-error` / `bg-error` | `--error` |
| `text-warning` / `bg-warning` | `--warning` |
| `text-info` / `bg-info` | `--info` |
| `border-border` | `--border` |

All of these flip with `body.dark` automatically — the `@theme` block in
`src/app.css` declares them as `var(--…)` references that resolve at
runtime, so dark mode is free.
