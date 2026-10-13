import { Router } from 'express';
import {
  createConversation,
  getMyConversations,
  getConversationById,
  updateConversationState,
  setConversationWallpaper,
} from '../controllers/conversation.controller.js';
import {
  deleteMessageHandler,
  editMessageHandler,
  getConversationMessages,
  reactHandler,
  reportMessageHandler,
  sendMessage,
  unreactHandler,
} from '../controllers/message.controller.js';
import { sendMessageWithFiles } from '../controllers/attachment.controller.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { requireConversationMember } from '../middleware/requireMember.js';
import { uploadFiles } from '../middleware/upload.js';
import { uploadWallpaper } from '../middleware/uploadWallpaper.js';
import { actionLimiter, uploadLimiter } from '../middleware/rateLimiter.js';
import {
  conversationIdParams,
  createConversationSchema,
  sendMessageSchema,
  messageQuerySchema,
} from '../validators/conversation.validators.js';
import { captionSchema } from '../validators/attachment.validators.js';
import {
  deleteScopeSchema,
  editMessageSchema,
  messageParams,
  reactionSchema,
  replyQuerySchema,
  reportMessageSchema,
} from '../validators/messageActions.validators.js';
import { stateUpdateSchema } from '../validators/state.validators.js';

const router = Router();

router.use(protect);

router.post('/', validate(createConversationSchema), createConversation);
router.get('/', getMyConversations);

router.get('/:conversationId', validate(conversationIdParams, 'params'), getConversationById);

// My private settings for this chat (pin, mute, spam, delete, wallpaper).
router.patch(
  '/:conversationId/state',
  validate(conversationIdParams, 'params'),
  validate(stateUpdateSchema),
  updateConversationState
);

// My own photo as this chat's wallpaper: check the person belongs here first, then receive the photo.
router.post(
  '/:conversationId/wallpaper',
  uploadLimiter,
  validate(conversationIdParams, 'params'),
  requireConversationMember,
  uploadWallpaper,
  setConversationWallpaper
);

router.get(
  '/:conversationId/messages',
  validate(conversationIdParams, 'params'),
  validate(messageQuerySchema, 'query'),
  getConversationMessages
);

router.post(
  '/:conversationId/messages',
  validate(conversationIdParams, 'params'),
  validate(sendMessageSchema),
  sendMessage
);

// Message tools: edit, delete (for me or for everyone), react, report.
router.patch(
  '/:conversationId/messages/:messageId',
  actionLimiter,
  validate(messageParams, 'params'),
  validate(editMessageSchema),
  editMessageHandler
);
router.delete(
  '/:conversationId/messages/:messageId',
  actionLimiter,
  validate(messageParams, 'params'),
  validate(deleteScopeSchema, 'query'),
  deleteMessageHandler
);
router.put(
  '/:conversationId/messages/:messageId/reaction',
  actionLimiter,
  validate(messageParams, 'params'),
  validate(reactionSchema),
  reactHandler
);
router.delete(
  '/:conversationId/messages/:messageId/reaction',
  actionLimiter,
  validate(messageParams, 'params'),
  unreactHandler
);
router.post(
  '/:conversationId/messages/:messageId/report',
  actionLimiter,
  validate(messageParams, 'params'),
  validate(reportMessageSchema),
  reportMessageHandler
);

// Message with files: check the person belongs here first, then receive the files.
router.post(
  '/:conversationId/attachments',
  uploadLimiter,
  validate(conversationIdParams, 'params'),
  validate(replyQuerySchema, 'query'),
  requireConversationMember,
  uploadFiles,
  validate(captionSchema),
  sendMessageWithFiles
);

export default router;
