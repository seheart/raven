/**
 * No-silent-failures response interceptor.
 *
 * Some handlers respond with HTTP 200 but a JSON body like
 *   { error: "fetch failed", models: [] }
 * because the upstream call (Ollama, an external service) errored but they
 * didn't want to crash the page. Result: the frontend sees a successful
 * 200, renders empty, and the user sees a silent dead section. The IPv6
 * trap on /api/system/models was a textbook example of this.
 *
 * This middleware intercepts `res.json` calls and, when the body has a
 * top-level `error` (and nothing else useful) on a 2xx response, rewrites
 * the status code to 5xx so:
 *   - apiClient's error path triggers and surfaces the toast/log
 *   - <DataFetchError> banners on each page show the failure
 *   - HealthChecker counts it as a fail (it already detects this body
 *     shape, but only when it bothered to fetch — now everyone does)
 *
 * Endpoints that legitimately want to return 200 with a non-fatal error
 * field (rare) can opt out by setting `res.locals.allowSoftError = true`
 * before responding.
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

interface ErrorShape {
  error?: unknown;
  // Optional sibling: when present, treat the response as "data with a
  // warning" instead of a hard fail. Most callers don't set this.
  message?: unknown;
}

export function noSilentFailures(req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    // Only consider success responses. 4xx/5xx already broadcasts failure.
    const status = res.statusCode;
    if (status < 200 || status >= 300) return originalJson(body);
    if (res.locals.allowSoftError) return originalJson(body);

    if (body && typeof body === 'object' && !Array.isArray(body)) {
      const obj = body as ErrorShape;
      const hasError = typeof obj.error === 'string' && obj.error.length > 0;
      if (hasError) {
        // Promote to a real failure so downstream consumers (apiClient,
        // health checks) treat it like one. 502 reflects the typical case
        // — an upstream/dependency call failed, not the request itself.
        logger.warn(
          `[no-silent-failures] Promoting ${req.method} ${req.path} from 200 to 502 (body.error="${obj.error}")`
        );
        res.status(502);
      }
    }
    return originalJson(body);
  };
  next();
}
