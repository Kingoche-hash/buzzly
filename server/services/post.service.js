import crypto from 'crypto';
import { cloudinary } from '../config/cloudinary.js';
import Comment from '../models/Comment.js';
import Like from '../models/Like.js';
import Post from '../models/Post.js';
import Report from '../models/Report.js';
import { AppError } from '../utils/AppError.js';
import { hasValidSignature } from '../utils/fileSignature.js';
import { getConversationForMember } from './conversation.service.js';
import { createMessage } from './message.service.js';

const FOLDER = 'chatapp/posts';
const AUTHOR_FIELDS = 'username displayName avatar';
const REPORTS_TO_HIDE = 3;
const MAX_SHARE_TARGETS = 5;

// Posts of deleted accounts come back with author = null, and we leave them out.
const authorPopulate = { path: 'author', select: AUTHOR_FIELDS, match: { deletedAt: null } };

// A repost shows its original, so we load the original together with ITS author.
const repostPopulate = { path: 'repostOf', match: { hidden: false }, populate: authorPopulate };

const sameId = (a, b) => a.toString() === b.toString();

// Uploads one photo to Cloudinary, shrunk to at most 1440 x 1800.
const uploadImageBuffer = (buffer) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: FOLDER,
        resource_type: 'image',
        public_id: crypto.randomUUID(),
        transformation: [{ width: 1440, height: 1800, crop: 'limit', quality: 'auto' }],
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
    console.error('Could not delete post image:', error.message);
  }
};

// The photos of a post. Older posts kept one picture in `image`.
const imagesOf = (post) => {
  if (post.images?.length) return post.images;
  return post.image?.url ? [post.image] : [];
};

const publicIdsOf = (post) => imagesOf(post).map((image) => image.publicId).filter(Boolean);

const toAuthorDto = (author) => ({
  _id: author._id,
  username: author.username,
  displayName: author.displayName,
  avatar: author.avatar,
});

// What the browser gets for one entry of a feed or profile.
// For a repost it shows the ORIGINAL post, plus who reposted it. `_id` is always the original's id
// (that is what likes and comments use) and `itemId` is the id of this entry.
const toItemDto = (item, viewerId, liked, reposted) => {
  const isRepost = item.isRepost === true;
  const original = isRepost ? item.repostOf : item;

  const images = imagesOf(original).map((image) => ({
    url: image.url,
    width: image.width,
    height: image.height,
  }));
  const first = images[0] || { url: '', width: 1, height: 1 };

  return {
    _id: original._id,
    itemId: item._id,
    repostedBy: isRepost ? toAuthorDto(item.author) : null,
    author: toAuthorDto(original.author),
    images,
    imageUrl: first.url,
    width: first.width,
    height: first.height,
    caption: original.caption,
    likeCount: original.likeCount,
    commentCount: original.commentCount,
    repostCount: original.repostCount || 0,
    liked: liked.has(original._id.toString()),
    reposted: reposted.has(original._id.toString()),
    mine: sameId(original.author._id, viewerId),
    createdAt: original.createdAt,
    sharedAt: item.createdAt,
  };
};

const toCommentDto = (comment, viewerId, postAuthorId) => ({
  _id: comment._id,
  text: comment.text,
  createdAt: comment.createdAt,
  author: toAuthorDto(comment.author),
  canDelete: sameId(comment.author._id, viewerId) || sameId(postAuthorId, viewerId),
});

const likedSetFor = async (viewerId, postIds) => {
  if (postIds.length === 0) return new Set();

  const likes = await Like.find({ user: viewerId, post: { $in: postIds } }).select('post').lean();
  return new Set(likes.map((like) => like.post.toString()));
};

const repostedSetFor = async (viewerId, postIds) => {
  if (postIds.length === 0) return new Set();

  const reposts = await Post.find({ author: viewerId, isRepost: true, repostOf: { $in: postIds } })
    .select('repostOf')
    .lean();
  return new Set(reposts.map((repost) => repost.repostOf.toString()));
};

