import { Request, Response } from 'express';
import { ChatService } from '../services/chat.service';
import { Message } from '../interfaces/chat.interface';

export class ChatController {
  private chatService: ChatService;

  constructor() {
    this.chatService = new ChatService();
  }

  async createSession(req: Request, res: Response): Promise<void> {
    try {
      const { userId, context } = req.body;
      const session = await this.chatService.createChatSession(userId, context);
      res.status(201).json(session);
    } catch (error) {
      console.error('Error creating chat session:', error);
      res.status(500).json({ error: 'Failed to create chat session' });
    }
  };

  async sendMessage(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId, message, context } = req.body;

      // Generate AI response
      const aiResponse = await this.chatService.generateResponse(message, context);

      // Create user message
      const userMessage: Message = {
        id: Date.now().toString(),
        content: message,
        role: 'user',
        timestamp: new Date()
      };

      // Create AI message
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: aiResponse.content,
        role: 'assistant',
        timestamp: new Date(),
        metadata: aiResponse.metadata
      };

      // Add messages to session
      await this.chatService.addMessageToSession(sessionId, userMessage);
      await this.chatService.addMessageToSession(sessionId, aiMessage);

      res.status(200).json({
        userMessage,
        aiMessage
      });
    } catch (error) {
      console.error('Error processing message:', error);
      res.status(500).json({ error: 'Failed to process message' });
    }
  };

  async getSessionHistory(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const messages = await this.chatService.getSessionHistory(sessionId);
      res.status(200).json(messages);
    } catch (error) {
      console.error('Error fetching session history:', error);
      res.status(500).json({ error: 'Failed to fetch session history' });
    }
  };
}