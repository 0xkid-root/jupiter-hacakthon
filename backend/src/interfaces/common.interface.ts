// Rate limiter interface
export interface RateLimiter {
  removeTokens(count: number, callback: (err: Error | null, remaining: number) => void): void;
  getTokensRemaining(): number;
}

// Cache service interface
export interface CacheService {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: any, ttl?: number): Promise<void>;
  del(key: string | string[]): Promise<void>;
  withCache<T>(key: string, fn: () => Promise<T>, ttl?: number): Promise<T>;
  invalidatePattern(pattern: string): Promise<void>;
  clear?(): Promise<boolean>; // Optional for backward compatibility
}

// Redis client interface
export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl?: number): Promise<boolean>;
  del(key: string): Promise<boolean>;
  quit(): Promise<void>;
}

// Jupiter API configuration
export interface JupiterConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
  rateLimit?: {
    tokensPerInterval: number;
    interval: 'second' | 'minute' | 'hour' | 'day' | number;
  };
  cacheTtl?: number;
}

// Rate limit configuration
export interface RateLimitConfig {
  maxRequestsPerMinute: number;
  retryAfterMs: number;
}

// Base interface for query result rows
export interface QueryResultRow {
  [column: string]: any;
}

// Error response interface
export interface ErrorResponse {
  message: string;
  code?: string | number;
  details?: any;
}

// Request options interface
export interface RequestOptions {
  useCache?: boolean;
  skipCache?: boolean;
  ttl?: number;
  headers?: Record<string, string>;
  params?: Record<string, any>;
}
