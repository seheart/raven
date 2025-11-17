# Raven Testing Plan

Comprehensive testing strategy for the Raven monitoring application.

## Table of Contents

1. [Unit Tests](#unit-tests)
2. [Integration Tests](#integration-tests)
3. [End-to-End Tests](#end-to-end-tests)
4. [Performance Tests](#performance-tests)
5. [Security Tests](#security-tests)
6. [Infinite Loop Detection](#infinite-loop-detection)
7. [Manual Testing Checklist](#manual-testing-checklist)

---

## 1. Unit Tests

### Frontend Component Tests

**Location**: `frontend/src/lib/**/*.test.js`

**Run Command**:

```bash
cd frontend && npm test
```

**Coverage Requirements**:

- Minimum 80% code coverage for all UI components
- All user-facing components must have tests

**Test Categories**:

- ✅ Component rendering (props, state, slots)
- ✅ User interactions (clicks, form submissions)
- ✅ Accessibility (ARIA labels, keyboard navigation)
- ✅ Error states and edge cases
- ✅ Responsive behavior

**Known Skipped Tests** (require E2E):

- Svelte 5 children/snippet rendering (12 tests)
- Complex user workflows requiring browser environment

### Backend Unit Tests

**Location**: `backend/__tests__/**/*.test.js`

**Run Command**:

```bash
cd backend && npm test
```

**Test Categories**:

- Database operations (CRUD, transactions)
- API endpoints (routes, middleware)
- Service layer logic
- Utility functions
- SQL injection prevention

---

## 2. Integration Tests

### API Integration Tests

**Location**: `backend/__tests__/integration/*.test.js`

**Test Scenarios**:

- Database concurrency (multiple simultaneous writes)
- Telemetry flow (end-to-end event tracking)
- WebSocket communication
- File watcher integration
- Session management

### Frontend-Backend Integration

**Test Scenarios**:

- API client error handling
- WebSocket reconnection logic
- Data synchronization
- Authentication flow
- Real-time updates

---

## 3. End-to-End Tests

### Playwright Tests

**Location**: `backend/__tests__/e2e/*.test.js`

**Run Command**:

```bash
npm run test:e2e
```

**Test Scenarios**:

- Page load and navigation
- Full user workflows
- Form submissions
- Chart rendering
- Real-time updates via WebSocket
- Error handling and recovery

### Page Error Checker

**Run Command**:

```bash
npm run raven:test-pages
```

**What It Checks**:

- All pages load without JavaScript errors
- No console warnings or errors
- Proper error boundaries
- Accessibility issues

**Current Status**: 30/41 pages passing (73%)

---

## 4. Performance Tests

### 4.1 Infinite Loop Detection

**Critical Issue**: Reactive effects that update state they're watching

#### Automated Checks

Run the infinite loop detector:

```bash
# Search for problematic patterns
grep -r "\$effect(() => {" frontend/src/lib/pages/*.svelte | \
  xargs -I {} sh -c 'echo "Checking: {}" && grep -A 10 "\$effect" {}'
```

#### Manual Verification Checklist

**High Priority Pages** (Recently Fixed):

- [x] OverviewHealthPage.svelte - Fixed: Added proper dependencies
- [x] AnalysisHistoricalTrendsPage.svelte - Fixed: Moved to onMount
- [x] ActivityEventLogPage.svelte - Fixed: Moved to onMount
- [x] ActivityLiveFeedPage.svelte - Fixed: Moved to onMount

**Pattern to Avoid**:

```javascript
// ❌ BAD: Updates state that triggers re-run
$effect(() => {
  loadData(); // Sets loading, data, error → triggers $effect again
});

// ✅ GOOD: Explicit dependencies
$effect(() => {
  const project = selectedProject;
  const days = selectedDays;
  loadData(); // Only runs when project or days changes
});

// ✅ BETTER: Use onMount for initial load
onMount(() => {
  loadData();
  return cleanup;
});
```

#### Performance Monitoring

**Browser DevTools Checks**:

1. Open Chrome DevTools → Performance tab
2. Record 5-10 seconds of page interaction
3. Look for:
   - Repeated function calls (> 10 times/second)
   - Memory leaks (increasing heap size)
   - Long tasks (> 50ms)
   - Excessive re-renders

**Red Flags**:

- Function called > 100 times in 1 second
- Memory usage increasing continuously
- CPU usage > 30% on idle page
- Network requests repeating indefinitely

### 4.2 Memory Leak Detection

**Test Procedure**:

1. Open page in Chrome
2. Open DevTools → Memory tab
3. Take heap snapshot
4. Interact with page for 2 minutes
5. Take second heap snapshot
6. Compare - growth should be < 10MB

**Known Memory Consumers**:

- Chart.js instances (must call `chart.destroy()`)
- WebSocket connections (must call `ws.close()`)
- setInterval timers (must call `clearInterval()`)
- Event listeners (must call `removeEventListener()`)

### 4.3 setInterval Cleanup Verification

**All setInterval calls MUST have clearInterval**:

```bash
# Find all setInterval calls
grep -rn "setInterval" frontend/src/lib/

# Verify each has corresponding clearInterval in cleanup
```

**Verified Clean**:

- ✅ RateLimitIndicator.svelte (Line 25, cleared on line 30)
- ✅ dataService.js (Line 92, cleared on line 610)
- ✅ EmergencyStopButton.svelte (Line 124, cleared on line 133)
- ✅ ActivityLiveFeedPage.svelte (Line 361, cleared on line 384)
- ✅ SystemStoragePage.svelte (Line 58, cleared on line 62)
- ✅ AgentMonitoringPage.svelte (Line 371, cleared on lines 366, 378, 409)
- ✅ SystemAPIHealthPage.svelte (Line 214, cleared on lines 212, 265)
- ✅ SystemServerSyncPage.svelte (Line 289, cleared on lines 285, 299)

### 4.4 WebSocket Reconnection Logic

**Test Scenarios**:

1. Server disconnects → Should reconnect with exponential backoff
2. Max reconnection attempts (20) → Should stop trying
3. Manual disconnect → Should NOT auto-reconnect
4. Page navigation → Should cleanup all listeners

**Safeguards in websocket.js**:

- Max reconnection attempts: 20
- Max callbacks: 50
- Duplicate callback prevention
- Cleanup on disconnect

**Test Command**:

```bash
# Kill backend, observe reconnection behavior
pkill -f "node.*raven.*backend"
# Watch frontend console for reconnection attempts
```

---

## 5. Security Tests

### SQL Injection Tests

**Location**: `backend/__tests__/security/sql-injection.test.js`

**Run Command**:

```bash
npm test -- sql-injection
```

**Test Cases**:

- Parameterized queries
- Input sanitization
- Error message handling (no SQL exposure)
- Table name validation

### XSS Prevention

**Manual Checks**:

- User input is escaped in templates
- No `innerHTML` with user data
- Content Security Policy headers

### Authentication & Authorization

**Test Scenarios**:

- Session management
- Token validation
- Permission checks
- Rate limiting

---

## 6. Infinite Loop Detection

### Automated Detection Script

Create `check-loops.sh`:

```bash
#!/bin/bash
echo "🔍 Checking for potential infinite loops..."

echo "\n1. Finding $effect blocks that call async functions:"
grep -rn "\$effect.*loadTrends\|loadData\|loadEvents\|fetchAllData" frontend/src/lib/pages/*.svelte

echo "\n2. Finding $effect blocks without dependencies:"
grep -rn "\$effect(() => {" frontend/src/lib/pages/*.svelte | \
  while read line; do
    file=$(echo $line | cut -d: -f1)
    linenum=$(echo $line | cut -d: -f2)
    # Check if next 5 lines contain const assignments (dependencies)
    if ! sed -n "${linenum},$((linenum+5))p" "$file" | grep -q "const "; then
      echo "⚠️  Potential issue: $file:$linenum"
    fi
  done

echo "\n3. Finding setInterval without clearInterval:"
grep -rn "setInterval" frontend/src/lib/ | while read line; do
  file=$(echo $line | cut -d: -f1)
  if ! grep -q "clearInterval" "$file"; then
    echo "⚠️  Missing clearInterval: $file"
  fi
done

echo "\n✅ Loop detection complete"
```

### Runtime Detection

**Browser Console Monitoring**:

```javascript
// Add to browser console during development
let callCounts = {};
let originalEffect = $effect;

window.$effect = function (fn) {
  let callCount = 0;
  return originalEffect(() => {
    callCount++;
    if (callCount > 10) {
      console.error(
        `⚠️ Potential infinite loop detected! Effect called ${callCount} times`,
        fn.toString()
      );
    }
    return fn();
  });
};
```

---

## 7. Manual Testing Checklist

### Pre-Release Checklist

#### Functionality

- [ ] All pages load without errors
- [ ] Navigation works correctly
- [ ] Forms submit successfully
- [ ] Charts render properly
- [ ] Real-time updates work
- [ ] WebSocket reconnection works
- [ ] Error handling displays user-friendly messages
- [ ] Loading states show correctly

#### Performance

- [ ] Initial page load < 3 seconds
- [ ] No infinite loops (check console)
- [ ] No memory leaks (heap snapshot)
- [ ] CPU usage < 30% on idle
- [ ] Network requests are reasonable
- [ ] No unnecessary re-renders

#### Accessibility

- [ ] Keyboard navigation works
- [ ] Screen reader compatibility
- [ ] ARIA labels present
- [ ] Focus indicators visible
- [ ] Color contrast meets WCAG AA

#### Browser Compatibility

- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)

#### Security

- [ ] No console errors revealing sensitive data
- [ ] SQL injection tests pass
- [ ] XSS prevention verified
- [ ] Authentication works
- [ ] Rate limiting active

---

## Running All Tests

### Quick Test Suite

```bash
# Run unit tests only (fastest)
npm run raven:test
```

### Full Test Suite

```bash
# 1. Backend unit tests
cd backend && npm test

# 2. Frontend unit tests
cd frontend && npm test

# 3. Integration tests
cd backend && npm test -- integration

# 4. E2E tests
npm run test:e2e

# 5. Page error checker
npm run raven:test-pages

# 6. Security tests
cd backend && npm test -- security
```

### Performance Monitoring

```bash
# Check for infinite loops
./check-loops.sh

# Monitor memory usage
npm run dev
# Then use Chrome DevTools → Performance/Memory tabs
```

---

## Test Status Dashboard

### Current Status (2025-11-17)

#### Unit Tests

- Frontend: ✅ 110 passed, 12 skipped (intentional)
- Backend: ✅ All passing

#### Integration Tests

- ✅ Database concurrency
- ✅ Telemetry flow
- ✅ SQL injection prevention

#### E2E Tests

- Page Error Checker: ⚠️ 30/41 passing (73%)
- **Remaining Issues**: 11 pages with errors

#### Performance Tests

- Infinite Loops: ✅ 4 critical issues fixed
  - OverviewHealthPage.svelte
  - AnalysisHistoricalTrendsPage.svelte
  - ActivityEventLogPage.svelte
  - ActivityLiveFeedPage.svelte
- Memory Leaks: ✅ All setInterval calls have cleanup
- WebSocket: ✅ Proper reconnection logic with safeguards

#### Security Tests

- SQL Injection: ✅ All passing
- XSS Prevention: ✅ Templates escaped
- Authentication: ✅ Implemented

---

## Continuous Improvement

### Adding New Tests

1. Write test first (TDD)
2. Ensure it fails
3. Implement feature
4. Verify test passes
5. Check coverage report

### Test Maintenance

- Review and update tests when features change
- Remove obsolete tests
- Keep coverage above 80%
- Document skipped tests with reasons

### Performance Regression Prevention

- Monitor bundle size
- Track page load times
- Set performance budgets
- Use Lighthouse CI

---

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [Testing Library](https://testing-library.com/)
- [Svelte Testing Guide](https://svelte.dev/docs/testing)
- [Chrome DevTools Performance](https://developer.chrome.com/docs/devtools/performance/)

---

**Last Updated**: 2025-11-17
**Next Review**: Before each release
