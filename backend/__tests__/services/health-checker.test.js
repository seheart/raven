/**
 * HealthChecker — discovery-based endpoint coverage.
 *
 * The sweep discovers the live GET surface from /api/system/routes and probes
 * everything not covered by a critical check or deliberately excluded. These
 * tests pin the classification rules (so param-required / no-data / stubbed
 * routes never false-red) and the drift guarantee (a newly-added route is
 * probed automatically rather than silently going unchecked).
 *
 * Runs against the compiled output (jest has no TS transform), so `npm run
 * build` must be current.
 */

import { describe, it, expect, beforeAll, jest } from '@jest/globals';
import { HealthChecker, EXCLUDED_GET_ROUTES } from '../../dist/services/health-checker.js';

// Minimal fetch Response stand-in.
function res(status, body = {}, { type = 'default' } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `HTTP ${status}`,
    type,
    json: async () => body
  };
}

// An opaque redirect — what Node's fetch yields for a 3xx under redirect:'manual'.
const opaqueRedirect = {
  ok: false,
  status: 0,
  statusText: '',
  type: 'opaqueredirect',
  json: async () => ({})
};

const ROUTES = [
  // critical (covered by explicit checks + validators)
  { methods: ['GET'], path: '/api/health' },
  { methods: ['GET'], path: '/api/session-id' },
  { methods: ['GET'], path: '/api/agent-events' },
  // excluded (with reasons)
  { methods: ['GET'], path: '/api/health/comprehensive' },
  { methods: ['GET'], path: '/api/insights/preview' },
  { methods: ['GET'], path: '/api/export/' }, // trailing slash → normalizes to /api/export
  // probed — one per classification outcome
  { methods: ['GET'], path: '/api/dashboard-stats' }, // 200 → passed
  { methods: ['GET'], path: '/api/broken-500' }, // 500 → failed
  { methods: ['GET'], path: '/api/silent-error' }, // 200 + error envelope → failed
  { methods: ['GET'], path: '/api/needs-input' }, // 400 → skipped
  { methods: ['GET'], path: '/api/no-data' }, // 404 → skipped (known route, no data)
  { methods: ['GET'], path: '/api/not-impl' }, // 501 → skipped
  { methods: ['GET'], path: '/api/redirector' }, // 3xx → passed (alive)
  { methods: ['GET'], path: '/api/conversations' }, // 200 → passed (also the freshness fallback)
  { methods: ['GET'], path: '/api/system/routes' }, // the discovery endpoint itself
  // must NOT be probed:
  { methods: ['GET'], path: '/api/event/:id' }, // parameterized
  { methods: ['POST'], path: '/api/something' }, // non-GET
  { methods: ['GET'], path: '/health' } // outside /api
];

function mockFetch(url) {
  const path = url.replace('http://test', '').split('?')[0];
  switch (path) {
    case '/api/system/routes':
      return res(200, { routes: ROUTES });
    case '/api/health':
      return res(200, { status: 'degraded' }); // valid partial state, not a failure
    case '/api/session-id':
      return res(200, { session_id: 'abc-123' });
    case '/api/agent-events':
      return res(200, []);
    case '/api/conversations':
      return res(200, { conversations: [] });
    case '/api/dashboard-stats':
      return res(200, { ok: true });
    case '/api/broken-500':
      return res(500);
    case '/api/silent-error':
      return res(200, { error: 'something failed silently' });
    case '/api/needs-input':
      return res(400);
    case '/api/no-data':
      return res(404);
    case '/api/not-impl':
      return res(501);
    case '/api/redirector':
      return opaqueRedirect;
    default:
      throw new Error(`unexpected probe: ${path}`);
  }
}

describe('HealthChecker discovery sweep', () => {
  let summary;

  beforeAll(async () => {
    global.fetch = jest.fn(url => Promise.resolve(mockFetch(url)));
    const checker = new HealthChecker('http://test', null);
    summary = await checker.runAll();
  });

  const byName = name => summary.results.find(r => r.name === name);

  it('discovers only param-free GET /api routes', () => {
    // 15 of the 18 mock routes qualify (param/non-GET/non-api excluded).
    expect(summary.discovered).toBe(15);
    expect(byName('/api/event/:id')).toBeUndefined();
    expect(byName('/api/something')).toBeUndefined();
    expect(byName('/health')).toBeUndefined();
  });

  it('excludes configured routes with a surfaced reason (not silently)', () => {
    expect(summary.excluded).toBe(3);
    for (const path of ['/api/health/comprehensive', '/api/insights/preview', '/api/export']) {
      const r = byName(path);
      expect(r.status).toBe('skipped');
      expect(r.note).toContain('excluded');
      expect(EXCLUDED_GET_ROUTES[path]).toBeDefined();
    }
  });

  it('classifies a 200 as passed and a 200-with-error-envelope as failed', () => {
    expect(byName('/api/dashboard-stats').status).toBe('passed');
    const silent = byName('/api/silent-error');
    expect(silent.status).toBe('failed');
    expect(silent.error).toMatch(/error envelope/i);
  });

  it('classifies 5xx as failed but 4xx/501/redirect as non-failures', () => {
    expect(byName('/api/broken-500').status).toBe('failed');
    expect(byName('/api/needs-input').status).toBe('skipped'); // 400
    expect(byName('/api/no-data').status).toBe('skipped'); // 404 = no data, not missing
    expect(byName('/api/not-impl').status).toBe('skipped'); // 501
    expect(byName('/api/redirector').status).toBe('passed'); // 3xx = alive
  });

  it('accepts a "degraded" health status as a passing critical check', () => {
    const health = byName('Health Endpoint');
    expect(health.status).toBe('passed');
    expect(health.critical).toBe(true);
  });

  it('reports healthy when no CRITICAL check failed, even with non-critical failures', () => {
    expect(summary.criticalFailed).toBe(0);
    expect(summary.healthy).toBe(true);
    expect(summary.failed).toBe(2); // the 500 and the silent-error envelope
  });

  it('auto-probes a newly-discovered route (no silent drift)', () => {
    // /api/dashboard-stats is not in any hardcoded list — it is probed purely
    // because discovery found it. This is the drift guarantee.
    const r = byName('/api/dashboard-stats');
    expect(r.path).toBe('/api/dashboard-stats');
    expect(r.status).toBe('passed');
  });
});

describe('HealthChecker when route discovery fails', () => {
  it('surfaces a critical failure instead of reporting green', async () => {
    global.fetch = jest.fn(url => {
      const path = url.replace('http://test', '').split('?')[0];
      if (path === '/api/system/routes') return Promise.reject(new Error('boom'));
      // criticals still answer so only discovery is broken
      if (path === '/api/health') return Promise.resolve(res(200, { status: 'healthy' }));
      if (path === '/api/session-id') return Promise.resolve(res(200, { session_id: 'x' }));
      if (path === '/api/agent-events') return Promise.resolve(res(200, []));
      if (path === '/api/conversations') return Promise.resolve(res(200, { conversations: [] }));
      return Promise.resolve(res(200, {}));
    });
    const checker = new HealthChecker('http://test', null);
    const summary = await checker.runAll();
    expect(summary.discovered).toBeNull();
    const discovery = summary.results.find(r => r.name === 'Route Discovery');
    expect(discovery.status).toBe('failed');
    expect(discovery.critical).toBe(true);
    expect(summary.healthy).toBe(false);
  });
});
