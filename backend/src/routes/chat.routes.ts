import { Router } from 'express';
import { ChatController } from '../controllers/chat.controller';
import { asyncHandler } from './jupiter.routes';

const router = Router();
const chatController = new ChatController();

/**
 * @swagger
 * /api/chat/sessions:
 *   post:
 *     summary: Create a new chat session
 *     tags: [Chat]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *                 description: ID of the user creating the session
 *               context:
 *                 type: object
 *                 description: Initial context for the chat session
 *     responses:
 *       201:
 *         description: Chat session created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sessionId:
 *                   type: string
 *                 userId:
 *                   type: string
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 */
router.post('/sessions', asyncHandler(chatController.createSession));

/**
 * @swagger
 * /api/chat/send:
 *   post:
 *     summary: Send a message in a chat session
 *     tags: [Chat]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sessionId
 *               - message
 *             properties:
 *               sessionId:
 *                 type: string
 *                 description: ID of the chat session
 *               message:
 *                 type: string
 *                 description: The message content
 *               context:
 *                 type: object
 *                 description: Additional context for the message
 *     responses:
 *       200:
 *         description: Message sent and response received
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sessionId:
 *                   type: string
 *                 messages:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Message'
 */
router.post('/send', asyncHandler(chatController.sendMessage));

/**
 * @swagger
 * /api/chat/sessions/{sessionId}:
 *   get:
 *     summary: Get chat session history
 *     tags: [Chat]
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the chat session
 *     responses:
 *       200:
 *         description: Chat session retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sessionId:
 *                   type: string
 *                 userId:
 *                   type: string
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 messages:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Message'
 */
router.get('/sessions/:sessionId', asyncHandler(chatController.getSession));

/**
 * @swagger
 * /api/chat/sessions/user/{userId}:
 *   get:
 *     summary: Get all chat sessions for a user
 *     tags: [Chat]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the user
 *     responses:
 *       200:
 *         description: Chat sessions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   sessionId:
 *                     type: string
 *                   userId:
 *                     type: string
 *                   createdAt:
 *                     type: string
 *                     format: date-time
 *                   lastMessage:
 *                     $ref: '#/components/schemas/Message'
 */
router.get('/sessions/user/:userId', asyncHandler(chatController.getUserSessions));

export default router;
