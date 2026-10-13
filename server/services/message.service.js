import mongoose from 'mongoose';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import MessageReport from '../models/MessageReport.js';
import { resolveMentions } from './mention.service.js';
import { AppError } from '../utils/AppError.js';
import { getConversationForMember } from './conversation.service.js';
import { assertCanMessageInConversation } from './friend.service.js';
import { deleteAttachments } from './upload.service.js';

const SENDER_FIELDS = 'username displayName avatar';

// A message can be edited for 15 minutes after it was sent.
export const EDIT_WINDOW_MS = 15 * 60 * 1000;

const sameId = (a, b) => a.toString() === b.toString();

// A short copy of the message being answered, so the reply still makes sense if the original is deleted.
const replySnapshot = async (conversationId, userId, replyToId) => {
  const original = await Message.findOne({
    _id: replyToId,
    conversation: conversationId,
    deletedAt: null,
    deletedFor: { $ne: userId },
  }).populate('sender', SENDER_FIELDS);

  if (!original) {
    throw new AppError('The message you are replying to was not found', 404);
  }

  const first = original.attachments?.[0];
  const isImage = Boolean(first?.mimeType?.startsWith('image/'));

  let text = original.content;

  if (!text) {
    if (original.sharedPost) text = '📸 Shared a post';
    else if (original.storyReply) text = 'Reply to a story';
    else if (first) text = isImage ? '📷 Photo' : `📎 ${first.fileName || 'File'}`;
  }

  return {
    message: original._id,
    sender: original.sender._id,
    senderName: (original.sender.displayName || original.sender.username).slice(0, 60),
    text: (text || '').slice(0, 140),
    imageUrl: isImage ? first.url : '',
  };
};

// A message needs text, files, or a shared post.
export const createMessage = async ({
  conversationId,
  senderId,
  content = '',
  attachments = [],
  storyReply,
  sharedPost,
  replyTo,
}) => {
  if (!content && attachments.length === 0 && !sharedPost) {
    throw new AppError('Message cannot be empty', 400);
  }

  const conversation = await getConversationForMember(conversationId, senderId);
  await assertCanMessageInConversation(conversation, senderId);

  const reply = replyTo ? await replySnapshot(conversationId, senderId, replyTo) : undefined;
  const mentions = await resolveMentions(conversation, content);

  const message = await Message.create({
    conversation: conversationId,
    sender: senderId,
    content,
    attachments,
    storyReply,
    sharedPost,
    replyTo: reply,
    mentions,
  });

  await Conversation.updateOne(
    { _id: conversationId },
    { lastMessage: message._id, lastMessageAt: message.createdAt }
  );

  return message.populate('sender', SENDER_FIELDS);
};

// One message, with its sender, ready to send to the browser.
export const getMessageDto = (messageId) => Message.findById(messageId).populate('sender', SENDER_FIELDS);

// History in pages. Three ways to ask:
//   (nothing / before)  the newest messages, or older ones before a bookmark
//   around              a window of messages around one message (jumping to a search result)
//   after               newer messages after a bookmark (walking forward from the past)
// Messages I deleted for myself never show up.
export const getMessages = async ({ conversationId, userId, limit, before, after, around }) => {
  await getConversationForMember(conversationId, userId);

  const base = { conversation: conversationId, deletedFor: { $ne: userId } };

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

// A message in a chat I belong to, that I have not deleted for myself.
const findMessageForMember = async ({ conversationId, messageId, userId }) => {
  await getConversationForMember(conversationId, userId);

  const message = await Message.findOne({
    _id: messageId,
    conversation: conversationId,
    deletedFor: { $ne: userId },
  });

  if (!message) {
    throw new AppError('Message not found', 404);
  }

  return message;
};

// Only the writer, only text, only for 15 minutes.
export const editMessage = async ({ conversationId, messageId, userId, content }) => {
  const message = await findMessageForMember({ conversationId, messageId, userId });

  if (!sameId(message.sender, userId)) {
    throw new AppError('You can only edit your own messages', 403);
  }

  if (message.deletedAt) {
    throw new AppError('This message was deleted', 400);
  }

  if (message.sharedPost) {
    throw new AppError('A shared post cannot be edited', 400);
  }

  if (Date.now() - message.createdAt.getTime() > EDIT_WINDOW_MS) {
    throw new AppError('Messages can only be edited within 15 minutes', 400);
  }

  if (message.content !== content) {
    // updateOne (not save), so an edit never brings a deleted chat back.
    await Message.updateOne({ _id: messageId }, { $set: { content, editedAt: new Date() } });
  }

  return getMessageDto(messageId);
};

// Hides a message from me only.
export const deleteMessageForMe = async ({ conversationId, messageId, userId }) => {
  await getConversationForMember(conversationId, userId);

  const result = await Message.updateOne(
    { _id: messageId, conversation: conversationId },
    { $addToSet: { deletedFor: userId } }
  );

  if (result.matchedCount === 0) {
    throw new AppError('Message not found', 404);
  }
};

// The writer turns the message into an empty "This message was deleted" for everybody.
export const deleteMessageForEveryone = async ({ conversationId, messageId, userId }) => {
  const message = await findMessageForMember({ conversationId, messageId, userId });

  if (!sameId(message.sender, userId)) {
    throw new AppError('You can only delete your own messages for everyone', 403);
  }

  if (!message.deletedAt) {
    const attachments = message.attachments.map((attachment) => attachment.toObject());

    await Message.updateOne(
      { _id: messageId },
      {
        $set: { content: '', attachments: [], reactions: [], deletedAt: new Date() },
        $unset: { storyReply: '', sharedPost: '', replyTo: '', editedAt: '' },
      }
    );

    try {
      await deleteAttachments(attachments);
    } catch (error) {
      console.error('Could not delete the files of a deleted message:', error.message);
    }
  }

  return getMessageDto(messageId);
};

// One reaction per person: choosing another one replaces it.
export const setReaction = async ({ conversationId, messageId, userId, emoji }) => {
  const message = await findMessageForMember({ conversationId, messageId, userId });

  if (message.deletedAt) {
    throw new AppError('This message was deleted', 400);
  }

  const updated = await Message.updateOne(
    { _id: messageId, 'reactions.user': userId },
    { $set: { 'reactions.$.emoji': emoji } }
  );

  if (updated.matchedCount === 0) {
    await Message.updateOne(
      { _id: messageId, 'reactions.user': { $ne: userId } },
      { $push: { reactions: { user: userId, emoji } } }
    );
  }

  return getMessageDto(messageId);
};

export const removeReaction = async ({ conversationId, messageId, userId }) => {
  await findMessageForMember({ conversationId, messageId, userId });

  await Message.updateOne({ _id: messageId }, { $pull: { reactions: { user: userId } } });

  return getMessageDto(messageId);
};

export const reportMessage = async ({ conversationId, messageId, userId, reason }) => {
  const message = await findMessageForMember({ conversationId, messageId, userId });

  if (sameId(message.sender, userId)) {
    throw new AppError('You cannot report your own message', 400);
  }

  if (message.deletedAt) {
    throw new AppError('Message not found', 404);
  }

  try {
    await MessageReport.create({
      reporter: userId,
      message: message._id,
      conversation: conversationId,
      reported: message.sender,
      reason,
      content: (message.content || '').slice(0, 300),
    });
  } catch (error) {
    // Already reported by this person: it still counts once.
    if (error.code !== 11000) throw error;
  }
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
