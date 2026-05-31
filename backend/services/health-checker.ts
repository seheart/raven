/**
 * HealthChecker - Comprehensive health checks for all Raven features
 *
 * This service validates that ALL features are working, not just basic connectivity.
 * Runs during startup to catch broken features before users encounter them.
 */

import type { RavenDB } from '../db.js';
import { logger } from '../utils/logger.js';

interface HealthCheckDefinition {
  name: string;
  fn: () => Promise<unknown>;
  critical: boolean;
}

interface HealthCheckResult {
  name: string;
  // 'skipped' = reachable but not asserted (needs a query param/auth, or
  // deliberately excluded) — distinct from 'passed' so the badge can't claim
  // coverage it didn't exercise.
  status: 'passed' | 'failed' | 'skipped';
  critical: boolean;
  duration: number;
  error: string | null;
  /** The GET path this result covers (for discovery-derived probes). */
  path?: string;
  /** Why a check was skipped/excluded, surfaced in the UI. */
  note?: string;
}

interface HealthCheckSummary {
  total: number;
  passed: number;
  failed: number;
  criticalFailed: number;
  warnings: number;
  // Honest coverage accounting, measured against the LIVE router rather than a
  // hardcoded list: how many GET endpoints exist, how many we actually probed,
  // how many were deliberately excluded, and how many were reachable-but-not-
  // asserted. `discovered` is null when route discovery itself failed.
  discovered: number | null;
  probed: number;
  excluded: number;
  skipped: number;
  results: HealthCheckResult[];
  healthy: boolean;
}

interface ConversationApiRow {
  timestamp?: string;
  last_activity?: string;
}

interface ConversationApiResponse {
  conversations?: ConversationApiRow[];
  error?: string;
  message?: string;
}

interface AgentEventRow {
  timestamp: string;
  event_type: string;
}

/**
 * Param-free GET /api routes we deliberately do NOT probe in the sweep, and
 * why. Surfaced in the report (as 'excluded') rather than silently dropped, so
 * coverage stays honest. Paths are matched after stripping a trailing slash.
 * The drift-guard test (health-checker.coverage.test) asserts every discovered
 * route is either probed or listed here — so adding a route forces a decision.
 */
export const EXCLUDED_GET_ROUTES: Record<string, string> = {
  '/api/health/comprehensive': 'the sweep itself — probing it would recurse',
  '/api/insights/preview': 'triggers on-demand LLM narration (expensive)',
  '/api/digests/weekly': 'triggers weekly digest generation (expensive)',
  '/api/export': 'full-data export — heavy payload',
  '/api/sync/export': 'full-data export — heavy payload'
};

/**
 * Critical infrastructure routes get an explicit payload validator (not just a
 * 2xx check) and fail the whole sweep if broken. Everything else is probed
 * generically via discovery.
 */
interface CriticalRoute {
  name: string;
  path: string;
  validate?: (data: unknown) => void;
}

const CRITICAL_ROUTES: CriticalRoute[] = [
  {
    name: 'Health Endpoint',
    path: '/api/health',
    validate: (d: any) => {
      // The endpoint working means it returns a status. 'degraded' is a valid
      // partial state (e.g. an optional subsystem like git is off) — only an
      // explicit failure status or a missing field is a real problem.
      if (!d || typeof d.status !== 'string') throw new Error('missing status field');
      if (['unhealthy', 'error', 'down', 'critical'].includes(d.status)) {
        throw new Error(`status is "${d.status}"`);
      }
    }
  },
  {
    name: 'Session ID',
    path: '/api/session-id',
    validate: (d: any) => {
      const id = d?.session_id ?? d?.sessionId ?? d?.id;
      if (!id) throw new Error('no session id in response');
    }
  },
  {
    name: 'Agent Events',
    path: '/api/agent-events?limit=1',
    validate: (d: any) => {
      const arr = Array.isArray(d) ? d : (d?.events ?? d?.agent_events);
      if (!Array.isArray(arr)) throw new Error('response is not an events array');
    }
  }
];

export class HealthChecker {
  /** Per-endpoint probe deadline. Keeps one hung route from stalling the sweep. */
  static readonly ENDPOINT_TIMEOUT_MS = 10000;

  /** Max simultaneous probes — the backend is single-threaded, so don't flood it. */
  static readonly PROBE_CONCURRENCY = 6;

