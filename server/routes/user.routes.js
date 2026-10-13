import { Router } from 'express';
import { reportUserHandler } from '../controllers/block.controller.js';
import { getUserProfileHandler, searchUsersHandler } from '../controllers/user.controller.js';
import { protect } from '../middleware/auth.js';
import { commentLimiter } from '../middleware/rateLimiter.js';
import { validate } from '../middleware/validate.js';
import { reportUserSchema } from '../validators/block.validators.js';
import { userIdParams, userSearchQuerySchema } from '../validators/user.validators.js';

const router = Router();

router.use(protect);

router.get('/', validate(userSearchQuerySchema, 'query'), searchUsersHandler);
router.get('/:userId', validate(userIdParams, 'params'), getUserProfileHandler);
router.post(
  '/:userId/report',
  commentLimiter,
  validate(userIdParams, 'params'),
  validate(reportUserSchema),
  reportUserHandler
);

export default router;
