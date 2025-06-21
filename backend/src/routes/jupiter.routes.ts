import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import { query } from 'express-validator';
import { jupiterController } from '../controllers/jupiter.controller';
import { validate, validationRules } from '../middleware/validation.middleware';

// Type-safe wrapper for controller methods that return Promise<Response>
type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void>;

const asyncHandler = (fn: AsyncRequestHandler): RequestHandler => 
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

const router = Router();

// Validation schemas for query parameters
const queryValidation = {
  required: (field: string) => validationRules.requiredQueryString(field),
  optional: (field: string) => validationRules.optionalQueryString(field),
  requiredNumber: (field: string) => query(field).isNumeric().withMessage(`${field} must be a number`),
  optionalNumber: (field: string) => query(field).optional().isNumeric().withMessage(`${field} must be a number`),
  requiredBoolean: (field: string) => query(field).isBoolean().withMessage(`${field} must be a boolean`),
  optionalBoolean: (field: string) => query(field).optional().isBoolean().withMessage(`${field} must be a boolean`),
};

// Validation schemas for body parameters
const bodyValidation = {
  required: (field: string) => validationRules.requiredString(field),
  optional: (field: string) => validationRules.optionalString(field),
  requiredNumber: (field: string) => validationRules.requiredNumber(field),
  optionalNumber: (field: string) => validationRules.optionalNumber(field),
  requiredBoolean: (field: string) => validationRules.requiredBoolean(field),
  optionalBoolean: (field: string) => validationRules.optionalBoolean(field),
};

// Route validation schemas
const routeValidations = {
  getPrice: [
    queryValidation.required('inputMint'),
    queryValidation.required('outputMint'),
    queryValidation.required('amount'),
    queryValidation.optionalNumber('slippageBps'),
    queryValidation.optionalBoolean('onlyDirectRoutes'),
    queryValidation.optionalBoolean('includeDetailedRoutes'),
    queryValidation.optionalBoolean('includeRoutePlan'),
  ],
  getQuote: [
    queryValidation.required('inputMint'),
    queryValidation.required('outputMint'),
    queryValidation.required('amount'),
    queryValidation.optionalNumber('slippageBps'),
    queryValidation.optionalBoolean('restrictIntermediateTokens'),
    queryValidation.optional('swapMode'),
    queryValidation.optionalNumber('feeBps'),
    queryValidation.optionalBoolean('onlyDirectRoutes'),
    queryValidation.optionalBoolean('asLegacyTransaction'),
    queryValidation.optionalNumber('maxAccounts'),
  ],
  getSwapTransaction: [
    bodyValidation.required('userPublicKey'),
    bodyValidation.required('inputMint'),
    bodyValidation.required('outputMint'),
    bodyValidation.required('amount'),
    bodyValidation.optionalBoolean('wrapAndUnwrapSol'),
    bodyValidation.optionalNumber('prioritizationFeeLamports'),
    bodyValidation.optionalBoolean('asLegacyTransaction'),
    bodyValidation.optionalBoolean('useSharedAccounts'),
    bodyValidation.optionalNumber('computeUnitPriceMicroLamports'),
    bodyValidation.optionalBoolean('useVersionedTransaction'),
    bodyValidation.optionalBoolean('asLegacyTransactionIfUnsupported'),
  ],
  getSwapInstructions: [
    bodyValidation.required('userPublicKey'),
    bodyValidation.required('inputMint'),
    bodyValidation.required('outputMint'),
    bodyValidation.required('amount'),
    bodyValidation.optionalBoolean('wrapAndUnwrapSol'),
  ],
  getMintsInMarket: [
    queryValidation.required('inputMint'),
    queryValidation.required('outputMint'),
    queryValidation.required('amount'),
  ],
  getTaggedTokens: [
    queryValidation.required('tags'),
  ],
  sendTransaction: [
    bodyValidation.required('signedTransaction'),
    bodyValidation.optionalBoolean('skipPreflight'),
    bodyValidation.optionalNumber('maxRetries'),
    bodyValidation.optional('commitment'),
  ],
  getProgramIdToLabel: [],
};

/**
 * @swagger
 * /api/jupiter/quote:
 *   get:
 *     summary: Get a quote for a token swap
 *     tags: [Jupiter]
 *     parameters:
 *       - in: query
 *         name: inputMint
 *         required: true
 *         schema:
 *           type: string
 *         description: The input token mint address
 *       - in: query
 *         name: outputMint
 *         required: true
 *         schema:
 *           type: string
 *         description: The output token mint address
 *       - in: query
 *         name: amount
 *         required: true
 *         schema:
 *           type: string
 *         description: The amount of input tokens to swap (in lamports)
 *       - in: query
 *         name: slippageBps
 *         schema:
 *           type: number
 *         description: Slippage in basis points (1/10,000)
 *       - in: query
 *         name: restrictIntermediateTokens
 *         schema:
 *           type: boolean
 *         description: Whether to restrict intermediate tokens in the route
 *     responses:
 *       200:
 *         description: Successful quote
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/QuoteResponse'
 */

router.get('/quote', validate(routeValidations.getQuote), 
  (req: Request, res: Response, next: NextFunction) => {
    jupiterController.getQuote(req, res, next);
  }
);

