# Raven Excellence Plan: Achieving 9.7+ Across All Areas
**Target:** Bring all audit scores to 9.7/10 or higher
**Current Overall:** 9.6/10
**Target Overall:** 9.8/10
**Timeline:** 4-6 weeks (80-120 hours total)
**Status:** 📋 Planning Complete - Ready for Implementation

---

## Executive Summary

**Current State Analysis:**

| Area | Current | Target | Gap | Priority |
|------|---------|--------|-----|----------|
| **Accessibility** | 6.5/10 | 9.7/10 | 🔴 **-3.2** | CRITICAL |
| **State Management** | 8.7/10 | 9.7/10 | 🟡 **-1.0** | HIGH |
| **Error Handling** | 9.0/10 | 9.7/10 | 🟡 **-0.7** | HIGH |
| **API Design** | 9.0/10 | 9.7/10 | 🟡 **-0.7** | HIGH |
| **Performance** | 9.3/10 | 9.7/10 | 🟢 **-0.4** | MEDIUM |
| **Architecture** | 9.8/10 | 9.8/10 | 🟢 **+0.0** | MAINTAIN |
| **Database** | 9.9/10 | 9.9/10 | 🟢 **+0.0** | MAINTAIN |
| **Documentation** | 9.9/10 | 9.9/10 | 🟢 **+0.0** | MAINTAIN |
| **Security** | 10.0/10 | 10.0/10 | 🟢 **Perfect** | MAINTAIN |

**Total Improvement Hours:** 80-120 hours (4-6 weeks @ 20 hours/week)

---

## Phase 1: Accessibility Excellence (6.5 → 9.7+)
**Duration:** 30-45 hours
**Priority:** CRITICAL
**Target Score:** 9.7/10

### Current State
```
✅ ARIA coverage: 15/69 components (22%)
⚠️ Keyboard navigation: Untested
⚠️ Color contrast: Untested
⚠️ Screen reader support: Partial
⚠️ Focus management: Incomplete
```

### Target State
```
✅ ARIA coverage: 65+/69 components (95%)
✅ Keyboard navigation: Full support
✅ Color contrast: WCAG AA compliant
✅ Screen reader support: Comprehensive
✅ Focus management: Complete
```

---

### 1.1 ARIA Implementation (20-30 hours)

**Goal:** Add ARIA attributes to all interactive components

#### 1.1.1 Critical Components (8-12 hours)
**Components:** Dashboard, EventFeed, ProjectsOverview, HealthWidget, MetricsPanel

**Tasks:**
```javascript
// Example: Dashboard.svelte
<main role="main" aria-label="Dashboard">
  <section aria-labelledby="stats-heading">
    <h2 id="stats-heading">Project Statistics</h2>
    <!-- ... -->
  </section>

  <button
    aria-label="Refresh dashboard data"
    aria-pressed="false"
    @click={refresh}
  >
    🔄
  </button>

  <div
    role="status"
    aria-live="polite"
    aria-atomic="true"
  >
    {#if loading}
      <span>Loading dashboard...</span>
    {/if}
  </div>
</main>
```

**Checklist per component:**
- [ ] Add `role` attributes (main, navigation, complementary, etc.)
- [ ] Add `aria-label` to icon-only buttons
- [ ] Add `aria-labelledby` for section headings
- [ ] Add `aria-live` for dynamic content
- [ ] Add `aria-busy` for loading states
- [ ] Add `aria-expanded` for expandable sections
- [ ] Add `aria-selected` for tabs/lists
- [ ] Add `aria-current` for active navigation items

**Components to update:**
1. Dashboard.svelte
2. EventFeed.svelte
3. ProjectsOverview.svelte
4. HealthWidget.svelte
5. MetricsPanel.svelte
6. SessionDashboard.svelte
7. AgentProfilePanel.svelte
8. FileHistoryPanel.svelte
9. ConversationHistory.svelte
10. SettingsPanel.svelte

---

#### 1.1.2 Form Components (4-6 hours)
**Components:** Login, Settings, Search, Filters

**Tasks:**
```javascript
// Example: LoginForm.svelte
<form aria-labelledby="login-heading">
  <h2 id="login-heading">Login to Raven</h2>

  <div>
    <label for="username">Username</label>
    <input
      id="username"
      type="text"
      aria-required="true"
      aria-invalid={errors.username ? 'true' : 'false'}
      aria-describedby={errors.username ? 'username-error' : undefined}
    />
    {#if errors.username}
      <span id="username-error" role="alert">
        {errors.username}
      </span>
    {/if}
  </div>

  <button type="submit" aria-label="Submit login form">
    Login
  </button>
</form>
```

**Checklist:**
- [ ] Link labels with inputs (`for` + `id`)
- [ ] Add `aria-required` to required fields
- [ ] Add `aria-invalid` for validation errors
- [ ] Add `aria-describedby` linking errors
- [ ] Add `role="alert"` for error messages
- [ ] Add `aria-live="assertive"` for critical errors

---

#### 1.1.3 Navigation & Menus (3-4 hours)

