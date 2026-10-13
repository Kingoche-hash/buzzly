import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import User from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { getBlockState, getHiddenIds, isHiddenBetween } from './block.service.js';
import { DEFAULT_STATE, getStatesById } from './conversationState.service.js';

const MEMBER_FIELDS =
  'username displayName avatar isOnline lastSeen privacy.showPresence privacy.readReceipts';

const populateConversation = (query) =>
  query
    .populate('members', MEMBER_FIELDS)
    .populate({ path: 'lastMessage', select: 'content sender createdAt attachments' });

// People who switched off "show when I'm online" must not leak it through the member list.
const hidePrivateDetails = (conversationJson) => ({
  ...conversationJson,
  members: conversationJson.members.map((member) =>
    member.privacy?.showPresence === false ? { ...member, isOnline: false, lastSeen: null } : member
  ),
});

// The access check used everywhere: is this user sitting at this table?
// A direct chat with someone who is blocked (in either direction) does not exist for either person.
export const getConversationForMember = async (conversationId, userId) => {
  const conversation = await Conversation.findOne({ _id: conversationId, members: userId });

  if (!conversation) {
    throw new AppError('Conversation not found', 404);
  }

  if (conversation.type === 'direct') {
    const other = conversation.members.find((id) => id.toString() !== userId.toString());

    if (other && (await isHiddenBetween(userId, other))) {
      throw new AppError('Conversation not found', 404);
    }
  }

  return conversation;
};

export const createDirectConversation = async (currentUserId, otherUserId) => {
  if (currentUserId.toString() === otherUserId) {
    throw new AppError('You cannot start a conversation with yourself', 400);
  }

  const other = await User.findOne({ _id: otherUserId, deletedAt: null }).select('_id');
  if (!other) {
    throw new AppError('User not found', 404);
  }

  // Someone who blocked me looks like a missing account. Someone I blocked needs unblocking first.
  const { blockedByMe, blockedMe } = await getBlockState(currentUserId);

  if (blockedMe.has(otherUserId)) {
    throw new AppError('User not found', 404);
  }

  if (blockedByMe.has(otherUserId)) {
    throw new AppError('You blocked this person. Unblock them to send messages.', 403);
  }

  const directKey = [currentUserId.toString(), otherUserId].sort().join('_');

  let conversation = await Conversation.findOne({ directKey });
  let created = false;

  if (!conversation) {
    try {
      conversation = await Conversation.create({
        type: 'direct',
        members: [currentUserId, otherUserId],
        createdBy: currentUserId,
        directKey,
      });
      created = true;
    } catch (error) {
      // Two requests at once: the unique index stopped the second one. Use the first.
      if (error.code !== 11000) throw error;
      conversation = await Conversation.findOne({ directKey });
    }
  }

  const populated = await populateConversation(Conversation.findById(conversation._id));
  return { conversation: hidePrivateDetails(populated.toJSON()), created };
};

export const createGroupConversation = async (currentUserId, { name, memberIds }) => {
  const ids = [...new Set([currentUserId.toString(), ...memberIds])];

  if (ids.length < 2) {
    throw new AppError('A group needs at least one other member', 400);
  }

  const found = await User.countDocuments({ _id: { $in: ids }, deletedAt: null });
  if (found !== ids.length) {
    throw new AppError('One or more users do not exist', 404);
  }

  const conversation = await Conversation.create({
    type: 'group',
    name,
    members: ids,
    createdBy: currentUserId,
  });

  const populated = await populateConversation(Conversation.findById(conversation._id));
  return hidePrivateDetails(populated.toJSON());
};

// My conversations, newest first. Each has my unread count and my private settings (pinned, muted...).
// Direct chats with blocked people (either way) are left out; groups stay.
export const listConversations = async (userId) => {
  const [found, hidden] = await Promise.all([
    populateConversation(Conversation.find({ members: userId }).sort({ lastMessageAt: -1 })),
    getHiddenIds(userId),
  ]);

  const hiddenSet = new Set(hidden);

  const conversations = found.filter(
    (conversation) =>
      conversation.type !== 'direct' ||
      !conversation.members.some((member) => hiddenSet.has(member._id.toString()))
  );

  if (conversations.length === 0) return [];

  const ids = conversations.map((conversation) => conversation._id);

  const [counts, states] = await Promise.all([
    Message.aggregate([
      {
        $match: {
          conversation: { $in: ids },
          sender: { $ne: userId },
          readBy: { $ne: userId },
        },
      },
      { $group: { _id: '$conversation', count: { $sum: 1 } } },
    ]),
    getStatesById(userId, ids),
  ]);

  const unreadById = new Map(counts.map((item) => [item._id.toString(), item.count]));

  return conversations.map((conversation) => {
    const id = conversation._id.toString();

    return {
      ...hidePrivateDetails(conversation.toJSON()),
      unreadCount: unreadById.get(id) ?? 0,
      state: states.get(id) ?? { ...DEFAULT_STATE },
    };
  });
};

export const getConversation = async (conversationId, userId) => {
  const conversation = await populateConversation(
    Conversation.findOne({ _id: conversationId, members: userId })
  );

  if (!conversation) {
    throw new AppError('Conversation not found', 404);
  }

  if (conversation.type === 'direct') {
    const other = conversation.members.find((member) => member._id.toString() !== userId.toString());

    if (other && (await isHiddenBetween(userId, other._id))) {
      throw new AppError('Conversation not found', 404);
    }
  }

  return hidePrivateDetails(conversation.toJSON());
};
