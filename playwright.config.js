import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Testing Configuration
 * Tests the full Raven application (frontend + backend)
 */

export default defineConfig({
  testDir: './e2e',

  // Maximum time one test can run
  timeout: 30 * 1000,

  // Run tests in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Opt out of parallel tests on CI
  workers: process.env.CI ? 1 : undefined,

  // Reporter to use
  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results/results.json' }],
    ['list']
  ],

  // Shared settings for all the projects below
  use: {
    // E2E runs on dedicated ports (9001 → 9101) so it can't disrupt a
    // dev session on the canonical 9000 → 9100. Override the dev-host
    // ports here with RAVEN_E2E_FRONTEND_PORT / RAVEN_E2E_BACKEND_PORT
    // if anything else on the machine is squatting them.
    baseURL: `http://localhost:${process.env.RAVEN_E2E_FRONTEND_PORT || '9001'}`,

    // Collect trace when retrying the failed test
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video off by default — 'retain-on-failure' still records every test
    // via ffmpeg and only deletes on pass, which is a major CPU drag.
    // Re-enable with PWVIDEO=1 when debugging a flaky test.
    video: process.env.PWVIDEO ? 'retain-on-failure' : 'off',

    // Timeout for each action
    actionTimeout: 10000,

    // Timeout for page navigation
    navigationTimeout: 15000,
  },

  // Configure projects for major browsers
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    // Test against mobile viewports
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  // Run isolated test servers on dedicated ports so e2e never hammers the
  // user's dev backend on 9100 (which is single-threaded and gets wedged by
  // 100+ concurrent test requests). reuseExistingServer is left at the
  // default so iterating on tests doesn't pay the cold-start cost — but
  // because the ports are dedicated, "existing" only means "previous test
  // backend," never the dev backend.
  webServer: [
    {
      command: 'cd backend && npm start',
      port: parseInt(process.env.RAVEN_E2E_BACKEND_PORT || '9101', 10),
      timeout: 120 * 1000,
      reuseExistingServer: !process.env.CI,
      env: {
        NODE_ENV: 'test',
        RAVEN_DEV_DISABLE_AUTH: 'true',
        PORT: process.env.RAVEN_E2E_BACKEND_PORT || '9101',
        // Isolated state dir so the test run never writes into the dev DB.
        RAVEN_DIR: process.env.RAVEN_E2E_DIR || '/tmp/raven-e2e/.raven'
      }
    },
    {
      command: 'cd frontend && npm run dev',
      port: parseInt(process.env.RAVEN_E2E_FRONTEND_PORT || '9001', 10),
      timeout: 120 * 1000,
      reuseExistingServer: !process.env.CI,
      env: {
        RAVEN_FRONTEND_PORT: process.env.RAVEN_E2E_FRONTEND_PORT || '9001',
        RAVEN_BACKEND_URL: `http://127.0.0.1:${process.env.RAVEN_E2E_BACKEND_PORT || '9101'}`
      }
    }
  ],
});
