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
