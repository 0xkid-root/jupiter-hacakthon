import { ValidationError } from './errors';

/**
 * Validates a Solana wallet address
 * @param address The address to validate
 * @returns The validated address in lowercase
 * @throws {ValidationError} If the address is invalid
 */
export const validateAddress = (address: string): string => {
  if (!address || typeof address !== 'string') {
    throw new ValidationError('Address must be a string');
  }
  
  // Basic Solana address validation (32-44 base58 chars)
  const trimmed = address.trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)) {
    throw new ValidationError('Invalid Solana address format');
  }
  
  return trimmed.toLowerCase();
};

/**
 * Validates a username
 * @param username The username to validate
 * @returns The validated username
 * @throws {ValidationError} If the username is invalid
 */
export const validateUsername = (username: string): string => {
  if (!username || typeof username !== 'string') {
    throw new ValidationError('Username must be a string');
  }
  
  const trimmed = username.trim();
  if (trimmed.length < 3 || trimmed.length > 30) {
    throw new ValidationError('Username must be between 3 and 30 characters');
  }
  
  if (!/^[a-zA-Z0-9_.-]+$/.test(trimmed)) {
    throw new ValidationError('Username can only contain letters, numbers, dots, underscores, and hyphens');
  }
  
  return trimmed;
};

/**
 * Validates a post content
 * @param content The content to validate
 * @returns The validated content
 * @throws {ValidationError} If the content is invalid
 */
export const validatePostContent = (content: string): string => {
  if (typeof content !== 'string') {
    throw new ValidationError('Content must be a string');
  }
  
  const trimmed = content.trim();
  if (trimmed.length > 1000) {
    throw new ValidationError('Content cannot exceed 1000 characters');
  }
  
  return trimmed;
};

/**
 * Validates a list of tags
 * @param tags The tags to validate
 * @returns The validated tags
 * @throws {ValidationError} If any tag is invalid
 */
export const validateTags = (tags: string[]): string[] => {
  if (!Array.isArray(tags)) {
    throw new ValidationError('Tags must be an array');
  }
  
  if (tags.length > 10) {
    throw new ValidationError('Cannot have more than 10 tags');
  }
  
  return tags.map(tag => {
    if (typeof tag !== 'string' || tag.length > 30) {
      throw new ValidationError('Each tag must be a string of max 30 characters');
    }
    return tag.trim();
  }).filter(Boolean); // Remove empty strings
};

/**
 * Validates a URL
 * @param url The URL to validate
 * @returns The validated URL
 * @throws {ValidationError} If the URL is invalid
 */
export const validateUrl = (url: string): string => {
  if (typeof url !== 'string') {
    throw new ValidationError('URL must be a string');
  }
  
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Invalid protocol');
    }
    return parsed.toString();
  } catch (error) {
    throw new ValidationError('Invalid URL');
  }
};

/**
 * Validates pagination parameters
 * @param page The page number (1-based)
 * @param limit The number of items per page
 * @returns The validated pagination parameters
 * @throws {ValidationError} If parameters are invalid
 */
export const validatePagination = (page: number, limit: number): { page: number; limit: number } => {
  const pageNum = Number(page) || 1;
  const limitNum = Number(limit) || 10;
  
  if (pageNum < 1 || !Number.isInteger(pageNum)) {
    throw new ValidationError('Page must be a positive integer');
  }
  
  if (limitNum < 1 || limitNum > 100 || !Number.isInteger(limitNum)) {
    throw new ValidationError('Limit must be an integer between 1 and 100');
  }
  
  return { page: pageNum, limit: limitNum };
};
