# 🎨 Raven 3 Style Reference

Official style guide for Raven's terminal-inspired UI aesthetic. All components should follow these values for consistency.

---

## 📐 Typography

### Font Families

```css
--mono: 'JetBrainsMono Nerd Font', 'FiraCode Nerd Font', 'Hack Nerd Font', ui-monospace, monospace;
--sans: var(--mono); /* Use monospace everywhere for terminal feel */
```

### Font Sizes (Terminal Compact)

| Size   | Usage                                                |
| ------ | ---------------------------------------------------- |
| `13px` | Headings (h3), brand text, primary labels            |
| `12px` | Body text, buttons, inputs, most UI elements         |
| `11px` | Small text, badges, pills, helper text, meter labels |

**Rule**: Never exceed 13px. Keep the htop/btop density.

### Line Height

```css
line-height: 1.4; /* Compact, terminal-style */
```

---

## 📏 Spacing Scale

### Padding

| Value  | Usage                          |
| ------ | ------------------------------ |
| `4px`  | Minimal (pills, tight badges)  |
| `6px`  | Small (inputs, small buttons)  |
| `8px`  | Compact buttons, list items    |
| `10px` | Standard buttons, feed lines   |
| `12px` | Cards, panels, most containers |
| `16px` | Main containers, page padding  |

**Rule**: Never exceed 16px padding. Use 12px as default for cards/panels.

### Gaps & Margins

| Value  | Usage                                    |
| ------ | ---------------------------------------- |
| `8px`  | Tight spacing (meters, compact grids)    |
| `10px` | Standard margins (card h3 margin-bottom) |
| `12px` | Grid gaps, container spacing             |

**Rule**: Use 12px for most gaps. Use 8px-10px for tight layouts.

### Heights

| Value   | Usage                                          |
| ------- | ---------------------------------------------- |
| `8px`   | Meter bars, progress indicators                |
| `260px` | Max height for scrollable panels (feeds, logs) |

---

## 🎨 Color System (CSS Variables)

### Theme-Adaptive Colors

Always use CSS variables instead of hardcoded hex colors:

```css
/* Backgrounds */
--bg: /* Main background */ --surface: /* Card/panel backgrounds */
  --surface-2: /* Hover states, secondary surfaces */ /* Text */ --text: /* Primary text */
  --text-heading: /* Headings, emphasis */ --muted: /* Secondary text, labels */ /* Borders */
  --border: /* All borders */ /* Accents */ --accent: /* Primary accent color */
  --accent-2: /* Secondary accent (gradients) */ /* Status Colors */
  --success: /* Green - success states */ --error: /* Red - error states */
  --warning: /* Yellow/Orange - warnings */ --info: /* Blue - informational */
  /* Semantic Pill Colors */ --pill-success: /* Green pills (additions) */
  --pill-error: /* Red pills (deletions) */ --pill-mod: /* Yellow pills (modifications) */;
```

### Three Theme Variants

**Day (Gruvbox Light)**

- Background: `#fbf1c7` (cream)
- Accent: `#98971a` (green)

**Dusk (Ristretto)**

- Background: `#2c2421` (dark brown)
- Accent: `#f79a3e` (orange)

**Night (Tokyo Night)** ⭐ Default

- Background: `#1a1b26` (dark blue)
- Accent: `#7aa2f7` (blue)

---

## 🧩 Component Patterns

### Cards

```css
.card {
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: var(--radius); /* 4px */
  padding: 12px;
}

.card h3 {
  margin-top: 0;
  margin-bottom: 10px;
  color: var(--text-heading);
  font-weight: 700;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
```

### Buttons

```css
.btn {
  padding: 10px 16px;
  font-size: 12px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  cursor: pointer;
  transition: all 0.15s;
}
```

### Pills/Badges

```css
.pill {
  font-size: 11px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: var(--radius);
}

.badge {
  display: inline-block;
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 700;
  border: 1px solid;
  border-radius: var(--radius);
}
```

### Feed/Log Displays

```css
.feed {
  font-family: var(--mono);
  font-size: 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 10px;
  max-height: 260px;
  overflow: auto;
}

.feed .line {
  padding: 4px 0;
  border-bottom: 1px solid var(--border);
}
```

### Meters/Progress Bars

```css
.meter-label {
  display: flex;
  justify-content: space-between;
  margin-bottom: 3px;
  font-size: 11px;
  font-weight: normal;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.bar {
  height: 8px;
  background: var(--surface-2);
  border-radius: var(--radius);
  border: 1px solid var(--border);
  overflow: hidden;
}

.bar > span {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--accent-2));
  width: var(--val, 50%);
  transition: width 0.3s;
}
```

### Inputs

```css
.input {
  padding: 6px 10px;
  font-size: 12px;
  font-family: var(--mono);
  border-radius: var(--radius);
  border: 1px solid var(--input-border);
  background: var(--input-bg);
  color: var(--input-text);
  transition: border-color 0.15s;
}

.input:focus {
  outline: none;
  border-color: var(--input-focus-border);
}
```

---

## ✅ Design Principles

1. **Terminal Aesthetic**: Think htop, btop, and system monitoring tools
2. **Data Density**: Maximize information, minimize whitespace
3. **Monospace Everything**: Use `var(--mono)` for all text
4. **Small & Compact**: 11-13px fonts, 4-16px padding
5. **Theme Variables**: Never hardcode colors - always use CSS vars
6. **Minimal Shadows**: `--shadow: none` by default
7. **Sharp Borders**: `--radius: 4px` for subtle rounding
8. **Fast Transitions**: `0.15s` - `0.3s` max

---

## 🚫 Anti-Patterns (Don't Do This)

❌ Large font sizes (>13px for body text)
❌ Excessive padding (>16px)
❌ Hardcoded hex colors instead of CSS variables
❌ Line heights >1.5 (too loose)
❌ Box shadows or heavy effects
❌ Rounded corners >4px
❌ Mixing font families

---

## 📝 Quick Reference

When building new components:

```css
/* Standard Card */
padding: 12px;
font-size: 12px;
border: 1px solid var(--border);
background: var(--surface);

/* Heading */
font-size: 13px;
margin-bottom: 10px;
text-transform: uppercase;

/* Small Text */
font-size: 11px;
color: var(--muted);

/* Spacing */
gap: 12px;
margin-bottom: 10px;
```

---

**Last Updated**: 2025-10-18
**Source**: `~/Projects/raven/brand/raven_style_guide.html`
**Applied**: All components in `/frontend/src/lib/` + `App.svelte`
