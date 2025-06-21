import { Redis } from 'ioredis';
import { logger } from '../utils/logger';

export interface CacheService {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: any, ttl?: number): Promise<void>;
  del(key: string | string[]): Promise<void>;
  withCache<T>(key: string, fn: () => Promise<T>, ttl?: number): Promise<T>;
  invalidatePattern(pattern: string): Promise<void>;
}

export class RedisCacheService implements CacheService {
  constructor(private readonly redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await this.redis.get(key);
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch (error) {
      logger.error(`Cache get failed for key ${key}:`, error);
      return null;
    }
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      if (ttl) {
        await this.redis.set(key, serialized, 'EX', ttl);
      } else {
        await this.redis.set(key, serialized);
      }
    } catch (error) {
      logger.error(`Cache set failed for key ${key}:`, error);
      throw error;
    }
  }

  async del(key: string | string[]): Promise<void> {
    try {
      await this.redis.del(Array.isArray(key) ? key : [key]);
    } catch (error) {
      logger.error(`Cache delete failed for keys ${key}:`, error);
      throw error;
    }
  }

  async withCache<T>(
    key: string,
    fn: () => Promise<T>,
    ttl: number = 300 // Default 5 minutes
  ): Promise<T> {
    try {
      const cached = await this.get<T>(key);
      if (cached !== null) {
        logger.debug(`Cache hit for key: ${key}`);
        return cached;
      }

      logger.debug(`Cache miss for key: ${key}`);
      const result = await fn();
      await this.set(key, result, ttl);
      return result;
    } catch (error) {
      logger.error(`Cache operation failed for key ${key}:`, error);
      // If cache fails, still try to get data from the source
      return fn();
    }
  }

  async invalidatePattern(pattern: string): Promise<void> {
    try {
      const stream = this.redis.scanStream({
        match: pattern,
        count: 100
      });

      const keys: string[] = [];
      
      return new Promise((resolve, reject) => {
        stream.on('data', (resultKeys: string[]) => {
          if (resultKeys.length) {
            keys.push(...resultKeys);
          }
        });

        stream.on('end', async () => {
          if (keys.length) {
            logger.debug(`Invalidating cache keys with pattern ${pattern}:`, keys);
            await this.del(keys);
          }
          resolve();
        });

        stream.on('error', (err) => {
          logger.error(`Error scanning cache keys with pattern ${pattern}:`, err);
          reject(err);
        });
      });
    } catch (error) {
      logger.error(`Error invalidating cache with pattern ${pattern}:`, error);
      throw error;
    }
  }
}

export class InMemoryCacheService implements CacheService {
  private cache: Map<string, { value: any; expiresAt?: number }> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor(cleanupIntervalMs: number = 60 * 60 * 1000) {
    // Run cleanup every hour by default
    this.cleanupInterval = setInterval(() => this.cleanup(), cleanupIntervalMs);
    
    // Properly clean up interval on process exit
    if (process.env.NODE_ENV !== 'test') {
      process.on('SIGTERM', () => this.shutdown());
      process.on('SIGINT', () => this.shutdown());
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const item = this.cache.get(key);
    if (!item) return null;

    if (item.expiresAt && item.expiresAt < Date.now()) {
      this.cache.delete(key);
      return null;
    }

    return item.value as T;
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    const expiresAt = ttl ? Date.now() + ttl * 1000 : undefined;
    this.cache.set(key, { value, expiresAt });
  }

  async del(key: string | string[]): Promise<void> {
    const keys = Array.isArray(key) ? key : [key];
    keys.forEach(k => this.cache.delete(k));
  }

  async withCache<T>(
    key: string,
    fn: () => Promise<T>,
    ttl: number = 300
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const result = await fn();
    await this.set(key, result, ttl);
    return result;
  }

  async invalidatePattern(pattern: string): Promise<void> {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (item.expiresAt && item.expiresAt < now) {
        this.cache.delete(key);
      }
    }
  }

  shutdown(): void {
    clearInterval(this.cleanupInterval);
    this.cache.clear();
  }
}

// Factory function to create appropriate cache service based on configuration
export function createCacheService(redisUrl?: string): CacheService {
  if (redisUrl) {
    try {
      const redis = new Redis(redisUrl, {
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3,
        enableOfflineQueue: true,
      });

      redis.on('error', (err) => {
        logger.error('Redis error:', err);
      });

      redis.on('connect', () => {
        logger.info('Connected to Redis');
      });

      return new RedisCacheService(redis);
    } catch (error) {
      logger.error('Failed to connect to Redis, falling back to in-memory cache', error);
    }
  }

  logger.warn('Using in-memory cache. This is not recommended for production.');
  return new InMemoryCacheService();
}
