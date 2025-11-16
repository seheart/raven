# Raven Technical Debt Tracker

**Last Updated:** 2025-11-16
**Version:** Corvus v2.0.1
**Branch:** feature/tailwind-frontend

## Overview

This document tracks technical debt, deferred improvements, and known issues for the Raven project. Items are prioritized as P1 (High), P2 (Medium), and P3 (Low).

---

## ✅ P1 (High Priority) - COMPLETED

All P1 items from the code audit have been completed:

### 1. Complete TODO Items ✅
**Status:** COMPLETED (Commit: 6977f5e)
- Frontend: Implemented logout logic (localStorage.clear + reload)
- Frontend: Implemented session click handler (navigate to /system)
- Backend: Refactored AgentBehaviorProfiler to accept projectName parameter
- Backend: Removed hardcoded 'raven' project name

### 2. Verify Tier 4 API Implementations ✅
**Status:** COMPLETED - See API_STATUS.md
- All 11 Tier 4 API categories fully implemented
- No stub implementations found
- Production-ready with database persistence
- Proper validation and error handling

### 3. PlaceholderPage Component Status ✅
**Status:** REVIEWED - KEEP (Required)
**Decision:** PlaceholderPage must be retained. It serves two critical functions:
1. **Error Fallback:** Used in `{#await...catch}` blocks for dynamically imported Activity pages
2. **Unknown Route Handler:** Displays "This page is coming soon" for unimplemented sub-routes

**Current Usage Locations:**
- Overview section: Fallback for unknown sub-tabs (line 272)
- Safety section: Fallback for unknown sub-tabs (line 288)
- Agents section: Fallback for unknown sub-tabs (line 302)
- Activity section:
  - Import error fallbacks for 7 dynamic imports (lines 309-351)
  - Unknown sub-tab fallback (line 354)
- Analysis section: Fallback for unknown sub-tabs (line 372)
- System section: Fallback for unknown sub-tabs (line 398)

**Recommendation:** Keep component. Remove only when ALL sub-routes are implemented and dynamic imports are replaced with static imports.

---

## P2 (Medium Priority)

### 1. Pre-commit Hook Warnings
**Estimated Time:** 4-6 hours
**Priority:** Medium
**Category:** Code Quality

**Issue:** svelte-check reports 24 errors and 86 warnings across 29 files during pre-commit.

**Most Common Issues:**
- Unused CSS selectors (e.g., `.today-stats`, `.stats-grid`, `.loading`, `.spinner`)
- Unused export properties in components
- Accessibility warnings:
  - Elements with `dialog` role missing tabindex
  - Non-interactive elements with event listeners
  - Form labels not associated with controls

**Action Items:**
1. Fix accessibility issues (highest priority within P2)
2. Remove or comment out unused CSS selectors
3. Convert unused export properties to `export const` if needed for external reference
4. Add proper tabindex to dialog elements
5. Update form labels to use proper `for` attributes

**Files Affected:**
- HealthWidget.svelte
- OverviewPanel.svelte
- SyntaxErrorPanel.svelte
- SessionRollbackPanel.svelte
- PageInfo.svelte
- And 24 others

### 2. Component Splitting (Large Files)
**Estimated Time:** 8-12 hours
**Priority:** Medium
**Category:** Maintainability

**Candidates for Splitting:**

#### NewApp.svelte (451 lines)
- Extract routing logic into separate router module
- Create dedicated route components for each section
- Move theme management to composable/hook

#### SystemTier4Page.svelte (Likely large, check LOC)
- Split integration tabs into separate components
- Extract health score display
- Create reusable integration form component

#### AgentsPage.svelte (Likely large, check LOC)
- Split agent cards into separate component
- Extract agent timeline visualization
- Create agent stats widget component

**Guidelines:**
- Keep components under 300 lines when possible
- Extract reusable UI patterns into lib/components/ui
- Use Svelte 5 runes ($state, $derived, $props) consistently
- Maintain proper TypeScript/JSDoc annotations

### 3. Centralize API Error Handling
**Estimated Time:** 3-4 hours
**Priority:** Medium
**Category:** Error Handling

**Issue:** Error handling patterns are inconsistent across components.

**Action Items:**
1. Create standardized error handling utility
2. Implement toast/notification system for API errors
3. Add retry logic for transient failures
4. Create error boundary components for graceful degradation

**Example Pattern:**
```javascript
// lib/utils/apiErrorHandler.js
export function handleApiError(error, context) {
  logger.error(`API Error in ${context}:`, error);
  // Show user-friendly notification
  // Optionally retry
  // Track error for monitoring
}
```

### 4. Testing Infrastructure
**Estimated Time:** 16-20 hours
**Priority:** Medium
**Category:** Quality Assurance

**Missing Tests:**
- Frontend component tests (Vitest + Testing Library)
- API integration tests for Tier 4 endpoints
- E2E tests for critical user flows

**Action Items:**
1. Set up Vitest for frontend testing
2. Create test utilities and fixtures
3. Write tests for critical components:
   - NewApp.svelte (routing)
   - Header.svelte (navigation)
   - PlaceholderPage.svelte (error states)
