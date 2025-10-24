/**
 * Configure Helmet for security headers
 */
export function setupHelmet(): (req: import("http").IncomingMessage, res: import("http").ServerResponse, next: (err?: unknown) => void) => void;
/**
 * Request logging middleware
 */
export function requestLogger(req: any, res: any, next: any): void;
/**
 * Error handler middleware
 */
export function errorHandler(err: any, req: any, res: any, next: any): void;
/**
 * 404 handler
 */
export function notFoundHandler(req: any, res: any): void;
/**
 * CORS configuration for production
 */
export function setupCORS(allowedOrigins: any): {
    origin: (origin: any, callback: any) => any;
    credentials: boolean;
    methods: string[];
    allowedHeaders: string[];
};
/**
 * Request size limiter
 */
export function setupRequestSizeLimit(): {
    json: {
        limit: string;
    };
    urlencoded: {
        limit: string;
        extended: boolean;
    };
};
/**
 * General API rate limiter
 * Limits: 100 requests per 15 minutes per IP
 */
export const apiLimiter: import("express-rate-limit").RateLimitRequestHandler;
/**
 * Authentication rate limiter (stricter)
 * Limits: 5 login attempts per 15 minutes per IP
 */
export const authLimiter: import("express-rate-limit").RateLimitRequestHandler;
/**
 * Telemetry endpoint rate limiter
 * Limits: 1000 requests per minute (high volume expected)
 */
export const telemetryLimiter: import("express-rate-limit").RateLimitRequestHandler;
/**
 * Write operations rate limiter (create, update, delete)
 * Limits: 50 requests per 15 minutes per IP
 */
export const writeLimiter: import("express-rate-limit").RateLimitRequestHandler;
//# sourceMappingURL=security.d.ts.map