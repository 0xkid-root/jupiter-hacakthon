import { Pool } from 'pg';
import logger from '../utils/logger';

class Database {
  private static instance: Database;
  private pool: Pool;
  private isConnected: boolean = false;

  private constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' 
        ? { rejectUnauthorized: false } 
        : false
    });

    this.setupEventListeners();
  }

  public static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  private setupEventListeners(): void {
    this.pool.on('connect', () => {
      this.isConnected = true;
      logger.info('Successfully connected to the database');
    });

    this.pool.on('error', (err: Error) => {
      logger.error('Unexpected error on idle database client', { error: err.message });
      this.isConnected = false;
    });
  }

  public async connect(): Promise<void> {
    try {
      // Test the connection
      const client = await this.pool.connect();
      logger.info('Database connection test successful');
      client.release();
    } catch (error) {
      logger.error('Failed to connect to the database', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  public getPool(): Pool {
    return this.pool;
  }

  public isDatabaseConnected(): boolean {
    return this.isConnected;
  }

  public async close(): Promise<void> {
    await this.pool.end();
    this.isConnected = false;
    logger.info('Database connection pool has been closed');
  }
}

export const database = Database.getInstance();
export const pool = database.getPool();