4. Add API integration tests using supertest
5. Create E2E test suite with Playwright

### 5. Performance Optimization
**Estimated Time:** 6-8 hours
**Priority:** Medium
**Category:** Performance

**Opportunities:**
1. **Code Splitting:** Activity pages are already lazily loaded, extend to other sections
2. **Memoization:** Add `$derived` for expensive computations in components
3. **Virtual Scrolling:** Implement for large lists (events, agents, files)
4. **Database Indexes:** Review query patterns and add indexes (see add-database-indexes.js)
5. **API Caching:** Add cache headers for static/slow-changing endpoints

**Metrics to Track:**
- Initial page load time
- Time to interactive (TTI)
- API response times
- Database query performance

### 6. Documentation Improvements
**Estimated Time:** 8-10 hours
**Priority:** Medium
**Category:** Documentation

**Missing Documentation:**
1. API endpoint documentation (consider Swagger/OpenAPI)
2. Component props and usage examples (Storybook?)
3. Architecture decision records (ADRs)
4. Deployment guide
5. Contributing guide
6. Database schema documentation

**Action Items:**
1. Generate API docs from JSDoc comments
2. Create component catalog with examples
3. Document Tier 4 feature usage
4. Add inline code comments for complex logic
5. Create video walkthroughs for key features

---

## P3 (Low Priority)

### 1. Husky Deprecation Warning
**Estimated Time:** 30 minutes
**Priority:** Low
**Category:** Dependencies

**Issue:** Husky shows deprecation warning about v10.0.0 compatibility.

**Action:**
```bash
# Remove deprecated lines from .husky/pre-commit:
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"
```

### 2. TypeScript Migration
**Estimated Time:** 40-60 hours
**Priority:** Low
**Category:** Type Safety

**Consideration:** Migrate JavaScript files to TypeScript for better type safety.

**Approach:**
1. Start with backend services (already has some .ts files)
2. Convert route files to TypeScript
3. Add type definitions for database models
4. Consider keeping Svelte components as .svelte (they already have JSDoc types)

**Benefits:**
- Better IDE support
- Catch errors at compile time
- Improved refactoring safety

**Risks:**
- Large time investment
- Potential runtime issues during migration
- Build complexity increase

### 3. Monitoring & Observability
**Estimated Time:** 12-16 hours
**Priority:** Low
**Category:** Production Readiness

**Add:**
1. Structured logging with log levels
2. Application metrics (Prometheus format?)
3. Health check endpoint improvements
4. Error tracking integration (Sentry?)
5. Performance monitoring (APM)

### 4. UI/UX Polish
**Estimated Time:** 12-16 hours
**Priority:** Low
**Category:** User Experience

**Improvements:**
1. Loading skeleton screens (instead of "Loading...")
2. Empty state illustrations
3. Error state illustrations
4. Animation and transitions (Tailwind transitions)
5. Responsive design improvements for mobile
6. Dark/light mode toggle improvements
7. Keyboard shortcuts documentation (already has `?` key)

### 5. Security Hardening
**Estimated Time:** 8-12 hours
**Priority:** Low (since it's a local tool)
**Category:** Security

**Considerations:**
1. Rate limiting on API endpoints (already has some)
2. Input sanitization audit
3. SQL injection prevention audit (using prepared statements)
4. XSS prevention audit (Svelte auto-escapes)
5. Dependency vulnerability scanning
6. Security headers review (Helmet already configured)

**Note:** Lower priority since Raven is a local development tool, but good practice for future cloud deployment.

### 6. Feature Completeness
**Estimated Time:** Varies
**Priority:** Low
**Category:** Features

**Optional Enhancements:**
1. Export functionality for all pages (CSV, JSON, PDF)
2. Search across all data (global search)
3. Advanced filtering and sorting
4. Custom dashboard builder
5. Webhook support for events
6. Plugin system for extensibility
7. Mobile app for monitoring

---

## Prioritization Criteria

**P1 (High):**
- Blocks production use
- Contains TODOs or stubs
- Security vulnerabilities
- Data loss risks

**P2 (Medium):**
- Impacts developer productivity
- Code quality issues
- Missing tests
- Performance bottlenecks
- Poor user experience

**P3 (Low):**
- Nice-to-have features
- Long-term improvements
- Non-critical optimizations
- Cosmetic issues

---

## Maintenance Schedule

### Weekly
- Review new warnings from svelte-check
- Update dependencies (npm audit)
- Check for new GitHub issues

### Monthly
- Review and update this document
- Assess P2 items for promotion to P1
- Plan sprint for technical debt reduction

### Quarterly
- Major dependency updates
- Architecture review
- Performance audit
- Security audit

---

## Contributing

When adding new technical debt items:
1. Add to appropriate priority section
2. Include estimated time
3. Specify category
4. Describe the issue clearly
5. Provide action items or recommendations
6. Update the "Last Updated" date at the top

When resolving items:
1. Move to "Completed" section with commit hash
2. Document any learnings or complications
3. Update related documentation
