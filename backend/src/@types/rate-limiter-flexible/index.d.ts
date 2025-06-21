declare module 'rate-limiter-flexible' {
  export interface IRateLimiterOptions {
    points: number;
    duration: number;
    blockDuration?: number;
    execEvenly?: boolean;
    keyPrefix?: string;
    storeClient?: any;
    storeType?: string;
    dbName?: string;
    tableName?: string;
    tableCreated?: boolean;
    clearExpiredByTimeout?: boolean;
    inmemoryBlockOnConsumed?: number;
    inmemoryBlockDuration?: number;
    insuranceLimiter?: any;
    storeErrorMessage?: string;
    execEvenlyMinDelayMs?: number;
    indexKeyPrefix?: Record<string, string>;
    inmemoryBlockTTL?: number;
  }

  export class RateLimiterMemory {
    constructor(opts: IRateLimiterOptions);
    consume(key: string, points?: number, options?: any): Promise<IRateLimiterRes>;
    get(key: string): Promise<IRateLimiterRes | null>;
    delete(key: string): Promise<void>;
    block(key: string, secDuration: number): Promise<void>;
  }

  export interface IRateLimiterRes {
    remainingPoints: number;
    msBeforeNext: number;
    consumedPoints: number;
    isFirstInDuration: boolean;
  }
}
