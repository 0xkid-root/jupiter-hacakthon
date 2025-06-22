import axios, { AxiosError, AxiosInstance } from 'axios';
import axiosRetry, { IAxiosRetryConfig, exponentialDelay } from 'axios-retry';
import { v4 as uuidv4 } from 'uuid';
// Config removed as it's not used
import logger from '../utils/logger';
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
  // Removed unused imports
} from '../interfaces/jupiter.interface';
import { 
  JupiterConfig,
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
import { RateLimiterMemory } from 'rate-limiter-flexible';

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

// Default rate limit configuration
const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  maxRequestsPerMinute: 60,
  retryAfterMs: 1000,
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
  private readonly rateLimiter: RateLimiterMemory;
  private readonly logger = logger;
  private readonly tokenBaseURL: string = 'https://token.jup.ag';
  private rateLimitRemaining: number = Number.MAX_SAFE_INTEGER;
  private rateLimitReset: number = 0;
  private rateLimitConfig: RateLimitConfig = DEFAULT_RATE_LIMIT_CONFIG;

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
        retryAfterMs: 1000,
      };
    }
    
    // Initialize rate limiter
    // Note: If using Redis, replace with RateLimiterRedis and provide a Redis client
    this.rateLimiter = new RateLimiterMemory({
      points: this.rateLimitConfig.maxRequestsPerMinute,
      duration: 60 // 1 minute
    });
    
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
  }

  /**
   * Create a configured Axios instance with interceptors
   */
  private createAxiosInstance(baseURL: string): AxiosInstance {
    const instance = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': '',
      },
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
          
          throw this.handleError(error);
        } else if (error.request) {
          logger.error('No response received:', {
            url: error.config?.url,
            method: error.config?.method,
            requestId: error.config?.headers?.['X-Request-ID'],
            code: error.code,
            message: error.message,
          });
        } else {
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
    const retryConfig: any = {
      ...DEFAULT_RETRY_CONFIG,
      retryIf: (error: AxiosError) => {
        if (error.config?.method?.toUpperCase() === 'POST') {
          return false;
        }
        
        if (axiosRetry.isNetworkOrIdempotentRequestError(error)) {
          return true;
        }
        
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
   */
  private async checkRateLimit(): Promise<void> {
    const now = Date.now();
    
    if (now > this.rateLimitReset) {
      this.rateLimitRemaining = this.rateLimitConfig.maxRequestsPerMinute;
      this.rateLimitReset = now + 60000;
      return;
    }
    
    if (this.rateLimitRemaining <= 0) {
      const waitTime = this.rateLimitReset - now + 1000;
      logger.warn(`Rate limit reached. Waiting ${waitTime}ms until reset`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
      this.rateLimitRemaining = this.rateLimitConfig.maxRequestsPerMinute;
      this.rateLimitReset = Date.now() + 60000;
    }
    
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
   * Make a POST request to the Jupiter API
   */
  async post<T>(
    endpoint: string,
    data: Record<string, any> = {},
    params: Record<string, any> = {},
    options: RequestOptions = {}
  ): Promise<T> {
    const requestId = uuidv4();
    const rateLimitKey = 'jupiter-api';
    
    try {
      // Apply rate limiting
      await this.rateLimiter.consume(rateLimitKey, 1);
      
      this.logger.debug(`Making POST request to ${endpoint}`, {
        requestId,
        params,
        data: this.sanitizeDataForLogging(data),
      });
      
      const response = await this.client.post<T>(endpoint, data, { 
        params,
        paramsSerializer: {
          serialize: (params: Record<string, any>) => {
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
   * Make a GET request to the Jupiter API
   */
  async get<T>(
    endpoint: string,
    params: Record<string, any> = {},
    options: RequestOptions = {}
  ): Promise<T> {
    const requestId = uuidv4();
    const rateLimitKey = 'jupiter-api';
    
    try {
      // Apply rate limiting
      await this.rateLimiter.consume(rateLimitKey, 1);
      
      this.logger.debug(`Making GET request to ${endpoint}`, {
        requestId,
        params,
      });
      
      const response = await this.client.get<T>(endpoint, { 
        params,
        paramsSerializer: {
          serialize: (params: Record<string, any>) => {
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
      this.logger.error(`GET request failed for ${endpoint}`, {
        requestId,
        error: error instanceof Error ? error.message : String(error),
        params,
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
      
      if (sensitiveFields.some(field => keyLower.includes(field))) {
        sanitized[key] = '[REDACTED]';
      }
      
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        sanitized[key] = this.sanitizeDataForLogging(value);
      }
      
      if (Array.isArray(value)) {
        sanitized[key] = value.map(item => 
          typeof item === 'object' ? this.sanitizeDataForLogging(item) : item
        );
      }
    }
    
    return sanitized;
  }

  /**
   * Handle API errors consistently
   */
  private handleError(error: any): JupiterError {
    try {
      if (error.response) {
        const { status, data } = error.response;
        const errorMessage = (data as any)?.message || (data as any)?.error || 'Unknown error';
        
        if (status === 429) {
          return new RateLimitError('Rate limit exceeded');
        }
        
        if (status === 400) {
          return new ValidationError(errorMessage, (data as any)?.details);
        }
        
        if (status === 404) {
          return new NotFoundError('Resource', errorMessage);
        }
        
        if (errorMessage.toLowerCase().includes('insufficient liquidity')) {
          return new InsufficientLiquidityError('Insufficient liquidity for this trade');
        }
        
        if (errorMessage.toLowerCase().includes('slippage')) {
          return new SlippageToleranceExceededError('Slippage tolerance exceeded');
        }
        
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
      return new JupiterError(
        'Failed to process error',
        500,
        'JUPITER_ERROR_HANDLER_FAILED',
        { 
          originalError: error?.message || String(error),
          handlerError: (innerError as Error)?.message || String(innerError)
        }
      );
    }
  }

  // Public API Methods

  public async getQuote(params: QuoteRequestParams): Promise<QuoteResponse> {
    try {
      const response = await this.get<QuoteResponse>(API_PATHS.QUOTE, params);
      return response;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  public async getPrice(params: PriceRequestParams): Promise<PriceResponse> {
    try {
      this.logger.debug('Fetching price from Jupiter API', { params });
      
      const response = await this.get<PriceResponse>(API_PATHS.PRICE, {
        inputMint: params.inputMint,
        outputMint: params.outputMint,
        amount: params.amount,
        slippageBps: params.slippageBps || 50,
        onlyDirectRoutes: params.onlyDirectRoutes || false,
        includeDetailedRoutes: params.includeDetailedRoutes || false,
        includeRoutePlan: params.includeRoutePlan || false,
      });
      
      this.logger.debug('Successfully fetched price from Jupiter API');
      return response;
    } catch (error) {
      throw this.handleError(error);
    }
  }

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
      throw this.handleError(error);
    }
  }

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
      throw this.handleError(error);
    }
  }

  public async getProgramIdToLabel(): Promise<ProgramIdToLabelResponse> {
    try {
      const response = await this.get<ProgramIdToLabelResponse>(API_PATHS.PROGRAM_ID_TO_LABEL);
      return response;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  public async getTokenInfo(mintAddress: string): Promise<TokenInfoResponse> {
    try {
      const response = await this.tokenClient.get<TokenInfoResponse>(
        `/token/${mintAddress}`
      );
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  public async getMintsInMarket(
    inputMint: string,
    outputMint: string,
    amount: string | number
  ): Promise<MintsInMarketResponse> {
    try {
      const response = await this.tokenClient.get<MintsInMarketResponse>(
        `/mints/in-market`,
        {
          params: { inputMint, outputMint, amount },
        }
      );
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  public async getTradableTokens(): Promise<string[]> {
    try {
      const response = await this.tokenClient.get<TradableTokensResponse>(
        `/tradable`
      );
      return response.data.mints;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  public async getTaggedTokens(tags: string[]): Promise<Record<string, TokenInfo>> {
    try {
      const response = await this.tokenClient.get<TaggedTokensResponse>(
        `/tagged`,
        {
          params: { tags: tags.join(',') },
        }
      );
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  public async getNewTokens(): Promise<Record<string, TokenInfo>> {
    try {
      const response = await this.tokenClient.get<NewTokensResponse>(
        `/new`
      );
      
      const tokens: Record<string, TokenInfo> = {};
      
      for (const [mint, tokenData] of Object.entries(response.data)) {
        const token = tokenData as any;
        tokens[mint] = {
          address: token.mint,
          chainId: 101,
          name: token.name,
          symbol: token.symbol,
          decimals: token.decimals,
          logoURI: token.logoURI,
          tags: token.tags || []
        };
      }
      
      return tokens;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  public async getAllTokens(): Promise<Record<string, TokenInfo>> {
    try {
      const response = await this.get<AllTokensResponse>(
        `${API_PATHS.TOKENS}/all`
      );
      return response;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Send a signed transaction to the network
   * @param request The transaction request containing the signed transaction
   * @returns The transaction signature and status
   */
  async sendTransaction(
    request: SendTransactionRequest
  ): Promise<{ swapTransaction: string }> {
    try {
      const response = await this.post<{ swapTransaction: string }>(
        API_PATHS.SWAP,
        request,
        {},
        { skipCache: true }
      );
      return response;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  public async getTokens(): Promise<TokenInfo[] | undefined> {
    try {
      const response = await this.get<TokenInfo[]>(API_PATHS.TOKENS);
      return response;
    } catch (error) {
      this.logger.error('Failed to get tokens', { error });
      return undefined;
    }
  }
}

// Default configuration
const DEFAULT_JUPITER_CONFIG: JupiterConfig = {
  baseUrl: 'https://quote-api.jup.ag/v6',
  apiKey: process.env.JUPITER_API_KEY,
  rateLimit: {
    tokensPerInterval: 100, // Default to 100 requests per minute
    interval: 'minute',
  }
};

export const jupiterService = new JupiterService(DEFAULT_JUPITER_CONFIG);