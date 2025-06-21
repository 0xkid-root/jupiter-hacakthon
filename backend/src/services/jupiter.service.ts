import axios, { AxiosError, AxiosInstance } from 'axios';
import config from '../config';
import { logger } from '../utils/logger';
import {
  QuoteRequestParams,
  QuoteResponse,
  SwapTransactionRequest,
  SwapTransactionResponse,
  SwapInstructionsRequest,
  SwapInstructionsResponse,
  ProgramIdToLabelResponse,
  TokenInfo,
  TokenInfoResponse,
  MintsInMarketResponse,
  TradableTokensResponse,
  TaggedTokensResponse,
  NewTokensResponse,
  AllTokensResponse,
  JupiterErrorResponse,
  SendTransactionRequest,
  SendTransactionResponse,
  PriceRequestParams,
  PriceResponse,
} from '../interfaces/jupiter.interface';

/**
 * Service for interacting with the Jupiter Aggregator API
 */
class JupiterService {
  private readonly client: AxiosInstance;
  private readonly baseURL: string;
  private readonly tokenBaseURL: string;

  constructor() {
    this.baseURL = config.jupiter.apiBaseUrl || 'https://quote-api.jup.ag/v6';
    this.tokenBaseURL = config.jupiter.tokenApiBaseUrl || 'https://token-api.jup.ag';
    
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Content-Type': 'application/json',
        ...(config.jupiter.apiKey && { 'Authorization': `Bearer ${config.jupiter.apiKey}` }),
      },
      timeout: 30000, // 30 seconds
    });

    // Add request interceptor for logging
    this.client.interceptors.request.use(
      (config: any) => {
        logger.debug(`Request: ${config.method?.toUpperCase()} ${config.url}`, {
          baseURL: config.baseURL,
          params: config.params,
          data: config.data,
        });
        return config;
      },
      (error: any) => {
        logger.error('Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Add response interceptor for logging and error handling
    this.client.interceptors.response.use(
      (response: any) => {
        logger.debug(`Response: ${response.status} ${response.config.url}`, {
          status: response.status,
          statusText: response.statusText,
          data: response.data,
        });
        return response;
      },
      (error: any) => {
        if (error.response) {
          // The request was made and the server responded with a status code
          // that falls out of the range of 2xx
          logger.error('API Error Response:', {
            status: error.response.status,
            statusText: error.response.statusText,
            data: error.response.data,
            url: error.config.url,
            method: error.config.method,
          });
        } else if (error.request) {
          // The request was made but no response was received
          logger.error('No response received:', {
            message: error.message,
            url: error.config.url,
            method: error.config.method,
          });
        } else {
          // Something happened in setting up the request that triggered an Error
          logger.error('Request setup error:', error.message);
        }
        return Promise.reject(error);
      }
    );
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
      const response = await this.client.get<QuoteResponse>('/quote', { params });
      return response.data;
    } catch (error) {
      this.handleError(error, 'Failed to get quote');
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
      
      const response = await this.client.get<PriceResponse>('/price', {
        params: {
          inputMint: params.inputMint,
          outputMint: params.outputMint,
          amount: params.amount,
          slippageBps: params.slippageBps || 50,
          onlyDirectRoutes: params.onlyDirectRoutes || false,
          includeDetailedRoutes: params.includeDetailedRoutes || false,
          includeRoutePlan: params.includeRoutePlan || false,
        },
      });
      
      logger.debug('Successfully fetched price from Jupiter API');
      return response.data;
    } catch (error) {
      this.handleError(error, 'Failed to fetch price');
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
      const response = await this.client.post<SwapTransactionResponse>(
        '/swap',
        swapRequest
      );
      return response.data;
    } catch (error) {
      this.handleError(error, 'Failed to get swap transaction');
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
      const response = await this.client.post<SwapInstructionsResponse>(
        '/swap-instructions',
        swapInstructionsRequest
      );
      return response.data;
    } catch (error) {
      this.handleError(error, 'Failed to get swap instructions');
      throw error;
    }
  }

  /**
   * Get program ID to label mapping
   * @returns Promise with program ID to label mapping
   */
  public async getProgramIdToLabel(): Promise<ProgramIdToLabelResponse> {
    try {
      const response = await this.client.get<ProgramIdToLabelResponse>('/program-id-to-label');
      return response.data;
    } catch (error) {
      this.handleError(error, 'Failed to get program ID to label mapping');
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
      this.handleError(error, `Failed to get token info for ${mintAddress}`);
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
      this.handleError(error, 'Failed to get mints in market');
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
      this.handleError(error, 'Failed to get tradable tokens');
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
      this.handleError(error, 'Failed to get tagged tokens');
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
      this.handleError(error, 'Failed to get new tokens');
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
      this.handleError(error, 'Failed to get all tokens');
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
      const response = await this.client.get<TokenInfo[]>('/tokens');
      return response.data;
    } catch (error) {
      this.handleError(error, 'Failed to fetch supported tokens');
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
      this.handleError(error, 'Failed to send transaction');
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
        timeout: 60000, // 60 seconds for confirmation
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
      this.handleError(error, 'Failed to confirm transaction');
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
   * Handle API errors
   * @param error The error object
   * @param message Custom error message
   */
  private handleError(error: unknown, message: string): void {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<JupiterErrorResponse>;
      
      if (axiosError.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        const { status, data } = axiosError.response;
        const errorMessage = data?.message || axiosError.message;
        
        logger.error(`${message}: ${status} - ${errorMessage}`, {
          status,
          error: data?.error,
          message: errorMessage,
          url: axiosError.config?.url,
          method: axiosError.config?.method,
        });
        
        throw new Error(`Jupiter API Error (${status}): ${errorMessage}`);
      } else if (axiosError.request) {
        // The request was made but no response was received
        logger.error(`${message}: No response received`, {
          message: axiosError.message,
          url: axiosError.config?.url,
          method: axiosError.config?.method,
        });
        
        throw new Error('No response received from Jupiter API');
      }
    }
    
    // Unknown error
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`${message}: ${errorMessage}`, { error });
    throw new Error(`${message}: ${errorMessage}`);
  }
}

export const jupiterService = new JupiterService();