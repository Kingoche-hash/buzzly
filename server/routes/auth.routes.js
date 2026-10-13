import { Router } from 'express';
import {
  changeContactHandler,
  forgot,
  getConfig,
  getMe,
  login,
  register,
  resend,
  reset,
  verify,
} from '../controllers/auth.controller.js';
import { protect } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { validate } from '../middleware/validate.js';
import {
  changeContactSchema,
  identifierSchema,
  loginSchema,
  registerSchema,
  resetSchema,
  verifySchema,
} from '../validators/auth.validators.js';

const router = Router();

// What the register page needs to know (for example whether phone sign-up is on).
router.get('/config', getConfig);

router.post('/register', authLimiter, validate(registerSchema), register);
router.post('/login', authLimiter, validate(loginSchema), login);
router.post('/verify', authLimiter, validate(verifySchema), verify);
router.post('/resend', authLimiter, validate(identifierSchema), resend);
router.post('/change-contact', authLimiter, validate(changeContactSchema), changeContactHandler);
router.post('/forgot', authLimiter, validate(identifierSchema), forgot);
router.post('/reset', authLimiter, validate(resetSchema), reset);
router.get('/me', protect, getMe);

export default router;
