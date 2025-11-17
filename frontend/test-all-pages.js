/**
 * Automated Page Error Checker for Raven
 * Crawls all pages and detects console errors, warnings, and exceptions
 */

import { chromium } from 'playwright';
import fs from 'fs';

// All Raven routes based on navigation structure
const routes = [
  // Overview
  { path: '/overview', name: 'Overview Dashboard' },
  { path: '/overview/projects', name: 'Projects Comparison' },
  { path: '/overview/health', name: 'Project Health' },

  // Safety
  { path: '/safety', name: 'Safety Overview' },
  { path: '/safety/syntax', name: 'Syntax Errors' },
  { path: '/safety/rollback', name: 'Session Rollback' },
  { path: '/safety/risk', name: 'Risk Correlation' },
  { path: '/safety/patterns', name: 'Pattern Warnings' },
  { path: '/safety/tests', name: 'Raven Tests' },

  // Agents
  { path: '/agents', name: 'Agents Overview' },
  { path: '/agents/stats', name: 'Agent Stats' },
  { path: '/agents/monitoring', name: 'Agent Monitoring' },
  { path: '/agents/conversations', name: 'Agent Conversations' },

  // Activity
  { path: '/activity', name: 'Activity Overview' },
  { path: '/activity/activity-log', name: 'Activity Log' },
  { path: '/activity/code', name: 'Code Changes' },
  { path: '/activity/live', name: 'Live Feed' },
  { path: '/activity/events', name: 'Event Log' },
  { path: '/activity/files', name: 'File Browser' },
  { path: '/activity/timeline', name: 'Timeline' },
  { path: '/activity/search', name: 'Global Search' },

  // Analysis
  { path: '/analysis', name: 'Analysis Overview' },
  { path: '/analysis/performance', name: 'Performance' },
  { path: '/analysis/custom-metrics', name: 'Custom Metrics' },
  { path: '/analysis/trends', name: 'Historical Trends' },
  { path: '/analysis/triggers', name: 'Triggers' },
  { path: '/analysis/session-replay', name: 'Session Replay' },
  { path: '/analysis/developer-insights', name: 'Developer Insights' },

  // System
  { path: '/system', name: 'System Overview' },
  { path: '/system/status', name: 'System Status' },
  { path: '/system/anomalies', name: 'Anomaly Alerts' },
  { path: '/system/intelligence', name: 'Intelligence' },
  { path: '/system/integrations', name: 'Integrations' },
  { path: '/system/exports', name: 'Exports' },
  { path: '/system/storage', name: 'Storage' },
  { path: '/system/projects', name: 'Projects' },
  { path: '/system/sync', name: 'Server Sync' },
  { path: '/system/notifications', name: 'Notifications' },
  { path: '/system/errors', name: 'Errors' },
  { path: '/system/api', name: 'API Health' },

  // Settings
  { path: '/settings', name: 'Settings' }
];

// Test configuration
const config = {
  baseUrl: 'http://localhost:9000',
  timeout: 10000,
  waitForNetworkIdle: true,
  screenshotOnError: true
};

// Results storage
const results = {
  timestamp: new Date().toISOString(),
  totalPages: routes.length,
  pagesWithErrors: 0,
  pagesWithWarnings: 0,
  totalErrors: 0,
  totalWarnings: 0,
  pages: []
};

/**
 * Test a single page for errors
 */
