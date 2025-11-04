# RAVEN FRONTEND LOADING STATE AUDIT REPORT

**Date:** 2025-11-03  
**Scope:** /home/seth/Projects/raven/frontend/src/lib  
**Total Components Analyzed:** 74 .svelte files

---

## EXECUTIVE SUMMARY

The Raven frontend implements loading states across 40+ components with moderate consistency. The codebase demonstrates:

- **149 loading state references** across components
- **3 main spinner implementations** with slight variations
- **1 dedicated skeleton loader component** with proper accessibility
- **Multiple loading variable patterns** (loading, isLoading, loadingMore, fetching)
- **56 files with ARIA attributes** out of 74 components (76% coverage)
- **Inconsistent accessibility implementation** across components

**Key Concern:** While basic loading states exist, there's significant inconsistency in patterns, naming conventions, and accessibility attributes.

---

## 1. LOADING TEXT PATTERNS

### Standard Patterns Found

| Pattern                 | Count | Files                                                                            | Notes                        |
| ----------------------- | ----- | -------------------------------------------------------------------------------- | ---------------------------- |
| "Loading..."            | 15+   | ActivityLog, PatternWarningsPanel, AgentsPanel, TestResultsPanel, etc.           | Most common                  |
| "Fetching..."           | 0     | N/A                                                                              | Not used in current codebase |
| "Please wait"           | 0     | N/A                                                                              | Not used in current codebase |
| Loading with emoji (⏳) | 8+    | ConversationsPanel, DeveloperInsightsPanel, ProjectsComparisonPanel, StatusPanel | Button state indicator       |
| "Load More" buttons     | 8     | ActivityLog, PatternWarningsPanel, NotificationsPanel, etc.                      | Pagination loading           |

### Examples

**Text-only loading:**

```svelte
<!-- ActivityLog.svelte -->
{loading ? 'Loading...' : `Load More (${total - activities.length} remaining)`}

<!-- AboutPage.svelte -->
{typeof sessionId === 'string' ? sessionId.slice(0, 8) + '...' : 'Loading...'}
```

**Emoji indicators:**

```svelte
<!-- StatusPanel.svelte -->
<span aria-hidden="true">{#if loading}⏳{:else}🔄{/if}</span> Refresh

<!-- ConversationsPanel.svelte -->
{#if loading}⏳{:else}🔄{/if} Refresh
```

---

## 2. SPINNER IMPLEMENTATIONS

### CSS-Based Spinners

#### Type 1: Large Border Spinner (40px)

**Used in:** 8+ components (PatternWarningsPanel, SyntaxErrorPanel, etc.)

```css
.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
```

**Files:**

- /home/seth/Projects/raven/frontend/src/lib/PatternWarningsPanel.svelte (line 1148-1159)
- /home/seth/Projects/raven/frontend/src/lib/SyntaxErrorPanel.svelte (line 805-816)
- /home/seth/Projects/raven/frontend/src/lib/ChangelogPage.svelte (line 279-288)
- /home/seth/Projects/raven/frontend/src/lib/DocsViewer.svelte (line 383-392)
- /home/seth/Projects/raven/frontend/src/lib/HealthWidget.svelte (line 438-448)
- /home/seth/Projects/raven/frontend/src/lib/SessionDashboard.svelte (line 403-413)
- /home/seth/Projects/raven/frontend/src/lib/SessionRollbackPanel.svelte (line 675-684)
- /home/seth/Projects/raven/frontend/src/lib/SimilarChangesPanel.svelte (line 258-268)
- /home/seth/Projects/raven/frontend/src/lib/TestResultsPanel.svelte (line 769-778)

#### Type 2: Small Inline Spinner (14px)

**Used in:** 5+ components (AgentsPanel, TestResultsPanel, etc.)

```css
.spinner-small {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
```

**Files:**

- /home/seth/Projects/raven/frontend/src/lib/AgentsPanel.svelte (line 1915-1922)
- /home/seth/Projects/raven/frontend/src/lib/PatternWarningsPanel.svelte (line 1404)
- /home/seth/Projects/raven/frontend/src/lib/SyntaxErrorPanel.svelte (line 1052)
- /home/seth/Projects/raven/frontend/src/lib/TestResultsPanel.svelte (line 1085)