/**
 * @swagger
 * /api/jupiter/price:
 *   get:
 *     summary: Get price information for a token swap
 *     description: Returns the expected output amount and other price-related information for a token swap
 *     tags: [Jupiter]
 *     parameters:
 *       - in: query
 *         name: inputMint
 *         schema:
 *           type: string
 *         required: true
 *         description: Input token mint address or 'SOL' for native SOL
 *       - in: query
 *         name: outputMint
 *         schema:
 *           type: string
 *         required: true
 *         description: Output token mint address or 'SOL' for native SOL
 *       - in: query
 *         name: amount
 *         schema:
 *           type: string
 *         required: true
 *         description: Amount of input token in smallest unit (e.g., lamports for SOL, 6 decimals for USDC)
 *       - in: query
 *         name: slippageBps
 *         schema:
 *           type: integer
 *           minimum: 0
 *           maximum: 10000
 *         description: Slippage in basis points (1 = 0.01%). Default is 50 (0.5%)
 *       - in: query
 *         name: onlyDirectRoutes
 *         schema:
 *           type: boolean
 *         description: If true, only consider direct routes (no hops). Default is false
 *       - in: query
 *         name: includeDetailedRoutes
 *         schema:
 *           type: boolean
 *         description: If true, include detailed route information in the response. Default is false
 *       - in: query
 *         name: includeRoutePlan
 *         schema:
 *           type: boolean
 *         description: If true, include the full route plan in the response. Default is false
 *     responses:
 *       200:
 *         description: Successful operation
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/PriceResponse'
 *       400:
 *         description: Invalid input parameters
 *       500:
 *         description: Internal server error
 */
router.get('/price', validate(routeValidations.getPrice), asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    return await jupiterController.getPrice(req, res, next);
  }
));

/**
 * @swagger
 * /api/jupiter/swap:
 *   post:
 *     summary: Build a swap transaction
 *     tags: [Jupiter]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userPublicKey
 *               - inputMint
 *               - outputMint
 *               - amount
 *             properties:
 *               userPublicKey:
 *                 type: string
 *                 description: The user's public key
 *               inputMint:
 *                 type: string
 *                 description: The input token mint address
 *               outputMint:
 *                 type: string
 *                 description: The output token mint address
 *               amount:
 *                 type: string
 *                 description: The amount of input tokens to swap (in lamports)
 *               slippageBps:
 *                 type: number
 *                 description: Slippage in basis points (1/10,000)
 *               wrapAndUnwrapSol:
 *                 type: boolean
 *                 description: Whether to wrap/unwrap SOL
 *               asLegacyTransaction:
 *                 type: boolean
 *                 description: Whether to use legacy transaction
 *     responses:
 *       200:
 *         description: Successful swap transaction
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/SwapTransactionResponse'
 */
router.post('/swap', validate(routeValidations.getSwapTransaction), asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    return await jupiterController.getSwapTransaction(req, res, next);
  }
));

/**
 * @swagger
 * /api/jupiter/swap-instructions:
 *   post:
 *     summary: Get swap instructions for a quote
 *     tags: [Jupiter]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userPublicKey
 *               - inputMint
 *               - outputMint
 *               - amount
 *             properties:
 *               userPublicKey:
 *                 type: string
 *                 description: The user's public key
 *               inputMint:
 *                 type: string
 *                 description: The input token mint address
 *               outputMint:
 *                 type: string
 *                 description: The output token mint address
 *               amount:
 *                 type: string
 *                 description: The amount of input tokens to swap (in lamports)
 *               wrapAndUnwrapSol:
 *                 type: boolean
 *                 description: Whether to wrap/unwrap SOL
 *     responses:
 *       200:
 *         description: Successful operation
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/SwapInstructionsResponse'
 */
router.post('/swap-instructions', validate(routeValidations.getSwapInstructions), asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    return await jupiterController.getSwapInstructions(req, res, next);
  }
));

/**
 * @swagger
 * /api/v1/send-transaction:
 *   post:
 *     summary: Send a signed transaction to the Solana network
 *     description: Broadcasts a signed transaction to the Solana network and optionally waits for confirmation
 *     tags: [Jupiter]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - signedTransaction
 *             properties:
 *               signedTransaction:
 *                 type: string
 *                 description: Base64 encoded signed transaction
 *               skipPreflight:
 *                 type: boolean
 *                 description: Whether to skip the preflight transaction checks
 *                 default: false
 *               maxRetries:
 *                 type: number
 *                 description: Maximum number of times to retry the transaction
 *                 default: 0
 *               commitment:
 *                 type: string
 *                 description: Commitment level for transaction confirmation
 *                 enum: [processed, confirmed, finalized]
 *                 default: confirmed
 *     responses:
 *       200:
 *         description: Transaction sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/SendTransactionResponse'
 *       400:
 *         description: Invalid request parameters
 *       500:
 *         description: Internal server error
 */
router.post('/send-transaction', validate(routeValidations.sendTransaction), asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    return await jupiterController.sendTransaction(req, res, next);
  }
));

/**
 * @swagger
 * /api/jupiter/program-id-to-label:
 *   get:
 *     summary: Get a mapping of program IDs to their labels
 *     tags: [Jupiter]
 *     responses:
 *       200:
 *         description: Successful operation
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   additionalProperties:
 *                     type: string
 *                   description: Mapping of program IDs to their labels
 */
router.get('/program-id-to-label', asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    return await jupiterController.getProgramIdToLabel(req, res, next);
  }
));

/**
 * @swagger
 * /api/jupiter/tokens:
 *   get:
 *     summary: Get list of supported tokens
 *     tags: [Jupiter]
 *     responses:
 *       200:
 *         description: List of supported tokens
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       address:
 *                         type: string
 *                       symbol:
 *                         type: string
 *                       name:
 *                         type: string
 *                       decimals:
 *                         type: number
 *                       logoURI:
 *                         type: string
 */
router.get('/tokens', asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    return await jupiterController.getTokens(req, res, next);
  }
));

export default router;
