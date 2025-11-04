# Raven Frontend Loading State - Quick Reference Guide

## File Locations

### Key Files with Loading State Implementations

**High-Impact Components (3+ loading states)**
| Component | Location | Loading Vars | Issues |
|-----------|----------|--------------|--------|
| StatusPanel | src/lib/StatusPanel.svelte | loading, isManualRefresh | 10+ loading blocks, spinner duplication |
| PatternWarningsPanel | src/lib/PatternWarningsPanel.svelte | loading, loadingMore | Spinner CSS duplication, ARIA gaps |
| OverviewPanel | src/lib/OverviewPanel.svelte | loading, metricsLoading | LoadingSkeleton usage |
| ActivityLog | src/lib/ActivityLog.svelte | loading, loadingMore | Charts, sidebar loading |
| TestResultsPanel | src/lib/TestResultsPanel.svelte | loading, running, loadingMore | Multiple state machines |

**Spinner Implementations (9 files with CSS duplication)**
| Component | Location | Lines | Animation |
|-----------|----------|-------|-----------|
| PatternWarningsPanel | src/lib/PatternWarningsPanel.svelte | 1148-1159 | 1s linear |
| SyntaxErrorPanel | src/lib/SyntaxErrorPanel.svelte | 805-816 | 1s linear |
| ChangelogPage | src/lib/ChangelogPage.svelte | 279-288 | 1s linear |
| DocsViewer | src/lib/DocsViewer.svelte | 383-392 | 1s linear |
| HealthWidget | src/lib/HealthWidget.svelte | 438-448 | 1s linear |
| SessionDashboard | src/lib/SessionDashboard.svelte | 403-413 | 1s linear |
| SessionRollbackPanel | src/lib/SessionRollbackPanel.svelte | 675-684 | 1s linear |
| SimilarChangesPanel | src/lib/SimilarChangesPanel.svelte | 258-268 | 1s linear |
| TestResultsPanel | src/lib/TestResultsPanel.svelte | 769-778 | 1s linear |

**Skeleton Loader Usage (12 components)**

- OverviewPanel.svelte
- PatternWarningsPanel.svelte
- TestResultsPanel.svelte
- FileHistory.svelte
- PerformancePanel.svelte
- HealthWidget.svelte
- ActivityLog.svelte
- ServerSyncPanel.svelte
- AgentsPanel.svelte
- LiveFeed.svelte
- MultiProjectHealthPanel.svelte
- AnomalyAlertsPanel.svelte

---

## Current Patterns in Use

### Pattern 1: Simple Boolean Loading

```javascript
// Most common (35+ components)
let loading = true;
async function fetch() {
  loading = true;
  try {
    /* fetch */
  } finally {
    loading = false;
  }
}
```

**Used in:** ActivityLog, PatternWarningsPanel, TestResultsPanel, etc.

### Pattern 2: isLoading Variant

```javascript
// Less common (5 components)
let isLoading = true;
```

**Used in:** ProjectSelector, and others

### Pattern 3: Multiple Loading States

```javascript
// 12+ components with multiple flags
let loading = true;
let loadingMore = false;
let running = false;
```

**Used in:** TestResultsPanel, AgentsPanel, etc.

### Pattern 4: Manual Refresh Tracking

```javascript
// Dashboard-style components (8)
let loading = true;
let isManualRefresh = false;

async function loadAllData(manual = false) {
  if (manual || loading) loading = true;
  isManualRefresh = manual;
}
```

**Used in:** OverviewPanel, StatusPanel, etc.

---

## Spinner CSS Specifications

### Type 1: Large Border Spinner (40px)

Used in: 8 components

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

### Type 2: Small Inline Spinner (14px)

Used in: 5 components

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

### Type 3: Refresh/Rotation Animation

Used in: 4 components

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

---

## LoadingSkeleton Component

**Location:** src/lib/LoadingSkeleton.svelte

### Variants Available

```svelte
<!-- Text loading -->
<LoadingSkeleton type="text" count={3} height="16px" />

<!-- Card layout -->
<LoadingSkeleton type="card" count={2} />

<!-- List items -->
<LoadingSkeleton type="list" count={5} />

<!-- Chart area -->
<LoadingSkeleton type="chart" height="200px" />
```

### Accessibility Features

- role="status"
- aria-live="polite"
- aria-busy="true"
- aria-label="Loading content"
- aria-hidden="true" on skeleton elements

---

## Accessibility Status

### Files with ARIA Attributes (56/74 - 76%)

**Good:** LoadingSkeleton, AppLoadingScreen, and 54 others

### Files Needing ARIA Updates (18/74 - 24%)

**Issue:** Missing role="status", aria-live, or aria-busy

**Components to fix:**

1. ActivityLog.svelte - Missing ARIA on sidebar loading
2. HealthStatus.svelte - Loading state not accessible
3. FileHistory.svelte - Multiple states without context
4. And 15 more...

---

## Variable Naming Conventions

### Current Usage

| Variable Name | Count | Status                        |
| ------------- | ----- | ----------------------------- |
| loading       | 35+   | DOMINANT (should standardize) |
| isLoading     | 5+    | PREFERRED BUT INCONSISTENT    |
| loadingMore   | 8     | PAGINATION SPECIFIC           |
| fetching      | 3     | RARELY USED                   |
| isFetching    | 0     | NOT USED                      |
| isSending     | 0     | NOT USED                      |
| running       | 4     | SPECIFIC USE CASES            |

### Recommended Standards

