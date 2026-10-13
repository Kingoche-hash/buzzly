import Friendship from '../models/Friendship.js';
import Message from '../models/Message.js';
import User from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { getHiddenIds, isHiddenBetween } from './block.service.js';

const USER_FIELDS = 'username displayName avatar deletedAt';

const toId = (value) => value.toString();
const pairKeyOf = (a, b) => [toId(a), toId(b)].sort().join('_');

// The other person must exist, not be deleted, and have no block with me.
const checkTarget = async (userId, targetId) => {
  if (toId(userId) === toId(targetId)) {
    throw new AppError('You cannot do that with yourself', 400);
  }

  const target = await User.findOne({ _id: targetId, deletedAt: null }).select('_id');

  if (!target || (await isHiddenBetween(userId, targetId))) {
    throw new AppError('User not found', 404);
  }
};

export const areFriends = async (a, b) =>
  Boolean(await Friendship.exists({ pairKey: pairKeyOf(a, b), status: 'accepted' }));

// 'none', 'outgoing' (I asked), 'incoming' (they asked) or 'friends'.
export const getRelationship = async (userId, otherId) => {
  const row = await Friendship.findOne({ pairKey: pairKeyOf(userId, otherId) })
    .select('requester status')
    .lean();

  if (!row) return 'none';
  if (row.status === 'accepted') return 'friends';

  return toId(row.requester) === toId(userId) ? 'outgoing' : 'incoming';
};

// Returns { status, changed }. `changed` is false when nothing new happened (asking twice).
export const sendRequest = async (userId, targetId) => {
  await checkTarget(userId, targetId);

  const key = pairKeyOf(userId, targetId);
  const existing = await Friendship.findOne({ pairKey: key });

  if (existing) {
    if (existing.status === 'accepted') return { status: 'friends', changed: false };
    if (toId(existing.requester) === toId(userId)) return { status: 'outgoing', changed: false };

    // They already asked me, so my request is a yes.
    existing.status = 'accepted';
    existing.respondedAt = new Date();
    await existing.save();
    return { status: 'friends', changed: true, accepted: true };
  }

  try {
    await Friendship.create({ requester: userId, recipient: targetId, pairKey: key });
  } catch (error) {
    // Two requests at once: the unique index stopped the second one.
    if (error.code !== 11000) throw error;
    return { status: 'outgoing', changed: false };
  }

  return { status: 'outgoing', changed: true };
};

export const acceptRequest = async (userId, fromId) => {
  const row = await Friendship.findOne({
    pairKey: pairKeyOf(userId, fromId),
    status: 'pending',
    requester: fromId,
    recipient: userId,
  });

  if (!row) {
    throw new AppError('Friend request not found', 404);
  }

  row.status = 'accepted';
  row.respondedAt = new Date();
  await row.save();
};

// Declining deletes the request, so the person may ask again later.
export const declineRequest = async (userId, fromId) => {
  await Friendship.deleteOne({
    pairKey: pairKeyOf(userId, fromId),
    status: 'pending',
    requester: fromId,
    recipient: userId,
  });
};

export const cancelRequest = async (userId, toUserId) => {
  await Friendship.deleteOne({
    pairKey: pairKeyOf(userId, toUserId),
    status: 'pending',
    requester: userId,
    recipient: toUserId,
  });
};

export const unfriend = async (userId, otherId) => {
  await Friendship.deleteOne({ pairKey: pairKeyOf(userId, otherId), status: 'accepted' });
};

// Friendship or request, whatever exists between two people (used when blocking).
export const removeFriendshipBetween = async (a, b) => {
  await Friendship.deleteOne({ pairKey: pairKeyOf(a, b) });
};

// When an account is deleted, its friendships and requests go too.
export const removeUserFriendships = async (userId) => {
  await Friendship.deleteMany({ $or: [{ requester: userId }, { recipient: userId }] });
};

// My friends, the requests waiting for my answer, and the requests I sent.
export const listFriendsState = async (userId) => {
  const [rows, hidden] = await Promise.all([
    Friendship.find({ $or: [{ requester: userId }, { recipient: userId }] })
      .sort({ updatedAt: -1 })
      .populate('requester', USER_FIELDS)
      .populate('recipient', USER_FIELDS),
    getHiddenIds(userId),
  ]);

  const hiddenSet = new Set(hidden);
  const friends = [];
  const incoming = [];
  const outgoing = [];

  for (const row of rows) {
    if (!row.requester || !row.recipient) continue;

    const iAmRequester = toId(row.requester._id) === toId(userId);
    const other = iAmRequester ? row.recipient : row.requester;

    if (other.deletedAt || hiddenSet.has(toId(other._id))) continue;

    const dto = {
      _id: other._id,
      username: other.username,
      displayName: other.displayName,
      avatar: other.avatar,
      at: row.updatedAt,
    };

    if (row.status === 'accepted') friends.push(dto);
    else if (iAmRequester) outgoing.push(dto);
    else incoming.push(dto);
  }

  return { friends, incoming, outgoing };
};

export const getMessageSetting = async (userId) => {
  const user = await User.findById(userId).select('whoCanMessage').lean();
  return user?.whoCanMessage || 'everyone';
};

export const setMessageSetting = async (userId, whoCanMessage) => {
  await User.updateOne({ _id: userId }, { whoCanMessage });
  return whoCanMessage;
};

// "Friends only" rule for direct chats. Called before every message is created.
// A stranger may write to someone who set "friends only" only if that person wrote in this chat first.
export const assertCanMessageInConversation = async (conversation, senderId) => {
  if (conversation.type !== 'direct') return;

  const recipientId = conversation.members.find((id) => toId(id) !== toId(senderId));
  if (!recipientId) return;

  const recipient = await User.findById(recipientId).select('whoCanMessage').lean();
  if (!recipient || recipient.whoCanMessage !== 'friends') return;

  if (await areFriends(senderId, recipientId)) return;

  const startedByThem = await Message.exists({ conversation: conversation._id, sender: recipientId });
  if (startedByThem) return;

  throw new AppError('This person only accepts messages from friends.', 403);
};
