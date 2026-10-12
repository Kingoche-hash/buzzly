import { z } from 'zod';

export const STORY_BACKGROUNDS = ['emerald', 'ocean', 'sunset', 'violet', 'rose', 'night'];

export const createStorySchema = z.object({
  text: z.string().trim().max(280, 'A story can have at most 280 characters').optional(),
  background: z.enum(STORY_BACKGROUNDS).optional(),
});

export const storyIdParams = z.object({
  storyId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id'),
});
export const replyStorySchema = z.object({
  content: z.string().trim().min(1, 'Write a reply').max(500, 'A reply can have at most 500 characters'),
});
