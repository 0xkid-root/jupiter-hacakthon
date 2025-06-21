import { v4 as uuidv4 } from 'uuid';
import { Pool, PoolClient } from 'pg';
import { Redis } from 'ioredis';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errors';
import { validateAddress } from '../utils/validation';
import { CacheService } from './cache.service';

// Database table names
const TABLES = {
  PROFILES: 'user_profiles',
  POSTS: 'posts',
  COMMENTS: 'comments',
  INTERACTIONS: 'interactions',
  MARKET_BUZZ: 'market_buzz',
  TRADE_ACTIVITIES: 'trade_activities',
  POST_TAGS: 'post_tags',
  USER_FOLLOWERS: 'user_followers'
} as const;

// Cache keys
const CACHE_KEYS = {
  USER_PROFILE: (userId: string) => `user:${userId}:profile`,
  USER_FEED: (userId: string) => `user:${userId}:feed`,
  POST: (postId: string) => `post:${postId}`,
  POST_COMMENTS: (postId: string) => `post:${postId}:comments`
} as const;

// Cache TTLs in seconds
const CACHE_TTL = {
  SHORT: 300, // 5 minutes
  MEDIUM: 3600, // 1 hour
  LONG: 86400 // 24 hours
} as const;

// Database repository interface
interface DatabaseRepository<T> {
  findById(id: string): Promise<T | null>;
  create(data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T>;
  update(id: string, updates: Partial<T>): Promise<T | null>;
  delete(id: string): Promise<boolean>;
}

// Base repository implementation
abstract class BaseRepository<T extends { id: string }> implements DatabaseRepository<T> {
  constructor(
    protected readonly pool: Pool,
    protected readonly tableName: string,
    protected readonly cacheService: CacheService
  ) {}

  async findById(id: string): Promise<T | null> {
    const cacheKey = `${this.tableName}:${id}`;
    return await this.cacheService.withCache(
      cacheKey,
      async () => {
        const { rows: [item] } = await this.query<T>(
          `SELECT * FROM ${this.tableName} WHERE id = $1`,
          [id]
        );
        return item || null;
      },
      CACHE_TTL.MEDIUM
    );
  }

  async create(data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T> {
    const id = `${this.tableName.slice(0, -1)}_${uuidv4()}`; // Remove 's' from table name for ID prefix
    const now = new Date();
    
    // Get column names and values from data object
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = columns.map((_, i) => `$${i + 3}`).join(', ');
    
    const queryText = `
      INSERT INTO ${this.tableName} 
      (id, created_at, updated_at, ${columns.join(', ')})
      VALUES ($1, $2, $2, ${placeholders})
      RETURNING *
    `;
    
    const { rows: [item] } = await this.query<T>(
      queryText,
      [id, now, ...values]
    );

    // Invalidate cache for this item
    await this.cacheService.invalidate(`${this.tableName}:${id}`);

    return item;
  }

  async update(id: string, updates: Partial<T>): Promise<T | null> {
    // Don't allow updating id, created_at, or updated_at directly
    const { id: _, createdAt, updatedAt, ...safeUpdates } = updates as any;
    
    if (Object.keys(safeUpdates).length === 0) {
      return this.findById(id);
    }
    
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    
    // Build dynamic SET clause
    for (const [key, value] of Object.entries(safeUpdates)) {
      if (value !== undefined) {
        setClauses.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }
    
    // Always update the updated_at timestamp
    setClauses.push(`updated_at = $${paramIndex}`);
    values.push(new Date());
    
    const queryText = `
      UPDATE ${this.tableName}
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex + 1}
      RETURNING *
    `;
    
    const { rows: [item] } = await this.query<T>(
      queryText,
      [...values, id]
    );

    if (item) {
      // Invalidate cache for this item
      await this.cacheService.invalidate(`${this.tableName}:${id}`);
    }

    return item || null;
  }

  async delete(id: string): Promise<boolean> {
    const { rowCount } = await this.query(
      `DELETE FROM ${this.tableName} WHERE id = $1`,
      [id]
    );

    if (rowCount > 0) {
      // Invalidate cache for this item
      await this.cacheService.invalidate(`${this.tableName}:${id}`);
      return true;
    }

    return false;
  }

  protected async query<R = any>(text: string, params?: any[]): Promise<{ rows: R[]; rowCount: number }> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<R>(text, params);
      return { rows: result.rows, rowCount: result.rowCount || 0 };
    } catch (error) {
      logger.error(`Database query failed: ${error}`);
      throw new AppError('Database operation failed', 500);
    } finally {
      client.release();
    }
  }

