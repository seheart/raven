/**
 * Cache utilities for file content and health endpoints
 */

// File cache for tracking previous states (for diff generation)
export const fileCache = new Map();
export const MAX_CACHE_SIZE = 1000; // Limit cache to prevent unbounded memory growth

// Health endpoint cache (reduces expensive queries)
export let healthCache = { data: null, timestamp: 0 };
export const HEALTH_CACHE_TTL = 5000; // 5 seconds

/**
 * Add entry to file cache with LRU eviction
 * @param {string} key - File path
 * @param {string} value - File content
 */
export function addToFileCache(key, value) {
  // If cache is at max size, remove oldest entry (first in Map)
  if (fileCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = fileCache.keys().next().value;
    fileCache.delete(oldestKey);
  }
  // Delete and re-add to move to end (most recently used)
  fileCache.delete(key);
  fileCache.set(key, value);
}

/**
 * Update health cache
 * @param {object} data - Health data to cache
 */
export function updateHealthCache(data) {
  healthCache = { data, timestamp: Date.now() };
}

/**
 * Get health cache if still valid
 * @returns {object|null} - Cached health data or null if expired
 */
export function getHealthCache() {
  const now = Date.now();
  if (healthCache.data && (now - healthCache.timestamp) < HEALTH_CACHE_TTL) {
    return healthCache.data;
  }
  return null;
}

/**
 * Clear file cache
 */
export function clearFileCache() {
  fileCache.clear();
}
