#!/usr/bin/env node
/**
 * Automated Test Script for Tier 4 Features
 *
 * Tests all Tier 4 endpoints to verify they work correctly
 */

const API_BASE = 'http://localhost:3030/api';
const PROJECT = 'raven';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

let passedTests = 0;
let failedTests = 0;
let totalTests = 0;

async function test(name, fn) {
  totalTests++;
  process.stdout.write(`${colors.cyan}[TEST]${colors.reset} ${name}... `);
  try {
    await fn();
    passedTests++;
    console.log(`${colors.green}✓ PASS${colors.reset}`);
    return true;
  } catch (error) {
    failedTests++;
    console.log(`${colors.red}✗ FAIL${colors.reset}`);
    console.log(`  ${colors.red}Error: ${error.message}${colors.reset}`);
    return false;
  }
}

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  const data = await response.json();

  if (!response.ok && response.status !== 404) {
    throw new Error(`HTTP ${response.status}: ${data.error || JSON.stringify(data)}`);
  }

  return { status: response.status, data };
}

async function main() {
  console.log(`\n${colors.blue}========================================${colors.reset}`);
  console.log(`${colors.blue}   Tier 4 Automated Test Suite${colors.reset}`);
  console.log(`${colors.blue}========================================${colors.reset}\n`);

  console.log(`${colors.cyan}API Base:${colors.reset} ${API_BASE}`);
  console.log(`${colors.cyan}Project:${colors.reset} ${PROJECT}\n`);

  // ========================================
  // 1. HEALTH SCORING TESTS
  // ========================================
  console.log(`\n${colors.yellow}[CATEGORY] Health Scoring${colors.reset}`);

  await test('POST /health/calculate - Calculate health score', async () => {
    const { data } = await request(`/health/calculate?project=${PROJECT}`, { method: 'POST' });
    if (!data.healthScore) throw new Error('No health score returned');
    if (typeof data.healthScore.overallScore !== 'number') throw new Error('Invalid overall score');
  });

  await test('GET /health/latest - Get latest health score', async () => {
    const { data } = await request(`/health/latest?project=${PROJECT}`);
    if (data.score && typeof data.score.overall_score !== 'number') {
      throw new Error('Invalid score format');
    }
    // 404 is okay if no data exists yet
  });

  await test('GET /health/history - Get health history', async () => {
    const { data } = await request(`/health/history?project=${PROJECT}&days=30`);
    if (!Array.isArray(data.history)) throw new Error('History is not an array');
  });

  // ========================================
  // 2. DRIFT DETECTION TESTS
  // ========================================
  console.log(`\n${colors.yellow}[CATEGORY] Drift Detection${colors.reset}`);

  await test('POST /drift/detect - Detect drifts', async () => {
    const { data } = await request(`/drift/detect?project=${PROJECT}`, { method: 'POST' });
    if (!Array.isArray(data.drifts)) throw new Error('Drifts is not an array');
  });

  await test('GET /drift/recent - Get recent drifts', async () => {
    const { data } = await request(`/drift/recent?project=${PROJECT}&hours=24`);
    if (!Array.isArray(data.drifts)) throw new Error('Drifts is not an array');
  });

  await test('GET /drift/summary - Get drift summary', async () => {
    const { data } = await request(`/drift/summary?project=${PROJECT}&days=7`);
    if (!data.summary || typeof data.summary.total_active_drifts !== 'number') {
      throw new Error('Invalid summary format');
    }
  });

  // ========================================
  // 3. PRODUCTIVITY INSIGHTS TESTS
  // ========================================
  console.log(`\n${colors.yellow}[CATEGORY] Productivity Insights${colors.reset}`);

  await test('POST /productivity/calculate - Calculate productivity', async () => {
    const { data } = await request(`/productivity/calculate?project=${PROJECT}&days=30`, {
      method: 'POST'
    });
    if (!data.insights) throw new Error('No insights returned');
  });

  await test('GET /productivity/latest - Get latest insights', async () => {
    const { data } = await request(`/productivity/latest?project=${PROJECT}`);
    // 404 is okay if no data exists yet
    if (data.metrics && !data.metrics.insights) {
      throw new Error('Invalid metrics format');
    }
  });

  // ========================================
  // 4. PERSONALITY ANALYSIS TESTS
  // ========================================
  console.log(`\n${colors.yellow}[CATEGORY] Personality Analysis${colors.reset}`);

  await test('POST /personality/analyze - Analyze personality', async () => {
    const { data } = await request(`/personality/analyze?project=${PROJECT}&agent=claude&days=30`, {
      method: 'POST'
    });
    if (!data.personality) throw new Error('No personality data returned');
  });

  await test('GET /personality/latest - Get latest personality', async () => {
    const { data } = await request(`/personality/latest?project=${PROJECT}&agent=claude`);
    // 404 is okay if no data exists yet
    if (data.profile && !data.profile.insights) {
      throw new Error('Invalid profile format');
    }
  });

  // ========================================
  // 5. GROWTH TRACKING TESTS
  // ========================================
  console.log(`\n${colors.yellow}[CATEGORY] Growth Tracking${colors.reset}`);

  await test('POST /growth/snapshot - Create growth snapshot', async () => {
    const { data } = await request(`/growth/snapshot?project=${PROJECT}`, { method: 'POST' });
    if (!data.snapshot) throw new Error('No snapshot returned');
  });

  await test('GET /growth/summary - Get growth summary', async () => {
    const { data } = await request(`/growth/summary?project=${PROJECT}&days=30`);
    // Allow null summary if no snapshots exist yet
    if (data.summary && !data.summary.statistics) {
      throw new Error('Invalid summary format');
    }
  });

  await test('GET /growth/timeseries - Get growth time series', async () => {
    const { data } = await request(`/growth/timeseries?project=${PROJECT}&days=30&metric=all`);
    if (!data.timeSeries) throw new Error('Invalid time series format');
  });

  // ========================================
  // 6. INTEGRATION TESTS
  // ========================================
  console.log(`\n${colors.yellow}[CATEGORY] Integrations${colors.reset}`);

  await test('GET /integrations/github/events - GitHub events', async () => {
    const { data } = await request(`/integrations/github/events?project=${PROJECT}&hours=24`);
    if (!Array.isArray(data.events)) throw new Error('Events is not an array');
  });

  await test('GET /integrations/discord/events - Discord events', async () => {
    const { data } = await request(`/integrations/discord/events?project=${PROJECT}&hours=24`);
    if (!Array.isArray(data.events)) throw new Error('Events is not an array');
  });

  await test('GET /integrations/slack/events - Slack events', async () => {
    const { data } = await request(`/integrations/slack/events?project=${PROJECT}&hours=24`);
    if (!Array.isArray(data.events)) throw new Error('Events is not an array');
  });

  // ========================================
  // SUMMARY
  // ========================================
  console.log(`\n${colors.blue}========================================${colors.reset}`);
  console.log(`${colors.blue}   Test Summary${colors.reset}`);
  console.log(`${colors.blue}========================================${colors.reset}\n`);

  console.log(`Total Tests:  ${totalTests}`);
  console.log(`${colors.green}Passed:       ${passedTests}${colors.reset}`);
  console.log(`${colors.red}Failed:       ${failedTests}${colors.reset}`);

  const successRate = ((passedTests / totalTests) * 100).toFixed(1);
  console.log(`Success Rate: ${successRate}%\n`);

  if (failedTests === 0) {
    console.log(`${colors.green}✓ All tests passed!${colors.reset}\n`);
    process.exit(0);
  } else {
    console.log(`${colors.red}✗ Some tests failed${colors.reset}\n`);
    process.exit(1);
  }
}

main().catch(error => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, error);
  process.exit(1);
});
