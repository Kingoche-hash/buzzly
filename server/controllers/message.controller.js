import {
  createMessage,
  deleteMessageForEveryone,
  deleteMessageForMe,
  editMessage,
  getMessages,
  removeReaction,
  reportMessage,
  setReaction,
} from '../services/message.service.js';
import { broadcastMessage, broadcastMessageUpdate, emitMessageRemoved } from '../socket/emitters.js';

export const sendMessage = async (req, res) => {
  const message = await createMessage({
    conversationId: req.params.conversationId,
    senderId: req.user._id,
    content: req.body.content,
    replyTo: req.body.replyTo,
  });

  broadcastMessage(message);

  res.status(201).json({ message });
};

export const getConversationMessages = async (req, res) => {
  const { limit, before, after, around } = req.valid.query;

  const result = await getMessages({
    conversationId: req.params.conversationId,
    userId: req.user._id,
    limit,
    before,
    after,
    around,
  });

  res.status(200).json(result);
};

const target = (req) => ({
  conversationId: req.params.conversationId,
  messageId: req.params.messageId,
  userId: req.user._id,
});

export const editMessageHandler = async (req, res) => {
  const message = await editMessage({ ...target(req), content: req.body.content });

  broadcastMessageUpdate(message);

  res.status(200).json({ message });
};

export const deleteMessageHandler = async (req, res) => {
  const { scope } = req.valid.query;

  if (scope === 'me') {
    await deleteMessageForMe(target(req));
    emitMessageRemoved(req.user._id, req.params.conversationId, req.params.messageId);

    return res.status(200).json({ ok: true });
  }

  const message = await deleteMessageForEveryone(target(req));

  broadcastMessageUpdate(message);

  res.status(200).json({ message });
};

export const reactHandler = async (req, res) => {
  const message = await setReaction({ ...target(req), emoji: req.body.emoji });

  broadcastMessageUpdate(message);

  res.status(200).json({ message });
};

export const unreactHandler = async (req, res) => {
  const message = await removeReaction(target(req));

  broadcastMessageUpdate(message);

  res.status(200).json({ message });
};

export const reportMessageHandler = async (req, res) => {
  await reportMessage({ ...target(req), reason: req.body.reason });
  res.status(200).json({ ok: true });
};
