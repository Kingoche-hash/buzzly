import crypto from 'crypto';
import { cloudinary } from '../config/cloudinary.js';
import ConversationState from '../models/ConversationState.js';
import { AppError } from '../utils/AppError.js';
import { hasValidSignature } from '../utils/fileSignature.js';

const FOLDER = 'chatapp/wallpapers';

export const DEFAULT_STATE = {
  pinned: false,
  mutedUntil: null,
  spam: false,
  deletedAt: null,
  wallpaper: 'default',
  wallpaperUrl: '',
};

const MUTE_DURATIONS = {
  '8h': 8 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
};

const FOREVER = new Date('2999-01-01T00:00:00.000Z');

export const toPublicState = (doc) =>
  doc
    ? {
        pinned: doc.pinned,
        mutedUntil: doc.mutedUntil,
        spam: doc.spam,
        deletedAt: doc.deletedAt,
        wallpaper: doc.wallpaper,
        wallpaperUrl: doc.wallpaperImage?.url || '',
      }
    : { ...DEFAULT_STATE };

// Uploads the picture to Cloudinary, shrunk to at most 1600 x 2400.
const uploadImageBuffer = (buffer) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: FOLDER,
        resource_type: 'image',
        public_id: crypto.randomUUID(),
        transformation: [{ width: 1600, height: 2400, crop: 'limit', quality: 'auto' }],
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
    console.error('Could not delete wallpaper image:', error.message);
  }
};

// The settings of one person for several chats, as a Map keyed by conversation id.
export const getStatesById = async (userId, conversationIds) => {
  const states = await ConversationState.find({
    user: userId,
    conversation: { $in: conversationIds },
  }).lean();

  return new Map(states.map((state) => [state.conversation.toString(), toPublicState(state)]));
};

// Changes some settings. The caller must already have checked the person belongs to the chat.
export const updateState = async (userId, conversationId, patch) => {
  const filter = { user: userId, conversation: conversationId };
  const changes = {};
  let removesPhoto = false;

  if (patch.pinned !== undefined) changes.pinned = patch.pinned;
  if (patch.spam !== undefined) changes.spam = patch.spam;
  if (patch.deleted !== undefined) changes.deletedAt = patch.deleted ? new Date() : null;

  // Choosing one of the built-in wallpapers replaces a photo wallpaper.
  if (patch.wallpaper !== undefined) {
    changes.wallpaper = patch.wallpaper;
    removesPhoto = true;
  }

  if (patch.muted !== undefined) {
    if (patch.muted === 'off') changes.mutedUntil = null;
    else if (patch.muted === 'forever') changes.mutedUntil = FOREVER;
    else changes.mutedUntil = new Date(Date.now() + MUTE_DURATIONS[patch.muted]);
  }

  let oldPublicId = '';

  if (removesPhoto) {
    const before = await ConversationState.findOne(filter).select('wallpaperImage').lean();
    oldPublicId = before?.wallpaperImage?.publicId || '';
  }

  const update = { $set: changes };
  if (removesPhoto) update.$unset = { wallpaperImage: '' };

  const doc = await ConversationState.findOneAndUpdate(filter, update, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
  });

  await destroyImage(oldPublicId);

  return toPublicState(doc);
};

// Uses the person's own photo as the wallpaper of one chat.
export const setWallpaperPhoto = async (userId, conversationId, file) => {
  if (!hasValidSignature(file)) {
    throw new AppError('That file is not a real image', 415);
  }

  let uploaded;

  try {
    uploaded = await uploadImageBuffer(file.buffer);
  } catch (error) {
    console.error('Cloudinary wallpaper upload error:', error.message);
    throw new AppError('Upload failed. Please try again.', 502);
  }

  const filter = { user: userId, conversation: conversationId };

  const before = await ConversationState.findOne(filter).select('wallpaperImage').lean();

  const doc = await ConversationState.findOneAndUpdate(
    filter,
    {
      $set: {
        wallpaper: 'photo',
        wallpaperImage: { url: uploaded.secure_url, publicId: uploaded.public_id },
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // The previous photo is no longer needed.
  await destroyImage(before?.wallpaperImage?.publicId);

  return toPublicState(doc);
};
