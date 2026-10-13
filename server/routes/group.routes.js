import { Router } from 'express';
import {
  addMembersHandler,
  leaveHandler,
  makeAdminHandler,
  removeAdminHandler,
  removeAvatarHandler,
  removeMemberHandler,
  renameHandler,
  setAvatarHandler,
} from '../controllers/group.controller.js';
import { protect } from '../middleware/auth.js';
import { actionLimiter, uploadLimiter } from '../middleware/rateLimiter.js';
import { requireConversationMember } from '../middleware/requireMember.js';
import { uploadGroupImage } from '../middleware/uploadGroupImage.js';
import { validate } from '../middleware/validate.js';
import { conversationIdParams } from '../validators/conversation.validators.js';
import { addMembersSchema, memberParams, renameGroupSchema } from '../validators/group.validators.js';

// These live under /api/conversations too, next to the chat routes.
const router = Router();

router.use(protect);

router.patch(
  '/:conversationId/group',
  actionLimiter,
  validate(conversationIdParams, 'params'),
  validate(renameGroupSchema),
  renameHandler
);

// The group's picture: check the person belongs here first, then receive the photo.
router.post(
  '/:conversationId/group/avatar',
  uploadLimiter,
  validate(conversationIdParams, 'params'),
  requireConversationMember,
  uploadGroupImage,
  setAvatarHandler
);
router.delete(
  '/:conversationId/group/avatar',
  actionLimiter,
  validate(conversationIdParams, 'params'),
  removeAvatarHandler
);

router.post(
  '/:conversationId/members',
  actionLimiter,
  validate(conversationIdParams, 'params'),
  validate(addMembersSchema),
  addMembersHandler
);
router.delete('/:conversationId/members/:userId', actionLimiter, validate(memberParams, 'params'), removeMemberHandler);

router.put('/:conversationId/admins/:userId', actionLimiter, validate(memberParams, 'params'), makeAdminHandler);
router.delete('/:conversationId/admins/:userId', actionLimiter, validate(memberParams, 'params'), removeAdminHandler);

router.post('/:conversationId/leave', actionLimiter, validate(conversationIdParams, 'params'), leaveHandler);

export default router;
