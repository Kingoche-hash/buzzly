import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const friendUserParams = z.object({ userId: objectId });

export const messageSettingsSchema = z.object({
  whoCanMessage: z.enum(['everyone', 'friends']),
});
