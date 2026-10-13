import crypto from 'crypto';
import { env } from '../config/env.js';
import OtpCode from '../models/OtpCode.js';
import { AppError } from '../utils/AppError.js';

export const CODE_MINUTES = 10;
export const MAX_TRIES = 5;
export const RESEND_SECONDS = 60;

const MAX_SENDS_PER_HOUR = 5;
const HOUR_MS = 60 * 60 * 1000;

// Only this scrambled version is stored. It also depends on the person and the purpose.
const hashCode = (userId, purpose, code) =>
  crypto.createHmac('sha256', env.jwtSecret).update(`${userId}:${purpose}:${code}`).digest('hex');

const sameHash = (a, b) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  return left.length === right.length && crypto.timingSafeEqual(left, right);
};

// Makes a new 6-digit code for this person, replacing any older one.
// Returns { ok: true, code } or, when asked too soon or too often, { ok: false, waitSeconds }.
// force: true skips the 60-second wait (used when the person changes their email).
export const issueCode = async ({ user, purpose, channel, target, force = false }) => {
  const now = Date.now();
  const existing = await OtpCode.findOne({ user: user._id, purpose });

  let windowStart = new Date(now);
  let windowCount = 1;

  if (existing) {
    const waited = now - existing.lastSentAt.getTime();

    if (!force && waited < RESEND_SECONDS * 1000) {
      return { ok: false, waitSeconds: Math.ceil((RESEND_SECONDS * 1000 - waited) / 1000) };
    }

    const windowAge = now - existing.windowStart.getTime();

    if (windowAge < HOUR_MS) {
      if (existing.windowCount >= MAX_SENDS_PER_HOUR) {
        return { ok: false, waitSeconds: Math.ceil((HOUR_MS - windowAge) / 1000) };
      }

      windowStart = existing.windowStart;
      windowCount = existing.windowCount + 1;
    }
  }

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');

  await OtpCode.updateOne(
    { user: user._id, purpose },
    {
      $set: {
        channel,
        target,
        codeHash: hashCode(user._id, purpose, code),
        expiresAt: new Date(now + CODE_MINUTES * 60 * 1000),
        attempts: 0,
        lastSentAt: new Date(now),
        windowStart,
        windowCount,
      },
    },
    { upsert: true }
  );

  return { ok: true, code };
};

// Checks a code. Every try is counted BEFORE comparing, so tries cannot be raced.
export const checkCode = async ({ user, purpose, code }) => {
  const doc = await OtpCode.findOneAndUpdate(
    { user: user._id, purpose, expiresAt: { $gt: new Date() }, attempts: { $lt: MAX_TRIES } },
    { $inc: { attempts: 1 } },
    { new: true }
  );

  if (!doc) {
    const old = await OtpCode.findOne({ user: user._id, purpose }).select('attempts');

    if (old && old.attempts >= MAX_TRIES) {
      throw new AppError('Too many wrong tries. Please request a new code.', 429);
    }

    throw new AppError('That code has expired. Please request a new one.', 400);
  }

  if (!sameHash(doc.codeHash, hashCode(user._id, purpose, code))) {
    const left = MAX_TRIES - doc.attempts;

    if (left <= 0) {
      throw new AppError('Too many wrong tries. Please request a new code.', 429);
    }

    throw new AppError(`That code is not correct. You have ${left} ${left === 1 ? 'try' : 'tries'} left.`, 400);
  }

  await OtpCode.deleteOne({ _id: doc._id });
  return doc;
};