#### Type 3: Refresh/Rotation Spinner

**Used in:** 4 components (StatusPanel, ServerSyncPanel, StoragePanel)

```css
.refresh-icon.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
```

**Files:**

- /home/seth/Projects/raven/frontend/src/lib/StatusPanel.svelte (line 656-663)
- /home/seth/Projects/raven/frontend/src/lib/ServerSyncPanel.svelte (line 727)
- /home/seth/Projects/raven/frontend/src/lib/StoragePanel.svelte (line 844)

---

## 3. SKELETON LOADERS

### Dedicated Component

**File:** /home/seth/Projects/raven/frontend/src/lib/LoadingSkeleton.svelte

**Implementation:** Single component with multiple variants

```svelte
<div role="status" aria-live="polite" aria-busy="true" aria-label="Loading content">
  {#if type === 'text'}
    {#each Array(count) as _, i (i)}
      <div class="skeleton skeleton-text" ...></div>
    {/each}
  {:else if type === 'card'}
    {#each Array(count) as _, i (i)}
      <div class="skeleton skeleton-card" aria-hidden="true">...</div>
    {/each}
  {:else if type === 'list'}
    <div class="skeleton skeleton-list" aria-hidden="true">...</div>
  {:else if type === 'chart'}
    <div class="skeleton skeleton-chart" ...></div>
  {/if}
</div>
```

**CSS Animation:**

```css
.skeleton {
  background: linear-gradient(90deg, var(--surface) 0%, var(--surface-2) 50%, var(--surface) 100%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}

@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}
```

**Variants Supported:**

- `type="text"` - Line loading placeholders
- `type="card"` - Card layout skeleton
- `type="list"` - List item skeleton
- `type="chart"` - Chart area skeleton

**Components Using LoadingSkeleton:** 12+

- OverviewPanel.svelte
- PatternWarningsPanel.svelte
- TestResultsPanel.svelte
- FileHistory.svelte
- PerformancePanel.svelte
- HealthWidget.svelte
- ActivityLog.svelte
- And more...

**Accessibility Features:**

- ✓ role="status"
- ✓ aria-live="polite"
- ✓ aria-busy="true"
- ✓ aria-label="Loading content"
- ✓ aria-hidden="true" on skeleton elements

---

## 4. LOADING STATE VARIABLES

### Common Variable Names

| Variable Name          | Count | Usage Pattern                              |
| ---------------------- | ----- | ------------------------------------------ |
| `loading`              | 35+   | Boolean flag, most common                  |
| `isLoading`            | 5+    | CamelCase variant                          |
| `loadingMore`          | 8     | Pagination loading                         |
| `loading + state flag` | 12+   | Multiple states (loading, saving, sending) |
| `fetching`             | 3     | Rare alternative                           |

### State Management Patterns

**Pattern 1: Simple Boolean**

```javascript
// AgentsPanel.svelte
let loading = true;
let loadingMore = false;

async function fetchAgents() {
  loading = true;
  try {
    const data = await fetch('/api/agents');
    agents = await data.json();
  } finally {
    loading = false;
  }
}
```

**Pattern 2: Multiple Loading States**

```javascript
// TestResultsPanel.svelte
let loading = true;
let running = false;
let loadingMore = false;
let testsLoading = false;

// Different states for different operations
```

**Pattern 3: Manual Refresh Tracking**

```javascript
// OverviewPanel.svelte
let loading = true;
let isManualRefresh = false;

async function loadAllData(manual = false) {
  if (manual || loading) {
    loading = true;
  }
  isManualRefresh = manual;
  // ...
}
```

---

## 5. EMPTY STATE vs LOADING STATE DIFFERENTIATION

### Good Examples

**Pattern 1: Clear Conditional Structure**

