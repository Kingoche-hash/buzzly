import { Router } from 'express';
import {
  blockHandler,
  listBlockedHandler,
  unblockHandler,
} from '../controllers/block.controller.js';
import { protect } from '../middleware/auth.js';
import { commentLimiter } from '../middleware/rateLimiter.js';
import { validate } from '../middleware/validate.js';
import { blockUserParams } from '../validators/block.validators.js';

const router = Router();

router.use(protect);

router.get('/', listBlockedHandler);
router.post('/:userId', commentLimiter, validate(blockUserParams, 'params'), blockHandler);
router.delete('/:userId', validate(blockUserParams, 'params'), unblockHandler);

export default router;
