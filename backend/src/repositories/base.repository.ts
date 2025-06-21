import { Pool, PoolClient, QueryResultRow } from 'pg';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errors';
import { CacheService } from '../interfaces/common.interface';

export interface DatabaseRepository<T> {
  findById(id: string): Promise<T | null>;
  create(data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T>;
  update(id: string, updates: Partial<T>): Promise<T | null>;
  delete(id: string): Promise<boolean>;
  count(filters?: Record<string, any>): Promise<number>;
  exists(id: string): Promise<boolean>;
}

export abstract class BaseRepository<T extends QueryResultRow & { id: string }> implements DatabaseRepository<T> {
  constructor(
    protected readonly pool: Pool,
    protected readonly tableName: string,
    protected readonly cacheService: CacheService
  ) {}

  abstract findById(id: string): Promise<T | null>;
  abstract create(data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T>;
  abstract update(id: string, updates: Partial<T>): Promise<T | null>;
  abstract delete(id: string): Promise<boolean>;
  abstract count(filters?: Record<string, any>): Promise<number>;
  
  async exists(id: string): Promise<boolean> {
    const result = await this.query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM ${this.tableName} WHERE id = $1)`,
      [id]
    );
    return result.rows[0]?.exists || false;
  }

  protected async query<R extends QueryResultRow>(
    text: string, 
    params: any[] = [],
    client?: PoolClient | null
  ): Promise<{ rows: R[]; rowCount: number }> {
    const start = Date.now();
    try {
      const execClient = client || await this.pool.connect();
      try {
        const result = await execClient.query<R>(text, params);
        const duration = Date.now() - start;
        logger.debug('Executed query', {
          query: text,
          duration,
          rows: result.rowCount
        });
        return { rows: result.rows, rowCount: result.rowCount || 0 };
      } finally {
        if (!client) {
          execClient.release();
        }
      }
    } catch (error) {
      logger.error('Database query failed', {
        error,
        query: text,
        params: JSON.stringify(params)
      });
      throw new AppError('Database operation failed', 500);
    }
  }

  protected async withTransaction<T>(
    callback: (client: PoolClient) => Promise<T>,
    isolationLevel: 'READ UNCOMMITTED' | 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE' = 'READ COMMITTED'
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query(`BEGIN ISOLATION LEVEL ${isolationLevel}`);
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Transaction failed', { error });
      throw error instanceof AppError ? error : new AppError('Transaction failed', 500);
    } finally {
      client.release();
    }
  }

  protected buildWhereClause(filters: Record<string, any> = {}): {
    whereClause: string;
    values: any[];
  } {
    const conditions: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined || value === null) continue;
      
      if (Array.isArray(value)) {
        if (value.length === 0) continue;
        const placeholders = value.map((_, i) => `$${paramIndex + i}`).join(',');
        conditions.push(`${key} IN (${placeholders})`);
        values.push(...value);
        paramIndex += value.length;
      } else {
        conditions.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { whereClause, values };
  }

  protected async invalidateCache(keys: string | string[]): Promise<void> {
    try {
      await this.cacheService.del(keys);
    } catch (error) {
      logger.error('Failed to invalidate cache', { error, keys });
    }
  }

  protected generateCacheKey(prefix: string, id: string): string {
    return `${prefix}:${id}`;
  }
}