```svelte
<!-- SyntaxErrorPanel.svelte -->
{#if loading}
  <div class="loading-state">
    <div class="spinner" aria-hidden="true"></div>
    <p>Loading syntax errors...</p>
  </div>
{:else if errors.length === 0}
  <div class="empty-state">
    <div class="empty-icon">✓</div>
    <h3>No Syntax Errors</h3>
    <p>Your code is clean!</p>
  </div>
{:else}
  <div class="errors-list">
    <!-- Error content -->
  </div>
{/if}
```

**Pattern 2: No Data Message vs Loading**

```svelte
<!-- StatusPanel.svelte -->
{#if loading}
  <LoadingSkeleton type="card" />
{:else if !status}
  <div class="error-message">Status unavailable</div>
{:else}
  <!-- Display status -->
{/if}
```

### Issues Found

**Inconsistent Empty State Messaging:**

- Some components show generic "No data" messages
- Others distinguish between "loading" and "no results"
- Some fail to handle error states properly

---

## 6. ACCESSIBILITY AUDIT

### ARIA Implementation Status

**Files with proper ARIA attributes:** 56 out of 74 (76%)

**Components with accessibility issues:** 18 (24%)

### Well-Implemented Examples

#### LoadingSkeleton.svelte

```svelte
<div role="status" aria-live="polite" aria-busy="true" aria-label="Loading content">
```

**Attributes:**

- ✓ role="status" - Identifies as status message
- ✓ aria-live="polite" - Announces updates
- ✓ aria-busy="true" - Indicates loading
- ✓ aria-label - Descriptive label
- ✓ aria-hidden="true" - Hides decorative elements

#### AppLoadingScreen.svelte

```svelte
<div class="loading-screen" role="alert" aria-live="polite" aria-busy="true">
  <div class="loading-message" role="status">
    {message}<span class="dots" aria-hidden="true">{dots}</span>
  </div>
  <div class="progress-container" role="progressbar" aria-valuenow={progress}
       aria-valuemin="0" aria-valuemax="100" aria-label="Loading progress">
    <div class="progress-bar" style="width: {progress}%"></div>
  </div>
</div>
```

**Attributes:**

- ✓ role="alert" - High-priority status
- ✓ role="status" - Loading message
- ✓ role="progressbar" - Progress indicator
- ✓ aria-valuenow/min/max - Progress values
- ✓ aria-hidden="true" - Decorative dots

### Accessibility Issues Found

**Issue 1: Missing ARIA on Spinners** (10+ components)

```svelte
<!-- BAD: No accessibility context -->
<div class="spinner" aria-hidden="true"></div>

<!-- GOOD: Include context -->
<div class="spinner" aria-hidden="true"></div>
<p role="status" aria-live="polite">Loading...</p>
```

**Issue 2: Missing role="status"** (8 components)

```javascript
// ActivityLog.svelte line 290
<div class="sidebar-loading">Loading...</div>
<!-- Missing: role="status" aria-live="polite" -->
```

**Issue 3: Inconsistent aria-live** (12+ components)
Some use `aria-live="polite"`, others use `aria-live="assertive"`, some omit entirely.

**Issue 4: No aria-label on icon-only spinners** (5+ components)

```svelte
<!-- PatternWarningsPanel.svelte -->
<span class="spinner-small"></span> Loading...
<!-- The span itself should have aria-label or parent context -->
```

**Issue 5: Missing aria-busy** (20+ components)
Components with loading state should set `aria-busy="true"`.

---

## 7. IMPLEMENTATION PATTERNS SUMMARY

### Pattern Distribution

```
Loading State Type                  Count    %
─────────────────────────────────────────────
{#if loading} conditional blocks    40+     54%
Skeleton loader component           12      16%
Spinner (CSS-based)                 9       12%
Manual refresh handling             8       11%
Pagination (loadingMore)            8       11%
Combined spinner + text             6       8%
Progress bar/indicator              3       4%
```

### Loading Variable Distribution

```
Variable Name                       Count
─────────────────────────────────────
loading                             35+
loadingMore                         8
isLoading                           5
running/executing                   4
fetching                            3
testsLoading                        2
metricsLoading                      2
startupHealthStatus                 1
restartingBridge                    1
```

