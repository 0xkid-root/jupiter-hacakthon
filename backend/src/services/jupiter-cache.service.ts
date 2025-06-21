import { CacheService } from './cache.service';
import { logger } from '../utils/logger';
import { Redis } from 'ioredis';

/**
 * Cache service specifically for Jupiter API responses
 */
export class JupiterCacheService {
  private readonly PREFIX = 'jupiter';
  
  constructor(
    private readonly cacheService: CacheService,
    private readonly redisClient?: Redis
  ) {}
  
  /**
   * Directly get a value from the cache
   * @param key Cache key
   * @returns Cached value or null if not found
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      return await this.cacheService.get<T>(key);
    } catch (error) {
      logger.error('Failed to get value from cache', { error, key });
      return null;
    }
  }
  
  /**
   * Directly set a value in the cache
   * @param key Cache key
   * @param value Value to cache
   * @param ttl Time to live in seconds (optional)
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<boolean> {
    try {
      await this.cacheService.set(key, value, ttl);
      return true;
    } catch (error) {
      logger.error('Failed to set value in cache', { error, key });
      return false;
    }
  }

  private getKey(prefix: string, params: Record<string, any> = {}): string {
    const sortedParams = Object.entries(params)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => {
        if (Array.isArray(value)) {
          return `${key}=${value.sort().join(',')}`;
        }
        return `${key}=${value}`;
      })
      .join('&');
    
    return `${this.PREFIX}:${prefix}:${sortedParams ? `?${sortedParams}` : ''}`;
  }

  async getOrSet<T>(
    prefix: string,
    params: Record<string, any>,
    fetchFn: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const key = this.getKey(prefix, params);
    
    try {
      const cached = await this.cacheService.get<T>(key);
      if (cached !== null) {
        logger.debug('Cache hit', { key });
        return cached;
      }
      
      logger.debug('Cache miss', { key });
      const data = await fetchFn();
      await this.cacheService.set(key, data, ttl);
      return data;
    } catch (error) {
      logger.error('Cache operation failed', { error, key });
      // If cache fails, still try to get data from the source
      return fetchFn();
    }
  }

  async invalidate(prefix: string, params?: Record<string, any>): Promise<void> {
    const key = this.getKey(prefix, params);
    try {
      await this.cacheService.del(key);
      logger.debug('Cache invalidated', { key });
    } catch (error) {
      logger.error('Failed to invalidate cache', { error, key });
    }
  }

  async invalidateAll(prefix: string): Promise<void> {
    try {
      // This assumes the cache service supports pattern-based invalidation
      // If not, this method should be implemented differently based on the cache backend
      await this.cacheService.del(`${this.PREFIX}:${prefix}:*`);
      logger.debug('All cache invalidated for prefix', { prefix });
    } catch (error) {
      logger.error('Failed to invalidate all cache', { error, prefix });
    }
  }

  // Specific cache methods for Jupiter API endpoints
  async getQuote(params: any, fetchFn: () => Promise<any>): Promise<any> {
    // Cache quotes for a short time (5 minutes) since prices can change frequently
    return this.getOrSet('quote', params, fetchFn, 300);
  }

  async getPrice(params: any, fetchFn: () => Promise<any>): Promise<any> {
    // Cache prices for a short time (1 minute) since they can change frequently
    return this.getOrSet('price', params, fetchFn, 60);
  }

  async getTokens(fetchFn: () => Promise<any>): Promise<any> {
    // Cache token list for a longer time (1 hour) since it doesn't change often
    return this.getOrSet('tokens', {}, fetchFn, 3600);
  }

  async getProgramIdToLabel(fetchFn: () => Promise<any>): Promise<any> {
    // Cache program ID to label mapping for a long time (24 hours)
    return this.getOrSet('program-id-to-label', {}, fetchFn, 86400);
  }
}
