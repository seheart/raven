# Raven E2E Testing - User Story Tests

This directory contains end-to-end (E2E) tests that simulate real user workflows in Raven. These tests act like "bot users" that continuously verify critical functionality works as expected.

## 🎯 What Are User Story Tests?

Instead of testing individual functions, these tests verify **complete user workflows**:

- ✅ "Can I see my recent file changes?"
- ✅ "Is my storage information accurate?"
- ✅ "Does project switching work?"
- ✅ "Are errors being detected?"

Each test represents a real scenario a user would experience.

## 📁 Test Files

| File                        | Purpose                       | Test Count |
| --------------------------- | ----------------------------- | ---------- |
| `user-stories.spec.js`      | 🎭 User workflow scenarios    | 20+ tests  |
| `overview.spec.js`          | 🏠 Dashboard functionality    | 17 tests   |
| `navigation.spec.js`        | 🧭 Page navigation & routing  | 10+ tests  |
| `health-monitoring.spec.js` | 🏥 Health checks & monitoring | 15+ tests  |

## 🚀 Running Tests

### Run All E2E Tests

```bash
# From the root of Raven
npm run test:e2e
```

### Run Tests with UI (Visual Browser)

```bash
npm run test:e2e:ui
```

### Run Tests in Headed Mode (See Browser)

```bash
npm run test:e2e:headed
```

### Debug a Failing Test

```bash
npm run test:e2e:debug
```

### Run Only User Story Tests

```bash
npx playwright test user-stories
```

### Run a Specific Test

```bash
npx playwright test user-stories -g "activity is showing"
```

## 🤖 Continuous Testing (Bot Mode)

To run tests continuously (like bot users):

### Option 1: Watch Mode (Re-run on file changes)

```bash
npx playwright test --watch
```

### Option 2: Scheduled Runs (Every X Minutes)

```bash
# Run tests every 5 minutes
watch -n 300 'npm run test:e2e'
```

### Option 3: Pre-push habit

There's no CI on this repo — run `npm run test:e2e` locally before pushing anything that touches the UI.

## 🎬 User Story Test Examples

### "See if activity is showing the latest changes"

```javascript
test('should display recent file changes in activity log', async ({ page }) => {
  // Navigate to Activity page
  await page.click('text=/Activity/i');

  // Verify activity log is visible
  await expect(page.getByText(/Activity Log/i)).toBeVisible();

  // Check for recent events
  await expect(activityContent.first()).toBeVisible();
});
```

### "Is my storage good?"

```javascript
test('should show storage usage on System page', async ({ page }) => {
  // Navigate to System
  await page.click('text=/System/i');

  // Verify storage info is shown
  await expect(page.getByText(/Storage/i)).toBeVisible();

  // Check for size metrics
  await expect(page.locator('text=/\\d+.*MB|GB/i')).toBeVisible();
});
```

## 📊 Test Reports

After running tests, view detailed reports:

```bash
# Generate and open HTML report
npx playwright show-report
```

Reports include:

- ✅ Screenshots of failures
- ✅ Video recordings of test runs
- ✅ Step-by-step execution traces
- ✅ Network activity logs

## 🔧 Configuration

Playwright configuration is in `/playwright.config.js`:

```javascript
{
  // E2E runs on dedicated ports (frontend 9001 → backend 9101) so it never
  // disrupts a dev session on the canonical 9000 → 9100.
  baseURL: 'http://localhost:9001',  // Frontend URL (isolated E2E port)
  timeout: 30000,                     // 30 second timeout per test
  retries: 2,                         // Retry failing tests twice
}
```

Playwright auto-starts its own backend (9101) and frontend (9001) via the `webServer` config and tears them down afterward — you don't need to start Raven yourself. Override the ports with `RAVEN_E2E_FRONTEND_PORT` / `RAVEN_E2E_BACKEND_PORT` if something is squatting them.

## 🐛 Debugging Failed Tests

### 1. Run with UI Mode

```bash
npm run test:e2e:ui
```

This opens a visual interface showing exactly what the test is doing.

### 2. Run in Headed Mode

