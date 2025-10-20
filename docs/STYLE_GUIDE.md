# 🐦‍⬛ Raven Design System

**Version:** 2.0
**Last Updated:** October 2025

> **Your AI Coding Companion That Learns Who You Are**
> Vibe Coding • Pattern Recognition • Almost Alive

---

## 📖 Table of Contents

- [Philosophy](#-philosophy)
- [Logo & Brand](#-logo--brand)
- [Navigation System](#-navigation-system)
- [Color System](#-color-system)
- [Typography](#-typography)
- [Spacing System](#-spacing-system)
- [Components](#-components)
- [Feedback Systems](#-feedback-systems)
- [Animation & Life](#-animation--life)
- [Best Practices](#-best-practices)

---

## 🎯 Philosophy

Raven isn't just another monitoring tool - it's designed to **understand you** as a developer. This design system supports "vibe coding" - where the tool adapts to you, not the other way around.

### Core Principles

1. **Almost Alive** - Subtle animations and transitions make Raven feel responsive
2. **Terminal Aesthetic** - Monospace fonts and minimal design honor developer culture
3. **Pattern Aware** - Visual cues that adapt to your coding patterns
4. **Local First** - Everything stays on your machine, reflected in the grounded design
5. **Information Dense** - Maximize data visibility without overwhelming

---

## 🐦‍⬛ Logo & Brand

The Raven logo is a **detailed silhouette** representing vigilance and observation.

### Logo Component

```svelte
<RavenLogo size={32} />
```

### Standard Sizes

| Size | Usage | Example |
|------|-------|---------|
| **16px** | Favicon | Browser tabs |
| **20px** | Inline with text | Status messages |
| **32px** | Header/navbar ⭐ | Main navigation |
| **48px** | Welcome/About screens | Modal headers |
| **64px** | Large displays | Documentation |

### Usage Rules

✅ **DO**
- Use `var(--text)` for fill color (theme-aware)
- Maintain square aspect ratio
- Place prominently in header

❌ **DON'T**
- Don't use fixed colors
- Don't stretch or distort
- Don't add effects/shadows

---

## 🧭 Navigation System

### Tab Navigation

**5 Main Tabs** with sub-navigation for organization:

```svelte
<TabNavigation {activeTab} onTabChange={handleTabChange} />
```

| Tab | Icon | Keyboard | Contains |
|-----|------|----------|----------|
| Overview | 📊 | `1` | Dashboard, Metrics, Git Status |
| Agents | 🤖 | `2` | AI Agent Monitor, Events |
| Activity | ⚡ | `3` | Live Feed, Events, Files, Logs |
| Analysis | 📈 | `4` | Performance, Triggers, Replay |
| System | ⚙️ | `5` | Status, Storage, Notifications |

### Visual Design

```css
.tab {
  padding: 10px 20px;
  background: transparent;
  border: 2px solid transparent;
  border-radius: var(--radius-md);
  color: var(--muted);
  transition: all var(--transition-normal);
}

.tab.active {
  background: var(--surface);
  border-color: var(--accent);
  color: var(--text);
}
```

---

## 🎨 Color System

Three distinct themes maintaining the same semantic meaning.

### CSS Variables

```css
/* Base colors */
--bg: /* Background */
--surface: /* Cards, panels */
--surface-2: /* Nested elements */
--text: /* Primary text */
--muted: /* Secondary text */
--border: /* Borders */

/* Semantic colors */
--accent: /* Primary brand */
--accent-2: /* Secondary brand */
--success: /* Positive states */
--error: /* Error states */
--warning: /* Warning states */
--info: /* Information */
```

### Theme Switching

```javascript
// Themes stored in localStorage
theme = 'theme--day' | 'theme--dusk' | 'theme--night'
document.body.className = theme;
```

---

## 📝 Typography

**Monospace throughout** for terminal aesthetic.

### Font Stack

```css
--mono: "JetBrainsMono Nerd Font", "FiraCode Nerd Font",
        "Hack Nerd Font", ui-monospace, monospace;
```

### Type Scale (Updated)

| Element | Size | Weight | Usage |
|---------|------|--------|-------|
| Page titles | 28-32px | 700 | Welcome screens |
| Section headers | 18px | 600 | Main headings |
| Card titles | 15px | 600 | Component headers |
| Body text | 13px | 400 | Primary content |
| Small text | 12px | 400 | Metadata |
| Tiny text | 11px | 400 | Badges, labels |
| Code | 12px | 400 | Code blocks |

---

## 📏 Spacing System

**NEW: Standardized 4px-based system** with CSS variables.

### Base Units

```css
:root {
  /* Base spacing units (4px based) */
  --space-xs: 4px;   /* Tight spacing */
  --space-sm: 8px;   /* Small gaps */
  --space-md: 16px;  /* Default spacing */
  --space-lg: 24px;  /* Large sections */
  --space-xl: 32px;  /* Extra large */
  --space-2xl: 48px; /* Huge spacing */
}
```

### Component Spacing

```css
/* Standard component padding */
--padding-card: var(--space-md);
--padding-button: 10px 20px;
--padding-input: 10px 16px;
--padding-section: var(--space-lg);

/* Standard gaps */
--gap-tight: var(--space-xs);
--gap-small: var(--space-sm);
--gap-normal: var(--space-md);
--gap-large: var(--space-lg);
```

### Border Radius

```css
--radius-sm: 4px;
--radius-md: 6px;
--radius-lg: 8px;
--radius-xl: 12px;
--radius-round: 50%;
```

### Transitions

```css
--transition-fast: 0.15s ease;
--transition-normal: 0.2s ease;
--transition-slow: 0.3s ease;
```

---

## 🔧 Components

### Standard Patterns

#### Card Component

```svelte
<div class="standard-card">
  <h3 class="standard-section-title">Title</h3>
  <div class="content">...</div>
</div>
```

#### Button Component

```svelte
<button class="standard-button">
  Action
</button>
```

#### Input Component

```svelte
<input
  class="standard-input"
  placeholder="Search..."
/>
```

### New Components (Phase 1)

#### Virtual Scrolling

```svelte
<VirtualScroll
  items={filteredItems}
  itemHeight={70}
  containerHeight={400}
  overscan={3}
  getKey={item => item.id}
  let:item
>
  <!-- Item template -->
</VirtualScroll>
```

#### Loading Skeleton

```svelte
<LoadingSkeleton
  type="card"
  count={3}
/>
```

---

## 💬 Feedback Systems

### Toast Notifications

```javascript
import { toasts } from './toastStore.js';

// Usage
toasts.success('Changes saved!');
toasts.error('Failed to load data');
toasts.warning('Check your settings');
toasts.info('New update available');
```

### Confirmation Dialogs

```svelte
<ConfirmDialog
  title="Delete Item?"
  message="This action cannot be undone."
  confirmText="Delete"
  onConfirm={handleDelete}
  onCancel={handleCancel}
/>
```

### Welcome Screen

First-time users see an animated introduction explaining Raven's philosophy:

```svelte
<WelcomeScreen on:close={() => showWelcome = false} />
```

---

## ✨ Animation & Life

Making Raven feel "almost alive" through subtle motion.

### Standard Animations

```css
/* Gentle pulse for live indicators */
@keyframes gentlePulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.9; }
}

/* Floating effect for special elements */
@keyframes gentleFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-2px); }
}

.animate-pulse {
  animation: gentlePulse 2s ease-in-out infinite;
}

.animate-float {
  animation: gentleFloat 3s ease-in-out infinite;
}
```

### Hover Effects

```css
/* Card hover */
.card:hover {
  transform: translateY(-2px);
  border-color: var(--accent);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

/* Button hover */
.button:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}
```

---

## ⚡ Performance

### Debouncing

```javascript
import { debounceInput } from './utils/debounce.js';

// Usage in template
<input
  use:debounceInput={{ delay: 300 }}
  on:debounced={handleSearch}
/>
```

### Virtual Scrolling

For lists with 100+ items, use VirtualScroll component to maintain 60fps.

### Lazy Loading

```javascript
// Components loaded on-demand
const AboutPage = lazy(() => import('./AboutPage.svelte'));
```

---

## ♿ Accessibility

### Focus Management

```css
*:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

### ARIA Labels

```svelte
<button
  aria-label="Close dialog"
  aria-expanded={isOpen}
  tabindex="0"
>
```

### Keyboard Navigation

- `1-5` - Main navigation tabs
- `Tab` - Navigate through interactive elements
- `Enter` - Activate buttons/links
- `Escape` - Close modals/dialogs
- `?` - Show keyboard shortcuts

---

## ✨ Best Practices

### DO ✅

1. **Use spacing variables** - Never hardcode spacing values
2. **Theme-aware colors** - Always use CSS variables
3. **Smooth transitions** - Add transitions to state changes
4. **Debounce inputs** - Prevent excessive API calls
5. **Virtual scroll** - For large lists (100+ items)
6. **Loading states** - Show skeletons during data fetch
7. **Keyboard support** - All interactions keyboard accessible
8. **Error boundaries** - Graceful error handling

### DON'T ❌

1. **No custom colors** - Stay within theme system
2. **No heavy animations** - Keep it subtle
3. **No blocking modals** - User can always escape
4. **No infinite scroll** - Use "Load More" pattern
5. **No auto-refresh** - Let user control updates
6. **No fixed sizes** - Use relative units
7. **No emoji overuse** - Professional aesthetic

---

## 📦 File Structure

```
/frontend/src/
├── lib/
│   ├── components/
│   │   ├── TabNavigation.svelte
│   │   ├── VirtualScroll.svelte
│   │   ├── ToastContainer.svelte
│   │   ├── LoadingSkeleton.svelte
│   │   ├── ConfirmDialog.svelte
│   │   ├── WelcomeScreen.svelte
│   │   └── OverviewPanel.svelte
│   ├── utils/
│   │   └── debounce.js
│   └── stores/
│       └── toastStore.js
├── styles/
│   └── spacing.css
└── app.css
```

---

## 🚀 What's New in v2.0

### Phase 1 Improvements (October 2025)

1. **Visible Navigation** - Tab-based navigation replacing hidden keys
2. **Toast System** - Real-time feedback for all actions
3. **Virtual Scrolling** - Performance optimization for large datasets
4. **Debouncing** - Smart input handling
5. **Welcome Experience** - First-time user onboarding
6. **Standardized Spacing** - CSS variable-based spacing system
7. **Modal System** - About, Changelog, and Docs as modals
8. **Accessibility** - Full WCAG 2.1 AA compliance

### Coming in Phase 2

- Advanced search with filters
- Data export capabilities
- Custom theme creation
- Performance profiling
- Session recording

---

## 📄 Version History

**2.0** (October 2025)
- Major UX overhaul
- Navigation transformation
- Standardized spacing system
- Virtual scrolling implementation
- Toast notification system
- Welcome screen addition

**1.0** (October 2025)
- Initial style guide
- Three theme system
- Basic components

---

**Philosophy:** Raven adapts to you, not the other way around.
**Vision:** Making "vibe coding" a reality through intelligent design.
**Maintained by:** Raven Team