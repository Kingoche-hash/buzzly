import crypto from 'crypto';
import { cloudinary } from '../config/cloudinary.js';
import Conversation from '../models/Conversation.js';
import ConversationState from '../models/ConversationState.js';
import Message from '../models/Message.js';
import User from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { hasValidSignature } from '../utils/fileSignature.js';
import { getHiddenIds } from './block.service.js';
import { getConversationDto, getConversationForMember } from './conversation.service.js';
import { deleteAttachments } from './upload.service.js';

const FOLDER = 'chatapp/groups';
const SENDER_FIELDS = 'username displayName avatar';

export const MAX_MEMBERS = 50;

const toId = (value) => value.toString();
const nameOf = (user) => user.displayName || user.username;

// "A", "A and B", "A, B and C", "A, B and 2 others".
const listNames = (names) => {
  if (names.length > 3) return `${names.slice(0, 2).join(', ')} and ${names.length - 2} others`;
  if (names.length === 1) return names[0];

  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
};

// Uploads the picture to Cloudinary, cropped to a 512 x 512 square.
const uploadImageBuffer = (buffer) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: FOLDER,
        resource_type: 'image',
        public_id: crypto.randomUUID(),
        transformation: [{ width: 512, height: 512, crop: 'fill', gravity: 'auto', quality: 'auto' }],
      },
      (error, result) => (error ? reject(error) : resolve(result))
    );

    stream.end(buffer);
  });

const destroyImage = async (publicId) => {
  if (!publicId) return;

  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
  } catch (error) {
    console.error('Could not delete group image:', error.message);
  }
};

// A group I belong to. Direct chats are refused.
const loadGroup = async (conversationId, userId) => {
  const group = await getConversationForMember(conversationId, userId);

  if (group.type !== 'group') {
    throw new AppError('This is not a group chat', 400);
  }

  return group;
};

// The admins of a group, as a Set of ids. Older groups have no list yet: their creator is the admin.
const adminIdsOf = (group) => {
  const members = group.members.map(toId);
  const explicit = group.admins.map(toId).filter((id) => members.includes(id));

  if (explicit.length > 0) return new Set(explicit);

  const creator = toId(group.createdBy);
  return new Set([members.includes(creator) ? creator : members[0]]);
};

const requireAdmin = (group, userId) => {
  if (!adminIdsOf(group).has(toId(userId))) {
    throw new AppError('Only group admins can do that', 403);
  }
};

const actorOf = async (userId) => {
  const user = await User.findById(userId).select('username displayName');

  if (!user) {
    throw new AppError('User not found', 404);
  }

  return user;
};

// A centered note in the chat. insertMany (not create) so a note like "Bob left"
// never brings a chat back that somebody deleted.
const addSystemMessage = async (conversationId, senderId, kind, text) => {
  const [message] = await Message.insertMany([
    { conversation: conversationId, sender: senderId, content: '', system: { kind, text: text.slice(0, 280) } },
  ]);

  await Conversation.updateOne(
    { _id: conversationId },
    { lastMessage: message._id, lastMessageAt: message.createdAt }
  );

  return message.populate('sender', SENDER_FIELDS);
};

export const renameGroup = async ({ conversationId, userId, name }) => {
  const group = await loadGroup(conversationId, userId);
  requireAdmin(group, userId);

  if (group.name === name) {
    return { conversationId, conversation: await getConversationDto(conversationId), message: null };
  }

  const actor = await actorOf(userId);
  await Conversation.updateOne({ _id: conversationId }, { name });

  const message = await addSystemMessage(
    conversationId,
    userId,
    'renamed',
    `${nameOf(actor)} renamed the group to "${name}"`
  );

  return { conversationId, conversation: await getConversationDto(conversationId), message };
};

export const setGroupAvatar = async ({ conversationId, userId, file }) => {
  const group = await loadGroup(conversationId, userId);
  requireAdmin(group, userId);

  if (!hasValidSignature(file)) {
    throw new AppError('That file is not a real image', 415);
  }

  let uploaded;

  try {
    uploaded = await uploadImageBuffer(file.buffer);
  } catch (error) {
    console.error('Cloudinary group photo upload error:', error.message);
    throw new AppError('Upload failed. Please try again.', 502);
  }

  const before = await Conversation.findById(conversationId).select('+avatarPublicId').lean();

  await Conversation.updateOne(
    { _id: conversationId },
    { avatar: uploaded.secure_url, avatarPublicId: uploaded.public_id }
  );
  await destroyImage(before?.avatarPublicId);

  const actor = await actorOf(userId);
  const message = await addSystemMessage(conversationId, userId, 'photo', `${nameOf(actor)} changed the group photo`);

  return { conversationId, conversation: await getConversationDto(conversationId), message };
};

export const removeGroupAvatar = async ({ conversationId, userId }) => {
  const group = await loadGroup(conversationId, userId);
  requireAdmin(group, userId);

  const before = await Conversation.findById(conversationId).select('+avatarPublicId').lean();

  if (!before?.avatar) {
    return { conversationId, conversation: await getConversationDto(conversationId), message: null };
  }

  await Conversation.updateOne({ _id: conversationId }, { avatar: '', avatarPublicId: '' });
  await destroyImage(before.avatarPublicId);

  const actor = await actorOf(userId);
  const message = await addSystemMessage(conversationId, userId, 'photo', `${nameOf(actor)} removed the group photo`);

  return { conversationId, conversation: await getConversationDto(conversationId), message };
};

