import bcrypt from 'bcrypt';
import { redis } from '../config/redis.js';
import User from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { signToken } from '../utils/token.js';

const MAX_FAILED_LOGINS = 10;
const LOCK_WINDOW_SECONDS = 15 * 60;

// A fake hash, so logging in with an unknown email takes as long as a real one.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

// Failed attempts are counted in Redis per email AND visitor address.
const failureKey = (email, ip) => `login:fail:${email}:${ip}`;

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

export const registerUser = async ({ username, email, password }) => {
  const existing = await User.findOne({ $or: [{ email }, { username }] });

  if (existing) {
    const message = existing.email === email ? 'Email already in use' : 'Username already taken';
    throw new AppError(message, 409);
  }

  const user = await User.create({ username, email, password });
  return { user, token: signToken(user._id.toString()) };
};

export const loginUser = async ({ email, password }, ip = 'unknown') => {
  const key = failureKey(email, ip);

  if ((await getFailures(key)) >= MAX_FAILED_LOGINS) {
    throw new AppError('Too many failed attempts. Please try again in 15 minutes.', 429);
  }

  const user = await User.findOne({ email, deletedAt: null }).select('+password');

  // Always do one password check, real or fake, so timing reveals nothing.
  let valid = false;

  if (user) {
    valid = await user.comparePassword(password);
  } else {
    await bcrypt.compare(password, DUMMY_HASH);
  }

  if (!valid) {
    await recordFailure(key);
    throw new AppError('Invalid email or password', 401);
  }

  await clearFailures(key);
  return { user, token: signToken(user._id.toString()) };
};
