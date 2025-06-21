export interface UserProfile {
  id: string;
  username: string;
  address: string;
  avatar?: string;
  bio?: string;
  followers: number;
  following: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Post {
  id: string;
  userId: string;
  content: string;
  attachments?: {
    type: 'image' | 'link' | 'transaction';
    url: string;
    metadata?: any;
  }[];
  likes: number;
  comments: number;
  shares: number;
  createdAt: Date;
  updatedAt: Date;
  tags?: string[];
}

export interface Comment {
  id: string;
  postId: string;
  userId: string;
  content: string;
  likes: number;
  createdAt: Date;
  updatedAt: Date;
  replyTo?: string;
}

export interface Interaction {
  id: string;
  userId: string;
  targetId: string;
  type: 'LIKE' | 'COMMENT' | 'SHARE' | 'FOLLOW';
  createdAt: Date;
}