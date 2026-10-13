import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const conversationIdParams = z.object({
  conversationId: objectId,
});

export const createConversationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('direct'),
    userId: objectId,
  }),
  z.object({
    type: z.literal('group'),
    name: z.string().trim().min(1, 'Group name is required').max(50, 'Group name is too long'),
    memberIds: z.array(objectId).min(1, 'Add at least one member').max(49, 'Too many members'),
  }),
]);

export const sendMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'Message cannot be empty')
    .max(4000, 'Message is too long'),
  // The message this one answers (optional).
  replyTo: objectId.optional(),
});

export const messageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(30),
  before: objectId.optional(),
  after: objectId.optional(),
  around: objectId.optional(),
});