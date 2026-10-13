import User from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { getBlockState, getHiddenIds } from './block.service.js';
import { filterOnline } from './presence.service.js';

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Finds people by username or display name. Deleted accounts and blocked people (either way) never show up.
export const searchUsers = async ({ search, limit, currentUserId }) => {
  const pattern = { $regex: escapeRegex(search), $options: 'i' };
  const hidden = await getHiddenIds(currentUserId);

  return User.find({
    _id: { $ne: currentUserId, $nin: hidden },
    deletedAt: null,
    $or: [{ username: pattern }, { displayName: pattern }],
  })
    .select('username displayName avatar')
    .sort({ username: 1 })
    .limit(limit);
};

// What anyone may see on someone's profile card. Online status and last seen only if allowed.
// Someone who blocked me looks like a missing account. Someone I blocked shows as a small "blocked" card.
export const getPublicProfile = async (userId, viewerId) => {
  const user = await User.findOne({ _id: userId, deletedAt: null }).select(
    'username displayName avatar bio status createdAt lastSeen privacy.showPresence'
  );

  if (!user) {
    throw new AppError('User not found', 404);
  }

  const { blockedByMe, blockedMe } = await getBlockState(viewerId);
  const id = user._id.toString();

  if (blockedMe.has(id)) {
    throw new AppError('User not found', 404);
  }

  if (blockedByMe.has(id)) {
    return {
      _id: user._id,
      username: user.username,
      displayName: user.displayName,
      avatar: user.avatar,
      blockedByMe: true,
    };
  }

  const showsPresence = user.privacy?.showPresence !== false;
  const online = showsPresence ? (await filterOnline([user._id.toString()])).length > 0 : false;

  return {
    _id: user._id,
    username: user.username,
    displayName: user.displayName,
    avatar: user.avatar,
    bio: user.bio,
    status: user.status,
    createdAt: user.createdAt,
    showsPresence,
    isOnline: online,
    lastSeen: showsPresence ? user.lastSeen : null,
    blockedByMe: false,
  };
};
