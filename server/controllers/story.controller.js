import {
  createStory,
  deleteStory,
  getFeed,
  getViewers,
  markViewed,
  toStoryDto,
} from '../services/story.service.js';
import { replyToStory } from '../services/storyReply.service.js';
import { announceConversation, broadcastMessage, userRoom } from '../socket/emitters.js';
import { emitToContacts } from '../socket/contacts.js';
import { getIO } from '../socket/io.js';
import { AppError } from '../utils/AppError.js';

export const getFeedHandler = async (req, res) => {
  const groups = await getFeed(req.user._id);
  res.status(200).json({ groups });
};

export const createMyStory = async (req, res) => {
  const text = req.body.text ?? '';

  if (!req.file && !text) {
    throw new AppError('Write something or add a photo', 400);
  }

  const story = await createStory({
    userId: req.user._id,
    file: req.file,
    text,
    background: req.body.background,
  });

  await emitToContacts(req.user._id, 'stories_changed', { userId: req.user._id.toString() });

  res.status(201).json({ story: toStoryDto(story, req.user._id) });
};

export const viewStory = async (req, res) => {
  const authorId = await markViewed(req.user._id, req.params.storyId);

  // Tell the author's windows, so their viewer count updates.
  if (authorId) getIO()?.to(userRoom(authorId)).emit('stories_changed', { userId: authorId });

  res.status(200).json({ ok: true });
};

export const getStoryViewers = async (req, res) => {
  const viewers = await getViewers(req.user._id, req.params.storyId);
  res.status(200).json({ viewers });
};

export const deleteMyStory = async (req, res) => {
  await deleteStory(req.user._id, req.params.storyId);

  await emitToContacts(req.user._id, 'stories_changed', { userId: req.user._id.toString() });

  res.status(200).json({ message: 'Story deleted' });
};

// A reply to someone's story arrives in your chat with them as a normal message.
export const replyToStoryHandler = async (req, res) => {
  const { conversation, created, message } = await replyToStory({
    userId: req.user._id,
    storyId: req.params.storyId,
    content: req.body.content,
  });

  // A brand-new chat is announced first, so both people's windows are already in its room.
  if (created) announceConversation(conversation);
  broadcastMessage(message);

  res.status(201).json({ message });
};
