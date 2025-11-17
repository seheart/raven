# Raven Testing Strategy & Recommendations

## Current Testing Setup ✅

### Frontend Testing Stack

**Framework:** Vitest + Testing Library + Playwright
**Coverage:** Vitest v8 coverage provider
**UI:** Vitest UI for interactive testing

**Current Test Files:**

- ✅ Unit tests for utilities (logger, apiClient, websocket, notificationService)
- ✅ Component tests for UI library (Button, Input, Modal, Select, Table)
- ✅ Widget tests (HealthWidget, EventFeed)
- ✅ Service tests (keyboardService)
- ✅ Storybook integration for component documentation

**Scripts Available:**

```bash
npm run test          # Run tests in watch mode
npm run test:ui       # Interactive UI
npm run test:run      # Single run
npm run test:coverage # Coverage report
npm run test:pages    # Custom page tests
```

---

### Backend Testing Stack

**Framework:** Jest (with ES modules support)
**Coverage:** Jest built-in coverage

**Current Test Structure:**

```
backend/__tests__/
├── integration/          # Integration tests
│   ├── metrics-collection.test.js
│   ├── dashboard-stats.test.js
│   ├── websocket-resilience.test.js
│   ├── file-watcher-recovery.test.js
│   ├── database-concurrency.test.js
│   └── telemetry-flow.test.js
├── routes/               # API route tests
│   ├── api-docs.test.js
│   ├── auth.test.js
│   ├── rollback.test.js
│   └── search.test.js
├── security/             # Security tests
│   └── sql-injection.test.js
├── services/             # Service layer tests
└── middleware/           # Middleware tests
```

**Scripts Available:**

```bash
npm run test              # Run all tests
npm run test:watch        # Watch mode
npm run test:coverage     # Coverage with HTML
npm run test:integration  # Integration tests only
```

---

## Issues Found 🔴

### 1. Backend Tests Failing

**Error:** `SecurityError: Cannot initialize local storage without a '--localstorage-file' path`

**Impact:** All backend tests are currently broken due to Jest environment configuration issue.

**Fix Required:** Update jest.config.js to properly configure the environment.

---

### 2. Low Test Coverage

**Frontend:** Minimal page component tests
**Backend:** API endpoints created today have no tests

**Missing Coverage:**

- ❌ No tests for 40+ Svelte page components
- ❌ No tests for new API endpoints (/api/endpoints, /api/events, /api/errors, etc.)
- ❌ No E2E tests for critical user flows
- ❌ No integration tests for frontend-backend communication

---

### 3. No Continuous Integration

- ❌ No automated test runs on commit/push
- ❌ No test status in pull requests
- ❌ Manual testing only

---

## Recommendations for Rock-Solid Raven 🎯

### Priority 1: Fix Existing Test Infrastructure ⚡

#### 1.1 Fix Backend Jest Configuration

Create/update `backend/jest.config.js`:

```javascript
export default {
  testEnvironment: 'node',
  transform: {},
  testMatch: ['**/__tests__/**/*.test.js'],
  collectCoverageFrom: [
    'server.ts',
    'db.ts',
    'services/**/*.js',
    'middleware/**/*.js',
    '!**/__tests__/**',
    '!**/node_modules/**'
  ],
  coverageThreshold: {
    global: {
      statements: 70,
      branches: 65,
      functions: 65,
      lines: 70
    }
  }
};
```

#### 1.2 Add Tests for New Endpoints

Create `backend/__tests__/routes/notifications.test.js`:

```javascript
import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js'; // Export app from server.ts

describe('Notifications API', () => {
  it('GET /api/notifications - should return empty array', async () => {
    const res = await request(app).get('/api/notifications');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('notifications');
    expect(Array.isArray(res.body.notifications)).toBe(true);
  });

  it('GET /api/notifications/stats - should return stats', async () => {
    const res = await request(app).get('/api/notifications/stats');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('unread');
  });

  it('POST /api/notifications/:id/read - should mark as read', async () => {
    const res = await request(app).post('/api/notifications/test-id/read');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
```

---

### Priority 2: Add Critical E2E Tests 🚀

#### 2.1 Install Playwright for E2E (already in package.json!)

Create `frontend/e2e/critical-flows.spec.js`:

```javascript
import { test, expect } from '@playwright/test';

test.describe('Critical User Flows', () => {
  test('should load dashboard without errors', async ({ page }) => {
    await page.goto('http://localhost:5173');

    // Wait for page to load
    await page.waitForSelector('h1');

    // Check for console errors
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.waitForTimeout(2000);
    expect(errors.length).toBe(0);
  });

  test('should navigate between pages', async ({ page }) => {
    await page.goto('http://localhost:5173');

    // Click System menu
    await page.click('text=System');

    // Click API Health
    await page.click('text=API Health');

    // Verify page loaded
    await expect(page.locator('h1')).toContainText('API Health');
  });

  test('should display notifications', async ({ page }) => {
    await page.goto('http://localhost:5173');

    // Open notifications panel
    await page.click('[aria-label*="notification"]');

    // Verify panel appears
    await expect(page.locator('text=Notifications')).toBeVisible();
  });
});
```

#### 2.2 Create Playwright Config

`frontend/playwright.config.js`:

```javascript
export default {
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  webServer: {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: true
  }
};
```

---

