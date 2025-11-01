/**
 * Cache utilities for file content and health endpoints
 */

// File cache for tracking previous states (for diff generation)
export const fileCache = new Map();
export const MAX_CACHE_SIZE = 1000; // Limit cache to prevent unbounded memory growth

// Health endpoint cache (reduces expensive queries)
export let healthCache = { data: null, timestamp: 0 };
export const HEALTH_CACHE_TTL = 30000; // 30 seconds (health data doesn't change often)

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

// ==================== Generic TTL-based Request Cache ====================

/**
 * Generic cache store with TTL and LRU eviction
 * @class ResponseCache
 */
class ResponseCache {
  constructor(maxSize = 500, defaultTTL = 30000) {
    this.cache = new Map(); // key -> { data, timestamp, ttl }
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get cached data if valid
   * @param {string} key - Cache key
   * @returns {*} Cached data or null if expired/missing
   */
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    const now = Date.now();
    const age = now - entry.timestamp;

    if (age > entry.ttl) {
      // Expired - remove and return null
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    // Valid cache hit - move to end (LRU)
    this.cache.delete(key);
    this.cache.set(key, entry);
    this.hits++;
    return entry.data;
  }

  /**
   * Set cache entry with optional TTL
   * @param {string} key - Cache key
   * @param {*} data - Data to cache
   * @param {number} ttl - Time to live in milliseconds (optional)
   */
  set(key, data, ttl = null) {
    // Evict oldest entry if at max size
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL
    });
  }

  /**
   * Invalidate specific cache key
   * @param {string} key - Cache key to invalidate
   */
  invalidate(key) {
    this.cache.delete(key);
  }

  /**
   * Invalidate all keys matching pattern
   * @param {RegExp} pattern - Regex pattern to match keys
   */
  invalidatePattern(pattern) {
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cache entries
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   * @returns {object} Cache stats
   */
  getStats() {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? ((this.hits / total) * 100).toFixed(2) + '%' : '0%'
    };
  }
}

// Create cache instances for different endpoint types
export const dashboardCache = new ResponseCache(100, 30000); // 30s TTL for dashboard
export const analyticsCache = new ResponseCache(200, 60000); // 60s TTL for analytics
export const metricsCache = new ResponseCache(100, 15000);   // 15s TTL for metrics
export const queryCache = new ResponseCache(500, 10000);     // 10s TTL for general queries
export const safetyCache = new ResponseCache(300, 30000);    // 30s TTL for safety endpoints

/**
 * Generate cache key from request
 * @param {string} endpoint - API endpoint path
 * @param {object} query - Query parameters
 * @returns {string} Cache key
 */
export function generateCacheKey(endpoint, query = {}) {
  const sortedQuery = Object.keys(query)
    .sort()
    .map(k => `${k}=${query[k]}`)
    .join('&');
  return `${endpoint}${sortedQuery ? '?' + sortedQuery : ''}`;
}

/**
 * Middleware factory for caching responses
 * @param {ResponseCache} cache - Cache instance to use
 * @param {function} keyGenerator - Function to generate cache key from req
 * @param {number} ttl - Optional TTL override
 * @returns {function} Express middleware
 */
export function cacheMiddleware(cache, keyGenerator = null, ttl = null) {
  return (req, res, next) => {
    // Generate cache key
    const cacheKey = keyGenerator
      ? keyGenerator(req)
      : generateCacheKey(req.path, req.query);

    // Check cache
    const cached = cache.get(cacheKey);
    if (cached !== null) {
      return res.json(cached);
    }

    // Intercept res.json to cache the response
    const originalJson = res.json.bind(res);
    res.json = (data) => {
      // Only cache successful responses
      if (res.statusCode === 200) {
        cache.set(cacheKey, data, ttl);
      }
      return originalJson(data);
    };

    next();
  };
}

/**
 * Get all cache statistics
 * @returns {object} Stats for all caches
 */
export function getAllCacheStats() {
  return {
    dashboard: dashboardCache.getStats(),
    analytics: analyticsCache.getStats(),
    metrics: metricsCache.getStats(),
    query: queryCache.getStats(),
    safety: safetyCache.getStats(),
    file: {
      size: fileCache.size,
      maxSize: MAX_CACHE_SIZE
    },
    health: {
      cached: healthCache.data !== null,
      age: healthCache.data ? Date.now() - healthCache.timestamp : null
    }
  };
}

/**
 * Clear all caches
 */
export function clearAllCaches() {
  dashboardCache.clear();
  analyticsCache.clear();
  metricsCache.clear();
  queryCache.clear();
  safetyCache.clear();
  fileCache.clear();
  healthCache = { data: null, timestamp: 0 };
}
