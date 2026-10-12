import { getPrivacy } from '../services/privacyCache.js';
import {
  addConnection,
  removeConnection,
  countConnections,
  markOnline,
  markOffline,
  getConversationIdsFor,
} from '../services/presence.service.js';
import { conversationRoom } from './emitters.js';
import { getIO } from './io.js';

// After the last connection closes, wait a little in case it was just a page refresh.
const OFFLINE_GRACE_MS = 5000;

// Shout into every room the user belongs to, so only people who share a chat hear it.
const broadcastToContacts = async (io, userId, event, payload) => {
  const conversationIds = await getConversationIdsFor(userId);
  if (conversationIds.length === 0) return;

  io.to(conversationIds.map(conversationRoom)).emit(event, payload);
};

export const handlePresenceConnect = async (io, socket) => {
  try {
    const userId = socket.data.user._id.toString();
    const isFirstConnection = await addConnection(userId, socket.id);

    if (!isFirstConnection) return;

    await markOnline(userId);

    // Someone who hides their online status tells nobody.
    if (!getPrivacy(userId).showPresence) return;

    await broadcastToContacts(io, userId, 'user_online', { userId });
  } catch (error) {
    console.error('Presence connect error:', error.message);
  }
};

export const handlePresenceDisconnect = async (io, socket) => {
  try {
    const userId = socket.data.user._id.toString();
    const remaining = await removeConnection(userId, socket.id);

    if (remaining > 0) return;

    setTimeout(async () => {
      try {
        // Did they come back during the grace period?
        if ((await countConnections(userId)) > 0) return;

        const lastSeen = await markOffline(userId);

        if (!getPrivacy(userId).showPresence) return;

        await broadcastToContacts(io, userId, 'user_offline', { userId, lastSeen });
      } catch (error) {
        console.error('Presence offline error:', error.message);
      }
    }, OFFLINE_GRACE_MS).unref();
  } catch (error) {
    console.error('Presence disconnect error:', error.message);
  }
};

// The person just switched "show when I'm online" on or off: update their contacts right now.
export const broadcastVisibilityChange = async (userId) => {
  const io = getIO();
  if (!io) return;

  const id = userId.toString();

  try {
    if (!getPrivacy(id).showPresence) {
      await broadcastToContacts(io, id, 'user_offline', { userId: id, lastSeen: null });
      return;
    }

    if ((await countConnections(id)) > 0) {
      await broadcastToContacts(io, id, 'user_online', { userId: id });
    }
  } catch (error) {
    console.error('Presence visibility error:', error.message);
  }
};

// Tell the people who chat with this person that their name or photo changed.
export const broadcastProfileUpdate = async (user) => {
  const io = getIO();
  if (!io) return;

  const id = user._id.toString();

  try {
    await broadcastToContacts(io, id, 'profile_updated', {
      userId: id,
      username: user.username,
      displayName: user.displayName,
      avatar: user.avatar,
    });
  } catch (error) {
    console.error('Profile update broadcast error:', error.message);
  }
};