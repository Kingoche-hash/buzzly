import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import { getHiddenIds } from './block.service.js';
import { getConversationForMember } from './conversation.service.js';

export const searchMessages = async ({ userId, query, conversationId, senderId, before, limit }) => {
  let conversationFilter;

  if (conversationId) {
    // Searching one chat: the person must belong to it.
    await getConversationForMember(conversationId, userId);
    conversationFilter = conversationId;
  } else {
    // Searching everywhere: only inside the chats the person belongs to.
    // Chats with blocked people (either way) are not searched.
    const hidden = new Set(await getHiddenIds(userId));
    const all = await Conversation.find({ members: userId }).select('_id type members').lean();
    const mine = all.filter(
      (conversation) =>
        conversation.type !== 'direct' ||
        !conversation.members.some((member) => hidden.has(member.toString()))
    );

    if (mine.length === 0) {
      return { results: [], hasMore: false, nextCursor: null };
    }

    conversationFilter = { $in: mine.map((conversation) => conversation._id) };
  }

  // Deleted messages, and messages I deleted for myself, are never found.
  const filter = {
    $text: { $search: query },
    conversation: conversationFilter,
    deletedAt: null,
    deletedFor: { $ne: userId },
  };

  if (senderId) filter.sender = senderId;
  if (before) filter._id = { $lt: before };

  // Newest first. Ask for one extra result, just to learn whether more exist.
  const found = await Message.find(filter)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .select('conversation sender content attachments createdAt')
    .populate('sender', 'username displayName avatar');

  const hasMore = found.length > limit;
  const results = hasMore ? found.slice(0, limit) : found;

  return {
    results,
    hasMore,
    nextCursor: hasMore ? results.at(-1)._id : null,
  };
};