import { writable } from 'svelte/store';
import { logger } from './logger.js';
import { API_CONFIG } from '../config.js';
import { apiFetch } from './apiClient.js';

const BASE_URL = API_CONFIG.BASE_URL;

/**
 * @typedef {Object} CacheEntry
 * @property {any} data - Cached data
 * @property {number} timestamp - When the data was cached
 * @property {number} accessTime - Last access time for LRU eviction
 */

/**
 * @typedef {Object} FetchOptions
 * @property {number} [ttl] - Time-to-live in milliseconds
 * @property {boolean} [forceRefresh] - Bypass cache
 * @property {Record<string, string|number>} [params] - URL query parameters
 * @property {number} [timeout] - Per-request timeout in ms (forwarded to apiFetch)
 */

/**
 * @typedef {Object} FileEvent
 * @property {string} id - Event ID
 * @property {string} filepath - File path
 * @property {string} change_type - Type of change (add, change, unlink)
 * @property {string} timestamp - ISO timestamp
 * @property {string} [project] - Project name
 * @property {number} [chars_added] - Characters added (post-diff)
 * @property {number} [chars_removed] - Characters removed (post-diff)
 */

/**
 * @typedef {Object} DashboardStats
 * @property {number} total_events - Total events count
 * @property {number} total_files - Total files count
 * @property {number} total_agents - Total agents count
 * @property {number} session_duration_seconds - Session duration
 * @property {number} active_files_today - Active files today
 * @property {number} files_avg_14d - 14-day rolling avg of distinct files/day, excluding today
 * @property {number} cost_today_usd - Total Claude API cost since local midnight
 * @property {string|null} first_agent_event_today_at - ISO timestamp of today's first agent event (burn-rate denominator)
 * @property {number} total_changes - Total changes
 * @property {number} creates - Number of creates
 * @property {number} edits - Number of edits
 * @property {number} deletes - Number of deletes
 * @property {number} unique_files_modified - Unique files modified
 */

/**
 * @typedef {Object} SystemMetrics
 * @property {number} cpu_percent - CPU usage percentage
 * @property {number} memory_percent - Memory usage percentage
 * @property {number} memory_used_mb - Memory used in MB
 * @property {number} memory_total_mb - Total memory in MB
 */

/**
 * @typedef {Object} HealthCheckResult
 * @property {string} status - Health status (healthy, unhealthy, pending)
 * @property {Object} summary - Summary of checks
 * @property {number} summary.total - Total checks
 * @property {number} summary.passed - Passed checks
 * @property {number} summary.failed - Failed checks
 * @property {boolean} [summary.allPassed] - Whether all checks passed
 * @property {Array<Object>} checks - Individual check results
 */

/**
 * Centralized Data Service with Caching and Request Deduplication
 * Prevents duplicate API calls and shares data across components
 */
class DataService {
  constructor() {
    /** @type {Map<string, CacheEntry>} */
    this.cache = new Map();

    /** @type {Map<string, Promise<any>>} */
    this.inflightRequests = new Map();

    // Cache configuration
    this.cacheTTL = 5000; // 5 seconds default TTL
    this.maxCacheSize = 100; // Maximum cache entries

    // Shared stores for commonly accessed data
    this.stores = {
      fileEvents: writable([]),
      dashboardStats: writable({}),
      systemMetrics: writable({}),
      projects: writable([]),
      topFiles: writable([])
    };

    // Start periodic cache cleanup (every 30 seconds)
    this.cleanupInterval = setInterval(() => this.cleanupExpiredEntries(), 30000);

    // Track when cleanup was initialized
    logger.debug('DataService initialized with cache size limit:', this.maxCacheSize);
  }

