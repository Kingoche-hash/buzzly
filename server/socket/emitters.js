import { getIO } from './io.js';

export const userRoom = (userId) => `user:${userId}`;
export const conversationRoom = (conversationId) => `conversation:${conversationId}`;

// Turns a Mongoose document into plain JSON that is safe to send.
const toPlain = (doc) => JSON.parse(JSON.stringify(doc));

// Shout a new message into its conversation room.
export const broadcastMessage = (message) => {
  const io = getIO();
  if (!io) return;

  const plain = toPlain(message);
  io.to(conversationRoom(plain.conversation)).emit('receive_message', plain);
};

// Put every member's open sockets into the new room, and tell them about it.
export const announceConversation = (conversation) => {
  const io = getIO();
  if (!io) return;

  const plain = toPlain(conversation);

  for (const member of plain.members) {
    io.in(userRoom(member._id)).socketsJoin(conversationRoom(plain._id));
    io.to(userRoom(member._id)).emit('conversation_created', plain);
  }
};

// Tell ONE person's open windows that their private settings for a chat changed.
export const emitConversationState = (userId, conversationId, state) => {
  const io = getIO();
  if (!io) return;

  io.to(userRoom(userId.toString())).emit('conversation_state', {
    conversationId: conversationId.toString(),
    state: toPlain(state),
  });
};
// A message changed (edited, deleted for everyone, reacted to): tell everyone in the chat.
export const broadcastMessageUpdate = (message) => {
  const io = getIO();
  if (!io) return;

  const plain = toPlain(message);
  io.to(conversationRoom(plain.conversation)).emit('message_updated', plain);
};

// A message was removed for ONE person only: tell just their open windows.
export const emitMessageRemoved = (userId, conversationId, messageId) => {
  const io = getIO();
  if (!io) return;

  io.to(userRoom(userId.toString())).emit('message_removed', {
    conversationId: conversationId.toString(),
    messageId: messageId.toString(),
  });
};
