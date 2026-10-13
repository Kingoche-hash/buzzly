import bcrypt from 'bcrypt';
import { env } from '../config/env.js';
import { redis } from '../config/redis.js';
import User from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { parseIdentifier } from '../utils/contact.js';
import { signToken } from '../utils/token.js';
import { resetEmail, verificationEmail, welcomeEmail } from './emailTemplates.js';
import { sendEmail } from './mail.service.js';
import { CODE_MINUTES, RESEND_SECONDS, checkCode, issueCode } from './otp.service.js';
import { sendSms } from './sms.service.js';

const MAX_FAILED_LOGINS = 10;
const LOCK_WINDOW_SECONDS = 15 * 60;

// Sign-ups that were never confirmed are forgotten after a day.
const STALE_MS = 24 * 60 * 60 * 1000;

const SEND_FAILED = 'We could not send the code right now. Please try again in a moment.';
const BAD_CODE = 'That code is not correct or has expired.';

// A fake hash, so logging in with an unknown account takes as long as a real one.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

// Failed attempts are counted in Redis per account AND visitor address.
const failureKey = (value, ip) => `${env.redisPrefix}login:fail:${value}:${ip}`;

const getFailures = async (key) => {
  try {
    return Number(await redis.get(key)) || 0;
  } catch {
    return 0; // If Redis hiccups, do not lock anybody out.
  }
};

const recordFailure = async (key) => {
  try {
    await redis.multi().incr(key).expire(key, LOCK_WINDOW_SECONDS).exec();
  } catch {
    // ignore
  }
};

const clearFailures = async (key) => {
  try {
    await redis.del(key);
  } catch {
    // ignore
  }
};

const takenMessage = (field) => (field === 'email' ? 'Email already in use' : 'Phone number already in use');

const requirePhoneAllowed = () => {
  if (!env.phoneSignup) {
    throw new AppError('Signing up with a phone number is not available yet. Please use an email address.', 400);
  }
};

// Makes a code and sends it by email or text.
// Returns { ok: false, waitSeconds } when asked too soon or too often (nothing is sent then).
const deliver = async ({ user, purpose, target, channel, force = false }) => {
  const issued = await issueCode({ user, purpose, channel, target, force });

  if (!issued.ok) return issued;

  const name = user.displayName || user.username;

  try {
    if (channel === 'email') {
      const make = purpose === 'reset' ? resetEmail : verificationEmail;
      await sendEmail({ to: target, ...make({ name, code: issued.code }) });
    } else {
      const what = purpose === 'reset' ? 'password reset code' : 'code';
      await sendSms({ to: target, body: `Your Buzzly ${what} is ${issued.code}. It expires in ${CODE_MINUTES} minutes.` });
    }
  } catch (error) {
    console.error(`Could not send a ${channel} code:`, error.message);
    throw new AppError(SEND_FAILED, 502);
  }

  return issued;
};

export const getAuthConfig = () => ({ phoneSignup: env.phoneSignup });

export const registerUser = async ({ username, password, email, phone }) => {
  if (phone) requirePhoneAllowed();

  const field = email ? 'email' : 'phone';
  const value = email ?? phone;
  const channel = email ? 'email' : 'sms';

  // Forget old sign-ups that were never confirmed, so they cannot block a name or an address forever.
  await User.deleteMany({
    verified: false,
    createdAt: { $lt: new Date(Date.now() - STALE_MS) },
    $or: [{ username }, { [field]: value }],
  });

  const existing = await User.findOne({ [field]: value });

  if (existing && existing.verified !== false) {
    throw new AppError(takenMessage(field), 409);
  }

  const nameOwner = await User.findOne({ username });

  if (nameOwner && (!existing || !nameOwner._id.equals(existing._id))) {
    throw new AppError('Username already taken', 409);
  }

  let user = existing;

  try {
    if (user) {
      // The same person signing up again before confirming: their new details replace the old ones.
      user.username = username;
      user.password = password;
      await user.save();
    } else {
      user = await User.create({ username, [field]: value, password, verified: false });
    }
  } catch (error) {
    if (error.code === 11000) throw new AppError('Those details are already in use', 409);
    throw error;
  }

  await deliver({ user, purpose: 'verify', target: value, channel });

  return { pending: true, identifier: value, channel, waitSeconds: RESEND_SECONDS };
};

