import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const blockUserParams = z.object({ userId: objectId });

export const reportUserSchema = z.object({
  reason: z.enum(['spam', 'harassment', 'fake_account', 'inappropriate', 'other']),
  details: z.string().trim().max(300, 'A note can have at most 300 characters').optional(),
});
