import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import app from '../app.js';
import { env } from '../config/env.js';
import OtpCode from '../models/OtpCode.js';
import User from '../models/User.js';
import {
  authHeader,
  clearDatabase,
  closeTestDb,
  lastCode,
  makeUser,
  messagesTo,
  openTestDb,
  sleep,
} from './helpers.js';

const post = (path, body) => request(app).post(`/api/auth/${path}`).send(body);

// Signs up (without confirming) and returns what the tests need.
const signUp = async (username = 'alice') => {
  const email = `${username}@test.com`;
  const password = 'Test12345';
  const res = await post('register', { username, email, password });

  assert.equal(res.status, 201, JSON.stringify(res.body));
  return { username, email, password, res };
};

// A code that is certainly not the real one.
const wrongCodeFor = (target) => (lastCode(target) === '123456' ? '654321' : '123456');

// Pretends the 60-second wait is over.
const endCooldown = (target) =>
  OtpCode.updateOne({ target, purpose: 'verify' }, { lastSentAt: new Date(Date.now() - 2 * 60 * 1000) });

describe('accounts: sign up, confirm, log in, reset', () => {
  before(openTestDb);
  beforeEach(clearDatabase);
  after(closeTestDb);

  // ---------------- signing up with an email ----------------

  it('registers a new account, sends a code and does NOT log the person in yet', async () => {
    const { email, res } = await signUp();

    assert.equal(res.body.pending, true);
    assert.equal(res.body.identifier, email);
    assert.equal(res.body.channel, 'email');
    assert.equal(res.body.token, undefined);
    assert.equal(res.body.user, undefined);

    const saved = await User.findOne({ email });
    assert.equal(saved.verified, false);

    assert.equal(messagesTo(email).length, 1);
    assert.match(lastCode(email), /^\d{6}$/);
  });

  it('never stores the code itself', async () => {
    const { email } = await signUp();
    const saved = await OtpCode.findOne({ target: email });

    assert.notEqual(saved.codeHash, lastCode(email));
    assert.equal(saved.codeHash.length, 64);
  });

  it('refuses to log in before the code is confirmed, and tells the website to ask for it', async () => {
    const { email, password } = await signUp();
    const res = await post('login', { identifier: email, password });

    assert.equal(res.status, 403);
    assert.equal(res.body.needsVerification, true);
    assert.equal(res.body.identifier, email);
    assert.equal(res.body.channel, 'email');
    assert.equal(res.body.token, undefined);
  });

  it('confirms the account with the right code, logs the person in, and sends a welcome email', async () => {
    const { email } = await signUp();
    const res = await post('verify', { identifier: email, code: lastCode(email) });

    assert.equal(res.status, 200);
    assert.ok(res.body.token);
    assert.equal(res.body.user.verified, true);
    assert.equal(res.body.user.password, undefined);

    const me = await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${res.body.token}` });
    assert.equal(me.status, 200);

    const mails = messagesTo(email);
    assert.equal(mails.length, 2);
    assert.match(mails[1].subject, /Welcome/);
  });

  it('can only be confirmed once with a code', async () => {
    const { email } = await signUp();
    const code = lastCode(email);

    assert.equal((await post('verify', { identifier: email, code })).status, 200);
    assert.equal((await post('verify', { identifier: email, code })).status, 400);
  });

  it('counts wrong tries and locks the code after five', async () => {
    const { email } = await signUp();
    const wrong = wrongCodeFor(email);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const res = await post('verify', { identifier: email, code: wrong });
      assert.equal(res.status, 400);
      assert.match(res.body.message, /not correct/);
    }

    assert.equal((await post('verify', { identifier: email, code: wrong })).status, 429);

    // Even the right code is refused now.
    assert.equal((await post('verify', { identifier: email, code: lastCode(email) })).status, 429);

    // A new code starts fresh.
    await endCooldown(email);
    await post('resend', { identifier: email });
    assert.equal((await post('verify', { identifier: email, code: lastCode(email) })).status, 200);
  });

  it('refuses an expired code', async () => {
    const { email } = await signUp();
    await OtpCode.updateOne({ target: email }, { expiresAt: new Date(Date.now() - 1000) });

    const res = await post('verify', { identifier: email, code: lastCode(email) });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /expired/);
  });

  it('answers the same way for an account that does not exist', async () => {
    const res = await post('verify', { identifier: 'nobody@test.com', code: '123456' });

    assert.equal(res.status, 400);
    assert.match(res.body.message, /not correct or has expired/);
  });

  it('refuses malformed codes', async () => {
    const { email } = await signUp();

    assert.equal((await post('verify', { identifier: email, code: '12345' })).status, 400);
    assert.equal((await post('verify', { identifier: email, code: 'abcdef' })).status, 400);
  });

  it('refuses duplicate emails and usernames of confirmed accounts', async () => {
    await makeUser('alice');

    const sameEmail = await post('register', { username: 'alice2', email: 'alice@test.com', password: 'Test12345' });
    assert.equal(sameEmail.status, 409);
    assert.equal(sameEmail.body.message, 'Email already in use');

    const sameName = await post('register', { username: 'alice', email: 'other@test.com', password: 'Test12345' });
    assert.equal(sameName.status, 409);
    assert.equal(sameName.body.message, 'Username already taken');
  });

  it('lets someone who never confirmed sign up again, replacing the old details', async () => {
    const { email } = await signUp('alice');
    const code = lastCode(email);

    const again = await post('register', { username: 'alice2', email, password: 'Other12345' });
    assert.equal(again.status, 201);

    assert.equal(await User.countDocuments({ email }), 1);
    assert.equal(messagesTo(email).length, 1); // the 60-second wait: no second email yet

    assert.equal((await post('verify', { identifier: email, code })).status, 200);

    assert.equal((await post('login', { identifier: email, password: 'Test12345' })).status, 401);

    const login = await post('login', { identifier: email, password: 'Other12345' });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.username, 'alice2');
  });

  it('forgets sign-ups that were never confirmed after a day', async () => {
    const { email } = await signUp('alice');

    await User.collection.updateOne({ email }, { $set: { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) } });

    const res = await post('register', { username: 'alice', email: 'new@test.com', password: 'Test12345' });
    assert.equal(res.status, 201);
    assert.equal(await User.countDocuments({ email }), 0);
  });

  it('rejects invalid sign-up data with a list of problems', async () => {
    const res = await post('register', { username: 'al', email: 'nope', password: '123' });

    assert.equal(res.status, 400);
    assert.equal(res.body.message, 'Validation failed');
    assert.ok(res.body.errors.length >= 3);
  });

  it('needs exactly one of email and phone', async () => {
    const both = await post('register', {
      username: 'alice',
      email: 'alice@test.com',
      phone: '+37060012345',
      password: 'Test12345',
    });
    assert.equal(both.status, 400);

    const neither = await post('register', { username: 'alice', password: 'Test12345' });
    assert.equal(neither.status, 400);
  });

  // ---------------- signing up with a phone number ----------------

  it('registers with a phone number, texts the code, and confirms it', async () => {
    const res = await post('register', { username: 'phil', phone: '+370 600 12345', password: 'Test12345' });

    assert.equal(res.status, 201);
    assert.equal(res.body.identifier, '+37060012345');
    assert.equal(res.body.channel, 'sms');
    assert.equal(messagesTo('+37060012345').length, 1);

    const code = lastCode('+37060012345');
    const confirmed = await post('verify', { identifier: '+370 600 12345', code });
    assert.equal(confirmed.status, 200);
    assert.ok(confirmed.body.token);
    assert.equal(confirmed.body.user.phone, '+37060012345');
    assert.equal(confirmed.body.user.email, undefined);
  });

  it('logs in with a phone number, and a second phone user can exist without an email', async () => {
    for (const [username, phone] of [
      ['phil', '+37060012345'],
      ['pam', '+37060099999'],
    ]) {
      await post('register', { username, phone, password: 'Test12345' });
      await post('verify', { identifier: phone, code: lastCode(phone) });
    }

    const login = await post('login', { identifier: '+37060012345', password: 'Test12345' });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.username, 'phil');

    assert.equal((await post('login', { identifier: '+37060012345', password: 'Wrong12345' })).status, 401);
  });

  it('refuses badly formed phone numbers and already used ones', async () => {
    assert.equal((await post('register', { username: 'phil', phone: '12345', password: 'Test12345' })).status, 400);
    assert.equal((await post('register', { username: 'phil', phone: '0037060012345x', password: 'Test12345' })).status, 400);

    await post('register', { username: 'phil', phone: '+37060012345', password: 'Test12345' });
    await post('verify', { identifier: '+37060012345', code: lastCode('+37060012345') });

    const again = await post('register', { username: 'phil2', phone: '+37060012345', password: 'Test12345' });
    assert.equal(again.status, 409);
    assert.equal(again.body.message, 'Phone number already in use');
  });

  it('can switch phone sign-up off, and tells the website', async () => {
    assert.equal((await request(app).get('/api/auth/config')).body.phoneSignup, true);

    const before = env.phoneSignup;
    env.phoneSignup = false;

    try {
      assert.equal((await request(app).get('/api/auth/config')).body.phoneSignup, false);

      const res = await post('register', { username: 'phil', phone: '+37060012345', password: 'Test12345' });
      assert.equal(res.status, 400);
      assert.match(res.body.message, /not available/);
    } finally {
      env.phoneSignup = before;
    }
  });

  // ---------------- sending the code again ----------------

  it('answers the same for unknown and confirmed accounts, and sends nothing', async () => {
    await makeUser('alice');
    const before = messagesTo('alice@test.com').length;

    assert.equal((await post('resend', { identifier: 'nobody@test.com' })).status, 200);
    assert.equal((await post('resend', { identifier: 'alice@test.com' })).status, 200);

    assert.equal(messagesTo('nobody@test.com').length, 0);
    assert.equal(messagesTo('alice@test.com').length, before);
  });

  it('makes people wait 60 seconds between codes, then sends a new one', async () => {
    const { email } = await signUp();

    assert.equal((await post('resend', { identifier: email })).status, 200);
    assert.equal(messagesTo(email).length, 1); // too soon: nothing sent

    await endCooldown(email);
    assert.equal((await post('resend', { identifier: email })).status, 200);
    assert.equal(messagesTo(email).length, 2);

    assert.equal((await post('verify', { identifier: email, code: lastCode(email) })).status, 200);
  });

  it('stops after five codes in an hour', async () => {
    const { email } = await signUp();

    for (let round = 0; round < 6; round += 1) {
      await endCooldown(email);
      await post('resend', { identifier: email });
    }

    assert.equal(messagesTo(email).length, 5);
  });

  // ---------------- fixing a mistyped email ----------------

  it('changes the email before confirming, and sends the code to the new one', async () => {
    const { email, password } = await signUp('alice');

    const res = await post('change-contact', { identifier: email, password, email: 'right@test.com' });
    assert.equal(res.status, 200);
    assert.equal(res.body.identifier, 'right@test.com');

    assert.equal(messagesTo('right@test.com').length, 1); // no 60-second wait here
    assert.equal((await post('login', { identifier: email, password })).status, 401);

    const confirmed = await post('verify', { identifier: 'right@test.com', code: lastCode('right@test.com') });
    assert.equal(confirmed.status, 200);
  });

  it('needs the password, and refuses addresses that are already used', async () => {
    await makeUser('bob');
    const { email, password } = await signUp('alice');

    const wrong = await post('change-contact', { identifier: email, password: 'Wrong12345', email: 'right@test.com' });
    assert.equal(wrong.status, 401);

    const taken = await post('change-contact', { identifier: email, password, email: 'bob@test.com' });
    assert.equal(taken.status, 409);

    const unknown = await post('change-contact', { identifier: 'nobody@test.com', password, email: 'x@test.com' });
    assert.equal(unknown.status, 401);
  });

  // ---------------- logging in ----------------

  it('logs in with the right password', async () => {
    const alice = await makeUser('alice');
    const res = await post('login', { identifier: alice.email, password: alice.password });

    assert.equal(res.status, 200);
    assert.ok(res.body.token);
  });

  it('still accepts the older "email" field', async () => {
    const alice = await makeUser('alice');
    const res = await post('login', { email: alice.email, password: alice.password });

    assert.equal(res.status, 200);
  });

  it('answers a wrong password and an unknown account in exactly the same way', async () => {
    const alice = await makeUser('alice');
    const wrong = await post('login', { identifier: alice.email, password: 'WrongPass1' });
    const unknown = await post('login', { identifier: 'nobody@test.com', password: 'WrongPass1' });

    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrong.body.message, unknown.body.message);
  });

  it('protects /me', async () => {
    const alice = await makeUser('alice');

    assert.equal((await request(app).get('/api/auth/me')).status, 401);
    assert.equal((await request(app).get('/api/auth/me').set({ Authorization: 'Bearer abc' })).status, 401);

    const ok = await request(app).get('/api/auth/me').set(authHeader(alice));
    assert.equal(ok.status, 200);
    assert.equal(ok.body.user.email, alice.email);
  });

  it('locks login after 10 failed attempts', async () => {
    const alice = await makeUser('alice');

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const res = await post('login', { identifier: alice.email, password: 'WrongPass1' });
      assert.equal(res.status, 401);
    }

    // Even the RIGHT password is refused while the lock is on.
    assert.equal((await post('login', { identifier: alice.email, password: alice.password })).status, 429);
  });

  // ---------------- forgot password ----------------

  it('answers the same for unknown accounts and sends nothing', async () => {
    assert.equal((await post('forgot', { identifier: 'nobody@test.com' })).status, 200);
    assert.equal(messagesTo('nobody@test.com').length, 0);
  });

  it('resets a password with the emailed code, and signs out older sessions', async () => {
    const alice = await makeUser('alice');

    // Tokens are stamped to the second, so wait a moment before changing the password.
    await sleep(1100);

    assert.equal((await post('forgot', { identifier: alice.email })).status, 200);

    const mails = messagesTo(alice.email);
    assert.match(mails.at(-1).subject, /Reset/);

    const code = lastCode(alice.email);

    const weak = await post('reset', { identifier: alice.email, code, newPassword: '123' });
    assert.equal(weak.status, 400);

    const wrong = await post('reset', { identifier: alice.email, code: wrongCodeFor(alice.email), newPassword: 'NewPass123' });
    assert.equal(wrong.status, 400);

    const reset = await post('reset', { identifier: alice.email, code, newPassword: 'NewPass123' });
    assert.equal(reset.status, 200);

    assert.equal((await post('login', { identifier: alice.email, password: alice.password })).status, 401);
    assert.equal((await post('login', { identifier: alice.email, password: 'NewPass123' })).status, 200);
    assert.equal((await request(app).get('/api/auth/me').set(authHeader(alice))).status, 401);
  });

  it('confirms an unconfirmed account too, because the code proves the address is theirs', async () => {
    const { email } = await signUp('alice');

    await post('forgot', { identifier: email });
    const code = lastCode(email);
    assert.equal((await post('reset', { identifier: email, code, newPassword: 'NewPass123' })).status, 200);

    const login = await post('login', { identifier: email, password: 'NewPass123' });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.verified, true);
  });

  it('resets a password by text for phone accounts', async () => {
    await post('register', { username: 'phil', phone: '+37060012345', password: 'Test12345' });
    await post('verify', { identifier: '+37060012345', code: lastCode('+37060012345') });

    await post('forgot', { identifier: '+37060012345' });
    const code = lastCode('+37060012345');

    assert.equal((await post('reset', { identifier: '+37060012345', code, newPassword: 'NewPass123' })).status, 200);
    assert.equal((await post('login', { identifier: '+37060012345', password: 'NewPass123' })).status, 200);
  });

  // ---------------- password change and account deletion (from the profile) ----------------

  it('signs out older sessions when the password changes', async () => {
    const alice = await makeUser('alice');

    await sleep(1100);

    const change = await request(app)
      .post('/api/profile/password')
      .set(authHeader(alice))
      .send({ currentPassword: alice.password, newPassword: 'NewPass123' });

    assert.equal(change.status, 200);
    assert.ok(change.body.token);

    assert.equal((await request(app).get('/api/auth/me').set(authHeader(alice))).status, 401);

    const fresh = await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${change.body.token}` });
    assert.equal(fresh.status, 200);

    assert.equal((await post('login', { identifier: alice.email, password: 'NewPass123' })).status, 200);
  });

  it('refuses a wrong current password without logging the person out', async () => {
    const alice = await makeUser('alice');

    const change = await request(app)
      .post('/api/profile/password')
      .set(authHeader(alice))
      .send({ currentPassword: 'WrongPass1', newPassword: 'NewPass123' });

    assert.equal(change.status, 400);
    assert.equal((await request(app).get('/api/auth/me').set(authHeader(alice))).status, 200);
  });

  it('deletes an account and blocks it afterwards', async () => {
    const alice = await makeUser('alice');

    const wrong = await request(app).delete('/api/profile').set(authHeader(alice)).send({ password: 'WrongPass1' });
    assert.equal(wrong.status, 400);

    const deleted = await request(app).delete('/api/profile').set(authHeader(alice)).send({ password: alice.password });
    assert.equal(deleted.status, 200);

    assert.equal((await post('login', { identifier: alice.email, password: alice.password })).status, 401);
    assert.equal((await request(app).get('/api/auth/me').set(authHeader(alice))).status, 401);
  });

  it('gives a deleted account\'s phone number back', async () => {
    await post('register', { username: 'phil', phone: '+37060012345', password: 'Test12345' });
    const confirmed = await post('verify', { identifier: '+37060012345', code: lastCode('+37060012345') });

    const deleted = await request(app)
      .delete('/api/profile')
      .set({ Authorization: `Bearer ${confirmed.body.token}` })
      .send({ password: 'Test12345' });
    assert.equal(deleted.status, 200);

    const again = await post('register', { username: 'phil2', phone: '+37060012345', password: 'Test12345' });
    assert.equal(again.status, 201);
  });
});
