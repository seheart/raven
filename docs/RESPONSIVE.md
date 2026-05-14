# Responsive design

Raven's primary use case is **half-screen on a desktop monitor** — a ~960px
window sharing the screen with another app. Wide-screen is an _enhancement_
of that design center, not the canonical layout.

## Breakpoint contract

| Width        | Tailwind  | Role                                                          |
| ------------ | --------- | ------------------------------------------------------------- |
| `< 768px`    | (default) | Phone (tertiary). Single column, minimal chrome.              |
| `768–1279px` | `md:`     | **Design center: half-screen / tablet.** 1 or 2 columns only. |
| `1280px+`    | `xl:`     | Wide desktop. 3-column layouts allowed.                       |
| `1536px+`    | `2xl:`    | Full-screen 1080p+. Maximum density.                          |

## Rules

1. **Never use `md:grid-cols-3`** (or `md:grid-cols-4` etc.). Half-screen
   breaks at 3 columns. Use `xl:grid-cols-3` instead so 3-col only kicks
   in at 1280px+. Search every page for premature `md:` column grids.

2. **Bounded heights on scrollable content.** When a card contains a long
   list (event feed, agent list, error log), wrap the _list_ (not the
   card itself) in `max-h-[300-500px] overflow-y-auto`. Bloomberg-terminal
   pattern — the card is short and dense; the user scrolls _within_ it.
   Summary cards with no list don't need this.

3. **Cards have a sensible `min-w`** (typically `min-w-[280px]`) so a
   1-column fallback never produces an awkwardly-wide card.

4. **No horizontal scroll on the page.** Tables can scroll horizontally
   within their own container. The page never overflows.

5. **Footer tagline hides below `md`.** "Always perched · your AI's
   steady companion" is flavor, not content. At narrow widths the footer
   shows only essentials. Footer nav items use `flex-wrap` so they wrap
   to a second row gracefully instead of crushing.

6. **Wide-screen is enhancement, not replacement.** Write the layout for
   half-screen, then add `xl:` modifiers to spread out. Same components,
   same data, different density. Never maintain two layouts.

7. **Charts and circular viz** need a `min-h` so they don't get squashed
   when stacked. If a chart can't render well below a certain width, hide
   it or swap to a sparkline variant at narrow widths.

## Refactor pattern

Replace:

```svelte
<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
  <Card1 />
  <Card2 />
  <Card3 />
</div>
```

With:

```svelte
<div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
  <Card1 />
  <Card2 />
  <Card3 />
</div>
```

Inside `<Card1>` if it contains a list:

```svelte
<div class="bg-surface border border-border rounded p-4">
  <h3 class="text-sm font-semibold text-heading mb-3">Event Feed</h3>
  <div class="max-h-[400px] overflow-y-auto space-y-1">
    {#each events as e (e.id)}
      <EventRow {e} />
    {/each}
  </div>
</div>
```

## Verify per page

Open the page in the browser at:

- **960px wide** (half-screen on a 1920px monitor) — should look
  intentional, every module fully usable, no horizontal scroll, no
  cramped 3-col grids.
- **1920px wide** (full-screen) — should look denser, modules spread out
  into 2 or 3 columns, no oceans of whitespace.

Both views should look _good_, not "the half-screen is the compromise."