  protected async withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Transaction failed: ${error}`);
      throw new AppError('Transaction failed', 500);
    } finally {
      client.release();
    }
  }
}

// Cache service for Redis
class RedisCacheService {
  constructor(private readonly redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await this.redis.get(key);
      return data ? JSON.parse(data) : null;
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
    }
  }

  async invalidate(keys: string | string[]): Promise<void> {
    try {
      await this.redis.del(Array.isArray(keys) ? keys : [keys]);
    } catch (error) {
      logger.error(`Cache invalidation failed for keys ${keys}:`, error);
    }
  }

  async withCache<T>(
    key: string,
    fn: () => Promise<T>,
    ttl: number = CACHE_TTL.MEDIUM
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached) return cached;

    const result = await fn();
    await this.set(key, result, ttl);
    return result;
  }
}

export interface UserProfile {
  id: string;
  username: string;
  address: string;
  bio?: string;
  followers: number;
  following: number;
  verificationStatus: 'none' | 'verified' | 'topTrader';
  winRate?: number;
  tradeCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Post {
  id: string;
  userId: string;
  content: string;
  attachments?: Array<{ type: 'image' | 'video' | 'link'; url: string; aiAnnotation?: string }>;
  sentiment?: { score: number; type: 'bullish' | 'bearish' | 'neutral' };
  tags?: string[];
  likes: number;
  comments: number;
  shares: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Comment {
  id: string;
  postId: string;
  userId: string;
  content: string;
  likes: number;
  replyTo?: string;
  attachments?: Array<{ type: 'image' | 'link'; url: string; aiPreview?: string }>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Interaction {
  id: string;
  userId: string;
  targetId: string;
  type: 'like' | 'share' | 'bookmark' | 'follow' | 'copyTrade';
  createdAt: Date;
}

export interface MarketBuzz {
  id: string;
  content: string;
  sentiment: { score: number; type: 'bullish' | 'bearish' | 'neutral' };
  asset: string;
  sources: Array<{ type: 'xPost' | 'news' | 'community'; url: string }>;
  trendingTags: string[];
  createdAt: Date;
}

export interface TradeActivity {
  id: string;
  userId: string;
  asset: string;
  action: 'buy' | 'sell';
  entryPrice: number;
  volume: number;
  commentary?: string;
  aiContext?: string;
  status: 'open' | 'closed';
  profitLoss?: number;
  createdAt: Date;
  updatedAt: Date;
}

export class SocialService extends BaseRepository<UserProfile> {
  private readonly pool: Pool;
  private readonly redis: Redis;
  private readonly cacheService: RedisCacheService;

  constructor() {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    const redis = new Redis(process.env.REDIS_URL);
    const cacheService = new RedisCacheService(redis);
    super(pool, TABLES.PROFILES, cacheService);
    
    this.pool = pool;
    this.redis = redis;
    this.cacheService = new RedisCacheService(redis);
    logger.info('SocialService initialized');
  }

  async createProfile(address: string, username: string, bio?: string): Promise<UserProfile> {
    // Check if profile already exists
    const { rows } = await this.query(
      'SELECT * FROM user_profiles WHERE address = $1 OR username = $2',
      [address, username]
    );
    if (rows.length > 0) {
      throw new Error('Profile with this address or username already exists');
    }

    const profile: UserProfile = {
      id: `profile_${uuidv4()}`,
      address,
      username,
      bio,
      followers: 0,
      following: 0,
      verificationStatus: 'none',
      tradeCount: 0,
      winRate: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const { rows: [createdProfile] } = await this.query(
      `INSERT INTO user_profiles 
       (id, address, username, bio, followers, following, verification_status, trade_count, win_rate, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [profile.id, address, username, bio, 0, 0, 'none', 0, 0, profile.createdAt, profile.updatedAt]
    );

    await this.cacheService.set(
      CACHE_KEYS.USER_PROFILE(profile.id),
      createdProfile,
      CACHE_TTL.MEDIUM
    );

    logger.info(`Created profile for user ${username}`);
    return createdProfile;
  }

