import {
  addComment,
  createPost,
  deleteComment,
  deletePost,
  getPost,
  likePost,
  listComments,
  listPosts,
  reportPost,
  unlikePost,
} from '../services/post.service.js';
import { getIO } from '../socket/io.js';
import { AppError } from '../utils/AppError.js';

export const getFeedHandler = async (req, res) => {
  const { limit, before } = req.valid.query;
  const result = await listPosts({ viewerId: req.user._id, before, limit });
  res.status(200).json(result);
};

export const getUserPostsHandler = async (req, res) => {
  const { limit, before } = req.valid.query;
  const result = await listPosts({ viewerId: req.user._id, authorId: req.params.userId, before, limit });
  res.status(200).json(result);
};

export const getPostHandler = async (req, res) => {
  const post = await getPost({ viewerId: req.user._id, postId: req.params.postId });
  res.status(200).json({ post });
};

export const createMyPost = async (req, res) => {
  if (!req.file) {
    throw new AppError('Choose a photo', 400);
  }

  const post = await createPost({
    userId: req.user._id,
    file: req.file,
    caption: req.body.caption ?? '',
  });

  // Tell every open window, so they can offer "1 new post".
  getIO()?.emit('post_created', { postId: post._id.toString(), authorId: req.user._id.toString() });

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
