import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../app.js';
import { redis } from '../config/redis.js';
import User from '../models/User.js';
import { testOutbox } from '../services/mail.service.js';
import { testSmsOutbox } from '../services/sms.service.js';
import { signToken } from '../utils/token.js';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The emails and texts that tests "sent" are kept in memory instead.
export const clearOutboxes = () => {
  testOutbox.length = 0;
  testSmsOutbox.length = 0;
};

// Every email or text "sent" to this address or number, oldest first.
export const messagesTo = (target) => [...testOutbox, ...testSmsOutbox].filter((message) => message.to === target);

// The 6-digit code in the newest message sent to this address or number.
export const lastCode = (target) => {
  const last = messagesTo(target).at(-1);
  if (!last) return null;

  return (last.text || last.body || '').match(/\b(\d{6})\b/)?.[1] ?? null;
};

// Wipes this process's TEST database and the fake Redis.
export const clearDatabase = async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({}))
  );
  await redis.flushall();
  clearOutboxes();
};

export const openTestDb = async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  // Build the indexes (unique emails, text search...) before any test needs them.
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  await clearDatabase();
};

export const closeTestDb = async () => {
  await clearDatabase();
  await sleep(200); // let background work finish

  // Remove this run's private collections so no clutter is left behind.
  // If Atlas refuses, that is fine: cleanup must never fail a test.
  if (mongoose.connection.name.endsWith('_test')) {
    await Promise.allSettled(
      Object.values(mongoose.connection.collections).map((collection) => collection.drop())
    );
  }

  await mongoose.disconnect();
  redis.disconnect();
};

export const authHeader = (user) => ({ Authorization: `Bearer ${user.token}` });

// A person who has already confirmed their account. Made directly in the database, because
// going through the whole sign-up (code, email...) in every test would be far too slow.
// The sign-up flow itself is tested in auth.test.js.
export const makeUser = async (username, extra = {}) => {
  const email = `${username}@test.com`;
  const password = 'Test12345';

  const user = await User.create({
    username,
    email,
    password,
    verified: true,
    verifiedAt: new Date(),
    ...extra,
  });

  return { id: user._id.toString(), username, email, password, token: signToken(user._id.toString()) };
};

export const startDirect = async (a, b) => {
  const res = await request(app)
    .post('/api/conversations')
    .set(authHeader(a))
    .send({ type: 'direct', userId: b.id });

  assert.ok([200, 201].includes(res.status), `could not start a chat: ${JSON.stringify(res.body)}`);
  return res.body.conversation;
};

export const sendText = async (user, conversationId, content) => {
  const res = await request(app)
    .post(`/api/conversations/${conversationId}/messages`)
    .set(authHeader(user))
    .send({ content });

  assert.equal(res.status, 201, `could not send: ${JSON.stringify(res.body)}`);
  return res.body.message;
};