  /** Run `task` over `items` with at most `limit` in flight at once. */
  private async runPooled<T>(
    items: T[],
    limit: number,
    task: (item: T) => Promise<void>
  ): Promise<void> {
    let cursor = 0;
    const worker = async () => {
      while (cursor < items.length) {
        const item = items[cursor++];
        await task(item);
      }
    };
    const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
    await Promise.all(workers);
  }

  private baseUrl: string;
  private db: RavenDB | null;
  private results: HealthCheckResult[];

  constructor(baseUrl = 'http://localhost:9100', db: RavenDB | null = null) {
    this.baseUrl = baseUrl;
    this.db = db;
    this.results = [];
  }

  /** Strip a trailing slash (except for a bare "/") for stable path matching. */
  private static normalizePath(p: string): string {
    const noQuery = p.split('?')[0];
    return noQuery.length > 1 ? noQuery.replace(/\/$/, '') : noQuery;
  }

  /**
   * Discover the live GET surface by introspecting the running router via
   * /api/system/routes (the same data the System → Routes page shows). Returns
   * the param-free GET routes under /api, normalized. Returns null if discovery
   * itself fails — the caller surfaces that as a critical failure rather than
   * silently reporting "full coverage".
   */
  private async discoverGetRoutes(): Promise<string[] | null> {
    try {
      const data = (await this.checkEndpoint('/api/system/routes')) as {
        routes?: Array<{ methods?: string[]; path?: string }>;
      };
      if (!Array.isArray(data?.routes)) return null;
      const seen = new Set<string>();
      for (const r of data.routes) {
        if (!r?.path || !Array.isArray(r.methods)) continue;
        if (!r.methods.includes('GET')) continue;
        if (!r.path.startsWith('/api')) continue;
        if (r.path.includes(':') || r.path.includes('*')) continue; // parameterized — can't blind-probe
        seen.add(HealthChecker.normalizePath(r.path));
      }
      return [...seen];
    } catch {
      return null;
    }
  }

