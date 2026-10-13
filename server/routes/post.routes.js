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
  getUserSummaryHandler,
  likeHandler,
  reportHandler,
  repostHandler,
  shareHandler,
  unlikeHandler,
  unrepostHandler,
} from '../controllers/post.controller.js';
import { protect } from '../middleware/auth.js';
import { commentLimiter, postLimiter, uploadLimiter } from '../middleware/rateLimiter.js';
import { requireVisiblePostAuthor } from '../middleware/requireVisiblePostAuthor.js';
import { uploadPostImages } from '../middleware/uploadPostImages.js';
import { validate } from '../middleware/validate.js';
import {
  addCommentSchema,
  commentParams,
  commentsQuerySchema,
  createPostSchema,
  listQuerySchema,
  postIdParams,
  reportSchema,
  sharePostSchema,
  userPostsParams,
} from '../validators/post.validators.js';

const router = Router();

router.use(protect);

router.get('/', validate(listQuerySchema, 'query'), getFeedHandler);
router.post('/', postLimiter, uploadLimiter, uploadPostImages, validate(createPostSchema), createMyPost);

// One person's posts and counts (for their profile). These must come before "/:postId".
router.get('/user/:userId/summary', validate(userPostsParams, 'params'), getUserSummaryHandler);
router.get(
  '/user/:userId',
  validate(userPostsParams, 'params'),
  validate(listQuerySchema, 'query'),
  getUserPostsHandler
);

// "requireVisiblePostAuthor": a post by a blocked person (either way) does not exist for me.
router.get('/:postId', validate(postIdParams, 'params'), requireVisiblePostAuthor, getPostHandler);
router.delete('/:postId', validate(postIdParams, 'params'), deleteMyPost);

router.post('/:postId/like', validate(postIdParams, 'params'), requireVisiblePostAuthor, likeHandler);
router.delete('/:postId/like', validate(postIdParams, 'params'), unlikeHandler);

router.post(
  '/:postId/repost',
  commentLimiter,
  validate(postIdParams, 'params'),
  requireVisiblePostAuthor,
  repostHandler
);
router.delete('/:postId/repost', validate(postIdParams, 'params'), unrepostHandler);

router.post(
  '/:postId/share',
  commentLimiter,
  validate(postIdParams, 'params'),
  requireVisiblePostAuthor,
  validate(sharePostSchema),
  shareHandler
);

router.get(
  '/:postId/comments',
  validate(postIdParams, 'params'),
  requireVisiblePostAuthor,
  validate(commentsQuerySchema, 'query'),
  getCommentsHandler
);
router.post(
  '/:postId/comments',
  commentLimiter,
  validate(postIdParams, 'params'),
  requireVisiblePostAuthor,
  validate(addCommentSchema),
  addCommentHandler
);
router.delete('/:postId/comments/:commentId', validate(commentParams, 'params'), deleteCommentHandler);

router.post(
  '/:postId/report',
  commentLimiter,
  validate(postIdParams, 'params'),
  requireVisiblePostAuthor,
  validate(reportSchema),
  reportHandler
);

export default router;
