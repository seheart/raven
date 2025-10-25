/**
 * Application configuration
 * Load from environment variables with fallback defaults
 */
export const config = {
    // Server
    PORT: parseInt(process.env.PORT) || 3030,
    CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
    // Payload limits
    JSON_LIMIT: process.env.JSON_PAYLOAD_LIMIT || '10mb',
    // Logging
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    // Cache
    MAX_CACHE_SIZE: 1000,
    HEALTH_CACHE_TTL: 5000, // 5 seconds
    // Compression
    COMPRESSION_THRESHOLD: 1024, // Only compress responses > 1KB
    COMPRESSION_LEVEL: 6, // 0-9, 6 is balanced
    // Snapshots
    SNAPSHOT_TTL_DAYS: parseInt(process.env.SNAPSHOT_TTL_DAYS) || 30,
    // File watching
    DEBOUNCE_MS: 100,
    // Security
    DISABLE_AUTH: process.env.DISABLE_AUTH === 'true'
};
//# sourceMappingURL=index.js.map