// An original post that exists, is not hidden, and still has an author.
const loadVisiblePost = async (postId) => {
  const post = await Post.findOne({ _id: postId, hidden: false, isRepost: { $ne: true } }).populate(
    authorPopulate
  );

  if (!post || !post.author) {
    throw new AppError('Post not found', 404);
  }

  return post;
};

export const createPost = async ({ userId, files, caption }) => {
  if (!files || files.length === 0) {
    throw new AppError('Choose at least one photo', 400);
  }

  // Check every file before uploading any of them.
  for (const file of files) {
    if (!hasValidSignature(file)) {
      throw new AppError('One of those files is not a real image', 415);
    }
  }

  const settled = await Promise.allSettled(files.map((file) => uploadImageBuffer(file.buffer)));
  const results = settled.filter((item) => item.status === 'fulfilled').map((item) => item.value);

  // If one photo failed, remove the ones that did upload, so nothing is left behind.
  if (results.length !== files.length) {
    await Promise.allSettled(results.map((result) => destroyImage(result.public_id)));

    const failure = settled.find((item) => item.status === 'rejected');
    console.error('Cloudinary post upload error:', failure?.reason?.message);
    throw new AppError('Upload failed. Please try again.', 502);
  }

  const post = await Post.create({
    author: userId,
    caption,
    images: results.map((result) => ({
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
    })),
  });

  await post.populate(authorPopulate);

  return toItemDto(post, userId, new Set(), new Set());
};

// The feed (everyone's posts and reposts) or, with authorId, one person's. Newest first, in pages.
// type: 'posts' (no reposts) or 'reposts' (only reposts), for the tabs of a profile.
export const listPosts = async ({ viewerId, authorId, type, before, limit }) => {
  // Posts I reported never show up for me again.
  const reported = new Set((await Report.distinct('post', { reporter: viewerId })).map(String));

  const filter = { hidden: false };
  if (authorId) filter.author = authorId;
  if (type === 'posts') filter.isRepost = { $ne: true };
  if (type === 'reposts') filter.isRepost = true;
  if (before) filter._id = { $lt: before };

  // Ask for one extra entry, just to learn whether older ones exist.
  const found = await Post.find(filter)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .populate([authorPopulate, repostPopulate]);

  const hasMore = found.length > limit;
  const page = hasMore ? found.slice(0, limit) : found;
  const nextCursor = hasMore ? page.at(-1)._id : null;

  // Leave out entries whose person is gone, or whose original was hidden, deleted or reported by me.
  const usable = page.filter((item) => {
    if (!item.author) return false;

    if (item.isRepost) {
      return Boolean(item.repostOf?.author) && !reported.has(item.repostOf._id.toString());
    }

    return !reported.has(item._id.toString());
  });

  const originalIds = usable.map((item) => (item.isRepost ? item.repostOf._id : item._id));
  const [liked, reposted] = await Promise.all([
    likedSetFor(viewerId, originalIds),
    repostedSetFor(viewerId, originalIds),
  ]);

  return {
    posts: usable.map((item) => toItemDto(item, viewerId, liked, reposted)),
    hasMore,
    nextCursor,
  };
};

export const getPost = async ({ viewerId, postId }) => {
  const post = await loadVisiblePost(postId);
  const [liked, reposted] = await Promise.all([
    likedSetFor(viewerId, [post._id]),
    repostedSetFor(viewerId, [post._id]),
  ]);

  return toItemDto(post, viewerId, liked, reposted);
};

// How many posts and reposts someone has (the numbers on their profile).
export const getUserSummary = async (userId) => {
  const [posts, reposts] = await Promise.all([
    Post.countDocuments({ author: userId, hidden: false, isRepost: { $ne: true } }),
    Post.countDocuments({ author: userId, isRepost: true }),
  ]);

  return { posts, reposts };
};