  /**
   * Fetch data with caching and deduplication
   * @param {string} endpoint - API endpoint path
   * @param {FetchOptions} [options] - Fetch options
   * @returns {Promise<any>} Response data
   * @throws {Error} Throws if HTTP response is not OK or network fails
   */
  async fetch(endpoint, options = {}) {
    const { ttl = this.cacheTTL, forceRefresh = false, params = {}, timeout } = options;

    // Build endpoint with query params (cache key)
    const endpointWithParams =
      params && Object.keys(params).length > 0
        ? `${endpoint}?${new URLSearchParams(params).toString()}`
        : endpoint;

    // Use endpoint as cache key (consistent with what apiFetch uses)
    const cacheKey = endpointWithParams;

    // Check cache first (unless force refresh)
    if (!forceRefresh && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      const age = Date.now() - cached.timestamp;

      if (age < ttl) {
        // Update access time for LRU tracking
        cached.accessTime = Date.now();
        this.cache.set(cacheKey, cached);

        logger.debug(`Cache HIT: ${endpoint} (age: ${age}ms)`);
        return cached.data;
      } else {
        logger.debug(`Cache EXPIRED: ${endpoint} (age: ${age}ms)`);
        this.cache.delete(cacheKey);
      }
    }

    // Check if request is already in-flight
    if (this.inflightRequests.has(cacheKey)) {
      logger.debug(`Request DEDUPLICATED: ${endpoint}`);
      return this.inflightRequests.get(cacheKey);
    }

    // Make new request using apiFetch (includes auth, timeouts, error handling)
    logger.debug(`Fetching: ${endpoint}`);

    const apiOptions = timeout != null ? { timeout } : {};
    const requestPromise = apiFetch(endpointWithParams, apiOptions)
      .then(data => {
        // Evict oldest entry if cache is full (LRU)
        if (this.cache.size >= this.maxCacheSize) {
          this.evictOldestEntry();
        }

        // Store in cache with access time tracking
        this.cache.set(cacheKey, {
          data,
          timestamp: Date.now(),
          accessTime: Date.now()
        });

        // Remove from in-flight
        this.inflightRequests.delete(cacheKey);

        return data;
      })
      .catch(error => {
        // Remove from in-flight on error
        this.inflightRequests.delete(cacheKey);
        logger.error(`Failed to fetch ${endpoint}:`, error);
        throw error;
      });

    // Track in-flight request
    this.inflightRequests.set(cacheKey, requestPromise);

    return requestPromise;
  }

  /**
   * Fetch all file events with intelligent caching
   * Components can specify their limit, but we always fetch max and cache it
   * @param {number} [limit=500] - Maximum number of events to return
   * @param {boolean} [forceRefresh=false] - Force refresh from API
   * @returns {Promise<FileEvent[]>} Array of file events
   * @throws {Error} Throws if fetch fails or API returns error
   */
  async fetchFileEvents(limit = 500, forceRefresh = false) {
    // Always fetch the max to satisfy all components
    const maxLimit = 500;
    const data = await this.fetch('/file-events', {
      params: { limit: maxLimit },
      forceRefresh,
      ttl: 3000 // 3 second cache for file events
    });

    // Update shared store
    this.stores.fileEvents.set(data);

    // Return only the requested limit
    return data.slice(0, limit);
  }

  /**
   * Fetch dashboard stats
   * @param {boolean} [forceRefresh=false] - Force refresh from API
   * @returns {Promise<DashboardStats>} Dashboard statistics
   * @throws {Error} Throws if fetch fails or API returns error
   */
  async fetchDashboardStats(forceRefresh = false) {
    const data = await this.fetch('/dashboard-stats', { forceRefresh });
    this.stores.dashboardStats.set(data);
    return data;
  }

  /**
   * Fetch system metrics
   * @param {number} [limit=1] - Number of metric snapshots to return
   * @param {boolean} [forceRefresh=false] - Force refresh from API
   * @returns {Promise<SystemMetrics>} System metrics
   * @throws {Error} Throws if fetch fails or API returns error
   */
  async fetchSystemMetrics(limit = 1, forceRefresh = false) {
    const data = await this.fetch('/system-metrics', {
      params: { limit },
      forceRefresh
    });
    const metrics = data?.[0] || {};
    this.stores.systemMetrics.set(metrics);
    return metrics;
  }

  /**
   * Fetch projects list
   * @param {boolean} [forceRefresh=false] - Force refresh from API
   * @returns {Promise<Array>} Array of projects
   * @throws {Error} Throws if fetch fails or API returns error
   */
  async fetchProjects(forceRefresh = false) {
    const data = await this.fetch('/projects', { forceRefresh });
    const projects = data.projects || [];
    this.stores.projects.set(projects);
    return projects;
  }

  /**
   * Fetch top modified files
   * @param {number} [limit=5] - Maximum number of files to return
   * @param {boolean} [forceRefresh=false] - Force refresh from API
   * @returns {Promise<Array>} Array of top modified files
   * @throws {Error} Throws if fetch fails or API returns error
   */
  async fetchTopFiles(limit = 5, forceRefresh = false) {
    const data = await this.fetch('/top-modified-files', {
      params: { limit },
      forceRefresh
    });
    // Endpoint returns a bare array; tolerate {files: [...]} for forward compat.
    const files = Array.isArray(data) ? data : data?.files || [];
    this.stores.topFiles.set(files);
    return files;
  }

