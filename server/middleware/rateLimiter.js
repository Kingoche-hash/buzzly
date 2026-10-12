import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const production = env.nodeEnv === 'production';

// A ceiling for the whole API, per visitor address.
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: production ? 600 : 5000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many requests, please slow down' },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: production ? 20 : 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many attempts, please try again later' },
});

export const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: production ? 30 : 200,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many uploads, please try again later' },
});

export const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: production ? 60 : 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many searches, please slow down' },
});

// Story replies become messages, so they get their own ceiling.
export const replyLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: production ? 30 : 200,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'You are replying too fast, please slow down' },
});

// New posts are rare, so the ceiling is low.
export const postLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: production ? 20 : 200,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'You are posting too often, please try again later' },
});

// Comments and reports.
export const commentLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: production ? 20 : 200,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'You are doing that too fast, please slow down' },
});
