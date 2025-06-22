import { GoogleGenerativeAI } from '@google/generative-ai';
import { Message, ChatSession, AIResponse } from '../interfaces/chat.interface';
import { v4 as uuidv4 } from 'uuid';
import { Pool } from 'pg';

export class ChatService {
  private genAI: GoogleGenerativeAI;
  private model: any;
  private pool: Pool;
  private sessions: Map<string, ChatSession> = new Map();

  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
    
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
  }

  async createChatSession(userId: string, context?: string): Promise<ChatSession> {
    const session: ChatSession = {
      id: uuidv4(),
      userId,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      context
    };
    return session;
  }

  async getSession(sessionId: string): Promise<ChatSession | null> {
    try {
      const result = await this.pool.query(
        'SELECT * FROM chat_sessions WHERE id = $1',
        [sessionId]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return result.rows[0];
    } catch (error) {
      console.error('Error getting session:', error);
      throw new Error('Failed to get session');
    }
  }

  async getUserSessions(userId: string): Promise<ChatSession[]> {
    try {
      const result = await this.pool.query(
        'SELECT * FROM chat_sessions WHERE user_id = $1 ORDER BY updated_at DESC',
        [userId]
      );
      return result.rows;
    } catch (error) {
      console.error('Error getting user sessions:', error);
      throw new Error('Failed to get user sessions');
    }
  }


  async generateResponse(message: string, context?: string): Promise<AIResponse> {
    try {
      const chat = this.model.startChat({
        history: [],
        generationConfig: {
          maxOutputTokens: 2048,
        },
      });

      const result = await chat.sendMessage(message);
      const response = await result.response;
      const text = response.text();

      return {
        content: text,
        metadata: {
          tokens: response.promptFeedback?.tokenCount || 0,
          model: 'gemini-pro',
          context
        }
      };
    } catch (error) {
      console.error('Error generating AI response:', error);
      throw new Error('Failed to generate AI response');
    }
  }

  async addMessageToSession(sessionId: string, message: Message): Promise<void> {
    // In a real implementation, this would interact with a database
    // For now, we'll just log the message
    console.log(`Adding message to session ${sessionId}:`, message);
  }

  async getSessionHistory(sessionId: string): Promise<Message[]> {
    // In a real implementation, this would fetch from a database
    // For now, return an empty array
    return [];
  }
}