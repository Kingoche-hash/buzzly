import mongoose from 'mongoose';
import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import { AppError } from '../utils/AppError.js';
import { getConversationForMember } from './conversation.service.js';

const SENDER_FIELDS = 'username displayName avatar';

// A message needs text, files, or both.
export const createMessage = async ({
  conversationId,
  senderId,
  content = '',
  attachments = [],
  storyReply,
}) => {
  if (!content && attachments.length === 0) {
    throw new AppError('Message cannot be empty', 400);
  }

  await getConversationForMember(conversationId, senderId);

  const message = await Message.create({
    conversation: conversationId,
    sender: senderId,
    content,
    attachments,
    storyReply,
  });

  await Conversation.updateOne(
    { _id: conversationId },
    { lastMessage: message._id, lastMessageAt: message.createdAt }
  );

  return message.populate('sender', SENDER_FIELDS);
};

// History in pages. Three ways to ask:
//   (nothing / before)  the newest messages, or older ones before a bookmark
//   around              a window of messages around one message (jumping to a search result)
//   after               newer messages after a bookmark (walking forward from the past)
export const getMessages = async ({ conversationId, userId, limit, before, after, around }) => {
  await getConversationForMember(conversationId, userId);

  const base = { conversation: conversationId };

  if (around) {
    const half = Math.ceil(limit / 2);

    const target = await Message.exists({ ...base, _id: around });
    if (!target) {
      throw new AppError('Message not found', 404);
    }

    const [olderFound, newerFound] = await Promise.all([
      Message.find({ ...base, _id: { $lt: around } })
        .sort({ _id: -1 })
        .limit(half + 1)
        .populate('sender', SENDER_FIELDS),
      Message.find({ ...base, _id: { $gte: around } })
        .sort({ _id: 1 })
        .limit(half + 1)
        .populate('sender', SENDER_FIELDS),
    ]);

    const hasMore = olderFound.length > half;
    const hasNewer = newerFound.length > half;

    const older = (hasMore ? olderFound.slice(0, half) : olderFound).reverse();
    const newer = hasNewer ? newerFound.slice(0, half) : newerFound;
    const messages = [...older, ...newer];

    return {
      messages,
      hasMore,
      nextCursor: hasMore ? messages[0]._id : null,
      hasNewer,
      newerCursor: hasNewer ? messages.at(-1)._id : null,
    };
  }

  if (after) {
    const found = await Message.find({ ...base, _id: { $gt: after } })
      .sort({ _id: 1 })
      .limit(limit + 1)
      .populate('sender', SENDER_FIELDS);

    const hasNewer = found.length > limit;
    const messages = hasNewer ? found.slice(0, limit) : found;

    return {
      messages,
      hasMore: false,
      nextCursor: null,
      hasNewer,
      newerCursor: hasNewer ? messages.at(-1)._id : null,
    };
  }

  const filter = { ...base };
  if (before) filter._id = { $lt: before };

  // Ask for one extra message, just to learn whether older ones exist.
  const found = await Message.find(filter)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .populate('sender', SENDER_FIELDS);

  const hasMore = found.length > limit;
  const page = hasMore ? found.slice(0, limit) : found;
  const messages = page.reverse(); // oldest first, ready to display

  return {
    messages,
    hasMore,
    nextCursor: hasMore ? messages[0]._id : null,
    hasNewer: false,
    newerCursor: null,
  };
};

// "I have received everything up to this message." Returns how many messages changed.
export const markDelivered = async ({ conversationId, userId, upToId }) => {
  await getConversationForMember(conversationId, userId);

  const result = await Message.updateMany(
    {
      conversation: conversationId,
      _id: { $lte: upToId },
      sender: { $ne: userId },
      deliveredTo: { $ne: userId },
    },
    { $addToSet: { deliveredTo: userId } }
  );

  return result.modifiedCount;
};

// "I have read everything up to this message." Reading also means delivered.
export const markRead = async ({ conversationId, userId, upToId }) => {
  await getConversationForMember(conversationId, userId);

  const result = await Message.updateMany(
    {
      conversation: conversationId,
      _id: { $lte: upToId },
      sender: { $ne: userId },
      readBy: { $ne: userId },
    },
    { $addToSet: { deliveredTo: userId, readBy: userId } }
  );

  return result.modifiedCount;
};

// Messages that arrived while the user was offline: mark them delivered.
// Returns one { conversationId, upToId } per conversation that changed.
export const markPendingDelivered = async (userId, conversationIds) => {
  if (conversationIds.length === 0) return [];

  const pending = await Message.aggregate([
    {
      $match: {
        conversation: { $in: conversationIds.map((id) => new mongoose.Types.ObjectId(id)) },
        sender: { $ne: userId },
        deliveredTo: { $ne: userId },
      },
    },
    { $group: { _id: '$conversation', upToId: { $max: '$_id' } } },
  ]);

  if (pending.length === 0) return [];

  await Message.bulkWrite(
    pending.map((item) => ({
      updateMany: {
        filter: {
          conversation: item._id,
          _id: { $lte: item.upToId },
          sender: { $ne: userId },
          deliveredTo: { $ne: userId },
        },
        update: { $addToSet: { deliveredTo: userId } },
      },
    }))
  );

  return pending.map((item) => ({
    conversationId: item._id.toString(),
    upToId: item.upToId.toString(),
  }));
};