**Tasks:**
```javascript
// Example: Navigation.svelte
<nav aria-label="Main navigation">
  <ul role="menubar">
    <li role="none">
      <a
        role="menuitem"
        href="/dashboard"
        aria-current={currentPage === 'dashboard' ? 'page' : undefined}
      >
        Dashboard
      </a>
    </li>
  </ul>
</nav>

// Dropdown menu
<div class="dropdown">
  <button
    aria-haspopup="true"
    aria-expanded={isOpen}
    @click={toggle}
  >
    Menu
  </button>
  {#if isOpen}
    <ul role="menu" aria-label="Actions menu">
      <li role="menuitem">Action 1</li>
      <li role="menuitem">Action 2</li>
    </ul>
  {/if}
</div>
```

**Checklist:**
- [ ] Add `aria-label` to navigation
- [ ] Add `aria-current` for active page
- [ ] Add `aria-expanded` for dropdowns
- [ ] Add `aria-haspopup` for menus
- [ ] Add proper `role` for menu items

---

#### 1.1.4 Tables & Lists (3-4 hours)

**Tasks:**
```javascript
// Example: EventTable.svelte
<table role="table" aria-label="File change events">
  <caption class="sr-only">
    Recent file change events with timestamps and details
  </caption>
  <thead>
    <tr>
      <th scope="col">File</th>
      <th scope="col">Type</th>
      <th scope="col">Time</th>
    </tr>
  </thead>
  <tbody>
    {#each events as event}
      <tr>
        <td>{event.filepath}</td>
        <td>{event.change_type}</td>
        <td>
          <time datetime={event.timestamp}>
            {formatTime(event.timestamp)}
          </time>
        </td>
      </tr>
    {/each}
  </tbody>
</table>
```

**Checklist:**
- [ ] Add `aria-label` or `<caption>`
- [ ] Use `scope="col"` for headers
- [ ] Add `role="table"` if using divs
- [ ] Add row/cell counts for screen readers
- [ ] Add sortable column indicators

---

#### 1.1.5 Modals & Dialogs (2-3 hours)

**Tasks:**
```javascript
// Example: Modal.svelte
<div
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-title"
  aria-describedby="modal-description"
>
  <h2 id="modal-title">Confirm Action</h2>
  <p id="modal-description">
    Are you sure you want to delete this file?
  </p>

  <button aria-label="Cancel and close dialog">Cancel</button>
  <button aria-label="Confirm deletion">Delete</button>
</div>

<script>
  import { onMount } from 'svelte';

  onMount(() => {
    // Trap focus in modal
    trapFocus();

    // Restore focus on close
    return () => restoreFocus();
  });
</script>
```

**Checklist:**
- [ ] Add `role="dialog"` and `aria-modal="true"`
- [ ] Add `aria-labelledby` and `aria-describedby`
- [ ] Implement focus trapping
- [ ] Restore focus on close
- [ ] Close on Escape key

---

### 1.2 Keyboard Navigation (6-8 hours)

**Goal:** Full keyboard-only navigation support

#### 1.2.1 Focus Management (3-4 hours)

**Tasks:**
```javascript
// Add visible focus indicators
// styles.css
:focus-visible {
  outline: 2px solid var(--focus-color);
  outline-offset: 2px;
}

// Skip to main content link
<a href="#main-content" class="skip-link">
  Skip to main content
</a>

<main id="main-content" tabindex="-1">
  <!-- Content -->
</main>
```

**Checklist:**
- [ ] Add visible focus indicators (all interactive elements)
- [ ] Add "Skip to main content" link
- [ ] Ensure logical tab order
- [ ] Remove tabindex > 0 (anti-pattern)
- [ ] Add `tabindex="0"` to custom interactive elements
- [ ] Add `tabindex="-1"` for programmatic focus

---

#### 1.2.2 Keyboard Shortcuts (3-4 hours)

**Tasks:**
```javascript
// KeyboardShortcuts.svelte
<script>
  import { onMount } from 'svelte';

  const shortcuts = {
    '/': () => document.getElementById('search')?.focus(),
    '?': () => showKeyboardHelp(),
    'Escape': () => closeModal(),
    'r': () => refresh(),
    'n': () => createNew()
  };

  function handleKeydown(e) {
    // Ignore if typing in input
    if (e.target.matches('input, textarea')) return;

    const handler = shortcuts[e.key];
    if (handler) {
      e.preventDefault();
      handler();
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });
</script>

<!-- Keyboard shortcuts help modal -->
<button
  aria-label="Show keyboard shortcuts (press ? key)"
  @click={showKeyboardHelp}
>
  ?
</button>
```

**Standard Shortcuts to Implement:**
- [ ] `/` - Focus search
- [ ] `?` - Show keyboard shortcuts help
- [ ] `Escape` - Close modals/dropdowns
- [ ] `r` - Refresh current view
- [ ] `Arrow keys` - Navigate lists/tables
- [ ] `Enter/Space` - Activate buttons
- [ ] `Tab/Shift+Tab` - Navigate focusable elements

---

### 1.3 Color Contrast Audit (2-3 hours)

**Goal:** WCAG AA compliance (4.5:1 for normal text, 3:1 for large text)

#### 1.3.1 Audit Current Colors (1 hour)

**Tools:**
```bash
# Use WebAIM Contrast Checker
# https://webaim.org/resources/contrastchecker/

# Or browser extensions:
# - axe DevTools
# - WAVE
# - Lighthouse
```