  /**
   * Probe one discovered GET route and classify the outcome:
   *   passed  — 2xx with no error envelope, or a 3xx redirect (route is alive)
   *   skipped — 4xx / 501 (reachable but needs input, no data yet, or stubbed)
   *   failed  — 5xx, network error, timeout, or a 2xx error envelope
   * Routes come from discovery so they're known-registered — that's why a 404
   * is "no data yet" not "missing". This probes the whole surface without
   * false-reds on param-required routes, while still catching genuine breakage
   * (and the silent 200-with-error-envelope mode).
   */
  private async probeRoute(path: string): Promise<void> {
    const startTime = Date.now();
    const record = (status: 'passed' | 'failed' | 'skipped', error: string | null, note?: string) =>
      this.results.push({
        name: path,
        path,
        status,
        critical: false,
        duration: Date.now() - startTime,
        error,
        note
      });

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        // Don't follow redirects — a target may be expensive or recursive (the
        // /api/health-checks legacy alias 308s back to the comprehensive sweep
        // itself). The 3xx alone proves the route is alive.
        redirect: 'manual',
        signal: AbortSignal.timeout(HealthChecker.ENDPOINT_TIMEOUT_MS)
      });

      // A redirect proves the route is alive. With redirect:'manual', Node's
      // fetch yields an opaque response (type 'opaqueredirect', status 0)
      // rather than the 3xx status, so accept both forms.
      if (
        response.type === 'opaqueredirect' ||
        response.status === 0 ||
        (response.status >= 300 && response.status < 400)
      ) {
        record('passed', null, 'redirect — route alive');
        return;
      }
      // The route came from discovery, so it IS registered — a 404 here means
      // "no resource/data yet" (semantic), not "route missing". Treat 4xx and
      // 501-not-implemented as reachable-but-not-asserted rather than failures,
      // so param-required / no-data-yet / stubbed endpoints don't false-red.
      if (response.status === 401 || response.status === 403) {
        record('skipped', null, `HTTP ${response.status} — auth-gated`);
        return;
      }
      if (response.status === 404) {
        record('skipped', null, 'HTTP 404 — reachable, no data yet');
        return;
      }
      if (response.status === 501) {
        record('skipped', null, 'HTTP 501 — not implemented');
        return;
      }
      if (response.status >= 400 && response.status < 500) {
        record('skipped', null, `HTTP ${response.status} — reachable, needs input`);
        return;
      }
      if (!response.ok) {
        record('failed', `HTTP ${response.status}: ${response.statusText}`);
        return;
      }

      // 2xx — catch the silent "200 with an error envelope" failure mode.
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (data && typeof data.error === 'string' && data.error) {
        record('failed', `200 but error envelope: ${data.error}`);
        return;
      }
      record('passed', null);
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        record('failed', `Timed out after ${HealthChecker.ENDPOINT_TIMEOUT_MS}ms`);
      } else {
        record('failed', error instanceof Error ? error.message : String(error));
      }
    }
  }

  async runAll(): Promise<HealthCheckSummary> {
    logger.info('🏥 Starting comprehensive health checks...');
    this.results = [];

    // 1. Critical infrastructure — explicit payload validators, fail the sweep.
    const checks: HealthCheckDefinition[] = [
      ...CRITICAL_ROUTES.map(r => ({
        name: r.name,
        critical: true,
        fn: async () => {
          const data = await this.checkEndpoint(r.path);
          r.validate?.(data);
          return data;
        }
      })),
      // Custom (non-endpoint) check.
      {
        name: 'Conversation Data Freshness',
        fn: () => this.checkConversationFreshness(),
        critical: false
      }
    ];

    const checkPromises = checks.map(async check => {
      const startTime = Date.now();
      try {
        await check.fn();
        const duration = Date.now() - startTime;
        this.results.push({
          name: check.name,
          status: 'passed',
          critical: check.critical,
          duration,
          error: null
        });
        logger.info(`  ✅ ${check.name} (${duration}ms)`);
      } catch (error) {
        const duration = Date.now() - startTime;
        const message = error instanceof Error ? error.message : String(error);
        this.results.push({
          name: check.name,
          status: 'failed',
          critical: check.critical,
          duration,
          error: message
        });
        if (check.critical) {
          logger.error(`  ❌ ${check.name} - ${message}`);
        } else {
          logger.warn(`  ⚠️  ${check.name} - ${message}`);
        }
      }
    });

    await Promise.all(checkPromises);

    // 2. Discover the live GET surface and probe everything not already covered
    //    by a critical check or deliberately excluded. This is what makes
    //    coverage honest — it's measured against the real router, so a new
    //    route is exercised automatically instead of silently going unchecked.
    const discoveredRoutes = await this.discoverGetRoutes();
    let discovered: number | null = null;
    let excluded = 0;

    if (discoveredRoutes === null) {
      // Discovery is itself a critical capability — if it fails we can't claim
      // any coverage figure, so surface it loudly rather than reporting green.
      this.results.push({
        name: 'Route Discovery',
        status: 'failed',
        critical: true,
        duration: 0,
        error: 'Could not enumerate routes via /api/system/routes'
      });
    } else {
      discovered = discoveredRoutes.length;
      const covered = new Set(CRITICAL_ROUTES.map(r => HealthChecker.normalizePath(r.path)));
      const toProbe: string[] = [];
      for (const route of discoveredRoutes) {
        if (covered.has(route)) continue; // already validated as a critical check
        const reason = EXCLUDED_GET_ROUTES[route];
        if (reason) {
          excluded += 1;
          this.results.push({
            name: route,
            path: route,
            status: 'skipped',
            critical: false,
            duration: 0,
            error: null,
            note: `excluded: ${reason}`
          });
          continue;
        }
        toProbe.push(route);
      }
      // Cap concurrency: the backend is single-threaded (Node + SQLite) and
      // firing 100+ requests at once causes a thundering herd that times out
      // legitimately-working-but-slow endpoints. A small pool keeps the sweep
      // representative of real load.
      await this.runPooled(toProbe, HealthChecker.PROBE_CONCURRENCY, route =>
        this.probeRoute(route)
      );
    }

    const passed = this.results.filter(r => r.status === 'passed').length;
    const failed = this.results.filter(r => r.status === 'failed').length;
    const skipped = this.results.filter(r => r.status === 'skipped').length;
    const criticalFailed = this.results.filter(r => r.status === 'failed' && r.critical).length;
    const warnings = this.results.filter(r => r.status === 'failed' && !r.critical).length;
    const probed = this.results.filter(r => r.path && r.status !== 'skipped').length;

    const summary: HealthCheckSummary = {
      total: this.results.length,
      passed,
      failed,
      criticalFailed,
      warnings,
      discovered,
      probed,
      excluded,
      skipped,
      results: this.results,
      healthy: criticalFailed === 0
    };

    logger.info('');
    logger.info('🏥 Health Check Summary:');
    logger.info(`  ✅ Passed: ${passed}/${this.results.length}`);
    if (discovered !== null) {
      logger.info(
        `  🔭 GET routes discovered: ${discovered} (probed ${probed}, excluded ${excluded})`
      );
    }
    if (criticalFailed > 0) {
      logger.error(`  ❌ Critical Failures: ${criticalFailed}`);
    }
    if (warnings > 0) {
      logger.warn(`  ⚠️  Warnings: ${warnings}`);
    }
    logger.info('');

    if (!summary.healthy) {
      logger.error('❌ HEALTH CHECK FAILED - Critical features are broken!');
      logger.error('   Review errors above and fix before deployment.');
    } else if (warnings > 0) {
      logger.warn('⚠️  Health check passed with warnings - Some features may not work.');
    } else {
      logger.info('✅ All health checks passed - System is fully operational!');
    }

    return summary;
  }

  async checkEndpoint(path: string): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    // Bound every probe. runAll() awaits Promise.all over all checks, and the
    // /api/health/comprehensive route is deliberately exempt from the 30s
    // global timeout — so without a per-request deadline a single hung endpoint
    // (e.g. the Ollama proxy blocking) would stall the whole sweep and the
    // route indefinitely. A timeout surfaces the hang as a real failed check
    // instead of masking it.
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(HealthChecker.ENDPOINT_TIMEOUT_MS)
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new Error(`Timed out after ${HealthChecker.ENDPOINT_TIMEOUT_MS}ms`);
      }
      throw error;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as { error?: string };

    // Catch the "200 with an error envelope" silent-failure mode. We key only
    // off a truthy top-level `error` — the old `message.includes('not
    // available')` heuristic was brittle (false-failed any route whose body
    // legitimately contained that phrase, and missed differently-worded ones).
    if (data && typeof data.error === 'string' && data.error) {
      throw new Error(data.error);
    }

    return data;
  }

  async checkConversationFreshness(): Promise<void> {
    if (!this.db) {
      const data = (await this.checkEndpoint(
        '/api/conversations?limit=1'
      )) as ConversationApiResponse;
      if (data.conversations && data.conversations.length > 0) {
        const mostRecent = data.conversations[0];
        const ts = mostRecent.timestamp || mostRecent.last_activity;
        if (!ts) return;
        const conversationTime = new Date(ts);
        const now = new Date();
        const hoursSinceLastConversation =
          (now.getTime() - conversationTime.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastConversation > 24) {
          throw new Error(
            `Stale conversation data (last: ${hoursSinceLastConversation.toFixed(1)} hours ago). ` +
              'Conversation sync may not be working.'
          );
        }
      }
      return;
    }

    // Note: previous .js version called this.db.prepareStatement(...) which
    // does not exist on RavenDB — that path threw silently and was logged as
    // a failed warning. Use the actual better-sqlite3 wrapped instance.
    const stmt = this.db.db.prepare<unknown[], AgentEventRow>(`
      SELECT timestamp, event_type
      FROM agent_events
      ORDER BY timestamp DESC
      LIMIT 1
    `);
    const mostRecent = stmt.get();

    if (!mostRecent) {
      logger.info('  ℹ️  No conversations found (new installation)');
      return;
    }

    const conversationTime = new Date(mostRecent.timestamp);
    const now = new Date();
    const hoursSinceLastConversation =
      (now.getTime() - conversationTime.getTime()) / (1000 * 60 * 60);

    if (hoursSinceLastConversation > 24) {
      throw new Error(
        `Stale conversation data (last: ${mostRecent.timestamp}, ` +
          `${hoursSinceLastConversation.toFixed(1)} hours ago). ` +
          'Conversation sync may not be working.'
      );
    }

    logger.info(`  ℹ️  Last conversation: ${hoursSinceLastConversation.toFixed(1)} hours ago`);
  }

  getResults(): HealthCheckResult[] {
    return this.results;
  }

  isHealthy(): boolean {
    const criticalFailed = this.results.filter(r => r.status === 'failed' && r.critical).length;
    return criticalFailed === 0;
  }
}
