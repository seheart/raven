/**
 * Tests for Cache Utilities
 * Tests LRU file cache and health cache functionality from Phase 3
 */
import { fileCache, addToFileCache, getHealthCache, updateHealthCache, clearFileCache, MAX_CACHE_SIZE, HEALTH_CACHE_TTL } from '../../utils/cache.js';
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
            const healthData = { status: 'healthy' };
            updateHealthCache(healthData);
            // Check just before TTL expires
            setTimeout(() => {
                const cached = getHealthCache();
                expect(cached).not.toBeNull();
            }, HEALTH_CACHE_TTL - 100);
            // Check just after TTL expires
            setTimeout(() => {
                const cached = getHealthCache();
                expect(cached).toBeNull();
                done();
            }, HEALTH_CACHE_TTL + 100);
        }, 10000);
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
});
//# sourceMappingURL=cache.test.js.map