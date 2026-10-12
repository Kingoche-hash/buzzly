import {
  createDirectConversation,
  createGroupConversation,
  listConversations,
  getConversation,
  getConversationForMember,
} from '../services/conversation.service.js';
import { setWallpaperPhoto, updateState } from '../services/conversationState.service.js';
import { announceConversation, emitConversationState } from '../socket/emitters.js';
import { AppError } from '../utils/AppError.js';

export const createConversation = async (req, res) => {
  const body = req.body;

  if (body.type === 'direct') {
    const { conversation, created } = await createDirectConversation(req.user._id, body.userId);
    if (created) announceConversation(conversation);
    return res.status(created ? 201 : 200).json({ conversation });
  }

  const conversation = await createGroupConversation(req.user._id, body);
  announceConversation(conversation);
  res.status(201).json({ conversation });
};

export const getMyConversations = async (req, res) => {
  const conversations = await listConversations(req.user._id);
  res.status(200).json({ conversations });
};

export const getConversationById = async (req, res) => {
  const conversation = await getConversation(req.params.conversationId, req.user._id);
  res.status(200).json({ conversation });
};

// Changes MY private settings for a chat (pin, mute, spam, delete, wallpaper).
export const updateConversationState = async (req, res) => {
  await getConversationForMember(req.params.conversationId, req.user._id);

  const state = await updateState(req.user._id, req.params.conversationId, req.body);

  // Tell my other open windows, so they stay in sync.
  emitConversationState(req.user._id, req.params.conversationId, state);

  res.status(200).json({ state });
};

// Uses my own photo as the wallpaper of this chat.
export const setConversationWallpaper = async (req, res) => {
  if (!req.file) {
    throw new AppError('Choose a photo', 400);
  }

  const state = await setWallpaperPhoto(req.user._id, req.params.conversationId, req.file);

  emitConversationState(req.user._id, req.params.conversationId, state);

  res.status(200).json({ state });
};
