import Post from '../models/Post.js';
import { isHiddenBetween } from '../services/block.service.js';
import { AppError } from '../utils/AppError.js';

// A post by someone I blocked, or by someone who blocked me, does not exist for me.
export const requireVisiblePostAuthor = async (req, res, next) => {
  const post = await Post.findById(req.params.postId).select('author').lean();

  if (post && (await isHiddenBetween(req.user._id, post.author))) {
    throw new AppError('Post not found', 404);
  }

  next();
};