```bash
npm run test:e2e:headed
```

Watch the browser as tests execute.

### 3. Use Debug Mode

```bash
npm run test:e2e:debug
```

Step through tests line by line.

### 4. Check Screenshots

Failed tests automatically capture screenshots in `test-results/`

## 📝 Writing New User Stories

To add a new user story test:

1. **Identify the user workflow**

   ```
   "As a developer, I want to export my activity log"
   ```

2. **Write the test in `user-stories.spec.js`**

   ```javascript
   test('should allow exporting activity to CSV', async ({ page }) => {
     // Navigate to Activity
     await page.click('text=/Activity/i');

     // Click export button
     await page.click('text=/Export/i');

     // Verify download started
     const download = await page.waitForEvent('download');
     expect(download.suggestedFilename()).toContain('.csv');
   });
   ```

3. **Run the test**
   ```bash
   npx playwright test user-stories -g "export"
   ```

## 🏃 Performance Testing

To test how fast Raven loads:

```bash
# Run only performance tests
npx playwright test user-stories -g "load quickly"
```

Tests verify:

- ✅ Pages load in under 3 seconds
- ✅ Navigation is responsive
- ✅ No visual flickering

## 🔄 Parallel Testing (Multiple Bots)

Run multiple test instances simultaneously:

```bash
# Run 10 workers (10 bot users at once)
npx playwright test --workers=10
```

This simulates multiple users using Raven at the same time!

## 📦 Docker Testing (Future)

To run tests in isolated containers:

```bash
# Build test container
docker build -t raven-tests -f Dockerfile.test .

# Run tests in container
docker run raven-tests npm run test:e2e
```

## ✅ What These Tests Validate

### Activity & Events

- [x] Activity log displays recent changes
- [x] Real-time updates work
- [x] Filtering by type works
- [x] Event details are accurate

### Storage & System

- [x] Storage usage is shown
- [x] Database size is accurate
- [x] Cleanup functionality exists
- [x] System metrics are displayed

### Projects & Navigation

- [x] Project switching works
- [x] Current project is clear
- [x] State persists across navigation
- [x] All tabs are accessible

### Errors & Health

- [x] Syntax errors are detected
- [x] Health status is visible
- [x] Pattern warnings work
- [x] Error counts are accurate

### Performance & UX

- [x] Pages load quickly
- [x] UI is responsive
- [x] Mobile viewport works
- [x] Visual hierarchy is clear

## 🎯 Success Metrics

All tests should pass with:

- ✅ 0 failures
- ✅ Average test time < 5 seconds
- ✅ No flaky tests (inconsistent pass/fail)

Current status: Run `npm run test:e2e` to see live results!

## 🤝 Contributing

When adding features to Raven:

1. Write a user story test FIRST
2. Verify test fails (red)
3. Implement the feature
4. Verify test passes (green)
5. Commit both feature + test

This ensures new features are properly tested!

## 📚 Resources

- [Playwright Documentation](https://playwright.dev)
- [Test Best Practices](https://playwright.dev/docs/best-practices)
- [Debugging Guide](https://playwright.dev/docs/debug)
- [CI/CD Setup](https://playwright.dev/docs/ci)

---

## 🚨 Important Notes

### Before Running Tests:

1. ✅ Install Playwright browsers once: `npm run playwright:install`
2. ✅ That's it — Playwright auto-starts isolated backend (9101) and frontend (9001) servers itself. You do **not** need a dev session running; if one is, it's left untouched on 9000/9100.

### If Tests Fail:

1. Run tests with UI mode (`npm run test:e2e:ui`) to see what's happening
2. Check for a port conflict on 9001/9101 (override with `RAVEN_E2E_FRONTEND_PORT` / `RAVEN_E2E_BACKEND_PORT`)
3. Confirm browsers are installed: `npm run playwright:install`

### For Continuous Testing:

- Tests can run while you develop
- Failed tests indicate something broke
- Screenshots help debug issues quickly
- Use `--watch` mode for instant feedback

---

**Happy Testing! 🎉**

Need help? Check the [Raven Documentation](../README.md) or open an issue.
