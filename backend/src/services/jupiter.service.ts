import axios, { AxiosError, AxiosInstance } from 'axios';
import axiosRetry, { IAxiosRetryConfig, exponentialDelay } from 'axios-retry';
import { v4 as uuidv4 } from 'uuid';
import config from '../config';
import { logger } from '../utils/logger';
import { 
  QuoteRequestParams,
  QuoteResponse,
  PriceRequestParams,
  PriceResponse,
  SwapTransactionRequest,
  SwapTransactionResponse,
  SwapInstructionsRequest,
  SwapInstructionsResponse,
  ProgramIdToLabelResponse,
  MintsInMarketResponse,
  TradableTokensResponse,
  TaggedTokensResponse,
  NewTokensResponse,
  AllTokensResponse,
  TokenInfo,
  TokenInfoResponse,
  SendTransactionRequest,
  SendTransactionResponse,
  JupiterErrorResponse
} from '../interfaces/jupiter.interface';
import { JupiterCacheService } from './jupiter-cache.service';
import { 
  RateLimiter,
  JupiterConfig,
  CacheService,
  RedisClient,
  RateLimitConfig,
  RequestOptions
} from '../interfaces/common.interface';
import { 
  JupiterError, 
  RateLimitError, 
  ValidationError, 
  NotFoundError, 
  InsufficientLiquidityError, 
  SlippageToleranceExceededError 
} from '../utils/jupiter-errors';

// Constants for API paths and configuration
const API_PATHS = {
  QUOTE: '/quote',
  SWAP: '/swap',
  TOKENS: '/tokens',
  PRICE: '/price',
  PROGRAM_ID_TO_LABEL: '/program-id-to-label',
  SWAP_INSTRUCTIONS: '/swap-instructions',
} as const;

// Default retry configuration
const DEFAULT_RETRY_CONFIG: IAxiosRetryConfig = {
  retries: 3,
  retryDelay: exponentialDelay,
  retryCondition: (error: AxiosError) => {
    // Retry on network errors and 5xx responses
    if (axiosRetry.isNetworkOrIdempotentRequestError(error)) {
      return true;
    }
    
    // Retry on rate limit exceeded (429) or server errors (5xx)
    if (error.response) {
      const status = error.response.status;
      return status === 429 || (status >= 500 && status < 600);
    }
    
    return false;
  },
  shouldResetTimeout: true,
};

// Rate limit configuration (moved to common.interface.ts)

const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  maxRequestsPerMinute: 60, // Adjust based on your rate limits
  retryAfterMs: 1000, // Default wait time when rate limited
};

/**
 * Service for interacting with the Jupiter Aggregator API with production-ready features:
 * - Automatic retries with exponential backoff
 * - Response caching
 * - Rate limiting
 * - Comprehensive error handling
 * - Request/response logging
 * - Circuit breaking (via axios-retry)
 */
class JupiterService {
  private readonly client: AxiosInstance;
  private readonly tokenClient: AxiosInstance;
  private readonly cache: JupiterCacheService;
  private readonly rateLimiter: RateLimiter;
  private readonly logger = logger;
  private readonly tokenBaseURL: string = 'https://token.jup.ag';
  private rateLimitRemaining: number = Number.MAX_SAFE_INTEGER;
  private rateLimitReset: number = 0;
  private requestQueue: Array<() => void> = [];
  private isProcessingQueue = false;
  private rateLimitConfig: RateLimitConfig = {
    maxRequestsPerMinute: 60,
    retryAfterMs: 1000
  };
  private useCache: boolean = true;
  private cacheTtl: number = 300; // 5 minutes

