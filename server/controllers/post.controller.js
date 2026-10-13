import {
  addComment,
  createPost,
  deleteComment,
  deletePost,
  getPost,
  getUserSummary,
  likePost,
  listComments,
  listPosts,
  reportPost,
  repostPost,
  sharePost,
  unlikePost,
  unrepostPost,
} from '../services/post.service.js';
import { broadcastMessage } from '../socket/emitters.js';
import { getIO } from '../socket/io.js';
import { AppError } from '../utils/AppError.js';

// Tells every open window, so they can offer "1 new post".
const announcePost = (postId, authorId) => {
  getIO()?.emit('post_created', { postId: postId.toString(), authorId: authorId.toString() });
};

export const getFeedHandler = async (req, res) => {
  const { limit, before } = req.valid.query;
  const result = await listPosts({ viewerId: req.user._id, before, limit });
  res.status(200).json(result);
};

export const getUserPostsHandler = async (req, res) => {
  const { limit, before, type } = req.valid.query;
  const result = await listPosts({
    viewerId: req.user._id,
    authorId: req.params.userId,
    type,
    before,
    limit,
  });
  res.status(200).json(result);
};

export const getUserSummaryHandler = async (req, res) => {
  const summary = await getUserSummary(req.params.userId);
  res.status(200).json(summary);
};

export const getPostHandler = async (req, res) => {
  const post = await getPost({ viewerId: req.user._id, postId: req.params.postId });
  res.status(200).json({ post });
};

export const createMyPost = async (req, res) => {
  const files = req.files || [];

  if (files.length === 0) {
    throw new AppError('Choose at least one photo', 400);
  }

  const post = await createPost({
    userId: req.user._id,
    files,
    caption: req.body.caption ?? '',
  });

  announcePost(post._id, req.user._id);

  res.status(201).json({ post });
};

export const deleteMyPost = async (req, res) => {
  await deletePost(req.user._id, req.params.postId);
  res.status(200).json({ message: 'Post deleted' });
};

export const likeHandler = async (req, res) => {
  const result = await likePost(req.user._id, req.params.postId);
  res.status(200).json(result);
};

export const unlikeHandler = async (req, res) => {
  const result = await unlikePost(req.user._id, req.params.postId);
  res.status(200).json(result);
};

export const repostHandler = async (req, res) => {
  const result = await repostPost(req.user._id, req.params.postId);
  announcePost(req.params.postId, req.user._id);
  res.status(200).json(result);
};

export const unrepostHandler = async (req, res) => {
  const result = await unrepostPost(req.user._id, req.params.postId);
  res.status(200).json(result);
};

// Sends the post to some of my chats. Each one arrives as a normal message with a post card.
export const shareHandler = async (req, res) => {
  const messages = await sharePost({
    userId: req.user._id,
    postId: req.params.postId,
    conversationIds: req.body.conversationIds,
    text: req.body.text,
  });

  messages.forEach(broadcastMessage);

  res.status(201).json({ sent: messages.length });
};

export const getCommentsHandler = async (req, res) => {
  const { limit, before } = req.valid.query;
  const result = await listComments({
    viewerId: req.user._id,
    postId: req.params.postId,
    before,
    limit,
  });
  res.status(200).json(result);
};

export const addCommentHandler = async (req, res) => {
  const comment = await addComment({
    userId: req.user._id,
    postId: req.params.postId,
    text: req.body.text,
  });
  res.status(201).json({ comment });
};

export const deleteCommentHandler = async (req, res) => {
  await deleteComment({
    userId: req.user._id,
    postId: req.params.postId,
    commentId: req.params.commentId,
  });
  res.status(200).json({ message: 'Comment deleted' });
};

export const reportHandler = async (req, res) => {
  await reportPost({ userId: req.user._id, postId: req.params.postId, reason: req.body.reason });
  res.status(200).json({ ok: true });
};
