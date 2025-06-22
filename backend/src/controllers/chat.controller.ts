import { Request, Response } from 'express';
import { ChatService } from '../services/chat.service';
import { Message } from '../interfaces/chat.interface';

interface SendMessageRequest extends Request {
  body: {
    sessionId: string;
    message: string;
    context?: Record<string, unknown>;
  };
}

export class ChatController {
  private chatService: ChatService;

  constructor() {
    this.chatService = new ChatService();
  }

  async createSession(req: Request, res: Response): Promise<void> {
    try {
      const { userId, context } = req.body;
      if (!userId) {
        res.status(400).json({ error: 'User ID is required' });
        return;
      }
      const session = await this.chatService.createChatSession(userId, context || {});
      res.status(201).json(session);
    } catch (error) {
      console.error('Error creating chat session:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to create chat session' 
      });
    }
  }

  async sendMessage(req: SendMessageRequest, res: Response): Promise<void> {
    try {
      const { sessionId, message, context } = req.body;
      
      if (!sessionId || !message) {
        res.status(400).json({ error: 'Session ID and message are required' });
        return;
      }

      // Generate AI response first to fail fast if there's an error
      const contextString = context ? JSON.stringify(context) : '';
      const aiResponse = await this.chatService.generateResponse(message, contextString);

      // Create and save user message
      const userMessage: Message = {
        id: Date.now().toString(),
        content: message,
        role: 'user',
        timestamp: new Date()
      };
      await this.chatService.addMessageToSession(sessionId, userMessage);

      // Create and save AI message
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: aiResponse.content,
        role: 'assistant',
        timestamp: new Date(),
        metadata: aiResponse.metadata
      };
      await this.chatService.addMessageToSession(sessionId, aiMessage);

      // Return the updated session with all messages
      const session = await this.chatService.getSession(sessionId);
      if (!session) {
        res.status(404).json({ error: 'Session not found after message processing' });
        return;
      }

      res.status(200).json({
        session,
        messages: [userMessage, aiMessage]
      });
    } catch (error) {
      console.error('Error sending message:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to process message' 
      });
    }
  }

  async getSession(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      if (!sessionId) {
        res.status(400).json({ error: 'Session ID is required' });
        return;
      }
      
      const session = await this.chatService.getSession(sessionId);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }
      
      res.status(200).json(session);
    } catch (error) {
      console.error('Error getting session:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to retrieve session' 
      });
    }
  }

  async getUserSessions(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      if (!userId) {
        res.status(400).json({ error: 'User ID is required' });
        return;
      }

      const sessions = await this.chatService.getUserSessions(userId);
      res.status(200).json(sessions);
    } catch (error) {
      console.error('Error getting user sessions:', error);
      this.handleError(res, error);
    }
  }

  async getSessionHistory(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      if (!sessionId) {
        res.status(400).json({ error: 'Session ID is required' });
        return;
      }
      
      const messages = await this.chatService.getSessionHistory(sessionId);
      res.status(200).json({ messages });
    } catch (error) {
      console.error('Error getting session history:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to retrieve session history' 
      });
    }
  };

  private handleError(res: Response, error: unknown): void {
    console.error('Error:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'An unknown error occurred' 
    });
  }
}