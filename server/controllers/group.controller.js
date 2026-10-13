import {
  addMembers,
  leaveGroup,
  removeGroupAvatar,
  removeMember,
  renameGroup,
  setAdmin,
  setGroupAvatar,
} from '../services/group.service.js';
import { announceGroupUpdate, broadcastMessage } from '../socket/emitters.js';
import { AppError } from '../utils/AppError.js';

// Shows the notes in the chat first, then tells people about the new members, admins and so on.
const announce = (result) => {
  const messages = result.messages || (result.message ? [result.message] : []);

  messages.forEach(broadcastMessage);

  announceGroupUpdate({
    conversationId: result.conversationId,
    conversation: result.conversation,
    added: result.added,
    removed: result.removed,
  });
};

export const renameHandler = async (req, res) => {
  const result = await renameGroup({
    conversationId: req.params.conversationId,
    userId: req.user._id,
    name: req.body.name,
  });

  announce(result);
  res.status(200).json({ conversation: result.conversation });
};

export const setAvatarHandler = async (req, res) => {
  if (!req.file) {
    throw new AppError('Choose a photo', 400);
  }

  const result = await setGroupAvatar({
    conversationId: req.params.conversationId,
    userId: req.user._id,
    file: req.file,
  });

  announce(result);
  res.status(200).json({ conversation: result.conversation });
};

export const removeAvatarHandler = async (req, res) => {
  const result = await removeGroupAvatar({
    conversationId: req.params.conversationId,
    userId: req.user._id,
  });

  announce(result);
  res.status(200).json({ conversation: result.conversation });
};

export const addMembersHandler = async (req, res) => {
  const result = await addMembers({
    conversationId: req.params.conversationId,
    userId: req.user._id,
    userIds: req.body.userIds,
  });

  announce(result);
  res.status(200).json({ conversation: result.conversation });
};

export const removeMemberHandler = async (req, res) => {
  const result = await removeMember({
    conversationId: req.params.conversationId,
    userId: req.user._id,
    targetId: req.params.userId,
  });

  announce(result);
  res.status(200).json({ conversation: result.conversation });
};

const adminHandler = (makeAdmin) => async (req, res) => {
  const result = await setAdmin({
    conversationId: req.params.conversationId,
    userId: req.user._id,
    targetId: req.params.userId,
    makeAdmin,
  });

  announce(result);
  res.status(200).json({ conversation: result.conversation });
};

export const makeAdminHandler = adminHandler(true);
export const removeAdminHandler = adminHandler(false);

export const leaveHandler = async (req, res) => {
  const result = await leaveGroup({
    conversationId: req.params.conversationId,
    userId: req.user._id,
  });

  announce(result);
  res.status(200).json({ ok: true });
};
