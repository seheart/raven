/**
 * Simple LRU Cache Service for API Response Caching
 * Provides in-memory caching with TTL and automatic expiration
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';

interface CacheItem {
  value: unknown;
  expiry: number;
  created: number;
}

interface CacheStats {
  size: number;
  maxSize: number;
  hits: number;
  misses: number;
  hitRate: string;
}

class SimpleCache {
  private cache: Map<string, CacheItem>;
  private maxSize: number;
  private hits: number;
  private misses: number;

  constructor(maxSize = 500) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.hits = 0;
    this.misses = 0;
  }

  get(key: string): unknown {
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

  set(key: string, value: unknown, ttl = 5000): void {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      value,
      expiry: Date.now() + ttl,
      created: Date.now()
    });
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? ((this.hits / total) * 100).toFixed(2) + '%' : '0%'
    };
  }

  cleanup(): number {
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

const cache = new SimpleCache(500);

const cacheCleanupInterval = setInterval(() => {
  const cleaned = cache.cleanup();
  if (cleaned > 0) {
    console.log('[Cache] Cleaned up ' + cleaned + ' expired entries'); // eslint-disable-line no-console
  }
}, 60000);
cacheCleanupInterval.unref();

export function stopCacheCleanup(): void {
  clearInterval(cacheCleanupInterval);
}

export function cacheMiddleware(ttl = 5000): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method !== 'GET') {
      next();
      return;
    }

    const key = req.method + ':' + (req.originalUrl || req.url);
    const cached = cache.get(key);

    if (cached !== null) {
      res.json(cached);
      return;
    }

    const originalJson = res.json.bind(res);
    res.json = function (data: unknown): Response {
      cache.set(key, data, ttl);
      return originalJson(data);
    };

    next();
  };
}
