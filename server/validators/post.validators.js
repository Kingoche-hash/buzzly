import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const postIdParams = z.object({ postId: objectId });
export const commentParams = z.object({ postId: objectId, commentId: objectId });
export const userPostsParams = z.object({ userId: objectId });

export const createPostSchema = z.object({
  caption: z.string().trim().max(2000, 'A caption can have at most 2000 characters').optional(),
});

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(10),
  before: objectId.optional(),
});

export const commentsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(30).default(15),
  before: objectId.optional(),
});

export const addCommentSchema = z.object({
  text: z.string().trim().min(1, 'Write a comment').max(500, 'A comment can have at most 500 characters'),
});

export const reportSchema = z.object({
  reason: z.enum(['spam', 'inappropriate', 'harassment', 'other']),
});
