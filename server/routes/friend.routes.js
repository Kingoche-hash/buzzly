import { Router } from 'express';
import {
  acceptHandler,
  cancelHandler,
  declineHandler,
  listHandler,
  sendHandler,
  settingsHandler,
  statusHandler,
  unfriendHandler,
} from '../controllers/friend.controller.js';
import { protect } from '../middleware/auth.js';
import { commentLimiter } from '../middleware/rateLimiter.js';
import { validate } from '../middleware/validate.js';
import { friendUserParams, messageSettingsSchema } from '../validators/friend.validators.js';

const router = Router();

router.use(protect);

router.get('/', listHandler);
router.get('/status/:userId', validate(friendUserParams, 'params'), statusHandler);
router.patch('/settings', validate(messageSettingsSchema), settingsHandler);

router.post('/requests/:userId', commentLimiter, validate(friendUserParams, 'params'), sendHandler);
router.post('/requests/:userId/accept', validate(friendUserParams, 'params'), acceptHandler);
router.post('/requests/:userId/decline', validate(friendUserParams, 'params'), declineHandler);
router.delete('/requests/:userId', validate(friendUserParams, 'params'), cancelHandler);

router.delete('/:userId', validate(friendUserParams, 'params'), unfriendHandler);

export default router;