  async createPost(
    userId: string,
    content: string,
    attachments: Post['attachments'] = [],
    sentiment?: Post['sentiment'],
    tags: string[] = []
  ): Promise<Post> {
    if (!content.trim()) {
      throw new Error('Post content cannot be empty');
    }

    // Analyze sentiment if not provided
    const postSentiment = sentiment || this.analyzeSentiment(content);
    // Generate AI tags if not provided
    const postTags = tags.length > 0 ? tags : this.generateAITags(content);
    // Process attachments
    const processedAttachments = await Promise.all(
      attachments.map(async (attachment) => ({
        ...attachment,
        aiAnnotation: await this.generateAIAnnotation(attachment)
      }))
    );

    const post: Post = {
      id: `post_${uuidv4()}`,
      userId,
      content,
      attachments: processedAttachments,
      sentiment: postSentiment,
      tags: postTags,
      likes: 0,
      comments: 0,
      shares: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const { rows: [createdPost] } = await this.query(
      `INSERT INTO posts 
       (id, user_id, content, attachments, sentiment, tags, likes, comments, shares, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [post.id, userId, content, JSON.stringify(processedAttachments), JSON.stringify(postSentiment),
       postTags, 0, 0, 0, post.createdAt, post.updatedAt]
    );

    await this.cacheService.set(
      CACHE_KEYS.POST(post.id),
      createdPost,
      CACHE_TTL.MEDIUM
    );

    logger.info(`Created post ${post.id} by user ${userId}`);
    return createdPost;
  }

  async createComment(
    userId: string,
    postId: string,
    content: string,
    replyTo?: string,
    attachments: Comment['attachments'] = []
  ): Promise<Comment> {
    const { rows: [post] } = await this.query(
      'SELECT * FROM posts WHERE id = $1 AND deleted_at IS NULL',
      [postId]
    );
    if (!post) {
      throw new Error('Post not found');
    }

    if (!content.trim()) {
      throw new Error('Comment cannot be empty');
    }

    // Process attachments
    const processedAttachments = await Promise.all(
      attachments.map(async (attachment) => ({
        ...attachment,
        aiPreview: await this.generateAIPreview(attachment)
      }))
    );

    const comment: Comment = {
      id: `comment_${uuidv4()}`,
      postId,
      userId,
      content,
      replyTo,
      attachments: processedAttachments,
      likes: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.withTransaction(async (client) => {
      // Insert comment
      await client.query(
        `INSERT INTO comments 
         (id, post_id, user_id, content, reply_to, attachments, likes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [comment.id, postId, userId, content, replyTo, JSON.stringify(processedAttachments),
         0, comment.createdAt, comment.updatedAt]
      );

      // Update post comment count
      await client.query(
        `UPDATE posts 
         SET comments = comments + 1, updated_at = $1
         WHERE id = $2`,
        [new Date(), postId]
      );
    });

    await this.cacheService.invalidate([
      CACHE_KEYS.POST(postId),
      CACHE_KEYS.POST_COMMENTS(postId)
    ]);

    logger.info(`Created comment ${comment.id} on post ${postId} by user ${userId}`);
    return comment;
  }

