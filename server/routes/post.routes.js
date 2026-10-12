import { Router } from 'express';
import {
  addCommentHandler,
  createMyPost,
  deleteCommentHandler,
  deleteMyPost,
  getCommentsHandler,
  getFeedHandler,
  getPostHandler,
  getUserPostsHandler,
  likeHandler,
  reportHandler,
  unlikeHandler,
} from '../controllers/post.controller.js';
import { protect } from '../middleware/auth.js';
import { commentLimiter, postLimiter, uploadLimiter } from '../middleware/rateLimiter.js';
import { uploadPostImage } from '../middleware/uploadPostImage.js';
import { validate } from '../middleware/validate.js';
import {
  addCommentSchema,
  commentParams,
  commentsQuerySchema,
  createPostSchema,
  listQuerySchema,
  postIdParams,
  reportSchema,
  userPostsParams,
} from '../validators/post.validators.js';

const router = Router();

router.use(protect);

router.get('/', validate(listQuerySchema, 'query'), getFeedHandler);
router.post('/', postLimiter, uploadLimiter, uploadPostImage, validate(createPostSchema), createMyPost);

// One person's posts (for their profile). It must come before "/:postId".
router.get(
  '/user/:userId',
  validate(userPostsParams, 'params'),
  validate(listQuerySchema, 'query'),
  getUserPostsHandler
);

router.get('/:postId', validate(postIdParams, 'params'), getPostHandler);
router.delete('/:postId', validate(postIdParams, 'params'), deleteMyPost);

router.post('/:postId/like', validate(postIdParams, 'params'), likeHandler);
router.delete('/:postId/like', validate(postIdParams, 'params'), unlikeHandler);

router.get(
  '/:postId/comments',
  validate(postIdParams, 'params'),
  validate(commentsQuerySchema, 'query'),
  getCommentsHandler
);
router.post(
  '/:postId/comments',
  commentLimiter,
  validate(postIdParams, 'params'),
  validate(addCommentSchema),
  addCommentHandler
);
router.delete('/:postId/comments/:commentId', validate(commentParams, 'params'), deleteCommentHandler);

router.post(
  '/:postId/report',
  commentLimiter,
  validate(postIdParams, 'params'),
  validate(reportSchema),
  reportHandler
);

export default router;
