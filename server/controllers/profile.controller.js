import {
  changePassword,
  deleteAccount,
  removeAvatar,
  setAvatar,
  updateProfile,
} from '../services/profile.Service.js';
import { getPrivacy, pickPrivacy, setPrivacy } from '../services/privacyCache.js';
import { userRoom } from '../socket/emitters.js';
import { getIO } from '../socket/io.js';
import { broadcastProfileUpdate, broadcastVisibilityChange } from '../socket/presence.js';
import { AppError } from '../utils/AppError.js';
import { signToken } from '../utils/token.js';

export const updateMyProfile = async (req, res) => {
  const wasVisible = getPrivacy(req.user._id).showPresence;

  const user = await updateProfile(req.user._id, req.body);

  setPrivacy(user._id, pickPrivacy(user));

  // Switching "show when I'm online" changes what my contacts see right now.
  if (wasVisible !== getPrivacy(user._id).showPresence) {
    await broadcastVisibilityChange(user._id);
  }

  await broadcastProfileUpdate(user);

  res.status(200).json({ user });
};

export const uploadMyAvatar = async (req, res) => {
  if (!req.file) {
    throw new AppError('Choose a photo', 400);
  }

  const user = await setAvatar(req.user._id, req.file);
  await broadcastProfileUpdate(user);

  res.status(200).json({ user });
};

export const removeMyAvatar = async (req, res) => {
  const user = await removeAvatar(req.user._id);
  await broadcastProfileUpdate(user);

  res.status(200).json({ user });
};

export const changeMyPassword = async (req, res) => {
  await changePassword(req.user._id, req.body);

  // Every older wristband is now cancelled. This device gets a fresh one and stays signed in.
  const token = signToken(req.user._id.toString());

  // Hang up the live connections, which still hold the old wristband. This device reconnects by itself.
  getIO()?.in(userRoom(req.user._id.toString())).disconnectSockets(true);

  res.status(200).json({ message: 'Password changed', token });
};

export const deleteMyAccount = async (req, res) => {
  await deleteAccount(req.user._id, req.body.password);

  // Hang up every open connection of this person.
  getIO()?.in(userRoom(req.user._id.toString())).disconnectSockets(true);

  res.status(200).json({ message: 'Account deleted' });
};