  /**
   * Fetch health checks
   * @param {boolean} [forceRefresh=false] - Force refresh from API
   * @returns {Promise<HealthCheckResult>} Health check results
   * @throws {Error} Throws if fetch fails or API returns error
   */
  async fetchHealthChecks(forceRefresh = false) {
    return this.fetch('/health-checks', { forceRefresh });
  }

  /**
   * Fetch backend health status
   * Uses the public /health endpoint (not /api/health) to avoid auth requirements
   * @param {boolean} [forceRefresh=false] - Force refresh from API
   * @returns {Promise<Object>} Backend health status including version, uptime, database status
   * @throws {Error} Throws if fetch fails or API returns error
   */
  async fetchHealth(forceRefresh = false) {
    const cacheKey = '/health';

    // Check cache first
    if (!forceRefresh && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      const age = Date.now() - cached.timestamp;

      if (age < 3000) {
        cached.accessTime = Date.now();
        this.cache.set(cacheKey, cached);
        return cached.data;
      } else {
        this.cache.delete(cacheKey);
      }
    }

    // Fetch from public /health endpoint (no auth required)
    const url = `${BASE_URL}/health`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status}`);
    }

    const data = await response.json();

    // Cache the result
    this.cache.set(cacheKey, {
      data,
      timestamp: Date.now(),
      accessTime: Date.now()
    });

    return data;
  }

  /**
   * Fetch git status
   * @param {boolean} [forceRefresh=false] - Force refresh from API
   * @returns {Promise<Object>} Git status with modified/created/deleted files
   * @throws {Error} Throws if fetch fails or API returns error
   */
  async fetchGitStatus(forceRefresh = false) {
    return this.fetch('/git/status', { forceRefresh, ttl: 3000 });
  }

  /**
   * Fetch git branches
   * @param {boolean} [forceRefresh=false] - Force refresh from API
   * @returns {Promise<Object>} List of git branches
   * @throws {Error} Throws if fetch fails or API returns error
   */
  async fetchGitBranches(forceRefresh = false) {
    return this.fetch('/git/branches', { forceRefresh, ttl: 5000 });
  }

  /**
   * Fetch git commit history
   * @param {number} [limit=5] - Number of commits to fetch
   * @param {boolean} [forceRefresh=false] - Force refresh from API
   * @returns {Promise<Object>} Git commit history
   * @throws {Error} Throws if fetch fails or API returns error
   */
  async fetchGitHistory(limit = 5, forceRefresh = false) {
    return this.fetch('/git/history', {
      params: { limit },
      forceRefresh,
      ttl: 5000
    });
  }

  /**
   * Fetch agent events
   * @param {number} [limit=500] - Maximum number of events to return
   * @param {boolean} [forceRefresh=false] - Force refresh from API
   * @returns {Promise<Array>} Array of agent events
   * @throws {Error} Throws if fetch fails or API returns error
   */
  async fetchAgentEvents(limit = 500, forceRefresh = false) {
    return this.fetch('/agent-events', {
      params: { limit },
      forceRefresh,
      ttl: 3000
    });
  }

  /**
   * Preload all initial data with progress tracking
   * Call this once on app startup
   * @param {Function} [onProgress] - Optional callback: (progress, message, status) => void
   * @returns {Promise<Object>} Object with success status, duration, and diagnostic results
   */
  /**
   * Prefetch all data in parallel for instant page loads.
   * Call once on app startup. All fetches run concurrently.
   */
  async prefetchAll() {
    const startTime = Date.now();
    logger.info('Prefetching all data in parallel...');

    const fetches = [
      // Critical — dashboard and overview
      this.fetchDashboardStats(),
      this.fetchFileEvents(500),
      this.fetchSystemMetrics(),
      this.fetchProjects(),
      this.fetchTopFiles(8),
      this.fetchHealth(),

      // Analysis — models and agents
      this.fetch('/agents-status', { ttl: 5000 }),
      this.fetch('/models', { ttl: 5000 }),
      this.fetch('/local-models', { ttl: 10000 }),
      this.fetch('/agent-stats', { ttl: 5000 }),

      // System
      this.fetchHealthChecks(),
      this.fetch('/storage', { ttl: 30000 }),
      this.fetch('/storage/projects', { ttl: 10000 }),
      this.fetch('/errors?limit=50', { ttl: 10000 }),

      // History
      this.fetchAgentEvents(500),
      this.fetch('/trends/historical?period=daily&days=7', { ttl: 30000 }),

      // Git (optional, may fail)
      this.fetchGitStatus(),
      this.fetchGitHistory(5)
    ];

    const results = await Promise.allSettled(fetches);
    const passed = results.filter(r => r.status === 'fulfilled').length;
    const duration = Date.now() - startTime;

    logger.info(`Prefetch complete: ${passed}/${results.length} in ${duration}ms`);
    return { passed, total: results.length, duration };
  }

  /**
   * Start background refresh cycle.
   * Keeps cache warm so pages load instantly.
   */
  startBackgroundRefresh(intervalMs = 15000) {
    if (this._bgInterval) return;

    this._bgInterval = setInterval(async () => {
      try {
        // Refresh the most-accessed endpoints silently
        await Promise.allSettled([
          this.fetchDashboardStats(true),
          this.fetchFileEvents(500, true),
          this.fetchSystemMetrics(1, true),
          this.fetch('/agents-status', { forceRefresh: true, ttl: 5000 }),
          this.fetch('/models', { forceRefresh: true, ttl: 5000 })
        ]);
      } catch {
        // Silent — background refresh is best-effort
      }
    }, intervalMs);

    logger.info(`Background refresh started (every ${intervalMs / 1000}s)`);
  }

  /**
   * Stop background refresh
   */
  stopBackgroundRefresh() {
    if (this._bgInterval) {
      clearInterval(this._bgInterval);
      this._bgInterval = null;
    }
  }

  /**
   * Legacy preloadInitialData — calls prefetchAll for backward compatibility
   */
  async preloadInitialData(onProgress = null) {
    if (onProgress) onProgress(0, 'Starting parallel prefetch...', 'loading');
    const result = await this.prefetchAll();
    if (onProgress) onProgress(100, `Loaded ${result.passed}/${result.total} endpoints`, 'success');
    return {
      success: result.passed >= result.total * 0.6,
      duration: result.duration,
      diagnostics: {
        total: result.total,
        passed: result.passed,
        failed: result.total - result.passed,
        warnings: 0,
        details: []
      }
    };
  }

  /**
   * Invalidate cache for specific endpoint or all
   * @param {string|null} [endpoint=null] - Endpoint to invalidate, or null to clear all
   */
  invalidateCache(endpoint = null) {
    if (endpoint) {
      // Find and delete matching cache entries
      for (const [key] of this.cache) {
        if (key.includes(endpoint)) {
          this.cache.delete(key);
        }
      }
      logger.debug(`Cache invalidated for: ${endpoint}`);
    } else {
      this.cache.clear();
      logger.debug('All cache cleared');
    }
  }

  /**
   * Clean up expired cache entries (called periodically)
   * @private
   */
  cleanupExpiredEntries() {
    const now = Date.now();
    let removedCount = 0;

    for (const [key, value] of this.cache.entries()) {
      const age = now - value.timestamp;
      if (age > this.cacheTTL) {
        this.cache.delete(key);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      logger.debug(`Cache cleanup: removed ${removedCount} expired entries`);
    }
  }

  /**
   * Evict least recently used entry (LRU eviction)
   * @private
   */
  evictOldestEntry() {
    let oldestKey = null;
    let oldestTime = Infinity;

    // Find the least recently accessed entry
    for (const [key, value] of this.cache.entries()) {
      if (value.accessTime < oldestTime) {
        oldestTime = value.accessTime;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      logger.debug(
        `Cache eviction: removed LRU entry (size: ${this.cache.size}/${this.maxCacheSize})`
      );
    }
  }

  /**
   * Destroy the service and cleanup intervals
   * Call this when the service is no longer needed to prevent memory leaks
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
    this.inflightRequests.clear();
    logger.debug('DataService destroyed');
  }

  /**
   * Get cache statistics for debugging
   * @returns {Object} Cache statistics including size, max size, inflight requests, and cached endpoints
   */
  getCacheStats() {
    return {
      cacheSize: this.cache.size,
      maxSize: this.maxCacheSize,
      inflightRequests: this.inflightRequests.size,
      cachedEndpoints: Array.from(this.cache.keys())
    };
  }
}

// Export singleton instance
export const dataService = new DataService();
