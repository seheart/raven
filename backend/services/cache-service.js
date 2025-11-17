/**
 * Simple LRU Cache Service for API Response Caching
 * Provides in-memory caching with TTL and automatic expiration
 */

class SimpleCache {
  constructor(maxSize = 500) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.hits = 0;
    this.misses = 0;
  }

  get(key) {
    const item = this.cache.get(key);

    if (!item) {
      this.misses++;
      return null;
    }

    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.cache.delete(key);
    this.cache.set(key, item);
    this.hits++;

    return item.value;
  }

  set(key, value, ttl = 5000) {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      value,
      expiry: Date.now() + ttl,
      created: Date.now()
    });
  }

  delete(key) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

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

  cleanup() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiry) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }
}

export const cache = new SimpleCache(500);

setInterval(() => {
  const cleaned = cache.cleanup();
  if (cleaned > 0) {
    console.log('[Cache] Cleaned up ' + cleaned + ' expired entries');
  }
}, 60000);

export function cacheMiddleware(ttl = 5000) {
  return (req, res, next) => {
    if (req.method !== 'GET') {
      return next();
    }

    const key = req.method + ':' + (req.originalUrl || req.url);
    const cached = cache.get(key);

    if (cached) {
      return res.json(cached);
    }

    const originalJson = res.json.bind(res);
    res.json = function (data) {
      cache.set(key, data, ttl);
      return originalJson(data);
    };

    next();
  };
}

export default cache;
