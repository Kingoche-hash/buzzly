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

// A group changed (name, photo, members, admins). Tell its members, and deal with people who joined or left.
export const announceGroupUpdate = ({ conversationId, conversation = null, added = [], removed = [] }) => {
  const io = getIO();
  if (!io) return;

  const id = conversationId.toString();

  if (conversation) {
    const plain = toPlain(conversation);

    const update = {
      conversationId: id,
      name: plain.name,
      avatar: plain.avatar || '',
      members: plain.members,
      admins: plain.admins || [],
      createdBy: plain.createdBy,
    };

    // New members: put their open windows in the room, and show them the group.
    for (const memberId of added) {
      io.in(userRoom(memberId)).socketsJoin(conversationRoom(id));
      io.to(userRoom(memberId)).emit('conversation_created', plain);
    }

    for (const member of plain.members) {
      io.to(userRoom(member._id)).emit('conversation_updated', update);
    }
  }

  // People who left or were removed stop hearing the group straight away.
  for (const goneId of removed) {
    io.in(userRoom(goneId)).socketsLeave(conversationRoom(id));
    io.to(userRoom(goneId)).emit('conversation_removed', { conversationId: id });
  }
};
