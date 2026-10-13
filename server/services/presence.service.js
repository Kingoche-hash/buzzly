import { env } from '../config/env.js';
import { redis } from '../config/redis.js';
import User from '../models/User.js';
import Conversation from '../models/Conversation.js';
import { getHiddenIds } from './block.service.js';

// The whiteboard: one SET of connection ids per user.
const socketsKey = (userId) => `${env.redisPrefix}presence:sockets:${userId}`;

// Writes a connection on the board. Returns true if this is the user's FIRST connection.
export const addConnection = async (userId, socketId) => {
  const key = socketsKey(userId);
  const results = await redis.multi().sadd(key, socketId).scard(key).exec();
  return results[1][1] === 1;
};

// Rubs a connection off the board. Returns how many connections remain.
export const removeConnection = async (userId, socketId) => {
  const key = socketsKey(userId);
  const results = await redis.multi().srem(key, socketId).scard(key).exec();
  return results[1][1];
};

export const countConnections = (userId) => redis.scard(socketsKey(userId));

// From a list of user ids, returns only the ones who are online right now.
export const filterOnline = async (userIds) => {
  if (userIds.length === 0) return [];

  const pipeline = redis.pipeline();
  userIds.forEach((id) => pipeline.scard(socketsKey(id)));
  const results = await pipeline.exec();

  return userIds.filter((_, index) => results[index][1] > 0);
};

// At startup: wipe the board and mark everyone offline (their connections died with the old server).
export const resetPresence = async () => {
  const stream = redis.scanStream({ match: `${env.redisPrefix}presence:sockets:*`, count: 100 });

  for await (const keys of stream) {
    if (keys.length > 0) await redis.del(...keys);
  }

  await User.updateMany({ isOnline: true }, { isOnline: false });
};

// The notebook: MongoDB remembers lastSeen.
export const markOnline = (userId) => User.updateOne({ _id: userId }, { isOnline: true });

export const markOffline = async (userId) => {
  const lastSeen = new Date();
  await User.updateOne({ _id: userId }, { isOnline: false, lastSeen });
  return lastSeen;
};

// Everyone who shares at least one conversation with this user.
// People I blocked, and people who blocked me, are not contacts: they never learn anything about me.
export const getContactIds = async (userId) => {
  const [ids, hidden] = await Promise.all([
    Conversation.distinct('members', { members: userId }),
    getHiddenIds(userId),
  ]);

  const hiddenSet = new Set(hidden);

  return ids
    .map((id) => id.toString())
    .filter((id) => id !== userId.toString() && !hiddenSet.has(id));
};

export const getConversationIdsFor = async (userId) => {
  const conversations = await Conversation.find({ members: userId }).select('_id').lean();
  return conversations.map((conversation) => conversation._id.toString());
};