async function testPage(page, route) {
  const pageResult = {
    path: route.path,
    name: route.name,
    url: `${config.baseUrl}${route.path}`,
    errors: [],
    warnings: [],
    networkErrors: [],
    uncaughtExceptions: [],
    loadTime: 0,
    screenshot: null,
    status: 'unknown'
  };

  try {
    // Listen for console errors
    page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();

      if (type === 'error') {
        pageResult.errors.push({
          type: 'console.error',
          message: text,
          timestamp: new Date().toISOString()
        });
      } else if (type === 'warning') {
        pageResult.warnings.push({
          type: 'console.warn',
          message: text,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Listen for page errors (uncaught exceptions)
    page.on('pageerror', error => {
      pageResult.uncaughtExceptions.push({
        type: 'uncaught_exception',
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
    });

    // Listen for network errors
    page.on('requestfailed', request => {
      pageResult.networkErrors.push({
        type: 'network_error',
        url: request.url(),
        method: request.method(),
        failure: request.failure()?.errorText || 'Unknown error',
        timestamp: new Date().toISOString()
      });
    });

    // Navigate to the page
    const startTime = Date.now();
    const response = await page.goto(`${config.baseUrl}${route.path}`, {
      timeout: config.timeout,
      waitUntil: config.waitForNetworkIdle ? 'networkidle' : 'domcontentloaded'
    });
    pageResult.loadTime = Date.now() - startTime;

    // Check HTTP status
    if (response && response.status() >= 400) {
      pageResult.errors.push({
        type: 'http_error',
        message: `HTTP ${response.status()} - ${response.statusText()}`,
        timestamp: new Date().toISOString()
      });
    }

    // Wait for page to settle
    await page.waitForTimeout(2000);

    // Take screenshot if there are errors
    if (
      pageResult.errors.length > 0 ||
      pageResult.uncaughtExceptions.length > 0 ||
      pageResult.networkErrors.length > 0
    ) {
      if (config.screenshotOnError) {
        const filename = `error-${route.path.replace(/\//g, '-')}.png`;
        await page.screenshot({ path: `frontend/test-screenshots/${filename}` });
        pageResult.screenshot = filename;
      }
    }

    // Determine status
    if (
      pageResult.errors.length === 0 &&
      pageResult.uncaughtExceptions.length === 0 &&
      pageResult.networkErrors.length === 0
    ) {
      pageResult.status = pageResult.warnings.length > 0 ? 'warning' : 'pass';
    } else {
      pageResult.status = 'fail';
    }
  } catch (error) {
    pageResult.status = 'error';
    pageResult.errors.push({
      type: 'test_error',
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  }

  return pageResult;
}

/**
 * Generate HTML report
 */
function generateHTMLReport(results) {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Raven Page Error Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      padding: 20px;
    }
    .container { max-width: 1400px; margin: 0 auto; }
    h1 { font-size: 32px; margin-bottom: 10px; color: #38bdf8; }
    .timestamp { color: #94a3b8; margin-bottom: 30px; }
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin-bottom: 30px;
    }
    .stat-card {
      background: #1e293b;
      padding: 20px;
      border-radius: 8px;
      border-left: 4px solid #38bdf8;
    }
    .stat-card.error { border-color: #ef4444; }
    .stat-card.warning { border-color: #f59e0b; }
    .stat-card.success { border-color: #22c55e; }
    .stat-value { font-size: 36px; font-weight: bold; margin-bottom: 5px; }
    .stat-label { color: #94a3b8; text-transform: uppercase; font-size: 12px; }
    .filter-buttons {
      margin-bottom: 20px;
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .filter-btn {
      padding: 8px 16px;
      border: 2px solid #334155;
      background: #1e293b;
      color: #e2e8f0;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.2s;
    }
    .filter-btn:hover { background: #334155; }
    .filter-btn.active { border-color: #38bdf8; background: #38bdf8; color: #0f172a; }
    .page-card {
      background: #1e293b;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 15px;
      border-left: 4px solid #64748b;
    }
    .page-card.pass { border-color: #22c55e; }
    .page-card.warning { border-color: #f59e0b; }
    .page-card.fail { border-color: #ef4444; }
    .page-card.error { border-color: #dc2626; }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
    }
    .page-title { font-size: 18px; font-weight: 600; }
    .page-path { color: #94a3b8; font-size: 14px; font-family: monospace; }
    .badge {
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .badge.pass { background: #22c55e; color: #0f172a; }
    .badge.warning { background: #f59e0b; color: #0f172a; }
    .badge.fail { background: #ef4444; color: white; }
    .badge.error { background: #dc2626; color: white; }
    .error-list {
      background: #0f172a;
      border-radius: 6px;
      padding: 15px;
      margin-top: 10px;
    }
    .error-item {
      padding: 10px;
      background: #1e293b;
      border-radius: 4px;
      margin-bottom: 10px;
      border-left: 3px solid #ef4444;
      font-family: monospace;
      font-size: 13px;
    }
    .warning-item { border-left-color: #f59e0b; }
    .network-item { border-left-color: #f97316; }
    .error-type {
      color: #38bdf8;
      font-weight: 600;
      margin-bottom: 5px;
      text-transform: uppercase;
      font-size: 11px;
    }
    .error-message { color: #e2e8f0; word-break: break-word; }
    .meta {
      display: flex;
      gap: 20px;
      margin-top: 10px;
      font-size: 13px;
      color: #94a3b8;
    }
    .hidden { display: none; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🐦‍⬛ Raven Page Error Report</h1>
    <p class="timestamp">Generated: ${results.timestamp}</p>

    <div class="summary">
      <div class="stat-card">
        <div class="stat-value">${results.totalPages}</div>
        <div class="stat-label">Total Pages</div>
      </div>
      <div class="stat-card ${results.pagesWithErrors > 0 ? 'error' : 'success'}">
        <div class="stat-value">${results.pagesWithErrors}</div>
        <div class="stat-label">Pages with Errors</div>
      </div>
      <div class="stat-card warning">
        <div class="stat-value">${results.pagesWithWarnings}</div>
        <div class="stat-label">Pages with Warnings</div>
      </div>
      <div class="stat-card error">
        <div class="stat-value">${results.totalErrors}</div>
        <div class="stat-label">Total Errors</div>
      </div>
      <div class="stat-card warning">
        <div class="stat-value">${results.totalWarnings}</div>
        <div class="stat-label">Total Warnings</div>
      </div>
      <div class="stat-card success">
        <div class="stat-value">${results.pages.filter(p => p.status === 'pass').length}</div>
        <div class="stat-label">Passing Pages</div>
      </div>
    </div>

    <div class="filter-buttons">
      <button class="filter-btn active" onclick="filterPages('all')">All Pages</button>
      <button class="filter-btn" onclick="filterPages('fail')">Failures Only</button>
      <button class="filter-btn" onclick="filterPages('warning')">Warnings Only</button>
      <button class="filter-btn" onclick="filterPages('pass')">Passing Only</button>
    </div>

    <div id="pages">
      ${results.pages
        .map(
          page => `
        <div class="page-card ${page.status}" data-status="${page.status}">
          <div class="page-header">
            <div>
              <div class="page-title">${page.name}</div>
              <div class="page-path">${page.path}</div>
            </div>
            <div style="text-align: right;">
              <span class="badge ${page.status}">${page.status}</span>
              <div style="color: #94a3b8; font-size: 12px; margin-top: 5px;">
                Load: ${page.loadTime}ms
              </div>
            </div>
          </div>

          ${
            page.errors.length > 0
              ? `
            <details open>
              <summary style="cursor: pointer; color: #ef4444; font-weight: 600; margin-bottom: 10px;">
                ❌ ${page.errors.length} Error${page.errors.length > 1 ? 's' : ''}
              </summary>
              <div class="error-list">
                ${page.errors
                  .map(
                    err => `
                  <div class="error-item">
                    <div class="error-type">${err.type}</div>
                    <div class="error-message">${err.message}</div>
                  </div>
                `
                  )
                  .join('')}
              </div>
            </details>
          `
              : ''
          }

          ${
            page.uncaughtExceptions.length > 0
              ? `
            <details open>
              <summary style="cursor: pointer; color: #dc2626; font-weight: 600; margin-bottom: 10px;">
                💥 ${page.uncaughtExceptions.length} Uncaught Exception${page.uncaughtExceptions.length > 1 ? 's' : ''}
              </summary>
              <div class="error-list">
                ${page.uncaughtExceptions
                  .map(
                    err => `
                  <div class="error-item">
                    <div class="error-type">${err.type}</div>
                    <div class="error-message">${err.message}</div>
                    ${err.stack ? `<pre style="margin-top: 5px; font-size: 11px; color: #64748b;">${err.stack}</pre>` : ''}
                  </div>
                `
                  )
                  .join('')}
              </div>
            </details>
          `
              : ''
          }

          ${
            page.networkErrors.length > 0
              ? `
            <details>
              <summary style="cursor: pointer; color: #f97316; font-weight: 600; margin-bottom: 10px;">
                🌐 ${page.networkErrors.length} Network Error${page.networkErrors.length > 1 ? 's' : ''}
              </summary>
              <div class="error-list">
                ${page.networkErrors
                  .map(
                    err => `
                  <div class="error-item network-item">
                    <div class="error-type">${err.method} ${err.url}</div>
                    <div class="error-message">${err.failure}</div>
                  </div>
                `
                  )
                  .join('')}
              </div>
            </details>
          `
              : ''
          }

          ${
            page.warnings.length > 0
              ? `
            <details>
              <summary style="cursor: pointer; color: #f59e0b; font-weight: 600; margin-bottom: 10px;">
                ⚠️ ${page.warnings.length} Warning${page.warnings.length > 1 ? 's' : ''}
              </summary>
              <div class="error-list">
                ${page.warnings
                  .map(
                    warn => `
                  <div class="error-item warning-item">
                    <div class="error-type">${warn.type}</div>
                    <div class="error-message">${warn.message}</div>
                  </div>
                `
                  )
                  .join('')}
              </div>
            </details>
          `
              : ''
          }

          ${page.status === 'pass' ? '<div style="color: #22c55e; font-weight: 600;">✅ No errors detected</div>' : ''}
        </div>
      `
        )
        .join('')}
    </div>
  </div>

  <script>
    function filterPages(status) {
      const cards = document.querySelectorAll('.page-card');
      const buttons = document.querySelectorAll('.filter-btn');

      buttons.forEach(btn => btn.classList.remove('active'));
      event.target.classList.add('active');

      cards.forEach(card => {
        if (status === 'all' || card.dataset.status === status) {
          card.classList.remove('hidden');
        } else {
          card.classList.add('hidden');
        }
      });
    }
  </script>
</body>
</html>
  `;

  return html;
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('🐦‍⬛ Raven Page Error Checker');
  console.log(`Testing ${routes.length} pages...\n`);

  // Create screenshots directory
  if (!fs.existsSync('frontend/test-screenshots')) {
    fs.mkdirSync('frontend/test-screenshots', { recursive: true });
  }

  // Launch browser
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  // Test each page
  for (let i = 0; i < routes.length; i++) {
    const route = routes[i];
    process.stdout.write(`[${i + 1}/${routes.length}] Testing ${route.name}... `);

    const pageResult = await testPage(page, route);
    results.pages.push(pageResult);

    // Update counters
    if (pageResult.errors.length > 0 || pageResult.uncaughtExceptions.length > 0) {
      results.pagesWithErrors++;
      results.totalErrors +=
        pageResult.errors.length +
        pageResult.uncaughtExceptions.length +
        pageResult.networkErrors.length;
    }
    if (pageResult.warnings.length > 0) {
      results.pagesWithWarnings++;
      results.totalWarnings += pageResult.warnings.length;
    }

    // Print status
    const statusEmoji = {
      pass: '✅',
      warning: '⚠️',
      fail: '❌',
      error: '💥'
    }[pageResult.status];
    console.log(`${statusEmoji} ${pageResult.status.toUpperCase()}`);
  }

  await browser.close();

  // Generate reports
  console.log('\n📝 Generating reports...');

  // JSON report
  fs.writeFileSync(
    'frontend/test-results.json',
    JSON.stringify(results, null, 2)
  );
  console.log('   ✓ JSON report: frontend/test-results.json');

  // HTML report
  const htmlReport = generateHTMLReport(results);
  fs.writeFileSync('frontend/test-results.html', htmlReport);
  console.log('   ✓ HTML report: frontend/test-results.html');

  // Print summary
  console.log('\n📊 Summary:');
  console.log(`   Total Pages: ${results.totalPages}`);
  console.log(
    `   ${results.pagesWithErrors > 0 ? '❌' : '✅'} Pages with Errors: ${results.pagesWithErrors}`
  );
  console.log(`   ⚠️  Pages with Warnings: ${results.pagesWithWarnings}`);
  console.log(`   ✅ Passing Pages: ${results.pages.filter(p => p.status === 'pass').length}`);
  console.log(`   🔴 Total Errors: ${results.totalErrors}`);
  console.log(`   🟡 Total Warnings: ${results.totalWarnings}`);

  // Exit with error code if there are failures
  process.exit(results.pagesWithErrors > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
});
