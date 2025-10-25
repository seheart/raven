/**
 * Add entry to file cache with LRU eviction
 * @param {string} key - File path
 * @param {string} value - File content
 */
export function addToFileCache(key: string, value: string): void;
/**
 * Update health cache
 * @param {object} data - Health data to cache
 */
export function updateHealthCache(data: object): void;
/**
 * Get health cache if still valid
 * @returns {object|null} - Cached health data or null if expired
 */
export function getHealthCache(): object | null;
/**
 * Clear file cache
 */
export function clearFileCache(): void;
/**
 * Cache utilities for file content and health endpoints
 */
export const fileCache: Map<any, any>;
export const MAX_CACHE_SIZE: 1000;
export namespace healthCache {
    let data: null;
    let timestamp: number;
}
export const HEALTH_CACHE_TTL: 5000;
//# sourceMappingURL=cache.d.ts.map