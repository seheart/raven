#!/usr/bin/env node

/**
 * Comprehensive Diagnostic Test Suite
 * Tests all Raven functionality and reports issues
 */

const API_URL = 'http://localhost:9100';

const tests = {
  passed: [],
  failed: [],
  warnings: []
};

function pass(name, message = '') {
  tests.passed.push({ name, message });
  console.log(`✅ ${name}${message ? `: ${message}` : ''}`);
}

function fail(name, error) {
  tests.failed.push({ name, error: error.message || error });
  console.log(`❌ ${name}: ${error.message || error}`);
}

function warn(name, message) {
  tests.warnings.push({ name, message });
  console.log(`⚠️  ${name}: ${message}`);
}

async function testEndpoint(method, path, expectedStatus = 200, body = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (body) options.body = JSON.stringify(body);
  
  const response = await fetch(`${API_URL}${path}`, options);
  if (response.status !== expectedStatus) {
    throw new Error(`Expected ${expectedStatus}, got ${response.status}`);
  }
  return response.json().catch(() => response.text());
}

async function runDiagnostics() {
  console.log('Raven Comprehensive Diagnostic Test\n');
  console.log('=' .repeat(60));
  console.log('SYSTEM HEALTH CHECKS');
  console.log('='.repeat(60) + '\n');

  // 1. Backend Health
  try {
    const health = await testEndpoint('GET', '/health');
    if (health.status === 'healthy') {
      pass('Backend Health', `Session: ${health.session_id.substring(0, 8)}...`);
      pass('Database Connection', health.database);
      pass('Backend Uptime', `${Math.floor(health.uptime)}s`);
    } else {
      fail('Backend Health', 'Unhealthy status');
    }
  } catch (error) {
    fail('Backend Health', error);
  }

  // 2. Session ID
  try {
    const session = await testEndpoint('GET', '/api/session-id');
    if (session.session_id && session.session_id.length === 36) {
      pass('Session ID', session.session_id.substring(0, 13) + '...');
    } else {
      fail('Session ID', 'Invalid format');
    }
  } catch (error) {
    fail('Session ID', error);
  }

  console.log('\n' + '='.repeat(60));
  console.log('API ENDPOINT TESTS (21 endpoints)');
  console.log('='.repeat(60) + '\n');

  // 3. Dashboard Stats
  try {
    const stats = await testEndpoint('GET', '/api/dashboard-stats');
    pass('Dashboard Stats', `${stats.file_events} events, ${stats.total_agents} agents`);
  } catch (error) {
    fail('Dashboard Stats', error);
  }

  // 4. Top Modified Files
  try {
    const files = await testEndpoint('GET', '/api/top-modified-files?limit=5');
    pass('Top Modified Files', `Returned ${files.length} files`);
  } catch (error) {
    fail('Top Modified Files', error);
  }

  // 5. Longest Edits
  try {
    const edits = await testEndpoint('GET', '/api/longest-edits?limit=5');
    pass('Longest Edits', `Returned ${edits.length} edits`);
  } catch (error) {
    fail('Longest Edits', error);
  }

  // 6. Agents Status
  try {
    const agents = await testEndpoint('GET', '/api/agents-status');
    pass('Agents Status', `${agents.length} active agents`);
  } catch (error) {
    fail('Agents Status', error);
  }

  // 7. Agent Events
  try {
    const events = await testEndpoint('GET', '/api/agent-events?limit=10');
    pass('Agent Events', `Returned ${events.length} events`);
  } catch (error) {
    fail('Agent Events', error);
  }

  // 8. Events by Agent
  try {
    const events = await testEndpoint('GET', '/api/events-by-agent/ollama?limit=5');
    pass('Events by Agent', `Returned ${events.length} events for ollama`);
  } catch (error) {
    // This might fail if ollama hasn't sent events yet
    warn('Events by Agent', 'No events for ollama (expected if not used)');
  }

  // 9. Agent Stats
  try {
    const stats = await testEndpoint('GET', '/api/agent-stats');
    pass('Agent Stats', `${stats.length} agents with stats`);
  } catch (error) {
    fail('Agent Stats', error);
  }

  // 10. System Metrics
  try {
    const metrics = await testEndpoint('GET', '/api/system-metrics?limit=5');
    pass('System Metrics', `Returned ${metrics.length} metric samples`);
  } catch (error) {
    fail('System Metrics', error);
  }

  // 11. Process Metrics
  try {
    const metrics = await testEndpoint('GET', '/api/process-metrics/claude?limit=5');
    pass('Process Metrics', `Returned ${metrics.length} samples`);
  } catch (error) {
    warn('Process Metrics', 'No process metrics for claude');
  }

  // 12. Metrics Stats
  try {
    const stats = await testEndpoint('GET', '/api/metrics-stats');
    pass('Metrics Stats', `${stats.total_samples} total samples`);
  } catch (error) {
    fail('Metrics Stats', error);
  }

  // 13. Performance Correlations
  try {
    const corr = await testEndpoint('GET', '/api/performance-correlations');
    pass('Performance Correlations', 'Correlation data retrieved');
  } catch (error) {
    fail('Performance Correlations', error);
  }

  // 14. Tracked Files
  try {
    const files = await testEndpoint('GET', '/api/tracked-files');
    pass('Tracked Files', `${files.length} files tracked`);
  } catch (error) {
    fail('Tracked Files', error);
  }

  // 15. Events by Session
  try {
    const sessionData = await testEndpoint('GET', '/api/session-id');
    const events = await testEndpoint('GET', `/api/events-by-session/${sessionData.session_id}?limit=5`);
    pass('Events by Session', `Returned ${events.length} events`);
  } catch (error) {
    fail('Events by Session', error);
  }

  // 16. File Events (without diff)
  try {
    const events = await testEndpoint('GET', '/api/file-events?limit=5');
    pass('File Events (no diff)', `Returned ${events.length} events`);
    if (events.length > 0 && events[0].diff !== undefined) {
      warn('File Events', 'Diff included when it shouldn\'t be');
    }
  } catch (error) {
    fail('File Events', error);
  }

  // 17. File Events (with diff)
  try {
    const events = await testEndpoint('GET', '/api/file-events?limit=5&diff=true');
    pass('File Events (with diff)', `Returned ${events.length} events`);
  } catch (error) {
    fail('File Events (with diff)', error);
  }

  // 18. Snapshots
  try {
    const events = await testEndpoint('GET', '/api/file-events?limit=1');
    if (events.length > 0) {
      const snapshots = await testEndpoint('GET', `/api/snapshots/${encodeURIComponent(events[0].filepath)}`);
      pass('Snapshots API', `Returned ${snapshots.length} snapshots`);
    } else {
      warn('Snapshots API', 'No file events to test snapshots');
    }
  } catch (error) {
    warn('Snapshots API', error.message);
  }

  // 19. Triggers Config
  try {
    const config = await testEndpoint('GET', '/api/triggers-config');
    pass('Triggers Config', `${config.rules.length} rules configured`);
  } catch (error) {
    fail('Triggers Config', error);
  }

  // 20. Triggered Events
  try {
    const events = await testEndpoint('GET', '/api/triggered-events?limit=10');
    pass('Triggered Events', `Returned ${events.length} triggered events`);
  } catch (error) {
    fail('Triggered Events', error);
  }

  // 21. Trigger Stats
  try {
    const stats = await testEndpoint('GET', '/api/trigger-stats');
    pass('Trigger Stats', `${stats.total_triggers} total triggers`);
  } catch (error) {
    fail('Trigger Stats', error);
  }

  console.log('\n' + '='.repeat(60));
  console.log('POST ENDPOINT TESTS');
  console.log('='.repeat(60) + '\n');

  // 22. Telemetry Endpoint
  try {
    const result = await testEndpoint('POST', '/telemetry', 200, {
      agent: 'diagnostic-test',
      event: 'test',
      message: 'Diagnostic test event',
      file: null,
      lines_changed: null,
      duration_ms: 100
    });
    pass('Telemetry POST', `Event ID: ${result.event_id}`);
  } catch (error) {
    fail('Telemetry POST', error);
  }

  // 23. Triggers Reload
  try {
    const result = await testEndpoint('POST', '/api/triggers-reload');
    pass('Triggers Reload', result.message);
  } catch (error) {
    fail('Triggers Reload', error);
  }

  // 24. Triggers Clear Cooldowns
  try {
    const result = await testEndpoint('POST', '/api/triggers-clear-cooldowns');
    pass('Triggers Clear Cooldowns', result.message);
  } catch (error) {
    fail('Triggers Clear Cooldowns', error);
  }

  console.log('\n' + '='.repeat(60));
  console.log('DATA QUALITY CHECKS');
  console.log('='.repeat(60) + '\n');

  // 25. CPU Metrics Quality
  try {
    const metrics = await testEndpoint('GET', '/api/system-metrics?limit=10');
    const zeroCpu = metrics.filter(m => m.cpu === 0).length;
    if (zeroCpu === metrics.length) {
      fail('CPU Metrics Quality', 'All CPU readings are 0%');
    } else if (zeroCpu > metrics.length / 2) {
      warn('CPU Metrics Quality', `${zeroCpu}/${metrics.length} readings are 0%`);
    } else {
      pass('CPU Metrics Quality', `${metrics.length - zeroCpu}/${metrics.length} valid readings`);
    }
  } catch (error) {
    fail('CPU Metrics Quality', error);
  }

  // 26. Memory Metrics Quality
  try {
    const metrics = await testEndpoint('GET', '/api/system-metrics?limit=10');
    const zeroMem = metrics.filter(m => m.mem === 0).length;
    if (zeroMem === metrics.length) {
      fail('Memory Metrics Quality', 'All memory readings are 0%');
    } else {
      pass('Memory Metrics Quality', `${metrics.length - zeroMem}/${metrics.length} valid readings`);
    }
  } catch (error) {
    fail('Memory Metrics Quality', error);
  }

  console.log('\n' + '='.repeat(60));
  console.log('FINAL REPORT');
  console.log('='.repeat(60) + '\n');

  console.log(`✅ Passed: ${tests.passed.length}`);
  console.log(`❌ Failed: ${tests.failed.length}`);
  console.log(`⚠️  Warnings: ${tests.warnings.length}`);
  console.log(`\nTotal Tests: ${tests.passed.length + tests.failed.length + tests.warnings.length}`);

  const passRate = (tests.passed.length / (tests.passed.length + tests.failed.length) * 100).toFixed(1);
  console.log(`Pass Rate: ${passRate}%\n`);

  if (tests.failed.length > 0) {
    console.log('\n❌ FAILED TESTS:');
    tests.failed.forEach(t => console.log(`  - ${t.name}: ${t.error}`));
  }

  if (tests.warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:');
    tests.warnings.forEach(t => console.log(`  - ${t.name}: ${t.message}`));
  }

  console.log('\n' + '='.repeat(60));
  console.log('DIAGNOSTIC COMPLETE');
  console.log('='.repeat(60));

  return {
    passed: tests.passed.length,
    failed: tests.failed.length,
    warnings: tests.warnings.length,
    passRate: parseFloat(passRate),
    failures: tests.failed,
    warningsList: tests.warnings
  };
}

// Run diagnostics
runDiagnostics().catch(error => {
  console.error('\n💥 DIAGNOSTIC CRASHED:', error);
  process.exit(1);
});
