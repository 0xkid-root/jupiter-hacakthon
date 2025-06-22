import { Router, Request, Response, NextFunction } from 'express';
import { jupiterController } from '../controllers/jupiter.controller';

const router = Router();

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

router.get('/quote', (req: Request, res: Response, next: NextFunction) => 
  jupiterController.getQuote(req, res, next)
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
router.get('/price', (req: Request, res: Response, next: NextFunction) => 
  jupiterController.getPrice(req, res, next)
);

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
router.post('/swap', (req: Request, res: Response, next: NextFunction) => 
  jupiterController.getSwapTransaction(req, res, next)
);

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
router.post('/swap-instructions', (req: Request, res: Response, next: NextFunction) => 
  jupiterController.getSwapInstructions(req, res, next)
);

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
router.post('/v1/send-transaction', (req: Request, res: Response, next: NextFunction) => 
  jupiterController.sendTransaction(req, res, next)
);

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
router.get('/program-id-to-label', (req: Request, res: Response, next: NextFunction) => 
  jupiterController.getProgramIdToLabel(req, res, next)
);

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
router.get('/tokens', (req: Request, res: Response, next: NextFunction) => 
  jupiterController.getTokens(req, res, next)
);

export default router;
