import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const memberParams = z.object({ conversationId: objectId, userId: objectId });

export const renameGroupSchema = z.object({
  name: z.string().trim().min(1, 'Group name is required').max(50, 'Group name is too long'),
});

export const addMembersSchema = z.object({
  userIds: z
    .array(objectId)
    .min(1, 'Choose at least one person')
    .max(20, 'You can add at most 20 people at once'),
});
