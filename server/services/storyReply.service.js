import Story from '../models/Story.js';
import { AppError } from '../utils/AppError.js';
import { createDirectConversation } from './conversation.service.js';
import { createMessage } from './message.service.js';
import { getContactIds } from './presence.service.js';

// What the message remembers about the story, because the story disappears after 24 hours.
const snapshotOf = (story) => ({
  story: story._id,
  type: story.type,
  text: (story.text || '').slice(0, 120),
  background: story.background,
  imageUrl: story.image?.url || '',
});

// Sends a reply to someone's story as a normal message in your chat with them.
export const replyToStory = async ({ userId, storyId, content }) => {
  const story = await Story.findOne({ _id: storyId, expiresAt: { $gt: new Date() } });

  if (!story) {
    throw new AppError('Story not found', 404);
  }

  if (story.author.toString() === userId.toString()) {
    throw new AppError('You cannot reply to your own story', 400);
  }

  // Only people who share a chat with the author may see the story, so only they may reply.
  const contacts = await getContactIds(userId);

  if (!contacts.includes(story.author.toString())) {
    throw new AppError('Story not found', 404);
  }

  // The reply goes to the direct chat between the two. It is created if it does not exist yet.
  const { conversation, created } = await createDirectConversation(userId, story.author.toString());

  const message = await createMessage({
    conversationId: conversation._id,
    senderId: userId,
    content,
    storyReply: snapshotOf(story),
  });

  return { conversation, created, message };
};