```javascript
let isLoading = false; // Main loading state (STANDARD)
let isLoadingMore = false; // Pagination (STANDARD)
let isSending = false; // Form submission (RECOMMENDED)
let isRefreshing = false; // Manual refresh (RECOMMENDED)
let isSaving = false; // Data persistence (RECOMMENDED)
let isExecuting = false; // Long-running operation (RECOMMENDED)
```

---

## Loading Text Patterns

### Common Text

| Text          | Count | Files             | Status     |
| ------------- | ----- | ----------------- | ---------- |
| "Loading..."  | 15+   | Most components   | STANDARD   |
| "Fetching..." | 0     | N/A               | NOT USED   |
| "Please wait" | 0     | N/A               | NOT USED   |
| Emoji (⏳)    | 8     | Button indicators | DECORATIVE |
| "Load More"   | 8     | Pagination        | PAGINATION |

### Current Examples

```svelte
<!-- Text only -->
Loading...

<!-- With emoji -->
{#if loading}⏳{:else}🔄{/if} Refresh

<!-- Load more button -->
{loading ? 'Loading...' : `Load More (${remaining} items)`}
```

---

## Accessibility ARIA Attributes

### Recommended for Loading States

```svelte
<!-- Complete example -->
<div class="loading-state"
     role="status"
     aria-live="polite"
     aria-busy="true"
     aria-label="Loading user data">
  <div class="spinner" aria-hidden="true"></div>
  <p>Loading...</p>
</div>
```

### Attribute Meanings

| Attribute   | Value         | Purpose                             |
| ----------- | ------------- | ----------------------------------- |
| role        | "status"      | Identifies as status message        |
| role        | "alert"       | High-priority status (errors)       |
| role        | "progressbar" | Progress indicator                  |
| aria-live   | "polite"      | Announce updates when convenient    |
| aria-busy   | "true"        | Indicates loading in progress       |
| aria-label  | "Loading..."  | Descriptive text for screen readers |
| aria-hidden | "true"        | Hide decorative elements            |

---

## Empty State vs Loading State

### How to Differentiate

**Good Example:**

```svelte
{#if loading}
  <LoadingSkeleton type="card" />
{:else if errors.length === 0}
  <EmptyState message="No errors found" />
{:else}
  <ErrorsList items={errors} />
{/if}
```

**Missing Empty State (BAD):**

```svelte
{#if loading}
  <LoadingSkeleton type="card" />
{:else}
  <ErrorsList items={errors} /> <!-- What if empty? -->
{/if}
```

### Empty State Message Examples

- "No data available"
- "No results found"
- "No items to display"
- "No errors detected" (positive message)

---

## Standardization Checklist

### For Existing Components

- [ ] Replace `let loading = ` with `let isLoading = `
- [ ] Replace `{#if loading}` with `{#if isLoading}`
- [ ] Add `role="status"` to loading container
- [ ] Add `aria-live="polite"`
- [ ] Add `aria-busy="true"`
- [ ] Add `aria-label="Loading..."`
- [ ] Consider using LoadingSkeleton instead of spinner
- [ ] Ensure empty state handling

### For New Components

- [ ] Use `isLoading` variable name
- [ ] Use `<LoadingSkeleton>` or `<LoadingSpinner>`
- [ ] Include ARIA attributes from day one
- [ ] Handle error state separately
- [ ] Handle empty state separately

---

## Performance Considerations

### Animation Performance

- All spinners use `linear infinite`
- Multiple spinners on same page = higher CPU usage
- Consider reducing animation FPS for low-end devices

### Skeleton Performance

- Shimmer animation: `1.5s ease-in-out`
- Staggered animation delays on list items (0s to 0.4s)
- Good for perceived performance

---

## Code Duplication Analysis

### Duplicate Definitions (9 files)

- `.spinner` CSS: 9 copies
- `@keyframes spin`: 10+ definitions
- Same animation, slightly different dimensions
- Estimated: 100+ lines of duplicate code

### Benefit of Consolidation

- Reduce bundle size
- Single source of truth
- Easier maintenance
- Consistent behavior

---

## Recommended Action Items

### Week 1: Component Creation

- [ ] Create LoadingSpinner.svelte (3 sizes)
- [ ] Create LoadingContainer.svelte
- [ ] Create loading utilities/hooks
- [ ] Update LoadingSkeleton.svelte

### Week 2-3: High-Impact Components

- [ ] StatusPanel.svelte
- [ ] PatternWarningsPanel.svelte
- [ ] OverviewPanel.svelte
- [ ] ActivityLog.svelte
- [ ] TestResultsPanel.svelte

### Week 4: Mid-Impact Components

- [ ] 15-20 components with 1-2 loading states
- [ ] Standardize all variable names
- [ ] Add missing ARIA attributes

### Week 5: Polish

- [ ] Create global loading CSS
- [ ] Documentation
- [ ] Accessibility audit
- [ ] Performance testing

---

## Resources

### Related Files

- src/lib/LoadingSkeleton.svelte - Good example of accessibility
- src/lib/AppLoadingScreen.svelte - Good progress bar example
- src/app.css - Theme system for CSS variables

### Accessibility References

- MDN: aria-busy
- MDN: role="status"
- MDN: aria-live
- ARIA Authoring Practices Guide

---

## Contact & Questions

For questions about specific components or recommendations, refer to:

1. LOADING_STATE_AUDIT.md (detailed analysis)
2. LOADING_STATE_AUDIT_SUMMARY.txt (executive summary)
3. This reference guide (quick lookup)