export const addMembers = async ({ conversationId, userId, userIds }) => {
  const group = await loadGroup(conversationId, userId);
  requireAdmin(group, userId);

  const existing = new Set(group.members.map(toId));
  const fresh = [...new Set(userIds)].filter((id) => !existing.has(id));

  if (fresh.length === 0) {
    throw new AppError('Those people are already in the group', 400);
  }

  if (existing.size + fresh.length > MAX_MEMBERS) {
    throw new AppError(`A group can have at most ${MAX_MEMBERS} members`, 400);
  }

  const users = await User.find({ _id: { $in: fresh }, deletedAt: null }).select('username displayName');
  const hidden = new Set(await getHiddenIds(userId));

  // People who do not exist, and people I blocked or who blocked me, look the same.
  if (users.length !== fresh.length || fresh.some((id) => hidden.has(id))) {
    throw new AppError('One or more users do not exist', 404);
  }

  const byId = new Map(users.map((user) => [toId(user._id), user]));
  const actor = await actorOf(userId);

  // The admin list is written down now, so an older group keeps its creator as admin.
  await Conversation.updateOne(
    { _id: conversationId },
    { $addToSet: { members: { $each: fresh } }, $set: { admins: [...adminIdsOf(group)] } }
  );

  const message = await addSystemMessage(
    conversationId,
    userId,
    'added',
    `${nameOf(actor)} added ${listNames(fresh.map((id) => nameOf(byId.get(id))))}`
  );

  return { conversationId, conversation: await getConversationDto(conversationId), message, added: fresh };
};

export const removeMember = async ({ conversationId, userId, targetId }) => {
  const group = await loadGroup(conversationId, userId);
  requireAdmin(group, userId);

  if (!group.members.map(toId).includes(targetId)) {
    throw new AppError('Member not found', 404);
  }

  if (targetId === toId(userId)) {
    throw new AppError('Use "Leave group" to leave a group', 400);
  }

  const admins = adminIdsOf(group);

  if (admins.has(targetId)) {
    throw new AppError('Remove their admin rights first', 403);
  }

  const [actor, target] = await Promise.all([actorOf(userId), actorOf(targetId)]);

  await Conversation.updateOne(
    { _id: conversationId },
    { $pull: { members: targetId }, $set: { admins: [...admins] } }
  );
  await ConversationState.deleteOne({ user: targetId, conversation: conversationId });

  const message = await addSystemMessage(
    conversationId,
    userId,
    'removed',
    `${nameOf(actor)} removed ${nameOf(target)}`
  );

  return {
    conversationId,
    conversation: await getConversationDto(conversationId),
    message,
    removed: [targetId],
  };
};

// makeAdmin true: promote. makeAdmin false: take admin rights away.
export const setAdmin = async ({ conversationId, userId, targetId, makeAdmin }) => {
  const group = await loadGroup(conversationId, userId);
  requireAdmin(group, userId);

  if (!group.members.map(toId).includes(targetId)) {
    throw new AppError('Member not found', 404);
  }

  const admins = adminIdsOf(group);

  if (makeAdmin === admins.has(targetId)) {
    return { conversationId, conversation: await getConversationDto(conversationId), message: null };
  }

  if (!makeAdmin) {
    if (targetId === toId(group.createdBy)) {
      throw new AppError("The creator's admin rights cannot be removed", 403);
    }

    if (targetId === toId(userId)) {
      throw new AppError('You cannot remove your own admin rights', 400);
    }

    admins.delete(targetId);
  } else {
    admins.add(targetId);
  }

  const [actor, target] = await Promise.all([actorOf(userId), actorOf(targetId)]);

  await Conversation.updateOne({ _id: conversationId }, { $set: { admins: [...admins] } });

  const message = await addSystemMessage(
    conversationId,
    userId,
    makeAdmin ? 'promoted' : 'demoted',
    makeAdmin ? `${nameOf(actor)} made ${nameOf(target)} an admin` : `${nameOf(actor)} removed ${nameOf(target)} as an admin`
  );

  return { conversationId, conversation: await getConversationDto(conversationId), message };
};

// Anyone can leave. If no admin is left, the longest-standing member becomes one.
// If nobody is left, the group and everything in it is deleted.
export const leaveGroup = async ({ conversationId, userId }) => {
  const group = await loadGroup(conversationId, userId);

  const me = toId(userId);
  const remaining = group.members.map(toId).filter((id) => id !== me);

  if (remaining.length === 0) {
    const [withFiles, before] = await Promise.all([
      Message.find({ conversation: conversationId, 'attachments.0': { $exists: true } })
        .select('attachments')
        .lean(),
      Conversation.findById(conversationId).select('+avatarPublicId').lean(),
    ]);

    await Promise.all([
      Message.deleteMany({ conversation: conversationId }),
      ConversationState.deleteMany({ conversation: conversationId }),
      Conversation.deleteOne({ _id: conversationId }),
    ]);

    await destroyImage(before?.avatarPublicId);
    await Promise.allSettled(withFiles.map((message) => deleteAttachments(message.attachments)));

    return { conversationId, conversation: null, messages: [], removed: [me], deleted: true };
  }

  const actor = await actorOf(userId);

  let admins = [...adminIdsOf(group)].filter((id) => id !== me);
  let promotedId = null;

  if (admins.length === 0) {
    promotedId = remaining[0];
    admins = [promotedId];
  }

  await Conversation.updateOne({ _id: conversationId }, { $pull: { members: userId }, $set: { admins } });
  await ConversationState.deleteOne({ user: userId, conversation: conversationId });

  const messages = [await addSystemMessage(conversationId, userId, 'left', `${nameOf(actor)} left`)];

  if (promotedId) {
    const promoted = await actorOf(promotedId);
    messages.push(
      await addSystemMessage(conversationId, promotedId, 'promoted', `${nameOf(promoted)} is now an admin`)
    );
  }

  return {
    conversationId,
    conversation: await getConversationDto(conversationId),
    messages,
    removed: [me],
  };
};
