import {
  acceptRequest,
  cancelRequest,
  declineRequest,
  getMessageSetting,
  getRelationship,
  listFriendsState,
  sendRequest,
  setMessageSetting,
  unfriend,
} from '../services/friend.service.js';
import { userRoom } from '../socket/emitters.js';
import { getIO } from '../socket/io.js';

// Tells both people's open windows that something changed, so their lists refresh.
// `kind` decides which pop-up (if any) the other person sees: request, accepted or removed.
const announce = (req, otherId, kind) => {
  const io = getIO();
  if (!io) return;

  io.to([userRoom(req.user._id.toString()), userRoom(otherId.toString())]).emit('friends_changed', {
    kind,
    by: { _id: req.user._id.toString(), name: req.user.displayName || req.user.username },
  });
};

export const listHandler = async (req, res) => {
  const [state, whoCanMessage] = await Promise.all([
    listFriendsState(req.user._id),
    getMessageSetting(req.user._id),
  ]);

  res.status(200).json({ ...state, settings: { whoCanMessage } });
};

export const statusHandler = async (req, res) => {
  const status = await getRelationship(req.user._id, req.params.userId);
  res.status(200).json({ status });
};

export const sendHandler = async (req, res) => {
  const result = await sendRequest(req.user._id, req.params.userId);

  if (result.changed) announce(req, req.params.userId, result.accepted ? 'accepted' : 'request');

  res.status(200).json({ status: result.status });
};

export const acceptHandler = async (req, res) => {
  await acceptRequest(req.user._id, req.params.userId);
  announce(req, req.params.userId, 'accepted');
  res.status(200).json({ status: 'friends' });
};

export const declineHandler = async (req, res) => {
  await declineRequest(req.user._id, req.params.userId);
  announce(req, req.params.userId, 'removed');
  res.status(200).json({ status: 'none' });
};

export const cancelHandler = async (req, res) => {
  await cancelRequest(req.user._id, req.params.userId);
  announce(req, req.params.userId, 'removed');
  res.status(200).json({ status: 'none' });
};

export const unfriendHandler = async (req, res) => {
  await unfriend(req.user._id, req.params.userId);
  announce(req, req.params.userId, 'removed');
  res.status(200).json({ status: 'none' });
};

export const settingsHandler = async (req, res) => {
  const whoCanMessage = await setMessageSetting(req.user._id, req.body.whoCanMessage);
  res.status(200).json({ whoCanMessage });
};