**Create audit spreadsheet:**
```
| Element           | Foreground | Background | Ratio | Pass/Fail |
|-------------------|------------|------------|-------|-----------|
| Body text         | #333       | #fff       | 12:1  | ✅ AAA    |
| Button primary    | #fff       | #3b82f6    | 4.6:1 | ✅ AA     |
| Button disabled   | #9ca3af    | #f3f4f6    | 2.1:1 | ❌ FAIL   |
| Error text        | #ef4444    | #fff       | 4.5:1 | ✅ AA     |
| Success text      | #10b981    | #fff       | 3.4:1 | ❌ FAIL   |
```

---

#### 1.3.2 Fix Contrast Issues (1-2 hours)

**Tasks:**
```javascript
// Update CSS variables
:root {
  /* Before: Low contrast */
  --success-color: #10b981; /* 3.4:1 - FAIL */

  /* After: High contrast */
  --success-color: #059669; /* 4.5:1 - PASS */

  /* Disabled states */
  --disabled-text: #6b7280; /* 4.5:1 on white */
  --disabled-bg: #e5e7eb;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  :root {
    --text-primary: #f3f4f6;   /* Light text */
    --bg-primary: #1f2937;      /* Dark background */
    /* Ensure 4.5:1 ratio */
  }
}
```

**Checklist:**
- [ ] Audit all text colors
- [ ] Fix failing contrasts (darken text or lighten background)
- [ ] Verify button states (hover, focus, disabled)
- [ ] Check status indicators (success, warning, error)
- [ ] Verify dark mode contrasts
- [ ] Add high contrast mode support

---

### 1.4 Screen Reader Support (4-6 hours)

**Goal:** Comprehensive screen reader announcements

#### 1.4.1 Dynamic Content Announcements (2-3 hours)

**Tasks:**
```javascript
// ScreenReaderAnnouncer.svelte
<script>
  export let message = '';
  export let politeness = 'polite'; // 'polite' | 'assertive'
</script>

<div
  role="status"
  aria-live={politeness}
  aria-atomic="true"
  class="sr-only"
>
  {message}
</div>

<style>
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
  }
</style>

// Usage in components:
<script>
  import ScreenReaderAnnouncer from './ScreenReaderAnnouncer.svelte';

  let announcement = '';

  function refresh() {
    announcement = 'Refreshing dashboard data...';
    // ... fetch data
    announcement = 'Dashboard data refreshed. 10 new events.';
  }
</script>

<ScreenReaderAnnouncer message={announcement} />
```

**Announcements to add:**
- [ ] Loading states ("Loading dashboard...")
- [ ] Success messages ("File saved successfully")
- [ ] Error messages ("Failed to save file")
- [ ] Data updates ("5 new events")
- [ ] Navigation ("Navigated to Projects page")
- [ ] Form validation ("3 errors in form")

---

#### 1.4.2 Semantic HTML (1-2 hours)

**Tasks:**
```javascript
// Use semantic elements
<header>
  <h1>Raven Dashboard</h1>
  <nav aria-label="Main">...</nav>
</header>

<main>
  <article aria-labelledby="stats-heading">
    <h2 id="stats-heading">Statistics</h2>
    <!-- ... -->
  </article>

  <aside aria-label="Recent activity">
    <!-- ... -->
  </aside>
</main>

<footer>
  <p>&copy; 2025 Raven</p>
</footer>
```

**Checklist:**
- [ ] Use `<header>`, `<main>`, `<footer>`
- [ ] Use `<nav>`, `<article>`, `<aside>`, `<section>`
- [ ] Use heading hierarchy (h1 → h2 → h3)
- [ ] Use `<time>` for timestamps
- [ ] Use `<button>` for actions (not `<div onclick>`)
- [ ] Use `<a>` for links (not `<span onclick>`)

---

#### 1.4.3 Image Alt Text & Accessibility (1 hour)

**Tasks:**
```javascript
// Decorative images (no alt needed)
<img src="logo.svg" alt="" role="presentation" />

// Informative images
<img
  src="chart.png"
  alt="Bar chart showing 5 events in the last hour"
/>

// Icon buttons
<button aria-label="Close modal">
  <svg aria-hidden="true">
    <use href="#icon-close" />
  </svg>
</button>

// Status icons
<span class="status-icon" aria-label="Healthy">
  ✅
</span>
```

**Checklist:**
- [ ] Add alt text to all informative images
- [ ] Add `alt=""` to decorative images
- [ ] Add `aria-label` to icon-only buttons
- [ ] Add `aria-hidden="true"` to decorative SVGs
- [ ] Add text alternatives for charts/graphs

---

### 1.5 Testing & Validation (4-6 hours)

**Goal:** Verify accessibility compliance

#### 1.5.1 Automated Testing (2-3 hours)

**Tools to use:**
```bash
# Install axe-core for automated testing
npm install --save-dev @axe-core/cli axe-core

# Run accessibility tests
npx @axe-core/cli http://localhost:5173

# Add to package.json
{
  "scripts": {
    "test:a11y": "axe http://localhost:5173 --exit"
  }
}
```

