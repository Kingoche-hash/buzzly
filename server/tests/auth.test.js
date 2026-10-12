import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import app from '../app.js';
import { authHeader, clearDatabase, closeTestDb, makeUser, openTestDb, sleep } from './helpers.js';

const register = (body) => request(app).post('/api/auth/register').send(body);
const login = (body) => request(app).post('/api/auth/login').send(body);

describe('authentication', () => {
  before(openTestDb);
  beforeEach(clearDatabase);
  after(closeTestDb);

  it('registers a user and never returns the password', async () => {
    const res = await register({ username: 'alice', email: 'alice@test.com', password: 'Test12345' });

    assert.equal(res.status, 201);
    assert.ok(res.body.token);
    assert.equal(res.body.user.username, 'alice');
    assert.equal(res.body.user.password, undefined);
  });

  it('refuses a duplicate email', async () => {
    await makeUser('alice');
    const res = await register({ username: 'alice2', email: 'alice@test.com', password: 'Test12345' });

    assert.equal(res.status, 409);
    assert.equal(res.body.message, 'Email already in use');
  });

  it('refuses a duplicate username', async () => {
    await makeUser('alice');
    const res = await register({ username: 'alice', email: 'other@test.com', password: 'Test12345' });

    assert.equal(res.status, 409);
    assert.equal(res.body.message, 'Username already taken');
  });

  it('rejects invalid registration data with a list of problems', async () => {
    const res = await register({ username: 'al', email: 'nope', password: '123' });

    assert.equal(res.status, 400);
    assert.equal(res.body.message, 'Validation failed');
    assert.ok(res.body.errors.length >= 3);
  });

  it('logs in with the right password', async () => {
    const alice = await makeUser('alice');
    const res = await login({ email: alice.email, password: alice.password });

    assert.equal(res.status, 200);
    assert.ok(res.body.token);
  });

  it('answers a wrong password and an unknown email in exactly the same way', async () => {
    const alice = await makeUser('alice');
    const wrong = await login({ email: alice.email, password: 'WrongPass1' });
    const unknown = await login({ email: 'nobody@test.com', password: 'WrongPass1' });

    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrong.body.message, unknown.body.message);
  });

  it('protects /me', async () => {
    const alice = await makeUser('alice');

    const noToken = await request(app).get('/api/auth/me');
    assert.equal(noToken.status, 401);

    const garbage = await request(app).get('/api/auth/me').set({ Authorization: 'Bearer abc' });
    assert.equal(garbage.status, 401);

    const ok = await request(app).get('/api/auth/me').set(authHeader(alice));
    assert.equal(ok.status, 200);
    assert.equal(ok.body.user.email, alice.email);
  });

  it('locks login after 10 failed attempts', async () => {
    const alice = await makeUser('alice');

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const res = await login({ email: alice.email, password: 'WrongPass1' });
      assert.equal(res.status, 401);
    }

    // Even the RIGHT password is refused while the lock is on.
    const locked = await login({ email: alice.email, password: alice.password });
    assert.equal(locked.status, 429);
  });

  it('signs out older sessions when the password changes', async () => {
    const alice = await makeUser('alice');

    // Tokens are stamped to the second, so wait a moment before changing the password.
    await sleep(1100);

    const change = await request(app)
      .post('/api/profile/password')
      .set(authHeader(alice))
      .send({ currentPassword: alice.password, newPassword: 'NewPass123' });

    assert.equal(change.status, 200);
    assert.ok(change.body.token);

    const oldSession = await request(app).get('/api/auth/me').set(authHeader(alice));
    assert.equal(oldSession.status, 401);

    const freshSession = await request(app)
      .get('/api/auth/me')
      .set({ Authorization: `Bearer ${change.body.token}` });
    assert.equal(freshSession.status, 200);

    const relogin = await login({ email: alice.email, password: 'NewPass123' });
    assert.equal(relogin.status, 200);
  });

  it('refuses a wrong current password without logging the person out', async () => {
    const alice = await makeUser('alice');

    const change = await request(app)
      .post('/api/profile/password')
      .set(authHeader(alice))
      .send({ currentPassword: 'WrongPass1', newPassword: 'NewPass123' });

    assert.equal(change.status, 400);

    const stillIn = await request(app).get('/api/auth/me').set(authHeader(alice));
    assert.equal(stillIn.status, 200);
  });

  it('deletes an account and blocks it afterwards', async () => {
    const alice = await makeUser('alice');

    const wrong = await request(app)
      .delete('/api/profile')
      .set(authHeader(alice))
      .send({ password: 'WrongPass1' });
    assert.equal(wrong.status, 400);

    const deleted = await request(app)
      .delete('/api/profile')
      .set(authHeader(alice))
      .send({ password: alice.password });
    assert.equal(deleted.status, 200);

    const relogin = await login({ email: alice.email, password: alice.password });
    assert.equal(relogin.status, 401);

    const oldToken = await request(app).get('/api/auth/me').set(authHeader(alice));
    assert.equal(oldToken.status, 401);
  });
});
