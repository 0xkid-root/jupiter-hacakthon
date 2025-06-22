import { body } from 'express-validator';

export const routeValidations = {
  createProfile: [
    body('username').isString().notEmpty(),
    body('bio').optional().isString(),
    body('avatarUrl').optional().isURL(),
  ],
  createPost: [
    body('content').isString().notEmpty(),
    body('tags').optional().isArray(),
    body('mentions').optional().isArray(),
  ],
  createComment: [
    body('content').isString().notEmpty(),
  ],
  createInteraction: [
    body('type').isIn(['like', 'repost', 'bookmark']),
  ],
};