**Create test file:**
```javascript
// frontend/src/lib/__tests__/accessibility.test.js
import { describe, it, expect } from 'vitest';
import { axe } from 'jest-axe';
import { render } from '@testing-library/svelte';
import Dashboard from '../Dashboard.svelte';

describe('Accessibility', () => {
  it('Dashboard should have no accessibility violations', async () => {
    const { container } = render(Dashboard);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
```

**Checklist:**
- [ ] Install and configure axe-core
- [ ] Run automated tests on all pages
- [ ] Fix all violations
- [ ] Add a11y tests to CI/CD
- [ ] Test with Lighthouse
- [ ] Test with WAVE

---

#### 1.5.2 Manual Testing (2-3 hours)

**Screen Reader Testing:**
```
✅ Test with NVDA (Windows, free)
✅ Test with JAWS (Windows, trial)
✅ Test with VoiceOver (macOS, built-in)
✅ Test with Orca (Linux, free)
```

**Keyboard Testing Checklist:**
- [ ] Can navigate entire app with Tab key
- [ ] All interactive elements focusable
- [ ] Focus indicator visible
- [ ] Can activate buttons with Enter/Space
- [ ] Can close modals with Escape
- [ ] Tab order is logical
- [ ] No keyboard traps

**Browser Testing:**
- [ ] Chrome + ChromeVox
- [ ] Firefox + NVDA
- [ ] Safari + VoiceOver
- [ ] Edge + Narrator

---

### 1.6 Accessibility Documentation (1-2 hours)

**Create ACCESSIBILITY.md:**
```markdown
# Raven Accessibility Guide

## Compliance Level
- WCAG 2.1 Level AA ✅
- Section 508 Compliant ✅
- ARIA 1.2 Specification ✅

## Keyboard Shortcuts
- `/` - Focus search
- `?` - Show keyboard shortcuts
- `Escape` - Close modals
- `r` - Refresh view
- `Tab` - Next element
- `Shift+Tab` - Previous element

## Screen Reader Support
- NVDA (Windows) ✅
- JAWS (Windows) ✅
- VoiceOver (macOS) ✅
- Orca (Linux) ✅

## High Contrast Mode
Supports Windows High Contrast Mode and browser zoom up to 200%.

## Testing
Run accessibility tests:
\`\`\`bash
npm run test:a11y
\`\`\`
```

---

## Phase 2: State Management Excellence (8.7 → 9.7+)
**Duration:** 8-12 hours
**Priority:** HIGH
**Target Score:** 9.7/10

### Current State
```
✅ Svelte stores: Basic implementation
⚠️ Global state: Minimal usage
⚠️ State persistence: Not implemented
⚠️ State debugging: No dev tools
⚠️ State synchronization: Basic WebSocket
```

### Target State
```
✅ Centralized state management
✅ State persistence (localStorage)
✅ Time-travel debugging support
✅ Optimistic updates
✅ State synchronization (robust)
```

---

### 2.1 Enhanced Store Architecture (4-6 hours)

**Create centralized store:**
```javascript
// frontend/src/lib/stores/index.js
import { writable, derived, get } from 'svelte/store';
import { persist } from './persist.js';

// Global app state
export const appState = persist(writable({
  user: null,
  activeProject: null,
  theme: 'dark',
  sidebarOpen: true
}), 'app-state');

// UI state
export const uiState = writable({
  loading: false,
  modal: null,
  toast: null
});

// Project state
export const projectState = writable({
  projects: [],
  currentProject: null,
  events: [],
  stats: {}
});

// Derived stores
export const isAuthenticated = derived(
  appState,
  $appState => !!$appState.user
);

export const currentProjectEvents = derived(
  [projectState, appState],
  ([$projectState, $appState]) => {
    return $projectState.events.filter(
      e => e.project === $appState.activeProject
    );
  }
);
```

**Create persistence utility:**
```javascript
// frontend/src/lib/stores/persist.js
import { writable } from 'svelte/store';

export function persist(store, key) {
  // Load from localStorage
  const stored = localStorage.getItem(key);
  if (stored) {
    try {
      store.set(JSON.parse(stored));
    } catch (e) {
      console.error(`Failed to parse stored ${key}:`, e);
    }
  }

  // Subscribe to changes
  store.subscribe(value => {
    localStorage.setItem(key, JSON.stringify(value));
  });

  return store;
}
```

**Tasks:**
- [ ] Create centralized store structure
- [ ] Implement persistence layer
- [ ] Add derived stores for computed values
- [ ] Migrate components to use centralized stores
- [ ] Add store documentation

**Time:** 4-6 hours

---

### 2.2 Optimistic Updates (2-3 hours)

**Implementation:**
```javascript
// frontend/src/lib/stores/actions.js
import { projectState, uiState } from './index.js';
import { api } from '../api.js';

export async function deleteFile(filepath) {
  // Get current state
  const currentEvents = get(projectState).events;

  // Optimistic update (immediate UI feedback)
  projectState.update(state => ({
    ...state,
    events: state.events.filter(e => e.filepath !== filepath)
  }));

  try {
    // API call
    await api.delete(`/files/${filepath}`);

    // Success - state already updated
    uiState.update(state => ({
      ...state,
      toast: { type: 'success', message: 'File deleted' }
    }));
  } catch (error) {
    // Rollback on error
    projectState.update(state => ({
      ...state,
      events: currentEvents
    }));

    uiState.update(state => ({
      ...state,
      toast: { type: 'error', message: 'Failed to delete file' }
    }));
  }
}
```