export const deletePost = async (userId, postId) => {
  const post = await Post.findOneAndDelete({ _id: postId, author: userId, isRepost: { $ne: true } });

  if (!post) {
    throw new AppError('Post not found', 404);
  }

  await Promise.all([
    Comment.deleteMany({ post: post._id }),
    Like.deleteMany({ post: post._id }),
    Report.deleteMany({ post: post._id }),
    Post.deleteMany({ repostOf: post._id }), // reposts of a deleted post go with it
  ]);

  await Promise.allSettled(publicIdsOf(post).map(destroyImage));
};

export const likePost = async (userId, postId) => {
  await loadVisiblePost(postId);

  try {
    await Like.create({ user: userId, post: postId });
    await Post.updateOne({ _id: postId }, { $inc: { likeCount: 1 } });
  } catch (error) {
    // Already liked (duplicate key): nothing to do, liking twice never counts twice.
    if (error.code !== 11000) throw error;
  }

  const post = await Post.findById(postId).select('likeCount').lean();
  return { liked: true, likeCount: post.likeCount };
};

export const unlikePost = async (userId, postId) => {
  await loadVisiblePost(postId);

  const result = await Like.deleteOne({ user: userId, post: postId });

  if (result.deletedCount === 1) {
    await Post.updateOne({ _id: postId, likeCount: { $gt: 0 } }, { $inc: { likeCount: -1 } });
  }

  const post = await Post.findById(postId).select('likeCount').lean();
  return { liked: false, likeCount: post.likeCount };
};

// Puts someone else's post on my profile and into the feed.
export const repostPost = async (userId, postId) => {
  const original = await loadVisiblePost(postId);

  if (sameId(original.author._id, userId)) {
    throw new AppError('You cannot repost your own post', 400);
  }

  try {
    await Post.create({ author: userId, repostOf: original._id, isRepost: true });
    await Post.updateOne({ _id: postId }, { $inc: { repostCount: 1 } });
  } catch (error) {
    // Already reposted (duplicate key): reposting twice never counts twice.
    if (error.code !== 11000) throw error;
  }

  const fresh = await Post.findById(postId).select('repostCount').lean();
  return { reposted: true, repostCount: fresh.repostCount };
};

export const unrepostPost = async (userId, postId) => {
  const removed = await Post.findOneAndDelete({ author: userId, repostOf: postId, isRepost: true });

  if (removed) {
    await Post.updateOne({ _id: postId, repostCount: { $gt: 0 } }, { $inc: { repostCount: -1 } });
  }

  const fresh = await Post.findById(postId).select('repostCount').lean();

  if (!fresh) {
    throw new AppError('Post not found', 404);
  }

  return { reposted: false, repostCount: fresh.repostCount };
};

// Sends a post to some of my chats, as messages with a small post card.
export const sharePost = async ({ userId, postId, conversationIds, text }) => {
  const post = await loadVisiblePost(postId);

  const targets = [...new Set(conversationIds)];

  if (targets.length > MAX_SHARE_TARGETS) {
    throw new AppError(`You can share to at most ${MAX_SHARE_TARGETS} chats at once`, 400);
  }

  // Check every chat first, so nothing is sent if one of them is not mine.
  for (const conversationId of targets) {
    await getConversationForMember(conversationId, userId);
  }

  const images = imagesOf(post);

  const snapshot = {
    post: post._id,
    imageUrl: images[0]?.url || '',
    imageCount: images.length,
    caption: (post.caption || '').slice(0, 140),
    authorName: (post.author.displayName || post.author.username).slice(0, 60),
  };

  const messages = [];

  for (const conversationId of targets) {
    messages.push(
      await createMessage({ conversationId, senderId: userId, content: text || '', sharedPost: snapshot })
    );
  }

  return messages;
};

