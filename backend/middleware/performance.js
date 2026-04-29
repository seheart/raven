/**
 * Performance Monitoring Middleware
 * Tracks request duration and logs slow requests
 */

const SLOW_REQUEST_THRESHOLD_MS = 1000; // Log requests slower than 1 second

export function performanceMonitoring(req, res, next) {
  const startTime = Date.now();
  const originalJson = res.json.bind(res);

  // Override res.json to capture response time
  res.json = function (data) {
    const duration = Date.now() - startTime;

    // Log slow requests
    if (duration > SLOW_REQUEST_THRESHOLD_MS) {
      console.warn(
        `[Performance] Slow request: ${req.method} ${req.originalUrl || req.url} - ${duration}ms`
      );
    }

    // Add performance headers
    res.setHeader('X-Response-Time', `${duration}ms`);
    res.setHeader('X-Request-ID', req.headers['x-request-id'] || 'unknown');

    return originalJson(data);
  };

  next();
}
