import { blockUser, listBlocked, reportUser, unblockUser } from '../services/block.service.js';
import { removeFriendshipBetween } from '../services/friend.service.js';
import { userRoom } from '../socket/emitters.js';
import { getIO } from '../socket/io.js';

// Tells both people's open windows to refresh their chat list, online status and stories.
const announceBlockChange = (a, b) => {
  const io = getIO();
  if (!io) return;

  io.to([userRoom(a.toString()), userRoom(b.toString())]).emit('blocks_changed', {});
};

export const listBlockedHandler = async (req, res) => {
  const users = await listBlocked(req.user._id);
  res.status(200).json({ users });
};

export const blockHandler = async (req, res) => {
  await blockUser(req.user._id, req.params.userId);
  await removeFriendshipBetween(req.user._id, req.params.userId); // blocking ends a friendship or request
  announceBlockChange(req.user._id, req.params.userId);
  res.status(200).json({ ok: true });
};

export const unblockHandler = async (req, res) => {
  await unblockUser(req.user._id, req.params.userId);
  announceBlockChange(req.user._id, req.params.userId);
  res.status(200).json({ ok: true });
};

export const reportUserHandler = async (req, res) => {
  await reportUser({
    reporterId: req.user._id,
    targetId: req.params.userId,
    reason: req.body.reason,
    details: req.body.details,
  });
  res.status(200).json({ ok: true });
};