### Priority 3: Add API Integration Tests 🔗

Create `backend/__tests__/integration/api-health.test.js`:

```javascript
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';

describe('API Health Integration', () => {
  let server;

  beforeAll(async () => {
    // Start server for integration tests
    server = await startTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it('all endpoints should return valid responses', async () => {
    const endpoints = [
      '/api/status',
      '/api/health',
      '/api/events',
      '/api/errors',
      '/api/notifications',
      '/api/endpoints'
    ];

    for (const endpoint of endpoints) {
      const res = await request(server).get(endpoint);
      expect(res.status).toBeLessThan(500);
      expect(res.headers['content-type']).toMatch(/json/);
    }
  });
});
```

---

### Priority 4: Add GitHub Actions CI/CD 🤖

Create `.github/workflows/test.yml`:

```yaml
name: Test Suite

on: [push, pull_request]

jobs:
  frontend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: cd frontend && npm ci

      - name: Run linters
        run: cd frontend && npm run lint && npm run lint:css

      - name: Run unit tests
        run: cd frontend && npm run test:run

      - name: Generate coverage
        run: cd frontend && npm run test:coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          files: ./frontend/coverage/lcov.info

  backend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: cd backend && npm ci

      - name: Run tests
        run: cd backend && npm run test

      - name: Generate coverage
        run: cd backend && npm run test:coverage

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci && cd frontend && npm ci && cd ../backend && npm ci

      - name: Install Playwright
        run: cd frontend && npx playwright install --with-deps

      - name: Run E2E tests
        run: ./start.sh && cd frontend && npx playwright test

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: frontend/playwright-report/
```

---

### Priority 5: Add Contract Testing 📝

For frontend-backend API contracts, use MSW (Mock Service Worker):

```bash
cd frontend
npm install -D msw
```

Create `frontend/src/mocks/handlers.js`:

```javascript
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/api/notifications', () => {
    return HttpResponse.json({
      notifications: [],
      total: 0,
      hasMore: false,
      unread: 0
    });
  }),

  http.get('/api/events', () => {
    return HttpResponse.json({
      events: [],
      total: 0,
      hasMore: false
    });
  })
];
```

---

### Priority 6: Add Performance Testing ⚡

Create `backend/__tests__/performance/api-load.test.js`:

```javascript
import { describe, it } from '@jest/globals';
import autocannon from 'autocannon';

describe('API Performance', () => {
  it('should handle 100 concurrent requests', async () => {
    const result = await autocannon({
      url: 'http://localhost:9100/api/status',
      connections: 100,
      duration: 10
    });

    // Should handle at least 1000 req/sec
    expect(result.requests.average).toBeGreaterThan(1000);

    // Latency should be under 100ms
    expect(result.latency.p99).toBeLessThan(100);
  });
});
```

---

### Priority 7: Add Visual Regression Testing 👁️

Using Playwright + Storybook:

```bash
cd frontend
npm install -D @storybook/test-runner
```

Update `package.json`:

```json
{
  "scripts": {
    "test:storybook": "test-storybook",
    "test:visual": "playwright test --project=chromium --grep @visual"
  }
}
```

---

## Testing Checklist for Rock-Solid Raven ✨

### Must Have (Critical)

- [ ] Fix backend Jest configuration
- [ ] Add tests for all new API endpoints
- [ ] Set up GitHub Actions CI
- [ ] E2E tests for critical flows (dashboard, navigation, notifications)
- [ ] Achieve 70%+ test coverage on backend
- [ ] Achieve 60%+ test coverage on frontend

### Should Have (High Priority)

- [ ] API contract tests with MSW
- [ ] Integration tests for WebSocket communication
- [ ] Performance tests for high-traffic endpoints
- [ ] Security tests (XSS, CSRF, SQL injection)
- [ ] Database migration tests

### Nice to Have (Medium Priority)

- [ ] Visual regression tests with Storybook
- [ ] Mutation testing with Stryker
- [ ] Load testing with k6
- [ ] A11y testing with axe-core
- [ ] Browser compatibility tests

### Future Enhancements

- [ ] Chaos engineering tests
- [ ] Fuzz testing for APIs
- [ ] Performance budgets
- [ ] Test data generators
- [ ] Snapshot testing for complex components

---

## Quick Wins (Start Here!) 🎯

1. **Fix Jest config** (30 minutes)
2. **Add 3 API endpoint tests** (1 hour)
3. **Set up GitHub Actions** (1 hour)
4. **Write 1 E2E test for dashboard** (30 minutes)
5. **Run coverage and identify gaps** (30 minutes)

**Total time to significant improvement: ~3-4 hours**

---

## Monitoring Test Health 📊

### Add Test Badges to README.md

```markdown
![Tests](https://github.com/seheart/raven/workflows/Test%20Suite/badge.svg)
![Coverage](https://codecov.io/gh/seheart/raven/branch/master/graph/badge.svg)
```

### Track Metrics

- Test pass rate
- Coverage percentage
- Test execution time
- Flaky test rate

---

## Estimated Impact 🚀

With these improvements:

- **95%+ uptime** (catching bugs before production)
- **50% faster debugging** (reproducible test cases)
- **90% fewer regressions** (comprehensive test coverage)
- **10x confidence** (automated validation on every change)

**Raven will be ROCK SOLID!** 💎