**Tasks:**
- [ ] Implement optimistic update pattern
- [ ] Add rollback on error
- [ ] Add loading states
- [ ] Add success/error feedback

**Time:** 2-3 hours

---

### 2.3 State Debugging Tools (2-3 hours)

**Add dev tools:**
```javascript
// frontend/src/lib/stores/devtools.js
import { appState, projectState, uiState } from './index.js';

if (import.meta.env.DEV) {
  // Log all state changes
  appState.subscribe(state => {
    console.log('[AppState]', state);
  });

  projectState.subscribe(state => {
    console.log('[ProjectState]', state);
  });

  // Expose to window for debugging
  window.__RAVEN_STATE__ = {
    appState,
    projectState,
    uiState
  };

  // Time-travel debugging
  const stateHistory = [];
  let historyIndex = -1;

  projectState.subscribe(state => {
    stateHistory.push(JSON.parse(JSON.stringify(state)));
    historyIndex = stateHistory.length - 1;
  });

  window.__RAVEN_DEBUG__ = {
    undo: () => {
      if (historyIndex > 0) {
        historyIndex--;
        projectState.set(stateHistory[historyIndex]);
      }
    },
    redo: () => {
      if (historyIndex < stateHistory.length - 1) {
        historyIndex++;
        projectState.set(stateHistory[historyIndex]);
      }
    },
    getHistory: () => stateHistory
  };
}
```

**Tasks:**
- [ ] Add state logging in dev mode
- [ ] Expose state to window for debugging
- [ ] Add time-travel debugging (undo/redo)
- [ ] Create state inspector panel

**Time:** 2-3 hours

---

## Phase 3: Error Handling Excellence (9.0 → 9.7+)
**Duration:** 6-10 hours
**Priority:** HIGH
**Target Score:** 9.7/10

### 3.1 Custom Error Classes (2-3 hours)

**Create error hierarchy:**
```javascript
// backend/utils/errors.js

export class AppError extends Error {
  constructor(message, statusCode = 500, errorCode = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    this.isOperational = true; // vs programmer errors

    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: {
        message: this.message,
        code: this.errorCode,
        statusCode: this.statusCode,
        ...(this.details && { details: this.details })
      }
    };
  }
}

export class ValidationError extends AppError {
  constructor(message, details) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class ConflictError extends AppError {
  constructor(message, details) {
    super(message, 409, 'CONFLICT', details);
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfter = '15 minutes') {
    super('Too many requests', 429, 'RATE_LIMIT_EXCEEDED', { retryAfter });
  }
}

export class DatabaseError extends AppError {
  constructor(message, originalError) {
    super(message, 500, 'DATABASE_ERROR', {
      originalError: originalError.message
    });
  }
}

export class ExternalServiceError extends AppError {
  constructor(service, originalError) {
    super(
      `External service error: ${service}`,
      503,
      'EXTERNAL_SERVICE_ERROR',
      { service, originalError: originalError.message }
    );
  }
}
```

**Tasks:**
- [ ] Create error class hierarchy
- [ ] Update all routes to use custom errors
- [ ] Add error serialization
- [ ] Add error logging metadata

**Time:** 2-3 hours

---

### 3.2 Global Error Handler Enhancement (2-3 hours)

**Enhance error handler:**
```javascript
// backend/middleware/error-handler.js

import { logger } from '../utils/logger.js';
import { AppError } from '../utils/errors.js';

export function errorHandler(err, req, res, next) {
  // Normalize error to AppError
  let error = err;

  if (!(err instanceof AppError)) {
    // Convert unknown errors
    if (err.name === 'ValidationError') {
      error = new ValidationError(err.message, err.details);
    } else if (err.code === 'SQLITE_CONSTRAINT') {
      error = new ConflictError('Resource already exists');
    } else {
      error = new AppError(
        err.message || 'An unexpected error occurred',
        err.statusCode || 500,
        err.errorCode || 'INTERNAL_ERROR'
      );
    }
  }

  // Log error with context
  const logContext = {
    errorCode: error.errorCode,
    statusCode: error.statusCode,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    userId: req.user?.id,
    requestId: req.id
  };

  if (error.statusCode >= 500) {
    logger.error(error.message, {
      ...logContext,
      stack: error.stack,
      details: error.details
    });
  } else {
    logger.warn(error.message, logContext);
  }

  // Send response
  const response = error.toJSON();

  // Add stack trace in development
  if (process.env.NODE_ENV !== 'production') {
    response.error.stack = error.stack.split('\n');
  }

  // Add request ID for tracking
  if (req.id) {
    response.error.requestId = req.id;
  }

  res.status(error.statusCode).json(response);
}
```

**Tasks:**
- [ ] Enhance global error handler
- [ ] Add error normalization
- [ ] Add detailed logging
- [ ] Add error tracking (request IDs)

**Time:** 2-3 hours

---

### 3.3 Frontend Error Handling (2-4 hours)

