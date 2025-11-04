# 🐦‍⬛ Raven Design System

**Version:** 3.0
**Last Updated:** November 2025

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
- [Icon Sizing System](#-icon-sizing-system)
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

**Dual font system** balancing readability and terminal aesthetic.

### Font Stack

```css
/* Monospace - For code, data, and technical UI */
--mono: "JetBrainsMono Nerd Font", "FiraCode Nerd Font",
        "Hack Nerd Font", ui-monospace, monospace;

/* Sans-serif - For general UI text */
--sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
        "Helvetica Neue", Arial, sans-serif;
```

### Type Scale

CSS variables provide a consistent, compact typography system:

```css
--text-xs: 10px;   /* Tiny labels */
--text-sm: 11px;   /* Small text, badges */
--text-base: 12px; /* Body text, default */
--text-lg: 13px;   /* Emphasized text */
--text-xl: 14px;   /* Subheadings */
--text-2xl: 15px;  /* Card titles */
--text-3xl: 16px;  /* Section headers */
--text-4xl: 18px;  /* Page headers */
--text-5xl: 20px;  /* Large headings */
```

### Font Weights

```css
--weight-normal: 400;    /* Body text */
--weight-medium: 500;    /* Subtle emphasis */
--weight-semibold: 600;  /* Headings */
--weight-bold: 700;      /* Strong emphasis */
```

### Usage Guidelines

| Element | Font | Size | Weight | Usage |
|---------|------|------|--------|-------|
| Page titles | `--sans` | `--text-4xl` to `--text-5xl` | `--weight-bold` | Welcome screens |
| Section headers | `--sans` | `--text-3xl` | `--weight-semibold` | Main headings |
| Card titles | `--sans` | `--text-2xl` | `--weight-semibold` | Component headers |
| Body text | `--sans` | `--text-base` to `--text-lg` | `--weight-normal` | Primary content |
| Small text | `--sans` | `--text-sm` | `--weight-normal` | Metadata |
| Badges/Labels | `--sans` | `--text-xs` to `--text-sm` | `--weight-medium` | Tags, status |
| Code blocks | `--mono` | `--text-base` | `--weight-normal` | Code samples |
| Data values | `--mono` | `--text-sm` to `--text-base` | `--weight-normal` | Numbers, stats |

---

## 📏 Spacing System

**Compact 2px-based system** optimized for information density.

### Base Units

All spacing follows a precise, compact scale perfect for monitoring interfaces:

```css
:root {
  /* Spacing Scale - Compact monitoring tool */
  --space-xs: 2px;   /* Hairline spacing */
  --space-sm: 4px;   /* Tight spacing */
  --space-md: 6px;   /* Small gaps */
  --space-lg: 8px;   /* Default spacing */
  --space-xl: 12px;  /* Medium spacing */
  --space-2xl: 16px; /* Large spacing */
  --space-3xl: 24px; /* Extra large */
  --space-4xl: 32px; /* Huge spacing */
}
```

### Usage Guidelines

| Variable | Size | Usage |
|----------|------|-------|
| `--space-xs` | 2px | Hairline gaps, tight lists |
| `--space-sm` | 4px | Compact elements, badges |
| `--space-md` | 6px | Small component gaps |
| `--space-lg` | 8px | Default padding, standard gaps |
| `--space-xl` | 12px | Comfortable padding |
| `--space-2xl` | 16px | Card padding, section gaps |
| `--space-3xl` | 24px | Large section spacing |
| `--space-4xl` | 32px | Major layout divisions |

### Border Radius

Tight, precise edges maintaining the technical aesthetic:

```css
/* Border Radius - Tight, precise edges */
--radius: 4px;      /* Standard radius */
--radius-sm: 3px;   /* Small elements */
--radius-lg: 6px;   /* Medium elements */
--radius-xl: 8px;   /* Large elements */
```

### Motion & Transitions

Apple-style easing functions for smooth, natural animations:

```css
/* Easing Functions */
--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);      /* Smooth exit */
--ease-in-expo: cubic-bezier(0.7, 0, 0.84, 0);       /* Quick entry */
--ease-bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55); /* Playful bounce */
--ease-smooth: cubic-bezier(0.4, 0.0, 0.2, 1);       /* Material Design */

/* Transition Durations */
--duration-fast: 150ms;    /* Quick interactions */
--duration-base: 250ms;    /* Standard transitions */
--duration-slow: 350ms;    /* Deliberate animations */
--duration-slower: 500ms;  /* Emphasis animations */
```

### Animation Examples

```css
/* Smooth button hover */
button {
  transition: all var(--duration-base) var(--ease-smooth);
}

/* Elegant modal entrance */
.modal {
  animation: slideIn var(--duration-slow) var(--ease-out-expo);
}

/* Playful notification */
.toast {
  animation: bounce var(--duration-base) var(--ease-bounce);
}
```

---

## 🎨 Icon Sizing System

**Standardized icon sizing** for visual consistency across the entire interface.

### Size Scale

All icons follow a consistent 5-tier sizing system:

```css
/* Icon Sizes */
--icon-xs: 16px;  /* Tiny icons, inline with text */
--icon-sm: 20px;  /* Small UI elements, compact layouts */
--icon-md: 24px;  /* Standard icons, default size */
--icon-lg: 32px;  /* Large icons, prominent elements */
--icon-xl: 40px;  /* Extra large icons, headers, welcome screens */
```

### Usage Guidelines

| Variable | Size | Usage | Examples |
|----------|------|-------|----------|
| `--icon-xs` | 16px | Inline icons, badges, tiny buttons | Status indicators, small badges |
| `--icon-sm` | 20px | Compact UI elements, toolbars | Toolbar buttons, inline actions |
| `--icon-md` | 24px | Standard UI icons | Navigation, card headers, buttons |
| `--icon-lg` | 32px | Prominent icons, headers | Logo, tab icons, feature icons |
| `--icon-xl` | 40px | Large display icons | Welcome screens, empty states |

### Implementation Pattern

All icon sizing should use CSS variables for consistency:

```css
/* Icon as width/height */
.icon-button {
  width: var(--icon-md);
  height: var(--icon-md);
}

/* Icon as font-size (for emoji/text icons) */
.emoji-icon {
  font-size: var(--icon-sm);
}

/* SVG icons */
.svg-icon {
  width: var(--icon-md);
  height: var(--icon-md);
}
```

### Component Examples

```svelte
<!-- Small inline icon -->
<button class="icon-xs">⚙️</button>

<!-- Standard navigation icon -->
<div class="nav-icon" style="font-size: var(--icon-md)">📊</div>

<!-- Large logo/header icon -->
<RavenLogo size={var(--icon-lg)} />

<!-- Loading spinner sizes -->
<LoadingSpinner size="sm" /> <!-- Uses --icon-sm -->
<LoadingSpinner size="md" /> <!-- Uses --icon-lg for visibility -->
<LoadingSpinner size="lg" /> <!-- 48px for large states -->
```

### Benefits

1. **Visual Consistency** - All icons maintain proper hierarchy
2. **Predictable Spacing** - Icons align properly in layouts
3. **Easy Theming** - Change sizes globally if needed
4. **Accessibility** - Consistent sizing improves touch targets
5. **Maintainability** - No more hunting down hard-coded sizes

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

**Standardized button system** with multiple variants:

```svelte
<!-- Primary button (default) -->
<button class="btn">Primary Action</button>

<!-- Secondary button -->
<button class="btn btn-secondary">Secondary Action</button>

<!-- Danger/destructive button -->
<button class="btn btn-danger">Delete</button>

<!-- Small button -->
<button class="btn btn-sm">Small Action</button>

<!-- Icon button -->
<button class="icon-button" aria-label="Settings">
  ⚙️
</button>
```

**Button Styles:**
```css
.btn {
  padding: var(--space-lg) var(--space-2xl);
  font-family: var(--sans);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  border-radius: var(--radius);
  transition: all var(--duration-base) var(--ease-smooth);
  cursor: pointer;
}

.btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}
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

#### Loading Spinner

**Unified loading spinner** with consistent sizing and animation:

```svelte
<!-- Small spinner (20px) -->
<LoadingSpinner size="sm" color="var(--accent)" label="Loading..." />

<!-- Medium spinner (32px, default) -->
<LoadingSpinner size="md" />

<!-- Large spinner (48px) -->
<LoadingSpinner size="lg" label="Processing data..." />
```

**Features:**
- Three size variants (sm, md, lg)
- Customizable color
- Accessible with ARIA labels and sr-only text
- Smooth circular animation with dash effect
- Uses icon sizing system internally

**Props:**
- `size` - 'sm', 'md' (default), 'lg'
- `color` - Any CSS color, defaults to `var(--accent)`
- `label` - Accessible label, defaults to 'Loading...'

**Animation:**
```css
@keyframes spin-refresh {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes dash {
  0% { stroke-dasharray: 1, 150; stroke-dashoffset: 0; }
  50% { stroke-dasharray: 90, 150; stroke-dashoffset: -35; }
  100% { stroke-dasharray: 90, 150; stroke-dashoffset: -124; }
}
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

1. **Use design tokens** - Always use CSS custom properties (variables)
   - Spacing: `var(--space-*)` not hard-coded pixels
   - Icons: `var(--icon-*)` not fixed sizes
   - Typography: `var(--text-*)` and `var(--weight-*)`
   - Colors: `var(--accent)`, `var(--text)`, etc.

2. **Follow sizing scales** - Maintain visual hierarchy
   - Icons: xs(16px) → sm(20px) → md(24px) → lg(32px) → xl(40px)
   - Spacing: xs(2px) → sm(4px) → md(6px) → lg(8px) → xl(12px) → 2xl(16px) → 3xl(24px) → 4xl(32px)
   - Typography: xs(10px) → sm(11px) → base(12px) → lg(13px) → xl(14px) → 2xl(15px) → 3xl(16px) → 4xl(18px) → 5xl(20px)

3. **Use proper motion** - Smooth, natural animations
   - Durations: `var(--duration-fast/base/slow/slower)`
   - Easing: `var(--ease-smooth/out-expo/in-expo/bounce)`
   - Keep animations subtle and purposeful

4. **Accessibility first** - Make everything usable
   - ARIA labels on all interactive elements
   - Keyboard navigation support
   - Focus-visible states
   - Semantic HTML
   - Screen reader text for icons

5. **Component reuse** - Use existing components
   - LoadingSpinner for all loading states
   - .btn system for all buttons
   - LoadingSkeleton for data loading
   - Toast system for feedback

6. **Performance optimization**
   - Debounce inputs
   - Virtual scroll for large lists (100+ items)
   - Lazy load heavy components

### DON'T ❌

1. **No hard-coded values** - Always use design tokens
   - ❌ `width: 24px` → ✅ `width: var(--icon-md)`
   - ❌ `padding: 8px` → ✅ `padding: var(--space-lg)`
   - ❌ `font-size: 12px` → ✅ `font-size: var(--text-base)`

2. **No inconsistent sizing** - Follow the scales
   - Don't create one-off sizes like 22px, 27px, 15px
   - Stick to the defined icon/spacing/typography scales

3. **No custom colors** - Stay within theme system
   - Use semantic color variables
   - Don't hard-code hex/rgb values

4. **No heavy animations** - Keep it subtle
   - Avoid distracting motion
   - Use appropriate durations (150-500ms)
   - Prefer transform over position/width/height

5. **No blocking modals** - User can always escape
   - Always support ESC key
   - Click outside to close
   - Visible close button

6. **No infinite scroll** - Use "Load More" pattern
   - Give users control
   - Show progress/counts

7. **No auto-refresh** - Let user control updates
   - Provide manual refresh option
   - Show "new data available" indicator

8. **No emoji overuse** - Professional aesthetic
   - Use sparingly for emphasis
   - Prefer icons/text for most UI

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

## 🚀 What's New in v3.0

### Design System Standardization (November 2025)

**Complete UX/UI Excellence Initiative - 13 Issues Resolved:**

1. ✅ **Icon Sizing System** - Standardized 5-tier icon sizing (`--icon-xs` to `--icon-xl`)
2. ✅ **Typography Refinement** - Dual font system (--mono + --sans) with 9-tier type scale
3. ✅ **Motion System** - Apple-style easing functions and duration variables
4. ✅ **Button Components** - Unified button system with variants (.btn, .btn-secondary, .btn-danger)
5. ✅ **Loading Spinner** - Consistent loading component with smooth animations
6. ✅ **Spacing Accuracy** - Corrected documentation to match actual 2px-based system
7. ✅ **Color Contrast** - Enhanced accessibility across all themes
8. ✅ **Focus States** - Improved keyboard navigation visibility
9. ✅ **Error States** - Consistent error handling patterns
10. ✅ **Empty States** - Unified empty state designs
11. ✅ **Loading States** - Standardized loading patterns
12. ✅ **Success States** - Consistent success feedback
13. ✅ **Design Token Documentation** - Complete CSS custom properties reference

**Key Improvements:**
- **100% Icon Consistency** - Eliminated all hard-coded icon sizes across 78+ files
- **Enhanced Accessibility** - ARIA labels, semantic HTML, keyboard navigation
- **Performance Optimizations** - Smooth 60fps animations with GPU-accelerated transforms
- **Developer Experience** - Comprehensive design system documentation
- **Visual Hierarchy** - Clear sizing scales for typography, spacing, and icons

### Phase 1 Improvements (v2.0, October 2025)

1. **Visible Navigation** - Tab-based navigation replacing hidden keys
2. **Toast System** - Real-time feedback for all actions
3. **Virtual Scrolling** - Performance optimization for large datasets
4. **Debouncing** - Smart input handling
5. **Welcome Experience** - First-time user onboarding
6. **Standardized Spacing** - CSS variable-based spacing system
7. **Modal System** - About, Changelog, and Docs as modals
8. **Accessibility** - Full WCAG 2.1 AA compliance

### Coming in Future Releases

- Advanced search with filters
- Data export capabilities
- Custom theme creation
- Performance profiling
- Session recording

---

## 📄 Version History

**3.0** (November 2025)
- Complete design system standardization
- Icon sizing system (5-tier scale)
- Typography refinement (dual font system)
- Motion system (Apple-style easing)
- Button component system
- LoadingSpinner component
- Enhanced accessibility
- Corrected spacing documentation
- 78+ files updated for consistency
- -1,528 net lines (code cleanup)

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