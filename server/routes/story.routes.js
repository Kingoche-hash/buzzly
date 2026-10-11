import { Router } from 'express';
import {
  createMyStory,
  deleteMyStory,
  getFeedHandler,
  getStoryViewers,
  viewStory,
} from '../controllers/story.controller.js';
import { protect } from '../middleware/auth.js';
import { uploadLimiter } from '../middleware/rateLimiter.js';
import { uploadStoryImage } from '../middleware/uploadStoryImage.js';
import { validate } from '../middleware/validate.js';
import { createStorySchema, storyIdParams } from '../validators/story.validators.js';

const router = Router();

router.use(protect);

router.get('/', getFeedHandler);
router.post('/', uploadLimiter, uploadStoryImage, validate(createStorySchema), createMyStory);

router.post('/:storyId/view', validate(storyIdParams, 'params'), viewStory);
router.get('/:storyId/viewers', validate(storyIdParams, 'params'), getStoryViewers);
router.delete('/:storyId', validate(storyIdParams, 'params'), deleteMyStory);

export default router;