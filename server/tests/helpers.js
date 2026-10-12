import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../app.js';
import { redis } from '../config/redis.js';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Wipes this process's TEST database and the fake Redis.
export const clearDatabase = async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({}))
  );
  await redis.flushall();
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

// Registers a user through the real API and returns what the tests need.
export const makeUser = async (username, extra = {}) => {
  const email = `${username}@test.com`;
  const password = 'Test12345';

  const res = await request(app)
    .post('/api/auth/register')
    .send({ username, email, password, ...extra });

  assert.equal(res.status, 201, `could not register ${username}: ${JSON.stringify(res.body)}`);

  return { id: res.body.user._id, username, email, password, token: res.body.token };
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
