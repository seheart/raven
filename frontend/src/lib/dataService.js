import { writable, get } from 'svelte/store';
import { logger } from './logger.js';
import { API_CONFIG } from '../config.js';

const API_BASE = API_CONFIG.API_BASE;

/**
 * Centralized Data Service with Caching and Request Deduplication
 * Prevents duplicate API calls and shares data across components
 */
class DataService {
  constructor() {
    // Cache storage: endpoint -> { data, timestamp, accessTime }
    this.cache = new Map();

    // In-flight requests: endpoint -> Promise
    // Prevents duplicate simultaneous requests
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
   */
  async fetch(endpoint, options = {}) {
    const {
      ttl = this.cacheTTL,
      forceRefresh = false,
      params = {}
    } = options;

    // Build full URL with params
    const url = new URL(`${API_BASE}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
    const fullUrl = url.toString();

    // Check cache first (unless force refresh)
    if (!forceRefresh && this.cache.has(fullUrl)) {
      const cached = this.cache.get(fullUrl);
      const age = Date.now() - cached.timestamp;

      if (age < ttl) {
        // Update access time for LRU tracking
        cached.accessTime = Date.now();
        this.cache.set(fullUrl, cached);

        logger.debug(`Cache HIT: ${endpoint} (age: ${age}ms)`);
        return cached.data;
      } else {
        logger.debug(`Cache EXPIRED: ${endpoint} (age: ${age}ms)`);
        this.cache.delete(fullUrl);
      }
    }

    // Check if request is already in-flight
    if (this.inflightRequests.has(fullUrl)) {
      logger.debug(`Request DEDUPLICATED: ${endpoint}`);
      return this.inflightRequests.get(fullUrl);
    }

    // Make new request
    logger.debug(`Fetching: ${endpoint}`);
    const requestPromise = fetch(fullUrl)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`API error: ${response.status} ${response.statusText}`);
        }
        return response.json();
      })
      .then((data) => {
        // Evict oldest entry if cache is full (LRU)
        if (this.cache.size >= this.maxCacheSize) {
          this.evictOldestEntry();
        }

        // Store in cache with access time tracking
        this.cache.set(fullUrl, {
          data,
          timestamp: Date.now(),
          accessTime: Date.now()
        });

        // Remove from in-flight
        this.inflightRequests.delete(fullUrl);

        return data;
      })
      .catch((error) => {
        // Remove from in-flight on error
        this.inflightRequests.delete(fullUrl);
        logger.error(`Failed to fetch ${endpoint}:`, error);
        throw error;
      });

    // Track in-flight request
    this.inflightRequests.set(fullUrl, requestPromise);

    return requestPromise;
  }

  /**
   * Fetch all file events with intelligent caching
   * Components can specify their limit, but we always fetch max and cache it
   */
  async fetchFileEvents(limit = 500, forceRefresh = false) {
    // Always fetch the max to satisfy all components
    const maxLimit = 500;
    const data = await this.fetch('/all-file-events', {
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
   */
  async fetchDashboardStats(forceRefresh = false) {
    const data = await this.fetch('/dashboard-stats', { forceRefresh });
    this.stores.dashboardStats.set(data);
    return data;
  }

  /**
   * Fetch system metrics
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
   */
  async fetchProjects(forceRefresh = false) {
    const data = await this.fetch('/projects/list', { forceRefresh });
    const projects = data.projects || [];
    this.stores.projects.set(projects);
    return projects;
  }

  /**
   * Fetch top modified files
   */
  async fetchTopFiles(limit = 5, forceRefresh = false) {
    const data = await this.fetch('/top-modified-files', {
      params: { limit },
      forceRefresh
    });
    const files = data.files || [];
    this.stores.topFiles.set(files);
    return files;
  }

  /**
   * Fetch health checks
   */
  async fetchHealthChecks(forceRefresh = false) {
    return this.fetch('/health-checks', { forceRefresh });
  }

  /**
   * Preload all initial data in parallel
   * Call this once on app startup
   */
  async preloadInitialData() {
    logger.info('Preloading initial data...');
    const startTime = Date.now();

    try {
      // Fetch everything in parallel
      await Promise.all([
        this.fetchFileEvents(500),
        this.fetchDashboardStats(),
        this.fetchSystemMetrics(),
        this.fetchProjects(),
        this.fetchTopFiles(5),
        this.fetchHealthChecks()
      ]);

      const duration = Date.now() - startTime;
      logger.info(`Initial data preloaded in ${duration}ms`);
      return true;
    } catch (error) {
      logger.error('Failed to preload initial data:', error);
      return false;
    }
  }

  /**
   * Invalidate cache for specific endpoint or all
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
      logger.debug(`Cache eviction: removed LRU entry (size: ${this.cache.size}/${this.maxCacheSize})`);
    }
  }

  /**
   * Destroy the service and cleanup intervals
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

// Export stores for reactive access
export const { fileEvents, dashboardStats, systemMetrics, projects, topFiles } = dataService.stores;
