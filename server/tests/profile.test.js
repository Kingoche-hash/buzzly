import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../app.js';
import User from '../models/User.js';
import { authHeader, clearDatabase, closeTestDb, makeUser, openTestDb, startDirect } from './helpers.js';

describe('profiles and privacy', () => {
  let alice;
  let bob;

  before(openTestDb);
  after(closeTestDb);

  beforeEach(async () => {
    await clearDatabase();
    alice = await makeUser('alice');
    bob = await makeUser('bob');
  });

  const patchProfile = (user, body) =>
    request(app).patch('/api/profile').set(authHeader(user)).send(body);

  it('updates display name, About and status', async () => {
    const res = await patchProfile(alice, {
      displayName: 'Alice Smith',
      bio: 'Coffee lover',
      status: 'Busy',
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.user.displayName, 'Alice Smith');
    assert.equal(res.body.user.bio, 'Coffee lover');
    assert.equal(res.body.user.status, 'Busy');
  });

  it('refuses a username that is taken or badly formed', async () => {
    assert.equal((await patchProfile(alice, { username: 'bob' })).status, 409);
    assert.equal((await patchProfile(alice, { username: 'no spaces!' })).status, 400);
  });

  it('refuses bad profile data', async () => {
    assert.equal((await patchProfile(alice, { bio: 'x'.repeat(161) })).status, 400);
    assert.equal((await patchProfile(alice, {})).status, 400);
  });

  it('shows a public profile without private details', async () => {
    const res = await request(app).get(`/api/users/${bob.id}`).set(authHeader(alice));

    assert.equal(res.status, 200);
    assert.equal(res.body.user.username, 'bob');
    assert.equal(res.body.user.email, undefined);
    assert.equal(res.body.user.password, undefined);
  });

  it('answers 404 for a person who does not exist', async () => {
    const ghost = new mongoose.Types.ObjectId().toString();
    const res = await request(app).get(`/api/users/${ghost}`).set(authHeader(alice));

    assert.equal(res.status, 404);
  });

  it('hides online status and last seen when the person chooses', async () => {
    await startDirect(alice, bob);
    await User.updateOne({ _id: bob.id }, { lastSeen: new Date(), isOnline: true });

    const memberOf = (res) => res.body.conversations[0].members.find((member) => member._id === bob.id);

    const visible = await request(app).get('/api/conversations').set(authHeader(alice));
    assert.ok(memberOf(visible).lastSeen);

    await patchProfile(bob, { privacy: { showPresence: false } });

    const hidden = await request(app).get('/api/conversations').set(authHeader(alice));
    assert.equal(memberOf(hidden).lastSeen, null);
    assert.equal(memberOf(hidden).isOnline, false);

    const card = await request(app).get(`/api/users/${bob.id}`).set(authHeader(alice));
    assert.equal(card.body.user.showsPresence, false);
    assert.equal(card.body.user.lastSeen, null);
  });

  it('finds people by name or username, but never deleted accounts', async () => {
    await patchProfile(alice, { displayName: 'Alice Smith' });

    const byName = await request(app).get('/api/users?search=smith').set(authHeader(bob));
    assert.equal(byName.body.users.length, 1);
    assert.equal(byName.body.users[0].username, 'alice');
    assert.equal(byName.body.users[0].email, undefined);

    await request(app)
      .delete('/api/profile')
      .set(authHeader(alice))
      .send({ password: alice.password });

    const gone = await request(app).get('/api/users?search=alice').set(authHeader(bob));
    assert.equal(gone.body.users.length, 0);
  });
});
