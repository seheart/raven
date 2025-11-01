/**
 * Metrics Collection Middleware
 * Prometheus-compatible metrics for observability
 */

import { env } from '../config/environment.js';
import onFinished from 'on-finished';

/**
 * Metrics storage
 */
const metrics = {
  // HTTP metrics
  httpRequestsTotal: new Map(),
  httpRequestDuration: [],
  httpRequestsInFlight: 0,

  // Telemetry metrics
  telemetryEventsTotal: 0,
  telemetryEventsPerAgent: new Map(),
  telemetryProcessingDuration: [],

  // Database metrics
  dbQueriesTotal: 0,
  dbQueryDuration: [],

  // Cache metrics
  cacheHits: 0,
  cacheMisses: 0,

  // System metrics
  startTime: Date.now(),
  errors: new Map(),

  // Cache for sorted arrays (invalidated on data change)
  _sortedCache: {
    http: null,
    telemetry: null,
    db: null,
    httpDirty: true,
    telemetryDirty: true,
    dbDirty: true
  }
};

/**
 * Normalize path to prevent unbounded Map growth
 * @param {string} path - Request path
 * @returns {string} Normalized path
 */
function normalizePath(path) {
  // Guard against non-string paths (defensive programming)
  if (!path || typeof path !== 'string') {
    return '/unknown';
  }

  // Replace UUIDs with :id
  let normalized = path.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id');

  // Replace numeric IDs (e.g., /users/123 -> /users/:id)
  normalized = normalized.replace(/\/\d+/g, '/:id');

  // Replace MongoDB ObjectIds
  normalized = normalized.replace(/\/[0-9a-f]{24}/g, '/:id');

  // Limit path length to prevent extremely long paths
  if (normalized.length > 200) {
    normalized = normalized.substring(0, 200) + '...';
  }

  return normalized;
}

/**
 * HTTP metrics middleware
 */
export function metricsMiddleware(req, res, next) {
  // Keep a runtime flag in sync with current env to help routes decide at request-time
  metricsEnabledFlag = !!env.ENABLE_METRICS;
  if (!metricsEnabledFlag) {
    return next();
  }

  const startTime = Date.now();
  metrics.httpRequestsInFlight++;

  // Use on-finished to handle response completion
  onFinished(res, () => {
    // Calculate duration
    const duration = Date.now() - startTime;

    // Record metrics with normalized path
    const normalizedPath = normalizePath(req.path);
    const key = `${req.method}_${normalizedPath}_${res.statusCode}`;
    metrics.httpRequestsTotal.set(key, (metrics.httpRequestsTotal.get(key) || 0) + 1);
    metrics.httpRequestDuration.push(duration);
    metrics.httpRequestsInFlight--;
    metrics._sortedCache.httpDirty = true;

    // Keep duration array bounded (trim to 900 when reaching 1000)
    if (metrics.httpRequestDuration.length > 1000) {
      metrics.httpRequestDuration = metrics.httpRequestDuration.slice(-900);
    }
  });

  next();
}

// Runtime metrics enabled flag, updated on each request by the middleware above
let metricsEnabledFlag = !!env.ENABLE_METRICS;

export function isMetricsEnabled() {
  return metricsEnabledFlag;
}

/**
 * Record telemetry event metric
 */
export function recordTelemetryEvent(agent, durationMs) {
  if (!env.ENABLE_METRICS) return;

  metrics.telemetryEventsTotal++;

  const agentCount = metrics.telemetryEventsPerAgent.get(agent) || 0;
  metrics.telemetryEventsPerAgent.set(agent, agentCount + 1);

  metrics.telemetryProcessingDuration.push(durationMs);
  metrics._sortedCache.telemetryDirty = true;

  // Keep duration array bounded (trim to 900 when reaching 1000)
  if (metrics.telemetryProcessingDuration.length > 1000) {
    metrics.telemetryProcessingDuration = metrics.telemetryProcessingDuration.slice(-900);
  }
}

/**
 * Record database query metric
 */
export function recordDbQuery(durationMs) {
  if (!env.ENABLE_METRICS) return;

  metrics.dbQueriesTotal++;
  metrics.dbQueryDuration.push(durationMs);
  metrics._sortedCache.dbDirty = true;

  // Keep duration array bounded (trim to 900 when reaching 1000)
  if (metrics.dbQueryDuration.length > 1000) {
    metrics.dbQueryDuration = metrics.dbQueryDuration.slice(-900);
  }
}

