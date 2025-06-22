import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { QuoteRequestParams, PriceRequestParams } from '../interfaces/jupiter.interface';
import { jupiterService } from '../services/jupiter.service';
import logger from '../utils/logger';

class JupiterController {
  /**
   * Get price information for a token swap
   */
  public getPrice = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Check for validation errors from express-validator
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn('Price validation failed', { errors: errors.array() });
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        });
        return;
      }

      const priceParams: PriceRequestParams = {
        inputMint: req.query.inputMint as string,
        outputMint: req.query.outputMint as string,
        amount: req.query.amount as string,
        slippageBps: req.query.slippageBps ? Number(req.query.slippageBps) : undefined,
        onlyDirectRoutes: req.query.onlyDirectRoutes === 'true',
        includeDetailedRoutes: req.query.includeDetailedRoutes === 'true',
        includeRoutePlan: req.query.includeRoutePlan === 'true',
      };

      logger.info(`Fetching price: ${priceParams.inputMint} -> ${priceParams.outputMint} (${priceParams.amount})`);
      
      const price = await jupiterService.getPrice(priceParams);
      
      res.status(200).json({
        success: true,
        data: price,
      });
    } catch (error) {
      logger.error('Failed to get price:', error);
      next(error);
    }
  };

  /**
   * Get a quote for a token swap
   */
  public getQuote = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Check for validation errors from express-validator
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn('Validation failed', { errors: errors.array() });
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        });
        return;
      }

      const quoteParams: QuoteRequestParams = {
        inputMint: req.query.inputMint as string,
        outputMint: req.query.outputMint as string,
        amount: req.query.amount as string,
        slippageBps: req.query.slippageBps ? Number(req.query.slippageBps) : undefined,
        restrictIntermediateTokens: req.query.restrictIntermediateTokens === 'true',
        swapMode: req.query.swapMode as 'ExactIn' | 'ExactOut' | undefined,
        feeBps: req.query.feeBps ? Number(req.query.feeBps) : undefined,
        onlyDirectRoutes: req.query.onlyDirectRoutes === 'true',
        asLegacyTransaction: req.query.asLegacyTransaction === 'true',
        maxAccounts: req.query.maxAccounts ? Number(req.query.maxAccounts) : undefined,
      };

      logger.info(`Fetching quote: ${quoteParams.inputMint} -> ${quoteParams.outputMint} (${quoteParams.amount})`);
      
      const quote = await jupiterService.getQuote(quoteParams);
      
      res.status(200).json({
        success: true,
        data: quote,
      });
    } catch (error) {
      logger.error('Failed to get quote:', error);
      next(error);
    }
  };

  /**
   * Get a swap transaction
   */
  public getSwapTransaction = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Check for validation errors from express-validator
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn('Validation failed', { errors: errors.array() });
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        });
        return;
      }

      const { 
        userPublicKey, 
        wrapAndUnwrapSol,
        prioritizationFeeLamports,
        asLegacyTransaction,
        useSharedAccounts,
        computeUnitPriceMicroLamports,
        useVersionedTransaction,
        asLegacyTransactionIfUnsupported,
        ...quoteParams 
      } = req.body;

      if (!userPublicKey) {
        res.status(400).json({
          success: false,
          message: 'userPublicKey is required',
        });
        return;
      }

      logger.info(`Getting swap transaction for user: ${userPublicKey}`);
      
      // First get the quote
      const quote = await jupiterService.getQuote(quoteParams as QuoteRequestParams);
      
      // Then get the swap transaction
      const swapTransaction = await jupiterService.getSwapTransaction({
        quoteResponse: quote,
        userPublicKey,
        wrapAndUnwrapSol,
        prioritizationFeeLamports,
        asLegacyTransaction,
        useSharedAccounts,
        computeUnitPriceMicroLamports,
        useVersionedTransaction,
        asLegacyTransactionIfUnsupported,
      });
      
      res.status(200).json({
        success: true,
        data: swapTransaction,
      });
    } catch (error) {
      logger.error('Failed to get swap transaction:', error);
      next(error);
    }
  };

  /**
   * Get swap instructions for a quote
   */
  public getSwapInstructions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Check for validation errors from express-validator
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn('Validation failed', { errors: errors.array() });
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        });
        return;
      }

      const { 
        userPublicKey, 
        wrapAndUnwrapSol,
        ...quoteParams 
      } = req.body;

      if (!userPublicKey) {
        res.status(400).json({
          success: false,
          message: 'userPublicKey is required',
        });
        return;
      }

      logger.info(`Getting swap instructions for user: ${userPublicKey}`);
      
      // First get the quote
      const quote = await jupiterService.getQuote(quoteParams as QuoteRequestParams);
      
      // Then get the swap instructions
      const swapInstructions = await jupiterService.getSwapInstructions({
        quoteResponse: quote,
        userPublicKey,
        wrapAndUnwrapSol,
      });
      
      res.status(200).json({
        success: true,
        data: swapInstructions,
      });
    } catch (error) {
      logger.error('Failed to get swap instructions:', error);
      next(error);
    }
  };

  /**
   * Get program ID to label mapping
   */
  public getProgramIdToLabel = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      logger.info('Fetching program ID to label mapping');
      
      const programIdToLabel = await jupiterService.getProgramIdToLabel();
      
      res.status(200).json({
        success: true,
        data: programIdToLabel,
      });
    } catch (error) {
      logger.error('Failed to fetch program ID to label mapping:', error);
      next(error);
    }
  };

  /**
   * Get token information
   */
  public getTokenInfo = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { mintAddress } = req.params;
      
      if (!mintAddress) {
        res.status(400).json({
          success: false,
          message: 'mintAddress is required',
        });
        return;
      }

      logger.info(`Fetching token info for mint: ${mintAddress}`);
      
      const tokenInfo = await jupiterService.getTokenInfo(mintAddress);
      
      res.status(200).json({
        success: true,
        data: tokenInfo,
      });
    } catch (error) {
      logger.error('Failed to fetch token info:', error);
      next(error);
    }
  };

  /**
   * Get mints in market
   */
  public getMintsInMarket = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { inputMint, outputMint, amount } = req.query;
      
      if (!inputMint || !outputMint || !amount) {
        res.status(400).json({
          success: false,
          message: 'inputMint, outputMint, and amount are required',
        });
        return;
      }

      logger.info(`Fetching mints in market: ${inputMint} -> ${outputMint} (${amount})`);
      
      const mintsInMarket = await jupiterService.getMintsInMarket(
        inputMint as string,
        outputMint as string,
        amount as string
      );
      
      res.status(200).json({
        success: true,
        data: mintsInMarket,
      });
    } catch (error) {
      logger.error('Failed to fetch mints in market:', error);
      next(error);
    }
  };

  /**
   * Get tradable tokens
   */
  public getTradableTokens = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      logger.info('Fetching tradable tokens');
      
      const tradableTokens = await jupiterService.getTradableTokens();
      
      res.status(200).json({
        success: true,
        data: tradableTokens,
      });
    } catch (error) {
      logger.error('Failed to fetch tradable tokens:', error);
      next(error);
    }
  };

  /**
   * Get tagged tokens
   */
  public getTaggedTokens = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tags } = req.query;
      
      if (!tags) {
        res.status(400).json({
          success: false,
          message: 'tags are required',
        });
        return;
      }

      const tagsArray = (tags as string).split(',');
      logger.info(`Fetching tagged tokens with tags: ${tagsArray.join(', ')}`);
      
      const taggedTokens = await jupiterService.getTaggedTokens(tagsArray);
      
      res.status(200).json({
        success: true,
        data: taggedTokens,
      });
    } catch (error) {
      logger.error('Failed to fetch tagged tokens:', error);
      next(error);
    }
  };

  /**
   * Get new tokens
   */
  public getNewTokens = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      logger.info('Fetching new tokens');
      
      const newTokens = await jupiterService.getNewTokens();
      
      res.status(200).json({
        success: true,
        data: newTokens,
      });
    } catch (error) {
      logger.error('Failed to fetch new tokens:', error);
      next(error);
    }
  };

  /**
   * Get all tokens with metadata
   */
  public getAllTokens = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      logger.info('Fetching all tokens');
      
      const allTokens = await jupiterService.getAllTokens();
      
      res.status(200).json({
        success: true,
        data: allTokens,
      });
    } catch (error) {
      logger.error('Failed to fetch all tokens:', error);
      next(error);
    }
  };

  /**
   * Get supported tokens (legacy method)
   * @deprecated Use getAllTokens instead
   */
  public getTokens = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      logger.info('Fetching supported tokens');
      
      const tokens = await jupiterService.getTokens();
      
      res.status(200).json({
        success: true,
        data: tokens,
      });
    } catch (error) {
      logger.error('Failed to fetch supported tokens:', error);
      next(error);
    }
  };

  /**
   * Send a signed transaction to the Solana network
   */
  public sendTransaction = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Check for validation errors from express-validator
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn('Validation failed', { errors: errors.array() });
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        });
        return;
      }

      const { 
        signedTransaction, 
        skipPreflight, 
        maxRetries, 
        commitment 
      } = req.body;

      if (!signedTransaction) {
        res.status(400).json({
          success: false,
          message: 'signedTransaction is required',
        });
        return;
      }

      logger.info('Sending transaction to Solana network');
      
      const result = await jupiterService.sendTransaction({
        signedTransaction,
        skipPreflight,
        maxRetries,
        commitment,
      });
      
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Failed to send transaction:', error);
      next(error);
    }
  };
}

export const jupiterController = new JupiterController();
