import { conversationIdParams, sendMessageSchema } from '../validators/conversation.validators.js';
import { receiptSchema } from '../validators/receipt.validators.js';
import { createMessage, markDelivered, markRead } from '../services/message.service.js';
import { getConversationForMember } from '../services/conversation.service.js';
import { getPrivacy } from '../services/privacyCache.js';
import { filterOnline, getContactIds } from '../services/presence.service.js';
import { AppError } from '../utils/AppError.js';
import { createSocketLimiter } from '../utils/socketRateLimit.js';
import { broadcastMessage, conversationRoom } from './emitters.js';

const parse = (schema, data) => {
  const result = schema.safeParse(data);

  if (!result.success) {
    throw new AppError(result.error.issues[0].message, 400);
  }

  return result.data;
};

// Wraps a handler so errors become a friendly { ok: false } answer, never a crash.
const handle = (handler) => async (payload, ack) => {
  const reply = typeof ack === 'function' ? ack : () => {};

  try {
    const result = await handler(payload || {});
    reply({ ok: true, ...result });
  } catch (error) {
    if (!error.status) console.error('Socket handler error:', error);

    reply({
      ok: false,
      error: error.status && error.status < 500 ? error.message : 'Something went wrong',
    });
  }
};

export const registerHandlers = (io, socket) => {
  const userId = socket.data.user._id;
  const username = socket.data.user.displayName || socket.data.user.username;

  const canSend = createSocketLimiter({ limit: 20, windowMs: 10000 });
  const canType = createSocketLimiter({ limit: 60, windowMs: 10000 });
  const canReceipt = createSocketLimiter({ limit: 120, windowMs: 10000 });

  // Conversations this socket is currently "whispering" in.
  const typingIn = new Set();

  socket.on(
    'join_conversation',
    handle(async (payload) => {
      const { conversationId } = parse(conversationIdParams, payload);
      await getConversationForMember(conversationId, userId);
      socket.join(conversationRoom(conversationId));
      return {};
    })
  );

  socket.on(
    'leave_conversation',
    handle(async (payload) => {
      const { conversationId } = parse(conversationIdParams, payload);
      socket.leave(conversationRoom(conversationId));
      return {};
    })
  );

  socket.on(
    'send_message',
    handle(async (payload) => {
      if (!canSend()) {
        throw new AppError('You are sending messages too fast', 429);
      }

      const { conversationId } = parse(conversationIdParams, payload);
      const { content, replyTo } = parse(sendMessageSchema, payload);

      const message = await createMessage({ conversationId, senderId: userId, content, replyTo });
      broadcastMessage(message);

      return { message: JSON.parse(JSON.stringify(message)) };
    })
  );

  // "Who is online right now?" Only people the user shares a chat with, and not those who hide it.
  socket.on(
    'get_presence',
    handle(async () => {
      const contactIds = await getContactIds(userId);
      const online = await filterOnline(contactIds);
      const onlineUserIds = online.filter((id) => getPrivacy(id).showPresence);

      return { onlineUserIds };
    })
  );

  // Typing: a whisper to the other members of the room. Never stored anywhere.
  const relayTyping = (event) => (payload) => {
    if (!canType()) return;

    // People who turned typing indicators off never send the whisper.
    if (event === 'typing_start' && !getPrivacy(userId).typingIndicators) return;

    const result = conversationIdParams.safeParse(payload);
    if (!result.success) return;

    const { conversationId } = result.data;
    const room = conversationRoom(conversationId);

    // Only rooms this socket already belongs to (it only joins rooms of its own conversations).
    if (!socket.rooms.has(room)) return;

    if (event === 'typing_start') typingIn.add(conversationId);
    else typingIn.delete(conversationId);

    socket.to(room).emit(event, { conversationId, userId: userId.toString(), username });
  };

  socket.on('typing_start', relayTyping('typing_start'));
  socket.on('typing_stop', relayTyping('typing_stop'));

  // If the connection drops mid-typing, tell the others to stop showing it.
  socket.on('disconnect', () => {
    typingIn.forEach((conversationId) => {
      socket
        .to(conversationRoom(conversationId))
        .emit('typing_stop', { conversationId, userId: userId.toString(), username });
    });
  });

  // "My browser received everything up to this message."
  socket.on(
    'message_delivered',
    handle(async (payload) => {
      if (!canReceipt()) throw new AppError('Too many requests', 429);

      const { conversationId, messageId } = parse(receiptSchema, payload);
      const changed = await markDelivered({ conversationId, userId, upToId: messageId });

      if (changed > 0) {
        io.to(conversationRoom(conversationId)).emit('messages_delivered', {
          conversationId,
          userId: userId.toString(),
          upToId: messageId,
        });
      }

      return {};
    })
  );

  // "I have read everything up to this message."
  socket.on(
    'message_read',
    handle(async (payload) => {
      if (!canReceipt()) throw new AppError('Too many requests', 429);

      const { conversationId, messageId } = parse(receiptSchema, payload);
      const changed = await markRead({ conversationId, userId, upToId: messageId });

      if (changed > 0) {
        io.to(conversationRoom(conversationId)).emit('messages_read', {
          conversationId,
          userId: userId.toString(),
          upToId: messageId,
        });
      }

      return {};
    })
  );
};