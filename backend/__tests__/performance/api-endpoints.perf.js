/**
 * API Performance Tests
 * Tests high-traffic endpoints for performance and throughput
 */
import autocannon from 'autocannon';

const BASE_URL = process.env.API_URL || 'http://localhost:9100';

// Performance budgets (all times in ms)
const PERFORMANCE_BUDGETS = {
  p50: 50, // 50ms for median response time
  p95: 200, // 200ms for 95th percentile
  p99: 500, // 500ms for 99th percentile
  minThroughput: 100 // Minimum 100 req/sec
};

/**
 * Run performance test for an endpoint
 */
async function testEndpoint(name, url, method = 'GET', body = null) {
  console.log('\n📊 Testing ' + name + '...');

  const options = {
    url: BASE_URL + url,
    method,
    duration: 10,
    connections: 10,
    pipelining: 1
  };

  if (body) {
    options.body = JSON.stringify(body);
    options.headers = {
      'Content-Type': 'application/json'
    };
  }

  try {
    const result = await autocannon(options);

    const p50 = result.latency.p50;
    const p95 = result.latency.p95;
    const p99 = result.latency.p99;
    const throughput = result.requests.average;

    const passed = {
      p50: p50 <= PERFORMANCE_BUDGETS.p50,
      p95: p95 <= PERFORMANCE_BUDGETS.p95,
      p99: p99 <= PERFORMANCE_BUDGETS.p99,
      throughput: throughput >= PERFORMANCE_BUDGETS.minThroughput
    };

    console.log('  P50 Latency: ' + p50 + 'ms ' + (passed.p50 ? '✓' : '✗'));
    console.log('  P95 Latency: ' + p95 + 'ms ' + (passed.p95 ? '✓' : '✗'));
    console.log('  P99 Latency: ' + p99 + 'ms ' + (passed.p99 ? '✓' : '✗'));
    console.log(
      '  Throughput: ' + throughput.toFixed(2) + ' req/sec ' + (passed.throughput ? '✓' : '✗')
    );
    console.log('  Total Requests: ' + result.requests.total);

    const allPassed = Object.values(passed).every(p => p);

    return {
      name,
      passed: allPassed,
      metrics: { p50, p95, p99, throughput },
      budgets: passed
    };
  } catch (error) {
    console.error('  ✗ Failed: ' + error.message);
    return {
      name,
      passed: false,
      error: error.message
    };
  }
}

async function runPerformanceTests() {
  console.log('🚀 Starting API Performance Tests');

  const results = [];

  results.push(await testEndpoint('GET /api/status', '/api/status'));
  results.push(await testEndpoint('GET /api/health', '/api/health'));
  results.push(await testEndpoint('GET /api/events', '/api/events'));
  results.push(await testEndpoint('GET /api/errors', '/api/errors'));
  results.push(await testEndpoint('GET /api/notifications', '/api/notifications'));
  results.push(await testEndpoint('GET /api/endpoints', '/api/endpoints'));

  console.log('\n📈 Performance Test Summary');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log('\nTotal Tests: ' + results.length);
  console.log('Passed: ' + passed + ' ✓');
  console.log('Failed: ' + failed + ' ✗');

  if (failed > 0) {
    console.log('\n❌ Some performance tests did not meet budgets');
    process.exit(1);
  } else {
    console.log('\n✅ All performance tests passed!');
    process.exit(0);
  }
}

runPerformanceTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