**Create error boundary:**
```javascript
// frontend/src/lib/ErrorBoundary.svelte
<script>
  import { onDestroy } from 'svelte';
  import { logger } from './logger.js';

  export let fallback = null;

  let error = null;
  let errorInfo = null;

  function handleError(event) {
    error = event.error;
    errorInfo = {
      componentStack: event.error.stack,
      timestamp: new Date().toISOString()
    };

    // Log to console
    logger.error('Component error:', error, errorInfo);

    // Send to error tracking service (optional)
    // trackError(error, errorInfo);
  }

  onMount(() => {
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  });
</script>

{#if error}
  {#if fallback}
    <svelte:component this={fallback} {error} {errorInfo} />
  {:else}
    <div class="error-boundary">
      <h2>Something went wrong</h2>
      <p>{error.message}</p>
      <button on:click={() => location.reload()}>
        Reload Page
      </button>
    </div>
  {/if}
{:else}
  <slot />
{/if}
```

**Create API error handler:**
```javascript
// frontend/src/lib/api.js
import { uiState } from './stores';

export async function apiRequest(endpoint, options = {}) {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new APIError(
        error.error.message,
        error.error.code,
        response.status,
        error.error.details
      );
    }

    return await response.json();
  } catch (error) {
    // Handle network errors
    if (error instanceof TypeError) {
      throw new NetworkError('Network request failed. Check your connection.');
    }

    // Re-throw API errors
    throw error;
  }
}

export class APIError extends Error {
  constructor(message, code, status, details) {
    super(message);
    this.name = 'APIError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class NetworkError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NetworkError';
  }
}
```

**Tasks:**
- [ ] Create error boundary component
- [ ] Create API error handler
- [ ] Add global error toast notifications
- [ ] Add retry logic for failed requests

**Time:** 2-4 hours

---

## Phase 4: API Design Excellence (9.0 → 9.7+)
**Duration:** 8-12 hours
**Priority:** HIGH
**Target Score:** 9.7/10

### 4.1 API Versioning (4-6 hours)

**Implement versioning:**
```javascript
// backend/server.js

// V1 API (current)
const v1Router = express.Router();

// Mount all current routes under v1
v1Router.use('/auth', createAuthRoutes(deps));
v1Router.use('/events', createEventsRoutes(deps));
v1Router.use('/projects', createProjectRoutes(deps));
// ... all other routes

// Mount versioned API
app.use('/api/v1', v1Router);

// Alias /api to /api/v1 for backward compatibility
app.use('/api', v1Router);

// Add API version header
app.use((req, res, next) => {
  res.setHeader('X-API-Version', 'v1');
  next();
});
```

**Create version detection:**
```javascript
// backend/middleware/api-version.js

export function apiVersion(req, res, next) {
  // Support version in header
  const headerVersion = req.get('Accept-Version') || req.get('X-API-Version');

  // Support version in URL
  const urlVersion = req.path.match(/^\/api\/v(\d+)\//)?[1];

  // Default to v1
  req.apiVersion = urlVersion || headerVersion || '1';

  next();
}
```

**Tasks:**
- [ ] Create v1 namespace
- [ ] Add backward compatible alias
- [ ] Add version headers
- [ ] Document versioning strategy
- [ ] Create migration guide (future)

**Time:** 4-6 hours

---

### 4.2 Enhanced Pagination (2-3 hours)

**Implement cursor-based pagination:**
```javascript
// backend/utils/pagination.js

export function paginateResults(results, options = {}) {
  const {
    limit = 100,
    cursor = null,
    sortBy = 'id',
    sortOrder = 'desc'
  } = options;

  // Get one extra to check if there are more
  const items = results.slice(0, limit + 1);
  const hasMore = items.length > limit;

  // Remove extra item
  if (hasMore) items.pop();

  // Calculate next cursor
  const nextCursor = hasMore && items.length > 0
    ? Buffer.from(JSON.stringify({
        [sortBy]: items[items.length - 1][sortBy]
      })).toString('base64')
    : null;

  return {
    data: items,
    pagination: {
      limit,
      hasMore,
      nextCursor,
      total: results.length // if available
    }
  };
}

// Usage in route:
router.get('/events', async (req, res) => {
  const { limit = 100, cursor } = req.query;

  // Decode cursor
  let cursorData = null;
  if (cursor) {
    cursorData = JSON.parse(
      Buffer.from(cursor, 'base64').toString()
    );
  }

  // Query with cursor
  const events = db.getEvents({
    limit: parseInt(limit) + 1,
    ...(cursorData && { afterId: cursorData.id })
  });

  const result = paginateResults(events, { limit: parseInt(limit) });

  res.json(result);
});
```

**Response format:**
```json
{
  "data": [...],
  "pagination": {
    "limit": 100,
    "hasMore": true,
    "nextCursor": "eyJpZCI6MTIzfQ==",
    "total": 1234
  }
}
```

**Tasks:**
- [ ] Implement cursor-based pagination
- [ ] Add pagination helper
- [ ] Update all list endpoints
- [ ] Add pagination metadata
- [ ] Document pagination in API docs

**Time:** 2-3 hours

---

### 4.3 API Documentation Enhancement (2-3 hours)

**Enhance Swagger docs:**
```javascript
// backend/routes/api-docs.js

/**
 * @swagger
 * /api/v1/events:
 *   get:
 *     summary: Get file change events
 *     description: Returns a paginated list of file change events
 *     tags:
 *       - Events
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *           minimum: 1
 *           maximum: 1000
 *         description: Number of items to return
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *         description: Pagination cursor from previous response
 *       - in: query
 *         name: project
 *         schema:
 *           type: string
 *         description: Filter by project name
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Event'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *     security:
 *       - bearerAuth: []
 */
```

