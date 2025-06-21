export interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  metadata?: {
    tokens?: number;
    model?: string;
    context?: string;
  };
}

export interface ChatSession {
  id: string;
  userId: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  title?: string;
  context?: string;
}

export interface AIResponse {
  content: string;
  metadata?: {
    tokens: number;
    model: string;
    context?: string;
  };
}