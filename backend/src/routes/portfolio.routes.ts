import { Router } from 'express';
import { PortfolioController } from '../controllers/portfolio.controller';

const router = Router();
const portfolioController = new PortfolioController();

/**
 * @swagger
 * /api/portfolio/balances:
 *   post:
 *     summary: Get token balances for a wallet
 *     tags: [Portfolio]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - address
 *               - tokenAddresses
 *             properties:
 *               address:
 *                 type: string
 *                 description: Wallet address to check balances for
 *               tokenAddresses:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of token addresses to get balances for
 *     responses:
 *       200:
 *         description: Token balances retrieved successfully
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
 *                     description: Token balance in smallest unit
 */
router.post('/balances', (req, res) => portfolioController.getTokenBalances(req, res));

/**
 * @swagger
 * /api/portfolio/balance/{userId}/{address}:
 *   get:
 *     summary: Get portfolio balance for a user and address
 *     tags: [Portfolio]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *         description: Wallet address
 *     responses:
 *       200:
 *         description: Portfolio balance retrieved successfully
 */
router.get('/balance/:userId/:address', (req, res) => portfolioController.getPortfolioBalance(req, res));

// Note: getPortfolio endpoint is commented out as the method is not implemented in the controller
// Uncomment and implement the controller method before using this endpoint
/**
 * @swagger
 * /api/portfolio/{userId}:
 *   get:
 *     summary: Get portfolio for a user
 *     tags: [Portfolio]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: Portfolio retrieved successfully
 */
// router.get('/:userId', (req, res) => portfolioController.getPortfolio(req, res));

/**
 * @swagger
 * /api/portfolio/{userId}/transactions:
 *   post:
 *     summary: Record a new transaction
 *     tags: [Portfolio]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Transaction'
 *     responses:
 *       201:
 *         description: Transaction recorded successfully
 */
router.post('/:userId/transactions', (req, res) => portfolioController.recordTransaction(req, res));

/**
 * @swagger
 * /api/portfolio/{userId}/transactions:
 *   get:
 *     summary: Get transaction history for a user
 *     tags: [Portfolio]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: Transaction history retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Transaction'
 */
router.get('/:userId/transactions', (req, res) => portfolioController.getTransactionHistory(req, res));

export default router;