// Confirms an account with the code that was sent. The person is logged in right away.
export const verifyAccount = async ({ identifier, code }) => {
  const { field, value } = parseIdentifier(identifier);
  const user = await User.findOne({ [field]: value, deletedAt: null });

  if (!user || user.verified !== false) {
    throw new AppError(BAD_CODE, 400);
  }

  await checkCode({ user, purpose: 'verify', code });

  user.verified = true;
  user.verifiedAt = new Date();
  await user.save();

  // The welcome email is a bonus: if it fails, the account is still confirmed.
  if (user.email) {
    sendEmail({ to: user.email, ...welcomeEmail({ name: user.displayName || user.username }) }).catch((error) =>
      console.error('Could not send the welcome email:', error.message)
    );
  }

  return { user, token: signToken(user._id.toString()) };
};

// Sends the confirmation code again. It never says whether the account exists.
export const resendCode = async ({ identifier }) => {
  const { field, value, channel } = parseIdentifier(identifier);

  if (channel === 'sms' && !env.phoneSignup) return;

  const user = await User.findOne({ [field]: value, deletedAt: null });

  if (!user || user.verified !== false) return;

  await deliver({ user, purpose: 'verify', target: value, channel });
};

// Fixes a mistyped email (or switches to a phone number) before the account is confirmed.
// The password proves it is really them.
export const changeContact = async ({ identifier, password, email, phone }, ip = 'unknown') => {
  const current = parseIdentifier(identifier);
  const key = failureKey(current.value, ip);

  if ((await getFailures(key)) >= MAX_FAILED_LOGINS) {
    throw new AppError('Too many failed attempts. Please try again in 15 minutes.', 429);
  }

  const user = await User.findOne({ [current.field]: current.value, deletedAt: null }).select('+password');

  let valid = false;

  if (user && user.verified === false) {
    valid = await user.comparePassword(password);
  } else {
    await bcrypt.compare(password, DUMMY_HASH);
  }

  if (!valid) {
    await recordFailure(key);
    throw new AppError('Invalid login details', 401);
  }

  await clearFailures(key);

  if (phone) requirePhoneAllowed();

  const field = email ? 'email' : 'phone';
  const value = email ?? phone;
  const channel = email ? 'email' : 'sms';

  await User.deleteMany({
    verified: false,
    createdAt: { $lt: new Date(Date.now() - STALE_MS) },
    [field]: value,
    _id: { $ne: user._id },
  });

  if (await User.findOne({ [field]: value, _id: { $ne: user._id } })) {
    throw new AppError(takenMessage(field), 409);
  }

  user[field] = value;
  user[field === 'email' ? 'phone' : 'email'] = undefined;

  try {
    await user.save();
  } catch (error) {
    if (error.code === 11000) throw new AppError(takenMessage(field), 409);
    throw error;
  }

  await deliver({ user, purpose: 'verify', target: value, channel, force: true });

  return { pending: true, identifier: value, channel, waitSeconds: RESEND_SECONDS };
};

// Returns { user, token }, or { needsVerification: true, ... } when the account was never confirmed.
export const loginUser = async ({ identifier, password }, ip = 'unknown') => {
  const { field, value, channel } = parseIdentifier(identifier);
  const key = failureKey(value, ip);

  if ((await getFailures(key)) >= MAX_FAILED_LOGINS) {
    throw new AppError('Too many failed attempts. Please try again in 15 minutes.', 429);
  }

  const user = await User.findOne({ [field]: value, deletedAt: null }).select('+password');

  // Always do one password check, real or fake, so timing reveals nothing.
  let valid = false;

  if (user) {
    valid = await user.comparePassword(password);
  } else {
    await bcrypt.compare(password, DUMMY_HASH);
  }

  if (!valid) {
    await recordFailure(key);
    throw new AppError('Invalid login details', 401);
  }

  await clearFailures(key);

  if (user.verified === false) {
    return { needsVerification: true, identifier: value, channel };
  }

  return { user, token: signToken(user._id.toString()) };
};

// Sends a password reset code. It never says whether the account exists.
export const forgotPassword = async ({ identifier }) => {
  const { field, value, channel } = parseIdentifier(identifier);

  if (channel === 'sms' && !env.phoneSignup) return;

  const user = await User.findOne({ [field]: value, deletedAt: null });

  if (!user) return;

  await deliver({ user, purpose: 'reset', target: value, channel });
};

// A correct reset code proves the person owns that email or phone, so it also confirms the account.
export const resetPassword = async ({ identifier, code, newPassword }) => {
  const { field, value } = parseIdentifier(identifier);
  const user = await User.findOne({ [field]: value, deletedAt: null });

  if (!user) {
    throw new AppError(BAD_CODE, 400);
  }

  await checkCode({ user, purpose: 'reset', code });

  user.password = newPassword; // signs out every older session
  user.verified = true;
  user.verifiedAt = user.verifiedAt || new Date();
  await user.save();
};