/**
 * Record cache hit/miss
 */
export function recordCacheHit(hit) {
  if (!env.ENABLE_METRICS) return;

  if (hit) {
    metrics.cacheHits++;
  } else {
    metrics.cacheMisses++;
  }
}

/**
 * Record error
 */
export function recordError(errorType) {
  if (!env.ENABLE_METRICS) return;

  const count = metrics.errors.get(errorType) || 0;
  metrics.errors.set(errorType, count + 1);
}

/**
 * Calculate percentile from cached sorted array
 * @param {Array} arr - Array to calculate percentile from
 * @param {number} p - Percentile (0-100)
 * @param {string} cacheKey - Cache key (http, telemetry, db)
 * @returns {number} Percentile value
 */
function percentile(arr, p, cacheKey) {
  if (arr.length === 0) return 0;

  // Use cached sorted array if available and not dirty
  let sorted;
  const dirtyKey = `${cacheKey}Dirty`;

  if (metrics._sortedCache[dirtyKey]) {
    // Cache is dirty - need to sort and update cache
    sorted = [...arr].sort((a, b) => a - b);
    metrics._sortedCache[cacheKey] = sorted;
    metrics._sortedCache[dirtyKey] = false;
  } else if (metrics._sortedCache[cacheKey]) {
    // Cache is clean and available - use it
    sorted = metrics._sortedCache[cacheKey];
  } else {
    // First time calculation - cache not populated yet
    sorted = [...arr].sort((a, b) => a - b);
    metrics._sortedCache[cacheKey] = sorted;
    metrics._sortedCache[dirtyKey] = false;
  }

  const index = Math.ceil((sorted.length * p) / 100) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * Calculate average
 */
function average(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * Get all metrics in Prometheus format
 */
export function getMetricsPrometheus() {
  const uptime = (Date.now() - metrics.startTime) / 1000;

  const lines = [];

  // System metrics
  lines.push('# HELP raven_uptime_seconds System uptime in seconds');
  lines.push('# TYPE raven_uptime_seconds gauge');
  lines.push(`raven_uptime_seconds ${uptime.toFixed(2)}`);
  lines.push('');

  // HTTP request total
  lines.push('# HELP raven_http_requests_total Total number of HTTP requests');
  lines.push('# TYPE raven_http_requests_total counter');
  for (const [key, count] of metrics.httpRequestsTotal.entries()) {
    const [method, path, status] = key.split('_');
    lines.push(`raven_http_requests_total{method="${method}",path="${path}",status="${status}"} ${count}`);
  }
  lines.push('');

  // HTTP requests in flight
  lines.push('# HELP raven_http_requests_in_flight Current number of HTTP requests being processed');
  lines.push('# TYPE raven_http_requests_in_flight gauge');
  lines.push(`raven_http_requests_in_flight ${metrics.httpRequestsInFlight}`);
  lines.push('');

  // HTTP request duration
  if (metrics.httpRequestDuration.length > 0) {
    lines.push('# HELP raven_http_request_duration_ms HTTP request duration in milliseconds');
    lines.push('# TYPE raven_http_request_duration_ms summary');
    lines.push(`raven_http_request_duration_ms{quantile="0.5"} ${percentile(metrics.httpRequestDuration, 50, 'http').toFixed(2)}`);
    lines.push(`raven_http_request_duration_ms{quantile="0.9"} ${percentile(metrics.httpRequestDuration, 90, 'http').toFixed(2)}`);
    lines.push(`raven_http_request_duration_ms{quantile="0.99"} ${percentile(metrics.httpRequestDuration, 99, 'http').toFixed(2)}`);
    lines.push(`raven_http_request_duration_ms_sum ${metrics.httpRequestDuration.reduce((a, b) => a + b, 0).toFixed(2)}`);
    lines.push(`raven_http_request_duration_ms_count ${metrics.httpRequestDuration.length}`);
    lines.push('');
  }

  // Telemetry metrics
  lines.push('# HELP raven_telemetry_events_total Total number of telemetry events processed');
  lines.push('# TYPE raven_telemetry_events_total counter');
  lines.push(`raven_telemetry_events_total ${metrics.telemetryEventsTotal}`);
  lines.push('');

  lines.push('# HELP raven_telemetry_events_by_agent Number of events by agent');
  lines.push('# TYPE raven_telemetry_events_by_agent counter');
  for (const [agent, count] of metrics.telemetryEventsPerAgent.entries()) {
    lines.push(`raven_telemetry_events_by_agent{agent="${agent}"} ${count}`);
  }
  lines.push('');

  // Database metrics
  lines.push('# HELP raven_db_queries_total Total number of database queries');
  lines.push('# TYPE raven_db_queries_total counter');
  lines.push(`raven_db_queries_total ${metrics.dbQueriesTotal}`);
  lines.push('');

  // Cache metrics
  const cacheTotal = metrics.cacheHits + metrics.cacheMisses;
  const cacheHitRate = cacheTotal > 0 ? (metrics.cacheHits / cacheTotal * 100).toFixed(2) : 0;

  lines.push('# HELP raven_cache_hits_total Total number of cache hits');
  lines.push('# TYPE raven_cache_hits_total counter');
  lines.push(`raven_cache_hits_total ${metrics.cacheHits}`);
  lines.push('');

  lines.push('# HELP raven_cache_misses_total Total number of cache misses');
  lines.push('# TYPE raven_cache_misses_total counter');
  lines.push(`raven_cache_misses_total ${metrics.cacheMisses}`);
  lines.push('');

  lines.push('# HELP raven_cache_hit_rate_percent Cache hit rate percentage');
  lines.push('# TYPE raven_cache_hit_rate_percent gauge');
  lines.push(`raven_cache_hit_rate_percent ${cacheHitRate}`);
  lines.push('');

  // Error metrics
  lines.push('# HELP raven_errors_total Total number of errors by type');
  lines.push('# TYPE raven_errors_total counter');
  for (const [errorType, count] of metrics.errors.entries()) {
    lines.push(`raven_errors_total{type="${errorType}"} ${count}`);
  }
  lines.push('');

  return lines.join('\n');
}

/**
 * Get metrics as JSON (for internal dashboard)
 */
export function getMetricsJson() {
  const uptime = (Date.now() - metrics.startTime) / 1000;

  return {
    system: {
      uptime: uptime.toFixed(2),
      startTime: new Date(metrics.startTime).toISOString()
    },
    http: {
      requestsTotal: Array.from(metrics.httpRequestsTotal.entries()).reduce((acc, [, count]) => acc + count, 0),
      requestsInFlight: metrics.httpRequestsInFlight,
      avgDuration: average(metrics.httpRequestDuration).toFixed(2),
      p50Duration: percentile(metrics.httpRequestDuration, 50, 'http').toFixed(2),
      p90Duration: percentile(metrics.httpRequestDuration, 90, 'http').toFixed(2),
      p99Duration: percentile(metrics.httpRequestDuration, 99, 'http').toFixed(2),
      byRoute: Object.fromEntries(metrics.httpRequestsTotal)
    },
    telemetry: {
      eventsTotal: metrics.telemetryEventsTotal,
      avgProcessingTime: average(metrics.telemetryProcessingDuration).toFixed(2),
      byAgent: Object.fromEntries(metrics.telemetryEventsPerAgent)
    },
    database: {
      queriesTotal: metrics.dbQueriesTotal,
      avgQueryTime: average(metrics.dbQueryDuration).toFixed(2)
    },
    cache: {
      hits: metrics.cacheHits,
      misses: metrics.cacheMisses,
      hitRate: ((metrics.cacheHits / (metrics.cacheHits + metrics.cacheMisses || 1)) * 100).toFixed(2)
    },
    errors: Object.fromEntries(metrics.errors)
  };
}

/**
 * Reset metrics (for testing)
 */
export function resetMetrics() {
  metrics.httpRequestsTotal.clear();
  metrics.httpRequestDuration = [];
  metrics.httpRequestsInFlight = 0;
  metrics.telemetryEventsTotal = 0;
  metrics.telemetryEventsPerAgent.clear();
  metrics.telemetryProcessingDuration = [];
  metrics.dbQueriesTotal = 0;
  metrics.dbQueryDuration = [];
  metrics.cacheHits = 0;
  metrics.cacheMisses = 0;
  metrics.startTime = Date.now();
  metrics.errors.clear();
  metrics._sortedCache = {
    http: null,
    telemetry: null,
    db: null,
    httpDirty: true,
    telemetryDirty: true,
    dbDirty: true
  };
}
