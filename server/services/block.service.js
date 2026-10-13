import Block from '../models/Block.js';
import User from '../models/User.js';
import UserReport from '../models/UserReport.js';
import { AppError } from '../utils/AppError.js';

const toId = (value) => value.toString();

// Who has a block with this person: the people I blocked, and the people who blocked me.
export const getBlockState = async (userId) => {
  const rows = await Block.find({ $or: [{ blocker: userId }, { blocked: userId }] })
    .select('blocker blocked')
    .lean();

  const me = toId(userId);
  const blockedByMe = new Set();
  const blockedMe = new Set();

  for (const row of rows) {
    if (toId(row.blocker) === me) blockedByMe.add(toId(row.blocked));
    else blockedMe.add(toId(row.blocker));
  }

  return { blockedByMe, blockedMe };
};

// Everybody this person must not see, and who must not see them (a block works both ways).
export const getHiddenIds = async (userId) => {
  const { blockedByMe, blockedMe } = await getBlockState(userId);
  return [...new Set([...blockedByMe, ...blockedMe])];
};

// Is there a block between these two people, in either direction?
export const isHiddenBetween = async (a, b) =>
  Boolean(
    await Block.exists({
      $or: [
        { blocker: a, blocked: b },
        { blocker: b, blocked: a },
      ],
    })
  );

export const blockUser = async (blockerId, targetId) => {
  if (toId(blockerId) === toId(targetId)) {
    throw new AppError('You cannot block yourself', 400);
  }

  const target = await User.findOne({ _id: targetId, deletedAt: null }).select('_id');

  if (!target) {
    throw new AppError('User not found', 404);
  }

  try {
    await Block.create({ blocker: blockerId, blocked: targetId });
  } catch (error) {
    // Already blocked (duplicate key): blocking twice is fine.
    if (error.code !== 11000) throw error;
  }
};

export const unblockUser = async (blockerId, targetId) => {
  await Block.deleteOne({ blocker: blockerId, blocked: targetId });
};

// The people I blocked, newest first. Deleted accounts are left out.
export const listBlocked = async (userId) => {
  const rows = await Block.find({ blocker: userId })
    .sort({ _id: -1 })
    .populate({ path: 'blocked', select: 'username displayName avatar', match: { deletedAt: null } });

  return rows
    .filter((row) => row.blocked)
    .map((row) => ({
      _id: row.blocked._id,
      username: row.blocked.username,
      displayName: row.blocked.displayName,
      avatar: row.blocked.avatar,
      blockedAt: row.createdAt,
    }));
};

export const reportUser = async ({ reporterId, targetId, reason, details }) => {
  if (toId(reporterId) === toId(targetId)) {
    throw new AppError('You cannot report yourself', 400);
  }

  const target = await User.findOne({ _id: targetId, deletedAt: null }).select('_id');

  if (!target) {
    throw new AppError('User not found', 404);
  }

  try {
    await UserReport.create({ reporter: reporterId, reported: targetId, reason, details: details || '' });
  } catch (error) {
    // Already reported by this person: it still counts once.
    if (error.code !== 11000) throw error;
  }
};

// When an account is deleted, its blocks go too.
export const removeUserBlocks = async (userId) => {
  await Block.deleteMany({ $or: [{ blocker: userId }, { blocked: userId }] });
};