---

## 8. SPECIFIC FILE ANALYSIS

### High-Implementation Components (3+ loading states)

| File                            | Loading Variables                           | Patterns                                             | Notes                           |
| ------------------------------- | ------------------------------------------- | ---------------------------------------------------- | ------------------------------- |
| **StatusPanel.svelte**          | loading, isManualRefresh                    | 10+ {#if loading} blocks, Spinner, Refresh animation | Comprehensive status monitoring |
| **PatternWarningsPanel.svelte** | loading, loadingMore                        | Spinner, LoadingSkeleton, Charts                     | Pattern warnings display        |
| **OverviewPanel.svelte**        | loading, metricsLoading                     | LoadingSkeleton, Manual refresh tracking             | Dashboard overview              |
| **ActivityLog.svelte**          | loading, loadingMore, expanded              | LoadingSkeleton, Sidebar loading, Charts             | Activity visualization          |
| **TestResultsPanel.svelte**     | loading, running, loadingMore, testsLoading | Spinner-small, LoadingSkeleton, Progress             | Test execution                  |
| **AgentsPanel.svelte**          | loading, sending                            | Spinner-small, Complex form handling                 | Agent management                |

### Moderate-Implementation Components (1-2 loading states)

- HealthWidget.svelte (loading, startup health)
- HealthStatus.svelte (loading)
- FileHistory.svelte (loading)
- DocsViewer.svelte (loading, spinner)
- ChangelogPage.svelte (loading, spinner)
- And 25+ others...

### Minimal-Implementation Components (No loading state)

- RavenLogo.svelte
- ProjectBadge.svelte
- ProjectSelector (search only, no explicit loading)
- And 20+ others...

---

## 9. INCONSISTENCIES & ISSUES

### Critical Issues

1. **No Spinner Loader Component** (35+ instances)
   - Each component implements its own spinner CSS
   - Duplicated @keyframes definitions across 9+ files
   - Inconsistent animation timing (0.6s vs 1s)
   - No centralized spinner component

2. **Accessibility Gaps** (18 components)
   - Missing role="status" on loading messages
   - Inconsistent aria-live usage
   - No aria-busy attributes in most components
   - Spinners missing proper context

3. **Loading Variable Naming Inconsistency** (8+ variants)
   - loading vs isLoading
   - No consistent pattern across codebase
   - Confusing for new developers

### Moderate Issues

4. **Duplicate Skeleton Loader Patterns**
   - LoadingSkeleton exists but only used in 12 components
   - 28+ components don't use skeleton loading
   - Instead implement custom loading UI

5. **No Loading Context Component**
   - Loading states implemented inline everywhere
   - No reusable pattern for "loading + error + success"
   - Code duplication across components

6. **Inconsistent Empty State Handling**
   - Some components distinguish loading vs empty
   - Others don't handle empty state at all
   - No unified pattern

### Minor Issues

7. **Text Localization**
   - All loading text hardcoded ("Loading...")
   - No i18n support
   - Inconsistent phrasing ("Loading", "Loading...", etc.)

8. **Animation Performance**
   - All spinners use `linear infinite`
   - Multiple simultaneous animations on page
   - Potential CPU usage concern

---

## 10. RECOMMENDATIONS FOR STANDARDIZATION

### Priority 1: Create Reusable Components (CRITICAL)

**1. Universal Spinner Component**

```svelte
<!-- LoadingSpinner.svelte -->
<script>
  export let size = 'md'; // 'sm', 'md', 'lg'
  export let ariaLabel = 'Loading';
  export let hideLabel = false;
</script>

<div class="spinner" class:spinner-{size} role="status" aria-live="polite" aria-busy="true" aria-label={ariaLabel}>
  {#if !hideLabel}
    <span class="spinner-label">{ariaLabel}</span>
  {/if}
</div>

<style>
  .spinner {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  .spinner::before {
    content: '';
    width: var(--size, 40px);
    height: var(--size, 40px);
    border: 3px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  .spinner-sm::before { --size: 14px; border-width: 2px; }
  .spinner-md::before { --size: 40px; border-width: 3px; }
  .spinner-lg::before { --size: 60px; border-width: 4px; }

  .spinner-label {
    font-size: var(--text-sm);
    color: var(--text);
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
```

**2. Loading Container Component**

```svelte
<!-- LoadingContainer.svelte -->
<script>
  export let loading = false;
  export let error = null;
  export let isEmpty = false;
  export let emptyMessage = 'No data available';
</script>

{#if loading}
  <div class="loading-container" role="status">
    <LoadingSpinner />
  </div>
{:else if error}
  <div class="error-container" role="alert">
    <span aria-label="Error">❌</span>
    {error}
  </div>
{:else if isEmpty}
  <div class="empty-container">
    <span aria-label="Empty">∅</span>
    <p>{emptyMessage}</p>
  </div>
{:else}
  <slot />
{/if}
```

**3. Standardize Skeleton Loader**

```javascript
// Consolidate LoadingSkeleton variations
// Create type variants: text, card, list, chart, custom
// Export as utility for easy use
```

### Priority 2: Standardize Variable Naming (HIGH)

**Adopt consistent naming convention:**

```javascript
// STANDARD PATTERN:
let isLoading = false; // Main loading state
let isLoadingMore = false; // Pagination loading
let isSending = false; // Form submission
let isRefreshing = false; // Manual refresh
let isSaving = false; // Data persistence
let isExecuting = false; // Long-running operation

// Benefits:
// - Consistent camelCase prefix "is"
// - Immediately recognizable as boolean
// - Easier to grep/refactor
// - Clear semantic meaning
```

### Priority 3: Establish Accessibility Standards (HIGH)

**Create loading state template:**

```svelte
<!-- Standard loading state template -->
{#if isLoading}
  <div class="loading-state" role="status" aria-live="polite" aria-busy="true">
    <LoadingSpinner size="md" ariaLabel="Loading data" />
  </div>
{:else if error}
  <div class="error-state" role="alert">
    <span aria-hidden="true">⚠️</span>
    <p>{error}</p>
  </div>
{:else if data.length === 0}
  <div class="empty-state">
    <span aria-hidden="true">∅</span>
    <p>No data available</p>
  </div>
{:else}
  <!-- Actual content -->
{/if}
```

**ARIA Compliance Checklist:**

- [ ] All loading states have role="status"
- [ ] Use aria-live="polite" for status updates
- [ ] Set aria-busy="true" during loading
- [ ] Include aria-label describing what's loading
- [ ] Use aria-hidden="true" on decorative elements
- [ ] Error states use role="alert"
- [ ] Progress indicators use role="progressbar" with aria-valuenow

### Priority 4: Create Loading Utilities (MEDIUM)

**Loading state manager store:**

```javascript
// loadingStateStore.js
import { writable } from 'svelte/store';

export function createLoadingManager() {
  const { subscribe, set, update } = writable({
    isLoading: false,
    isLoadingMore: false,
    error: null,
    message: 'Loading...'
  });

  return {
    subscribe,
    startLoading: (message = 'Loading...') =>
      update(state => ({ ...state, isLoading: true, message, error: null })),
    finishLoading: () => update(state => ({ ...state, isLoading: false })),
    setError: error => update(state => ({ ...state, isLoading: false, error }))
    // ... more methods
  };
}
```

**Composable loading hook:**

```javascript
// useLoading.js
export function useLoading() {
  let isLoading = false;
  let error = null;

  async function execute(fn) {
    isLoading = true;
    error = null;
    try {
      return await fn();
    } catch (err) {
      error = err;
      throw err;
    } finally {
      isLoading = false;
    }
  }

  return { isLoading: () => isLoading, error: () => error, execute };
}
```

### Priority 5: CSS Consolidation (MEDIUM)

**Create global loading styles file:**

```css
/* styles/loading.css */

/* Standard spinner animation */
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

/* Spinner classes */
.spinner {
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.spinner-sm {
  width: 14px;
  height: 14px;
  border-width: 2px;
}
.spinner-md {
  width: 40px;
  height: 40px;
  border-width: 3px;
}
.spinner-lg {
  width: 60px;
  height: 60px;
  border-width: 4px;
}

/* Skeleton animation */
.skeleton {
  background: linear-gradient(90deg, var(--surface) 0%, var(--surface-2) 50%, var(--surface) 100%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}
```

---

## 11. MIGRATION PATH

### Phase 1: Component Creation (Week 1)

1. Create LoadingSpinner.svelte
2. Create LoadingContainer.svelte
3. Create loading utilities/hooks
4. Update LoadingSkeleton.svelte

### Phase 2: High-Impact Components (Week 2-3)

1. StatusPanel.svelte (10+ loading states)
2. PatternWarningsPanel.svelte (complex loading)
3. OverviewPanel.svelte (dashboard)
4. ActivityLog.svelte (pagination)
5. TestResultsPanel.svelte (progressive UI)

### Phase 3: Mid-Impact Components (Week 4)

1. Refactor 15-20 components with 1-2 loading states
2. Standardize variable names
3. Update ARIA attributes

### Phase 4: Polish & Testing (Week 5)

1. Refactor remaining components
2. Accessibility testing
3. Performance audit
4. Documentation

---

## 12. CODE QUALITY METRICS

### Current State

- Loading implementation files: 40/74 components (54%)
- Accessibility compliance: 56/74 files (76%)
- Spinner duplication: 9 independent implementations
- Variable naming consistency: 60% (mixed loading/isLoading)

### Target State (Post-Standardization)

- Loading component usage: 95%+ of components
- Accessibility compliance: 100%
- Spinner duplication: 1 centralized component
- Variable naming consistency: 99%

---

## 13. APPENDIX: COMPLETE FILE LISTING

### Files with Multiple Loading States (3+)

1. /home/seth/Projects/raven/frontend/src/lib/StatusPanel.svelte
2. /home/seth/Projects/raven/frontend/src/lib/PatternWarningsPanel.svelte
3. /home/seth/Projects/raven/frontend/src/lib/TestResultsPanel.svelte
4. /home/seth/Projects/raven/frontend/src/lib/OverviewPanel.svelte
5. /home/seth/Projects/raven/frontend/src/lib/ActivityLog.svelte

### Files with Spinner Implementation

1. /home/seth/Projects/raven/frontend/src/lib/PatternWarningsPanel.svelte (line 1148)
2. /home/seth/Projects/raven/frontend/src/lib/SyntaxErrorPanel.svelte (line 805)
3. /home/seth/Projects/raven/frontend/src/lib/ChangelogPage.svelte (line 279)
4. /home/seth/Projects/raven/frontend/src/lib/DocsViewer.svelte (line 383)
5. /home/seth/Projects/raven/frontend/src/lib/HealthWidget.svelte (line 438)
6. /home/seth/Projects/raven/frontend/src/lib/SessionDashboard.svelte (line 403)
7. /home/seth/Projects/raven/frontend/src/lib/SessionRollbackPanel.svelte (line 675)
8. /home/seth/Projects/raven/frontend/src/lib/SimilarChangesPanel.svelte (line 258)
9. /home/seth/Projects/raven/frontend/src/lib/TestResultsPanel.svelte (line 769)

### Files with LoadingSkeleton Usage

1. OverviewPanel.svelte
2. PatternWarningsPanel.svelte
3. TestResultsPanel.svelte
4. FileHistory.svelte
5. PerformancePanel.svelte
6. HealthWidget.svelte
7. ActivityLog.svelte
8. ServerSyncPanel.svelte
9. AgentsPanel.svelte
10. (7 more...)

---

## CONCLUSION

The Raven frontend has functional loading state implementations but lacks standardization. The primary opportunity is to create a unified, accessible loading state system that:

1. Reduces code duplication (especially spinners)
2. Improves accessibility compliance (100% ARIA coverage)
3. Standardizes variable naming across codebase
4. Provides a consistent user experience
5. Makes maintenance easier for future developers

Estimated effort to standardize: 2-3 weeks with phased approach.
