import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const messageParams = z.object({ conversationId: objectId, messageId: objectId });

// "Reply to this message" travels in the web address when files are sent.
export const replyQuerySchema = z.object({ replyTo: objectId.optional() });

export const editMessageSchema = z.object({
  content: z.string().trim().min(1, 'Message cannot be empty').max(4000, 'Message is too long'),
});

export const deleteScopeSchema = z.object({ scope: z.enum(['me', 'everyone']) });

// The reactions people can choose from. The heart is written with its code so it always matches.
export const REACTION_EMOJIS = ['👍', '\u2764\uFE0F', '😂', '😮', '😢', '🙏'];

// The same emoji can arrive with or without an invisible "picture style" mark.
const strip = (value) => value.replace(/\uFE0F/g, '');
const find = (value) => REACTION_EMOJIS.find((emoji) => strip(emoji) === strip(value));

export const reactionSchema = z.object({
  emoji: z
    .string()
    .max(8)
    .refine((value) => Boolean(find(value)), 'Choose one of the available reactions')
    .transform((value) => find(value)),
});

export const reportMessageSchema = z.object({
  reason: z.enum(['spam', 'harassment', 'inappropriate', 'other']),
});
