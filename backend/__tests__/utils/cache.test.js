/**
 * Tests for Cache Utilities
 * Tests LRU file cache and health cache functionality from Phase 3
 */

import {
  fileCache,
  addToFileCache,
  getHealthCache,
  updateHealthCache,
  clearFileCache,
  MAX_CACHE_SIZE,
  HEALTH_CACHE_TTL,
  dashboardCache,
  analyticsCache,
  metricsCache,
  queryCache,
  generateCacheKey,
  cacheMiddleware,
  getAllCacheStats,
  clearAllCaches
} from '../../utils/cache.js';
import express from 'express';
import request from 'supertest';

describe('Cache Utilities', () => {
  beforeEach(() => {
    // Clear caches before each test
    fileCache.clear();
  });

  describe('File Cache - LRU Eviction', () => {
    test('should add items to cache', () => {
      addToFileCache('file1.js', 'content1');
      addToFileCache('file2.js', 'content2');

      expect(fileCache.size).toBe(2);
      expect(fileCache.get('file1.js')).toBe('content1');
      expect(fileCache.get('file2.js')).toBe('content2');
    });

    test('should update existing cache entries', () => {
      addToFileCache('file1.js', 'content1');
      addToFileCache('file1.js', 'updated content');

      expect(fileCache.size).toBe(1);
      expect(fileCache.get('file1.js')).toBe('updated content');
    });

    test('should move updated items to end (most recently used)', () => {
      addToFileCache('file1.js', 'content1');
      addToFileCache('file2.js', 'content2');
      addToFileCache('file3.js', 'content3');

      // Update file1 - should move to end
      addToFileCache('file1.js', 'updated');

      const keys = Array.from(fileCache.keys());
      expect(keys[keys.length - 1]).toBe('file1.js'); // Most recent
    });

    test('should evict oldest entry when cache is full', () => {
      // Fill cache to MAX_CACHE_SIZE
      for (let i = 0; i < MAX_CACHE_SIZE; i++) {
        addToFileCache(`file${i}.js`, `content${i}`);
      }

      expect(fileCache.size).toBe(MAX_CACHE_SIZE);
      expect(fileCache.has('file0.js')).toBe(true);

      // Add one more - should evict file0.js (oldest)
      addToFileCache('fileNew.js', 'new content');

      expect(fileCache.size).toBe(MAX_CACHE_SIZE);
      expect(fileCache.has('file0.js')).toBe(false); // Evicted
      expect(fileCache.has('fileNew.js')).toBe(true); // Added
    });

    test('should evict in FIFO order when at capacity', () => {
      // Fill cache
      for (let i = 0; i < MAX_CACHE_SIZE; i++) {
        addToFileCache(`file${i}.js`, `content${i}`);
      }

      // Add 3 more items - should evict first 3
      addToFileCache('fileA.js', 'contentA');
      addToFileCache('fileB.js', 'contentB');
      addToFileCache('fileC.js', 'contentC');

      expect(fileCache.has('file0.js')).toBe(false);
      expect(fileCache.has('file1.js')).toBe(false);
      expect(fileCache.has('file2.js')).toBe(false);
      expect(fileCache.has('fileA.js')).toBe(true);
      expect(fileCache.has('fileB.js')).toBe(true);
      expect(fileCache.has('fileC.js')).toBe(true);
    });

    test('should maintain cache size limit', () => {
      // Add way more than MAX_CACHE_SIZE
      for (let i = 0; i < MAX_CACHE_SIZE * 2; i++) {
        addToFileCache(`file${i}.js`, `content${i}`);
      }

      expect(fileCache.size).toBe(MAX_CACHE_SIZE);
    });

    test('should preserve most recently added items', () => {
      // Fill cache completely
      for (let i = 0; i < MAX_CACHE_SIZE + 100; i++) {
        addToFileCache(`file${i}.js`, `content${i}`);
      }

      // Last 1000 items should be in cache
      const startIndex = 100; // First 100 were evicted
      for (let i = startIndex; i < MAX_CACHE_SIZE + 100; i++) {
        expect(fileCache.has(`file${i}.js`)).toBe(true);
      }
    });
  });

  describe('Clear File Cache', () => {
    test('should clear all cached files', () => {
      addToFileCache('file1.js', 'content1');
      addToFileCache('file2.js', 'content2');
      addToFileCache('file3.js', 'content3');

      expect(fileCache.size).toBe(3);

      clearFileCache();

      expect(fileCache.size).toBe(0);
    });

    test('should handle clearing empty cache', () => {
      clearFileCache();
      expect(fileCache.size).toBe(0);
    });
  });

  describe('Health Cache - TTL-based', () => {
    test('should cache health data', () => {
      const healthData = {
        status: 'healthy',
        uptime: 1000,
        memory: { heapUsed: 1000000 }
      };

      updateHealthCache(healthData);

      const cached = getHealthCache();
      expect(cached).toEqual(healthData);
    });

    test('should return cached data within TTL window', () => {
      const healthData = { status: 'healthy', uptime: 500 };

      updateHealthCache(healthData);

      // Immediately get cache - should return data
      const cached = getHealthCache();
      expect(cached).toEqual(healthData);
    });

    test('should return null after TTL expires', (done) => {
      const healthData = { status: 'healthy', uptime: 100 };

      updateHealthCache(healthData);

      // Wait for TTL to expire (5000ms + buffer)
      setTimeout(() => {
        const cached = getHealthCache();
        expect(cached).toBeNull();
        done();
      }, HEALTH_CACHE_TTL + 100);
    }, 10000);

    test('should update cache timestamp on each update', () => {
      const data1 = { status: 'healthy', uptime: 100 };
      const data2 = { status: 'healthy', uptime: 200 };

      updateHealthCache(data1);
      const firstUpdate = Date.now();

      // Wait a bit
      setTimeout(() => {
        updateHealthCache(data2);

        // Should still be cached (new timestamp)
        const cached = getHealthCache();
        expect(cached).toEqual(data2);
        expect(cached.uptime).toBe(200);
      }, 100);
    });

    test('should handle rapid cache updates', () => {
      for (let i = 0; i < 100; i++) {
        updateHealthCache({ status: 'healthy', iteration: i });
      }

      const cached = getHealthCache();
      expect(cached.iteration).toBe(99); // Last update
    });

    test('should expire cache correctly at TTL boundary', (done) => {
      const healthData = { status: 'healthy', uptime: 200 };
      updateHealthCache(healthData);

      // Check just before TTL expires
      setTimeout(() => {
        const cached1 = getHealthCache();
        expect(cached1).not.toBeNull();
        expect(cached1.status).toBe('healthy');
      }, HEALTH_CACHE_TTL - 100);

      // Check well after TTL expires (increased buffer for reliability)
      setTimeout(() => {
        const cached2 = getHealthCache();
        expect(cached2).toBeNull();
        done();
      }, HEALTH_CACHE_TTL + 500);
    }, 15000);
  });

  describe('Cache Constants', () => {
    test('MAX_CACHE_SIZE should be 1000', () => {
      expect(MAX_CACHE_SIZE).toBe(1000);
    });

    test('HEALTH_CACHE_TTL should be 5000ms (5 seconds)', () => {
      expect(HEALTH_CACHE_TTL).toBe(5000);
    });
  });

  describe('Performance', () => {
    test('should handle rapid file cache additions efficiently', () => {
      const startTime = Date.now();

      for (let i = 0; i < 10000; i++) {
        addToFileCache(`file${i}.js`, `content${i}`);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete in reasonable time (< 100ms for 10k operations)
      expect(duration).toBeLessThan(100);
    });

    test('should handle cache lookups efficiently', () => {
      // Fill cache
      for (let i = 0; i < MAX_CACHE_SIZE; i++) {
        addToFileCache(`file${i}.js`, `content${i}`);
      }

      const startTime = Date.now();

      // Perform many lookups
      for (let i = 0; i < 10000; i++) {
        const key = `file${i % MAX_CACHE_SIZE}.js`;
        fileCache.get(key);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should be very fast (< 10ms for 10k lookups)
      expect(duration).toBeLessThan(10);
    });
  });

  describe('ResponseCache Class', () => {
    let cache;

    beforeEach(() => {
      // Create fresh cache instance for each test
      const ResponseCache = dashboardCache.constructor;
      cache = new ResponseCache(100, 1000); // 100 max size, 1000ms TTL
    });

    describe('get() and set()', () => {
      test('should store and retrieve data', () => {
        cache.set('key1', { data: 'value1' });
        const result = cache.get('key1');

        expect(result).toEqual({ data: 'value1' });
      });

      test('should return null for non-existent keys', () => {
        const result = cache.get('nonexistent');

        expect(result).toBeNull();
      });

      test('should handle custom TTL per entry', () => {
        cache.set('shortLived', 'data', 100); // 100ms TTL
        cache.set('longLived', 'data', 10000); // 10s TTL

        const short = cache.get('shortLived');
        const long = cache.get('longLived');

        expect(short).toBe('data');
        expect(long).toBe('data');
      });

      test('should return null for expired entries', (done) => {
        cache.set('expires', 'data', 50); // 50ms TTL

        setTimeout(() => {
          const result = cache.get('expires');
          expect(result).toBeNull();
          done();
        }, 100);
      });

      test('should remove expired entries from cache', (done) => {
        cache.set('expires', 'data', 50);

        setTimeout(() => {
          cache.get('expires'); // Triggers expiry check
          expect(cache.cache.has('expires')).toBe(false);
          done();
        }, 100);
      });

      test('should implement LRU - move accessed items to end', () => {
        cache.set('key1', 'data1');
        cache.set('key2', 'data2');
        cache.set('key3', 'data3');

        // Access key1 - should move to end
        cache.get('key1');

        const keys = Array.from(cache.cache.keys());
        expect(keys[keys.length - 1]).toBe('key1');
      });

      test('should evict oldest entry when at max size', () => {
        // Fill cache to max
        for (let i = 0; i < 100; i++) {
          cache.set(`key${i}`, `data${i}`);
        }

        expect(cache.cache.size).toBe(100);
        expect(cache.cache.has('key0')).toBe(true);

        // Add one more - should evict key0
        cache.set('key100', 'data100');

        expect(cache.cache.size).toBe(100);
        expect(cache.cache.has('key0')).toBe(false);
        expect(cache.cache.has('key100')).toBe(true);
      });

      test('should track hits and misses', () => {
        cache.set('key1', 'data1');

        cache.get('key1'); // Hit
        cache.get('key2'); // Miss
        cache.get('key1'); // Hit
        cache.get('key3'); // Miss

        expect(cache.hits).toBe(2);
        expect(cache.misses).toBe(2);
      });

      test('should count expired entries as misses', (done) => {
        cache.set('expires', 'data', 50);

        setTimeout(() => {
          cache.get('expires'); // Should be miss
          expect(cache.misses).toBeGreaterThan(0);
          done();
        }, 100);
      });
    });

    describe('invalidate()', () => {
      test('should remove specific key from cache', () => {
        cache.set('key1', 'data1');
        cache.set('key2', 'data2');

        cache.invalidate('key1');

        expect(cache.get('key1')).toBeNull();
        expect(cache.get('key2')).toBe('data2');
      });

      test('should handle invalidating non-existent key', () => {
        cache.invalidate('nonexistent');
        expect(cache.cache.size).toBe(0);
      });
    });

    describe('invalidatePattern()', () => {
      test('should remove all keys matching pattern', () => {
        cache.set('/api/users/1', 'user1');
        cache.set('/api/users/2', 'user2');
        cache.set('/api/posts/1', 'post1');
        cache.set('/api/posts/2', 'post2');

        cache.invalidatePattern(/\/api\/users\//);

        expect(cache.get('/api/users/1')).toBeNull();
        expect(cache.get('/api/users/2')).toBeNull();
        expect(cache.get('/api/posts/1')).toBe('post1');
        expect(cache.get('/api/posts/2')).toBe('post2');
      });

      test('should handle pattern matching no keys', () => {
        cache.set('key1', 'data1');

        cache.invalidatePattern(/nomatch/);

        expect(cache.get('key1')).toBe('data1');
      });

      test('should handle empty cache', () => {
        cache.invalidatePattern(/anything/);
        expect(cache.cache.size).toBe(0);
      });
    });

    describe('clear()', () => {
      test('should remove all entries', () => {
        cache.set('key1', 'data1');
        cache.set('key2', 'data2');
        cache.set('key3', 'data3');

        cache.clear();

        expect(cache.cache.size).toBe(0);
        expect(cache.get('key1')).toBeNull();
      });

      test('should reset but preserve stats', () => {
        cache.set('key1', 'data1');
        cache.get('key1'); // Hit
        cache.get('key2'); // Miss

        cache.clear();

        expect(cache.cache.size).toBe(0);
        expect(cache.hits).toBe(1);
        expect(cache.misses).toBe(1);
      });
    });

    describe('getStats()', () => {
      test('should return cache statistics', () => {
        cache.set('key1', 'data1');
        cache.set('key2', 'data2');
        cache.get('key1'); // Hit
        cache.get('nonexistent'); // Miss

        const stats = cache.getStats();

        expect(stats.size).toBe(2);
        expect(stats.maxSize).toBe(100);
        expect(stats.hits).toBe(1);
        expect(stats.misses).toBe(1);
        expect(stats.hitRate).toBe('50.00%');
      });

      test('should handle 0% hit rate', () => {
        cache.get('nonexistent');

        const stats = cache.getStats();
        expect(stats.hitRate).toBe('0.00%');
      });

      test('should handle 100% hit rate', () => {
        cache.set('key1', 'data');
        cache.get('key1');
        cache.get('key1');

        const stats = cache.getStats();
        expect(stats.hitRate).toBe('100.00%');
      });

      test('should handle no requests', () => {
        const stats = cache.getStats();

        expect(stats.hits).toBe(0);
        expect(stats.misses).toBe(0);
        expect(stats.hitRate).toBe('0%');
      });
    });
  });

  describe('Cache Instances', () => {
    beforeEach(() => {
      dashboardCache.clear();
      analyticsCache.clear();
      metricsCache.clear();
      queryCache.clear();
    });

    test('dashboardCache should be initialized', () => {
      expect(dashboardCache).toBeDefined();
      expect(dashboardCache.maxSize).toBe(100);
      expect(dashboardCache.defaultTTL).toBe(30000);
    });

    test('analyticsCache should be initialized', () => {
      expect(analyticsCache).toBeDefined();
      expect(analyticsCache.maxSize).toBe(200);
      expect(analyticsCache.defaultTTL).toBe(60000);
    });

    test('metricsCache should be initialized', () => {
      expect(metricsCache).toBeDefined();
      expect(metricsCache.maxSize).toBe(100);
      expect(metricsCache.defaultTTL).toBe(15000);
    });

    test('queryCache should be initialized', () => {
      expect(queryCache).toBeDefined();
      expect(queryCache.maxSize).toBe(500);
      expect(queryCache.defaultTTL).toBe(10000);
    });
  });

  describe('generateCacheKey()', () => {
    test('should generate key from endpoint', () => {
      const key = generateCacheKey('/api/dashboard');
      expect(key).toBe('/api/dashboard');
    });

    test('should generate key from endpoint with query params', () => {
      const key = generateCacheKey('/api/analytics', { userId: '123', timeRange: '7d' });
      expect(key).toBe('/api/analytics?timeRange=7d&userId=123');
    });

    test('should sort query parameters for consistency', () => {
      const key1 = generateCacheKey('/api/data', { b: '2', a: '1', c: '3' });
      const key2 = generateCacheKey('/api/data', { a: '1', c: '3', b: '2' });

      expect(key1).toBe(key2);
    });

    test('should handle empty query object', () => {
      const key = generateCacheKey('/api/endpoint', {});
      expect(key).toBe('/api/endpoint');
    });

    test('should handle no query parameter', () => {
      const key = generateCacheKey('/api/endpoint');
      expect(key).toBe('/api/endpoint');
    });
  });

  describe('cacheMiddleware()', () => {
    let app;

    beforeEach(() => {
      app = express();
      queryCache.clear();
    });

    test('should cache successful responses', async () => {
      app.get('/test', cacheMiddleware(queryCache), (req, res) => {
        res.json({ data: 'test', timestamp: Date.now() });
      });

      // First request - cache miss
      const response1 = await request(app).get('/test');
      expect(response1.status).toBe(200);

      // Second request - should return cached response
      const response2 = await request(app).get('/test');
      expect(response2.status).toBe(200);

      // Timestamps should match (cached response)
      expect(response1.body.timestamp).toBe(response2.body.timestamp);
    });

    test('should not cache error responses', async () => {
      let callCount = 0;
      app.get('/error', cacheMiddleware(queryCache), (req, res) => {
        callCount++;
        res.status(500).json({ error: 'Server error', callCount });
      });

      const response1 = await request(app).get('/error');
      const response2 = await request(app).get('/error');

      expect(response1.body.callCount).toBe(1);
      expect(response2.body.callCount).toBe(2); // Not cached
    });

    test('should use custom key generator', async () => {
      const keyGen = (req) => `custom:${req.path}`;

      app.get('/test', cacheMiddleware(queryCache, keyGen), (req, res) => {
        res.json({ data: 'test' });
      });

      await request(app).get('/test');

      // Check cache has custom key
      const cached = queryCache.get('custom:/test');
      expect(cached).toBeDefined();
    });

    test('should use custom TTL', async () => {
      app.get('/test', cacheMiddleware(queryCache, null, 100), (req, res) => {
        res.json({ data: 'test' });
      });

      await request(app).get('/test');

      // Wait for custom TTL to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      const cached = queryCache.get('/test');
      expect(cached).toBeNull();
    });

    test('should include query params in cache key', async () => {
      app.get('/search', cacheMiddleware(queryCache), (req, res) => {
        res.json({ query: req.query.q });
      });

      const response1 = await request(app).get('/search?q=test1');
      const response2 = await request(app).get('/search?q=test2');

      expect(response1.body.query).toBe('test1');
      expect(response2.body.query).toBe('test2');
    });
  });

  describe('getAllCacheStats()', () => {
    beforeEach(() => {
      clearAllCaches();
    });

    test('should return stats for all caches', () => {
      dashboardCache.set('key1', 'data1');
      analyticsCache.set('key2', 'data2');
      metricsCache.set('key3', 'data3');
      queryCache.set('key4', 'data4');
      addToFileCache('file1.js', 'content1');
      updateHealthCache({ status: 'healthy' });

      const stats = getAllCacheStats();

      expect(stats.dashboard).toBeDefined();
      expect(stats.analytics).toBeDefined();
      expect(stats.metrics).toBeDefined();
      expect(stats.query).toBeDefined();
      expect(stats.file).toBeDefined();
      expect(stats.health).toBeDefined();

      expect(stats.dashboard.size).toBe(1);
      expect(stats.file.size).toBe(1);
      expect(stats.health.cached).toBe(true);
    });

    test('should show health cache age', () => {
      updateHealthCache({ status: 'healthy' });

      const stats = getAllCacheStats();

      expect(stats.health.cached).toBe(true);
      expect(stats.health.age).toBeGreaterThanOrEqual(0);
    });

    test('should show null age when health cache is empty', () => {
      const stats = getAllCacheStats();

      expect(stats.health.cached).toBe(false);
      expect(stats.health.age).toBeNull();
    });
  });

  describe('clearAllCaches()', () => {
    test('should clear all cache types', () => {
      dashboardCache.set('key1', 'data1');
      analyticsCache.set('key2', 'data2');
      metricsCache.set('key3', 'data3');
      queryCache.set('key4', 'data4');
      addToFileCache('file1.js', 'content1');
      updateHealthCache({ status: 'healthy' });

      clearAllCaches();

      expect(dashboardCache.cache.size).toBe(0);
      expect(analyticsCache.cache.size).toBe(0);
      expect(metricsCache.cache.size).toBe(0);
      expect(queryCache.cache.size).toBe(0);
      expect(fileCache.size).toBe(0);
      expect(getHealthCache()).toBeNull();
    });

    test('should reset health cache properly', () => {
      updateHealthCache({ status: 'healthy', uptime: 1000 });

      clearAllCaches();

      const stats = getAllCacheStats();
      expect(stats.health.cached).toBe(false);
      expect(stats.health.age).toBeNull();
    });
  });
});
