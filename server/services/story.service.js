import crypto from 'crypto';
import { cloudinary } from '../config/cloudinary.js';
import Story from '../models/Story.js';
import { AppError } from '../utils/AppError.js';
import { hasValidSignature } from '../utils/fileSignature.js';
import { getContactIds } from './presence.service.js';

const FOLDER = 'chatapp/stories';
const LIFETIME_MS = 24 * 60 * 60 * 1000; // a story lasts 24 hours

// Uploads the picture to Cloudinary, shrunk to at most 1080 x 1920.
const uploadImageBuffer = (buffer) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: FOLDER,
        resource_type: 'image',
        public_id: crypto.randomUUID(),
        transformation: [{ width: 1080, height: 1920, crop: 'limit', quality: 'auto' }],
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
    console.error('Could not delete story image:', error.message);
  }
};

// What the browser gets for one story.
export const toStoryDto = (story, viewerId) => {
  const isOwn = story.author._id.toString() === viewerId.toString();

  return {
    _id: story._id,
    type: story.type,
    text: story.text,
    background: story.background,
    imageUrl: story.image?.url || '',
    createdAt: story.createdAt,
    expiresAt: story.expiresAt,
    viewed: isOwn || story.viewers.some((viewer) => viewer.user.toString() === viewerId.toString()),
    viewerCount: isOwn ? story.viewers.length : undefined,
  };
};

export const createStory = async ({ userId, file, text, background }) => {
  let image;

  if (file) {
    if (!hasValidSignature(file)) {
      throw new AppError('That file is not a real image', 415);
    }

    try {
      const result = await uploadImageBuffer(file.buffer);
      image = { url: result.secure_url, publicId: result.public_id };
    } catch (error) {
      console.error('Cloudinary story upload error:', error.message);
      throw new AppError('Upload failed. Please try again.', 502);
    }
  }

  const story = await Story.create({
    author: userId,
    type: file ? 'image' : 'text',
    text,
    background: background || 'emerald',
    image,
    expiresAt: new Date(Date.now() + LIFETIME_MS),
  });

  // The author field must look like a populated one for toStoryDto.
  story.author = { _id: userId };
  return story;
};

// My stories and the stories of people I chat with, grouped by author.
export const getFeed = async (userId) => {
  const contactIds = await getContactIds(userId);
  const authorIds = [userId.toString(), ...contactIds];

  const stories = await Story.find({
    author: { $in: authorIds },
    expiresAt: { $gt: new Date() },
  })
    .sort({ createdAt: 1 })
    .populate('author', 'username displayName avatar deletedAt');

  const groups = new Map();

  for (const story of stories) {
    if (!story.author || story.author.deletedAt) continue;

    const key = story.author._id.toString();

    if (!groups.has(key)) {
      groups.set(key, {
        author: {
          _id: key,
          username: story.author.username,
          displayName: story.author.displayName,
          avatar: story.author.avatar,
        },
        stories: [],
      });
    }

    groups.get(key).stories.push(toStoryDto(story, userId));
  }

  return [...groups.values()]
    .map((group) => ({ ...group, hasUnviewed: group.stories.some((story) => !story.viewed) }))
    .sort(
      (a, b) =>
        Number(b.hasUnviewed) - Number(a.hasUnviewed) ||
        new Date(b.stories.at(-1).createdAt) - new Date(a.stories.at(-1).createdAt)
    );
};

// A story can be seen by its author and by people who chat with the author.
const loadViewableStory = async (userId, storyId) => {
  const story = await Story.findOne({ _id: storyId, expiresAt: { $gt: new Date() } });

  if (!story) {
    throw new AppError('Story not found', 404);
  }

  if (story.author.toString() !== userId.toString()) {
    const contacts = await getContactIds(userId);

    if (!contacts.includes(story.author.toString())) {
      throw new AppError('Story not found', 404);
    }
  }

  return story;
};

// Records a view. Returns the author's id (so they can be told), or null for the author's own view.
export const markViewed = async (userId, storyId) => {
  const story = await loadViewableStory(userId, storyId);

  if (story.author.toString() === userId.toString()) return null;

  await Story.updateOne(
    { _id: story._id, 'viewers.user': { $ne: userId } },
    { $push: { viewers: { user: userId, viewedAt: new Date() } } }
  );

  return story.author.toString();
};

// Only the author can see who viewed.
export const getViewers = async (userId, storyId) => {
  const story = await Story.findOne({ _id: storyId, author: userId }).populate(
    'viewers.user',
    'username displayName avatar'
  );

  if (!story) {
    throw new AppError('Story not found', 404);
  }

  return story.viewers
    .filter((viewer) => viewer.user)
    .map((viewer) => ({
      _id: viewer.user._id,
      username: viewer.user.username,
      displayName: viewer.user.displayName,
      avatar: viewer.user.avatar,
      viewedAt: viewer.viewedAt,
    }))
    .sort((a, b) => new Date(b.viewedAt) - new Date(a.viewedAt));
};

export const deleteStory = async (userId, storyId) => {
  const story = await Story.findOneAndDelete({ _id: storyId, author: userId });

  if (!story) {
    throw new AppError('Story not found', 404);
  }

  await destroyImage(story.image?.publicId);
};

// Removes expired stories and their photos. Runs when the server starts and every hour.
export const cleanupExpiredStories = async () => {
  const expired = await Story.find({ expiresAt: { $lte: new Date() } })
    .select('image')
    .limit(200);

  if (expired.length === 0) return;

  await Promise.allSettled(expired.map((story) => destroyImage(story.image?.publicId)));
  await Story.deleteMany({ _id: { $in: expired.map((story) => story._id) } });
};