export const listComments = async ({ viewerId, postId, before, limit }) => {
  const post = await loadVisiblePost(postId);

  const filter = { post: postId };
  if (before) filter._id = { $lt: before };

  const found = await Comment.find(filter)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .populate(authorPopulate);

  const hasMore = found.length > limit;
  const page = hasMore ? found.slice(0, limit) : found;
  const nextCursor = hasMore ? page.at(-1)._id : null;

  const comments = page
    .filter((comment) => comment.author)
    .map((comment) => toCommentDto(comment, viewerId, post.author._id));

  return { comments, hasMore, nextCursor };
};

export const addComment = async ({ userId, postId, text }) => {
  const post = await loadVisiblePost(postId);

  const comment = await Comment.create({ post: postId, author: userId, text });
  await Post.updateOne({ _id: postId }, { $inc: { commentCount: 1 } });
  await comment.populate(authorPopulate);

  return toCommentDto(comment, userId, post.author._id);
};

// The writer of a comment, or the owner of the post, may delete it.
export const deleteComment = async ({ userId, postId, commentId }) => {
  const comment = await Comment.findOne({ _id: commentId, post: postId });
  const post = await Post.findById(postId).select('author').lean();

  if (!comment || !post) {
    throw new AppError('Comment not found', 404);
  }

  if (!sameId(comment.author, userId) && !sameId(post.author, userId)) {
    throw new AppError('You cannot delete this comment', 403);
  }

  await comment.deleteOne();
  await Post.updateOne({ _id: postId, commentCount: { $gt: 0 } }, { $inc: { commentCount: -1 } });
};

// After enough different people report a post, it is hidden for everyone.
export const reportPost = async ({ userId, postId, reason }) => {
  const post = await loadVisiblePost(postId);

  if (sameId(post.author._id, userId)) {
    throw new AppError('You cannot report your own post', 400);
  }

  try {
    await Report.create({ post: postId, reporter: userId, reason });
  } catch (error) {
    if (error.code !== 11000) throw error; // reporting twice is fine, it just counts once
  }

  const reports = await Report.countDocuments({ post: postId });

  if (reports >= REPORTS_TO_HIDE) {
    await Post.updateOne({ _id: postId }, { hidden: true });
  }
};

// When an account is deleted: their posts, reposts, comments and likes go too.
export const removeUserContent = async (userId) => {
  const mine = await Post.find({ author: userId }).select('images image isRepost repostOf').lean();
  const originals = mine.filter((post) => !post.isRepost);
  const myReposts = mine.filter((post) => post.isRepost);
  const originalIds = originals.map((post) => post._id);

  await Promise.all([
    Comment.deleteMany({ post: { $in: originalIds } }),
    Like.deleteMany({ post: { $in: originalIds } }),
    Report.deleteMany({ post: { $in: originalIds } }),
    Post.deleteMany({ repostOf: { $in: originalIds } }), // other people's reposts of my posts
  ]);
  await Post.deleteMany({ author: userId });
  await Promise.allSettled(originals.flatMap((post) => publicIdsOf(post)).map(destroyImage));

  // Their likes, comments and reposts on other people's posts: take them back off the counters.
  const [likes, comments] = await Promise.all([
    Like.find({ user: userId }).select('post').lean(),
    Comment.find({ author: userId }).select('post').lean(),
  ]);

  const operations = [
    ...likes.map((like) => ({
      updateOne: { filter: { _id: like.post, likeCount: { $gt: 0 } }, update: { $inc: { likeCount: -1 } } },
    })),
    ...comments.map((comment) => ({
      updateOne: {
        filter: { _id: comment.post, commentCount: { $gt: 0 } },
        update: { $inc: { commentCount: -1 } },
      },
    })),
    ...myReposts.map((repost) => ({
      updateOne: {
        filter: { _id: repost.repostOf, repostCount: { $gt: 0 } },
        update: { $inc: { repostCount: -1 } },
      },
    })),
  ];

  if (operations.length > 0) await Post.bulkWrite(operations);

  await Promise.all([
    Like.deleteMany({ user: userId }),
    Comment.deleteMany({ author: userId }),
    Report.deleteMany({ reporter: userId }),
  ]);
};
