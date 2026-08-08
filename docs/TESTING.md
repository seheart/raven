# Raven Testing Guide

Comprehensive guide to testing infrastructure and practices in Raven v1.1.0+

## Table of Contents

1. [Overview](#overview)
2. [Test Types](#test-types)
3. [Running Tests](#running-tests)
4. [Writing Tests](#writing-tests)
5. [Running checks locally](#running-checks-locally)
6. [Coverage Goals](#coverage-goals)
7. [Troubleshooting](#troubleshooting)

---

## Overview

Raven uses a comprehensive testing strategy with three layers:

1. **Unit Tests** - Test individual functions and components
2. **Integration Tests** - Test multiple components working together
3. **End-to-End Tests** - Test complete user flows in real browser

### Test Statistics

**Current Status:**

**Backend (Jest):**

- Framework: Jest v29.7.0
- Total Test Files: 14
- Tests: 206 (158 passing, 48 failing)
- Coverage Target: 70% lines, 70% functions, 50% branches

**Frontend (Vitest):**

- Framework: Vitest v3.2.4
- Total Test Files: 9
- Tests: 43 (38 passing, 5 failing)
- Coverage Target: TBD

**E2E (Playwright):**

- Framework: Playwright v1.56.1
- Test Files: 3 new comprehensive test suites
- Browsers: Chromium, Firefox, WebKit, Mobile Chrome, Mobile Safari

---

## Test Types

### 1. Backend Unit Tests (Jest)

**Location:** `backend/__tests__/`

**Structure:**

```
backend/__tests__/
├── routes/
│   ├── auth.test.js
│   ├── control.test.js
│   ├── dashboard.test.js
│   ├── health.test.js          # NEW
│   └── telemetry.test.js
├── services/
│   ├── file-watcher.test.js    # NEW
│   └── websocket.test.js       # NEW
├── utils/
│   ├── cache.test.js
│   └── logger.test.js
├── integration/
│   ├── dashboard-stats.test.js
│   ├── metrics-collection.test.js
│   └── telemetry-flow.test.js
├── auth-routes.test.js
├── auth-service.test.js
└── validation.test.js
```

**What's Tested:**

- ✅ Authentication & Authorization
- ✅ API Routes (auth, control, dashboard, telemetry, **health**)
- ✅ Utilities (cache, logger)
- ✅ Input Validation
- ✅ **File Watcher Service** (NEW)
- ✅ **WebSocket Service** (NEW)
- ✅ Integration Flows

**What Needs Tests:**

- ⚠️ Agent tracking routes
- ⚠️ Rollback functionality
- ⚠️ Pattern detection
- ⚠️ Syntax error detection

---

### 2. Frontend Unit Tests (Vitest)

**Location:** `frontend/src/lib/__tests__/`

**Structure:**

```
frontend/src/lib/__tests__/
├── apiClient.test.js
├── HealthWidget.test.js        # NEW
├── logger.test.js
├── notificationService.test.js
├── OverviewPanel.test.js       # NEW
└── websocket.test.js
```

**What's Tested:**

- ✅ API Client
- ✅ Logger
- ✅ Notification Service
- ✅ WebSocket Service
- ✅ **HealthWidget Component** (NEW)
- ✅ **OverviewPanel Component** (NEW)
- ✅ Keyboard Service
- ✅ MetricsPanel Component
- ✅ EventFeed Component

**What Needs Tests:**

- ⚠️ Safety Panels (SyntaxErrorPanel, SessionRollbackPanel, PatternWarningsPanel)
- ⚠️ Agents Panels (AgentsPanel, ConversationsPanel)
- ⚠️ Activity Panels (LiveCodeFeed, EventLog, FileBrowser)
- ⚠️ Analysis Panels (PerformancePanel, TrendsPanel)
- ⚠️ System Panels (StatusPanel, StoragePanel)

---

### 3. End-to-End Tests (Playwright) - NEW!

**Location:** `e2e/`

**Structure:**

```
e2e/
├── overview.spec.js           # NEW
├── navigation.spec.js         # NEW
└── health-monitoring.spec.js  # NEW
```

**What's Tested:**

- ✅ Overview Page Loading & Display
- ✅ Tab Navigation (all 6 main tabs)
- ✅ Keyboard Shortcuts (1-6)
- ✅ Health Monitoring
- ✅ Real-time Updates
- ✅ Theme Switching
- ✅ Responsive Layout
- ✅ API Endpoints
- ✅ WebSocket Connections

**What Needs E2E Tests:**

- ⚠️ Safety Features (rollback, pattern warnings)
- ⚠️ Agent Interactions
- ⚠️ File Browser Navigation
- ⚠️ Search Functionality
- ⚠️ Metrics Visualization

---

## Running Tests

### Quick Start

```bash
# Run all tests (backend + frontend + E2E)
npm run test:all

# Run only backend tests
npm run test:backend

# Run only frontend tests
npm run test:frontend

# Run only E2E tests
npm run test:e2e
```

### Backend Tests

```bash
cd backend

# Run all tests
npm test

# Run in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage

# Run only integration tests
npm run test:integration

# Run specific test file
npm test -- health.test.js

# Run tests matching pattern
npm test -- --testNamePattern="should return health"
```

### Frontend Tests

```bash
cd frontend

# Run tests (watch mode)
npm test

# Run tests once
npm run test:run

# Run with UI
npm run test:ui

# Run with coverage
npm run test:coverage
```

### E2E Tests

```bash
# Run all E2E tests (headless)
npm run test:e2e

# Run with UI mode (interactive)
npm run test:e2e:ui

# Run in headed mode (see browser)
npm run test:e2e:headed

# Run in debug mode
npm run test:e2e:debug

# Run specific test file
npx playwright test overview.spec.js

# Run specific browser
npx playwright test --project=chromium

# Run specific test
npx playwright test --grep="should load the overview page"
```

### First Time Setup

**Install Playwright browsers:**

```bash
npm run playwright:install
```

This installs browser binaries for Chromium, Firefox, and WebKit.

---

## Writing Tests

### Backend Test Example (Jest)

```javascript
import { describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';

describe('API Endpoint', () => {
  let app;

  beforeEach(() => {
    app = express();
    // Setup...
  });

  it('should return 200 OK', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status');
  });
});
```

### Frontend Test Example (Vitest)

```javascript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import MyComponent from '../MyComponent.svelte';

describe('MyComponent', () => {
  it('should render correctly', async () => {
    render(MyComponent, { props: { title: 'Test' } });

    await waitFor(() => {
      expect(screen.getByText('Test')).toBeVisible();
    });
  });
});
```

### E2E Test Example (Playwright)

```javascript
import { test, expect } from '@playwright/test';

test('user can navigate to overview page', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText(/Raven Session ID/i)).toBeVisible();
});
```

### Best Practices

**1. Test Naming**

```javascript
// ✅ Good - Descriptive and clear
test('should display error message when API fails');

// ❌ Bad - Vague
test('test1');
```

**2. Arrange-Act-Assert Pattern**

```javascript
test('should calculate total correctly', () => {
  // Arrange
  const items = [1, 2, 3];

  // Act
  const total = calculateTotal(items);

  // Assert
  expect(total).toBe(6);
});
```

**3. Mock External Dependencies**

```javascript
// Mock fetch
global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ data: 'test' })
  })
);
```

**4. Clean Up After Tests**

```javascript
afterEach(() => {
  vi.clearAllMocks();
  // Clean up database, files, etc.
});
```

**5. Use Descriptive Matchers**

```javascript
// ✅ Good
expect(response.body).toHaveProperty('status', 'online');

// ❌ Less clear
expect(response.body.status === 'online').toBe(true);
```

---

## Running checks locally

Raven has no CI — it's a solo project, and the GitHub Actions pipeline was removed once it stopped earning its keep. All checks run on your machine instead.

Before pushing anything structural, run the same suites by hand:

```bash
npm test            # backend (Jest) + frontend (Vitest)
npm run test:e2e    # Playwright
npm run lint:dead   # Knip dead-code scan
npx depcruise backend/src   # architecture rules
```

The pre-commit hook (lint-staged) runs eslint, stylelint, prettier, and svelte-check on staged files automatically — don't bypass it with `--no-verify`.

**Local test reports:** the Playwright HTML report lands in `playwright-report/` and failure videos in `test-results/`. Open the report with `npx playwright show-report`.

---

## Coverage Goals

### Current Coverage Thresholds

**Backend (Jest):**

```javascript
{
  branches: 50%,
  functions: 70%,
  lines: 70%,
  statements: 70%
}
```

**Frontend (Vitest):**

- No strict thresholds yet
- Goal: 60% coverage for components

**E2E (Playwright):**

- Critical user flows: 100%
- All main pages: 100%
- Edge cases: 80%

### Checking Coverage

```bash
# Backend
cd backend && npm run test:coverage

# Frontend
cd frontend && npm run test:coverage

# View HTML reports
open backend/coverage/lcov-report/index.html
open frontend/coverage/index.html

# View Playwright report
npx playwright show-report
```

---

## New Test Files Added

### Backend Tests

**`backend/__tests__/routes/health.test.js`** (25 tests)

- GET /api/health
- GET /api/session-id
- GET /api/status
- GET /api/health-checks
- POST /api/health-checks/run
- GET /api/health/projects (comprehensive project health calculation)

**`backend/__tests__/services/websocket.test.js`** (18 tests)

- Connection management
- Event broadcasting (file-changed, system-metrics, etc.)
- Room/namespace support
- Multiple clients
- Error handling
- Event throttling
- Connection state tracking

**`backend/__tests__/services/file-watcher.test.js`** (17 tests)

- Watcher initialization
- File change detection (add, modify, delete)
- Event filtering
- Debouncing
- Error handling
- Watcher lifecycle
- Performance tests
- Platform-specific behavior

### Frontend Tests

**`frontend/src/lib/__tests__/HealthWidget.test.js`** (28 tests)

- Component rendering
- Health status indicators
- Health checks (syntax, tests, deletions, security)
- Startup health checks
- Today's stats
- Refresh functionality
- Large deletion detection
- Security file changes
- Error handling
- Time formatting

**`frontend/src/lib/__tests__/OverviewPanel.test.js`** (23 tests)

- Component rendering
- Session information display
- Current session card
- System health card
- Live activity stream
- Most active files
- Time-based greeting
- Flow state calculation
- Loading states
- Error handling
- Real-time updates

### E2E Tests

**`e2e/overview.spec.js`** (17 tests)

- Overview page loading
- Session information
- Health widget
- Session statistics
- System health metrics
- Live activity stream
- Refresh functionality
- Health check components
- Today's stats
- Responsive layout
- WebSocket connection
- Time-based greeting

**`e2e/navigation.spec.js`** (21 tests)

- Main navigation tabs
- Tab navigation to all 6 pages
- Active tab highlighting
- Scroll position preservation
- Keyboard shortcuts (1-6)
- Header navigation
- Footer navigation
- Theme switching
- Sub-navigation

**`e2e/health-monitoring.spec.js`** (15 tests)

- Startup health checks
- Health check indicators
- Health status icons
- System metrics
- Health data refresh
- Multi-project health
- Health API endpoints
- Health notifications
- Real-time health updates

---

## Troubleshooting

### Common Issues

**1. Tests Timing Out**

```javascript
// Increase timeout for specific test
test('slow operation', async () => {
  // test code
}, 10000); // 10 second timeout
```

**2. Flaky E2E Tests**

```javascript
// Use waitFor instead of hard waits
await waitFor(
  () => {
    expect(element).toBeVisible();
  },
  { timeout: 5000 }
);

// Not: await page.waitForTimeout(5000)
```

**3. Mock Not Working**

```javascript
// Clear mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
  // or
  jest.clearAllMocks();
});
```

**4. Database Locked (Backend Tests)**

```javascript
// Close database connections properly
afterAll(async () => {
  if (db && db.open) {
    db.close();
  }
});
```

**5. Port Already in Use (E2E)**

```bash
# Kill process on port 9100
lsof -ti:9100 | xargs kill -9

# Kill process on port 9000
lsof -ti:9000 | xargs kill -9
```

**6. Playwright Browsers Not Installed**

```bash
# Install browsers
npx playwright install --with-deps
```

**7. Flaky / Environment-Dependent Failures**

- Check your Node version (Raven targets Node 20.19+)
- Check environment variables
- Clear node_modules and reinstall

**8. WebSocket Tests Failing**

```javascript
// Ensure proper cleanup
afterEach(() => {
  if (clientSocket) {
    clientSocket.close();
  }
  if (io) {
    io.close();
  }
});
```

---

## Next Steps

### Priority Testing Needs

**High Priority:**

1. Fix 48 failing backend tests
2. Fix 5 failing frontend tests
3. Add Safety panel tests
4. Add Agents panel tests

**Medium Priority:**

1. Increase backend coverage to 80%
2. Add frontend component tests
3. Add E2E tests for all user flows

**Low Priority:**

1. Performance testing
2. Load testing
3. Accessibility testing

---

## Resources

- [Jest Documentation](https://jestjs.io/)
- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [Testing Library](https://testing-library.com/)
- [Supertest](https://github.com/visionmedia/supertest)

---

## Contributing

When adding new features:

1. **Write tests first** (TDD approach)
2. **Ensure tests pass** before committing
3. **Maintain coverage** - don't decrease coverage
4. **Update this doc** if adding new test patterns

**Test Checklist:**

- [ ] Unit tests for new functions
- [ ] Component tests for new UI
- [ ] Integration tests for new flows
- [ ] E2E tests for new pages
- [ ] All tests passing
- [ ] Coverage maintained or improved

---

**Last Updated:** October 26, 2025
**Raven Version:** v1.1.0+
**Maintained By:** Raven Development Team
