import { Request, Response } from 'express';
import { SocialService } from '../services/social.service';

export class SocialController {
  private socialService: SocialService;

  constructor() {
    this.socialService = new SocialService();
  }

  async createProfile(req: Request, res: Response): Promise<void> {
    try {
      const { address, username, bio } = req.body;
      const profile = await this.socialService.createProfile(address, username, bio);
      res.status(201).json(profile);
    } catch (error) {
      console.error('Error creating profile:', error);
      res.status(500).json({ error: 'Failed to create profile' });
    }
  };

  async createPost(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { content, attachments } = req.body;
      const post = await this.socialService.createPost(userId, content, attachments);
      res.status(201).json(post);
    } catch (error) {
      console.error('Error creating post:', error);
      res.status(500).json({ error: 'Failed to create post' });
    }
  };

  async createComment(req: Request, res: Response): Promise<void> {
    try {
      const { userId, postId } = req.params;
      const { content, replyTo } = req.body;
      const comment = await this.socialService.createComment(userId, postId, content, replyTo);
      res.status(201).json(comment);
    } catch (error) {
      console.error('Error creating comment:', error);
      res.status(500).json({ error: 'Failed to create comment' });
    }
  };

  async createInteraction(req: Request, res: Response): Promise<void> {
    try {
      const { userId, targetId } = req.params;
      const { type } = req.body;
      const interaction = await this.socialService.createInteraction(userId, targetId, type);
      res.status(201).json(interaction);
    } catch (error) {
      console.error('Error creating interaction:', error);
      res.status(500).json({ error: 'Failed to create interaction' });
    }
  };

  async getFeed(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { page, limit } = req.query;
      const feed = await this.socialService.getFeed(
        userId,
        parseInt(page as string) || 1,
        parseInt(limit as string) || 10
      );
      res.status(200).json(feed);
    } catch (error) {
      console.error('Error fetching feed:', error);
      res.status(500).json({ error: 'Failed to fetch feed' });
    }
  };

  async getProfile(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const profile = await this.socialService.getProfile(userId);
      if (!profile) {
        res.status(404).json({ error: 'Profile not found' });
        return;
      }
      res.status(200).json(profile);
    } catch (error) {
      console.error('Error fetching profile:', error);
      res.status(500).json({ error: 'Failed to fetch profile' });
    }
  };

  async getPostComments(req: Request, res: Response): Promise<void> {
    try {
      const { postId } = req.params;
      const { page, limit } = req.query;
      const comments = await this.socialService.getPostComments(
        postId,
        parseInt(page as string) || 1,
        parseInt(limit as string) || 10
      );
      res.status(200).json(comments);
    } catch (error) {
      console.error('Error fetching comments:', error);
      res.status(500).json({ error: 'Failed to fetch comments' });
    }
  };

  async updateProfile(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const updates = req.body;
      const profile = await this.socialService.updateProfile(userId, updates);
      res.status(200).json(profile);
    } catch (error) {
      console.error('Error updating profile:', error);
      res.status(500).json({ error: 'Failed to update profile' });
    }
  };

  async deletePost(req: Request, res: Response): Promise<void> {
    try {
      const { userId, postId } = req.params;
      await this.socialService.deletePost(userId, postId);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting post:', error);
      res.status(500).json({ error: 'Failed to delete post' });
    }
  };
}