**Tasks:**
- [ ] Add detailed JSDoc to all endpoints
- [ ] Document request/response schemas
- [ ] Add example requests/responses
- [ ] Document error codes
- [ ] Add authentication requirements

**Time:** 2-3 hours

---

## Phase 5: Performance Excellence (9.3 → 9.7+)
**Duration:** 6-10 hours
**Priority:** MEDIUM
**Target Score:** 9.7/10

### 5.1 Frontend Performance Optimization (3-5 hours)

**Virtual scrolling for large lists:**
```javascript
// frontend/src/lib/VirtualList.svelte
<script>
  export let items = [];
  export let itemHeight = 50;
  export let visibleCount = 20;

  let scrollTop = 0;
  let containerHeight = visibleCount * itemHeight;

  $: startIndex = Math.floor(scrollTop / itemHeight);
  $: endIndex = Math.min(
    startIndex + visibleCount + 1,
    items.length
  );
  $: visibleItems = items.slice(startIndex, endIndex);
  $: offsetY = startIndex * itemHeight;

  function handleScroll(e) {
    scrollTop = e.target.scrollTop;
  }
</script>

<div
  class="virtual-list"
  style="height: {containerHeight}px"
  on:scroll={handleScroll}
>
  <div style="height: {items.length * itemHeight}px">
    <div style="transform: translateY({offsetY}px)">
      {#each visibleItems as item, i (startIndex + i)}
        <div class="item" style="height: {itemHeight}px">
          <slot {item} index={startIndex + i} />
        </div>
      {/each}
    </div>
  </div>
</div>
```

**Lazy loading images:**
```javascript
// frontend/src/lib/LazyImage.svelte
<script>
  import { onMount } from 'svelte';

  export let src;
  export let alt = '';
  export let placeholder = '/placeholder.png';

  let loaded = false;
  let element;

  onMount(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          loaded = true;
          observer.disconnect();
        }
      });
    });

    observer.observe(element);

    return () => observer.disconnect();
  });
</script>

<img
  bind:this={element}
  src={loaded ? src : placeholder}
  {alt}
  loading="lazy"
/>
```

**Tasks:**
- [ ] Implement virtual scrolling for event lists
- [ ] Add lazy loading for images
- [ ] Implement code splitting
- [ ] Add service worker for offline support
- [ ] Optimize bundle size

**Time:** 3-5 hours

---

### 5.2 Database Query Optimization (2-3 hours)

**Add query performance monitoring:**
```javascript
// backend/db.js

class RavenDB {
  // ... existing code

  prepareStatement(sql) {
    if (!this.stmtCache.has(sql)) {
      const stmt = this.db.prepare(sql);

      // Wrap in performance monitor (dev only)
      if (process.env.NODE_ENV !== 'production') {
        this.stmtCache.set(sql, this.monitorStatement(stmt, sql));
      } else {
        this.stmtCache.set(sql, stmt);
      }
    }
    return this.stmtCache.get(sql);
  }

  monitorStatement(stmt, sql) {
    const proxy = new Proxy(stmt, {
      get(target, prop) {
        if (prop === 'get' || prop === 'all' || prop === 'run') {
          return function(...args) {
            const start = Date.now();
            const result = target[prop](...args);
            const duration = Date.now() - start;

            // Log slow queries
            if (duration > 100) {
              logger.warn('Slow query detected', {
                sql: sql.substring(0, 100),
                duration,
                args
              });
            }

            return result;
          };
        }
        return target[prop];
      }
    });

    return proxy;
  }
}
```

**Add database connection pooling:**
```javascript
// For when scaling beyond SQLite
// backend/db-pool.js (future PostgreSQL migration)

import { Pool } from 'pg';

export const pool = new Pool({
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Log pool stats
setInterval(() => {
  logger.debug('DB pool stats', {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount
  });
}, 60000);
```

**Tasks:**
- [ ] Add query performance monitoring
- [ ] Log slow queries
- [ ] Optimize slow queries
- [ ] Add explain plan analysis (dev mode)
- [ ] Document optimization strategy

**Time:** 2-3 hours

---

### 5.3 Caching Enhancements (1-2 hours)

**Add cache statistics:**
```javascript
// backend/utils/cache.js

class CacheWithStats {
  constructor(name, ttl) {
    this.name = name;
    this.ttl = ttl;
    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      evictions: 0
    };
  }

  get(key) {
    if (this.cache.has(key)) {
      const entry = this.cache.get(key);
      if (Date.now() < entry.expiresAt) {
        this.stats.hits++;
        return entry.value;
      } else {
        this.cache.delete(key);
        this.stats.evictions++;
      }
    }
    this.stats.misses++;
    return null;
  }

  set(key, value) {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.ttl
    });
    this.stats.sets++;
  }

  getStats() {
    const hitRate = this.stats.hits / (this.stats.hits + this.stats.misses);
    return {
      ...this.stats,
      hitRate: (hitRate * 100).toFixed(2) + '%',
      size: this.cache.size
    };
  }
}

// Expose stats endpoint
router.get('/cache/stats', (req, res) => {
  res.json({
    fileCache: fileCache.getStats(),
    dashboardCache: dashboardCache.getStats(),
    analyticsCache: analyticsCache.getStats()
  });
});
```