  constructor(private config: JupiterConfig) {
    // Initialize HTTP client
    this.client = this.createAxiosInstance(config.baseUrl);
    
    // Set up token client
    this.tokenClient = this.createAxiosInstance(this.tokenBaseURL);
    
    // Apply retry logic to both clients
    this.configureRetry(this.client);
    this.configureRetry(this.tokenClient);
    
    // Update rate limit config if provided
    if (config.rateLimit) {
      this.rateLimitConfig = {
        maxRequestsPerMinute: config.rateLimit.tokensPerInterval,
        retryAfterMs: 1000 // Default 1 second
      };
    }
    
    // Add request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        this.logger.debug(`Making request to ${config.url}`, {
          method: config.method,
          params: config.params,
          data: config.data,
        });
        return config;
      },
      (error) => {
        this.logger.error('Request error:', error);
        return Promise.reject(error);
      }
    );
    
    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => {
        if (response.status >= 400) {
          const error = new Error(`Request failed with status ${response.status}`);
          (error as any).response = response;
          return Promise.reject(error);
        }
        return response;
      },
      (error) => {
        if (error.response) {
          this.logger.error('Response error:', {
            status: error.response.status,
            statusText: error.response.statusText,
            data: error.response.data,
            url: error.config?.url,
            method: error.config?.method,
          });
        } else if (error.request) {
          this.logger.error('No response received:', error.request);
        } else {
          this.logger.error('Request setup error:', error.message);
        }
        return Promise.reject(error);
      }
    );

    // Configure the main Jupiter API client
    this.configureRetry(this.client);
    
    // Configure a separate client for token API with potentially different settings
    this.tokenClient = this.createAxiosInstance(this.tokenBaseURL);
    
    // Apply retry logic to both clients
    this.configureRetry(this.tokenClient);
    
    // Initialize rate limit tracking
    this.rateLimitRemaining = this.rateLimitConfig.maxRequestsPerMinute;
  }

  /**
   * Create a configured Axios instance with interceptors
   */
  private createAxiosInstance(baseURL: string): AxiosInstance {
    const instance = axios.create({
      baseURL,
      timeout: 30000, // 30 seconds default
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': '',
      },
      // @ts-ignore - validateStatus is a valid axios config property
      validateStatus: (status) => status >= 200 && status < 500,
    });

    // Add request interceptor for rate limiting and request ID
    instance.interceptors.request.use(async (config) => {
      const requestId = uuidv4();
      config.headers['X-Request-ID'] = requestId;
      
      // Check rate limits before making the request
      await this.checkRateLimit();
      
      logger.debug(`Making request to ${config.url}`, {
        method: config.method,
        params: config.params,
        requestId,
      });
      
      return config;
    });

    // Add response interceptor for logging and rate limit tracking
    instance.interceptors.response.use(
      (response) => {
        // Update rate limit info from response headers if available
        if (response.headers) {
          this.updateRateLimitInfo(response.headers);
        }
        
        logger.debug(`Response from ${response.config.url}`, {
          status: response.status,
          statusText: response.statusText,
          requestId: response.config.headers['X-Request-ID'],
        });
        
        return response;
      },
      async (error) => {
        if (error.response) {
          // Update rate limit info from error response if available
          if (error.response.headers) {
            this.updateRateLimitInfo(error.response.headers);
          }
          
          logger.error('API Error:', {
            status: error.response.status,
            statusText: error.response.statusText,
            url: error.config?.url,
            method: error.config?.method,
            requestId: error.config?.headers?.['X-Request-ID'],
            data: error.response.data,
          });
          
          // Convert to our custom error type
          throw this.handleError(error);
        } else if (error.request) {
          // The request was made but no response was received
          logger.error('No response received:', {
            url: error.config?.url,
            method: error.config?.method,
            requestId: error.config?.headers?.['X-Request-ID'],
            code: error.code,
            message: error.message,
          });
        } else {
          // Something happened in setting up the request
          logger.error('Request setup error:', {
            message: error.message,
            stack: error.stack,
          });
        }
        
        return Promise.reject(error);
      }
    );

    return instance;
  }

  /**
   * Configure retry logic for an Axios instance
   */
  private configureRetry(instance: AxiosInstance): void {
    // Use type assertion to work around the IAxiosRetryConfig type limitations
    const retryConfig: any = {
      ...DEFAULT_RETRY_CONFIG,
      retryIf: (error: AxiosError) => {
        // Don't retry on POST requests by default (override for specific endpoints if needed)
        if (error.config?.method?.toUpperCase() === 'POST') {
          return false;
        }
        
        // Retry on network errors and 5xx responses
        if (axiosRetry.isNetworkOrIdempotentRequestError(error)) {
          return true;
        }
        
        // Retry on rate limit exceeded (429) or server errors (5xx)
        if (error.response) {
          const status = error.response.status;
          return status === 429 || (status >= 500 && status < 600);
        }
        
        return false;
      },
    };
    
    axiosRetry(instance, retryConfig);
  }

  /**
   * Check rate limits before making a request
   * This is called automatically by the request interceptor
   */
  private async checkRateLimit(): Promise<void> {
    const now = Date.now();
    
    // Reset rate limit counter if the window has passed
    if (now > this.rateLimitReset) {
      this.rateLimitRemaining = this.rateLimitConfig.maxRequestsPerMinute;
      this.rateLimitReset = now + 60000; // 1 minute from now
      return;
    }
    
    // If we've hit the rate limit, wait until the reset time
    if (this.rateLimitRemaining <= 0) {
      const waitTime = this.rateLimitReset - now + 1000; // Add 1s buffer
      logger.warn(`Rate limit reached. Waiting ${waitTime}ms until reset`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
      // Reset the counter after waiting
      this.rateLimitRemaining = this.rateLimitConfig.maxRequestsPerMinute;
      this.rateLimitReset = Date.now() + 60000; // 1 minute from now
    }
    
    // Decrement the remaining requests counter
    this.rateLimitRemaining--;
  }

  /**
   * Update rate limit info from response headers
   */
  private updateRateLimitInfo(headers: any): void {
    if (headers['x-ratelimit-remaining']) {
      this.rateLimitRemaining = parseInt(headers['x-ratelimit-remaining'], 10) || 0;
    }
    
    if (headers['x-ratelimit-reset']) {
      this.rateLimitReset = parseInt(headers['x-ratelimit-reset'], 10) || 0;
    }
  }

  /**
   * Generate a cache key from URL and params
   */
  private getCacheKey(url: string, params: Record<string, any> = {}): string {
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}=${String(params[key])}`)
      .join('&');
    
    return `jupiter:${url}?${sortedParams}`;
  }

  /**
   * Make a GET request to the Jupiter API with caching support
   */
  async get<T>(
    endpoint: string,
    params: Record<string, any> = {},
    options: RequestOptions = {}
  ): Promise<T> {
    const { useCache = true, ttl } = options;
    
    // Use the cache service's getOrSet method which handles caching logic
    return this.cache.getOrSet<T>(
      this.getCacheKey(endpoint, params),
      async () => {
        try {
          // Apply rate limiting
          await new Promise<void>((resolve, reject) => {
            this.rateLimiter.removeTokens(1, (err, remaining) => {
              if (err) {
                reject(new RateLimitError('Rate limit error'));
              } else {
                resolve();
              }
            });
          });
          
          // Make the actual API request
          const response = await this.client.get<T>(endpoint, {
            params,
            paramsSerializer: {
              // Ensure consistent parameter ordering for cache key generation
              serialize: (params) => {
                const searchParams = new URLSearchParams();
                Object.entries(params)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .forEach(([key, value]) => {
                    if (Array.isArray(value)) {
                      value.forEach(v => searchParams.append(key, String(v)));
                    } else if (value !== undefined && value !== null) {
                      searchParams.append(key, String(value));
                    }
                  });
                return searchParams.toString();
              },
            },
          });
          
          if (response.status >= 400) {
            const error = new Error(`Request failed with status ${response.status}`);
            (error as any).response = response;
            throw error;
          }
          
          return response.data;
        } catch (error) {
          throw this.handleError(error);
        }
      },
      ttl
    );
  }

  /**
   * Make a POST request to the Jupiter API
   */
  async post<T>(
    endpoint: string,
    data: Record<string, any> = {},
    params: Record<string, any> = {},
    options: RequestOptions = {}
  ): Promise<T> {
    const { useCache = false, ttl } = options;
    const requestId = uuidv4();
    const cacheKey = this.getCacheKey(endpoint, { ...params, ...data });
    
    // For POST requests, we typically don't want to use cache by default
    // But we'll check if a cached response exists if useCache is true
    if (useCache) {
      try {
        const cached = await this.cache.get<T>(cacheKey);
        if (cached !== null && cached !== undefined) {
          this.logger.debug(`Cache hit for POST ${endpoint}`, { requestId });
          return cached;
        }
      } catch (cacheError) {
        this.logger.warn('Cache read error for POST request', {
          requestId,
          endpoint,
          error: cacheError instanceof Error ? cacheError.message : String(cacheError),
        });
        // Continue with the API request if cache read fails
      }
    }
    
    try {
      // Apply rate limiting
      await this.rateLimiter.consume(1);
      
      this.logger.debug(`Making POST request to ${endpoint}`, {
        requestId,
        params,
        data: this.sanitizeDataForLogging(data),
      });
      
      const response = await this.client.post<T>(endpoint, data, { params });
      
      if (response.status >= 400) {
        const error = new Error(`Request failed with status ${response.status}`);
        (error as any).response = response;
        throw error;
      }
      
      // Cache the response if needed
      if (useCache && response.status === 200) {
        try {
          await this.cache.set(cacheKey, response.data, ttl);
          this.logger.debug(`Cached POST response for ${endpoint}`, { requestId, ttl });
        } catch (cacheError) {
          this.logger.warn('Cache write error for POST request', {
            requestId,
            endpoint,
            error: cacheError instanceof Error ? cacheError.message : String(cacheError),
          });
          // Don't fail the request if cache write fails
        }
      }
      
      return response.data;
    } catch (error) {
      this.logger.error(`POST request failed for ${endpoint}`, {
        requestId,
        error: error instanceof Error ? error.message : String(error),
        params,
        data: this.sanitizeDataForLogging(data),
        status: (error as any)?.response?.status,
      });
      
      throw this.handleError(error);
    }
  }
  
  /**
   * Sanitize sensitive data before logging
   */
  private sanitizeDataForLogging(data: Record<string, any>): Record<string, any> {
    if (!data || typeof data !== 'object') return data;
    
    const sensitiveFields = [
      'privateKey', 'secret', 'password', 'token', 'apiKey', 'authorization',
      'wallet', 'mnemonic', 'seed', 'signature', 'signedTransaction'
    ];
    
    const sanitized = { ...data };
    
    for (const [key, value] of Object.entries(sanitized)) {
      const keyLower = key.toLowerCase();
      
      // Check if this is a sensitive field
      if (sensitiveFields.some(field => keyLower.includes(field))) {
        sanitized[key] = '[REDACTED]';
      }
      
      // Recursively sanitize nested objects
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        sanitized[key] = this.sanitizeDataForLogging(value);
      }
      
      // Handle arrays of objects
      if (Array.isArray(value)) {
        sanitized[key] = value.map(item => 
          typeof item === 'object' ? this.sanitizeDataForLogging(item) : item
        );
      }
    }
    
    return sanitized;
  }

  /**
   * Swap API Methods
   */

  /**
   * Get a quote for a token swap
   * @param params Quote request parameters
   * @returns Promise with quote response
   */
  public async getQuote(params: QuoteRequestParams): Promise<QuoteResponse> {
    try {
      const response = await this.get<QuoteResponse>(API_PATHS.QUOTE, params);
      return response;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Get price information for a token swap
   * @param params Price request parameters
   * @returns Promise with price information
   */
  public async getPrice(params: PriceRequestParams): Promise<PriceResponse> {
    try {
      logger.debug('Fetching price from Jupiter API', { params });
      
      const response = await this.get<PriceResponse>(API_PATHS.PRICE, {
        inputMint: params.inputMint,
        outputMint: params.outputMint,
        amount: params.amount,
        slippageBps: params.slippageBps || 50,
        onlyDirectRoutes: params.onlyDirectRoutes || false,
        includeDetailedRoutes: params.includeDetailedRoutes || false,
        includeRoutePlan: params.includeRoutePlan || false,
      });
      
      logger.debug('Successfully fetched price from Jupiter API');
      return response;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Get a swap transaction
   * @param swapRequest Swap transaction request
   * @returns Promise with swap transaction response
   */
  public async getSwapTransaction(
    swapRequest: SwapTransactionRequest
  ): Promise<SwapTransactionResponse> {
    try {
      const response = await this.post<SwapTransactionResponse>(
        API_PATHS.SWAP,
        swapRequest
      );
      return response;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Get swap instructions for a quote
   * @param swapInstructionsRequest Swap instructions request
   * @returns Promise with swap instructions response
   */
  public async getSwapInstructions(
    swapInstructionsRequest: SwapInstructionsRequest
  ): Promise<SwapInstructionsResponse> {
    try {
      const response = await this.post<SwapInstructionsResponse>(
        API_PATHS.SWAP_INSTRUCTIONS,
        swapInstructionsRequest
      );
      return response;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Get program ID to label mapping
   * @returns Promise with program ID to label mapping
   */
  public async getProgramIdToLabel(): Promise<ProgramIdToLabelResponse> {
    try {
      const response = await this.get<ProgramIdToLabelResponse>(API_PATHS.PROGRAM_ID_TO_LABEL);
      return response;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Token API Methods
   */

  /**
   * Get information about a specific token
   * @param mintAddress The mint address of the token
   * @returns Promise with token information
   */
  public async getTokenInfo(mintAddress: string): Promise<TokenInfoResponse> {
    try {
      const response = await axios.get<TokenInfoResponse>(
        `${this.tokenBaseURL}/token/${mintAddress}`
      );
      return response.data;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Get mints involved in a market
   * @param inputMint The input mint address
   * @param outputMint The output mint address
   * @param amount The amount to swap
   * @returns Promise with mints in market response
   */
  public async getMintsInMarket(
    inputMint: string,
    outputMint: string,
    amount: string | number
  ): Promise<MintsInMarketResponse> {
    try {
      const response = await axios.get<MintsInMarketResponse>(
        `${this.tokenBaseURL}/mints/in-market`,
        {
          params: { inputMint, outputMint, amount },
        }
      );
      return response.data;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Get all tradable tokens
   * @returns Promise with tradable tokens response
   */
  public async getTradableTokens(): Promise<string[]> {
    try {
      const response = await axios.get<TradableTokensResponse>(
        `${this.tokenBaseURL}/tradable`
      );
      return response.data.mints;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Get tokens with specific tags
   * @param tags Array of tags to filter by
   * @returns Promise with tagged tokens response
   */
  public async getTaggedTokens(tags: string[]): Promise<Record<string, TokenInfo>> {
    try {
      const response = await axios.get<TaggedTokensResponse>(
        `${this.tokenBaseURL}/tagged`,
        {
          params: { tags: tags.join(',') },
        }
      );
      return response.data;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Get newly added tokens
   * @returns Promise with new tokens mapped to TokenInfo format
   */
  public async getNewTokens(): Promise<Record<string, TokenInfo>> {
    try {
      const response = await axios.get<NewTokensResponse>(
        `${this.tokenBaseURL}/new`
      );
      
      // Map the response to match TokenInfo interface
      const tokens: Record<string, TokenInfo> = {};
      
      for (const [mint, tokenData] of Object.entries(response.data)) {
        const token = tokenData as any;
        tokens[mint] = {
          address: token.mint,
          chainId: 101, // Mainnet
          name: token.name,
          symbol: token.symbol,
          decimals: token.decimals,
          logoURI: token.logoURI,
          tags: token.tags || []
        };
      }
      
      return tokens;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Get all tokens with metadata
   * @returns Promise with all tokens response
   */
  public async getAllTokens(): Promise<Record<string, TokenInfo>> {
    try {
      const response = await axios.get<AllTokensResponse>(
        `${this.tokenBaseURL}/all`
      );
      return response.data;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Get a list of supported tokens (legacy method)
   * @deprecated Use getAllTokens() instead
   * @returns Promise with list of tokens
   */
  public async getTokens(): Promise<TokenInfo[] | undefined> {
    try {
      const response = await this.client.get<TokenInfo[]>(API_PATHS.TOKENS);
      return response.data;
    } catch (error) {
      this.handleError(error);
      return undefined;
    }
  }

  /**
   * Send a signed transaction to the Solana network
   * @param params Send transaction parameters
   * @returns Transaction signature and confirmation details
   */
  public async sendTransaction(params: SendTransactionRequest): Promise<SendTransactionResponse | undefined> {
    try {
      // Use the RPC endpoint from config or fallback to a public endpoint
      const rpcUrl = config.solana.rpcUrl || 'https://api.mainnet-beta.solana.com';
      
      // Create a new axios instance for the RPC call
      const rpcClient = axios.create({
        baseURL: rpcUrl,
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 30000, // 30 seconds
      });

      // Decode the base64 transaction
      const signedTransaction = Buffer.from(params.signedTransaction, 'base64');
      
      // Prepare the RPC request
      const rpcRequest = {
        jsonrpc: '2.0',
        id: '1',
        method: 'sendTransaction',
        params: [
          signedTransaction.toString('base64'),
          {
            encoding: 'base64',
            skipPreflight: params.skipPreflight || false,
            maxRetries: params.maxRetries || 0,
            preflightCommitment: params.commitment || 'confirmed',
          },
        ],
      };

      logger.debug('Sending transaction to Solana RPC', {
        method: 'sendTransaction',
        skipPreflight: params.skipPreflight,
        maxRetries: params.maxRetries,
        commitment: params.commitment,
      });

      // Send the transaction
      const response = await rpcClient.post<{
        jsonrpc: string;
        result: string;
        id: string;
      }>('', rpcRequest);

      if (!response.data || !response.data.result) {
        throw new Error('Invalid response from Solana RPC');
      }

      const signature = response.data.result;

      // Wait for confirmation if needed
      if (params.commitment && params.commitment !== 'processed') {
        return await this.confirmTransaction(signature, params.commitment);
      }

      return {
        signature,
        slot: 0, // Will be updated in confirmTransaction
        err: null,
        memo: null,
        blockTime: null,
        confirmationStatus: 'processed' as const,
      };
    } catch (error) {
      this.handleError(error);
      return undefined;
    }
  }

  /**
   * Confirm a transaction
   * @param signature Transaction signature
   * @param commitment Commitment level
   * @returns Transaction confirmation details
   */
  private async confirmTransaction(
    signature: string,
    commitment: 'confirmed' | 'finalized' = 'confirmed'
  ): Promise<SendTransactionResponse | undefined> {
    try {
      const rpcUrl = config.solana.rpcUrl || 'https://api.mainnet-beta.solana.com';
      
      const rpcClient = axios.create({
        baseURL: rpcUrl,
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 60000, // 60 seconds
      });

      // Wait for confirmation
      const confirmRequest = {
        jsonrpc: '2.0',
        id: '1',
        method: 'getSignatureStatuses',
        params: [
          [signature],
          {
            searchTransactionHistory: true,
          },
        ],
      };

      // Poll for confirmation (simplified - in production, you might want to implement proper polling with timeouts)
      let attempts = 0;
      const maxAttempts = 30; // ~30 seconds with 1s delay
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
        
        const response = await rpcClient.post<{
          jsonrpc: string;
          result: {
            value: Array<{
              slot: number;
              confirmations: number | null;
              err: any;
              confirmationStatus: 'processed' | 'confirmed' | 'finalized' | null;
            }>;
          };
          id: string;
        }>('', confirmRequest);

        const status = response.data.result?.value?.[0];
        
        if (status) {
          if (status.err) {
            return {
              signature,
              slot: status.slot,
              err: status.err,
              memo: null,
              blockTime: null,
              confirmationStatus: status.confirmationStatus || 'processed',
            };
          }

          // Check if the transaction has reached the desired commitment level
          if (status.confirmationStatus === commitment || 
              (commitment === 'confirmed' && status.confirmationStatus === 'finalized')) {
            
            // Get the transaction details for blockTime and memo
            const txDetails = await this.getTransactionDetails(signature, commitment);
            
            return {
              signature,
              slot: status.slot,
              err: null,
              memo: txDetails?.memo || null,
              blockTime: txDetails?.blockTime || null,
              confirmationStatus: status.confirmationStatus,
            };
          }
        }
        
        attempts++;
      }

      throw new Error(`Transaction not confirmed after ${maxAttempts} seconds`);
    } catch (error) {
      this.handleError(error);
      return undefined;
    }
  }

  /**
   * Get transaction details
   * @param signature Transaction signature
   * @param commitment Commitment level
   * @returns Transaction details including block time and memo
   */
  private async getTransactionDetails(
    signature: string,
    commitment: 'confirmed' | 'finalized' = 'confirmed'
  ): Promise<{ blockTime: number | null; memo: string | null }> {
    try {
      const rpcUrl = config.solana.rpcUrl || 'https://api.mainnet-beta.solana.com';
      
      const rpcClient = axios.create({
        baseURL: rpcUrl,
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 10000, // 10 seconds
      });

      const request = {
        jsonrpc: '2.0',
        id: '1',
        method: 'getTransaction',
        params: [
          signature,
          {
            encoding: 'json',
            commitment,
            maxSupportedTransactionVersion: 0,
          },
        ],
      };

      const response = await rpcClient.post<{
        jsonrpc: string;
        result: {
          slot: number;
          blockTime: number | null;
          meta: {
            logMessages: string[];
            err: any;
          };
        } | null;
        id: string;
      }>('', request);

      if (!response.data.result) {
        return { blockTime: null, memo: null };
      }

      // Extract memo from log messages if available
      let memo: string | null = null;
      const memoLog = response.data.result.meta?.logMessages?.find((msg: string) => 
        msg.includes('Program log: Memo: {')
      );
      
      if (memoLog) {
        try {
          const memoJson = memoLog.replace('Program log: Memo: ', '');
          const memoObj = JSON.parse(memoJson);
          memo = memoObj.memo || null;
        } catch (e) {
          // If parsing fails, use the raw log
          memo = memoLog;
        }
      }

      return {
        blockTime: response.data.result.blockTime,
        memo,
      };
    } catch (error) {
      logger.warn('Failed to get transaction details', { error });
      return { blockTime: null, memo: null };
    }
  }

  /**
   * Handle API errors and convert them to appropriate custom error types
   */
  private handleError(error: any): JupiterError {
    try {
      if (error.response) {
        // Handle HTTP errors (4xx, 5xx)
        const { status, data } = error.response;
        const errorMessage = data?.message || data?.error || 'Unknown error';
        
        // Handle rate limiting
        if (status === 429) {
          // RateLimitError only accepts a message parameter
          return new RateLimitError('Rate limit exceeded');
        }
        
        // Handle validation errors
        if (status === 400) {
          // ValidationError accepts a message and optional details
          return new ValidationError(
            errorMessage,
            data?.details
          );
        }
        
        // Handle not found errors
        if (status === 404) {
          // NotFoundError accepts a resource and optional id
          return new NotFoundError('Resource', errorMessage);
        }
        
        // Handle insufficient liquidity
        if (errorMessage.toLowerCase().includes('insufficient liquidity')) {
          // InsufficientLiquidityError only accepts a message parameter
          return new InsufficientLiquidityError('Insufficient liquidity for this trade');
        }
        
        // Handle slippage tolerance exceeded
        if (errorMessage.toLowerCase().includes('slippage')) {
          // SlippageToleranceExceededError only accepts a message parameter
          return new SlippageToleranceExceededError('Slippage tolerance exceeded');
        }
        
        // Handle other HTTP errors
        return new JupiterError(
          errorMessage,
          status,
          `JUPITER_HTTP_${status}`,
          { 
            status, 
            data: data || {},
            url: error.config?.url,
            method: error.config?.method
          }
        );
      } else if (error.request) {
        // The request was made but no response was received
        return new JupiterError(
          'No response received from Jupiter API',
          504,
          'NO_RESPONSE',
          { 
            url: error.config?.url,
            method: error.config?.method
          }
        );
      } else {
        // Something happened in setting up the request
        return new JupiterError(
          error.message || 'Unknown error occurred',
          500,
          'JUPITER_UNKNOWN_ERROR',
          { 
            stack: error.stack,
            name: error.name,
            code: error.code
          }
        );
      }
    } catch (innerError) {
      // If something goes wrong in the error handler itself
      return new JupiterError(
        'Failed to process error',
        500,
        'JUPITER_ERROR_HANDLER_FAILED',
        { 
          originalError: error?.message || String(error),
          handlerError: innerError?.message || String(innerError)
        }
      );
    }
  }
}

// Create a singleton instance with proper JupiterConfig
export const jupiterService = new JupiterService({
  baseUrl: process.env.JUPITER_API_BASE_URL || 'https://quote-api.jup.ag/v6',
  apiKey: process.env.JUPITER_API_KEY,
  timeout: 30000, // 30 seconds
  rateLimit: {
    tokensPerInterval: 60, // 60 requests per minute
    interval: 'minute' as const,
  },
  cacheTtl: 300, // 5 minutes
});