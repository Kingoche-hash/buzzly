import { getConversationIdsFor } from '../services/presence.service.js';
import { conversationRoom, userRoom } from './emitters.js';
import { getIO } from './io.js';

// Sends an event to the person's own windows and to everyone who shares a chat with them.
export const emitToContacts = async (userId, event, payload = {}) => {
  const io = getIO();
  if (!io) return;

  try {
    const id = userId.toString();
    const conversationIds = await getConversationIdsFor(id);

    io.to([userRoom(id), ...conversationIds.map(conversationRoom)]).emit(event, payload);
  } catch (error) {
    console.error('Could not notify contacts:', error.message);
  }
};