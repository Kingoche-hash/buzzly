import crypto from 'crypto';
import { cloudinary } from '../config/cloudinary.js';
import Comment from '../models/Comment.js';
import Like from '../models/Like.js';
import Post from '../models/Post.js';
import Report from '../models/Report.js';
import { AppError } from '../utils/AppError.js';
import { hasValidSignature } from '../utils/fileSignature.js';

const FOLDER = 'chatapp/posts';
const AUTHOR_FIELDS = 'username displayName avatar';
const REPORTS_TO_HIDE = 3;

// Posts of deleted accounts come back with author = null, and we leave them out.
const authorPopulate = { path: 'author', select: AUTHOR_FIELDS, match: { deletedAt: null } };

const sameId = (a, b) => a.toString() === b.toString();

// Uploads the photo to Cloudinary, shrunk to at most 1440 x 1800.
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

const toAuthorDto = (author) => ({
  _id: author._id,
  username: author.username,
  displayName: author.displayName,
  avatar: author.avatar,
});

// What the browser gets for one post. `likedIds` is the set of post ids the viewer has liked.
const toPostDto = (post, viewerId, likedIds = new Set()) => ({
  _id: post._id,
  author: toAuthorDto(post.author),
  imageUrl: post.image.url,
  width: post.image.width,
  height: post.image.height,
  caption: post.caption,
  likeCount: post.likeCount,
  commentCount: post.commentCount,
  liked: likedIds.has(post._id.toString()),
  mine: sameId(post.author._id, viewerId),
  createdAt: post.createdAt,
});

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

// A post that exists, is not hidden, and still has an author.
const loadVisiblePost = async (postId) => {
  const post = await Post.findOne({ _id: postId, hidden: false }).populate(authorPopulate);

  if (!post || !post.author) {
    throw new AppError('Post not found', 404);
  }

  return post;
};

export const createPost = async ({ userId, file, caption }) => {
  if (!hasValidSignature(file)) {
    throw new AppError('That file is not a real image', 415);
  }

  let uploaded;

  try {
    uploaded = await uploadImageBuffer(file.buffer);
  } catch (error) {
    console.error('Cloudinary post upload error:', error.message);
    throw new AppError('Upload failed. Please try again.', 502);
  }

  const post = await Post.create({
    author: userId,
    caption,
    image: {
      url: uploaded.secure_url,
      publicId: uploaded.public_id,
      width: uploaded.width,
      height: uploaded.height,
    },
  });

  await post.populate(authorPopulate);

  return toPostDto(post, userId);
};

// The feed (everyone's posts) or, with authorId, one person's posts. Newest first, in pages.
export const listPosts = async ({ viewerId, authorId, before, limit }) => {
  // Posts I reported never show up for me again.
  const reported = await Report.distinct('post', { reporter: viewerId });

  const filter = { hidden: false };
  if (authorId) filter.author = authorId;

  const range = {};
  if (reported.length > 0) range.$nin = reported;
  if (before) range.$lt = before;
  if (Object.keys(range).length > 0) filter._id = range;

  // Ask for one extra post, just to learn whether older ones exist.
  const found = await Post.find(filter)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .populate(authorPopulate);

  const hasMore = found.length > limit;
  const page = hasMore ? found.slice(0, limit) : found;
  const nextCursor = hasMore ? page.at(-1)._id : null;

  const visible = page.filter((post) => post.author);
  const liked = await likedSetFor(
    viewerId,
    visible.map((post) => post._id)
  );

  return { posts: visible.map((post) => toPostDto(post, viewerId, liked)), hasMore, nextCursor };
};

export const getPost = async ({ viewerId, postId }) => {
  const post = await loadVisiblePost(postId);
  const liked = await likedSetFor(viewerId, [post._id]);

  return toPostDto(post, viewerId, liked);
};

export const deletePost = async (userId, postId) => {
  const post = await Post.findOneAndDelete({ _id: postId, author: userId });

  if (!post) {
    throw new AppError('Post not found', 404);
  }

  await Promise.all([
    Comment.deleteMany({ post: post._id }),
    Like.deleteMany({ post: post._id }),
    Report.deleteMany({ post: post._id }),
  ]);

  await destroyImage(post.image?.publicId);
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

// When an account is deleted: their posts, comments and likes go too.
export const removeUserContent = async (userId) => {
  const posts = await Post.find({ author: userId }).select('image.publicId').lean();
  const postIds = posts.map((post) => post._id);

  await Promise.all([
    Comment.deleteMany({ post: { $in: postIds } }),
    Like.deleteMany({ post: { $in: postIds } }),
    Report.deleteMany({ post: { $in: postIds } }),
  ]);
  await Post.deleteMany({ author: userId });
  await Promise.allSettled(posts.map((post) => destroyImage(post.image?.publicId)));

  // Their likes and comments on other people's posts: take them back off the counters.
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
  ];

  if (operations.length > 0) await Post.bulkWrite(operations);

  await Promise.all([
    Like.deleteMany({ user: userId }),
    Comment.deleteMany({ author: userId }),
    Report.deleteMany({ reporter: userId }),
  ]);
};
