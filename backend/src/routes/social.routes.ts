import { Router, Request, Response } from 'express';
import { SocialController } from '../controllers/social.controller';

const router = Router();
const socialController = new SocialController();

/**
 * @swagger
 * /api/social/profiles:
 *   post:
 *     summary: Create a new user profile
 *     tags: [Social]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - address
 *               - username
 *             properties:
 *               address:
 *                 type: string
 *                 description: User's wallet address
 *               username:
 *                 type: string
 *                 description: Unique username
 *               bio:
 *                 type: string
 *                 description: User biography
 *     responses:
 *       201:
 *         description: Profile created successfully
 */
router.post('/profiles', (req: Request, res: Response) =>
  socialController.createProfile(req, res)
);

/**
 * @swagger
 * /api/social/posts/{userId}:
 *   post:
 *     summary: Create a new post
 *     tags: [Social]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the user creating the post
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *                 description: Post content
 *               attachments:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of attachment URLs
 *     responses:
 *       201:
 *         description: Post created successfully
 */
router.post('/posts/:userId', (req: Request, res: Response) =>
  socialController.createPost(req, res)
);

/**
 * @swagger
 * /api/social/posts/{postId}/comments/{userId}:
 *   post:
 *     summary: Add a comment to a post
 *     tags: [Social]
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the post to comment on
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the user making the comment
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *                 description: Comment content
 *               replyTo:
 *                 type: string
 *                 description: ID of the comment being replied to (if any)
 *     responses:
 *       201:
 *         description: Comment added successfully
 */
router.post('/posts/:postId/comments/:userId', (req: Request, res: Response) =>
  socialController.createComment(req, res)
);

/**
 * @swagger
 * /api/social/interactions/{userId}/{targetId}:
 *   post:
 *     summary: Create an interaction (like, repost, etc.)
 *     tags: [Social]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the user performing the interaction
 *       - in: path
 *         name: targetId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the target post or comment
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [like, repost, bookmark]
 *                 description: Type of interaction
 *     responses:
 *       201:
 *         description: Interaction recorded successfully
 */
router.post('/:userId/interact/:targetId', (req: Request, res: Response) =>
  socialController.createInteraction(req, res)
);

export default router;