**Tasks:**
- [ ] Add cache statistics
- [ ] Add cache hit rate monitoring
- [ ] Expose cache stats endpoint
- [ ] Log cache performance
- [ ] Optimize cache TTLs

**Time:** 1-2 hours

---

## Implementation Timeline

### Week 1-2: Accessibility (30-45 hours)
```
Day 1-2:   ARIA attributes (critical components)
Day 3-4:   ARIA attributes (forms, navigation, tables)
Day 5-6:   Keyboard navigation + shortcuts
Day 7-8:   Color contrast audit + fixes
Day 9-10:  Screen reader support + testing
```

### Week 3: State Management + Error Handling (14-22 hours)
```
Day 11-12: Enhanced store architecture
Day 13:    Optimistic updates + debugging tools
Day 14-15: Custom error classes + handlers
```

### Week 4: API Design + Performance (14-22 hours)
```
Day 16-17: API versioning + pagination
Day 18:    API documentation enhancement
Day 19-20: Frontend performance optimizations
Day 21:    Database optimization + caching
```

### Week 5-6: Testing + Polish (10-15 hours)
```
Day 22-23: Accessibility testing (automated + manual)
Day 24:    Performance testing
Day 25:    Final integration testing
Day 26:    Documentation updates
```

---

## Success Metrics

### Accessibility (6.5 → 9.7+)
- [ ] 95%+ components with ARIA attributes
- [ ] WCAG 2.1 AA compliant (axe-core: 0 violations)
- [ ] Full keyboard navigation
- [ ] Screen reader tested (NVDA, VoiceOver)
- [ ] 4.5:1 color contrast minimum

### State Management (8.7 → 9.7+)
- [ ] Centralized store architecture
- [ ] State persistence implemented
- [ ] Optimistic updates working
- [ ] Dev tools functional
- [ ] 100% store test coverage

### Error Handling (9.0 → 9.7+)
- [ ] Custom error classes implemented
- [ ] Enhanced global error handler
- [ ] Frontend error boundaries
- [ ] Error tracking operational
- [ ] 100% error scenario coverage

### API Design (9.0 → 9.7+)
- [ ] API versioning live
- [ ] Cursor-based pagination
- [ ] Complete Swagger docs
- [ ] All endpoints documented
- [ ] Migration guide created

### Performance (9.3 → 9.7+)
- [ ] Virtual scrolling implemented
- [ ] Lazy loading active
- [ ] Query monitoring operational
- [ ] Cache hit rate > 80%
- [ ] Lighthouse score > 95

---

## Risk Management

### Potential Risks

1. **Accessibility breaking existing UI**
   - **Mitigation:** Incremental rollout, extensive testing
   - **Rollback:** Feature flags for new ARIA

2. **State management migration complexity**
   - **Mitigation:** Gradual migration, one component at a time
   - **Rollback:** Keep old patterns until migration complete

3. **API versioning backward compatibility**
   - **Mitigation:** Alias v1 to /api, maintain both
   - **Rollback:** Simple routing change

4. **Performance optimization breaking functionality**
   - **Mitigation:** Extensive testing, staged rollout
   - **Rollback:** Feature flags

---

## Final Checklist

### Pre-Implementation
- [ ] Review plan with team
- [ ] Set up feature flags
- [ ] Create development branch
- [ ] Prepare rollback strategy

### During Implementation
- [ ] Follow task order
- [ ] Write tests first (TDD where possible)
- [ ] Document as you go
- [ ] Review code daily

### Post-Implementation
- [ ] Run full test suite
- [ ] Run accessibility audit
- [ ] Run performance tests
- [ ] Update all documentation
- [ ] Create migration guide

---

## Estimated Costs

**Total Time:** 80-120 hours
**At $150/hour:** $12,000 - $18,000
**At $100/hour:** $8,000 - $12,000

**Timeline:**
- **Aggressive:** 4 weeks (30 hours/week)
- **Moderate:** 6 weeks (20 hours/week)
- **Conservative:** 8 weeks (15 hours/week)

---

## Expected Outcome

**Before:**
- Overall: 9.6/10
- Accessibility: 6.5/10 ⚠️
- State Management: 8.7/10
- Error Handling: 9.0/10
- API Design: 9.0/10
- Performance: 9.3/10

**After:**
- **Overall: 9.8/10** ✅
- **Accessibility: 9.7/10** ✅
- **State Management: 9.7/10** ✅
- **Error Handling: 9.7/10** ✅
- **API Design: 9.7/10** ✅
- **Performance: 9.7/10** ✅

---

## Let's Get Started! 🚀

This plan will transform Raven from an **exceptional codebase** to a **world-class, industry-leading platform**.

**Ready to begin implementation?**

Choose your preferred starting point:
1. **Accessibility First** (highest impact)
2. **Quick Wins** (State + Error Handling first)
3. **Full Sequential** (follow plan order)

---

**Plan Created:** October 27, 2025
**Target Completion:** December 2025 (6 weeks)
**Status:** 📋 **READY FOR IMPLEMENTATION**