  async createInteraction(userId: string, targetId: string, type: Interaction['type']): Promise<Interaction> {
    // Check if target exists based on type
    const targetExists = await this.checkTargetExists(targetId, type);
    if (!targetExists) {
      throw new Error('Target not found');
    }

    // Check for duplicate interactions
    const { rows: [existingInteraction] } = await this.query(
      'SELECT * FROM interactions WHERE user_id = $1 AND target_id = $2 AND type = $3',
      [userId, targetId, type]
    );

    if (existingInteraction) {
      return existingInteraction; // Or throw error for duplicate
    }

    const interaction: Interaction = {
      id: `interaction_${uuidv4()}`,
      userId,
      targetId,
      type,
      createdAt: new Date(),
    };

    await this.withTransaction(async (client) => {
      // Insert interaction
      await client.query(
        `INSERT INTO interactions 
         (id, user_id, target_id, type, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [interaction.id, userId, targetId, type, interaction.createdAt]
      );

      // Update relevant counters
      if (type === 'like') {
        await client.query(
          `UPDATE posts 
           SET likes = likes + 1, updated_at = $1
           WHERE id = $2`,
          [new Date(), targetId]
        );
      } else if (type === 'follow') {
        await client.query(
          `UPDATE user_profiles 
           SET following = following + 1
           WHERE id = $1`,
          [userId]
        );
        await client.query(
          `UPDATE user_profiles 
           SET followers = followers + 1
           WHERE id = $1`,
          [targetId]
        );
      }
    });

    // Invalidate relevant cache entries
    await this.cacheService.invalidate([
      CACHE_KEYS.USER_PROFILE(userId),
      CACHE_KEYS.USER_PROFILE(targetId),
      CACHE_KEYS.POST(targetId)
    ]);

    logger.info(`Created ${type} interaction by user ${userId} on target ${targetId}`);
    return interaction;
  }

  async getFeed(
    userId: string,
    page: number = 1,
    limit: number = 10,
    filters?: { assets?: string[]; traders?: string[]; type?: 'posts' | 'buzz' | 'trades' }
  ): Promise<Array<Post | MarketBuzz | TradeActivity>> {
    const startIdx = (page - 1) * limit;
    let feedItems: Array<Post | MarketBuzz | TradeActivity> = [];

    // Get followed users from interactions table
    const { rows: followedUsers } = await this.query(
      'SELECT target_id FROM interactions WHERE user_id = $1 AND type = $2',
      [userId, 'follow']
    );
    const followedUserIds = followedUsers.map(row => row.target_id);

    // Include the user's own posts in the feed
    const relevantUserIds = [...followedUserIds, userId];

    // Get posts from followed users and self
    const { rows: userPosts } = await this.query(
      `SELECT * FROM posts 
       WHERE user_id = ANY($1::text[])
       ORDER BY created_at DESC`,
      [relevantUserIds]
    );

    // Get market buzz
    const { rows: buzzItems } = await this.query(
      'SELECT * FROM market_buzz ORDER BY created_at DESC'
    );

    // Get trade activities
    const { rows: tradeItems } = await this.query(
      `SELECT * FROM trade_activities 
       WHERE user_id = ANY($1::text[])
       ORDER BY created_at DESC`,
      [relevantUserIds]
    );

    // Apply filters
    if (filters) {
      let filteredUserPosts = [...userPosts];
      let filteredBuzzItems = [...buzzItems];
      let filteredTradeItems = [...tradeItems];
      
      if (filters.assets?.length) {
        const assetSet = new Set(filters.assets.map(a => a.toLowerCase()));
        filteredUserPosts = filteredUserPosts.filter(post => 
          post.tags?.some(tag => assetSet.has(tag.toLowerCase()))
        );
        
        filteredBuzzItems = filteredBuzzItems.filter(buzz => 
          filters.assets?.some(asset => 
            buzz.content.toLowerCase().includes(asset.toLowerCase())
          )
        );
        
        filteredTradeItems = filteredTradeItems.filter(trade => 
          filters.assets?.some(asset => 
            trade.asset.toLowerCase() === asset.toLowerCase()
          )
        );
      }

      if (filters.traders?.length) {
        const traderSet = new Set(filters.traders);
        filteredUserPosts = filteredUserPosts.filter(post => traderSet.has(post.userId));
        filteredTradeItems = filteredTradeItems.filter(trade => traderSet.has(trade.userId));
      }

      if (filters.type) {
        switch (filters.type) {
          case 'posts':
            feedItems = filteredUserPosts;
            break;
          case 'buzz':
            feedItems = filteredBuzzItems;
            break;
          case 'trades':
            feedItems = filteredTradeItems;
            break;
        }
      } else {
        // Default: mix all types
        feedItems = [...userPosts, ...buzzItems, ...tradeItems]
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }
    } else {
      // No filters, return all items mixed
      feedItems = [...userPosts, ...buzzItems, ...tradeItems]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }

    // Apply pagination
    return feedItems.slice(startIdx, startIdx + limit);
  }

  async getProfile(userId: string): Promise<UserProfile | null> {
    const cachedProfile = await this.cacheService.get<UserProfile>(CACHE_KEYS.USER_PROFILE(userId));
    if (cachedProfile) return cachedProfile;

    const { rows: [profile] } = await this.query(
      'SELECT * FROM user_profiles WHERE id = $1 OR address = $2',
      [userId, userId]
    );
    if (!profile) return null;

    // Calculate win rate if applicable
    if (profile.trade_count && profile.trade_count > 0) {
      const { rows: trades } = await this.query(
        'SELECT profit_loss FROM trade_activities WHERE user_id = $1 AND status = $2',
        [profile.id, 'closed']
      );
      const winningTrades = trades.filter(t => (t.profit_loss || 0) > 0).length;
      profile.win_rate = Math.round((winningTrades / trades.length) * 100);

      await this.query(
        'UPDATE user_profiles SET win_rate = $1 WHERE id = $2',
        [profile.win_rate, profile.id]
      );
    }

    await this.cacheService.set(
      CACHE_KEYS.USER_PROFILE(userId),
      profile,
      CACHE_TTL.SHORT
    );

    return profile;
  }

  async getPostComments(postId: string, page: number = 1, limit: number = 10): Promise<Comment[]> {
    const { rows: [post] } = await this.query(
      'SELECT * FROM posts WHERE id = $1 AND deleted_at IS NULL',
      [postId]
    );
    if (!post) {
      throw new Error('Post not found');
    }

    const { rows: comments } = await this.query(
      `SELECT * FROM comments 
       WHERE post_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [postId, limit, (page - 1) * limit]
    );

    return comments;
  }

  async updateProfile(userId: string, updates: Partial<UserProfile>): Promise<UserProfile> {
    // Prevent updating protected fields
    const { id, address, createdAt, followers, following, ...safeUpdates } = updates;
    
    const { rows: [updatedProfile] } = await this.query(
      `UPDATE user_profiles 
       SET 
         username = COALESCE($1, username),
         bio = COALESCE($2, bio),
         verification_status = COALESCE($3, verification_status),
         updated_at = $4
       WHERE id = $5 AND deleted_at IS NULL
       RETURNING *`,
      [safeUpdates.username, safeUpdates.bio, safeUpdates.verificationStatus, new Date(), userId]
    );

    if (!updatedProfile) {
      throw new Error('Profile not found');
    }

    await this.cacheService.invalidate(CACHE_KEYS.USER_PROFILE(userId));
    logger.info(`Updated profile for user ${userId}`);
    return updatedProfile;
  }

  async deletePost(userId: string, postId: string): Promise<void> {
    const { rows: [post] } = await this.query(
      'SELECT * FROM posts WHERE id = $1',
      [postId]
    );
    if (!post) {
      throw new Error('Post not found');
    }

    if (post.user_id !== userId) {
      throw new Error('Not authorized to delete this post');
    }

    await this.withTransaction(async (client) => {
      // Soft delete the post
      await client.query(
        `UPDATE posts 
         SET deleted_at = $1, updated_at = $1
         WHERE id = $2`,
        [new Date(), postId]
      );

      // Soft delete associated comments
      await client.query(
        `UPDATE comments 
         SET deleted_at = $1, updated_at = $1
         WHERE post_id = $2`,
        [new Date(), postId]
      );
    });

    // Invalidate caches
    await this.cacheService.invalidate([
      CACHE_KEYS.POST(postId),
      CACHE_KEYS.POST_COMMENTS(postId),
      CACHE_KEYS.USER_FEED(userId)
    ]);

    logger.info(`Deleted post ${postId} by user ${userId}`);
  }

  async closeTradeActivity(tradeId: string, profitLoss: number): Promise<TradeActivity> {
    return await this.withTransaction(async (client) => {
      // Update trade status and profit/loss
      const { rows: [trade] } = await client.query(
        `UPDATE trade_activities 
         SET status = $1, profit_loss = $2, updated_at = $3
         WHERE id = $4
         RETURNING *`,
        ['closed', profitLoss, new Date(), tradeId]
      );

      if (!trade) {
        throw new Error('Trade activity not found');
      }

      // Update user's trade statistics
      await client.query(
        `UPDATE user_profiles 
         SET trade_count = trade_count + 1
         WHERE id = $1`,
        [trade.user_id]
      );

      await this.cacheService.invalidate([
        CACHE_KEYS.USER_PROFILE(trade.user_id),
        `trade:${tradeId}`
      ]);

      return trade;
    });
  }

  async getThreadSummary(postId: string): Promise<string> {
    const { rows: comments } = await this.query(
      `SELECT content 
       FROM comments 
       WHERE post_id = $1 AND deleted_at IS NULL
       ORDER BY created_at ASC`,
      [postId]
    );

    if (comments.length === 0) {
      return 'No discussion thread found';
    }

    // In a real implementation, use AI to generate a summary
    const threadContent = comments.map(c => c.content).join('\n');
    return `Thread contains ${comments.length} comments. AI summary generation pending implementation.`;
  }

  private async checkTargetExists(targetId: string, type: Interaction['type']): Promise<boolean> {
    let exists = false;
    
    switch(type) {
      case 'like':
      case 'share':
      case 'bookmark':
        const { rows: [post] } = await this.query(
          'SELECT id FROM posts WHERE id = $1 AND deleted_at IS NULL',
          [targetId]
        );
        exists = !!post;
        break;
      case 'follow':
      case 'copyTrade':
        const { rows: [profile] } = await this.query(
          'SELECT id FROM user_profiles WHERE id = $1 AND deleted_at IS NULL',
          [targetId]
        );
        exists = !!profile;
        break;
    }
    
    return exists;
  }

  private analyzeSentiment(content: string): Post['sentiment'] {
    // Simple sentiment analysis (in a real app, use a proper NLP library)
    const positiveWords = ['bullish', 'moon', 'pump', 'buy', 'long', 'up', 'rise', 'growth', '🚀', '📈', '💎'];
    const negativeWords = ['bearish', 'dump', 'sell', 'short', 'down', 'drop', 'crash', 'scam', '📉', '🔥'];

    const contentLower = content.toLowerCase();
    const positiveScore = positiveWords.filter(word => contentLower.includes(word)).length;
    const negativeScore = negativeWords.filter(word => contentLower.includes(word)).length;

    const score = Math.max(-1, Math.min(1, (positiveScore - negativeScore) / 3));
    
    if (score > 0.3) return { score, type: 'bullish' };
    if (score < -0.3) return { score, type: 'bearish' };
    return { score, type: 'neutral' };
  }

  private generateAITags(content: string): string[] {
    // Simple tag extraction (in a real app, use NLP)
    const cryptoTerms = [
      'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOT', 'DOGE', 'SHIB', 'AVAX',
      'MATIC', 'LTC', 'LINK', 'UNI', 'ATOM', 'XLM', 'ALGO', 'VET', 'FIL', 'ICP',
      'AAVE', 'COMP', 'MKR', 'SNX', 'YFI', 'SUSHI', 'CRV', '1INCH', 'RUNE', 'GRT',
      'NFT', 'DeFi', 'DAO', 'Web3', 'Metaverse', 'GameFi', 'L2', 'ZKRollup', 'Stablecoin'
    ];
    
    // Also look for cashtags (e.g., $BTC, $ETH)
    const cashtags = [...content.matchAll(/\$([A-Z]{2,})/g)].map(match => match[1]);
    
    // Combine and deduplicate
    const allTerms = [
      ...cryptoTerms.filter(term => content.toUpperCase().includes(term)),
      ...cashtags
    ];
    
    return [...new Set(allTerms)].slice(0, 5); // Return up to 5 unique tags
  }

  private async generateAIAnnotation(attachment: { type: string; url: string }): Promise<string> {
    // In a real app, use an AI service to analyze the attachment
    const analysis: Record<string, string> = {
      'image': 'Image contains trading chart with bullish pattern',
      'video': 'Video discusses market trends and analysis',
      'link': 'Linked content appears to be a crypto news article'
    };
    
    return analysis[attachment.type] || `AI analyzed ${attachment.type}: ${attachment.url.substring(0, 30)}...`;
  }

  private async generateAIPreview(attachment: { type: string; url: string }): Promise<string> {
    // In a real app, generate a preview of the attachment
    const previews: Record<string, string> = {
      'image': 'Image attachment',
      'link': 'Link to external resource',
      'video': 'Video content'
    };
    
    return previews[attachment.type] || `Preview of ${attachment.type}: ${attachment.url.substring(0, 30)}...`;
  }

  private generateAIContext(asset: string, action: 'buy' | 'sell', entryPrice: number): string {
    // In a real app, generate AI context for the trade
    const strategies = {
      buy: [
        `Strong support identified at $${entryPrice} for ${asset}`,
        `Technical indicators show oversold conditions for ${asset}`,
        `Breaking out of a bullish pattern on ${asset}`,
        `Institutional buying detected in ${asset} market`
      ],
      sell: [
        `Resistance level reached at $${entryPrice} for ${asset}`,
        `Technical indicators show overbought conditions for ${asset}`,
        `Breaking down from a bearish pattern on ${asset}`,
        `Increased selling pressure detected in ${asset} market`
      ]
    };

    const randomStrategy = strategies[action][Math.floor(Math.random() * strategies[action].length)];
    return `${randomStrategy}. AI suggests ${action}ing ${asset} at $${entryPrice} based on current market conditions.`;
  }
}